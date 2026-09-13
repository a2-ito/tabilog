import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./index";
import { comments, entries, entryPhotos, trips, users } from "./schema";
import type { Comment, Entry, EntryPhoto, Trip, User } from "./schema";

/* ── users ─────────────────────────────────────────────────── */

/** ログインのたびに呼ぶ。表示名・アイコンは最新の Google プロフィールに合わせる */
export async function upsertUser(
	db: Db,
	profile: { email: string; name: string | null; image: string | null },
): Promise<User> {
	const email = profile.email.trim().toLowerCase();
	const [row] = await db
		.insert(users)
		.values({ email, name: profile.name, image: profile.image })
		.onConflictDoUpdate({
			target: users.email,
			set: { name: profile.name, image: profile.image },
		})
		.returning();
	if (!row) throw new Error("ユーザの保存に失敗しました");
	return row;
}

/* ── trips ─────────────────────────────────────────────────── */

export type TripSummary = Trip & {
	entryCount: number;
	/** 金額が入力された記録の合計（旅行の通貨の最小単位） */
	totalMinor: number;
};

export async function listTrips(db: Db): Promise<TripSummary[]> {
	const rows = await db
		.select({
			trip: trips,
			entryCount: sql<number>`count(${entries.id})`,
			totalMinor: sql<number>`coalesce(sum(${entries.amountMinor}), 0)`,
		})
		.from(trips)
		.leftJoin(entries, eq(entries.tripId, trips.id))
		.groupBy(trips.id)
		.orderBy(desc(sql`coalesce(${trips.startDate}, ${trips.createdAt})`), desc(trips.id));

	return rows.map((r) => ({ ...r.trip, entryCount: Number(r.entryCount), totalMinor: Number(r.totalMinor) }));
}

export async function getTrip(db: Db, id: number): Promise<Trip | null> {
	const [row] = await db.select().from(trips).where(eq(trips.id, id)).limit(1);
	return row ?? null;
}

export type TripInput = {
	name: string;
	startDate?: string;
	endDate?: string;
	currency: string;
	rateToJpy: number;
	note?: string;
};

export async function createTrip(db: Db, input: TripInput, createdBy: number): Promise<Trip> {
	const [row] = await db
		.insert(trips)
		.values({
			name: input.name,
			startDate: input.startDate ?? null,
			endDate: input.endDate ?? null,
			currency: input.currency,
			rateToJpy: input.rateToJpy,
			note: input.note ?? null,
			createdBy,
		})
		.returning();
	if (!row) throw new Error("旅行の作成に失敗しました");
	return row;
}

export async function updateTrip(db: Db, id: number, input: TripInput): Promise<void> {
	await db
		.update(trips)
		.set({
			name: input.name,
			startDate: input.startDate ?? null,
			endDate: input.endDate ?? null,
			currency: input.currency,
			rateToJpy: input.rateToJpy,
			note: input.note ?? null,
			updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
		})
		.where(eq(trips.id, id));
}

/** 旅行を削除する。記録・写真・コメントは外部キーの cascade で消える */
export async function deleteTrip(db: Db, id: number): Promise<void> {
	await db.delete(trips).where(eq(trips.id, id));
}

/** 旅行に紐づく写真の R2 キー（削除時に実体を消すため） */
export async function listTripPhotoKeys(db: Db, tripId: number): Promise<string[]> {
	const rows = await db
		.select({ key: entryPhotos.key })
		.from(entryPhotos)
		.innerJoin(entries, eq(entries.id, entryPhotos.entryId))
		.where(eq(entries.tripId, tripId));
	return rows.map((r) => r.key);
}

/* ── entries ───────────────────────────────────────────────── */

export type EntryAuthor = Pick<User, "id" | "name" | "email" | "image">;
export type EntryWithMeta = Entry & {
	author: EntryAuthor;
	photos: EntryPhoto[];
	commentCount: number;
};

const authorColumns = { id: users.id, name: users.name, email: users.email, image: users.image };

export type EntryFilter = { kind?: string; minRating?: number };

export async function listEntries(db: Db, tripId: number, filter: EntryFilter = {}): Promise<EntryWithMeta[]> {
	const conditions = [eq(entries.tripId, tripId)];
	if (filter.kind) conditions.push(eq(entries.kind, filter.kind));
	if (filter.minRating) conditions.push(sql`${entries.rating} >= ${filter.minRating}`);

	const rows = await db
		.select({
			entry: entries,
			author: authorColumns,
			commentCount: sql<number>`(select count(*) from ${comments} where ${comments.entryId} = ${entries.id})`,
		})
		.from(entries)
		.innerJoin(users, eq(users.id, entries.authorId))
		.where(and(...conditions))
		.orderBy(desc(entries.happenedAt), desc(entries.id));

	const photos = await listPhotosFor(
		db,
		rows.map((r) => r.entry.id),
	);
	return rows.map((r) => ({
		...r.entry,
		author: r.author,
		commentCount: Number(r.commentCount),
		photos: photos.get(r.entry.id) ?? [],
	}));
}

async function listPhotosFor(db: Db, entryIds: readonly number[]): Promise<Map<number, EntryPhoto[]>> {
	const grouped = new Map<number, EntryPhoto[]>();
	if (entryIds.length === 0) return grouped;
	const rows = await db
		.select()
		.from(entryPhotos)
		.where(inArray(entryPhotos.entryId, [...entryIds]))
		.orderBy(asc(entryPhotos.sortOrder), asc(entryPhotos.id));
	for (const row of rows) {
		const list = grouped.get(row.entryId);
		if (list) list.push(row);
		else grouped.set(row.entryId, [row]);
	}
	return grouped;
}

export async function getEntry(db: Db, id: number): Promise<EntryWithMeta | null> {
	const [row] = await db
		.select({
			entry: entries,
			author: authorColumns,
			commentCount: sql<number>`(select count(*) from ${comments} where ${comments.entryId} = ${entries.id})`,
		})
		.from(entries)
		.innerJoin(users, eq(users.id, entries.authorId))
		.where(eq(entries.id, id))
		.limit(1);
	if (!row) return null;
	const photos = await listPhotosFor(db, [id]);
	return { ...row.entry, author: row.author, commentCount: Number(row.commentCount), photos: photos.get(id) ?? [] };
}

export type EntryInput = {
	kind: string;
	title: string;
	place?: string;
	amountMinor?: number;
	rating?: number;
	note?: string;
	happenedAt: string;
};

export async function createEntry(db: Db, tripId: number, input: EntryInput, authorId: number): Promise<Entry> {
	const [row] = await db
		.insert(entries)
		.values({
			tripId,
			kind: input.kind,
			title: input.title,
			place: input.place ?? null,
			amountMinor: input.amountMinor ?? null,
			rating: input.rating ?? null,
			note: input.note ?? null,
			happenedAt: input.happenedAt,
			authorId,
		})
		.returning();
	if (!row) throw new Error("記録の作成に失敗しました");
	return row;
}

export async function updateEntry(db: Db, id: number, input: EntryInput): Promise<void> {
	await db
		.update(entries)
		.set({
			kind: input.kind,
			title: input.title,
			place: input.place ?? null,
			amountMinor: input.amountMinor ?? null,
			rating: input.rating ?? null,
			note: input.note ?? null,
			happenedAt: input.happenedAt,
			updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
		})
		.where(eq(entries.id, id));
}

export async function deleteEntry(db: Db, id: number): Promise<void> {
	await db.delete(entries).where(eq(entries.id, id));
}

/* ── photos ────────────────────────────────────────────────── */

export async function addPhotos(
	db: Db,
	entryId: number,
	photos: readonly { key: string; contentType: string }[],
): Promise<void> {
	if (photos.length === 0) return;
	const [{ maxOrder } = { maxOrder: null }] = await db
		.select({ maxOrder: sql<number | null>`max(${entryPhotos.sortOrder})` })
		.from(entryPhotos)
		.where(eq(entryPhotos.entryId, entryId));
	const base = maxOrder === null ? 0 : Number(maxOrder) + 1;
	await db
		.insert(entryPhotos)
		.values(photos.map((p, i) => ({ entryId, key: p.key, contentType: p.contentType, sortOrder: base + i })));
}

export async function getPhoto(db: Db, id: number): Promise<EntryPhoto | null> {
	const [row] = await db.select().from(entryPhotos).where(eq(entryPhotos.id, id)).limit(1);
	return row ?? null;
}

export async function deletePhoto(db: Db, id: number): Promise<void> {
	await db.delete(entryPhotos).where(eq(entryPhotos.id, id));
}

export async function listEntryPhotoKeys(db: Db, entryId: number): Promise<string[]> {
	const rows = await db.select({ key: entryPhotos.key }).from(entryPhotos).where(eq(entryPhotos.entryId, entryId));
	return rows.map((r) => r.key);
}

/* ── comments ──────────────────────────────────────────────── */

export type CommentWithAuthor = Comment & { author: EntryAuthor };

export async function listComments(db: Db, entryId: number): Promise<CommentWithAuthor[]> {
	const rows = await db
		.select({ comment: comments, author: authorColumns })
		.from(comments)
		.innerJoin(users, eq(users.id, comments.authorId))
		.where(eq(comments.entryId, entryId))
		.orderBy(asc(comments.createdAt), asc(comments.id));
	return rows.map((r) => ({ ...r.comment, author: r.author }));
}

export async function getComment(db: Db, id: number): Promise<Comment | null> {
	const [row] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
	return row ?? null;
}

export async function createComment(
	db: Db,
	input: { entryId: number; parentId?: number; body: string },
	authorId: number,
): Promise<Comment> {
	const [row] = await db
		.insert(comments)
		.values({ entryId: input.entryId, parentId: input.parentId ?? null, body: input.body, authorId })
		.returning();
	if (!row) throw new Error("コメントの作成に失敗しました");
	return row;
}

/** コメントを削除する。返信もまとめて消す */
export async function deleteComment(db: Db, id: number): Promise<void> {
	await db.delete(comments).where(eq(comments.parentId, id));
	await db.delete(comments).where(eq(comments.id, id));
}
