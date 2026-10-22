/**
 * Cumulative timeline controls: read the checkpoint, show the cursor and event
 * totals, and extend forward. Nothing runs automatically; Extend is the action,
 * and each call is capped and resumes from the cursor.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@principal-ade/industry-theme";
import {
	CONSTRUCT_TIMELINE_DEFAULT_COMMITS,
	type ConstructTimelineMeta,
	type ConstructTimelineOptions,
	type ConstructTimelineSummary,
	type ConstructTimelineCommit,
} from "../../shared/construct-timeline";
import { ConstructTransitionsCharts } from "./ConstructTransitions";
import { electrobun } from "../rpc";
import { useConstructTimelineHistory } from "./useConstructTimelineHistory";
import { ConstructTimelineExtendDialog } from "./ConstructTimelineExtendDialog";

const FileProgress = lazy(() => import("./ConstructTimelineFileProgress").then((module) => ({ default: module.ConstructTimelineFileProgress })));

export function useConstructTimeline(purl: string | null) {
	const [meta, setMeta] = useState<ConstructTimelineMeta>();
	const [summary, setSummary] = useState<ConstructTimelineSummary>();
	const [error, setError] = useState<string>();
	const [busy, setBusy] = useState(false);
	const [loaded, setLoaded] = useState(false);
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
				setLoaded(true);
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
		setLoaded(false);
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
	const reset = async (): Promise<boolean> => {
		if (!purl || busy || meta?.status === "running") return false;
		sequence.current++;
		setBusy(true);
		setPolling(false);
		setError(undefined);
		try {
			const result = await electrobun.rpc!.request.resetConstructTimeline({ purl });
			if (currentRepo.current !== purl) return false;
			if (!result.ok) {
				setError(result.error ?? "Could not reset the timeline.");
				return false;
			}
			sequence.current++;
			setMeta(undefined);
			setSummary(undefined);
			setLoaded(true);
			return true;
		} catch {
			if (currentRepo.current === purl) setError("Could not reset the timeline.");
			return false;
		} finally {
			if (currentRepo.current === purl) setBusy(false);
		}
	};
	return { purl, meta, summary, error, busy, loaded, extend, cancel, reset };
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
	return (
		<aside id="construct-timeline-panel" aria-label="Repo Analysis"
			style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto", padding: 20 }}>
			<ConstructTimelineSection timeline={timeline} onClose={onClose} />
		</aside>
	);
}

function TimelineStat({ label, value, detail }: { label: string; value: string; detail?: string }) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	return (
		<div
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
			{detail && <span style={{ fontSize: theme.fontSizes[0], color: muted }}>{detail}</span>}
		</div>
	);
}

export function ConstructTimelineProjectStats({ history, analyzed, loading, error, onRetry }: {
	history?: readonly ConstructTimelineCommit[];
	analyzed?: readonly { sha: string }[];
	loading: boolean;
	error?: string;
	onRetry: () => void;
}) {
	const progress = useMemo(() => {
		if (!history || !analyzed || !history.length) return undefined;
		const known = new Set(analyzed.map((commit) => commit.sha));
		const count = history.filter((commit) => known.has(commit.sha)).length;
		const percent = count === history.length ? 100 : Math.min(99.9, Math.round(count / history.length * 1000) / 10);
		return { count, percent };
	}, [history, analyzed]);
	const date = (value?: string) => value && Number.isFinite(Date.parse(value))
		? new Date(value).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "—";
	return <div aria-label="Project history overview">
		<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
			<TimelineStat label="Project started" value={date(history?.at(-1)?.committedAt)} />
			<TimelineStat label="Latest commit" value={date(history?.[0]?.committedAt)} />
			<TimelineStat label="Total commits" value={history ? history.length.toLocaleString() : "—"} />
			<TimelineStat label="Analyzed" value={progress ? `${progress.percent}%` : "—"}
				detail={progress ? `${progress.count.toLocaleString()} of ${history!.length.toLocaleString()} commits` : undefined} />
		</div>
		{loading && !history && <p role="status">Loading project history…</p>}
		{error && <p role="status">{error} {history && "Showing the last loaded history."}{" "}
			<button type="button" onClick={onRetry}>Retry project history</button>
		</p>}
	</div>;
}

export function ConstructTimelineSection({ timeline: state, onClose }: { timeline: ConstructTimelineState; onClose?: () => void }) {
	const { theme } = useTheme();
	const { meta, summary, error, busy } = state;
	const [resetFor, setResetFor] = useState<string>();
	const [extensionFor, setExtensionFor] = useState<string>();
	const confirmingReset = !!meta && resetFor === meta.purl;
	const [options, setOptions] = useState<ConstructTimelineOptions>({
		maxCommits: CONSTRUCT_TIMELINE_DEFAULT_COMMITS,
	});
	const running = meta?.status === "running";
	const purl = state.purl ?? meta?.purl ?? null;
	useEffect(() => { setExtensionFor(undefined); }, [purl]);
	const history = useConstructTimelineHistory(purl, running);
	const analyzedCommits = summary?.commits ?? ((state.loaded && !meta) || meta?.events === 0 ? [] : undefined);
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const button = (disabled = false): CSSProperties => ({
		border: `1px solid ${theme.colors.border}`, borderRadius: 5, padding: "5px 10px",
		color: theme.colors.text, background: theme.colors.backgroundSecondary,
		font: "inherit", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
	});
	const routineInterruption = meta?.status === "interrupted" && (
		meta.error === "Interrupted. Extend the timeline to continue from the cursor."
		|| /^Time budget reached(?: \(\d+(?:\.\d+)? min\))?\.(?: Extend again to continue from the cursor\.)?$/.test(meta.error ?? "")
	);
	const timelineError = routineInterruption ? undefined : meta?.error;
	const hasChanges = !!summary && (summary.introduced > 0 || summary.changed > 0 || summary.removed > 0);
	return (
		<section
			aria-label="Cumulative timeline"
			style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: onClose ? 0 : 14, borderTop: onClose ? undefined : `1px solid ${theme.colors.border}` }}
		>
			<div aria-label="Timeline header" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
				{onClose ? <h2 style={{ margin: 0, fontSize: theme.fontSizes[3] }}>Repo Analysis</h2>
					: <strong style={{ fontSize: theme.fontSizes[2] }}>Timeline</strong>}
				<span style={{ flex: 1 }} />
				{running && <button type="button" style={button()} onClick={() => void state.cancel()}>Cancel</button>}
				<button type="button" aria-haspopup="dialog" disabled={!purl || running || busy || confirmingReset}
					style={button(!purl || running || busy || confirmingReset)} onClick={() => { if (purl) setExtensionFor(purl); }}>
					{meta ? "Continue analysis" : "Start analysis"}
				</button>
				{meta && <button type="button" style={button(running || busy)} disabled={running || busy}
					title={running ? "Cancel the extension and wait for it to stop before resetting." : "Delete this repository's cached timeline analysis."}
					onClick={() => setResetFor(meta.purl)}>Reset timeline</button>}
				{onClose && <button type="button" onClick={onClose} aria-label="Close timeline"
					style={button()}>Close</button>}
			</div>
			{confirmingReset && !running && <ConstructTimelineResetConfirmation purl={meta.purl} commits={meta.events} busy={busy}
				onCancel={() => setResetFor(undefined)}
				onConfirm={() => { void state.reset().then((ok) => { if (ok) setResetFor(undefined); }); }} />}
			{purl && <ConstructTimelineProjectStats history={history.commits} analyzed={analyzedCommits}
				loading={history.loading} error={history.error} onRetry={history.retry} />}
			{timelineError && <div role="alert" style={{ color: "#e5534b", fontSize: theme.fontSizes[1] }}>{timelineError}</div>}
			{error && <div role="alert" style={{ color: "#e5534b", fontSize: theme.fontSizes[1] }}>{error}</div>}
			{meta && <Suspense fallback={<p>Loading file progress…</p>}>
				<FileProgress key={meta.purl} purl={meta.purl} commits={summary?.commits ?? []} running={running} historyState={history} processing={meta.processing} />
			</Suspense>}
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
			{purl && extensionFor === purl && !confirmingReset && createPortal(
				<ConstructTimelineExtendDialog options={options} onOptionsChange={setOptions} hasTimeline={!!meta}
					busy={busy} running={running} onClose={() => setExtensionFor(undefined)}
					onSubmit={() => {
						if (busy || running || confirmingReset) return;
						setExtensionFor(undefined);
						void state.extend(options);
					}} />, document.body,
			)}
		</section>
	);
}

export function ConstructTimelineResetConfirmation({ purl, commits, busy, onCancel, onConfirm }: {
	purl: string;
	commits: number;
	busy: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const { theme } = useTheme();
	return <div role="alertdialog" aria-label="Confirm timeline reset" aria-describedby="timeline-reset-description"
		style={{ padding: 14, border: "1px solid #e5534b", borderRadius: 6, background: theme.colors.backgroundSecondary }}>
		<strong>Reset timeline for {purl}?</strong>
		<p id="timeline-reset-description">
			This permanently deletes {commits.toLocaleString()} analyzed commits, saved evidence, and the managed analysis clone for this repository.
			{" "}Source files, subsystem models, and other repositories are not changed.
			{" "}Nothing restarts automatically. Use Start analysis afterward to analyze from the oldest commit.
		</p>
		<div style={{ display: "flex", gap: 8 }}>
			<button type="button" disabled={busy} onClick={onCancel}>Keep analysis</button>
			<button type="button" disabled={busy} onClick={onConfirm}>{busy ? "Resetting…" : "Delete analysis"}</button>
		</div>
	</div>;
}
