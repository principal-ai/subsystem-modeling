/**
 * RepoActivityDayHeatmap — one day of repo activity in ten-minute buckets.
 *
 * A 24 × 6 grid: one column per hour and one row per ten-minute block, so the
 * day's rhythm reads as a block map. Cell color tracks activity count; the
 * current ten-minute cell pulses on today. Hover gives the exact interval.
 */

import type { CSSProperties } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	createActivityTimeRange,
	type ActivityTimeRange,
} from "./activityTimeRange";

const BUCKETS_PER_HOUR = 6;
const BUCKETS_PER_DAY = 24 * BUCKETS_PER_HOUR;

function sameLocalDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

function bucketTime(index: number): string {
	const start = index * 10;
	const end = start + 9;
	const label = (minutes: number) =>
		`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
			minutes % 60,
		).padStart(2, "0")}`;
	return `${label(start)}–${label(end)}`;
}

export function RepoActivityDayHeatmap({
	timestamps,
	day,
	dayLabel,
	activityNoun,
	selectedRangeKey,
	onSelectRange,
}: {
	timestamps: readonly string[];
	/** Local day start whose 24 hours are shown. */
	day: Date;
	/** Copy for the summary, e.g. "today" or "yesterday". */
	dayLabel: string;
	activityNoun: "merge" | "commit";
	selectedRangeKey?: string;
	onSelectRange?: (range: ActivityTimeRange) => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const border = theme.colors.border ?? "#333";
	const buckets = new Array<number>(BUCKETS_PER_DAY).fill(0);

	for (const timestamp of timestamps) {
		const activity = new Date(timestamp);
		if (Number.isNaN(activity.getTime()) || !sameLocalDay(activity, day)) continue;
		const index =
			activity.getHours() * BUCKETS_PER_HOUR +
			Math.floor(activity.getMinutes() / 10);
		if (index >= 0 && index < BUCKETS_PER_DAY) buckets[index]! += 1;
	}

	let total = 0;
	let peak = 0;
	let peakIndex = -1;
	buckets.forEach((count, index) => {
		total += count;
		if (count > peak) {
			peak = count;
			peakIndex = index;
		}
	});
	const now = new Date();
	const showNowMarker = sameLocalDay(day, now);
	const currentBucketIndex = showNowMarker
		? now.getHours() * BUCKETS_PER_HOUR + Math.floor(now.getMinutes() / 10)
		: -1;
	const peakLabel = peakIndex >= 0 ? bucketTime(peakIndex) : null;
	const activityPlural = `${activityNoun}s`;
	const activityCount = `${total} ${total === 1 ? activityNoun : activityPlural}`;
	const activitySummary =
		activityNoun === "merge"
			? `${total} merged ${dayLabel}`
			: `${activityCount} ${dayLabel}`;

	return (
		<div
			role="group"
			aria-label={`${activityNoun === "merge" ? "Merge" : "Commit"} activity for ${dayLabel}: ${activityCount}${peakLabel ? `, busiest ${peakLabel}` : ""}`}
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
					marginBottom: 6,
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
					{activityNoun === "merge" ? "Merge rhythm" : "Commit rhythm"}
				</span>
				<span
					style={{
						fontFamily: theme.fonts.monospace,
						fontSize: theme.fontSizes[0],
						color: muted,
						whiteSpace: "nowrap",
					}}
				>
					{activitySummary}
					{peakLabel && peak > 0 ? ` · busiest ${peakLabel}` : ""}
				</span>
			</div>

			<style>{`
@keyframes activity-now-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}
@keyframes activity-now-border-pulse {
  0%, 100% { box-shadow: inset 0 0 0 1px var(--activity-now-ring), 0 0 0 0 var(--activity-now-glow); }
  50% { box-shadow: inset 0 0 0 1px var(--activity-now-ring), 0 0 0 3px var(--activity-now-glow); }
}
.activity-now-cell { animation: activity-now-blink 2.4s ease-in-out infinite; }
.activity-now-empty-cell { animation: activity-now-border-pulse 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .activity-now-cell { animation: none; }
  .activity-now-empty-cell {
    animation: none;
    box-shadow: inset 0 0 0 1px var(--activity-now-ring);
  }
}
`}</style>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
					gridTemplateRows: `repeat(${BUCKETS_PER_HOUR}, auto)`,
					gap: 2,
					"--activity-now-ring": theme.colors.primary,
					"--activity-now-glow": `${theme.colors.primary}55`,
				} as CSSProperties}
			>
				{Array.from({ length: BUCKETS_PER_HOUR }, (_, row) =>
					Array.from({ length: 24 }, (_, hour) => {
						// Rows run bottom-to-top: :00 at the bottom, :50 at the top.
						const index =
							hour * BUCKETS_PER_HOUR + (BUCKETS_PER_HOUR - 1 - row);
						const count = buckets[index]!;
						const strength =
							count > 0 ? 0.25 + 0.75 * Math.sqrt(count / peak) : 0;
						const isNow = index === currentBucketIndex;
						const isNowEmpty = isNow && count === 0;
						const start = new Date(day);
						start.setHours(
							Math.floor(index / BUCKETS_PER_HOUR),
							(index % BUCKETS_PER_HOUR) * 10,
							0,
							0,
						);
						const end = new Date(start);
						end.setMinutes(end.getMinutes() + 10);
						const range = createActivityTimeRange(
							start,
							end,
							`${dayLabel} · ${bucketTime(index)}`,
						);
						const isSelected = selectedRangeKey === range.key;
						return (
							<button
								type="button"
								key={index}
								aria-label={`${dayLabel}, ${bucketTime(index)} · ${count} ${count === 1 ? activityNoun : activityPlural}`}
								aria-pressed={isSelected}
								title={`${bucketTime(index)} · ${count} ${count === 1 ? activityNoun : activityPlural}`}
								onClick={() => onSelectRange?.(range)}
								className={
									isNowEmpty
										? "activity-now-empty-cell"
										: isNow
											? "activity-now-cell"
											: undefined
								}
								style={{
									appearance: "none",
									border: "none",
									padding: 0,
									cursor: "pointer",
									aspectRatio: "1 / 1",
									width: "100%",
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
									outline: isSelected
										? `2px solid ${theme.colors.text}`
										: undefined,
									outlineOffset: -2,
								}}
							/>
						);
					}),
				)}
			</div>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
					gap: 2,
					marginTop: 3,
					fontFamily: theme.fonts.monospace,
					fontSize: 9,
					color: muted,
				}}
			>
				{Array.from({ length: 24 }, (_, hour) => (
					<div
						key={hour}
						style={{ minWidth: 0, textAlign: "center" }}
					>
						{hour % 6 === 0 ? `${String(hour).padStart(2, "0")}:00` : ""}
					</div>
				))}
			</div>
		</div>
	);
}
