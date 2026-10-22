import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import type { ConstructTimelineFileSnapshot, ConstructTimelineFileStatus, ConstructTimelineSummary, ConstructTimelineMeta } from "../../shared/construct-timeline";
import { electrobun } from "../rpc";
import { TIMELINE_CHANGE_STYLES, TIMELINE_FILE_STYLES, timelineChangeSnapshot, timelineFileExplanation } from "./timelineFileCity";
import { ConstructTimelineActivity } from "./ConstructTimelineActivity";
import { formatTimelineDate } from "./timelineActivity";
import { useConstructTimelineHistory, type ConstructTimelineHistoryState } from "./useConstructTimelineHistory";

const City = lazy(() => import("./ConstructTimelineCity"));

class CityBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
	state = { failed: false };
	static getDerivedStateFromError() { return { failed: true }; }
	render() {
		return this.state.failed
			? <p role="status">File City could not render.</p>
			: this.props.children;
	}
}

export function ConstructTimelineFileProgress({ purl, commits, running, historyState, processing }: {
	purl: string;
	commits: ConstructTimelineSummary["commits"];
	running: boolean;
	historyState?: ConstructTimelineHistoryState;
	processing?: ConstructTimelineMeta["processing"];
}) {
	return <TimelineFileProgress key={purl} purl={purl} commits={commits} running={running} historyState={historyState} processing={processing} />;
}

function TimelineFileProgress({ purl, commits, running, historyState, processing }: {
	purl: string;
	commits: ConstructTimelineSummary["commits"];
	running: boolean;
	historyState?: ConstructTimelineHistoryState;
	processing?: ConstructTimelineMeta["processing"];
}) {
	const { theme } = useTheme();
	const [pinned, setPinned] = useState("");
	const ownHistory = useConstructTimelineHistory(historyState ? null : purl, running);
	const { commits: history, error: historyError, retry: retryHistory, loading: historyLoading } = historyState ?? ownHistory;
	const analyzed = useMemo(() => new Set(commits.map((commit) => commit.sha)), [commits]);
	const allCommits = useMemo(() => {
		const entries = new Map((history ?? []).map((commit) => [commit.sha, commit]));
		for (const commit of commits) entries.set(commit.sha, commit);
		return [...entries.values()];
	}, [history, commits]);
	const showChanges = running && !pinned;
	const sha = pinned || (running ? processing?.sha : undefined) || commits[0]?.sha || history?.[0]?.sha;
	const isAnalyzed = analyzed.has(sha ?? "");
	const [result, setResult] = useState<{ purl: string; sha: string; snapshot?: ConstructTimelineFileSnapshot; error?: string }>();
	const [retry, setRetry] = useState(0);
	const [displayed, setDisplayed] = useState<ConstructTimelineFileSnapshot>();
	useEffect(() => {
		if (!sha) return;
		let cancelled = false;
		void (async () => {
			try {
				const response = await electrobun.rpc!.request.getConstructTimelineFiles({ purl, sha });
				if (cancelled) return;
				if (response.ok && response.snapshot) setDisplayed(response.snapshot);
				setResult({ purl, sha, snapshot: response.ok ? response.snapshot : undefined,
					error: !response.ok || !response.snapshot ? response.error ?? "Could not load this commit's map." : undefined });
			} catch {
				if (!cancelled) setResult({ purl, sha, error: "Could not load this commit's map." });
			}
		})();
		return () => { cancelled = true; };
	}, [purl, sha, retry, isAnalyzed]);
	const current = result?.purl === purl && result.sha === sha ? result : undefined;
	const commit = allCommits.find((entry) => entry.sha === (displayed?.sha ?? sha));
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const sidebar = <>
			{showChanges ? (!displayed && <TimelineCommitMessage message={commit?.subject} />) : <div style={{ display: "grid", gap: 12 }}>
				<h3 style={{ margin: 0, fontSize: theme.fontSizes[2] }}>File coverage</h3>
				{commit && <div>
					<time dateTime={commit.committedAt} style={{ fontSize: theme.fontSizes[0], color: muted }}>{formatTimelineDate(commit.committedAt)} snapshot</time>
				</div>}
			</div>}
			{!sha && <p>No snapshot selected. Choose a day above to browse repository files.</p>}
			{current?.error && <div role="alert">{current.error} <button type="button" onClick={() => { setResult(undefined); setRetry((value) => value + 1); }}>Retry map</button></div>}
		</>;
	return (
		<section aria-label="Commit file coverage" style={{ border: `1px solid ${theme.colors.border}`, borderRadius: 8, padding: 14 }}>
			<ConstructTimelineActivity commits={allCommits} analyzed={analyzed} changes={commits} selectedSha={sha} following={!pinned}
				onSelect={setPinned} onFollow={() => setPinned("")} historyComplete={!!history} processing={running ? processing : undefined} />
			{!history && historyLoading && <p role="status">Loading repository activity…</p>}
			{historyError && <p role="status" style={{ color: muted, fontSize: theme.fontSizes[0] }}>
				{historyError} {history ? "Showing the last loaded history." : "Showing analyzed commits only."}{" "}
				<button type="button" onClick={retryHistory}>Retry activity</button>
			</p>}
			{sha && displayed
				? <ConstructTimelineFilesView snapshot={displayed} sidebar={sidebar} showChanges={showChanges} commitSubject={commit?.subject} />
				: <TimelineFileLayout sidebar={sidebar} map={null} />}
		</section>
	);
}

function TimelineFileLayout({ sidebar, map, overlay }: { sidebar: ReactNode; map: ReactNode; overlay?: ReactNode }) {
	return <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start", minWidth: 0 }}>
		<div aria-label="File coverage summary" style={{ position: "relative", flex: "1 1 320px", minWidth: 0, minHeight: 460, overflowWrap: "anywhere" }}>
			<div inert={!!overlay} aria-hidden={overlay ? true : undefined} style={{ visibility: overlay ? "hidden" : undefined }}>{sidebar}</div>
			{overlay}
		</div>
		<div aria-label="Commit file map" style={{ flex: "2 1 480px", minWidth: 0 }}>{map}</div>
	</div>;
}

function TimelineCommitMessage({ message }: { message?: string }) {
	const { theme } = useTheme();
	const characters = Array.from(message ?? "");
	const preview = characters.length > 200 ? `${characters.slice(0, 200).join("")}…` : message;
	return message !== undefined && <div aria-label="Commit message"
		style={{ margin: "0 0 20px", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: theme.fontSizes[2], lineHeight: 1.5 }}>
		{preview || "No commit message."}
	</div>;
}

function TimelineCommitChanges({ snapshot, subject }: { snapshot: ConstructTimelineFileSnapshot; subject?: string }) {
	const { theme } = useTheme();
	return <>
		<TimelineCommitMessage message={snapshot.message ?? subject} />
		{snapshot.changes ? (snapshot.changes.length ? <div aria-label="Commit change legend"
			style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", fontSize: theme.fontSizes[0] }}>
			{(Object.keys(TIMELINE_CHANGE_STYLES) as Array<keyof typeof TIMELINE_CHANGE_STYLES>).map((status) => {
				const style = TIMELINE_CHANGE_STYLES[status];
				return <span key={status} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
					<span aria-hidden style={{ width: 8, height: 8, background: style.color, borderRadius: 2 }} />
					{style.label} {snapshot.changes!.filter((change) => change.status === status).length.toLocaleString()}
				</span>;
			})}
		</div> : <p>No file changes.</p>) : <p role="status">Commit file changes unavailable.</p>}
	</>;
}

export function ConstructTimelineFilesView({ snapshot, sidebar, showChanges = false, commitSubject }: {
	snapshot: ConstructTimelineFileSnapshot;
	sidebar?: ReactNode;
	showChanges?: boolean;
	commitSubject?: string;
}) {
	const { theme } = useTheme();
	const visibleSnapshot = useMemo(() => showChanges ? timelineChangeSnapshot(snapshot) : snapshot, [snapshot, showChanges]);
	const [selected, setSelected] = useState<string | null>(null);
	useEffect(() => {
		if (selected && !visibleSnapshot.files.some((file) => file.path === selected)) setSelected(null);
	}, [visibleSnapshot, selected]);
	const counts = useMemo(() => {
		const values: Record<ConstructTimelineFileStatus, number> = { verified: 0, partial: 0, unresolved: 0, unsupported: 0, error: 0, uncovered: 0, "non-code": 0 };
		for (const file of snapshot.files) values[file.status]++;
		return values;
	}, [snapshot]);
	const file = visibleSnapshot.files.find((entry) => entry.path === selected);
	const percent = snapshot.files.length ? Math.round(counts.verified / snapshot.files.length * 100) : 0;
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const unprocessed = snapshot.analyzed === false;
	const summary = showChanges ? <>{sidebar}<TimelineCommitChanges snapshot={snapshot} subject={commitSubject} /></> : <>
		{sidebar}
		{unprocessed && <div role="status" style={{ margin: "20px 0", fontSize: theme.fontSizes[1] }}>
			<strong>Not analyzed</strong>
			<p style={{ color: muted }}>{snapshot.files.length.toLocaleString()} tracked files · Git snapshot only.</p>
			<p style={{ color: muted, fontSize: theme.fontSizes[0] }}>Gray buildings have no verification evidence. Viewing this commit does not start analysis.</p>
		</div>}
		{!unprocessed && !snapshot.coverageAvailable && <p role="status" style={{ fontSize: theme.fontSizes[0], color: muted }}>Historical coverage unavailable. Colors reflect current file-type support.</p>}
		{snapshot.extraction && <p role="status" style={{ fontSize: theme.fontSizes[0], color: muted }}>No supported code found in this snapshot.</p>}
		{!unprocessed && <><div aria-live="polite" aria-label={`${counts.verified} / ${snapshot.files.length} files verified (${percent}%)`}
			style={{ margin: "20px 0 16px" }}>
			<div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
				<strong style={{ fontSize: 36, lineHeight: 1, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums" }}>{percent}%</strong>
				<span style={{ color: muted, fontSize: theme.fontSizes[1] }}>files verified</span>
			</div>
			<div style={{ margin: "8px 0", fontSize: theme.fontSizes[0], color: muted }}>
				{counts.verified.toLocaleString()} of {snapshot.files.length.toLocaleString()} tracked files
			</div>
			<progress aria-label="Files with verified candidates only" max={Math.max(1, snapshot.files.length)} value={counts.verified}
				style={{ display: "block", width: "100%", height: 5, accentColor: TIMELINE_FILE_STYLES.verified.color }} />
			<div style={{ marginTop: 8, color: muted, fontSize: theme.fontSizes[0] }}>Observed declarations, not full source coverage.</div>
		</div>
		<div aria-label="File coverage legend" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0 18px" }}>
			{(Object.keys(TIMELINE_FILE_STYLES) as ConstructTimelineFileStatus[]).filter((status) => status !== "verified").map((status) => {
				const style = TIMELINE_FILE_STYLES[status];
				const label = status === "unsupported" ? "Unsupported" : style.label;
				return <div key={status} aria-label={`${label} ${counts[status]}`} title={style.label}
					style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 0", borderBottom: `1px solid ${theme.colors.border}`, fontSize: theme.fontSizes[0] }}>
					<span aria-hidden style={{ flexShrink: 0, width: 7, height: 7, borderRadius: 2, background: style.color }} />
					<span style={{ color: muted }}>{label}</span>
					<strong style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", color: counts[status] ? theme.colors.text : muted }}>{counts[status].toLocaleString()}</strong>
				</div>;
			})}
		</div>
		</>}
	</>;
	return <TimelineFileLayout sidebar={summary}
		overlay={file && <ConstructTimelineFileDetailsOverlay file={file} coverageAvailable={visibleSnapshot.coverageAvailable} analyzed={visibleSnapshot.analyzed}
			removed={showChanges && snapshot.changes?.some((change) => change.path === selected && change.status === "removed")} onClose={() => setSelected(null)} />}
		map={<>
		<CityBoundary><Suspense fallback={<p>Loading File City…</p>}>
			<City snapshot={visibleSnapshot} showChanges={showChanges} selectedPath={file ? selected : null} onSelect={setSelected} />
		</Suspense></CityBoundary>
		{visibleSnapshot.files.length === 0 && <p>This snapshot contains no tracked files.</p>}
	</>} />;
}

export function ConstructTimelineFileDetailsOverlay({ file, coverageAvailable, analyzed, removed, onClose }: {
	file: ConstructTimelineFileSnapshot["files"][number];
	coverageAvailable: boolean;
	analyzed?: boolean;
	removed?: boolean;
	onClose: () => void;
}) {
	const { theme } = useTheme();
	return <div role="region" aria-label="Selected file coverage"
		onKeyDown={(event) => {
			if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
		}}
		style={{ position: "absolute", inset: 0, zIndex: 1, overflowY: "auto", boxSizing: "border-box",
			padding: 16, background: theme.colors.background, color: theme.colors.text,
			border: `1px solid ${theme.colors.border}`, borderRadius: 8, fontSize: theme.fontSizes[1] }}>
		<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
			<h4 style={{ margin: 0, fontSize: theme.fontSizes[1] }}>File details</h4>
			<button type="button" autoFocus aria-label="Close file details" onClick={onClose}
				style={{ padding: "5px 10px", cursor: "pointer", borderRadius: 5, border: `1px solid ${theme.colors.border}`,
					background: theme.colors.background, color: theme.colors.text }}>Close</button>
		</div>
		<ConstructTimelineFileDetails file={file} coverageAvailable={coverageAvailable} analyzed={analyzed} removed={removed} />
	</div>;
}

export function ConstructTimelineFileDetails({ file, coverageAvailable, analyzed, removed }: {
	file: ConstructTimelineFileSnapshot["files"][number];
	coverageAvailable: boolean;
	analyzed?: boolean;
	removed?: boolean;
}) {
	const { theme } = useTheme();
	const declarations = file.coverage?.declarations;
	if (removed) return <><strong>{file.path}</strong><p>Removed in this commit.</p><p>{file.kind} · {file.size.toLocaleString()} bytes before removal</p></>;
	return <>
		<strong>{file.path}</strong>
		<p>{analyzed === false ? "Not analyzed" : TIMELINE_FILE_STYLES[file.status].label} · {file.kind} · {file.size.toLocaleString()} bytes</p>
		{analyzed === false && <p>This Git snapshot has not been analyzed. No declaration verification evidence is available.</p>}
		{file.coverage && <p>{file.coverage.verified} verified · {file.coverage.unresolved} unresolved · {file.coverage.unsupported} unsupported · {file.coverage.error} errors</p>}
		{analyzed !== false && (!file.coverage || file.status === "unsupported") && <p>{timelineFileExplanation(file, coverageAvailable)}</p>}
		{file.coverage && !declarations && <p role="status">
			This commit saved counts only. Individual declaration outcomes were not recorded. Reanalysis is required to show them.
		</p>}
		{declarations && declarations.length > 0 && <>
			<h4>Declaration verification</h4>
			<ul aria-label="Declaration verification outcomes" style={{ margin: 0, paddingLeft: 20, maxHeight: 320, overflowY: "auto" }}>
				{declarations.map((declaration, index) => <li key={index} style={{ marginBottom: 12 }}>
					<strong style={{ color: TIMELINE_FILE_STYLES[declaration.status].color }}>{TIMELINE_FILE_STYLES[declaration.status].label}</strong>
					{" · "}<code>{declaration.symbol}</code>{declaration.construct ? ` · ${declaration.construct}` : ""}
					{declaration.status === "verified" && declaration.startLine != null && declaration.endLine != null
						? <div>Verified lines {declaration.startLine}–{declaration.endLine}</div>
						: declaration.graphStartLine != null ? <div>Graph candidate at line {declaration.graphStartLine} (unverified location)</div> : null}
					{declaration.evidence && <div style={{ color: theme.colors.textMuted ?? theme.colors.textSecondary }}>{declaration.evidence}</div>}
				</li>)}
			</ul>
		</>}
	</>;
}
