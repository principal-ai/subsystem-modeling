/**
 * Backfill `site` constructs on existing `calls` trail steps.
 *
 * `site` is now required for `calls`, and it is mechanically derivable from
 * the seam span: parse the caller file, take the innermost declaration that
 * contains the call line, and pin its full range. No agent judgment is needed.
 *
 * Dry-run by default. The CLI applies with `--apply`; the host endpoint passes
 * `apply: true`. Steps without a seam span, an unresolved repo, or a parser are
 * reported and left untouched (the audit keeps flagging them).
 */

import type {
	SubsystemSiteConstruct,
	SubsystemTrail,
	SubsystemTrailStep,
} from "../shared/contract";
import { enclosingDeclaration } from "./graph-constructs";
import { resolveRepoRootForPurl } from "./graphify-store";
import {
	getSubsystemModel,
	listSubsystemModels,
	updateSubsystemModel,
} from "./subsystem-model-store";

export type BackfillSiteStatus =
	| "backfilled"
	| "would-backfill"
	| "already"
	| "not-calls"
	| "no-span"
	| "no-repo"
	| "no-declaration"
	| "outside-seam"
	| "error";

export interface BackfillSiteStepReport {
	trailId: string;
	stepIndex: number;
	from: string;
	to: string;
	file: string;
	status: BackfillSiteStatus;
	/** Set when the step resolved to a site (even in a dry run). */
	site?: SubsystemSiteConstruct;
	/** True when the site is not housed by the `from` component. */
	outsideFrom?: boolean;
	message?: string;
}

export interface BackfillSiteModelReport {
	id: string;
	title: string;
	backfilled: number;
	skipped: number;
	steps: BackfillSiteStepReport[];
}

export interface BackfillSitesResult {
	ok: boolean;
	dryRun: boolean;
	models: BackfillSiteModelReport[];
	totals: {
		models: number;
		backfilled: number;
		skipped: number;
	};
	error?: string;
}

/** Does `outer` fully contain `inner`? */
function contains(
	outer: { startLine: number; endLine: number },
	inner: { startLine: number; endLine: number },
): boolean {
	return outer.startLine <= inner.startLine && inner.endLine <= outer.endLine;
}

/**
 * Resolve and pin one model's missing `calls` sites.
 *
 * `dryRun` uses the same resolution path but never writes.
 */
export async function backfillTrailSitesForModel(
	graphId: string,
	options: { dryRun?: boolean } = {},
): Promise<BackfillSiteModelReport | null> {
	const graph = await getSubsystemModel(graphId);
	if (!graph) return null;
	const dryRun = options.dryRun !== false;
	const trails: SubsystemTrail[] = [];
	let backfilled = 0;
	let skipped = 0;
	const reports: BackfillSiteStepReport[] = [];

	for (const trail of graph.trails ?? []) {
		let changed = false;
		const steps: SubsystemTrailStep[] = [];
		for (let stepIndex = 0; stepIndex < trail.steps.length; stepIndex++) {
			const step = trail.steps[stepIndex]!;
			const base: BackfillSiteStepReport = {
				trailId: trail.id,
				stepIndex,
				from: step.from,
				to: step.to,
				file: step.file,
				status: "already",
			};

			if (step.mechanism !== "calls") {
				reports.push({ ...base, status: "not-calls" });
				steps.push(step);
				continue;
			}
			if (step.site) {
				reports.push({ ...base, status: "already", site: step.site });
				steps.push(step);
				continue;
			}
			if (!step.span) {
				skipped++;
				reports.push({ ...base, status: "no-span" });
				steps.push(step);
				continue;
			}

			const repoRoot = step.purl?.trim()
				? resolveRepoRootForPurl(step.purl)
				: null;
			if (!repoRoot) {
				skipped++;
				reports.push({ ...base, status: "no-repo" });
				steps.push(step);
				continue;
			}

			try {
				const resolved = await enclosingDeclaration({
					repoRoot,
					file: step.file,
					line: step.span.startLine,
				});
				if (!resolved) {
					skipped++;
					reports.push({ ...base, status: "no-declaration" });
					steps.push(step);
					continue;
				}
				const site: SubsystemSiteConstruct = {
					symbol: resolved.symbol,
					span: {
						startLine: resolved.startLine,
						endLine: resolved.endLine,
						contentHash: resolved.contentHash,
					},
				};
				if (!contains(site.span, step.span)) {
					skipped++;
					reports.push({
						...base,
						status: "outside-seam",
						site,
						message: `site ${resolved.symbol} ${resolved.startLine}-${resolved.endLine} does not contain the seam ${step.span.startLine}-${step.span.endLine}`,
					});
					steps.push(step);
					continue;
				}

				const from = graph.components.find((c) => c.alias === step.from);
				const fromFile = from?.file?.trim();
				const outsideFrom =
					!!fromFile && fromFile !== step.file
						? true
						: !!from?.declarationSpan && !contains(from.declarationSpan, site.span);
				const next: SubsystemTrailStep = { ...step, site };
				steps.push(next);
				changed = true;
				backfilled++;
				reports.push({
					...base,
					status: dryRun ? "would-backfill" : "backfilled",
					site,
					...(outsideFrom ? { outsideFrom: true } : {}),
					...(outsideFrom
						? {
								message:
									"site is outside the from component — the mechanics may belong on a `uses` step or the caller may need modeling",
							}
						: {}),
				});
			} catch (err) {
				skipped++;
				reports.push({
					...base,
					status: "error",
					message: err instanceof Error ? err.message : String(err),
				});
				steps.push(step);
			}
		}
		trails.push(changed ? { ...trail, steps } : trail);
	}

	if (!dryRun && backfilled > 0) {
		await updateSubsystemModel(graph.id, { trails });
	}

	return {
		id: graph.id,
		title: graph.title,
		backfilled,
		skipped,
		steps: reports,
	};
}

/** Backfill one model, or every stored model when `graphId` is omitted. */
export async function backfillTrailSites(
	graphId: string | undefined,
	options: { dryRun?: boolean } = {},
): Promise<BackfillSitesResult> {
	const dryRun = options.dryRun !== false;
	if (graphId) {
		const model = await backfillTrailSitesForModel(graphId, { dryRun });
		if (!model) {
			return {
				ok: false,
				dryRun,
				models: [],
				totals: { models: 0, backfilled: 0, skipped: 0 },
				error: `unknown graph: ${graphId}`,
			};
		}
		return {
			ok: true,
			dryRun,
			models: [model],
			totals: {
				models: 1,
				backfilled: model.backfilled,
				skipped: model.skipped,
			},
		};
	}

	const entries = await listSubsystemModels();
	const models: BackfillSiteModelReport[] = [];
	for (const entry of entries) {
		try {
			const model = await backfillTrailSitesForModel(entry.id, { dryRun });
			if (model) models.push(model);
		} catch {
			// One unreadable model must not abort the batch.
		}
	}
	return {
		ok: true,
		dryRun,
		models,
		totals: {
			models: models.length,
			backfilled: models.reduce((n, m) => n + m.backfilled, 0),
			skipped: models.reduce((n, m) => n + m.skipped, 0),
		},
	};
}
