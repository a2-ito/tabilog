"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { createTrip, deleteTrip, getTrip, listTripPhotoKeys, updateTrip } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { type ActionState, idFromForm, optionalIdFromForm, optionalText, parseForm } from "@/lib/form";
import { normalizeCurrency } from "@/lib/money";
import { deletePhotos } from "@/lib/photos";

const optionalDate = z.preprocess(
	(v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
	z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が不正です")
		.optional(),
);

const tripSchema = z
	.object({
		id: optionalIdFromForm,
		name: z.string().trim().min(1, "旅行名を入力してください").max(100, "旅行名が長すぎます"),
		startDate: optionalDate,
		endDate: optionalDate,
		currency: z
			.string()
			.trim()
			.regex(/^[A-Za-z]{3}$/, "通貨コードは 3 文字で入力してください"),
		rateToJpy: z.coerce.number().positive("換算レートは 0 より大きい数を入力してください").max(100000),
		note: optionalText(1000),
	})
	.refine((v) => !v.startDate || !v.endDate || v.startDate <= v.endDate, {
		message: "終了日は開始日以降にしてください",
		path: ["endDate"],
	});

export async function saveTrip(_prev: ActionState, formData: FormData): Promise<ActionState> {
	const user = await requireUser();
	const parsed = parseForm(tripSchema, formData);
	if (!parsed.ok) return { error: parsed.error };

	const { id, ...input } = parsed.data;
	const values = { ...input, currency: normalizeCurrency(input.currency) };

	const db = await getDb();
	let tripId = id;
	if (tripId) {
		const existing = await getTrip(db, tripId);
		if (!existing) return { error: "旅行が見つかりません" };
		await updateTrip(db, tripId, values);
	} else {
		const created = await createTrip(db, values, user.id);
		tripId = created.id;
	}

	revalidatePath("/");
	revalidatePath(`/trips/${tripId}`);
	redirect(`/trips/${tripId}`);
}

export async function deleteTripAction(formData: FormData): Promise<void> {
	await requireUser();
	const id = idFromForm.safeParse(formData.get("id"));
	if (!id.success) throw new Error("旅行 ID が不正です");

	const db = await getDb();
	// R2 の実体は外部キーの cascade では消えないので、先にキーを集めて削除する
	const keys = await listTripPhotoKeys(db, id.data);
	await deleteTrip(db, id.data);
	await deletePhotos(keys);

	revalidatePath("/");
	redirect("/");
}
