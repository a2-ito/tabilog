/**
 * 送信前に写真を縮小する処理。
 *
 * スマホのブラウザはタブごとのメモリが厳しく、デコード済みの画像
 * （ImageBitmap）を持ったままにすると 2 枚目で落ちることがある。
 * 1200 万画素の写真なら 1 枚で 48MB 前後を占めるため、
 *
 * - 使い終わった ImageBitmap は必ず close() する
 * - canvas も使い終わりに 0x0 にして中身を手放す
 * - 複数枚は同時ではなく 1 枚ずつ処理する
 *
 * を守る。DOM を直接触らないよう依存は引数で受け取り、テストできるようにしている。
 */

/** 縮小後の長辺（px） */
export const MAX_EDGE = 1600;
/** JPEG の品質 */
export const JPEG_QUALITY = 0.85;
/** これより小さく、かつ縮小も要らない画像はそのまま送る */
export const SKIP_BYTES = 500 * 1024;

export type ImageBitmapLike = {
	readonly width: number;
	readonly height: number;
	close(): void;
};

export type Context2dLike = {
	drawImage(image: ImageBitmapLike, dx: number, dy: number, dw: number, dh: number): void;
};

export type CanvasLike = {
	width: number;
	height: number;
	getContext(contextId: "2d"): Context2dLike | null;
	toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void;
};

export type ShrinkDeps = {
	createImageBitmap: (file: File) => Promise<ImageBitmapLike>;
	createCanvas: () => CanvasLike;
};

/** 長辺を MAX_EDGE に収める倍率。すでに収まっていれば 1 */
export function scaleFor(width: number, height: number, maxEdge: number = MAX_EDGE): number {
	const longest = Math.max(width, height);
	if (longest <= 0) return 1;
	return Math.min(1, maxEdge / longest);
}

/** 縮小せずそのまま送ってよい画像か（GIF はアニメが壊れるので触らない） */
export function shouldSkip(file: File): boolean {
	return !file.type.startsWith("image/") || file.type === "image/gif";
}

function toJpegName(name: string): string {
	return `${name.replace(/\.[^.]+$/, "")}.jpg`;
}

/**
 * 1 枚を縮小する。縮小できない場合は元のファイルをそのまま返す。
 * 途中で失敗しても ImageBitmap と canvas は必ず解放する。
 */
export async function shrinkImage(file: File, deps: ShrinkDeps): Promise<File> {
	if (shouldSkip(file)) return file;

	let bitmap: ImageBitmapLike | null = null;
	let canvas: CanvasLike | null = null;
	try {
		bitmap = await deps.createImageBitmap(file);
		const scale = scaleFor(bitmap.width, bitmap.height);
		// 縮小の必要が無く、もともと軽い画像は再エンコードするだけ無駄
		if (scale === 1 && file.size < SKIP_BYTES) return file;

		canvas = deps.createCanvas();
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);
		const ctx = canvas.getContext("2d");
		if (!ctx) return file;
		ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

		const blob = await new Promise<Blob | null>((resolve) =>
			(canvas as CanvasLike).toBlob(resolve, "image/jpeg", JPEG_QUALITY),
		);
		if (!blob) return file;
		return new File([blob], toJpegName(file.name), { type: "image/jpeg" });
	} finally {
		// デコード済みの画素はここで手放す。GC を待つと次の 1 枚と重なって落ちる
		bitmap?.close();
		if (canvas) {
			canvas.width = 0;
			canvas.height = 0;
		}
	}
}

/**
 * 複数枚を縮小する。
 * Promise.all にすると枚数分のメモリが同時に乗るので、必ず 1 枚ずつ処理する。
 */
export async function shrinkAll(files: readonly File[], deps: ShrinkDeps): Promise<File[]> {
	const shrunk: File[] = [];
	for (const file of files) {
		shrunk.push(await shrinkImage(file, deps));
	}
	return shrunk;
}

/** ブラウザ上での実際の依存 */
export const browserShrinkDeps: ShrinkDeps = {
	createImageBitmap: (file) => globalThis.createImageBitmap(file),
	createCanvas: () => document.createElement("canvas") as unknown as CanvasLike,
};
