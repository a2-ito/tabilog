import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTrip, listTrips, upsertUser } from "@/db/queries";
import { expectRedirect, revalidated } from "@/test/action-mocks";
import { createTestEnv, formData, type TestEnv } from "@/test/d1";

let t: TestEnv;
vi.mock("@/lib/auth", async () => ({ requireUser: async () => (await import("@/test/action-mocks")).fakeUser }));
vi.mock("@/lib/cloudflare", () => ({ getEnv: () => Promise.resolve(t.env) }));
vi.mock("next/cache", async () => {
	const { revalidated } = await import("@/test/action-mocks");
	return { revalidatePath: (p: string) => void revalidated.push(p) };
});
vi.mock("next/navigation", async () => {
	const { RedirectSignal } = await import("@/test/action-mocks");
	return {
		redirect: (to: string) => {
			throw new RedirectSignal(to);
		},
	};
});
const { deleteTripAction, saveTrip } = await import("./trips");

beforeAll(async () => {
	t = await createTestEnv();
});
afterAll(() => t.dispose());
beforeEach(async () => {
	await t.truncate();
	await upsertUser(t.db, { email: "tester@example.com", name: "Tester", image: null });
	revalidated.length = 0;
});

const valid = { name: "台湾旅行", currency: "twd", rateToJpy: "4.7", startDate: "2026-03-01", endDate: "2026-03-05" };

describe("saveTrip", () => {
	it("作成して詳細ページへ遷移する", async () => {
		const to = await expectRedirect(() => saveTrip({}, formData(valid)));
		expect(to).toBe("/trips/1");

		const trip = await getTrip(t.db, 1);
		expect(trip).toMatchObject({ name: "台湾旅行", currency: "TWD", startDate: "2026-03-01" });
		expect(trip?.rateToJpy).toBeCloseTo(4.7);
		expect(revalidated).toEqual(expect.arrayContaining(["/", "/trips/1"]));
	});

	it("通貨コードは大文字に揃える", async () => {
		await expectRedirect(() => saveTrip({}, formData({ ...valid, currency: "jpy", rateToJpy: "1" })));
		expect((await getTrip(t.db, 1))?.currency).toBe("JPY");
	});

	it("既存の旅行を更新する", async () => {
		await expectRedirect(() => saveTrip({}, formData(valid)));
		await expectRedirect(() => saveTrip({}, formData({ ...valid, id: 1, name: "台湾旅行（改）" })));
		expect((await getTrip(t.db, 1))?.name).toBe("台湾旅行（改）");
		expect(await listTrips(t.db)).toHaveLength(1);
	});

	it.each([
		["旅行名が空", { name: "" }, /旅行名を入力/],
		["通貨コードが 3 文字でない", { currency: "JPYY" }, /通貨コード/],
		["レートが 0", { rateToJpy: "0" }, /換算レート/],
		["日付の形式が不正", { startDate: "2026/03/01" }, /日付の形式/],
		["終了日が開始日より前", { startDate: "2026-03-05", endDate: "2026-03-01" }, /終了日/],
	])("%s なら保存せずエラーを返す", async (_name, override, pattern) => {
		const state = await saveTrip({}, formData({ ...valid, ...override }));
		expect(state.error).toMatch(pattern);
		expect(await listTrips(t.db)).toHaveLength(0);
	});

	it("存在しない旅行の更新はエラー", async () => {
		const state = await saveTrip({}, formData({ ...valid, id: 999 }));
		expect(state.error).toMatch(/見つかりません/);
	});
});

describe("deleteTripAction", () => {
	it("削除して一覧へ戻る", async () => {
		await expectRedirect(() => saveTrip({}, formData(valid)));
		const to = await expectRedirect(() => deleteTripAction(formData({ id: 1 })));
		expect(to).toBe("/");
		expect(await getTrip(t.db, 1)).toBeNull();
	});

	it("ID が不正なら例外", async () => {
		await expect(deleteTripAction(formData({ id: "abc" }))).rejects.toThrow(/ID/);
	});
});
