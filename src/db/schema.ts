import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

/** ログインした Google アカウント。投稿者の表示名・アイコンの出どころ */
export const users = sqliteTable(
	"users",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		email: text("email").notNull(),
		name: text("name"),
		image: text("image"),
		createdAt: text("created_at").notNull().default(now),
	},
	(t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/** 旅行。使う通貨は trip_currencies に持つ（円は常に使えるので入れない） */
export const trips = sqliteTable("trips", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	startDate: text("start_date"),
	endDate: text("end_date"),
	note: text("note"),
	createdBy: integer("created_by")
		.notNull()
		.references(() => users.id),
	createdAt: text("created_at").notNull().default(now),
	updatedAt: text("updated_at").notNull().default(now),
});

/**
 * 旅行で使う現地通貨と円換算レート。1 つの旅行に複数登録できる。
 * 円は主通貨（レート 1）として常に使えるため、ここには保存しない。
 */
export const tripCurrencies = sqliteTable(
	"trip_currencies",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		tripId: integer("trip_id")
			.notNull()
			.references(() => trips.id, { onDelete: "cascade" }),
		/** ISO 4217 の 3 文字（大文字） */
		code: text("code").notNull(),
		/** 現地通貨 1 単位あたりの円 */
		rateToJpy: real("rate_to_jpy").notNull(),
		/** フォームで並べた順。表示順もこれに従う */
		sortOrder: integer("sort_order").notNull().default(0),
	},
	(t) => [uniqueIndex("trip_currencies_trip_code_idx").on(t.tripId, t.code)],
);

export const ENTRY_KINDS = ["food", "shopping", "other"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** 何を食べた・何を買ったの 1 件 */
export const entries = sqliteTable(
	"entries",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		tripId: integer("trip_id")
			.notNull()
			.references(() => trips.id, { onDelete: "cascade" }),
		/** food | shopping | other */
		kind: text("kind").notNull().default("food"),
		title: text("title").notNull(),
		place: text("place"),
		/** 場所を地図で開くための Google マップ URL（任意）。src/lib/map-url.ts で検証してから入れる */
		mapUrl: text("map_url"),
		/** amountCurrency の最小単位での金額。未入力なら null */
		amountMinor: integer("amount_minor"),
		/**
		 * 支払った通貨。旅行の通貨とは限らない（現地の旅行でも日本で先に払うことがある）。
		 * 既存の記録は旅行の通貨で入力されていたため、移行時にその値を入れている。
		 */
		amountCurrency: text("amount_currency"),
		/** 1〜5。未評価なら null */
		rating: integer("rating"),
		/** 感想・美味しかったか */
		note: text("note"),
		/** 実際に食べた・買った日時（ISO 8601） */
		happenedAt: text("happened_at").notNull(),
		authorId: integer("author_id")
			.notNull()
			.references(() => users.id),
		createdAt: text("created_at").notNull().default(now),
		updatedAt: text("updated_at").notNull().default(now),
	},
	(t) => [
		index("entries_trip_idx").on(t.tripId, t.happenedAt),
		// 旅行ページの「種別」「★4 以上」での絞り込み用
		index("entries_trip_kind_rating_idx").on(t.tripId, t.kind, t.rating),
	],
);

/** 記録に添付した写真（実体は R2、ここにはキーだけ） */
export const entryPhotos = sqliteTable(
	"entry_photos",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		entryId: integer("entry_id")
			.notNull()
			.references(() => entries.id, { onDelete: "cascade" }),
		/** R2 のオブジェクトキー */
		key: text("key").notNull(),
		contentType: text("content_type").notNull(),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: text("created_at").notNull().default(now),
	},
	(t) => [index("entry_photos_entry_idx").on(t.entryId, t.sortOrder)],
);

/** 記録へのコメント。parent_id で返信スレッドを作る */
export const comments = sqliteTable(
	"comments",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		entryId: integer("entry_id")
			.notNull()
			.references(() => entries.id, { onDelete: "cascade" }),
		/** 返信先のコメント。トップレベルなら null */
		parentId: integer("parent_id"),
		body: text("body").notNull(),
		authorId: integer("author_id")
			.notNull()
			.references(() => users.id),
		createdAt: text("created_at").notNull().default(now),
		updatedAt: text("updated_at").notNull().default(now),
	},
	(t) => [index("comments_entry_idx").on(t.entryId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type TripCurrency = typeof tripCurrencies.$inferSelect;
export type Entry = typeof entries.$inferSelect;
export type EntryPhoto = typeof entryPhotos.$inferSelect;
export type Comment = typeof comments.$inferSelect;
