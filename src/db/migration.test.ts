import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 0001 は既存の記録に amount_currency を埋める移行を含む。
 * 空の DB に当てるテストでは移行結果を確認できないため、
 * 0000 までを適用した DB にデータを入れてから 0001 を当てて確かめる。
 */
function statementsOf(prefix: string): string[] {
	const dir = join(process.cwd(), "drizzle");
	const file = readFileSync(join(dir, `${prefix}.sql`), "utf8");
	return file
		.split("--> statement-breakpoint")
		.map((s) => s.trim())
		.filter((s) => s !== "");
}

describe("0001 の移行", () => {
	it("既存の記録に旅行の通貨を埋める", async () => {
		const { convertV4MiniflareOptions, Miniflare } = await import("miniflare");
		const mf = new Miniflare(
			convertV4MiniflareOptions({
				modules: true,
				script: "export default { fetch() { return new Response('ok'); } }",
				d1Databases: { DB: "tabilog-migration-test" },
			}),
		);
		const d1 = await mf.getD1Database("DB");

		for (const sql of statementsOf("0000_smooth_hulk")) await d1.prepare(sql).run();

		await d1.prepare("INSERT INTO users (id, email) VALUES (1, 'a@example.com')").run();
		await d1
			.prepare("INSERT INTO trips (id, name, currency, rate_to_jpy, created_by) VALUES (1, '台湾', 'TWD', 4.7, 1)")
			.run();
		await d1
			.prepare(
				"INSERT INTO entries (id, trip_id, kind, title, amount_minor, happened_at, author_id) VALUES (1, 1, 'food', '小籠包', 20000, '2026-03-01T12:00', 1)",
			)
			.run();
		// 金額のない記録には通貨を入れない
		await d1
			.prepare(
				"INSERT INTO entries (id, trip_id, kind, title, happened_at, author_id) VALUES (2, 1, 'other', 'MRT', '2026-03-01T09:00', 1)",
			)
			.run();

		for (const sql of statementsOf("0001_remarkable_rocket_raccoon")) await d1.prepare(sql).run();

		const rows = await d1.prepare("SELECT id, amount_currency FROM entries ORDER BY id").all<{
			id: number;
			amount_currency: string | null;
		}>();
		expect(rows.results).toEqual([
			{ id: 1, amount_currency: "TWD" },
			{ id: 2, amount_currency: null },
		]);

		await mf.dispose();
	});
});
