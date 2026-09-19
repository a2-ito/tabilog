import { getEnv } from "./cloudflare";
import { isAllowedPhotoType, MAX_PHOTO_BYTES, MAX_PHOTOS_PER_ENTRY } from "./photo-limits";

export const PHOTO_LIMITS = { maxBytes: MAX_PHOTO_BYTES, maxCount: MAX_PHOTOS_PER_ENTRY } as const;

function extensionFor(type: string): string {
	switch (type) {
		case "image/png":
			return "png";
		case "image/webp":
			return "webp";
		case "image/gif":
			return "gif";
		default:
			return "jpg";
	}
}

export type StoredPhoto = { key: string; contentType: string };

/** FormData から取り出した写真を R2 に保存してキーを返す。中身の無いファイルは無視する */
export async function storePhotos(files: readonly File[], tripId: number): Promise<StoredPhoto[]> {
	const targets = files.filter((f) => f && f.size > 0);
	if (targets.length === 0) return [];
	if (targets.length > MAX_PHOTOS_PER_ENTRY) {
		throw new Error(`写真は一度に ${MAX_PHOTOS_PER_ENTRY} 枚までです`);
	}
	for (const file of targets) {
		if (!isAllowedPhotoType(file.type)) throw new Error(`対応していない画像形式です: ${file.type || "不明"}`);
		if (file.size > MAX_PHOTO_BYTES) throw new Error("画像サイズは 5MB 以下にしてください");
	}

	const env = await getEnv();
	const stored: StoredPhoto[] = [];
	for (const file of targets) {
		const key = `trips/${tripId}/${crypto.randomUUID()}.${extensionFor(file.type)}`;
		await env.PHOTOS_BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
		stored.push({ key, contentType: file.type });
	}
	return stored;
}

export async function deletePhotos(keys: readonly string[]): Promise<void> {
	if (keys.length === 0) return;
	const env = await getEnv();
	await env.PHOTOS_BUCKET.delete([...keys]);
}

export function photoUrl(key: string): string {
	return `/api/photos/${key}`;
}
