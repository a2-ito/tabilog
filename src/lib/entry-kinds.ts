/**
 * 記録の種別と、画面に出すラベル。
 *
 * DB のスキーマ・入力の検証・フォームの選択肢・一覧の絞り込みで同じ並びを使うため、
 * ここ 1 か所に置く。Cloudflare の env にも drizzle にも触れないので、
 * クライアントコンポーネントからも読める。
 */

/** 保存する値。並び順はフォームの選択肢と絞り込みボタンの並びでもある */
export const ENTRY_KINDS = ["food", "shopping", "sightseeing", "other"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

const LABELS: Record<EntryKind, string> = {
	food: "🍜 食べた",
	shopping: "🛍️ 買った",
	sightseeing: "👀 見た",
	other: "📌 その他",
};

export const ENTRY_KIND_OPTIONS = ENTRY_KINDS.map((value) => ({ value, label: LABELS[value] }));

export function isEntryKind(value: string): value is EntryKind {
	return (ENTRY_KINDS as readonly string[]).includes(value);
}

/** 知らない種別（古いデータなど）はそのまま出して、表示が消えないようにする */
export function entryKindLabel(kind: string): string {
	return isEntryKind(kind) ? LABELS[kind] : kind;
}
