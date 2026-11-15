/**
 * RepoActivityWeekHeatmap — hourly activity across a Sunday–Saturday week.
 *
 * Each weekday has four columns and six rows of hourly intervals. Time runs
 * left-to-right across each row, then bottom-up; the daily map keeps finer detail.
 */

import type { CSSProperties } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	createActivityTimeRange,
	type ActivityTimeRange,
} from "./activityTimeRange";

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

export function RepoActivityWeekHeatmap({
	timestamps,
	weekStart,
	activityNoun,
	selectedRangeKey,
	onSelectRange,
}: {
	timestamps: readonly string[];
	/** Local Sunday at the beginning of the week. */
	weekStart: Date;
	activityNoun: "merge" | "commit";
	selectedRangeKey?: string;
	onSelectRange?: (range: ActivityTimeRange) => void;
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

	for (const timestamp of timestamps) {
		const activity = new Date(timestamp);
		if (Number.isNaN(activity.getTime())) continue;
		const dayIndex = days.findIndex((day) => sameLocalDay(day, activity));
		if (dayIndex >= 0) {
			buckets[dayIndex]![activity.getHours()]! += 1;
		}
	}
	const activityPlural = `${activityNoun}s`;
	const activityTitle = activityNoun === "merge" ? "Merge" : "Commit";

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
	const activityCount = `${total} ${total === 1 ? activityNoun : activityPlural}`;

	const now = new Date();
	const todayIndex = days.findIndex((day) => sameLocalDay(day, now));
	const peakLabel =
		peakDay >= 0
			? `${DAY_LABELS[peakDay]} ${formatInterval(peakBucket)}`
			: null;

	return (
		<div
			role="group"
			aria-label={`${activityTitle} activity this week: ${total} ${total === 1 ? activityNoun : activityPlural}${peakLabel ? `, busiest ${peakLabel}` : ""}`}
			style={{
				maxWidth: 960,
				margin: "0 auto",
				padding: "10px 12px 9px",
				borderBottom: `1px solid ${border}`,
				"--activity-week-now-ring": theme.colors.primary,
				"--activity-week-now-glow": `${theme.colors.primary}55`,
			} as CSSProperties}
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
					Weekly {activityNoun} rhythm
				</span>
				<span
					style={{
						fontFamily: theme.fonts.monospace,
						fontSize: theme.fontSizes[0],
						color: muted,
						whiteSpace: "nowrap",
					}}
				>
					{activityCount} this week
					{peakLabel && peak > 0 ? ` · busiest ${peakLabel}` : ""}
				</span>
			</div>

			<style>{`
@keyframes activity-week-now-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}
@keyframes activity-week-now-border-pulse {
  0%, 100% { box-shadow: inset 0 0 0 1px var(--activity-week-now-ring), 0 0 0 0 var(--activity-week-now-glow); }
  50% { box-shadow: inset 0 0 0 1px var(--activity-week-now-ring), 0 0 0 3px var(--activity-week-now-glow); }
}
.activity-week-now-cell { animation: activity-week-now-blink 2.4s ease-in-out infinite; }
.activity-week-now-empty-cell { animation: activity-week-now-border-pulse 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .activity-week-now-cell { animation: none; }
  .activity-week-now-empty-cell {
    animation: none;
    box-shadow: inset 0 0 0 1px var(--activity-week-now-ring);
  }
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
									(ROWS_PER_COLUMN - 1 - row) * COLUMNS_PER_DAY +
									column;
								const count = buckets[dayIndex]![bucket]!;
								const isNow =
									dayIndex === todayIndex &&
									now.getHours() === bucket;
								const isNowEmpty = isNow && count === 0;
								const strength =
									count > 0 ? 0.25 + 0.75 * Math.sqrt(count / peak) : 0;
								const start = new Date(day);
								start.setHours(bucket, 0, 0, 0);
								const end = new Date(start);
								end.setHours(end.getHours() + 1);
								const range = createActivityTimeRange(
									start,
									end,
									`${formatDay(day)} · ${formatInterval(bucket)}`,
								);
								const isSelected = selectedRangeKey === range.key;
								return (
									<button
										type="button"
										key={bucket}
										aria-label={`${formatDay(day)}, ${formatInterval(bucket)} · ${count} ${count === 1 ? activityNoun : activityPlural}`}
										aria-pressed={isSelected}
										title={`${formatDay(day)} · ${formatInterval(bucket)} · ${count} ${count === 1 ? activityNoun : activityPlural}`}
										onClick={() => onSelectRange?.(range)}
										className={
											isNowEmpty
												? "activity-week-now-empty-cell"
												: isNow
													? "activity-week-now-cell"
													: undefined
										}
										style={{
											appearance: "none",
											border: "none",
											padding: 0,
											cursor: "pointer",
											aspectRatio: "1 / 1",
											minWidth: 0,
											borderRadius: 2,
											background: isNowEmpty
												? "transparent"
												: isNow || count > 0
													? theme.colors.primary
													: border,
											opacity: isNowEmpty
												? 1
												: isNow
												? undefined
												: count > 0
													? strength
													: 0.45,
											boxShadow: isNow
												? `inset 0 0 0 1px ${theme.colors.primary}`
												: undefined,
											outline: isSelected
												? `2px solid ${theme.colors.text}`
												: undefined,
											outlineOffset: -2,
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
