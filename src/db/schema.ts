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

/** 旅行。現地通貨と円換算レートをここで持つ */
export const trips = sqliteTable("trips", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	startDate: text("start_date"),
	endDate: text("end_date"),
	/** ISO 4217。記録の金額はこの通貨の最小単位で保存する */
	currency: text("currency").notNull().default("JPY"),
	/** 現地通貨 1 単位あたりの円。JPY なら 1 */
	rateToJpy: real("rate_to_jpy").notNull().default(1),
	note: text("note"),
	createdBy: integer("created_by")
		.notNull()
		.references(() => users.id),
	createdAt: text("created_at").notNull().default(now),
	updatedAt: text("updated_at").notNull().default(now),
});

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
		/** 旅行の通貨での最小単位金額。未入力なら null */
		amountMinor: integer("amount_minor"),
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
	(t) => [index("entries_trip_idx").on(t.tripId, t.happenedAt)],
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
export type Entry = typeof entries.$inferSelect;
export type EntryPhoto = typeof entryPhotos.$inferSelect;
export type Comment = typeof comments.$inferSelect;
