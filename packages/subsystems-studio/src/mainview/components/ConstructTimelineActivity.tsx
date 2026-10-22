import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { Check, ChevronDown } from "lucide-react";
import type { ConstructTimelineCommit, ConstructTimelineSummary, ConstructTimelineMeta } from "../../shared/construct-timeline";
import { formatConstructDelta, formatTimelineDate, timelineActivityDays, timelineCommitDay } from "./timelineActivity";

const activityStyles = `
.timeline-year-option { background: transparent; }
.timeline-year-option:hover, .timeline-year-option:focus, .timeline-year-option[aria-checked="true"] {
	background: var(--timeline-year-hover);
}
.timeline-year-option:focus-visible { outline: 1px solid var(--timeline-year-accent); outline-offset: -1px; }
@keyframes timeline-commit-pulse {
	0%, 100% { box-shadow: 0 0 0 0 #fbbf2440; opacity: 1; }
	50% { box-shadow: 0 0 0 4px #fbbf2400; opacity: .55; }
}
.timeline-commit-dot[data-commit-state="processing"] { animation: timeline-commit-pulse 1.4s ease-in-out infinite; }
@keyframes timeline-day-pulse {
	0%, 100% { box-shadow: inset 0 0 0 2px #fbbf24; }
	50% { box-shadow: inset 0 0 0 2px #fbbf2440; }
}
.timeline-activity-day[data-processing="true"] {
	box-shadow: inset 0 0 0 2px #fbbf24;
	animation: timeline-day-pulse 1.4s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
	.timeline-commit-dot[data-commit-state="processing"],
	.timeline-activity-day[data-processing="true"] { animation: none; }
}`;

function ActivityYearPicker({ years, year, onChange }: { years: number[]; year: number; onChange: (year: number) => void }) {
	const { theme } = useTheme();
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const menu = useRef<HTMLDivElement>(null);
	const menuId = useId();
	useEffect(() => {
		if (!open) return;
		menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
		const dismiss = (event: PointerEvent) => {
			if (!root.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", dismiss);
		return () => document.removeEventListener("pointerdown", dismiss);
	}, [open]);
	const close = () => { setOpen(false); trigger.current?.focus(); };
	if (years.length <= 1) return <span aria-label="Activity year"
		style={{ fontSize: theme.fontSizes[1], fontWeight: 600, fontVariantNumeric: "tabular-nums", padding: "5px 0" }}>{year}</span>;
	return <div ref={root}
		style={{ position: "relative", "--timeline-year-hover": theme.colors.backgroundSecondary ?? theme.colors.background, "--timeline-year-accent": theme.colors.primary } as CSSProperties}
		onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
		onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); } }}>
		<button ref={trigger} type="button" aria-label="Activity year" aria-haspopup="menu" aria-expanded={open}
			aria-controls={open ? menuId : undefined} onClick={() => setOpen((value) => !value)}
			onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); } }}
			style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 9px", borderRadius: 6, font: "inherit", fontSize: theme.fontSizes[1],
				fontWeight: 600, fontVariantNumeric: "tabular-nums", color: theme.colors.text, background: theme.colors.backgroundSecondary,
				border: `1px solid ${open ? theme.colors.primary : theme.colors.border}`, cursor: "pointer" }}>
			{year}<ChevronDown size={13} aria-hidden style={{ transform: open ? "rotate(180deg)" : undefined }} />
		</button>
		{open && <div ref={menu} id={menuId} role="menu" aria-label="Activity years"
			style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", zIndex: 10, minWidth: 112, maxHeight: 208, overflowY: "auto", padding: 4,
				background: theme.colors.background, border: `1px solid ${theme.colors.border}`, borderRadius: 8, boxShadow: "0 8px 24px #0005" }}
			onKeyDown={(event) => {
				if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
				event.preventDefault();
				const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
				const index = options.indexOf(document.activeElement as HTMLButtonElement);
				const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
					: (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
				options[next]?.focus();
			}}>
			{years.map((value) => <button key={value} type="button" role="menuitemradio" aria-checked={value === year}
				tabIndex={-1} className="timeline-year-option" onClick={() => { onChange(value); close(); }}
				style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, width: "100%", padding: "7px 9px",
					border: 0, borderRadius: 4, color: theme.colors.text, font: "inherit", fontSize: theme.fontSizes[0], cursor: "pointer" }}>
				{value}{value === year && <Check size={12} aria-hidden />}
			</button>)}
		</div>}
	</div>;
}

export function ConstructTimelineActivity({ commits, analyzed, changes = [], selectedSha, following, onSelect, onFollow, historyComplete = true, processing }: {
	commits: ConstructTimelineCommit[];
	analyzed: ReadonlySet<string>;
	changes?: ConstructTimelineSummary["commits"];
	selectedSha?: string;
	processing?: ConstructTimelineMeta["processing"];
	following: boolean;
	historyComplete?: boolean;
	onSelect: (sha: string) => void;
	onFollow: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const years = useMemo(() => [...new Set(commits.map((commit) => timelineCommitDay(commit).slice(0, 4)).filter(Boolean))]
		.map(Number).sort((a, b) => b - a), [commits]);
	const selected = commits.find((commit) => commit.sha === (following && processing ? processing.sha : selectedSha))
		?? commits.find((commit) => commit.sha === selectedSha);
	const [chosenYear, setYear] = useState<number>();
	const [chosenDay, setDay] = useState<string>();
	const year = chosenYear ?? (selected ? Number(timelineCommitDay(selected).slice(0, 4)) : years[0]) ?? new Date().getUTCFullYear();
	const counts = useMemo(() => new Map(changes.map((commit) => [commit.sha, commit])), [changes]);
	const days = useMemo(() => timelineActivityDays(commits, analyzed, year, counts), [commits, analyzed, year, counts]);
	const activeDay = chosenDay ?? (selected ? timelineCommitDay(selected) : "");
	const active = days.find((day) => day.date === activeDay);
	const columns = days.at(-1)?.column ?? 53;
	const maxChange = Math.max(1, ...days.map((day) => Math.abs(day.net ?? 0)));
	const colors = {
		none: theme.colors.border,
		unanalyzed: "#64748b",
		analyzed: "#34d399",
		mixed: "linear-gradient(135deg, #34d399 50%, #64748b 50%)",
	};
	const buttonStyle = { background: theme.colors.background, color: theme.colors.text, border: `1px solid ${theme.colors.border}`, borderRadius: 5, padding: "5px 9px", cursor: "pointer" };
	return <div aria-label="Construct activity" style={{ marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${theme.colors.border}` }}>
		<style>{activityStyles}</style>
		<div aria-label="Activity header" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px 16px", marginBottom: 12 }}>
			<div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
				<strong style={{ fontSize: theme.fontSizes[1] }}>Construct activity</strong>
				<span style={{ fontSize: theme.fontSizes[0], color: muted }}>Daily net change · UTC</span>
			</div>
			<div aria-label="Activity legend" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end",
				gap: "6px 12px", marginLeft: "auto", maxWidth: "100%", color: muted, fontSize: theme.fontSizes[0] }}>
				{(["analyzed", "unanalyzed", "mixed", "none"] as const).map((state, index) => <span key={state} style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
					<span aria-hidden style={{ width: 9, height: 9, borderRadius: 2, background: colors[state], opacity: state === "none" ? .35 : 1 }} />
					{["Analyzed", "Not analyzed", "Partly analyzed day", historyComplete ? "No commits" : "Unknown activity"][index]}
				</span>)}
			</div>
		</div>
		<div aria-label="Activity controls" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
			<ActivityYearPicker years={years} year={year} onChange={(value) => { setYear(value); setDay(""); }} />
			<button type="button" aria-pressed={following} onClick={() => { setYear(undefined); setDay(undefined); onFollow(); }}
				title="Follow current analysis progress and the latest completed file map."
				style={{ ...buttonStyle, marginLeft: "auto" }}>Follow latest</button>
		</div>
		<div style={{ overflowX: "auto", padding: 3 }}>
			<div style={{ minWidth: 636 }}>
				<div aria-hidden style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 3, height: 20,
					fontSize: 10, color: muted }}>
					{days.filter((day) => day.date.endsWith("-01")).map((day) => <span key={day.date}
						style={{ gridColumn: day.column, gridRow: 1, whiteSpace: "nowrap" }}>
						{new Date(`${day.date}T00:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" })}
					</span>)}
				</div>
				<div aria-label={`${year} daily construct activity`} style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
					gridTemplateRows: "repeat(7, 12px)", gap: 3 }}>
					{days.map((day) => {
						const processingDay = !!processing && !analyzed.has(processing.sha)
							&& day.commits.some((commit) => commit.sha === processing.sha);
						const label = `${day.date}: ${day.net !== undefined
							? `${formatConstructDelta(day.net)} constructs, ${day.introduced} added, ${day.removed} removed`
							: day.analyzed ? "Change unavailable" : "Not analyzed"}${day.state === "mixed" ? ", partially analyzed" : ""}`;
						const style = { gridColumn: day.column, gridRow: day.row, minWidth: 0, padding: 0, border: 0,
							borderRadius: 2, background: colors[day.state],
							opacity: day.state === "none" ? .35 : day.state === "analyzed" ? .4 + .6 * Math.log1p(Math.abs(day.net ?? 0)) / Math.log1p(maxChange) : 1 };
						return day.commits.length ? <button key={day.date} type="button" title={label} aria-label={label}
							className="timeline-activity-day" data-processing={processingDay || undefined}
							aria-pressed={activeDay === day.date} data-activity-state={day.state}
							onClick={() => { setDay(day.date); onSelect(day.commits[0]!.sha); }}
							style={{ ...style, cursor: "pointer", outline: activeDay === day.date ? `2px solid ${theme.colors.text}` : undefined, outlineOffset: 1 }} />
							: <span key={day.date} title={`${day.date}: ${historyComplete ? "no commits" : "Git activity unavailable"}`} aria-hidden style={style} />;
					})}
				</div>
			</div>
		</div>
		{active?.commits.length ? <div aria-label="Daily construct change" style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "8px 14px", marginTop: 14 }}>
			<time dateTime={active.date} style={{ fontSize: theme.fontSizes[2], color: muted }}>{formatTimelineDate(active.date)}</time>
			<strong style={{ fontSize: theme.fontSizes[2], fontVariantNumeric: "tabular-nums" }}>
				{active.net !== undefined ? `${formatConstructDelta(active.net)} constructs` : active.analyzed ? "Change unavailable" : "Not analyzed"}
			</strong>
			{active.net !== undefined && <span style={{ fontSize: theme.fontSizes[2], color: muted }}>
				{active.introduced.toLocaleString()} added · {active.removed.toLocaleString()} removed
			</span>}
			<div role="list" aria-label={`${active.commits.length} commits on ${active.date}, oldest first`}
				style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", minWidth: 0, height: 28, padding: "0 6px", boxSizing: "border-box", overflowX: "auto" }}>
				{[...active.commits].reverse().map((commit, index) => {
					const state = analyzed.has(commit.sha) ? "analyzed" : commit.sha === processing?.sha ? "processing" : "unanalyzed";
					return <span key={commit.sha} role="listitem" className="timeline-commit-dot" data-commit-state={state}
						aria-label={`Commit ${index + 1}: ${state === "processing" ? "Analyzing" : state === "analyzed" ? "Analyzed" : "Not analyzed"}`}
						style={{ width: 7, height: 7, flexShrink: 0, borderRadius: "50%", background: state === "processing" ? "#fbbf24" : colors[state] }} />;
				})}
			</div>
			{!active.analyzed && <div style={{ width: "100%", fontSize: theme.fontSizes[0], color: muted }}>
				Construct change is not known yet. Showing the day's latest Git file map.
			</div>}
		</div> : <p style={{ margin: "12px 0 0", color: muted, fontSize: theme.fontSizes[0] }}>Select a day to see its construct change.</p>}
	</div>;
}
