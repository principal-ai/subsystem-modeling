import type { SubsystemMaintenanceSnapshot } from "../shared/contract";
import {
	buildAuditFingerprint,
	loadSubsystemModelAudit,
	summarizeLanes,
} from "./audit-report-store";
import { assessSubsystemGraphifyReadiness } from "./graphify-store";
import { proposalCountsForRuns } from "./proposal-store";
import type { StoredSubsystemModel } from "./subsystem-model-store";
import { maintenanceRuns, type MaintenanceRunStore } from "./subsystem-maintenance-runs";

async function savedVerification(
	graph: StoredSubsystemModel,
): Promise<SubsystemMaintenanceSnapshot["verification"]> {
	try {
		const saved = await loadSubsystemModelAudit(graph.id);
		if (!saved || saved.graphId !== graph.id || saved.report.graphId !== graph.id) return null;
		if (!Number.isFinite(Date.parse(saved.report.checkedAt))) return null;
		const graphify = await assessSubsystemGraphifyReadiness(graph);
		const fingerprint = await buildAuditFingerprint({
			updatedAt: graph.updatedAt,
			components: graph.components,
			graphify,
		});
		return {
			checkedAt: saved.report.checkedAt,
			stale: fingerprint !== saved.fingerprint,
			lanes: summarizeLanes(saved.report, { hasTrails: (graph.trails?.length ?? 0) > 0 }),
		};
	} catch {
		return null;
	}
}

/** Saved evidence only: no audit, agent execution, maintenance or proposal action. */
export async function readMaintenanceSnapshot(
	graph: StoredSubsystemModel,
	opts: {
		store?: MaintenanceRunStore;
		readCounts?: typeof proposalCountsForRuns;
		readVerification?: typeof savedVerification;
		isRunning?: () => boolean;
	} = {},
): Promise<SubsystemMaintenanceSnapshot | null> {
	const store = opts.store ?? maintenanceRuns;
	// A new attempt may replace the head while evidence is loading. Never attach
	// the old attempt's counts to the replacement; retry against its own ids.
	for (let attempt = 0; attempt < 2; attempt++) {
		const snapshot = await store.latest(graph.id, { active: opts.isRunning?.() });
		if (!snapshot) return null;
		const [counts, verification] = await Promise.all([
			(opts.readCounts ?? proposalCountsForRuns)(graph.id, snapshot.stages.map((s) => s.runId)),
			(opts.readVerification ?? savedVerification)(graph),
		]);
		const updated = await store.evidence(graph.id, snapshot.sequence.id, {
			counts,
			verification,
			verifiedAtCommits: graph.verifiedAtCommits ?? null,
			expectedRevision: snapshot.revision,
		});
		if (updated) return updated;
	}
	return store.latest(graph.id, { active: opts.isRunning?.() });
}
