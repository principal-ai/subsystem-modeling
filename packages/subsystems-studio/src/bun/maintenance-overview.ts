/**
 * Pure aggregation behind the Maintain agent surface: fold per-model
 * verification rows into a single overview (models with pending proposals
 * first, then most-recently maintained, then farthest-from-verified, with
 * summed ledger totals). Kept IO-free so the host handler stays a thin
 * store/cache read and this is unit-testable.
 */

import type {
	MaintenanceOverview,
	MaintenanceOverviewModel,
	MaintenanceOverviewProposal,
} from "../shared/contract";

export function buildMaintenanceOverview(opts: {
	models: MaintenanceOverviewModel[];
	pendingProposals: MaintenanceOverviewProposal[];
	running: string[];
	auditing?: string[];
}): MaintenanceOverview {
	const models = [...opts.models].sort((a, b) => {
		// Actionable work first: models with pending proposals, then models with
		// a more recent Maintain run, then farthest-from-verified.
		const propA = a.pendingProposalCount > 0 ? 1 : 0;
		const propB = b.pendingProposalCount > 0 ? 1 : 0;
		if (propA !== propB) return propB - propA;
		const runA = a.recentRunAt ? Date.parse(a.recentRunAt) : Number.NaN;
		const runB = b.recentRunAt ? Date.parse(b.recentRunAt) : Number.NaN;
		const hasRunA = Number.isFinite(runA) ? 1 : 0;
		const hasRunB = Number.isFinite(runB) ? 1 : 0;
		if (hasRunA !== hasRunB) return hasRunB - hasRunA;
		if (Number.isFinite(runA) && Number.isFinite(runB) && runA !== runB) {
			return runB - runA;
		}
		const workA = a.open + a.blocking + a.blocked;
		const workB = b.open + b.blocking + b.blocked;
		if (workA !== workB) return workB - workA;
		if (a.coverage !== b.coverage) return a.coverage - b.coverage;
		return a.title.localeCompare(b.title);
	});

	const totals = models.reduce(
		(acc, m) => {
			acc.verified += m.verified;
			acc.open += m.open;
			acc.blocking += m.blocking;
			acc.blocked += m.blocked;
			acc.na += m.na;
			return acc;
		},
		{ verified: 0, open: 0, blocking: 0, blocked: 0, na: 0 },
	);

	const adjudicable = totals.verified + totals.open;
	const coverage =
		adjudicable > 0 ? totals.verified / adjudicable : totals.blocked > 0 ? 0 : 1;

	return {
		running: opts.running,
		auditing: opts.auditing ?? [],
		needsWork: models.filter((m) => m.open > 0 || m.blocking > 0).length,
		verified: models.filter((m) => m.verdict === "fully_verified").length,
		totals: { ...totals, coverage },
		models,
		pendingProposals: opts.pendingProposals,
	};
}
