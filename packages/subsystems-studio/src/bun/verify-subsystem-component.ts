/**
 * Host-side verify for one subsystem component: filesystem + graphify anchor
 * + kind check (after exact anchor).
 *
 * The verification policy lives in the shared core audit layer. This module
 * supplies Studio's adapters (model store, augmentations, span promotion) and
 * keeps the Studio-only audit/fix orchestration.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import type {
	SubsystemComponent,
	SubsystemComponentVerificationResult,
	SubsystemModelAuditReport,
} from "../shared/contract";
import { buildSourceSpan, type SubsystemSourceSpan } from "./declaration-ref";
import {
	disposeSpanTreeCache,
	type SpanTreeCache,
} from "./span-derivation";
import type { GraphifyAuditProvider } from "../../../subsystems-core/src/audit/graphify-provider";
import {
	runSubsystemModelAudit,
	type AuditEngineDeps,
} from "../../../subsystems-core/src/audit/engine";
import {
	verifySubsystemComponent as verifyComponentCore,
	verifyVerdict,
	type VerifyComponentDeps,
} from "../../../subsystems-core/src/audit/verify/component";
import { createStudioGraphifyAuditProvider } from "./audit-graphify-provider";
import {
	findAcceptedConstructAugmentation,
	findAcceptedModuleAugmentation,
	findAcceptedSignatureAugmentation,
	findAcceptedCallSiteAugmentation,
	findAcceptedSpanAugmentation,
} from "./augmentation-store";
import { readC4ElementSet } from "./c4-element-store";
import { saveSubsystemModelAudit } from "./audit-report-store";
import {
	capturePurlCommits,
	referencedFilesClean,
	type PurlCommit,
} from "./purl-commits";
import { resolveCurrentGraphifySlot } from "./graphify-store";
import {
	declarationForSymbol,
	enclosingDeclaration,
} from "./graph-constructs";
import {
	getSubsystemModel,
	stampVerifiedCommits,
	updateSubsystemModel,
	verifyModelFiles,
} from "./subsystem-model-store";
import { adoptGraphifySignatureFixFromVerify } from "../../../subsystems-core/src/audit/fixes";

/**
 * Deterministic fixes and completeness predicates.
 *
 * These rules live in the shared core audit engine. This module re-exports them
 * and imports the ones the host verifier still applies.
 */
export {
	adoptGraphifyDeclarationRefFixFromVerify,
	adoptGraphifyFileFixFromVerify,
	adoptGraphifySignatureFixFromVerify,
	adoptTreeSitterSpanFixFromVerify,
	installedDependencyPackage,
	isAdoptableEmptyClaimedSignature,
	storeTypeStale,
	storeTypeUndeclared,
	verificationFailureDiagnostic,
	verificationUnavailableFinding,
	type InstalledDependency,
} from "../../../subsystems-core/src/audit/fixes";

export { verifyVerdict };

function buildDeclarationFromAdoptedSignature(
	component: SubsystemComponent,
	parameterTypes: string[],
	returnTypes: string[],
): NonNullable<SubsystemComponent["declaration"]> {
	const parameters = parameterTypes.map((type) => ({ type }));
	const returnType =
		returnTypes.length === 0
			? undefined
			: returnTypes.length === 1
				? returnTypes[0]
				: returnTypes.join(" | ");
	const existing = component.declaration;
	if (component.construct === "method") {
		const hostClass =
			existing &&
			existing.kind === "method" &&
			typeof existing.hostClass === "string"
				? existing.hostClass
				: "";
		return {
			kind: "method",
			hostClass,
			parameters,
			returnType,
		};
	}
	return {
		kind: "function",
		parameters,
		returnType,
	};
}

/** Studio adapters for the shared component verifier. */
const studioVerifyDeps: VerifyComponentDeps = {
	loadModel: async (graphId) => {
		const graph = await getSubsystemModel(graphId);
		if (!graph) return null;
		return { id: graph.id, components: graph.components };
	},
	updateComponents: async (graphId, components) => {
		await updateSubsystemModel(graphId, { components });
	},
	findAcceptedSpanAugmentation: (input) =>
		findAcceptedSpanAugmentation(input),
	findAcceptedConstructAugmentation: (input) =>
		findAcceptedConstructAugmentation(input),
	findAcceptedSignatureAugmentation: (input) =>
		findAcceptedSignatureAugmentation(input),
};

export async function verifySubsystemComponent(
	graphId: string,
	componentAlias: string,
	opts?: {
		dryRun?: boolean;
		graphifyProvider?: GraphifyAuditProvider;
		treeCache?: SpanTreeCache;
	},
): Promise<SubsystemComponentVerificationResult> {
	return verifyComponentCore(
		graphId,
		componentAlias,
		{
			dryRun: opts?.dryRun,
			graphifyProvider:
				opts?.graphifyProvider ?? createStudioGraphifyAuditProvider(),
			treeCache: opts?.treeCache,
		},
		studioVerifyDeps,
	);
}

export interface SubsystemModelVerificationSummary {
	graphId: string;
	title: string;
	checkedAt: string;
	total: number;
	tally: Record<string, number>;
	results: Array<{
		componentAlias: string;
		name?: string;
		construct?: string;
		file?: string;
		symbol?: string;
		verdict: string;
		detail?: string;
		cache?: { status?: string; purl?: string; repoRoot?: string };
		signature?: SubsystemComponentVerificationResult["signature"];
		constructInfo?: SubsystemComponentVerificationResult["construct"];
		anchorResolution?: string;
	}>;
}

/** Verify every component of a subsystem graph (host-side verify machinery). */
export async function verifySubsystemModel(
	graphId: string,
	opts?: { dryRun?: boolean; graphifyProvider?: GraphifyAuditProvider },
): Promise<
	| { ok: true; data: SubsystemModelVerificationSummary }
	| { ok: false; error: string }
> {
	const graph = await getSubsystemModel(graphId);
	if (!graph) return { ok: false, error: `unknown graph: ${graphId}` };

	const results: SubsystemModelVerificationSummary["results"] = [];
	const tally: Record<string, number> = {};
	const graphifyProvider = opts?.graphifyProvider ?? createStudioGraphifyAuditProvider();
	const treeCache: SpanTreeCache = new Map();
	for (const c of graph.components) {
		const r = await verifySubsystemComponent(graphId, c.alias, {
			...opts,
			graphifyProvider,
			treeCache,
		});
		const { category, detail } = verifyVerdict(r);
		tally[category] = (tally[category] ?? 0) + 1;
		results.push({
			componentAlias: c.alias,
			name: c.name,
			construct: c.construct,
			file: c.file,
			symbol: c.symbol,
			verdict: category,
			detail,
			cache: r.cache,
			signature: r.signature,
			constructInfo: r.construct,
			anchorResolution: r.anchor?.resolution,
		});
	}

	return {
		ok: true,
		data: {
			graphId,
			title: graph.title,
			checkedAt: new Date().toISOString(),
			total: results.length,
			tally,
			results,
		},
	};
}

/**
 * Promote accepted span augmentations into the model's `declarationSpan`.
 *
 * An accepted span augmentation is already confirmation-cleared (a human, or
 * Jev above the confidence bar) — pinning it onto the component is a sync, not
 * a fresh judgment. The audit is dry-run and never writes; without this pass a
 * model can lag the augmentation store indefinitely, showing no span even
 * though one was accepted. This is the non-dry-run counterpart to the promotion
 * in {@link captureDeclaration}.
 *
 * Anchor-independent by design: copying a stored
 * `[startLine, endLine, contentHash]` needs neither Graphify nor a parse, so a
 * component promotes even when Graphify cannot anchor it. Skips
 * external, custom-entity, and identity-less components, and components whose
 * stored span already matches. Returns the number of spans written.
 */
export async function promoteAcceptedDeclarationSpans(
	graphId: string,
	opts?: { storeRoot?: string },
): Promise<number> {
	const graph = await getSubsystemModel(graphId);
	if (!graph || graph.components.length === 0) return 0;

	const updates = new Map<string, SubsystemSourceSpan>();
	for (const component of graph.components) {
		if (component.construct === "external") continue;
		if (component.construct === "custom_entity") continue;
		if (!component.purl || !component.file || !component.symbol) continue;

		const aug = await findAcceptedSpanAugmentation({
			purl: component.purl,
			file: component.file,
			symbol: component.symbol,
			storeRoot: opts?.storeRoot,
		});
		const claim = aug?.claims.span;
		if (!claim) continue;

		const stored = component.declarationSpan;
		if (
			stored &&
			stored.startLine === claim.startLine &&
			stored.endLine === claim.endLine &&
			stored.contentHash === claim.contentHash
		) {
			continue;
		}
		updates.set(
			component.alias,
			buildSourceSpan({
				startLine: claim.startLine,
				endLine: claim.endLine,
				contentHash: claim.contentHash,
			}),
		);
	}

	if (updates.size === 0) return 0;
	await updateSubsystemModel(graphId, {
		components: graph.components.map((c) =>
			updates.has(c.alias) ? { ...c, declarationSpan: updates.get(c.alias) } : c,
		),
	});
	return updates.size;
}

/**
 * The deterministic span lane: apply the audit's just-computed span fixes.
 *
 * Two findings are "clear" enough to write without a human click, because the
 * audit already derived them exactly:
 *
 *  - `adopt_tree_sitter_span` — a grounded claim whose declaration tree-sitter
 *    pinned with every structural gate passing (class `trivial`).
 *  - `adopt_graphify_declaration_ref` — a content-preserving re-pin: the range
 *    shifted to Graphify's start still re-hashes to the stored `contentHash`,
 *    i.e. the construct moved intact.
 *
 * The spans ride on the report this pass already bundled, so applying them is a
 * write, not a new derivation — the caller applies them immediately, then
 * re-audits. Everything else (`ambiguous` / `unknown` derivations, file
 * relocate, signature fill) stays a staged one-click. Returns spans written.
 */
export async function applyDeterministicSpanFixes(
	graphId: string,
	report: SubsystemModelAuditReport,
): Promise<number> {
	const graph = await getSubsystemModel(graphId);
	if (!graph) return 0;

	const updates = new Map<string, SubsystemSourceSpan>();
	for (const finding of report.findings) {
		const fix = finding.fix;
		if (!fix || !finding.componentAlias) continue;
		if (
			fix.id !== "adopt_tree_sitter_span" &&
			fix.id !== "adopt_graphify_declaration_ref"
		) {
			continue;
		}
		const next = fix.declarationSpan;
		const alias = finding.componentAlias;
		const stored = graph.components.find((c) => c.alias === alias)?.declarationSpan;
		if (
			stored &&
			stored.startLine === next.startLine &&
			stored.endLine === next.endLine &&
			stored.contentHash === next.contentHash
		) {
			continue;
		}
		updates.set(alias, next);
	}

	if (updates.size === 0) return 0;
	await updateSubsystemModel(graphId, {
		components: graph.components.map((c) =>
			updates.has(c.alias) ? { ...c, declarationSpan: updates.get(c.alias) } : c,
		),
	});
	return updates.size;
}

/**
 * Dry-run deterministic audit focused on component currency: files exist,
 * symbols declare, declaration freshness, and (when graphify is ready)
 * construct/signature/anchor checks, plus mechanical process/module boundary
 * membership. Trail site affinity is intentionally omitted — that seam
 * check is heuristic and better suited to an agent pass.
 *
 * Always returns a per-component `checks` checklist so a clean run still shows
 * what was inspected.
 */
/**
 * Serialize audits host-wide.
 *
 * One audit pass parses full `graph.json` bundles per purl and holds them for
 * the whole pass. Running passes concurrently multiplies that working set
 * (measured: ~4.8 GB for one pass over 97 models, ~10.3 GB for 98 concurrent
 * audits) and the host never returns those pages, so repeated concurrency
 * ratchets the process toward an OOM kill — which dies with no JS error.
 * Audits are independent and idempotent, so queueing them costs latency but
 * bounds memory to one pass at a time.
 */
let auditQueue: Promise<unknown> = Promise.resolve();

/**
 * Report components that participate in no authored trail edge. This is an
 * informational modeling-quality finding, not a save-time validation error:
 * a standalone node may be intentional, but is worth a second look in a
 * subsystem graph whose purpose is to explain relationships.
 */
export { unconnectedComponentFindings } from "../../../subsystems-core/src/audit/trail";

function serializeAudit<T>(run: () => Promise<T>): Promise<T> {
	const result = auditQueue.then(run, run);
	// Keep the chain alive even when a run rejects, so one failure can never
	// wedge every later audit.
	auditQueue = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
}

export async function auditSubsystemModel(
	graphId: string,
	opts?: { graphifyProvider?: GraphifyAuditProvider },
): Promise<
	| { ok: true; report: SubsystemModelAuditReport; fingerprint: string }
	| { ok: false; error: string }
> {
	return serializeAudit(() => runAuditSubsystemModel(graphId, opts?.graphifyProvider));
}

async function runAuditSubsystemModel(
	graphId: string,
	graphifyProviderOverride?: GraphifyAuditProvider,
): Promise<
	| { ok: true; report: SubsystemModelAuditReport; fingerprint: string }
	| { ok: false; error: string }
> {
	const graphifyProvider =
		graphifyProviderOverride ?? createStudioGraphifyAuditProvider();

	// The audit policy lives in the shared core engine; this host supplies the
	// concrete adapters (model store, filesystem, Graphify, C4 store, provenance).
	const deps: AuditEngineDeps = {
		graphifyProvider,
		loadModel: async (id) => {
			const graph = await getSubsystemModel(id);
			if (!graph) return null;
			return {
				graphId: graph.id,
				title: graph.title,
				updatedAt: graph.updatedAt,
				components: graph.components,
				trails: graph.trails,
			};
		},
		verifyModelFiles: (model) => verifyModelFiles(model),
		verifyComponent: (id, componentAlias, opts) =>
			verifySubsystemComponent(id, componentAlias, {
				dryRun: true,
				graphifyProvider: opts.graphifyProvider,
				treeCache: opts.treeCache as SpanTreeCache,
			}),
		createSpanTreeCache: () => new Map() as SpanTreeCache,
		disposeSpanTreeCache: (cache) =>
			disposeSpanTreeCache(cache as SpanTreeCache),
		findAcceptedModuleAugmentation,
		findAcceptedCallSiteAugmentation,
		readC4Elements: (repoKey) => readC4ElementSet(repoKey),
		readFile: (repoRoot, file) =>
			fs.readFile(join(repoRoot, file), "utf8"),
		enclosingDeclaration,
		declarationForSymbol,
		resolveGraphifySlot: async (purl, options) => {
			const slot = await resolveCurrentGraphifySlot(purl, {
				repoRoot: options.repoRoot,
			});
			if (!slot) return null;
			return { slotKey: slot.slotKey, builtAt: slot.cached?.meta.builtAt };
		},
		persistReport: async (id, report, fingerprint) => {
			await saveSubsystemModelAudit(id, report, fingerprint);
		},
		referencedFilesClean,
		capturePurlCommits,
		stampVerifiedCommits: async (id, commits) => {
			await stampVerifiedCommits(id, commits as Record<string, PurlCommit>);
		},
		warn: (message, err) => console.warn(message, err),
	};

	return runSubsystemModelAudit(graphId, deps);
}

/**
 * Apply deterministic audit fix(es), then re-audit.
 * - `adopt_graphify_signature` — copy graphify named type bags into declaration
 * - `adopt_graphify_file` — update component.file from Graphify when claimed path missing
 * - `adopt_graphify_declaration_ref` — re-pin the span to Graphify's source_location (content-preserving move)
 * - `adopt_tree_sitter_span` — capture a fresh span from Graphify's start + a tree-sitter parse
 */
export async function applySubsystemModelAuditFix(opts: {
	graphId: string;
	fixId:
		| "adopt_graphify_signature"
		| "adopt_graphify_file"
		| "adopt_graphify_declaration_ref"
		| "adopt_tree_sitter_span";
	componentAlias?: string;
}): Promise<
	| {
			ok: true;
			applied: number;
			report: SubsystemModelAuditReport;
			fingerprint: string;
	  }
	| { ok: false; error: string }
> {
	if (
		opts.fixId !== "adopt_graphify_signature" &&
		opts.fixId !== "adopt_graphify_file" &&
		opts.fixId !== "adopt_graphify_declaration_ref" &&
		opts.fixId !== "adopt_tree_sitter_span"
	) {
		return { ok: false, error: `unknown fix: ${opts.fixId}` };
	}

	const graph = await getSubsystemModel(opts.graphId);
	if (!graph) return { ok: false, error: `unknown graph: ${opts.graphId}` };

	const targetAliases = opts.componentAlias
		? [opts.componentAlias]
		: graph.components.map((c) => c.alias);

	if (opts.fixId === "adopt_graphify_file") {
		const fileUpdates = new Map<string, string>();

		for (const componentAlias of targetAliases) {
			const component = graph.components.find((c) => c.alias === componentAlias);
			if (!component) {
				if (opts.componentAlias) {
					return { ok: false, error: `unknown component: ${componentAlias}` };
				}
				continue;
			}

			const verified = await verifySubsystemComponent(opts.graphId, componentAlias, {
				dryRun: true,
			});
			if (!verified.fileSuggest?.file) {
				if (opts.componentAlias) {
					return {
						ok: false,
						error:
							"no unique Graphify file relocate (file may exist, or symbol is missing/ambiguous in Graphify)",
					};
				}
				continue;
			}
			fileUpdates.set(componentAlias, verified.fileSuggest.file);
		}

		if (fileUpdates.size === 0) {
			return { ok: false, error: "no adoptable file relocates found" };
		}

		const components = graph.components.map((c) => {
			const file = fileUpdates.get(c.alias);
			if (!file) return c;
			return {
				...c,
				file,
				// Old pin is for the previous path; clear so next audit re-captures.
				declarationSpan: undefined,
			};
		});

		const updated = await updateSubsystemModel(opts.graphId, { components });
		if (!updated) {
			return { ok: false, error: `failed to update graph: ${opts.graphId}` };
		}

		const audited = await auditSubsystemModel(opts.graphId);
		if (!audited.ok) return { ok: false, error: audited.error };
		return {
			ok: true,
			applied: fileUpdates.size,
			report: audited.report,
			fingerprint: audited.fingerprint,
		};
	}

	if (opts.fixId === "adopt_graphify_declaration_ref") {
		const spanUpdates = new Map<string, SubsystemSourceSpan>();

		for (const componentAlias of targetAliases) {
			const component = graph.components.find((c) => c.alias === componentAlias);
			if (!component) {
				if (opts.componentAlias) {
					return { ok: false, error: `unknown component: ${componentAlias}` };
				}
				continue;
			}

			const verified = await verifySubsystemComponent(opts.graphId, componentAlias, {
				dryRun: true,
			});
			const decl = verified.declaration;
			const repin = decl?.repin;
			const canRepin =
				decl?.freshness === "stale" &&
				verified.anchor?.resolution === "exact" &&
				repin != null;
			if (!canRepin || !repin) {
				if (opts.componentAlias) {
					return {
						ok: false,
						error:
							"no Graphify declaration re-pin (need exact symbol match + content-preserving move)",
					};
				}
				continue;
			}
			spanUpdates.set(componentAlias, repin);
		}

		if (spanUpdates.size === 0) {
			return { ok: false, error: "no adoptable declaration re-pins found" };
		}

		const components = graph.components.map((c) => {
			const declarationSpan = spanUpdates.get(c.alias);
			if (!declarationSpan) return c;
			return { ...c, declarationSpan };
		});

		const updated = await updateSubsystemModel(opts.graphId, { components });
		if (!updated) {
			return { ok: false, error: `failed to update graph: ${opts.graphId}` };
		}

		const audited = await auditSubsystemModel(opts.graphId);
		if (!audited.ok) return { ok: false, error: audited.error };
		return {
			ok: true,
			applied: spanUpdates.size,
			report: audited.report,
			fingerprint: audited.fingerprint,
		};
	}

	if (opts.fixId === "adopt_tree_sitter_span") {
		const spanUpdates = new Map<string, SubsystemSourceSpan>();

		for (const componentAlias of targetAliases) {
			const component = graph.components.find((c) => c.alias === componentAlias);
			if (!component) {
				if (opts.componentAlias) {
					return { ok: false, error: `unknown component: ${componentAlias}` };
				}
				continue;
			}

			// Re-derive per component: the audit-time span may be stale, so the
			// fix is a hint — the write always uses a fresh parse.
			const verified = await verifySubsystemComponent(opts.graphId, componentAlias, {
				dryRun: true,
			});
			const decl = verified.declaration;
			const canCapture =
				decl?.freshness === "unanchored" &&
				decl.derivation?.class === "trivial" &&
				verified.anchor?.resolution === "exact" &&
				decl.derivation.span != null;
			if (!canCapture || !decl?.derivation?.span) {
				if (opts.componentAlias) {
					return {
						ok: false,
						error:
							"no derivable declaration span (need exact anchor + all structural gates passing)",
					};
				}
				continue;
			}
			spanUpdates.set(componentAlias, decl.derivation.span);
		}

		if (spanUpdates.size === 0) {
			return { ok: false, error: "no derivable declaration spans found" };
		}

		const components = graph.components.map((c) => {
			const declarationSpan = spanUpdates.get(c.alias);
			if (!declarationSpan) return c;
			return { ...c, declarationSpan };
		});

		const updated = await updateSubsystemModel(opts.graphId, { components });
		if (!updated) {
			return { ok: false, error: `failed to update graph: ${opts.graphId}` };
		}

		const audited = await auditSubsystemModel(opts.graphId);
		if (!audited.ok) return { ok: false, error: audited.error };
		return {
			ok: true,
			applied: spanUpdates.size,
			report: audited.report,
			fingerprint: audited.fingerprint,
		};
	}

	const updates = new Map<string, NonNullable<SubsystemComponent["declaration"]>>();

	for (const componentAlias of targetAliases) {
		const component = graph.components.find((c) => c.alias === componentAlias);
		if (!component) {
			if (opts.componentAlias) {
				return { ok: false, error: `unknown component: ${componentAlias}` };
			}
			continue;
		}
		if (component.construct !== "function" && component.construct !== "method") {
			if (opts.componentAlias) {
				return {
					ok: false,
					error: `component ${componentAlias} is not a function/method`,
				};
			}
			continue;
		}

		const verified = await verifySubsystemComponent(opts.graphId, componentAlias, {
			dryRun: true,
		});
		if (!verified.ok && verified.code !== "signature_mismatch") {
			if (opts.componentAlias) {
				return {
					ok: false,
					error: verified.error ?? `verify failed for ${componentAlias}`,
				};
			}
			continue;
		}
		const sig = verified.signature;
		if (!sig) {
			if (opts.componentAlias) {
				return { ok: false, error: `no signature check for ${componentAlias}` };
			}
			continue;
		}
		const fix = adoptGraphifySignatureFixFromVerify(sig);
		if (!fix) {
			if (opts.componentAlias) {
				return {
					ok: false,
					error:
						"not an adoptable empty-claim signature mismatch (model already has named types, or graphify has none)",
				};
			}
			continue;
		}

		updates.set(
			componentAlias,
			buildDeclarationFromAdoptedSignature(
				component,
				fix.parameterTypes,
				fix.returnTypes,
			),
		);
	}

	if (updates.size === 0) {
		return { ok: false, error: "no adoptable signature fills found" };
	}

	const components = graph.components.map((c) => {
		const declaration = updates.get(c.alias);
		if (!declaration) return c;
		return {
			...c,
			declaration,
		};
	});

	const updated = await updateSubsystemModel(opts.graphId, { components });
	if (!updated) return { ok: false, error: `failed to update graph: ${opts.graphId}` };

	const audited = await auditSubsystemModel(opts.graphId);
	if (!audited.ok) return { ok: false, error: audited.error };
	return {
		ok: true,
		applied: updates.size,
		report: audited.report,
		fingerprint: audited.fingerprint,
	};
}
