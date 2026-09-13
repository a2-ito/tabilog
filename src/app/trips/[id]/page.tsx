import Link from "next/link";
import { notFound } from "next/navigation";
import { Rating } from "@/components/rating";
import { LinkButton } from "@/components/ui";
import { getDb } from "@/db";
import { getTrip, listEntries } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { formatDateRange, formatWallClock } from "@/lib/datetime";
import { formatJpy, formatMoney, needsJpyConversion, sumMinor, toJpy } from "@/lib/money";
import { photoUrl } from "@/lib/photos";

const KIND_LABELS: Record<string, string> = { food: "🍜 食べた", shopping: "🛍️ 買った", other: "📌 その他" };

const FILTERS = [
	{ key: "", label: "すべて" },
	{ key: "food", label: "🍜 食べた" },
	{ key: "shopping", label: "🛍️ 買った" },
	{ key: "other", label: "📌 その他" },
] as const;

export default async function TripPage({ params, searchParams }: PageProps<"/trips/[id]">) {
	await requireUser();
	const { id } = await params;
	const tripId = Number(id);
	if (!Number.isInteger(tripId)) notFound();

	const db = await getDb();
	const trip = await getTrip(db, tripId);
	if (!trip) notFound();

	const query = await searchParams;
	const kind = typeof query.kind === "string" && query.kind in KIND_LABELS ? query.kind : undefined;
	const minRating = typeof query.rating === "string" ? Number(query.rating) : undefined;
	const entries = await listEntries(db, tripId, {
		kind,
		minRating: Number.isInteger(minRating) && minRating! >= 1 && minRating! <= 5 ? minRating : undefined,
	});

	const totalMinor = sumMinor(entries.map((e) => e.amountMinor ?? 0));
	const filterHref = (k: string) => {
		const params = new URLSearchParams();
		if (k) params.set("kind", k);
		if (minRating) params.set("rating", String(minRating));
		const qs = params.toString();
		return qs ? `/trips/${tripId}?${qs}` : `/trips/${tripId}`;
	};
	const ratingHref = (r: number | null) => {
		const params = new URLSearchParams();
		if (kind) params.set("kind", kind);
		if (r) params.set("rating", String(r));
		const qs = params.toString();
		return qs ? `/trips/${tripId}?${qs}` : `/trips/${tripId}`;
	};

	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Link href="/" className="text-sm text-zinc-500 hover:underline">
					← 旅行一覧
				</Link>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h1 className="text-xl font-bold">{trip.name}</h1>
						<p className="text-sm text-zinc-500">
							{formatDateRange(trip.startDate, trip.endDate)} ・ {trip.currency}
							{needsJpyConversion(trip.currency) && ` (1 ${trip.currency} = ${trip.rateToJpy} 円)`}
						</p>
					</div>
					<div className="flex gap-2">
						<LinkButton href={`/trips/${trip.id}/edit`}>編集</LinkButton>
						<LinkButton href={`/trips/${trip.id}/entries/new`} variant="primary">
							記録する
						</LinkButton>
					</div>
				</div>
				{trip.note && <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{trip.note}</p>}
			</div>

			<div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
				<p className="text-sm text-zinc-500">表示中の {entries.length} 件の合計</p>
				<p className="text-2xl font-bold">{formatMoney(totalMinor, trip.currency)}</p>
				{needsJpyConversion(trip.currency) && (
					<p className="text-sm text-zinc-500">約 {formatJpy(toJpy(totalMinor, trip.currency, trip.rateToJpy))}</p>
				)}
			</div>

			<div className="flex flex-wrap gap-2 text-sm">
				{FILTERS.map((f) => (
					<Link
						key={f.key}
						href={filterHref(f.key)}
						className={`rounded-full border px-3 py-1 ${
							(kind ?? "") === f.key
								? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
								: "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
						}`}
					>
						{f.label}
					</Link>
				))}
				<Link
					href={ratingHref(minRating === 4 ? null : 4)}
					className={`rounded-full border px-3 py-1 ${
						minRating === 4
							? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
							: "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
					}`}
				>
					★4 以上
				</Link>
			</div>

			{entries.length === 0 ? (
				<p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
					記録がありません
				</p>
			) : (
				<ul className="space-y-3">
					{entries.map((entry) => (
						<li key={entry.id}>
							<Link
								href={`/trips/${trip.id}/entries/${entry.id}`}
								className="flex gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-sky-400 dark:border-zinc-800 dark:bg-zinc-950"
							>
								{entry.photos[0] && (
									<img
										src={photoUrl(entry.photos[0].key)}
										alt=""
										className="h-20 w-20 shrink-0 rounded-md border border-zinc-200 object-cover dark:border-zinc-700"
									/>
								)}
								<div className="min-w-0 flex-1 space-y-1">
									<div className="flex flex-wrap items-baseline justify-between gap-2">
										<h2 className="font-semibold">
											<span className="mr-1 text-xs text-zinc-500">{KIND_LABELS[entry.kind]}</span>
											{entry.title}
										</h2>
										{entry.amountMinor != null && (
											<span className="text-sm font-medium">{formatMoney(entry.amountMinor, trip.currency)}</span>
										)}
									</div>
									<p className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
										<span>{formatWallClock(entry.happenedAt)}</span>
										{entry.place && <span>・{entry.place}</span>}
										<Rating value={entry.rating} />
										{entry.commentCount > 0 && <span>💬 {entry.commentCount}</span>}
									</p>
									{entry.note && (
										<p className="line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{entry.note}</p>
									)}
								</div>
							</Link>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
