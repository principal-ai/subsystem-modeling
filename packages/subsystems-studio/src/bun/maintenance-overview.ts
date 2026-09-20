/**
 * Pure aggregation behind the Maintain agent surface: fold per-model
 * verification rows into a single overview (sorted farthest-from-verified
 * first, with summed ledger totals). Kept IO-free so the host handler stays a
 * thin store/cache read and this is unit-testable.
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
