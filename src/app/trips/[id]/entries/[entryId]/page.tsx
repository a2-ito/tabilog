import Link from "next/link";
import { notFound } from "next/navigation";
import { deletePhotoAction } from "@/app/actions/entries";
import { CommentThreads } from "@/components/comment-thread";
import { Rating } from "@/components/rating";
import { ConfirmForm, DangerButton, LinkButton } from "@/components/ui";
import { getDb } from "@/db";
import { getEntry, getTrip, listComments } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { formatTimestamp, formatWallClock } from "@/lib/datetime";
import { amountToJpy, formatJpy, formatMoney, normalizeCurrency } from "@/lib/money";
import { photoUrl } from "@/lib/photos";

const KIND_LABELS: Record<string, string> = { food: "🍜 食べた", shopping: "🛍️ 買った", other: "📌 その他" };

export default async function EntryPage({ params }: PageProps<"/trips/[id]/entries/[entryId]">) {
	const user = await requireUser();
	const { id, entryId } = await params;
	const tripId = Number(id);
	const numericEntryId = Number(entryId);
	if (!Number.isInteger(tripId) || !Number.isInteger(numericEntryId)) notFound();

	const db = await getDb();
	const [trip, entry] = await Promise.all([getTrip(db, tripId), getEntry(db, numericEntryId)]);
	if (!trip || !entry || entry.tripId !== trip.id) notFound();
	const comments = await listComments(db, entry.id);

	const authorName = entry.author.name ?? entry.author.email;
	const entryCurrency = entry.amountCurrency ?? trip.currency;

	return (
		<div className="space-y-6">
			<Link href={`/trips/${trip.id}`} className="text-sm text-zinc-500 hover:underline">
				← {trip.name}
			</Link>

			<div className="space-y-3">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<p className="text-xs text-zinc-500">{KIND_LABELS[entry.kind]}</p>
						<h1 className="text-2xl font-bold">{entry.title}</h1>
						<p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-zinc-500">
							<span>{formatWallClock(entry.happenedAt)}</span>
							{entry.place && <span>・{entry.place}</span>}
							<Rating value={entry.rating} />
						</p>
					</div>
					<LinkButton href={`/trips/${trip.id}/entries/${entry.id}/edit`}>編集</LinkButton>
				</div>

				{entry.amountMinor != null && (
					<p className="text-xl font-bold">
						{formatMoney(entry.amountMinor, entryCurrency)}
						{/* 円で入力された記録に円換算を添えても意味がない */}
						{normalizeCurrency(entryCurrency) !== "JPY" && (
							<span className="ml-2 text-sm font-normal text-zinc-500">
								約{" "}
								{formatJpy(
									amountToJpy({ minor: entry.amountMinor, currency: entryCurrency }, trip.currency, trip.rateToJpy),
								)}
							</span>
						)}
					</p>
				)}

				<p className="text-xs text-zinc-500">
					{authorName} が {formatTimestamp(entry.createdAt)} に記録
					{entry.updatedAt !== entry.createdAt && `（最終更新 ${formatTimestamp(entry.updatedAt)}）`}
				</p>

				{entry.note && (
					<p className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
						{entry.note}
					</p>
				)}
			</div>

			{entry.photos.length > 0 && (
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{entry.photos.map((photo) => (
						<div key={photo.id} className="space-y-1">
							<img
								src={photoUrl(photo.key)}
								alt=""
								className="aspect-square w-full rounded-md border border-zinc-200 object-cover dark:border-zinc-700"
							/>
							<ConfirmForm action={deletePhotoAction} message="この写真を削除しますか？">
								<input type="hidden" name="id" value={photo.id} />
								<DangerButton>写真を削除</DangerButton>
							</ConfirmForm>
						</div>
					))}
				</div>
			)}

			<section className="space-y-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
				<h2 className="font-semibold">コメント（{comments.length}）</h2>
				<CommentThreads entryId={entry.id} comments={comments} currentUserId={user.id} />
			</section>
		</div>
	);
}
