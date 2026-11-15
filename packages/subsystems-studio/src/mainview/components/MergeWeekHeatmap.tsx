/**
 * MergeWeekHeatmap — merged-PR activity across a Sunday–Saturday week.
 *
 * Each weekday has four columns and six rows of hourly intervals. Time runs
 * bottom-up within each six-hour column; MergeDayHeatmap keeps finer detail.
 */

import { useTheme } from "@principal-ade/industry-theme";
import type { MergedPullRequest } from "../../shared/contract";

const BUCKETS_PER_DAY = 24;
const ROWS_PER_COLUMN = 6;
const COLUMNS_PER_DAY = 4;
const DAYS_PER_WEEK = 7;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function sameLocalDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

function formatDay(day: Date): string {
	return day.toLocaleDateString(undefined, {
		weekday: "long",
		month: "short",
		day: "numeric",
	});
}

function formatInterval(bucket: number): string {
	const startHour = bucket;
	const endHour = startHour + 1;
	return `${String(startHour).padStart(2, "0")}:00–${String(endHour).padStart(2, "0")}:00`;
}

export function MergeWeekHeatmap({
	pullRequests,
	weekStart,
}: {
	pullRequests: readonly MergedPullRequest[];
	/** Local Sunday at the beginning of the week. */
	weekStart: Date;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const border = theme.colors.border ?? "#333";
	const days = Array.from({ length: DAYS_PER_WEEK }, (_, index) => {
		const date = new Date(weekStart);
		date.setDate(date.getDate() + index);
		return date;
	});
	const buckets = Array.from({ length: DAYS_PER_WEEK }, () =>
		new Array<number>(BUCKETS_PER_DAY).fill(0),
	);

	for (const pr of pullRequests) {
		const merged = new Date(pr.mergedAt);
		if (Number.isNaN(merged.getTime())) continue;
		const dayIndex = days.findIndex((day) => sameLocalDay(day, merged));
		if (dayIndex >= 0) {
			buckets[dayIndex]![merged.getHours()]! += 1;
		}
	}

	let total = 0;
	let peak = 0;
	let peakDay = -1;
	let peakBucket = -1;
	buckets.forEach((dayBuckets, dayIndex) => {
		dayBuckets.forEach((count, bucket) => {
			total += count;
			if (count > peak) {
				peak = count;
				peakDay = dayIndex;
				peakBucket = bucket;
			}
		});
	});

	const now = new Date();
	const todayIndex = days.findIndex((day) => sameLocalDay(day, now));
	const peakLabel =
		peakDay >= 0
			? `${DAY_LABELS[peakDay]} ${formatInterval(peakBucket)}`
			: null;

	return (
		<div
			role="img"
			aria-label={`Merge activity this week: ${total} merged pull request${total === 1 ? "" : "s"}${peakLabel ? `, busiest ${peakLabel}` : ""}`}
			style={{
				maxWidth: 960,
				margin: "0 auto",
				padding: "10px 12px 9px",
				borderBottom: `1px solid ${border}`,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "baseline",
					justifyContent: "space-between",
					gap: 8,
					marginBottom: 8,
				}}
			>
				<span
					style={{
						fontFamily: theme.fonts.heading ?? theme.fonts.body,
						fontSize: theme.fontSizes[1],
						fontWeight: 600,
						color: theme.colors.text,
					}}
				>
					Weekly merge rhythm
				</span>
				<span
					style={{
						fontFamily: theme.fonts.monospace,
						fontSize: theme.fontSizes[0],
						color: muted,
						whiteSpace: "nowrap",
					}}
				>
					{total} merged this week
					{peakLabel && peak > 0 ? ` · busiest ${peakLabel}` : ""}
				</span>
			</div>

			<style>{`
@keyframes merge-week-now-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}
.merge-week-now-cell { animation: merge-week-now-blink 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .merge-week-now-cell { animation: none; }
}
`}</style>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
					columnGap: 8,
				}}
			>
				{days.map((day, dayIndex) => (
					<div
						key={`day-${day.toISOString()}`}
						style={{
							display: "grid",
							gridTemplateColumns: `repeat(${COLUMNS_PER_DAY}, minmax(0, 1fr))`,
							gap: 2,
						}}
					>
						{Array.from({ length: ROWS_PER_COLUMN }, (_, row) =>
							Array.from({ length: COLUMNS_PER_DAY }, (_, column) => {
								const bucket =
									column * ROWS_PER_COLUMN +
									(ROWS_PER_COLUMN - 1 - row);
								const count = buckets[dayIndex]![bucket]!;
								const isNow =
									dayIndex === todayIndex &&
									now.getHours() === bucket;
								const strength =
									count > 0 ? 0.25 + 0.75 * Math.sqrt(count / peak) : 0;
								return (
									<div
										key={bucket}
										title={`${formatDay(day)} · ${formatInterval(bucket)} · ${count} merge${count === 1 ? "" : "s"}`}
										className={isNow ? "merge-week-now-cell" : undefined}
										style={{
											aspectRatio: "1 / 1",
											minWidth: 0,
											borderRadius: 2,
											background:
												isNow || count > 0
													? theme.colors.primary
													: border,
											opacity: isNow
												? undefined
												: count > 0
													? strength
													: 0.45,
											boxShadow: isNow
												? `inset 0 0 0 1px ${theme.colors.primary}`
												: undefined,
										}}
									/>
								);
							}),
						)}
						<div
							title={formatDay(day)}
							style={{
								gridColumn: `span ${COLUMNS_PER_DAY}`,
								fontFamily: theme.fonts.body,
								fontSize: theme.fontSizes[0],
								color: muted,
								textAlign: "center",
								paddingTop: 3,
							}}
						>
							{DAY_LABELS[dayIndex]}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
