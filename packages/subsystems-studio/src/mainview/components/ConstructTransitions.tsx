/**
 * Cumulative timeline entries, changes and exits over commits or UTC days.
 * Both charts share the same bars; one overlays the verified census size,
 * the other the average commit age. Colors and fonts follow the theme.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { AxisBottom } from "@visx/axis";
import { Group } from "@visx/group";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Bar, Circle, LinePath } from "@visx/shape";
import { useTooltip } from "@visx/tooltip";
import type { ConstructTimelineSummary } from "../../shared/construct-timeline";

interface ChartBucket {
	key: string;
	/** Short axis label (MM-DD). */
	label: string;
	/** Full hover text. */
	title: string;
	introduced: number;
	removed: number;
	changed: number;
	/** Census size at this bucket (newest commit within a day), when recorded. */
	size?: number;
	/** Mean age in days of the analyzed commits up to this bucket, at that point. */
	avgAge?: number;
}

/**
 * Cumulative mean commit age, aligned to `commits` (newest first). At each
 * commit it is the mean of (this commit's time − every analyzed commit's time
 * up to and including it), so it grows as older history accumulates. Only the
 * analyzed commits count, not the whole repository.
 */
export function cumulativeAverageCommitAgeDays(commits: ReadonlyArray<{ committedAt: string }>): number[] {
	const times = [...commits].reverse().map((commit) => Date.parse(commit.committedAt));
	if (times.some((time) => !Number.isFinite(time))) return [];
	const oldestFirst: number[] = [];
	let sum = 0;
	for (let index = 0; index < times.length; index++) {
		sum += times[index]!;
		oldestFirst.push((((index + 1) * times[index]! - sum) / (index + 1)) / 86_400_000);
	}
	return oldestFirst.reverse();
}

/** Newest-first commits reversed so the axis reads left-to-right in time. */
function bucketByCommit(summary: ConstructTimelineSummary, ages: number[]): ChartBucket[] {
	return [...summary.commits].reverse().map((commit, reversed) => {
		const index = summary.commits.length - 1 - reversed;
		return {
			key: commit.sha,
			label: commit.committedAt.slice(5, 10),
			title: `${commit.sha.slice(0, 8)} · ${commit.committedAt.slice(0, 10)} · ${commit.subject}`,
			introduced: commit.introduced, removed: commit.removed, changed: commit.changed,
			...(typeof commit.constructs === "number" ? { size: commit.constructs } : {}),
			...(Number.isFinite(ages[index]) ? { avgAge: ages[index] } : {}),
		};
	});
}

function bucketByDay(summary: ConstructTimelineSummary, ages: number[]): ChartBucket[] {
	const days = new Map<string, ChartBucket>();
	const reversed = [...summary.commits].reverse();
	for (let reversedIndex = 0; reversedIndex < reversed.length; reversedIndex++) {
		const commit = reversed[reversedIndex]!;
		const index = summary.commits.length - 1 - reversedIndex;
		const day = commit.committedAt.slice(0, 10);
		let bucket = days.get(day);
		if (!bucket) {
			bucket = { key: day, label: day.slice(5), title: `${day} (UTC)`, introduced: 0, removed: 0, changed: 0 };
			days.set(day, bucket);
		}
		bucket.introduced += commit.introduced;
		bucket.removed += commit.removed;
		bucket.changed += commit.changed;
		// The newest commit in the day carries the day's closing values.
		if (typeof commit.constructs === "number") bucket.size = commit.constructs;
		if (Number.isFinite(ages[index])) bucket.avgAge = ages[index];
	}
	return [...days.values()];
}

/** ResizeObserver width with a stable default so SSR and tests still render. */
function useMeasuredWidth<T extends HTMLElement>(fallback = 640) {
	const ref = useRef<T | null>(null);
	const [width, setWidth] = useState(fallback);
	useEffect(() => {
		const node = ref.current;
		if (!node || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver((entries) => {
			const next = Math.round(entries[0]?.contentRect.width ?? 0);
			if (next > 0) setWidth((current) => (Math.abs(current - next) < 1 ? current : next));
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	return { ref, width };
}

function LegendDot({ color, label }: { color: string; label: string }) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	return (
		<span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: theme.fontSizes[0], color: muted }}>
			<span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
			{label}
		</span>
	);
}

function LegendLine({ color, label, title }: { color: string; label: string; title?: string }) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	return (
		<span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: theme.fontSizes[0], color: muted }}>
			<span aria-hidden="true" style={{ width: 14, borderTop: `2px dashed ${color}` }} />
			{label}
		</span>
	);
}

const CHART_HEIGHT = 156;
const MARGIN = { top: 10, right: 10, bottom: 24, left: 10 };

/** Bars (entries/changed/exits) plus one overlay line: census size or avg age. */
export function ConstructTransitionsChart({ buckets, line }: { buckets: ChartBucket[]; line: "size" | "age" }) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const { ref, width } = useMeasuredWidth<HTMLDivElement>();
	const { tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } = useTooltip<ChartBucket>();

	const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
	const innerHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
	const max = Math.max(1, ...buckets.map((bucket) => Math.max(bucket.introduced, bucket.removed, bucket.changed)));
	const x = useMemo(
		() => scaleBand<string>({ domain: buckets.map((bucket) => bucket.key), range: [0, innerWidth], padding: 0.28 }),
		[buckets, innerWidth],
	);
	const y = useMemo(
		() => scaleLinear<number>({ domain: [0, max], range: [innerHeight, 0], nice: true }),
		[max, innerHeight],
	);
	const select = (bucket: ChartBucket): number | undefined => (line === "size" ? bucket.size : bucket.avgAge);
	const values = buckets.map(select).filter((value): value is number => typeof value === "number");
	const lineScale = values.length >= 2
		? scaleLinear<number>({ domain: [Math.min(...values), Math.max(...values)], range: [innerHeight - 6, 6] })
		: null;
	const points = lineScale
		? buckets.flatMap((bucket) => {
			const value = select(bucket);
			const band = x(bucket.key);
			return typeof value === "number" && band !== undefined
				? [{ x: band + x.bandwidth() / 2, y: lineScale(value) }]
				: [];
		})
		: [];
	// Keep tick labels readable: sample ~every 56px and always include the ends.
	const tickStep = Math.max(1, Math.floor(innerWidth / 56));
	const tickValues = buckets
		.map((bucket, index) => (index % tickStep === 0 || index === buckets.length - 1 ? bucket.key : null))
		.filter((key): key is string => key !== null);
	const labelByKey = new Map(buckets.map((bucket) => [bucket.key, bucket.label]));

	const entryColor = theme.colors.success ?? theme.colors.primary;
	const changeColor = theme.colors.warning ?? theme.colors.primary;
	const exitColor = theme.colors.error ?? "#e5534b";
	const lineColor = line === "size" ? theme.colors.primary : (theme.colors.textSecondary ?? muted);
	const series = [
		{ key: "introduced", color: entryColor },
		{ key: "changed", color: changeColor },
		{ key: "removed", color: exitColor },
	] as const;
	const barWidth = x.bandwidth() / series.length;
	const label = line === "size" ? "Census size" : "Average commit age";

	if (!buckets.length) return null;
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<strong style={{ fontSize: theme.fontSizes[0], letterSpacing: 0.3, textTransform: "uppercase", color: muted }}>{label}</strong>
				{lineScale && (
					<LegendLine
						color={lineColor}
						label={line === "size" ? "census" : "mean age"}
						title={line === "size"
							? "Source-verified declaration census at each commit."
							: "Mean age of the analyzed commits up to each point, not whole-repository age."}
					/>
				)}
			</div>
			<div ref={ref} style={{ position: "relative", width: "100%" }}>
				<svg
					width={width}
					height={CHART_HEIGHT}
					role="img"
					aria-label={`Entries, changes, and exits per bucket with ${line === "size" ? "census size" : "average commit age"}`}
				>
					<Group left={MARGIN.left} top={MARGIN.top}>
						{buckets.map((bucket) => {
							const band = x(bucket.key) ?? 0;
							return (
								<Group key={bucket.key} left={band}>
									<rect
										x={0} y={0} width={x.bandwidth()} height={innerHeight} fill="transparent"
										onMouseMove={(event) => {
											const svg = event.currentTarget.ownerSVGElement;
											if (!svg) return;
											const bounds = svg.getBoundingClientRect();
											showTooltip({
												tooltipData: bucket,
												tooltipLeft: event.clientX - bounds.left,
												tooltipTop: event.clientY - bounds.top,
											});
										}}
										onMouseLeave={hideTooltip}
									>
										<title>{`${bucket.title} · +${bucket.introduced} / ~${bucket.changed} / -${bucket.removed}${typeof bucket.size === "number" ? ` · size ${bucket.size.toLocaleString()}` : ""}${typeof bucket.avgAge === "number" ? ` · avg age ${bucket.avgAge.toFixed(1)}d` : ""}`}</title>
									</rect>
									{series.map((entry, index) => {
										const value = bucket[entry.key];
										if (!value) return null;
										const top = y(value);
										return (
											<Bar
												key={entry.key}
												x={index * barWidth + 0.5}
												y={top}
												width={Math.max(1, barWidth - 1)}
												height={Math.max(0, innerHeight - top)}
												fill={entry.color}
												rx={1}
											/>
										);
									})}
								</Group>
							);
						})}
						{lineScale && points.length >= 2 && (
							<>
								<LinePath data={points} x={(point) => point.x} y={(point) => point.y}
									stroke={lineColor} strokeWidth={2}
									strokeDasharray={line === "size" ? "5 3" : "1 3"} fill="none" />
								{points.map((point, index) => (
									<Circle key={index} cx={point.x} cy={point.y} r={line === "size" ? 2.5 : 2} fill={lineColor} />
								))}
							</>
						)}
						<AxisBottom
							scale={x}
							top={innerHeight}
							tickValues={tickValues}
							tickFormat={(key) => labelByKey.get(String(key)) ?? ""}
							stroke={theme.colors.border}
							tickStroke={theme.colors.border}
							tickLabelProps={{
								fill: muted,
								fontSize: theme.fontSizes[0] * 0.8,
								fontFamily: theme.fonts.monospace,
								textAnchor: "middle",
							}}
						/>
					</Group>
				</svg>
				{tooltipData && (
					<div
						style={{
							position: "absolute", left: tooltipLeft, top: tooltipTop, zIndex: 5, pointerEvents: "none",
							transform: "translate(-50%, calc(-100% - 10px))", maxWidth: 280,
							padding: "6px 9px", borderRadius: 6, border: `1px solid ${theme.colors.border}`,
							background: theme.colors.backgroundSecondary ?? theme.colors.background,
							color: theme.colors.text, fontFamily: theme.fonts.body, fontSize: theme.fontSizes[0],
							boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
						}}
					>
						<div style={{ fontFamily: theme.fonts.monospace, color: muted }}>{tooltipData.title}</div>
						<div>+{tooltipData.introduced} entries · ~{tooltipData.changed} changed · -{tooltipData.removed} exits</div>
						{line === "size" && typeof tooltipData.size === "number" && <div>size {tooltipData.size.toLocaleString()}</div>}
						{line === "age" && typeof tooltipData.avgAge === "number" && <div>avg commit age {tooltipData.avgAge.toFixed(1)} days</div>}
					</div>
				)}
			</div>
		</div>
	);
}

export function ConstructTransitionsCharts({ summary }: { summary: ConstructTimelineSummary }) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const [axis, setAxis] = useState<"commits" | "days">("commits");
	const ages = useMemo(() => cumulativeAverageCommitAgeDays(summary.commits), [summary]);
	const buckets = useMemo(
		() => (axis === "days" ? bucketByDay(summary, ages) : bucketByCommit(summary, ages)),
		[summary, axis, ages],
	);
	const entryColor = theme.colors.success ?? theme.colors.primary;
	const changeColor = theme.colors.warning ?? theme.colors.primary;
	const exitColor = theme.colors.error ?? "#e5534b";
	const toggle = (active: boolean): CSSProperties => ({
		border: "none", borderRadius: 4, padding: "2px 8px", font: "inherit",
		fontSize: theme.fontSizes[0], cursor: "pointer",
		background: active ? `${theme.colors.primary}22` : "transparent",
		color: active ? theme.colors.primary : muted,
	});
	return (
		<>
			<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
				<LegendDot color={entryColor} label="Entries" />
				<LegendDot color={changeColor} label="Changed" />
				<LegendDot color={exitColor} label="Exits" />
				<span style={{ flex: 1 }} />
				<div role="group" aria-label="Transition axis" style={{ display: "flex", gap: 2 }}>
					{(["commits", "days"] as const).map((value) => (
						<button key={value} type="button" aria-pressed={axis === value} style={toggle(axis === value)}
							onClick={() => setAxis(value)}>
							{value === "commits" ? "Commits" : "Days"}
						</button>
					))}
				</div>
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
				<ConstructTransitionsChart buckets={buckets} line="size" />
				<ConstructTransitionsChart buckets={buckets} line="age" />
			</div>
		</>
	);
}
