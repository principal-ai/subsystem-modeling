/**
 * Cumulative timeline controls: read the checkpoint, show the cursor and event
 * totals, and extend forward. Nothing runs automatically; Extend is the action,
 * and each call is capped and resumes from the cursor.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	CONSTRUCT_TIMELINE_DEFAULT_COMMITS,
	CONSTRUCT_TIMELINE_MAX_COMMITS,
	type ConstructTimelineMeta,
	type ConstructTimelineOptions,
	type ConstructTimelineSummary,
} from "../../shared/construct-timeline";
import { ConstructTransitionsCharts } from "./ConstructTransitions";
import { electrobun } from "../rpc";
import { historyBytes, historyDuration } from "./historyFormat";

export function useConstructTimeline(purl: string | null) {
	const [meta, setMeta] = useState<ConstructTimelineMeta>();
	const [summary, setSummary] = useState<ConstructTimelineSummary>();
	const [error, setError] = useState<string>();
	const [busy, setBusy] = useState(false);
	const currentRepo = useRef(purl);
	currentRepo.current = purl;
	const sequence = useRef(0);
	const [polling, setPolling] = useState(false);
	const refresh = useCallback(async () => {
		if (!purl) return;
		const request = ++sequence.current;
		try {
			const result = await electrobun.rpc!.request.getConstructTimeline({ purl });
			if (currentRepo.current !== purl || request !== sequence.current) return;
			if (!result.ok) setError(result.error ?? "Could not load the timeline.");
			else {
				setMeta(result.meta);
				setSummary(result.summary);
				setError(undefined);
				setPolling(result.meta?.status === "running");
			}
		} catch {
			if (currentRepo.current === purl && request === sequence.current) setError("Could not load the timeline.");
		}
	}, [purl]);

	useEffect(() => {
		sequence.current++;
		setMeta(undefined);
		setSummary(undefined);
		setError(undefined);
		setBusy(false);
		setPolling(false);
		void refresh();
	}, [refresh]);

	useEffect(() => {
		if (!polling) return;
		const timer = setInterval(() => void refresh(), 2000);
		return () => clearInterval(timer);
	}, [polling, refresh]);

	const extend = async (options: ConstructTimelineOptions) => {
		if (!purl) return;
		setBusy(true);
		setError(undefined);
		try {
			const result = await electrobun.rpc!.request.extendConstructTimeline({ purl, options });
			if (currentRepo.current !== purl) return;
			if (!result.ok) setError(result.error ?? "Could not extend the timeline.");
			else setPolling(true);
		} catch {
			if (currentRepo.current === purl) setError("Could not extend the timeline.");
		} finally {
			if (currentRepo.current === purl) setBusy(false);
			void refresh();
		}
	};
	const cancel = async () => {
		if (!purl) return;
		try {
			const result = await electrobun.rpc!.request.cancelConstructTimeline({ purl });
			if (!result.ok && currentRepo.current === purl) setError(result.error ?? "Could not cancel the timeline.");
			else await refresh();
		} catch {
			if (currentRepo.current === purl) setError("Could not cancel the timeline.");
		}
	};
	return { meta, summary, error, busy, extend, cancel };
}

export type ConstructTimelineState = ReturnType<typeof useConstructTimeline>;

export function ConstructTimelineTrigger({ timeline, open, onToggle }: {
	timeline: ConstructTimelineState;
	open: boolean;
	onToggle: () => void;
}) {
	const { theme } = useTheme();
	return (
		<button type="button" aria-expanded={open} aria-controls="construct-timeline-panel" onClick={onToggle}
			style={{
				padding: "10px 12px", border: 0, borderBottom: `1px solid ${theme.colors.border}`,
				background: open ? `${theme.colors.primary}14` : "transparent", color: theme.colors.text,
				textAlign: "left", cursor: "pointer", font: "inherit", fontSize: theme.fontSizes[1],
			}}>
			{timeline.meta?.status === "running" ? "Timeline · Extending…" : "Timeline"}
		</button>
	);
}

export function ConstructTimelinePanel({ timeline, onClose }: {
	timeline: ConstructTimelineState;
	onClose: () => void;
}) {
	const { theme } = useTheme();
	return (
		<aside id="construct-timeline-panel" aria-label="Construct timeline"
			style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto", padding: 20 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
				<h2 style={{ flex: 1, margin: 0, fontSize: theme.fontSizes[3] }}>Construct timeline</h2>
				<button type="button" onClick={onClose} aria-label="Close timeline"
					style={{ border: 0, background: "transparent", color: theme.colors.text, cursor: "pointer", font: "inherit" }}>
					Close
				</button>
			</div>
			<ConstructTimelineSection timeline={timeline} />
		</aside>
	);
}

function TimelineStat({ label, value, title }: { label: string; value: string; title?: string }) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	return (
		<div
			title={title}
			style={{
				display: "flex", flexDirection: "column", gap: 4, minWidth: 0,
				padding: "10px 12px", borderRadius: 8,
				border: `1px solid ${theme.colors.border}`,
				background: theme.colors.backgroundSecondary ?? theme.colors.background,
			}}
		>
			<span style={{ fontSize: theme.fontSizes[0], letterSpacing: 0.4, textTransform: "uppercase", color: muted }}>
				{label}
			</span>
			<span style={{ fontSize: theme.fontSizes[3], fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
				{value}
			</span>
		</div>
	);
}

export function ConstructTimelineSection({ timeline: state }: { timeline: ConstructTimelineState }) {
	const { theme } = useTheme();
	const { meta, summary, error, busy } = state;
	const [options, setOptions] = useState<ConstructTimelineOptions>({
		maxCommits: CONSTRUCT_TIMELINE_DEFAULT_COMMITS, maxMinutes: 10,
	});
	const running = meta?.status === "running";
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const button = (disabled = false): CSSProperties => ({
		border: `1px solid ${theme.colors.border}`, borderRadius: 5, padding: "5px 10px",
		color: theme.colors.text, background: theme.colors.backgroundSecondary,
		font: "inherit", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
	});
	const input: CSSProperties = {
		width: "100%", minWidth: 0, boxSizing: "border-box",
		border: `1px solid ${theme.colors.border}`, borderRadius: 4, padding: 5,
		color: theme.colors.text, background: theme.colors.background, font: "inherit",
	};
	const statusLabel = !meta ? "Not started"
		: meta.status === "running" ? "Extending"
		: meta.status === "interrupted" ? "Interrupted"
		: meta.status === "failed" ? "Failed"
		: "Idle";
	const hasChanges = !!summary && (summary.introduced > 0 || summary.changed > 0 || summary.removed > 0);
	return (
		<section
			aria-label="Cumulative timeline"
			style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 14, borderTop: `1px solid ${theme.colors.border}` }}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
				<strong style={{ fontSize: theme.fontSizes[2] }}>Timeline</strong>
				<span style={{ fontSize: theme.fontSizes[0], color: muted }}>{statusLabel}</span>
				<span style={{ flex: 1 }} />
				{running && <button type="button" style={button()} onClick={() => void state.cancel()}>Cancel</button>}
			</div>
			<p style={{ margin: 0, fontSize: theme.fontSizes[1], lineHeight: 1.5, color: muted }}>
				Extends forward from the last analyzed commit, one compact event per commit. Each call is capped and
				resumes from the cursor, so a long history builds up without redoing the beginning.
			</p>
			{meta && (
				<div aria-live="polite" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
					<TimelineStat label="Commits" value={meta.events.toLocaleString()}
						title="Commits analyzed in the timeline, from the epoch to the cursor." />
					<TimelineStat label="Constructs" value={meta.constructs.toLocaleString()}
						title="Source-verified declarations at the cursor." />
					<TimelineStat label="Cursor"
						value={meta.cursor ? meta.cursor.sha.slice(0, 8) : "—"}
						title={meta.cursor ? `Newest analyzed commit · ${meta.cursor.committedAt.slice(0, 10)}` : "No commits analyzed yet."} />
					<TimelineStat label="Saved" value={historyBytes(meta.retainedBytes)} title="Events and identity baseline on disk." />
					<TimelineStat label="Elapsed" value={historyDuration(meta.elapsedMs)} />
				</div>
			)}
			{meta?.error && <div role="alert" style={{ color: "#e5534b", fontSize: theme.fontSizes[1] }}>{meta.error}</div>}
			{error && <div role="alert" style={{ color: "#e5534b", fontSize: theme.fontSizes[1] }}>{error}</div>}
			{hasChanges && summary && (
				<>
					<div style={{ color: muted, fontSize: theme.fontSizes[1] }}>
						{summary.introduced} {summary.introduced === 1 ? "entry" : "entries"} ·{" "}
						{summary.changed} {summary.changed === 1 ? "change" : "changes"} ·{" "}
						{summary.removed} {summary.removed === 1 ? "exit" : "exits"} across {meta?.events ?? 0} analyzed{" "}
						{meta?.events === 1 ? "commit" : "commits"}
						{summary.medianLifetimeCommits != null
							? ` · median life ${summary.medianLifetimeCommits} ${summary.medianLifetimeCommits === 1 ? "commit" : "commits"}`
							: ""}
					</div>
					<ConstructTransitionsCharts summary={summary} />
				</>
			)}
			{meta && !hasChanges && (
				<div style={{ color: muted, fontSize: theme.fontSizes[1] }}>
					No entries, changes, or exits recorded yet.
				</div>
			)}
			<form
				onSubmit={(event) => { event.preventDefault(); void state.extend(options); }}
				style={{ display: "flex", flexDirection: "column", gap: 8 }}
			>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
					<label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: theme.fontSizes[1] }}>Commits per extension
						<input aria-label="Timeline commits per extension" style={input} type="number"
							min={1} max={CONSTRUCT_TIMELINE_MAX_COMMITS} value={options.maxCommits} disabled={running}
							onChange={(e) => setOptions({ ...options, maxCommits: Number(e.target.value) })} />
					</label>
					<label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: theme.fontSizes[1] }}>Minutes per extension
						<input aria-label="Timeline time budget" style={input} type="number" min={0.1} max={120} step={0.1}
							value={options.maxMinutes} disabled={running}
							onChange={(e) => setOptions({ ...options, maxMinutes: Number(e.target.value) })} />
					</label>
				</div>
				<div style={{ display: "flex", gap: 8 }}>
					<button style={button(running || busy)} type="submit" disabled={running || busy}>
						{meta ? "Extend timeline" : "Start timeline"}
					</button>
				</div>
				<div style={{ color: muted, fontSize: theme.fontSizes[0], lineHeight: 1.5 }}>
					Walks the first-parent history oldest-first from the epoch, or from the cursor on later calls.
					Extending only processes new commits, so the beginning is analyzed once.
				</div>
			</form>
		</section>
	);
}
