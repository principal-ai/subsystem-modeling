/**
 * MergeDayHeatmap — one day of merged-PR activity in ten-minute buckets.
 *
 * A 24 × 6 grid: one column per hour and one row per ten-minute block, so the
 * day's rhythm reads as a block map. Cell color tracks merge count; the
 * current ten-minute cell pulses on today. Hover gives the exact interval.
 */

import type { CSSProperties } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import type { MergedPullRequest } from "../../shared/contract";

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

export function MergeDayHeatmap({
	pullRequests,
	day,
	dayLabel,
}: {
	pullRequests: readonly MergedPullRequest[];
	/** Local day start whose 24 hours are shown. */
	day: Date;
	/** Copy for the summary, e.g. "today" or "yesterday". */
	dayLabel: string;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const border = theme.colors.border ?? "#333";
	const buckets = new Array<number>(BUCKETS_PER_DAY).fill(0);

	for (const pr of pullRequests) {
		const merged = new Date(pr.mergedAt);
		if (Number.isNaN(merged.getTime()) || !sameLocalDay(merged, day)) continue;
		const index =
			merged.getHours() * BUCKETS_PER_HOUR +
			Math.floor(merged.getMinutes() / 10);
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

	return (
		<div
			role="img"
			aria-label={`Merge activity for ${dayLabel}: ${total} merged pull request${total === 1 ? "" : "s"}${peakLabel ? `, busiest ${peakLabel}` : ""}`}
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
					Merge rhythm
				</span>
				<span
					style={{
						fontFamily: theme.fonts.monospace,
						fontSize: theme.fontSizes[0],
						color: muted,
						whiteSpace: "nowrap",
					}}
				>
					{total} merged {dayLabel}
					{peakLabel && peak > 0 ? ` · busiest ${peakLabel}` : ""}
				</span>
			</div>

			<style>{`
@keyframes merge-now-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}
@keyframes merge-now-border-pulse {
  0%, 100% { box-shadow: inset 0 0 0 1px var(--merge-now-ring), 0 0 0 0 var(--merge-now-glow); }
  50% { box-shadow: inset 0 0 0 1px var(--merge-now-ring), 0 0 0 3px var(--merge-now-glow); }
}
.merge-now-cell { animation: merge-now-blink 2.4s ease-in-out infinite; }
.merge-now-empty-cell { animation: merge-now-border-pulse 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .merge-now-cell { animation: none; }
  .merge-now-empty-cell {
    animation: none;
    box-shadow: inset 0 0 0 1px var(--merge-now-ring);
  }
}
`}</style>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
					gridTemplateRows: `repeat(${BUCKETS_PER_HOUR}, auto)`,
					gap: 2,
					"--merge-now-ring": theme.colors.primary,
					"--merge-now-glow": `${theme.colors.primary}55`,
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
						return (
							<div
								key={index}
								title={`${bucketTime(index)} · ${count} merge${count === 1 ? "" : "s"}`}
								className={
									isNowEmpty
										? "merge-now-empty-cell"
										: isNow
											? "merge-now-cell"
											: undefined
								}
								style={{
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
