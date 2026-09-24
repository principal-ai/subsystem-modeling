/**
 * Persisted Maintain run log — the durable `sessionId` -> `graphId`
 * association for a subsystem model.
 *
 * Layout: `~/.principal/subsystem-model-runs/<graphId>.json`
 *
 *   { version: 1, graphId, runs: SubsystemModelRun[] }   // newest first
 *
 * The OpenCode session id is minted by the session-create POST and handed back
 * to the host; the graph id is already in hand when the run starts. This log is
 * the only place that pairing outlives the process, so recent run history can
 * be scoped back to a model (the live feed's copy is memory-only).
 */

import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SubsystemModelRun } from "../shared/contract";

const ROOT = join(homedir(), ".principal", "subsystem-model-runs");
const MAX_RUNS_PER_MODEL = 50;

interface RunsFile {
	version: 1;
	graphId: string;
	runs: SubsystemModelRun[];
}

/** Directory the run log lives in (overridable per-call for tests). */
export function subsystemModelRunsDir(): string {
	return ROOT;
}

function runPath(graphId: string, root: string): string {
	return join(root, `${graphId}.json`);
}

async function readRunsFile(
	graphId: string,
	root: string,
): Promise<SubsystemModelRun[]> {
	try {
		const raw = await fs.readFile(runPath(graphId, root), "utf8");
		const parsed = JSON.parse(raw) as RunsFile;
		if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.runs)) return [];
		return parsed.runs;
	} catch {
		return [];
	}
}

async function writeRunsFile(
	graphId: string,
	runs: SubsystemModelRun[],
	root: string,
): Promise<void> {
	await fs.mkdir(root, { recursive: true });
	const record: RunsFile = { version: 1, graphId, runs };
	await fs.writeFile(
		runPath(graphId, root),
		`${JSON.stringify(record, null, 2)}\n`,
		"utf8",
	);
}

/**
 * Record a run the moment OpenCode hands back a session id — this is the
 * `sessionId` -> `graphId` association write.
 */
export async function noteSubsystemModelRunStart(opts: {
	graphId: string;
	graphTitle?: string;
	/** OpenCode session id from the create response. */
	sessionId: string;
	/**
	 * The run's durable id (stamped into the agent brief and onto every
	 * proposal it posts). Use it as the log entry id so proposals join back to
	 * the run; falls back to a fresh uuid when absent.
	 */
	runId?: string;
	agent?: string;
	layer?: SubsystemModelRun["layer"];
	mode?: SubsystemModelRun["mode"];
	model?: string;
	startedAt?: string;
	root?: string;
}): Promise<SubsystemModelRun> {
	const root = opts.root ?? ROOT;
	const run: SubsystemModelRun = {
		id: opts.runId ?? randomUUID(),
		graphId: opts.graphId,
		graphTitle: opts.graphTitle ?? opts.graphId,
		sessionId: opts.sessionId,
		agent: opts.agent,
		layer: opts.layer,
		mode: opts.mode,
		model: opts.model,
		status: "running",
		startedAt: opts.startedAt ?? new Date().toISOString(),
	};
	const runs = await readRunsFile(opts.graphId, root);
	runs.unshift(run);
	await writeRunsFile(opts.graphId, runs.slice(0, MAX_RUNS_PER_MODEL), root);
	return run;
}

/**
 * Close out a run. Updates the entry created by {@link noteSubsystemModelRunStart}
 * (matched by `runId`, else `sessionId`); when neither exists — a skipped run or
 * a failure before the session was created — a finished entry is appended.
 */
export async function noteSubsystemModelRunFinish(opts: {
	graphId: string;
	graphTitle?: string;
	runId?: string;
	/** OpenCode session id, when one was created. */
	sessionId?: string;
	agent?: string;
	layer?: SubsystemModelRun["layer"];
	mode?: SubsystemModelRun["mode"];
	model?: string;
	status: "done" | "error" | "skipped";
	ok?: boolean;
	error?: string;
	summary?: string;
	pendingCount?: number;
	verdict?: SubsystemModelRun["verdict"];
	startedAt?: string;
	endedAt?: string;
	root?: string;
}): Promise<void> {
	const root = opts.root ?? ROOT;
	const endedAt = opts.endedAt ?? new Date().toISOString();
	const runs = await readRunsFile(opts.graphId, root);

	const patch: Partial<SubsystemModelRun> = {
		status: opts.status,
		endedAt,
		sessionId: opts.sessionId,
		agent: opts.agent,
		layer: opts.layer,
		mode: opts.mode,
		model: opts.model,
		ok: opts.ok,
		error: opts.error,
		summary: opts.summary,
		pendingCount: opts.pendingCount,
		verdict: opts.verdict,
	};

	let index = -1;
	if (opts.runId) index = runs.findIndex((r) => r.id === opts.runId);
	if (index < 0 && opts.sessionId) {
		index = runs.findIndex((r) => r.sessionId === opts.sessionId);
	}

	if (index >= 0) {
		const existing = runs[index];
		runs[index] = {
			...existing,
			...patch,
			// Keep the originally-recorded fields when the finish call omits them.
			sessionId: opts.sessionId ?? existing.sessionId,
			agent: opts.agent ?? existing.agent,
			model: opts.model ?? existing.model,
		} as SubsystemModelRun;
	} else {
		runs.unshift({
			id: opts.runId ?? randomUUID(),
			graphId: opts.graphId,
			graphTitle: opts.graphTitle ?? opts.graphId,
			...patch,
			startedAt: opts.startedAt ?? endedAt,
		} as SubsystemModelRun);
	}

	await writeRunsFile(opts.graphId, runs.slice(0, MAX_RUNS_PER_MODEL), root);
}

/** Runs for one model, or every model when `graphId` is omitted (newest first). */
export async function listSubsystemModelRuns(opts?: {
	graphId?: string;
	days?: number;
	limit?: number;
	root?: string;
}): Promise<SubsystemModelRun[]> {
	const root = opts?.root ?? ROOT;
	const limit = Math.max(1, Math.min(500, Math.floor(opts?.limit ?? 200)));
	const cutoff = opts?.days != null ? Date.now() - opts.days * 86_400_000 : null;

	let runs: SubsystemModelRun[];
	if (opts?.graphId) {
		runs = await readRunsFile(opts.graphId, root);
	} else {
		let files: string[];
		try {
			files = await fs.readdir(root);
		} catch {
			return [];
		}
		const perModel = await Promise.all(
			files
				.filter((f) => f.endsWith(".json"))
				.map((f) => readRunsFile(f.slice(0, -".json".length), root)),
		);
		runs = perModel.flat();
	}

	const filtered =
		cutoff == null
			? runs
			: runs.filter((r) => {
					const t = Date.parse(r.startedAt);
					return !Number.isFinite(t) || t >= cutoff;
				});

	return filtered
		.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
		.slice(0, limit);
}

export async function deleteSubsystemModelRuns(
	graphId: string,
	root: string = ROOT,
): Promise<void> {
	try {
		await fs.unlink(runPath(graphId, root));
	} catch {
		/* missing is fine */
	}
}
