/**
 * Host-side verify for one subsystem component: filesystem + graphify anchor
 * + kind check (after exact anchor).
 */

import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
	resolveComponentAnchor,
	findUniqueDefinitionBySymbol,
	type ComponentAnchorResult,
} from "../../../subsystems-react/src/graphify/anchor";
import { normalizeSourcePath } from "../../../subsystems-react/src/graphify/ids";
import { inferConstructFromGraphify, constructsMatch } from "../../../subsystems-react/src/graphify/construct";
import {
	compareSignatures,
	extractGraphifySignature,
} from "../../../subsystems-react/src/graphify/signature";
import type {
	GraphifyEdge,
	GraphifyNode,
} from "../../../subsystems-react/src/graphify/types";
import type {
	SubsystemComponent,
	SubsystemComponentVerificationResult,
	SubsystemModelAuditCheck,
	SubsystemModelAuditFinding,
	SubsystemModelAuditFix,
	SubsystemModelAuditReport,
} from "../shared/contract";
import {
	buildDeclarationRef,
	hashDeclarationLineFromContent,
	parseSourceLocation,
	type SubsystemDeclarationRef,
} from "./declaration-ref";
import { loadGraphifyGraph } from "./graphify-runner";
import {
	assessSubsystemGraphifyReadiness,
	ensureCurrentGraphifyCachesForModel,
	getCachedGraphifyGraph,
	resolveRepoRootForPurl,
} from "./graphify-store";
import {
	findAcceptedConstructAugmentation,
	findAcceptedSignatureAugmentation,
} from "./augmentation-store";
import {
	buildAuditFingerprint,
	saveSubsystemModelAudit,
} from "./audit-report-store";
import {
	getSubsystemModel,
	purlRepoKey,
	resolveRepoRootForComponent,
	updateSubsystemModel,
	verifyModelFiles,
} from "./subsystem-model-store";

/** Model has no named types; graphify has bags — safe deterministic fill. */
export function isAdoptableEmptyClaimedSignature(sig: {
	claimed: { parameterTypes: string[]; returnTypes: string[] };
	inferred: { parameterTypes: string[]; returnTypes: string[] };
}): boolean {
	const claimedEmpty =
		sig.claimed.parameterTypes.length === 0 &&
		sig.claimed.returnTypes.length === 0;
	const inferredHas =
		sig.inferred.parameterTypes.length > 0 ||
		sig.inferred.returnTypes.length > 0;
	return claimedEmpty && inferredHas;
}

export function adoptGraphifySignatureFixFromVerify(
	sig: NonNullable<SubsystemComponentVerificationResult["signature"]>,
): SubsystemModelAuditFix | undefined {
	if (!isAdoptableEmptyClaimedSignature(sig)) return undefined;
	return {
		id: "adopt_graphify_signature",
		label: "Adopt graphify signature types",
		parameterTypes: [...sig.inferred.parameterTypes],
		returnTypes: [...sig.inferred.returnTypes],
	};
}

export function adoptGraphifyFileFixFromVerify(
	component: { file?: string },
	suggest: NonNullable<SubsystemComponentVerificationResult["fileSuggest"]>,
): SubsystemModelAuditFix {
	return {
		id: "adopt_graphify_file",
		label: `Update file to ${suggest.file}`,
		file: suggest.file,
		previousFile: component.file,
	};
}

/** Exact Graphify anchor + drifted pin → one-click re-pin from current source_location. */
export function adoptGraphifyDeclarationRefFixFromVerify(
	component: { declarationRef?: SubsystemDeclarationRef },
	declaration: NonNullable<SubsystemComponentVerificationResult["declaration"]>,
	anchor: SubsystemComponentVerificationResult["anchor"],
): Extract<
	SubsystemModelAuditFix,
	{ id: "adopt_graphify_declaration_ref" }
> | undefined {
	if (declaration.freshness !== "stale") return undefined;
	if (anchor?.resolution !== "exact") return undefined;
	const repin = declaration.ref;
	if (
		!repin ||
		typeof repin.startLine !== "number" ||
		typeof repin.lineHash !== "string"
	) {
		return undefined;
	}
	const stored = component.declarationRef;
	if (
		stored &&
		stored.startLine === repin.startLine &&
		stored.lineHash === repin.lineHash
	) {
		return undefined;
	}
	return {
		id: "adopt_graphify_declaration_ref",
		label: `Re-pin declaration to Graphify L${repin.startLine}${
			stored ? ` (was L${stored.startLine})` : ""
		}`,
		declarationRef: repin,
		previousStartLine: stored?.startLine,
	};
}

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
	const callers =
		existing && existing.kind === "function" && Array.isArray(existing.callers)
			? existing.callers
			: [];
	const callees =
		existing && existing.kind === "function" && Array.isArray(existing.callees)
			? existing.callees
			: [];
	return {
		kind: "function",
		parameters,
		returnType,
		callers,
		callees,
	};
}

function mapAnchor(
	anchor: ComponentAnchorResult,
): NonNullable<SubsystemComponentVerificationResult["anchor"]> {
	return {
		resolution: anchor.resolution,
		nodeId: anchor.node ? String(anchor.node.id) : undefined,
		label: anchor.node ? String(anchor.node.label ?? "") : undefined,
		source_file:
			anchor.node && typeof anchor.node.source_file === "string"
				? anchor.node.source_file
				: undefined,
		source_location:
			anchor.node && typeof anchor.node.source_location === "string"
				? anchor.node.source_location
				: undefined,
		candidates: anchor.candidates.map((n) => ({
			nodeId: String(n.id),
			label: String(n.label ?? ""),
			source_file:
				typeof n.source_file === "string" ? n.source_file : undefined,
			source_location:
				typeof n.source_location === "string" ? n.source_location : undefined,
		})),
	};
}

function graphEdges(smoke: {
	links?: unknown[];
	edges?: unknown[];
}): GraphifyEdge[] {
	const raw = smoke.links ?? smoke.edges ?? [];
	return Array.isArray(raw) ? (raw as GraphifyEdge[]) : [];
}

function declarationFreshness(
	stored: SubsystemDeclarationRef | undefined,
	startLine: number,
	liveHash: string | null,
): NonNullable<SubsystemComponentVerificationResult["declaration"]>["freshness"] {
	if (liveHash == null) return "missing";
	if (!stored) return "valid";
	if (stored.startLine !== startLine || stored.lineHash !== liveHash) return "stale";
	return "valid";
}

async function captureDeclaration(
	graphId: string,
	components: SubsystemComponent[],
	component: SubsystemComponent,
	anchor: ComponentAnchorResult,
	fileContent: string | null,
	repoRoot: string | null,
	opts?: { dryRun?: boolean },
): Promise<NonNullable<SubsystemComponentVerificationResult["declaration"]> | undefined> {
	if (anchor.resolution !== "exact" || !anchor.node) {
		if (!component.declarationRef) return { freshness: "unanchored" };
		if (!fileContent) return { freshness: "unchecked" };
		const liveHash = hashDeclarationLineFromContent(
			fileContent,
			component.declarationRef.startLine,
		);
		return {
			freshness: declarationFreshness(
				component.declarationRef,
				component.declarationRef.startLine,
				liveHash,
			),
			ref: component.declarationRef,
			liveLineHash: liveHash ?? undefined,
		};
	}

	const startLine = parseSourceLocation(
		typeof anchor.node.source_location === "string"
			? anchor.node.source_location
			: undefined,
	);
	if (startLine == null || !fileContent) {
		return component.declarationRef
			? { freshness: "unchecked", ref: component.declarationRef }
			: { freshness: "unanchored" };
	}

	const liveHash = hashDeclarationLineFromContent(fileContent, startLine);
	if (liveHash == null) {
		return {
			freshness: "missing",
			ref: component.declarationRef,
		};
	}

	const freshness = declarationFreshness(
		component.declarationRef,
		startLine,
		liveHash,
	);
	const ref = buildDeclarationRef({
		file: component.file,
		startLine,
		lineHash: liveHash,
		graphifyNodeId: String(anchor.node.id),
		repoRoot,
	});

	// Dry-run audit reports freshness without writing declarationRef back.
	if (!opts?.dryRun) {
		await updateSubsystemModel(graphId, {
			components: components.map((c) =>
				c.id === component.id ? { ...c, declarationRef: ref } : c,
			),
		});
	}

	return { freshness, ref, liveLineHash: liveHash };
}

async function finalizeResult(
	graphId: string,
	components: SubsystemComponent[],
	component: SubsystemComponent,
	anchor: ComponentAnchorResult | undefined,
	fileContent: string | null,
	repoRoot: string | null,
	result: SubsystemComponentVerificationResult,
	opts?: { dryRun?: boolean },
): Promise<SubsystemComponentVerificationResult> {
	if (!anchor) return result;
	const declaration = await captureDeclaration(
		graphId,
		components,
		component,
		anchor,
		fileContent,
		repoRoot,
		opts,
	);
	return declaration ? { ...result, declaration } : result;
}

export async function verifySubsystemComponent(
	graphId: string,
	componentId: string,
	opts?: { dryRun?: boolean },
): Promise<SubsystemComponentVerificationResult> {
	const graph = await getSubsystemModel(graphId);
	if (!graph) {
		return { ok: false, error: `unknown graph: ${graphId}` };
	}
	const component = graph.components.find((c) => c.id === componentId);
	if (!component) {
		return { ok: false, error: `unknown component: ${componentId}`, componentId };
	}

	if (component.proposed) {
		return {
			ok: true,
			componentId,
			file: { exists: false, symbolDeclared: null },
		};
	}

	const purlKey =
		purlRepoKey(component.purl) ??
		(graph.repo
			? `pkg:github/${graph.repo.owner}/${graph.repo.name}`
			: undefined);
	const fromGraph = resolveRepoRootForComponent(graph, component.purl);
	const repoRoot =
		(fromGraph && existsSync(fromGraph) ? fromGraph : null) ||
		(purlKey ? resolveRepoRootForPurl(purlKey) : null) ||
		(graph.repoRoot && existsSync(graph.repoRoot) ? graph.repoRoot : null);

	const fileResult: SubsystemComponentVerificationResult["file"] = {
		exists: false,
		symbolDeclared: null,
		repoRoot: repoRoot ?? undefined,
	};
	let fileContent: string | null = null;
	if (repoRoot && component.file) {
		const abs = join(repoRoot, component.file);
		try {
			await fs.access(abs);
			fileResult.exists = true;
			fileContent = await fs.readFile(abs, "utf8");
			// Symbol presence is graphify's job (exact anchor). No text-regex check.
		} catch {
			fileResult.exists = false;
		}
	}

	if (!purlKey) {
		return {
			ok: true,
			componentId,
			file: fileResult,
			cache: { status: "unavailable", purl: component.purl || "" },
		};
	}

	const readiness = assessSubsystemGraphifyReadiness(
		{
			components: [{ purl: purlKey }],
			repoRoot: repoRoot ?? undefined,
			repoRoots: graph.repoRoots,
		},
	);
	const purlStatus = readiness.purls[0]?.status ?? "unavailable";
	const cacheStatus =
		purlStatus === "ready"
			? "ready"
			: purlStatus === "missing" || purlStatus === "building"
				? "missing"
				: "unavailable";

	const cache: NonNullable<SubsystemComponentVerificationResult["cache"]> = {
		status: cacheStatus,
		purl: purlKey,
		repoRoot: readiness.purls[0]?.repoRoot ?? repoRoot ?? undefined,
	};

	if (cacheStatus !== "ready") {
		return { ok: true, componentId, file: fileResult, cache };
	}

	const cached = await getCachedGraphifyGraph(purlKey, {
		repoRoot: cache.repoRoot,
	});
	if (!cached) {
		return {
			ok: true,
			componentId,
			file: fileResult,
			cache: { ...cache, status: "missing" },
		};
	}

	const smoke = loadGraphifyGraph(cached.path);
	const nodes = (smoke.nodes ?? []) as GraphifyNode[];
	const edges = graphEdges(smoke);
	const anchor = resolveComponentAnchor(nodes, {
		file: component.file,
		symbol: component.symbol,
		construct: component.construct,
		purl: purlKey,
	});

	// Symbol presence comes from graphify anchor, not a text regex.
	const claimedSymbol =
		typeof component.symbol === "string" && component.symbol.trim().length > 0;
	if (claimedSymbol) {
		fileResult.symbolDeclared = anchor.resolution === "exact";
	}

	let fileSuggest: SubsystemComponentVerificationResult["fileSuggest"];
	let fileCandidates: SubsystemComponentVerificationResult["fileCandidates"];
	if (
		fileResult.exists === false &&
		claimedSymbol &&
		repoRoot &&
		typeof component.symbol === "string"
	) {
		const hit = findUniqueDefinitionBySymbol(nodes, component.symbol);
		if (hit.status === "unique") {
			const suggested = normalizeSourcePath(
				String(hit.node.source_file ?? ""),
			);
			const claimed = component.file
				? normalizeSourcePath(component.file)
				: "";
			if (
				suggested &&
				suggested !== claimed &&
				existsSync(join(repoRoot, suggested))
			) {
				fileSuggest = {
					file: suggested,
					nodeId: String(hit.node.id),
					label: String(hit.node.label ?? ""),
				};
			}
		} else if (hit.status === "ambiguous") {
			const seen = new Set<string>();
			const list: NonNullable<
				SubsystemComponentVerificationResult["fileCandidates"]
			> = [];
			for (const node of hit.candidates) {
				const file = normalizeSourcePath(String(node.source_file ?? ""));
				if (!file || seen.has(file)) continue;
				if (!existsSync(join(repoRoot, file))) continue;
				seen.add(file);
				list.push({
					file,
					nodeId: String(node.id),
					label: String(node.label ?? ""),
				});
			}
			if (list.length > 1) fileCandidates = list;
			else if (list.length === 1) {
				// Only one candidate still on disk — treat as unique suggest.
				fileSuggest = list[0];
			}
		}
	}

	const base: SubsystemComponentVerificationResult = {
		ok: true,
		componentId,
		file: fileResult,
		cache,
		anchor: mapAnchor(anchor),
		fileSuggest,
		fileCandidates,
	};

	// Kind check only after exact anchor; external claims skip.
	if (anchor.resolution !== "exact" || !anchor.node) {
		return finalizeResult(
			graphId,
			graph.components,
			component,
			anchor,
			fileContent,
			repoRoot,
			base,
			opts,
		);
	}
	if (component.construct === "external") {
		return finalizeResult(
			graphId,
			graph.components,
			component,
			anchor,
			fileContent,
			repoRoot,
			base,
			opts,
		);
	}

	const inferred = inferConstructFromGraphify(anchor.node, edges);
	const claimed = String(component.construct ?? "");

	let construct: NonNullable<SubsystemComponentVerificationResult["construct"]>;

	// Inferred unknown = unconfirmed unless an accepted augmentation confirms
	// the claimed construct for this file+symbol.
	if (inferred.construct === "unknown") {
		const aug =
			claimed && component.file && component.symbol
				? await findAcceptedConstructAugmentation({
						purl: purlKey,
						file: component.file,
						symbol: component.symbol,
					})
				: null;
		const augConstruct = aug?.claims.construct?.trim();
		if (augConstruct && augConstruct === claimed) {
			construct = {
				claimed,
				inferred: "unknown",
				match: true,
				evidence: [
					...inferred.evidence,
					`augmented construct ${augConstruct}`,
					...(aug.evidence ?? []),
				],
			};
		} else {
			return finalizeResult(
				graphId,
				graph.components,
				component,
				anchor,
				fileContent,
				repoRoot,
				{
					...base,
					ok: true,
					code: "construct_unconfirmed",
					construct: {
						claimed,
						inferred: "unknown",
						match: null,
						evidence: inferred.evidence,
					},
				},
				opts,
			);
		}
	} else {
		const match = constructsMatch(claimed, inferred.construct);
		construct = {
			claimed,
			inferred: inferred.construct,
			match,
			evidence: inferred.evidence,
		};

		if (!match) {
			return finalizeResult(
				graphId,
				graph.components,
				component,
				anchor,
				fileContent,
				repoRoot,
				{
					...base,
					ok: false,
					code: "construct_mismatch",
					error: `construct mismatch: claimed ${claimed}, inferred ${inferred.construct}`,
					construct,
				},
				opts,
			);
		}
	}

	const withKind: SubsystemComponentVerificationResult = { ...base, construct };

	// Signature / params — function & method only, after kind ok.
	if (claimed !== "function" && claimed !== "method") {
		return finalizeResult(
			graphId,
			graph.components,
			component,
			anchor,
			fileContent,
			repoRoot,
			withKind,
			opts,
		);
	}

	const nodesById = new Map(nodes.map((n) => [String(n.id), n]));
	const inferredSig = extractGraphifySignature(
		String(anchor.node.id),
		edges,
		nodesById,
	);
	const claimedForCompare =
		component.declaration &&
		(component.declaration.kind === "function" || component.declaration.kind === "method")
			? {
					parameters:
						"parameters" in component.declaration
							? (component.declaration.parameters as Array<{
									name?: string;
									type: string;
								}>)
							: undefined,
					returnType:
						"returnType" in component.declaration
							? (component.declaration.returnType as string | undefined)
							: undefined,
				}
			: undefined;

	const sig = compareSignatures(claimedForCompare, inferredSig);
	let signature: NonNullable<SubsystemComponentVerificationResult["signature"]> =
		{
			match: sig.match,
			skipped: sig.skipped,
			reason: sig.reason,
			skipCode: sig.skipCode,
			claimed: sig.claimed,
			inferred: sig.inferred,
		};

	// Graphify has no usable signature edges — accepted augmentation can confirm.
	if (sig.skipped && component.file && component.symbol) {
		const aug = await findAcceptedSignatureAugmentation({
			purl: purlKey,
			file: component.file,
			symbol: component.symbol,
		});
		const augSig = aug?.claims.signature;
		if (augSig) {
			const claimedEmpty =
				sig.claimed.parameterTypes.length === 0 &&
				sig.claimed.returnTypes.length === 0;
			const typeBagsEqual = (a: string[], b: string[]) => {
				if (a.length !== b.length) return false;
				const sa = [...a].map((t) => t.trim()).filter(Boolean).sort();
				const sb = [...b].map((t) => t.trim()).filter(Boolean).sort();
				return sa.every((t, i) => t === sb[i]);
			};
			const bagsMatch =
				typeBagsEqual(sig.claimed.parameterTypes, augSig.parameterTypes) &&
				typeBagsEqual(sig.claimed.returnTypes, augSig.returnTypes);
			if (claimedEmpty || bagsMatch) {
				signature = {
					match: true,
					skipped: false,
					reason: "augmented signature",
					claimed: claimedEmpty
						? {
								parameterTypes: [...augSig.parameterTypes],
								returnTypes: [...augSig.returnTypes],
							}
						: sig.claimed,
					inferred: sig.inferred,
				};
			}
		}
	}

	if (!signature.match && !signature.skipped) {
		return finalizeResult(
			graphId,
			graph.components,
			component,
			anchor,
			fileContent,
			repoRoot,
			{
				...withKind,
				ok: false,
				code: "signature_mismatch",
				error: `signature mismatch: ${sig.reason ?? "types differ"} (claimed params [${sig.claimed.parameterTypes.join(", ")}] vs [${sig.inferred.parameterTypes.join(", ")}]; return [${sig.claimed.returnTypes.join(", ")}] vs [${sig.inferred.returnTypes.join(", ")}])`,
				signature,
			},
			opts,
		);
	}

	return finalizeResult(
		graphId,
		graph.components,
		component,
		anchor,
		fileContent,
		repoRoot,
		{ ...withKind, signature },
		opts,
	);
}

/** Verdict category for a single component verification result. */
export function verifyVerdict(
	r: SubsystemComponentVerificationResult,
): {
	category: string;
	detail?: string;
} {
	if (!r.ok) {
		if (r.cache && r.cache.status !== "ready") {
			return { category: `cache_${r.cache.status}`, detail: r.cache.purl };
		}
		switch (r.code) {
			case "construct_mismatch":
				return {
					category: "construct_mismatch",
					detail: `claimed ${r.construct?.claimed}, inferred ${r.construct?.inferred}`,
				};
			case "signature_mismatch":
				return {
					category: "signature_mismatch",
					detail: r.error,
				};
			default:
				return { category: "error", detail: r.error };
		}
	}
	if (r.construct?.match === null || r.code === "construct_unconfirmed") {
		return {
			category: "construct_unconfirmed",
			detail: `claimed ${r.construct?.claimed}, inferred unknown`,
		};
	}
	if (r.cache && r.cache.status !== "ready") {
		return { category: `cache_${r.cache.status}`, detail: r.cache.purl };
	}
	if (!r.anchor || r.anchor.resolution !== "exact") {
		return {
			category: `anchor_${r.anchor?.resolution ?? "missing"}`,
			detail: r.anchor?.nodeId,
		};
	}
	if (r.signature) {
		if (r.signature.skipped) {
			const detail = r.signature.reason;
			switch (r.signature.skipCode) {
				case "no_claimed_types":
					return { category: "signature_no_claimed_types", detail };
				case "generic_arg_only":
					return { category: "signature_generic_arg_only", detail };
				case "partially_generic_arg":
					return { category: "signature_partially_generic_arg", detail };
				case "unresolved_claimed_types":
					return { category: "signature_unresolved_claimed_types", detail };
				default:
					return { category: "signature_skipped", detail };
			}
		}
		return r.signature.match
			? { category: "signature_match" }
			: { category: "signature_mismatch", detail: r.error };
	}
	return { category: "construct_only" };
}

export interface SubsystemModelVerificationSummary {
	graphId: string;
	title: string;
	checkedAt: string;
	total: number;
	tally: Record<string, number>;
	results: Array<{
		componentId: string;
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
	opts?: { dryRun?: boolean },
): Promise<
	| { ok: true; data: SubsystemModelVerificationSummary }
	| { ok: false; error: string }
> {
	const graph = await getSubsystemModel(graphId);
	if (!graph) return { ok: false, error: `unknown graph: ${graphId}` };

	const results: SubsystemModelVerificationSummary["results"] = [];
	const tally: Record<string, number> = {};
	for (const c of graph.components) {
		const r = await verifySubsystemComponent(graphId, c.id, opts);
		const { category, detail } = verifyVerdict(r);
		tally[category] = (tally[category] ?? 0) + 1;
		results.push({
			componentId: c.id,
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
 * Dry-run deterministic audit focused on component currency: files exist,
 * symbols declare, declaration freshness, and (when graphify is ready)
 * construct/signature/anchor checks. Walkthrough site affinity is intentionally
 * omitted — that seam check is heuristic and better suited to an agent pass.
 *
 * Always returns a per-component `checks` checklist so a clean run still shows
 * what was inspected.
 */
export async function auditSubsystemModel(
	graphId: string,
): Promise<
	| { ok: true; report: SubsystemModelAuditReport; fingerprint: string }
	| { ok: false; error: string }
> {
	const graph = await getSubsystemModel(graphId);
	if (!graph) return { ok: false, error: `unknown graph: ${graphId}` };

	// Audit must use the current HEAD(+dirty) graphify slot, not a stale fallback.
	const graphifyEnsure = await ensureCurrentGraphifyCachesForModel(graph);
	if (graphifyEnsure.failed.length > 0) {
		console.warn(
			`[audit] graphify ensure incomplete for ${graphId}: ${graphifyEnsure.failed
				.map((f) => `${f.purl} (${f.error})`)
				.join("; ")}`,
		);
	}

	const files = await verifyModelFiles(graph);
	const missingFileIds = new Set(files.missing.map((m) => m.componentId));

	const findings: SubsystemModelAuditFinding[] = [];
	const checks: SubsystemModelAuditCheck[] = [];

	// missing_file findings are attached in the per-component loop so we can
	// include a deterministic Graphify file-relocate fix when available.
	// Symbol presence is graphify-only (exact anchor). No text-regex missing_symbol.

	let unresolved = 0;
	let staleDeclarations = 0;
	let constructMismatches = 0;
	let signatureMismatches = 0;
	let weakAnchors = 0;
	let okComponents = 0;
	let filesVerified = 0;
	let symbolsVerified = 0;
	let declarationsValid = 0;
	let constructsMatched = 0;
	let signaturesMatched = 0;
	let anchorsExact = 0;
	let externalsSkipped = 0;
	let missingSymbols = 0;

	const seenComponentIssue = new Set<string>([...missingFileIds]);

	for (const c of graph.components) {
		if (
			c.proposed ||
			c.construct === "external" ||
			c.construct === "custom_entity"
		) {
			externalsSkipped++;
			okComponents++;
			checks.push({
				componentId: c.id,
				componentName: c.name,
				construct: c.construct,
				symbol: c.symbol,
				file: c.file || undefined,
				fileExists: null,
				symbolDeclared: null,
				declarationFreshness: "n/a",
				constructMatch: null,
				signature: "n/a",
				anchor: "n/a",
				graphify: "skipped",
				verdict: "skipped",
				note: c.proposed
					? "proposed — no source declaration check until promoted"
					: "external / custom entity — no source declaration check",
			});
			continue;
		}

		const r = await verifySubsystemComponent(graphId, c.id, { dryRun: true });
		let issue = seenComponentIssue.has(c.id);

		const check: SubsystemModelAuditCheck = {
			componentId: c.id,
			componentName: c.name,
			construct: c.construct,
			symbol: c.symbol,
			file: c.file || undefined,
			fileExists: null,
			symbolDeclared: null,
			declarationFreshness: "n/a",
			constructMatch: null,
			signature: "n/a",
			anchor: "n/a",
			graphify: "unavailable",
			verdict: "ok",
		};

		if (!r.file?.repoRoot) {
			check.fileExists = null;
			check.graphify = "unavailable";
			check.note = `No local repoRoot for ${c.purl || c.file || c.id}`;
			check.verdict = "skipped";
			if (!seenComponentIssue.has(c.id)) {
				findings.push({
					kind: "unresolved",
					severity: "info",
					componentId: c.id,
					componentName: c.name,
					message: check.note,
				});
				unresolved++;
				seenComponentIssue.add(c.id);
			}
			checks.push(check);
			continue;
		}

		check.fileExists = r.file.exists === true;
		if (check.fileExists) filesVerified++;
		else {
			issue = true;
			const fix = r.fileSuggest
				? adoptGraphifyFileFixFromVerify(c, r.fileSuggest)
				: undefined;
			const candidates = r.fileCandidates?.map((x) => x.file) ?? [];
			findings.push({
				kind: "missing_file",
				severity: "error",
				componentId: c.id,
				componentName: c.name,
				message: fix
					? `File not found: ${c.file} — Graphify has ${c.symbol} at ${fix.file} (deterministic update available)`
					: candidates.length > 1
						? `File not found: ${c.file} — Graphify has ${c.symbol} at multiple paths: ${candidates.join(", ")} (agent judgment required)`
						: `File not found: ${c.file}`,
				fix,
			});
		}

		if (typeof c.symbol === "string" && c.symbol.trim()) {
			// Graphify exact anchor ⇒ symbol present. No cache ⇒ leave null (unchecked).
			if (r.cache?.status === "ready" && r.anchor?.resolution) {
				check.symbolDeclared = r.anchor.resolution === "exact";
				if (check.symbolDeclared) symbolsVerified++;
				else missingSymbols++;
			} else {
				check.symbolDeclared = null;
			}
		} else {
			check.symbolDeclared = null;
			check.note = "no symbol claimed";
		}

		if (r.declaration?.freshness) {
			check.declarationFreshness = r.declaration.freshness;
			if (r.declaration.freshness === "valid") declarationsValid++;
			if (r.declaration.freshness === "stale") {
				issue = true;
				const stored = c.declarationRef;
				const fix = adoptGraphifyDeclarationRefFixFromVerify(
					c,
					r.declaration,
					r.anchor,
				);
				findings.push({
					kind: "stale_declaration",
					severity: "error",
					componentId: c.id,
					componentName: c.name,
					message: fix
						? `Declaration drifted — Graphify pins L${fix.declarationRef.startLine}${
								stored ? ` (model had L${stored.startLine})` : ""
							}`
						: `Declaration line hash stale${
								stored ? ` (stored L${stored.startLine})` : ""
							}`,
					fix,
				});
				staleDeclarations++;
				seenComponentIssue.add(c.id);
			}
		}

		if (r.construct) {
			check.constructMatch = r.construct.match;
			check.constructClaimed = r.construct.claimed;
			check.constructInferred = r.construct.inferred;
			if (r.construct.evidence?.length)
				check.constructEvidence = r.construct.evidence;
			if (r.construct.match === true) constructsMatched++;
		}
		if (r.construct?.match === null || r.code === "construct_unconfirmed") {
			findings.push({
				kind: "construct_unconfirmed",
				severity: "info",
				componentId: c.id,
				componentName: c.name,
				message: `Construct unclassified — claimed ${r.construct?.claimed ?? c.construct ?? "?"}, graphify inferred unknown${
					r.construct?.evidence?.length
						? ` (${r.construct.evidence.join("; ")})`
						: ""
				}`,
			});
		}
		if (!r.ok && r.code === "construct_mismatch") {
			issue = true;
			findings.push({
				kind: "construct_mismatch",
				severity: "error",
				componentId: c.id,
				componentName: c.name,
				message: r.error ?? "Construct mismatch",
			});
			constructMismatches++;
			seenComponentIssue.add(c.id);
		}

		if (r.signature) {
			if (r.signature.skipped) check.signature = "skipped";
			else if (r.signature.match) {
				check.signature = "match";
				signaturesMatched++;
			} else {
				check.signature = "mismatch";
			}
		}
		if (r.signature?.skipped) {
			findings.push({
				kind: "signature_unconfirmed",
				severity: "info",
				componentId: c.id,
				componentName: c.name,
				message: `Signature not in cache — Graphify has no usable type edges${
					r.signature.reason ? ` (${r.signature.reason})` : ""
				}`,
			});
		}
		if (!r.ok && r.code === "signature_mismatch") {
			issue = true;
			const fix =
				r.signature != null
					? adoptGraphifySignatureFixFromVerify(r.signature)
					: undefined;
			findings.push({
				kind: "signature_mismatch",
				severity: "error",
				componentId: c.id,
				componentName: c.name,
				message: fix
					? `${r.error ?? "Signature mismatch"} — model has no named types; graphify does (deterministic fill available)`
					: (r.error ?? "Signature mismatch"),
				fix,
			});
			signatureMismatches++;
			seenComponentIssue.add(c.id);
		}

		const hasClaimedSymbol = typeof c.symbol === "string" && c.symbol.trim().length > 0;
		const resolution = r.anchor?.resolution;
		if (r.cache?.status === "ready" && resolution) {
			check.anchor = resolution;
			if (!hasClaimedSymbol) {
				check.graphify = "skipped";
				check.note = "graphify anchor skipped - no symbol claimed";
			} else if (check.fileExists === false) {
				check.graphify = "unavailable";
				check.note = r.fileSuggest
					? `claimed file missing — Graphify has symbol at ${r.fileSuggest.file}`
					: r.fileCandidates && r.fileCandidates.length > 1
						? `claimed file missing — Graphify has symbol at ${r.fileCandidates.map((x) => x.file).join(", ")}`
						: "graphify anchor skipped - source file missing";
			} else if (resolution === "exact") {
				anchorsExact++;
				check.graphify = "confirmed";
			} else {
				check.graphify = "weak";
				issue = true;
				findings.push({
					kind: "anchor",
					severity: "warn",
					componentId: c.id,
					componentName: c.name,
					message: `Graphify anchor ${resolution}${r.anchor?.label ? `: ${r.anchor.label}` : ""}`,
				});
				weakAnchors++;
				seenComponentIssue.add(c.id);
			}
		} else if (r.cache && r.cache.status !== "ready") {
			check.anchor = "n/a";
			check.graphify = "unavailable";
			check.note = `Graphify cache ${r.cache.status}`;
			findings.push({
				kind: "unresolved",
				severity: "info",
				componentId: c.id,
				componentName: c.name,
				message: `Graphify cache ${r.cache.status} for ${r.cache.purl}`,
			});
		} else {
			check.graphify = "unavailable";
		}

		check.verdict = issue ? "issue" : "ok";
		if (!issue && r.ok) okComponents++;
		checks.push(check);
	}

	const summary = {
		components: graph.components.length,
		filesVerified,
		symbolsVerified,
		declarationsValid,
		constructsMatched,
		signaturesMatched,
		anchorsExact,
		graphifyConfirmed: anchorsExact,
		externalsSkipped,
		missingFiles: files.missingCount,
		missingSymbols,
		walkthroughFailures: 0,
		staleDeclarations,
		constructMismatches,
		signatureMismatches,
		weakAnchors,
		unresolved,
		ok: okComponents,
	};

	const needsUpdate = findings.some((f) => f.severity === "error");

	const report: SubsystemModelAuditReport = {
		graphId,
		title: graph.title,
		checkedAt: new Date().toISOString(),
		needsUpdate,
		summary,
		checks,
		findings,
	};

	const graphify = assessSubsystemGraphifyReadiness(graph);
	const fingerprint = buildAuditFingerprint({
		updatedAt: graph.updatedAt,
		components: graph.components,
		graphify,
	});
	try {
		await saveSubsystemModelAudit(graphId, report, fingerprint);
	} catch (err) {
		console.warn(
			`[audit] failed to persist report for ${graphId}: ${
				err instanceof Error ? err.message : String(err)
			}`,
		);
	}

	return {
		ok: true,
		report,
		fingerprint,
	};
}

/**
 * Apply deterministic audit fix(es), then re-audit.
 * - `adopt_graphify_signature` — copy graphify named type bags into declaration
 * - `adopt_graphify_file` — update component.file from Graphify when claimed path missing
 * - `adopt_graphify_declaration_ref` — re-pin declarationRef from Graphify source_location
 */
export async function applySubsystemModelAuditFix(opts: {
	graphId: string;
	fixId:
		| "adopt_graphify_signature"
		| "adopt_graphify_file"
		| "adopt_graphify_declaration_ref";
	componentId?: string;
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
		opts.fixId !== "adopt_graphify_declaration_ref"
	) {
		return { ok: false, error: `unknown fix: ${opts.fixId}` };
	}

	const graph = await getSubsystemModel(opts.graphId);
	if (!graph) return { ok: false, error: `unknown graph: ${opts.graphId}` };

	const targetIds = opts.componentId
		? [opts.componentId]
		: graph.components.map((c) => c.id);

	if (opts.fixId === "adopt_graphify_file") {
		const fileUpdates = new Map<string, string>();

		for (const componentId of targetIds) {
			const component = graph.components.find((c) => c.id === componentId);
			if (!component) {
				if (opts.componentId) {
					return { ok: false, error: `unknown component: ${componentId}` };
				}
				continue;
			}

			const verified = await verifySubsystemComponent(opts.graphId, componentId, {
				dryRun: true,
			});
			if (!verified.fileSuggest?.file) {
				if (opts.componentId) {
					return {
						ok: false,
						error:
							"no unique Graphify file relocate (file may exist, or symbol is missing/ambiguous in Graphify)",
					};
				}
				continue;
			}
			fileUpdates.set(componentId, verified.fileSuggest.file);
		}

		if (fileUpdates.size === 0) {
			return { ok: false, error: "no adoptable file relocates found" };
		}

		const components = graph.components.map((c) => {
			const file = fileUpdates.get(c.id);
			if (!file) return c;
			return {
				...c,
				file,
				// Old pin is for the previous path; clear so next audit re-captures.
				declarationRef: undefined,
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
		const refUpdates = new Map<string, SubsystemDeclarationRef>();

		for (const componentId of targetIds) {
			const component = graph.components.find((c) => c.id === componentId);
			if (!component) {
				if (opts.componentId) {
					return { ok: false, error: `unknown component: ${componentId}` };
				}
				continue;
			}

			const verified = await verifySubsystemComponent(opts.graphId, componentId, {
				dryRun: true,
			});
			const decl = verified.declaration;
			const repin = decl?.ref;
			const canRepin =
				decl?.freshness === "stale" &&
				verified.anchor?.resolution === "exact" &&
				repin != null &&
				typeof repin.startLine === "number" &&
				typeof repin.lineHash === "string";
			if (!canRepin || !repin) {
				if (opts.componentId) {
					return {
						ok: false,
						error:
							"no Graphify declaration re-pin (need exact symbol match + drifted pin)",
					};
				}
				continue;
			}
			refUpdates.set(componentId, repin);
		}

		if (refUpdates.size === 0) {
			return { ok: false, error: "no adoptable declaration re-pins found" };
		}

		const components = graph.components.map((c) => {
			const declarationRef = refUpdates.get(c.id);
			if (!declarationRef) return c;
			return { ...c, declarationRef };
		});

		const updated = await updateSubsystemModel(opts.graphId, { components });
		if (!updated) {
			return { ok: false, error: `failed to update graph: ${opts.graphId}` };
		}

		const audited = await auditSubsystemModel(opts.graphId);
		if (!audited.ok) return { ok: false, error: audited.error };
		return {
			ok: true,
			applied: refUpdates.size,
			report: audited.report,
			fingerprint: audited.fingerprint,
		};
	}

	const updates = new Map<string, NonNullable<SubsystemComponent["declaration"]>>();

	for (const componentId of targetIds) {
		const component = graph.components.find((c) => c.id === componentId);
		if (!component) {
			if (opts.componentId) {
				return { ok: false, error: `unknown component: ${componentId}` };
			}
			continue;
		}
		if (component.construct !== "function" && component.construct !== "method") {
			if (opts.componentId) {
				return {
					ok: false,
					error: `component ${componentId} is not a function/method`,
				};
			}
			continue;
		}

		const verified = await verifySubsystemComponent(opts.graphId, componentId, {
			dryRun: true,
		});
		if (!verified.ok && verified.code !== "signature_mismatch") {
			if (opts.componentId) {
				return {
					ok: false,
					error: verified.error ?? `verify failed for ${componentId}`,
				};
			}
			continue;
		}
		const sig = verified.signature;
		if (!sig) {
			if (opts.componentId) {
				return { ok: false, error: `no signature check for ${componentId}` };
			}
			continue;
		}
		const fix = adoptGraphifySignatureFixFromVerify(sig);
		if (!fix) {
			if (opts.componentId) {
				return {
					ok: false,
					error:
						"not an adoptable empty-claim signature mismatch (model already has named types, or graphify has none)",
				};
			}
			continue;
		}

		updates.set(
			componentId,
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
		const declaration = updates.get(c.id);
		if (!declaration) return c;
		return {
			...c,
			declaration,
			declarationProvenance: "verified" as const,
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


