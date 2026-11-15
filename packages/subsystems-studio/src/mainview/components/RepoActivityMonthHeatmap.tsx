/**
 * RepoActivityMonthHeatmap — daily repo activity in a Sunday-first calendar.
 */

import type { CSSProperties } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	createActivityTimeRange,
	type ActivityTimeRange,
} from "./activityTimeRange";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localDateKey(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function formatDay(day: Date): string {
	return day.toLocaleDateString(undefined, {
		weekday: "long",
		month: "short",
		day: "numeric",
	});
}

export function RepoActivityMonthHeatmap({
	timestamps,
	monthStart,
	activityNoun,
	selectedRangeKey,
	onSelectRange,
}: {
	timestamps: readonly string[];
	/** Local first day of the month. */
	monthStart: Date;
	activityNoun: "merge" | "commit";
	selectedRangeKey?: string;
	onSelectRange?: (range: ActivityTimeRange) => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const border = theme.colors.border ?? "#333";
	const year = monthStart.getFullYear();
	const month = monthStart.getMonth();
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const firstWeekday = monthStart.getDay();
	const weekCount = Math.ceil((firstWeekday + daysInMonth) / 7);
	const dailyCounts = new Map<string, number>();

	for (const timestamp of timestamps) {
		const activity = new Date(timestamp);
		if (Number.isNaN(activity.getTime())) continue;
		const key = localDateKey(activity);
		dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
	}

	let total = 0;
	let peakCount = 0;
	let peakDay: Date | null = null;
	const days: Array<{ day: Date; count: number }> = [];
	for (let dayOfMonth = 1; dayOfMonth <= daysInMonth; dayOfMonth++) {
		const day = new Date(year, month, dayOfMonth);
		const count = dailyCounts.get(localDateKey(day)) ?? 0;
		total += count;
		if (count > peakCount) {
			peakCount = count;
			peakDay = day;
		}
		days.push({ day, count });
	}

	const todayKey = localDateKey(new Date());
	const peakLabel = peakDay ? formatDay(peakDay) : null;
	const calendarCellCount = weekCount * DAY_LABELS.length;
	const activityPlural = `${activityNoun}s`;
	const activityTitle = activityNoun === "merge" ? "Merge" : "Commit";
	const activityCount = `${total} ${total === 1 ? activityNoun : activityPlural}`;

	return (
		<div
			role="group"
			aria-label={`${activityTitle} activity this month: ${total} ${total === 1 ? activityNoun : activityPlural}${peakLabel ? `, busiest ${peakLabel}` : ""}`}
			style={{
				maxWidth: 960,
				margin: "0 auto",
				padding: "10px 12px 9px",
				borderBottom: `1px solid ${border}`,
				"--activity-month-now-ring": theme.colors.primary,
				"--activity-month-now-glow": `${theme.colors.primary}55`,
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
					Monthly {activityNoun} activity
				</span>
				<span
					style={{
						fontFamily: theme.fonts.monospace,
						fontSize: theme.fontSizes[0],
						color: muted,
						whiteSpace: "nowrap",
					}}
				>
					{activityCount} this month
					{peakLabel && peakCount > 0 ? ` · busiest ${peakLabel}` : ""}
				</span>
			</div>

			<style>{`
@keyframes activity-month-now-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}
@keyframes activity-month-now-border-pulse {
  0%, 100% { box-shadow: inset 0 0 0 1px var(--activity-month-now-ring), 0 0 0 0 var(--activity-month-now-glow); }
  50% { box-shadow: inset 0 0 0 1px var(--activity-month-now-ring), 0 0 0 3px var(--activity-month-now-glow); }
}
.activity-month-now-cell { animation: activity-month-now-blink 2.4s ease-in-out infinite; }
.activity-month-now-empty-cell { animation: activity-month-now-border-pulse 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .activity-month-now-cell { animation: none; }
  .activity-month-now-empty-cell {
    animation: none;
    box-shadow: inset 0 0 0 1px var(--activity-month-now-ring);
  }
}
`}</style>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
					gap: 4,
				}}
			>
				{Array.from({ length: calendarCellCount }, (_, index) => {
					const dayIndex = index - firstWeekday;
					if (dayIndex < 0 || dayIndex >= daysInMonth) {
						return <div key={`empty-${index}`} aria-hidden="true" />;
					}

					const { day, count } = days[dayIndex]!;
					const isToday = localDateKey(day) === todayKey;
					const isTodayEmpty = isToday && count === 0;
					const strength =
						count > 0 ? 0.25 + 0.75 * Math.sqrt(count / peakCount) : 0;
					const start = new Date(day);
					const end = new Date(day);
					end.setDate(end.getDate() + 1);
					const range = createActivityTimeRange(start, end, formatDay(day));
					const isSelected = selectedRangeKey === range.key;
					return (
						<button
							type="button"
							key={localDateKey(day)}
							aria-label={`${formatDay(day)} · ${count} ${count === 1 ? activityNoun : activityPlural}`}
							aria-pressed={isSelected}
							title={`${formatDay(day)} · ${count} ${count === 1 ? activityNoun : activityPlural}`}
							onClick={() => onSelectRange?.(range)}
							className={
								isTodayEmpty
									? "activity-month-now-empty-cell"
									: isToday
										? "activity-month-now-cell"
										: undefined
							}
							style={{
								appearance: "none",
								border: "none",
								padding: 0,
								cursor: "pointer",
								aspectRatio: "1 / 1",
								minWidth: 0,
								display: "grid",
								placeItems: "center",
								borderRadius: 3,
								background: isTodayEmpty
									? "transparent"
									: count > 0
										? theme.colors.primary
										: border,
								color: theme.colors.text,
								opacity: isTodayEmpty
									? 1
									: isToday
										? undefined
										: count > 0
											? strength
											: 0.45,
								boxShadow: isToday
									? `inset 0 0 0 2px ${theme.colors.primary}`
									: undefined,
								outline: isSelected
									? `2px solid ${theme.colors.text}`
									: undefined,
								outlineOffset: -2,
								fontFamily: theme.fonts.monospace,
								fontSize: theme.fontSizes[0],
								fontWeight: isToday ? 700 : 400,
							}}
						>
							{day.getDate()}
						</button>
					);
				})}
			</div>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
					gap: 4,
					marginTop: 4,
					textAlign: "center",
					fontFamily: theme.fonts.body,
					fontSize: theme.fontSizes[0],
					color: muted,
				}}
			>
				{DAY_LABELS.map((label) => (
					<div key={label}>{label}</div>
				))}
			</div>
		</div>
	);
}
