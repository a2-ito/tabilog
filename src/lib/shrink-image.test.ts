import { describe, expect, it } from "vitest";
import {
	type CanvasLike,
	type ImageBitmapLike,
	MAX_EDGE,
	scaleFor,
	type ShrinkDeps,
	shouldSkip,
	shrinkAll,
	shrinkImage,
} from "./shrink-image";

/** 縮小の依存を差し替えて、解放の呼ばれ方まで見えるようにする */
function fakeDeps(options: { width?: number; height?: number; blob?: Blob | null; noContext?: boolean } = {}) {
	const { width = 4000, height = 3000, blob = new Blob([new Uint8Array(10)], { type: "image/jpeg" }) } = options;

	const state = {
		/** 同時に開いている ImageBitmap の数 */
		openBitmaps: 0,
		/** 同時に開いた最大数。1 を超えたら複数枚を同時に持っている */
		maxOpenBitmaps: 0,
		closedBitmaps: 0,
		createdCanvases: 0,
		/** 解放後の canvas の大きさ */
		releasedSizes: [] as { width: number; height: number }[],
		drawnSizes: [] as { width: number; height: number }[],
	};

	const canvases: CanvasLike[] = [];

	const deps: ShrinkDeps = {
		createImageBitmap: async (): Promise<ImageBitmapLike> => {
			state.openBitmaps += 1;
			state.maxOpenBitmaps = Math.max(state.maxOpenBitmaps, state.openBitmaps);
			return {
				width,
				height,
				close() {
					state.openBitmaps -= 1;
					state.closedBitmaps += 1;
				},
			};
		},
		createCanvas: (): CanvasLike => {
			state.createdCanvases += 1;
			const canvas: CanvasLike = {
				width: 0,
				height: 0,
				getContext: () =>
					options.noContext
						? null
						: {
								drawImage: (_img, _dx, _dy, dw, dh) => void state.drawnSizes.push({ width: dw, height: dh }),
							},
				toBlob: (cb) => cb(blob),
			};
			canvases.push(canvas);
			return canvas;
		},
	};

	return {
		deps,
		state,
		/** 後始末できているかは、処理後の canvas の大きさで見る */
		collectReleased() {
			for (const c of canvases) state.releasedSizes.push({ width: c.width, height: c.height });
			return state.releasedSizes;
		},
	};
}

function fakeFile(name = "photo.jpg", type = "image/jpeg", bytes = 4 * 1024 * 1024): File {
	return new File([new Uint8Array(bytes)], name, { type });
}

describe("scaleFor", () => {
	it("長辺を 1600px に収める倍率を返す", () => {
		expect(scaleFor(4000, 3000)).toBeCloseTo(MAX_EDGE / 4000);
		expect(scaleFor(3000, 4000)).toBeCloseTo(MAX_EDGE / 4000);
	});
	it("すでに収まっていれば 1（拡大はしない）", () => {
		expect(scaleFor(800, 600)).toBe(1);
	});
	it("大きさが取れない画像でも 0 除算しない", () => {
		expect(scaleFor(0, 0)).toBe(1);
	});
});

describe("shouldSkip", () => {
	it("GIF はアニメが壊れるので触らない", () => {
		expect(shouldSkip(fakeFile("a.gif", "image/gif"))).toBe(true);
	});
	it("画像でないものは触らない", () => {
		expect(shouldSkip(fakeFile("a.pdf", "application/pdf"))).toBe(true);
	});
	it("JPEG は縮小の対象", () => {
		expect(shouldSkip(fakeFile())).toBe(false);
	});
});

describe("shrinkImage", () => {
	it("長辺 1600px の JPEG にする", async () => {
		const { deps, state } = fakeDeps({ width: 4000, height: 3000 });
		const out = await shrinkImage(fakeFile("IMG_0001.HEIC", "image/jpeg"), deps);

		expect(out.type).toBe("image/jpeg");
		expect(out.name).toBe("IMG_0001.jpg");
		expect(state.drawnSizes[0]).toEqual({ width: 1600, height: 1200 });
	});

	it("使い終わった ImageBitmap を必ず解放する", async () => {
		const { deps, state } = fakeDeps();
		await shrinkImage(fakeFile(), deps);
		expect(state.closedBitmaps).toBe(1);
		expect(state.openBitmaps).toBe(0);
	});

	it("途中で失敗しても ImageBitmap を解放する", async () => {
		const { deps, state } = fakeDeps();
		const failing: ShrinkDeps = {
			...deps,
			createCanvas: () => {
				throw new Error("canvas を作れません");
			},
		};
		await expect(shrinkImage(fakeFile(), failing)).rejects.toThrow(/canvas/);
		expect(state.openBitmaps).toBe(0);
		expect(state.closedBitmaps).toBe(1);
	});

	it("使い終わった canvas を 0x0 にして中身を手放す", async () => {
		const helper = fakeDeps();
		await shrinkImage(fakeFile(), helper.deps);
		expect(helper.collectReleased()).toEqual([{ width: 0, height: 0 }]);
	});

	it("小さくて縮小の要らない画像はそのまま返す", async () => {
		const { deps, state } = fakeDeps({ width: 800, height: 600 });
		const file = fakeFile("small.jpg", "image/jpeg", 100 * 1024);
		expect(await shrinkImage(file, deps)).toBe(file);
		// 再エンコードしないが、開いた ImageBitmap は解放する
		expect(state.createdCanvases).toBe(0);
		expect(state.closedBitmaps).toBe(1);
	});

	it("toBlob が失敗したら元のファイルを返す", async () => {
		const { deps } = fakeDeps({ blob: null });
		const file = fakeFile();
		expect(await shrinkImage(file, deps)).toBe(file);
	});

	it("2D コンテキストが取れなければ元のファイルを返す", async () => {
		const { deps, state } = fakeDeps({ noContext: true });
		const file = fakeFile();
		expect(await shrinkImage(file, deps)).toBe(file);
		expect(state.closedBitmaps).toBe(1);
	});
});

describe("shrinkAll", () => {
	it("複数枚でも同時に 1 枚しかデコードしない", async () => {
		const { deps, state } = fakeDeps();
		const files = [fakeFile("a.jpg"), fakeFile("b.jpg"), fakeFile("c.jpg")];

		const out = await shrinkAll(files, deps);

		expect(out).toHaveLength(3);
		// ここが 2 以上になると、端末のメモリを同時に食って 2 枚目で落ちる
		expect(state.maxOpenBitmaps).toBe(1);
		expect(state.closedBitmaps).toBe(3);
	});

	it("空なら何もしない", async () => {
		const { deps, state } = fakeDeps();
		expect(await shrinkAll([], deps)).toEqual([]);
		expect(state.closedBitmaps).toBe(0);
	});
});
