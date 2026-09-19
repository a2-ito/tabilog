import { describe, expect, it } from "vitest";
import { ENTRY_KIND_OPTIONS, ENTRY_KINDS, entryKindLabel, isEntryKind } from "./entry-kinds";

describe("記録の種別", () => {
	it("すべての種別にラベルがある", () => {
		expect(ENTRY_KIND_OPTIONS.map((k) => k.value)).toEqual([...ENTRY_KINDS]);
		for (const option of ENTRY_KIND_OPTIONS) expect(option.label).not.toBe("");
	});

	it("「見た」を選べる", () => {
		expect(isEntryKind("sightseeing")).toBe(true);
		expect(entryKindLabel("sightseeing")).toBe("👀 見た");
	});

	it("知らない種別は弾くが、表示では消さない", () => {
		expect(isEntryKind("drink")).toBe(false);
		// 種別を増減した前後でも、保存済みの記録の行が空にならないようにする
		expect(entryKindLabel("drink")).toBe("drink");
	});
});
