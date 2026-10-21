/**
 * Versioned wire format for the cumulative, repo-level construct timeline.
 *
 * The timeline is append-only: a forward walk from an epoch, a durable cursor,
 * and one compact event per commit. Extending it
 * only ever processes commits after the cursor, so the beginning is never
 * redone. Per-commit observations are not stored — only the transition lists,
 * the verified count, and coverage.
 */

export const CONSTRUCT_TIMELINE_ANALYZER = "construct-timeline-v1";
export const CONSTRUCT_TIMELINE_DEFAULT_COMMITS = 50;
export const CONSTRUCT_TIMELINE_MAX_COMMITS = 100_000;

export interface ConstructTimelineIdentity {
	file: string;
	symbol: string;
	construct?: string;
}

/** One commit's transitions, appended oldest -> newest. */
export interface ConstructTimelineEvent {
	sha: string;
	committedAt: string;
	subject: string;
	introduced: ConstructTimelineIdentity[];
	removed: ConstructTimelineIdentity[];
	changed: ConstructTimelineIdentity[];
	/** Source-verified declarations at this commit. */
	constructs: number;
	coverage: { verified: number; unresolved: number; unsupported: number; error: number };
	timing: { checkoutMs: number; extractMs: number; matchMs: number; totalMs: number };
}

export interface ConstructTimelineMeta {
	version: 1;
	analyzerVersion: string;
	purl: string;
	/** Newest analyzed commit; the next extension continues after it. */
	cursor?: { sha: string; committedAt: string };
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
	/** Cap commits processed in this call; the cursor resumes the rest. */
	maxCommits?: number;
	/** Wall-clock cap for this call; the cursor resumes the rest. */
	maxMinutes?: number;
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
