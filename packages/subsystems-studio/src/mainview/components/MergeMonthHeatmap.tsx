/**
 * MergeMonthHeatmap — daily merged-PR activity in a Sunday-first calendar.
 */

import { useTheme } from "@principal-ade/industry-theme";
import type { MergedPullRequest } from "../../shared/contract";

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

export function MergeMonthHeatmap({
	pullRequests,
	monthStart,
}: {
	pullRequests: readonly MergedPullRequest[];
	/** Local first day of the month. */
	monthStart: Date;
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

	for (const pr of pullRequests) {
		const merged = new Date(pr.mergedAt);
		if (Number.isNaN(merged.getTime())) continue;
		const key = localDateKey(merged);
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

	return (
		<div
			role="img"
			aria-label={`Merge activity this month: ${total} merged pull request${total === 1 ? "" : "s"}${peakLabel ? `, busiest ${peakLabel}` : ""}`}
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
					Monthly merge activity
				</span>
				<span
					style={{
						fontFamily: theme.fonts.monospace,
						fontSize: theme.fontSizes[0],
						color: muted,
						whiteSpace: "nowrap",
					}}
				>
					{total} merged this month
					{peakLabel && peakCount > 0 ? ` · busiest ${peakLabel}` : ""}
				</span>
			</div>

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
					const strength =
						count > 0 ? 0.25 + 0.75 * Math.sqrt(count / peakCount) : 0;
					return (
						<div
							key={localDateKey(day)}
							title={`${formatDay(day)} · ${count} merge${count === 1 ? "" : "s"}`}
							style={{
								aspectRatio: "1 / 1",
								minWidth: 0,
								display: "grid",
								placeItems: "center",
								borderRadius: 3,
								background: count > 0 ? theme.colors.primary : border,
								color: theme.colors.text,
								opacity: count > 0 ? strength : 0.45,
								boxShadow: isToday
									? `inset 0 0 0 2px ${theme.colors.primary}`
									: undefined,
								fontFamily: theme.fonts.monospace,
								fontSize: theme.fontSizes[0],
								fontWeight: isToday ? 700 : 400,
							}}
						>
							{day.getDate()}
						</div>
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
