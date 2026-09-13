"use client";

import { useActionState, useState } from "react";
import { saveEntry } from "@/app/actions/entries";
import type { EntryWithMeta } from "@/db/queries";
import type { Trip } from "@/db/schema";
import { nowWallClock } from "@/lib/datetime";
import { initialActionState } from "@/lib/form";
import { minorToInput, needsJpyConversion, normalizeCurrency } from "@/lib/money";
import { PhotoInput } from "./photo-input";
import { Field, FormMessage, inputClass, SubmitButton } from "./ui";

const KIND_LABELS = [
	{ value: "food", label: "🍜 食べた" },
	{ value: "shopping", label: "🛍️ 買った" },
	{ value: "other", label: "📌 その他" },
] as const;

export function EntryForm({ trip, entry }: { trip: Trip; entry?: EntryWithMeta }) {
	const [state, formAction] = useActionState(saveEntry, initialActionState);
	// 現地で払うとは限らない（日本で先に払った宿代など）ので、入力通貨を選べるようにする
	const entryCurrency = entry?.amountCurrency ?? trip.currency;
	const [inputCurrency, setInputCurrency] = useState(
		normalizeCurrency(entryCurrency) === "JPY" ? "JPY" : "local",
	);
	// 旅行そのものが円建てなら選ぶ意味がない
	const canChooseCurrency = needsJpyConversion(trip.currency);

	return (
		<form action={formAction} className="space-y-4">
			<input type="hidden" name="tripId" value={trip.id} />
			{entry && <input type="hidden" name="id" value={entry.id} />}
			<FormMessage state={state} />

			<Field label="種別">
				<select name="kind" defaultValue={entry?.kind ?? "food"} className={inputClass}>
					{KIND_LABELS.map((k) => (
						<option key={k.value} value={k.value}>
							{k.label}
						</option>
					))}
				</select>
			</Field>

			<Field label="何を？">
				<input name="title" defaultValue={entry?.title ?? ""} required maxLength={200} className={inputClass} placeholder="小籠包" />
			</Field>

			<Field label="どこで？">
				<input name="place" defaultValue={entry?.place ?? ""} maxLength={200} className={inputClass} placeholder="鼎泰豐 本店" />
			</Field>

			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="いくら？" hint="空欄でも保存できます">
					<div className="flex gap-2">
						{/* inputClass の w-full と衝突しないよう、幅の指定は外側の要素に持たせる */}
						<input
							name="amount"
							inputMode="decimal"
							defaultValue={entry?.amountMinor != null ? minorToInput(entry.amountMinor, entryCurrency) : ""}
							className={`${inputClass} min-w-0 flex-1`}
							placeholder="200"
						/>
						{canChooseCurrency ? (
							<div className="w-28 shrink-0">
								<select
									name="amountCurrency"
									value={inputCurrency}
									onChange={(e) => setInputCurrency(e.target.value)}
									aria-label="金額の通貨"
									className={inputClass}
								>
									<option value="local">{trip.currency}</option>
									<option value="JPY">JPY</option>
								</select>
							</div>
						) : (
							<input type="hidden" name="amountCurrency" value="local" />
						)}
					</div>
				</Field>
				<Field label="日時">
					<input
						type="datetime-local"
						name="happenedAt"
						defaultValue={entry?.happenedAt ?? nowWallClock()}
						required
						className={inputClass}
					/>
				</Field>
			</div>

			<Field label="評価" hint="美味しかった・よかった度合い">
				<select name="rating" defaultValue={String(entry?.rating ?? 0)} className={inputClass}>
					<option value="0">未評価</option>
					<option value="5">★★★★★ 最高</option>
					<option value="4">★★★★ よかった</option>
					<option value="3">★★★ ふつう</option>
					<option value="2">★★ いまいち</option>
					<option value="1">★ 微妙</option>
				</select>
			</Field>

			<Field label="感想">
				<textarea
					name="note"
					defaultValue={entry?.note ?? ""}
					rows={4}
					maxLength={2000}
					className={inputClass}
					placeholder="皮が薄くて熱々。並ぶ価値あり"
				/>
			</Field>

			<Field label="写真">
				<PhotoInput name="photos" />
			</Field>

			<SubmitButton>{entry ? "更新する" : "記録する"}</SubmitButton>
		</form>
	);
}
