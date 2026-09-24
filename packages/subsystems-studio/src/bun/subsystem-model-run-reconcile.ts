/**
 * Reconcile orphaned Maintain run-log entries.
 *
 * A run's OpenCode session lives on the separate OpenCode server and does NOT
 * end when the Studio host restarts — but the host's polling loop does. So the
 * run-log row is left stuck at `running` forever. On startup (and periodically)
 * this probes each untracked running run's session and closes it:
 *
 *   finished → done
 *   missing  → error (the server no longer knows the session)
 *   running / unknown → left as-is (it may still be going, or the server is down)
 *
 * Runs the host is actively tracking (`trackedGraphIds`) are skipped — their
 * own runner will close them.
 */

import {
	listSubsystemModelRuns,
	noteSubsystemModelRunFinish,
} from "./subsystem-model-runs";
import { resolveOpencodeConnection } from "./server-sessions";
import { probeSessionFinished } from "./opencode-v2-live";

export async function reconcileOrphanedRuns(opts?: {
	trackedGraphIds?: ReadonlySet<string>;
}): Promise<{ checked: number; closed: number; closedGraphIds: string[] }> {
	const tracked = opts?.trackedGraphIds;
	const running = (await listSubsystemModelRuns({ limit: 500 })).filter(
		(r) => r.status === "running" && !(tracked?.has(r.graphId) ?? false),
	);
	if (running.length === 0) {
		return { checked: 0, closed: 0, closedGraphIds: [] };
	}

	const connection = resolveOpencodeConnection();
	const closedGraphIds: string[] = [];

	for (const run of running) {
		let outcome: "done" | "error" | null = null;
		let error: string | undefined;

		if (!run.sessionId) {
			// Never got a session — it never really started.
			outcome = "error";
			error = "run never started (no OpenCode session)";
		} else if (connection) {
			const probe = await probeSessionFinished(connection, run.sessionId);
			if (probe === "finished") {
				outcome = "done";
			} else if (probe === "missing") {
				outcome = "error";
				error = "OpenCode session no longer exists";
			}
			// running / unknown → leave it for the next pass.
		}

		if (!outcome) continue;
		try {
			await noteSubsystemModelRunFinish({
				graphId: run.graphId,
				graphTitle: run.graphTitle,
				runId: run.id,
				sessionId: run.sessionId,
				status: outcome,
				ok: outcome === "done",
				error,
				summary:
					run.summary ??
					"Reconciled after Studio restart (run was orphaned)",
				endedAt: new Date().toISOString(),
			});
			closedGraphIds.push(run.graphId);
		} catch {
			// best-effort — leave the entry for the next pass
		}
	}

	return {
		checked: running.length,
		closed: closedGraphIds.length,
		closedGraphIds,
	};
}
