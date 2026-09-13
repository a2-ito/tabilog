"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

/** 複数枚の写真を縮小してから送信する input */
export function PhotoInput({ name }: { name: string }) {
	const [previews, setPreviews] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	// プレビュー用に作った URL は差し替え時に解放する
	const objectUrlsRef = useRef<string[]>([]);

	const releasePreviews = useCallback(() => {
		for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
		objectUrlsRef.current = [];
	}, []);

	useEffect(() => releasePreviews, [releasePreviews]);

	const acceptFiles = useCallback(
		async (files: readonly File[]) => {
			const input = inputRef.current;
			if (!input || files.length === 0) return;

			setBusy(true);
			setError(null);
			try {
				if (files.length > MAX_FILES) {
					setError(`写真は一度に ${MAX_FILES} 枚までです`);
					return;
				}
				const shrunk = await Promise.all(files.map(shrinkImage));
				// input.files はコードから直接代入できないため DataTransfer を経由する
				const dt = new DataTransfer();
				for (const file of shrunk) dt.items.add(file);
				input.files = dt.files;

				releasePreviews();
				objectUrlsRef.current = shrunk.map((f) => URL.createObjectURL(f));
				setPreviews([...objectUrlsRef.current]);
			} catch (err) {
				console.error("写真の取り込みに失敗しました", err);
				setError("写真の取り込みに失敗しました");
			} finally {
				setBusy(false);
			}
		},
		[releasePreviews],
	);

	function onChange(e: React.ChangeEvent<HTMLInputElement>) {
		void acceptFiles([...(e.currentTarget.files ?? [])]);
	}

	return (
		<div className="space-y-2">
			{previews.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{previews.map((url) => (
						<img
							key={url}
							src={url}
							alt=""
							className="h-24 w-24 rounded-md border border-zinc-200 bg-zinc-100 object-cover dark:border-zinc-700 dark:bg-zinc-800"
						/>
					))}
				</div>
			)}
			<input ref={inputRef} type="file" name={name} accept="image/*" multiple onChange={onChange} className={inputClass} />
			<p className="text-xs text-zinc-500">最大 {MAX_FILES} 枚。送信前に長辺 {MAX_EDGE}px へ縮小します</p>
			{busy && <p className="text-xs text-zinc-500">写真を取り込み中…</p>}
			{error && (
				<p role="alert" className="text-xs text-red-700 dark:text-red-300">
					{error}
				</p>
			)}
		</div>
	);
}
