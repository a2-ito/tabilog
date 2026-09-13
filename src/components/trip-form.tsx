"use client";

import { useActionState, useState } from "react";
import { saveTrip } from "@/app/actions/trips";
import type { Trip } from "@/db/schema";
import { initialActionState } from "@/lib/form";
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY } from "@/lib/money";
import { Field, FormMessage, inputClass, SubmitButton } from "./ui";

export function TripForm({ trip }: { trip?: Trip }) {
	const [state, formAction] = useActionState(saveTrip, initialActionState);
	const [currency, setCurrency] = useState(trip?.currency ?? DEFAULT_CURRENCY);
	const isJpy = currency.toUpperCase() === "JPY";

	return (
		<form action={formAction} className="space-y-4">
			{trip && <input type="hidden" name="id" value={trip.id} />}
			<FormMessage state={state} />

			<Field label="旅行名">
				<input name="name" defaultValue={trip?.name ?? ""} required maxLength={100} className={inputClass} placeholder="台湾旅行 2026" />
			</Field>

			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="開始日">
					<input type="date" name="startDate" defaultValue={trip?.startDate ?? ""} className={inputClass} />
				</Field>
				<Field label="終了日">
					<input type="date" name="endDate" defaultValue={trip?.endDate ?? ""} className={inputClass} />
				</Field>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="現地通貨">
					<select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
						{CURRENCY_OPTIONS.map((c) => (
							<option key={c.code} value={c.code}>
								{c.label}
							</option>
						))}
					</select>
				</Field>
				<Field label="円換算レート" hint={isJpy ? "日本円なので 1 のままで大丈夫です" : `現地通貨 1 ${currency} が何円か`}>
					<input
						type="number"
						name="rateToJpy"
						step="0.0001"
						min="0.0001"
						defaultValue={trip?.rateToJpy ?? 1}
						required
						readOnly={isJpy}
						className={inputClass}
					/>
				</Field>
			</div>

			<Field label="メモ">
				<textarea name="note" defaultValue={trip?.note ?? ""} rows={3} maxLength={1000} className={inputClass} />
			</Field>

			<SubmitButton>{trip ? "更新する" : "旅行をつくる"}</SubmitButton>
		</form>
	);
}
