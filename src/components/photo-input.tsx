"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractImageFiles, namePastedImage } from "@/lib/clipboard";
import { inputClass } from "./ui";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;
const MAX_FILES = 8;

/** スマホ写真をそのまま送らず、長辺 1600px の JPEG に縮小してからアップロードする */
async function shrinkImage(file: File): Promise<File> {
	if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
	if (scale === 1 && file.size < 500 * 1024) return file;

	const canvas = document.createElement("canvas");
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	const ctx = canvas.getContext("2d");
	if (!ctx) return file;
	ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
	if (!blob) return file;
	return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
}

type Picked = { file: File; url: string };

/**
 * 複数枚の写真を縮小してから送信する input。
 * ファイル選択のほか、画面のどこでも画像を貼り付けて追加できる。
 */
export function PhotoInput({ name }: { name: string }) {
	const [picked, setPicked] = useState<Picked[]>([]);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// 画面を離れるときに解放するため、最新の一覧を ref にも控えておく
	const pickedRef = useRef<Picked[]>([]);

	// input.files はコードから直接代入できないため DataTransfer を経由して同期する
	useEffect(() => {
		pickedRef.current = picked;
		const input = inputRef.current;
		if (!input) return;
		const dt = new DataTransfer();
		for (const p of picked) dt.items.add(p.file);
		input.files = dt.files;
	}, [picked]);

	// プレビュー用に作った URL を解放する（個別の削除時は remove の中で解放する）
	useEffect(() => {
		return () => {
			for (const p of pickedRef.current) URL.revokeObjectURL(p.url);
		};
	}, []);

	const addFiles = useCallback(async (files: readonly File[], source: "select" | "paste") => {
		if (files.length === 0) return;

		setBusy(true);
		setError(null);
		setNotice(null);
		try {
			const shrunk = await Promise.all(files.map(shrinkImage));
			setPicked((current) => {
				const room = MAX_FILES - current.length;
				if (room <= 0) {
					setError(`写真は ${MAX_FILES} 枚までです`);
					return current;
				}
				if (shrunk.length > room) setError(`写真は ${MAX_FILES} 枚までなので、${room} 枚だけ追加しました`);
				const added = shrunk.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }));
				if (source === "paste") setNotice(`貼り付けた画像を ${added.length} 枚追加しました`);
				return [...current, ...added];
			});
		} catch (err) {
			console.error("写真の取り込みに失敗しました", err);
			setError("写真の取り込みに失敗しました");
		} finally {
			setBusy(false);
		}
	}, []);

	// どこにフォーカスがあっても貼り付けを受け取れるようにする。
	// 画像を含まない貼り付けは素通しするので、文字入力の邪魔はしない。
	useEffect(() => {
		function onPaste(e: ClipboardEvent) {
			const images = extractImageFiles(e.clipboardData);
			if (images.length === 0) return;
			e.preventDefault();
			const now = new Date();
			void addFiles(
				images.map((f, i) => namePastedImage(f, now, i)),
				"paste",
			);
		}
		window.addEventListener("paste", onPaste);
		return () => window.removeEventListener("paste", onPaste);
	}, [addFiles]);

	function onChange(e: React.ChangeEvent<HTMLInputElement>) {
		const files = [...(e.currentTarget.files ?? [])];
		// 同期し直すので input 自体の選択状態は捨ててよい
		e.currentTarget.value = "";
		void addFiles(files, "select");
	}

	function remove(url: string) {
		setPicked((current) => {
			URL.revokeObjectURL(url);
			return current.filter((p) => p.url !== url);
		});
		setError(null);
	}

	return (
		<div className="space-y-2">
			{picked.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{picked.map((p) => (
						<div key={p.url} className="relative">
							<img
								src={p.url}
								alt=""
								className="h-24 w-24 rounded-md border border-zinc-200 bg-zinc-100 object-cover dark:border-zinc-700 dark:bg-zinc-800"
							/>
							<button
								type="button"
								onClick={() => remove(p.url)}
								aria-label="この写真を外す"
								className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-300 bg-white text-sm text-zinc-600 shadow-sm hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
							>
								×
							</button>
						</div>
					))}
				</div>
			)}
			<input ref={inputRef} type="file" name={name} accept="image/*" multiple onChange={onChange} className={inputClass} />
			<p className="text-xs text-zinc-500">
				最大 {MAX_FILES} 枚。画像をコピーして、この画面で貼り付けても追加できます（送信前に長辺 {MAX_EDGE}px へ縮小）
			</p>
			{busy && <p className="text-xs text-zinc-500">写真を取り込み中…</p>}
			{notice && <p className="text-xs text-sky-700 dark:text-sky-400">{notice}</p>}
			{error && (
				<p role="alert" className="text-xs text-red-700 dark:text-red-300">
					{error}
				</p>
			)}
		</div>
	);
}
