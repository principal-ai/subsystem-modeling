/** Versioned wire format for the bounded, local construct-history experiment. */
export const CONSTRUCT_HISTORY_DEFAULT_DAYS = 7;
export const CONSTRUCT_HISTORY_MAX_DAYS = 3650;
/**
 * Hard safety ceiling on a single run's commit selection (a pathological guard,
 * not a product limit). The UI warns above {@link CONSTRUCT_HISTORY_WARN_COMMITS}
 * but never blocks; the time and disk budgets are the real bound and the run
 * checkpoints so it can be resumed.
 */
export const CONSTRUCT_HISTORY_MAX_COMMITS = 50_000;
/** Soft threshold where the UI warns that a run is long and the report is large. */
export const CONSTRUCT_HISTORY_WARN_COMMITS = 500;

export interface ConstructHistoryOptions {
	/** UTC calendar days ending at until, or at the selected tip's commit date. */
	days?: number;
	/** Legacy commit-count selection, retained for existing checkpoints and scripts. */
	maxCommits?: number;
	maxMinutes: number;
	maxDiskMb: number;
	/** Exclusive lower revision, when supplied. */
	baseRef?: string;
	/** Inclusive upper revision; defaults to the source checkout's HEAD. */
	tipRef?: string;
	since?: string;
	until?: string;
}

/** Inclusive UTC calendar range; independent of the machine's date/time zone. */
export function constructHistoryDayRange(days: number, endDate: string): { since: string; until: string } {
	if (!Number.isInteger(days) || days < 1 || days > CONSTRUCT_HISTORY_MAX_DAYS) {
		throw new Error(`Choose 1–${CONSTRUCT_HISTORY_MAX_DAYS} days.`);
	}
	const end = new Date(endDate);
	if (!Number.isFinite(end.getTime())) throw new Error("Invalid history end date.");
	const until = end.toISOString().slice(0, 10);
	end.setUTCHours(0, 0, 0, 0);
	end.setUTCDate(end.getUTCDate() - days + 1);
	return { since: end.toISOString().slice(0, 10), until };
}

export interface ConstructHistoryTarget {
	id: string;
	name: string;
	file: string;
	symbol: string;
	construct?: string;
}

export interface ConstructHistoryObservation {
	targetId: string;
	status: "matched" | "unresolved" | "absent" | "not-traced";
	/** Only the first source-confirmed absence establishes an introduction. */
	absence?: "confirmed";
	/** Name-independent declaration fingerprint, used only to reject possible renames. */
	declarationShapeHash?: string;
	file?: string;
	symbol?: string;
	startLine?: number;
	endLine?: number;
	contentHash?: string;
	/** Why this observation was linked, or why it could not be linked. */
	evidence: string;
}

export interface ConstructHistoryCommit {
	sha: string;
	committedAt: string;
	subject: string;
	/**
	 * Per-target trace. Optional: a running run's progress payload omits it to
	 * keep the RPC response small; it is present once the run finishes.
	 */
	observations?: ConstructHistoryObservation[];
	/**
	 * Graph-level identity changes against the immediate first parent: a
	 * candidate present before and absent now is `removed`, the reverse is
	 * `introduced`. Permissive and unclassified — a rename, move or split shows
	 * as an introduction plus a removal until a later pass separates them.
	 */
	transitions?: ConstructHistoryTransition[];
	/**
	 * Graph census size at this commit: source-located code candidates in
	 * parser-supported files. A size proxy, not a verified declaration count.
	 */
	constructs?: number;
	/** Verification coverage at this commit; graph runs with introduction detection only. */
	coverage?: { verified: number; unresolved: number; unsupported: number; error: number };
	timing: {
		checkoutMs: number;
		extractMs: number;
		matchMs: number;
		totalMs: number;
	};
	graphBytes: number;
	graphGzipBytes: number;
	nodeCount: number;
	edgeCount: number;
}

/** Appearance or removal of a graph candidate identity between adjacent snapshots. */
export interface ConstructHistoryTransition {
	kind: "introduced" | "removed";
	file: string;
	symbol: string;
}

export type ConstructHistoryBudgetExceeded =
	| { kind: "time"; measuredMs: number; limitMs: number }
	| { kind: "disk"; measuredBytes: number; limitBytes: number };

export interface ConstructHistoryRun {
	version: 1;
	analyzerVersion: string;
	graphifyVersion?: string;
	id: string;
	purl: string;
	status: "running" | "completed" | "cancelled" | "budget-exceeded" | "failed" | "interrupted";
	startedAt: string;
	updatedAt: string;
	options: ConstructHistoryOptions;
	targets: ConstructHistoryTarget[];
	/** Absent in legacy model-backed checkpoints; their original targets remain pinned. */
	targetScope?: "graph" | "provided";
	/** Older checkpoints retain their original matching semantics on resume. */
	introductionDetection?: 1;
	/** Set on runs that record graph-level entries/exits. Absent in older checkpoints. */
	transitionsRecorded?: 1;
	/** Discovery/verification coverage at the newest selected historical snapshot. */
	inventory?: {
		commit: string;
		verified: number;
		unresolved: number;
		unsupported: number;
		error: number;
	};
	/** Pinned newest-first first-parent sequence. Never resampled on resume. */
	commits: Array<{ sha: string; committedAt: string; subject: string; firstParent?: string }>;
	/** Newest first. A completed prefix of commits. */
	results: ConstructHistoryCommit[];
	sourceHead?: string;
	/** Pinned inclusive UTC bounds for a day-based selection. */
	dateRange?: { since: string; until: string };
	/** Metadata-only progress; source and full graphs are not persisted here. */
	phase: string;
	error?: string;
	/** Snapshot of the first limit reached. Absent in older checkpoints. */
	budgetExceeded?: ConstructHistoryBudgetExceeded;
	elapsedMs: number;
	prepareMs: number;
	repositoryReused: boolean;
	repositoryBytes: number;
	peakDiskBytes: number;
	retainedBytes: number;
	/** Slim payloads only: per-target summaries so the list works without observations. */
	changed?: ConstructHistoryChange[];
	/** Slim payloads only: per-target traces were omitted to keep the payload small. */
	tracesOmitted?: 1;
}

export function constructHistoryBudgetLabel(run: Pick<ConstructHistoryRun, "budgetExceeded">): string {
	return run.budgetExceeded?.kind === "time" ? "Time budget exceeded"
		: run.budgetExceeded?.kind === "disk" ? "Disk budget exceeded"
		: "Budget exceeded (reason not recorded)";
}

export function constructHistoryBudgetMessage(run: Pick<ConstructHistoryRun, "budgetExceeded">): string {
	const budget = run.budgetExceeded;
	if (!budget) {
		return "This older checkpoint did not record which budget was exceeded. Completed commits are saved; adjust budgets and resume to continue.";
	}
	if (budget.kind === "time") {
		const duration = (ms: number) => ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${(ms / 60_000).toFixed(1)} min`;
		return `Time budget exceeded: ${duration(budget.measuredMs)} elapsed this attempt (limit: ${duration(budget.limitMs)}). Completed commits are saved; increase Minutes per attempt and resume.`;
	}
	const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;
	return `Disk budget exceeded: analysis directory used ${mb(budget.measuredBytes)} (limit: ${mb(budget.limitBytes)}). Includes the managed clone, report, and temporary output, not just the report. Completed commits are saved; increase Disk budget and resume.`;
}

export interface ConstructHistorySummary {
	matchedCommits: number;
	unresolvedCommits: number;
	absentCommits: number;
	untracedCommits: number;
	comparableTransitions: number;
	changes: number;
	/** Newest observed transition, not necessarily the construct's all-time last change. */
	lastChangedAt?: string;
	introducedAt?: string;
	introducedCommit?: string;
}

function emptySummary(): ConstructHistorySummary {
	return { matchedCommits: 0, unresolvedCommits: 0, absentCommits: 0, untracedCommits: 0, comparableTransitions: 0, changes: 0 };
}

/** One pass; never bridge gaps, compare creation to a hash, or lose reversions. */
export function summarizeConstructHistories(run: Pick<ConstructHistoryRun, "results">): Map<string, ConstructHistorySummary> {
	const summaries = new Map<string, ConstructHistorySummary>();
	let newer = new Map<string, { hash: string; date: string; sha: string }>();
	for (const result of run.results) {
		const current = new Map<string, { hash: string; date: string; sha: string }>();
		for (const observation of result.observations ?? []) {
			let summary = summaries.get(observation.targetId);
			if (!summary) {
				summary = emptySummary();
				summaries.set(observation.targetId, summary);
			}
			const previous = newer.get(observation.targetId);
			if (observation.status === "not-traced") {
				summary.untracedCommits++;
			} else if (observation.status === "absent") {
				summary.absentCommits++;
				if (previous && observation.absence === "confirmed") {
					summary.introducedAt = previous.date;
					summary.introducedCommit = previous.sha;
				}
			} else if (observation.status === "matched" && observation.contentHash) {
				summary.matchedCommits++;
				if (previous) {
					summary.comparableTransitions++;
					if (previous.hash !== observation.contentHash) {
						summary.changes++;
						summary.lastChangedAt ??= previous.date;
					}
				}
				current.set(observation.targetId, { hash: observation.contentHash, date: result.committedAt, sha: result.sha });
			}
		}
		newer = current;
	}
	for (const summary of summaries.values()) {
		summary.unresolvedCommits = run.results.length - summary.matchedCommits - summary.absentCommits - summary.untracedCommits;
	}
	return summaries;
}

export function summarizeConstructHistory(run: Pick<ConstructHistoryRun, "results">, targetId: string): ConstructHistorySummary {
	return summarizeConstructHistories(run).get(targetId) ?? { ...emptySummary(), unresolvedCommits: run.results.length };
}

export type ConstructHistoryClassification = "introduced" | "modified" | "introduced-and-modified" | "no-observed-changes" | "unknown";

/**
 * Per-target change summary. Present on slim payloads (observations omitted) so
 * the changed-construct list still works without shipping every trace row.
 */
export interface ConstructHistoryChange {
	id: string;
	file: string;
	symbol: string;
	construct?: string;
	changes: number;
	introducedAt?: string;
	introducedCommit?: string;
	lastChangedAt?: string;
	unresolvedCommits: number;
	classification: ConstructHistoryClassification;
	/** Newest matched observation, so a row can render and read its span. */
	snapshot?: { sha: string; file: string; startLine: number; endLine: number; contentHash: string };
}

export function classifyConstructHistory(summary: ConstructHistorySummary, complete = true): ConstructHistoryClassification {
	if (summary.introducedAt) return summary.changes ? "introduced-and-modified" : "introduced";
	if (summary.changes) return "modified";
	return complete && summary.comparableTransitions > 0 && !summary.unresolvedCommits ? "no-observed-changes" : "unknown";
}

/** Introduced and modified totals overlap; `both` makes that overlap explicit. */
export function constructHistoryTotals(run: ConstructHistoryRun) {
	const totals = { introduced: 0, modified: 0, both: 0, noObservedChanges: 0, unknown: 0 };
	const summaries = summarizeConstructHistories(run);
	for (const target of run.targets) {
		const classification = classifyConstructHistory(summaries.get(target.id) ?? emptySummary(), run.status === "completed");
		if (classification === "introduced" || classification === "introduced-and-modified") totals.introduced++;
		if (classification === "modified" || classification === "introduced-and-modified") totals.modified++;
		if (classification === "introduced-and-modified") totals.both++;
		if (classification === "no-observed-changes") totals.noObservedChanges++;
		if (classification === "unknown") totals.unknown++;
	}
	return totals;
}

export interface ConstructHistoryTransitionCommit {
	sha: string;
	committedAt: string;
	subject: string;
	introduced: number;
	removed: number;
	/** Tracked-target content-hash transitions attributed to this commit. */
	changed: number;
	/** Census size at this commit, when recorded. */
	constructs?: number;
}

/** A graph identity seen appearing and then removed inside the analyzed range. */
export interface ConstructHistoryLifetime {
	file: string;
	symbol: string;
	introducedCommit: string;
	introducedAt: string;
	removedCommit: string;
	removedAt: string;
	/** Adjacent first-parent steps between appearance and removal. */
	commits: number;
	/** Calendar time between the two commits. */
	elapsedMs: number;
}

export interface ConstructHistoryTransitionSummary {
	/** Newest first, matching `run.results`. */
	commits: ConstructHistoryTransitionCommit[];
	introduced: number;
	removed: number;
	/** Change events across tracked targets (adjacent matched fingerprints). */
	changed: number;
	/**
	 * Census size at the newest and oldest analyzed commit, when recorded, plus
	 * the newest commit's verified count when its coverage was measured.
	 */
	size?: { newest: number; oldest: number; verifiedNewest?: number };
	/**
	 * Closed appearances only: both the introduction and the removal fall inside
	 * the window. Constructs alive at either edge are censored and excluded.
	 */
	lifetimes: ConstructHistoryLifetime[];
	medianLifetimeCommits?: number;
	medianLifetimeMs?: number;
}

function median(values: number[]): number | undefined {
	if (!values.length) return undefined;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Counts graph-level transitions and closes the intervals where an identity was
 * both introduced and removed inside the window. No rename reconciliation: a
 * moved symbol is an introduction plus a removal, never a lifetime.
 */
export function summarizeConstructTransitions(
	run: Pick<ConstructHistoryRun, "results">,
): ConstructHistoryTransitionSummary {
	const counts = new Map<number, { introduced: number; removed: number; changed: number }>();
	const open = new Map<string, { file: string; symbol: string; index: number; committedAt: string; sha: string }>();
	const lifetimes: ConstructHistoryLifetime[] = [];
	let introduced = 0;
	let removed = 0;
	let changed = 0;
	// Matched fingerprints from the immediately older snapshot; a gap breaks
	// comparability, so this is rebuilt per commit like the target summarizer.
	let olderHashes = new Map<string, string>();
	// Oldest first: an appearance opens an interval before its removal closes it.
	for (let index = run.results.length - 1; index >= 0; index--) {
		const result = run.results[index]!;
		const tally = { introduced: 0, removed: 0, changed: 0 };
		for (const transition of result.transitions ?? []) {
			const key = `${transition.file}\0${transition.symbol}`;
			if (transition.kind === "introduced") {
				introduced++;
				tally.introduced++;
				open.set(key, { file: transition.file, symbol: transition.symbol, index, committedAt: result.committedAt, sha: result.sha });
				continue;
			}
			removed++;
			tally.removed++;
			const started = open.get(key);
			if (!started) continue;
			open.delete(key);
			lifetimes.push({
				file: transition.file, symbol: transition.symbol,
				introducedCommit: started.sha, introducedAt: started.committedAt,
				removedCommit: result.sha, removedAt: result.committedAt,
				commits: Math.abs(started.index - index),
				elapsedMs: Math.max(0, Date.parse(result.committedAt) - Date.parse(started.committedAt)),
			});
		}
		// Tracked-target source changes, attributed to this (the newer) commit.
		const newerHashes = new Map<string, string>();
		for (const observation of result.observations ?? []) {
			if (observation.status !== "matched" || !observation.contentHash) continue;
			const older = olderHashes.get(observation.targetId);
			if (older !== undefined && older !== observation.contentHash) {
				changed++;
				tally.changed++;
			}
			newerHashes.set(observation.targetId, observation.contentHash);
		}
		olderHashes = newerHashes;
		counts.set(index, tally);
	}
	const commits = run.results.map((result, index) => ({
		sha: result.sha, committedAt: result.committedAt, subject: result.subject,
		...(counts.get(index) ?? { introduced: 0, removed: 0, changed: 0 }),
		...(typeof result.constructs === "number" ? { constructs: result.constructs } : {}),
	}));
	lifetimes.sort((a, b) => a.introducedAt.localeCompare(b.introducedAt) || a.symbol.localeCompare(b.symbol));
	const newest = run.results[0];
	const oldest = run.results.at(-1);
	const size = newest?.constructs != null
		? {
			newest: newest.constructs,
			oldest: oldest?.constructs ?? newest.constructs,
			...(newest.coverage ? { verifiedNewest: newest.coverage.verified } : {}),
		}
		: undefined;
	return {
		commits, introduced, removed, changed, lifetimes,
		...(size ? { size } : {}),
		medianLifetimeCommits: median(lifetimes.map((lifetime) => lifetime.commits)),
		medianLifetimeMs: median(lifetimes.map((lifetime) => lifetime.elapsedMs)),
	};
}
