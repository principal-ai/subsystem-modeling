/**
 * Versioned wire format for the cumulative, repo-level construct timeline.
 *
 * The timeline is append-only: a forward walk from an epoch, a durable cursor,
 * and one compact event per commit. Extending it
 * only ever processes commits after the cursor, so the beginning is never
 * redone. Full per-commit inventories are not stored — only transitions with
 * commit-qualified source spans, the verified count, and coverage.
 */

import { constructFileSupport } from "./construct-support";

export const CONSTRUCT_TIMELINE_ANALYZER = "construct-timeline-v2";
export const CONSTRUCT_TIMELINE_DEFAULT_COMMITS = 50;
export const CONSTRUCT_TIMELINE_MAX_COMMITS = 100_000;

/** One-based, inclusive source lines at a particular commit. */
export interface ConstructTimelineSpan {
	startLine: number;
	endLine: number;
	contentHash: string;
}

export interface ConstructTimelineEvidence {
	sha: string;
	span: ConstructTimelineSpan;
}

export interface ConstructTimelineIdentity {
	file: string;
	symbol: string;
	construct?: string;
	/** Optional only for legacy spanless events and absent transition sides. */
	before?: ConstructTimelineEvidence;
	after?: ConstructTimelineEvidence;
}

export interface ConstructTimelineDeclarationOutcome {
	symbol: string;
	construct?: string;
	status: "verified" | "unresolved" | "unsupported" | "error";
	/** Only verified declarations have source-confirmed line ranges. */
	startLine?: number;
	endLine?: number;
	/** Extractor-reported location, not a verified source span. */
	graphStartLine?: number;
	/** Controlled verifier diagnostic, never source text or raw CLI output. */
	evidence?: string;
}

export interface ConstructTimelineFileCoverage {
	file: string;
	verified: number;
	unresolved: number;
	unsupported: number;
	error: number;
	/** Absent in older count-only results. Includes unchanged candidates. */
	declarations?: ConstructTimelineDeclarationOutcome[];
}

export type ConstructTimelineFileStatus = "verified" | "partial" | "unresolved" | "unsupported" | "error" | "uncovered" | "non-code";

/** Git first-parent history, newest first, independent of analysis progress. */
export interface ConstructTimelineCommit {
	sha: string;
	committedAt: string;
	subject: string;
}

export interface ConstructTimelineFileSnapshot {
	sha: string;
	/** Read-only Git metadata, not analysis evidence or persisted timeline data. */
	message?: string;
	/** Relative to the first parent (empty tree for root commits). Renames are remove + add. */
	changes?: Array<{
		path: string;
		status: "added" | "modified" | "removed";
		/** Deleted buildings use their previous size/kind, never current coverage. */
		before?: { size: number; kind: "file" | "symlink" | "submodule" };
	}>;
	/** Explicit false for a Git-only preview; absent in legacy clients. */
	analyzed?: boolean;
	/** False for older events; never infer file coverage from transition lists. */
	coverageAvailable: boolean;
	extraction?: ConstructTimelineEvent["extraction"];
	files: Array<{
		path: string;
		size: number;
		kind: "file" | "symlink" | "submodule";
		status: ConstructTimelineFileStatus;
		coverage?: ConstructTimelineFileCoverage;
	}>;
}

export function timelineFileStatus(
	coverage?: ConstructTimelineFileCoverage,
	path?: string,
	kind: ConstructTimelineFileSnapshot["files"][number]["kind"] = "file",
): ConstructTimelineFileStatus {
	// Recorded results take precedence over today's parser capabilities.
	if (!coverage) {
		if (!path || kind !== "file") return "uncovered";
		const support = constructFileSupport(path);
		return support === "supported" ? "uncovered" : support;
	}
	if (coverage.verified) return coverage.error || coverage.unresolved || coverage.unsupported ? "partial" : "verified";
	if (coverage.error) return "error";
	if (coverage.unresolved) return "unresolved";
	if (coverage.unsupported) return "unsupported";
	return "uncovered";
}

/** Counts observed declaration candidates, not a claim of whole-file completeness. */
export function timelineFileCoverage(rows: readonly {
	file: string;
	symbol: string;
	construct?: string;
	graphStartLine?: number;
	span?: { startLine: number; endLine: number };
	verification: { status: ConstructTimelineDeclarationOutcome["status"]; evidence: string };
}[]): ConstructTimelineFileCoverage[] {
	const files = new Map<string, ConstructTimelineFileCoverage>();
	for (const row of rows) {
		let coverage = files.get(row.file);
		if (!coverage) {
			coverage = { file: row.file, verified: 0, unresolved: 0, unsupported: 0, error: 0, declarations: [] };
			files.set(row.file, coverage);
		}
		coverage[row.verification.status]++;
		const verified = row.verification.status === "verified";
		coverage.declarations!.push({
			symbol: row.symbol,
			status: row.verification.status,
			...(row.construct && row.construct !== "unknown" ? { construct: row.construct } : {}),
			...(verified && row.span ? { startLine: row.span.startLine, endLine: row.span.endLine } : {}),
			...(!verified && row.graphStartLine ? { graphStartLine: row.graphStartLine } : {}),
			...(!verified ? { evidence: row.verification.evidence } : {}),
		});
	}
	return [...files.values()].sort((a, b) => a.file.localeCompare(b.file));
}

/** One commit's transitions, appended oldest -> newest. */
export interface ConstructTimelineEvent {
	sha: string;
	committedAt: string;
	subject: string;
	introduced: ConstructTimelineIdentity[];
	removed: ConstructTimelineIdentity[];
	changed: ConstructTimelineIdentity[];
	/** Same content hash, different line range. Absent in legacy events. */
	relocated?: ConstructTimelineIdentity[];
	/** Source-verified declarations at this commit. */
	constructs: number;
	coverage: { verified: number; unresolved: number; unsupported: number; error: number };
	/** Per-file evidence for this commit, including unchanged declarations. */
	files?: ConstructTimelineFileCoverage[];
	/** An empty scan is not evidence that the repository contains no constructs. */
	extraction?: { status: "no-supported-code"; unclassifiedFiles: number; sensitiveFiles: number };
	timing: { checkoutMs: number; extractMs: number; matchMs: number; totalMs: number };
}

export interface ConstructTimelineMeta {
	version: 1;
	analyzerVersion: string;
	purl: string;
	/** Newest analyzed commit; the next extension continues after it. */
	cursor?: { sha: string; committedAt: string };
	/** Live worker progress, not a saved analysis result or durable checkpoint. */
	processing?: { sha: string; committedAt: string };
	/** Oldest analyzed commit (the epoch). */
	epoch?: { sha: string; committedAt: string };
	status: "idle" | "running" | "interrupted" | "failed";
	error?: string;
	updatedAt: string;
	events: number;
	constructs: number;
	elapsedMs: number;
	retainedBytes: number;
}

export interface ConstructTimeline {
	meta: ConstructTimelineMeta;
	events: ConstructTimelineEvent[];
}

export interface ConstructTimelineOptions {
	/** Defaults to 50 only when no history period or runtime is selected. */
	maxCommits?: number;
	/** Optional wall-clock cap. Omitted means no time limit. */
	maxMinutes?: number;
	/** Advance through the next UTC day/week/calendar month of history. */
	historyPeriod?: "day" | "week" | "month";
}

/** Select a contiguous oldest-first prefix, never skip commits to match dates. */
export function selectTimelineExtensionCommits<T extends { committedAt: string }>(
	commits: readonly T[], options: ConstructTimelineOptions,
): T[] {
	const maxCommits = options.maxCommits ?? (options.historyPeriod || options.maxMinutes !== undefined
		? Infinity : CONSTRUCT_TIMELINE_DEFAULT_COMMITS);
	const pending = commits.slice(0, maxCommits);
	if (!options.historyPeriod || !pending.length) return pending;
	const end = new Date(pending[0]!.committedAt);
	if (!Number.isFinite(end.getTime())) throw new Error("History contains an invalid commit date.");
	end.setUTCHours(0, 0, 0, 0);
	if (options.historyPeriod === "month") {
		const day = end.getUTCDate();
		end.setUTCMonth(end.getUTCMonth() + 1, 1);
		const lastDay = new Date(end);
		lastDay.setUTCMonth(end.getUTCMonth() + 1, 0);
		end.setUTCDate(Math.min(day, lastDay.getUTCDate()));
	} else {
		end.setUTCDate(end.getUTCDate() + (options.historyPeriod === "week" ? 7 : 1));
	}
	const boundary = pending.findIndex((commit) => {
		const date = Date.parse(commit.committedAt);
		if (!Number.isFinite(date)) throw new Error("History contains an invalid commit date.");
		return date >= end.getTime();
	});
	return boundary < 0 ? pending : pending.slice(0, boundary);
}

export interface ConstructTimelineSummary {
	/**
	 * Newest first for the transition charts.
	 */
	commits: Array<{
		sha: string; committedAt: string; subject: string;
		introduced: number; removed: number; changed: number; constructs?: number;
	}>;
	introduced: number;
	removed: number;
	changed: number;
	/** Verified census at the newest and oldest analyzed commit. */
	size?: { newest: number; oldest: number; verifiedNewest?: number };
	/** Closed intervals: introduced and later removed inside the timeline. */
	lifetimes: Array<{
		file: string; symbol: string;
		introducedCommit: string; introducedAt: string;
		removedCommit: string; removedAt: string;
		commits: number; elapsedMs: number;
	}>;
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
 * Counts transitions and closes lifetimes over the stored (oldest-first) events,
 * returning the newest-first summary shape the transition charts expect.
 */
export function summarizeConstructTimeline(
	events: readonly ConstructTimelineEvent[],
): ConstructTimelineSummary {
	const open = new Map<string, { file: string; symbol: string; index: number; committedAt: string; sha: string }>();
	const lifetimes: ConstructTimelineSummary["lifetimes"] = [];
	let introduced = 0;
	let removed = 0;
	let changed = 0;
	// Oldest first: an appearance opens an interval before its removal closes it.
	const oldestFirst = events.map((event, index) => {
		introduced += event.introduced.length;
		removed += event.removed.length;
		changed += event.changed.length;
		for (const identity of event.introduced) {
			open.set(`${identity.file}\0${identity.symbol}`, {
				file: identity.file, symbol: identity.symbol,
				index, committedAt: event.committedAt, sha: event.sha,
			});
		}
		for (const identity of event.removed) {
			const key = `${identity.file}\0${identity.symbol}`;
			const started = open.get(key);
			if (!started) continue;
			open.delete(key);
			lifetimes.push({
				file: identity.file, symbol: identity.symbol,
				introducedCommit: started.sha, introducedAt: started.committedAt,
				removedCommit: event.sha, removedAt: event.committedAt,
				commits: Math.abs(index - started.index),
				elapsedMs: Math.max(0, Date.parse(event.committedAt) - Date.parse(started.committedAt)),
			});
		}
		return {
			sha: event.sha, committedAt: event.committedAt, subject: event.subject,
			introduced: event.introduced.length, removed: event.removed.length,
			changed: event.changed.length, constructs: event.constructs,
		};
	});
	lifetimes.sort((a, b) => a.introducedAt.localeCompare(b.introducedAt) || a.symbol.localeCompare(b.symbol));
	const oldest = events[0];
	const newest = events.at(-1);
	return {
		commits: oldestFirst.reverse(), introduced, removed, changed,
		...(oldest && newest ? {
			size: {
				newest: newest.constructs, oldest: oldest.constructs,
				...(newest.coverage ? { verifiedNewest: newest.coverage.verified } : {}),
			},
		} : {}),
		lifetimes,
		medianLifetimeCommits: median(lifetimes.map((lifetime) => lifetime.commits)),
		medianLifetimeMs: median(lifetimes.map((lifetime) => lifetime.elapsedMs)),
	};
}
