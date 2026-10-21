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
import {
	inferConstructFromGraphify,
	resolveConstructMatch,
} from "../../../subsystems-react/src/graphify/construct";
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
	buildSourceSpan,
	hashContentRange,
	parseSourceLocation,
	type SubsystemSourceSpan,
} from "./declaration-ref";
import { deriveSpan, type SpanTreeCache } from "./span-derivation";
import { loadGraphifyGraph } from "./graphify-runner";
import {
	assessSubsystemGraphifyReadiness,
	ensureCurrentGraphifyCachesForModel,
	getCachedGraphifyGraph,
	resolveRepoRootForPurl,
} from "./graphify-store";
import {
	findAcceptedConstructAugmentation,
	findAcceptedModuleAugmentation,
	findAcceptedSignatureAugmentation,
	findAcceptedCallSiteAugmentation,
	findAcceptedSpanAugmentation,
} from "./augmentation-store";
import {
	auditBoundaryFields,
	auditProcessVerification,
	auditProcessBacking,
	dropUnbackedMissing,
} from "./boundary-audit";
import type { C4Element } from "@principal-ai/subsystems-react";
import { readC4ElementSet } from "./c4-element-store";
import {
	buildAuditFingerprint,
	classifyAuditReport,
	saveSubsystemModelAudit,
} from "./audit-report-store";
import {
	capturePurlCommits,
	referencedFilesClean,
} from "./purl-commits";
import { callsSiteOutsideFrom } from "./trail-site";
import {
	declarationForSymbol,
	enclosingDeclaration,
} from "./graph-constructs";
import {
	getSubsystemModel,
	isRepoPurl,
	purlRepoKey,
	stampVerifiedCommits,
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
): Extract<SubsystemModelAuditFix, { id: "adopt_graphify_signature" }> | undefined {
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
): Extract<SubsystemModelAuditFix, { id: "adopt_graphify_file" }> {
	return {
		id: "adopt_graphify_file",
		label: `Update file to ${suggest.file}`,
		file: suggest.file,
		previousFile: component.file,
	};
}

/**
 * Exact Graphify anchor + a content-preserving move → one-click re-pin.
 *
 * Graphify supplies only the start line, so the candidate span is the stored
 * span shifted to the new start with its length preserved. It is offered only
 * when the shifted range re-hashes to the stored `contentHash` — i.e. the
 * construct moved intact. A changed hash is not a move; it needs the agent lane.
 */
export function adoptGraphifyDeclarationRefFixFromVerify(
	component: { declarationSpan?: SubsystemSourceSpan },
	declaration: NonNullable<SubsystemComponentVerificationResult["declaration"]>,
	anchor: SubsystemComponentVerificationResult["anchor"],
): Extract<
	SubsystemModelAuditFix,
	{ id: "adopt_graphify_declaration_ref" }
> | undefined {
	if (declaration.freshness !== "stale") return undefined;
	if (anchor?.resolution !== "exact") return undefined;
	const repin = declaration.repin;
	const stored = component.declarationSpan;
	if (!repin || !stored) return undefined;
	// Only a content-preserving move is safe to re-pin.
	if (repin.contentHash !== stored.contentHash) return undefined;
	if (repin.startLine === stored.startLine) return undefined;
	return {
		id: "adopt_graphify_declaration_ref",
		label: `Re-pin declaration to L${repin.startLine} (was L${stored.startLine})`,
		declarationSpan: repin,
		previousStartLine: stored.startLine,
	};
}

/**
 * A grounded claim with no stored span whose declaration tree-sitter can pin
 * exactly — every structural gate passed, so the derived `[start, end]` range
 * and its content hash are deterministic. The fresh-capture counterpart to the
 * declaration re-pin: one click writes `declarationSpan`, no agent needed.
 */
export function adoptTreeSitterSpanFixFromVerify(
	declaration: NonNullable<SubsystemComponentVerificationResult["declaration"]>,
): Extract<SubsystemModelAuditFix, { id: "adopt_tree_sitter_span" }> | undefined {
	const span = declaration.derivation?.span;
	if (declaration.derivation?.class !== "trivial" || !span) return undefined;
	return {
		id: "adopt_tree_sitter_span",
		label: `Capture declaration span L${span.startLine}–${span.endLine}`,
		declarationSpan: span,
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
	return {
		kind: "function",
		parameters,
		returnType,
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

/**
 * Freshness of a span against live content.
 *
 * `full` when the live range hashes to the span's `contentHash` and Graphify
 * still points at the span's start. `stale` when the content changed or the
 * declaration moved (positional drift). The hash is the invariant: a construct
 * that merely moved can be re-pinned by re-hashing the shifted range.
 */
function spanFreshness(
	current: SubsystemSourceSpan,
	liveHash: string,
	graphifyStart: number | null,
): NonNullable<SubsystemComponentVerificationResult["declaration"]>["freshness"] {
	if (liveHash !== current.contentHash) return "stale";
	if (graphifyStart != null && graphifyStart !== current.startLine) return "stale";
	return "full";
}

/** A store's declared value type, normalized. Null when it declares none. */
function storeValueTypeOf(
	declaration: { valueType?: string } | undefined,
): string | null {
	const value = declaration?.valueType;
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Store completeness — an in-memory store declares the type it holds.
 *
 * A store is a state declaration, so it says what it declares: either a
 * `valueType` (`Map<string, FeedState>`) or named state members. A memory store
 * with neither has no declared type at all. Deliberately narrow: only
 * `storage: "memory"` (where the type is the whole point) and only when the
 * store has a declaration to inspect. Never a hard failure — a gap the
 * construct-verifier fills by reading source.
 *
 * Exported for unit testing — the predicate is the whole of the new gap.
 */
export function storeTypeUndeclared(component: SubsystemComponent): boolean {
	if (component.construct !== "store") return false;
	const declaration = component.declaration;
	if (!declaration || declaration.kind !== "store") return false;
	if (declaration.storage !== "memory") return false;
	return !storeValueTypeOf(declaration) && (declaration.properties ?? []).length === 0;
}

/**
 * A store whose pinned declaration moved — its declared value type may be out
 * of date.
 *
 * Reuses the drift trigger that already exists: a stale declaration means
 * "look at this again" (it raises `construct_span_stale` with a one-click re-pin).
 * A declared value type can only be wrong because the source moved, so this is
 * the moment to re-derive it — no new check lane, and Graphify can never
 * provide the type itself.
 *
 * Scoped to stores that declare a value type: there is nothing specific to
 * re-derive otherwise, and an undeclared one is already covered by
 * `storeTypeUndeclared`. Mutually exclusive with it by construction.
 *
 * Exported for unit testing.
 */
export function storeTypeStale(
	component: SubsystemComponent,
	freshness: string | undefined,
): boolean {
	if (freshness !== "stale") return false;
	const declaration = component.declaration;
	if (!declaration || declaration.kind !== "store") return false;
	return storeValueTypeOf(declaration) != null;
}

/** The npm package a path is installed from, when it sits in an install root. */
export interface InstalledDependency {
	packageName: string;
}

/**
 * The npm package an installed path belongs to — `…/node_modules/@pierre/diffs/dist/x.js`
 * → `@pierre/diffs` — or null when the path is ordinary repo source.
 *
 * Mirrors the `node_modules` invariant in `validateSubsystemModelCrossField`
 * (subsystems-core). That one owns rejection at write time; this one only
 * names the dependency so the audit finding can say which package to re-anchor.
 */
export function installedDependencyPackage(
	file: string | undefined,
): InstalledDependency | null {
	if (!file) return null;
	const segments = file.split("/");
	const at = segments.lastIndexOf("node_modules");
	if (at < 0) return null;
	const name = segments[at + 1];
	if (!name) return null;
	// Scoped names take two segments (`@scope/pkg`); unscoped names end at `.`.
	const scoped = name.startsWith("@") ? segments[at + 2] : undefined;
	if (name.startsWith("@") && !scoped) return null;
	return { packageName: scoped ? `${name}/${scoped}` : name };
}

async function captureDeclaration(
	graphId: string,
	components: SubsystemComponent[],
	component: SubsystemComponent,
	anchor: ComponentAnchorResult,
	fileContent: string | null,
	_repoRoot: string | null,
	opts?: { dryRun?: boolean; treeCache?: SpanTreeCache },
): Promise<NonNullable<SubsystemComponentVerificationResult["declaration"]> | undefined> {
	const stored = component.declarationSpan;

	// The capture lane: an accepted span augmentation is the only source of a
	// full span (Graphify gives the start line, never the end).
	let captured: SubsystemSourceSpan | undefined;
	if (component.purl && component.file && component.symbol) {
		const aug = await findAcceptedSpanAugmentation({
			purl: component.purl,
			file: component.file,
			symbol: component.symbol,
		});
		const claim = aug?.claims.span;
		if (claim) {
			captured = buildSourceSpan({
				startLine: claim.startLine,
				endLine: claim.endLine,
				contentHash: claim.contentHash,
			});
		}
	}

	const current = captured ?? stored;

	// Tree-sitter derivation: graphify start + a parse of the file gives the
	// declaration's end line for *any* grounded claim, not only ones with a
	// stored span. This is what makes an unanchored construct capturable
	// without an agent when every structural gate passes.
	let derivation: NonNullable<
		SubsystemComponentVerificationResult["declaration"]
	>["derivation"];
	if (fileContent && component.file) {
		const d = await deriveSpan({
			content: fileContent,
			file: component.file,
			symbol: component.symbol,
			construct: component.construct,
			anchor,
			storedSpan: stored,
			treeCache: opts?.treeCache,
		});
		let span: SubsystemSourceSpan | undefined;
		if (d.class === "trivial" && d.graphifyStart != null && d.derivedEnd != null) {
			const hash = hashContentRange(fileContent, d.graphifyStart, d.derivedEnd);
			if (hash) {
				span = buildSourceSpan({
					startLine: d.graphifyStart,
					endLine: d.derivedEnd,
					contentHash: hash,
				});
			}
		}
		derivation = {
			class: d.class,
			endLine: d.derivedEnd ?? undefined,
			span,
			failedGates: d.failedGates,
			evidence: d.evidence,
		};
	}

	if (!current) return { freshness: "unanchored", derivation };
	if (!fileContent) return { freshness: "unchecked", span: current, derivation };

	const liveHash = hashContentRange(
		fileContent,
		current.startLine,
		current.endLine,
	);
	if (liveHash == null) return { freshness: "missing", span: current, derivation };

	const graphifyStart =
		anchor.resolution === "exact" && anchor.node
			? parseSourceLocation(
					typeof anchor.node.source_location === "string"
						? anchor.node.source_location
						: undefined,
				)
			: null;

	// A content-preserving move: shift the stored span to Graphify's start,
	// keep its length, and re-hash. Offered only when the hash is unchanged —
	// then the construct moved intact and the shift is a safe re-pin.
	let repin: SubsystemSourceSpan | undefined;
	if (
		stored &&
		graphifyStart != null &&
		graphifyStart !== current.startLine &&
		graphifyStart !== stored.startLine
	) {
		const len = stored.endLine - stored.startLine;
		const shiftedHash = hashContentRange(
			fileContent,
			graphifyStart,
			graphifyStart + len,
		);
		if (shiftedHash === stored.contentHash) {
			repin = buildSourceSpan({
				startLine: graphifyStart,
				endLine: graphifyStart + len,
				contentHash: shiftedHash,
			});
		}
	}

	const freshness = spanFreshness(current, liveHash, graphifyStart);

	// Promote an accepted span augmentation into the model (dry-run reports
	// without writing).
	if (
		!opts?.dryRun &&
		captured &&
		(!stored ||
			stored.startLine !== captured.startLine ||
			stored.endLine !== captured.endLine ||
			stored.contentHash !== captured.contentHash)
	) {
		await updateSubsystemModel(graphId, {
			components: components.map((c) =>
				c.alias === component.alias ? { ...c, declarationSpan: captured } : c,
			),
		});
	}

	return { freshness, span: current, liveContentHash: liveHash, repin, derivation };
}

async function finalizeResult(
	graphId: string,
	components: SubsystemComponent[],
	component: SubsystemComponent,
	anchor: ComponentAnchorResult | undefined,
	fileContent: string | null,
	repoRoot: string | null,
	result: SubsystemComponentVerificationResult,
	opts?: { dryRun?: boolean; treeCache?: SpanTreeCache },
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

/**
 * Per-audit-pass cache of parsed graphify graphs, keyed by purl. Without it the
 * audit re-reads and re-parses the same repo graph once per component; one
 * parse per purl per pass is enough (same semantics, far less IO).
 */
export type GraphifyPassCache = Map<string, Promise<GraphifyBundle | null>>;

/** Parsed graphify nodes + edges for one repo — the shared pass unit. */
interface GraphifyBundle {
	nodes: GraphifyNode[];
	edges: GraphifyEdge[];
}

async function parseGraphifyBundle(
	cached: Awaited<ReturnType<typeof getCachedGraphifyGraph>>,
): Promise<GraphifyBundle | null> {
	if (!cached) return null;
	const smoke = loadGraphifyGraph(cached.path);
	return {
		nodes: (smoke.nodes ?? []) as GraphifyNode[],
		edges: graphEdges(smoke),
	};
}

async function loadGraphifyBundle(
	cache: GraphifyPassCache | undefined,
	purl: string,
	repoRoot: string | undefined,
): Promise<GraphifyBundle | null> {
	if (!cache) {
		return parseGraphifyBundle(await getCachedGraphifyGraph(purl, { repoRoot }));
	}
	const existing = cache.get(purl);
	if (existing) return existing;
	// Store the promise before awaiting so concurrent callers dedupe too.
	const pending = (async () =>
		parseGraphifyBundle(await getCachedGraphifyGraph(purl, { repoRoot })))();
	cache.set(purl, pending);
	return pending;
}

export async function verifySubsystemComponent(
	graphId: string,
	componentAlias: string,
	opts?: { dryRun?: boolean; graphifyCache?: GraphifyPassCache; treeCache?: SpanTreeCache },
): Promise<SubsystemComponentVerificationResult> {
	const graph = await getSubsystemModel(graphId);
	if (!graph) {
		return { ok: false, error: `unknown graph: ${graphId}` };
	}
	const component = graph.components.find((c) => c.alias === componentAlias);
	if (!component) {
		return { ok: false, error: `unknown component: ${componentAlias}`, componentAlias };
	}

	const purlKey = purlRepoKey(component.purl);
	const repoRoot = purlKey ? resolveRepoRootForPurl(purlKey) : null;

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
			componentAlias,
			file: fileResult,
			cache: { status: "unavailable", purl: component.purl || "" },
		};
	}

	const readiness = await assessSubsystemGraphifyReadiness({
		components: [{ purl: purlKey }],
	});
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
		return { ok: true, componentAlias, file: fileResult, cache };
	}

	const bundle = await loadGraphifyBundle(
		opts?.graphifyCache,
		purlKey,
		cache.repoRoot,
	);
	if (!bundle) {
		return {
			ok: true,
			componentAlias,
			file: fileResult,
			cache: { ...cache, status: "missing" },
		};
	}

	const nodes = bundle.nodes;
	const edges = bundle.edges;
	const anchor = resolveComponentAnchor(nodes, {
		file: component.file,
		symbol: component.symbol,
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
		componentAlias,
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

	// Accepted, agent-confirmed construct for this file+symbol, if any. Graphify's
	// inferred construct is a structural hint, not ground truth — an augmentation
	// can confirm the claim when Graphify is silent (`unknown`) *or* disagrees
	// (its vocabulary has no `store`/`custom_entity`, and a call-style accessor
	// label biases it to `function`).
	const aug =
		claimed && component.file && component.symbol
			? await findAcceptedConstructAugmentation({
					purl: purlKey,
					file: component.file,
					symbol: component.symbol,
				})
			: null;
	const augConstruct = aug?.claims.construct?.trim();

	const outcome = resolveConstructMatch(
		claimed,
		inferred.construct,
		augConstruct,
	);
	const augmentedEvidence = outcome.augmentedBy
		? [
				`augmented construct ${outcome.augmentedBy} (agent-confirmed, graphify inferred ${inferred.construct})`,
				...(aug?.evidence ?? []),
			]
		: [];
	const construct: NonNullable<SubsystemComponentVerificationResult["construct"]> =
		{
			claimed,
			inferred: inferred.construct,
			match: outcome.match,
			evidence: [...inferred.evidence, ...augmentedEvidence],
			...(outcome.augmentedBy ? { augmented: outcome.augmentedBy } : {}),
		};

	if (outcome.match === null) {
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
				construct,
			},
			opts,
		);
	}
	if (outcome.match === false) {
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

	const withKind: SubsystemComponentVerificationResult = { ...base, construct };

	// Store completeness — an in-memory store declares the type it holds, the
	// way every other declaration declares its signature. A gap, never a hard
	// failure: the agent reads the declaration and authors `declaration.valueType`.
	// Keyed on the model's own `storage` claim; `storage` is itself authored and
	// not yet verified, so this is a completeness signal rather than a verdict.
	const withStoreType: SubsystemComponentVerificationResult = {
		...withKind,
		...(storeTypeUndeclared(component) ? { storeTypeUndeclared: true } : {}),
	};

	// Signature / params — function & method only, after kind ok.
	if (claimed !== "function" && claimed !== "method") {
		return finalizeResult(
			graphId,
			graph.components,
			component,
			anchor,
			fileContent,
			repoRoot,
			withStoreType,
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

	// Graphify has no usable signature edges. An accepted, agent-extracted
	// augmentation IS the confirmation — there is nothing deterministic to
	// compare against: Graphify is silent, and comparing to the model's own
	// declaration would be circular. Trust it, and label it as agent-confirmed
	// so it is never mistaken for a Graphify-verified match.
	if (sig.skipped && component.file && component.symbol) {
		const aug = await findAcceptedSignatureAugmentation({
			purl: purlKey,
			file: component.file,
			symbol: component.symbol,
		});
		const augSig = aug?.claims.signature;
		if (augSig) {
			signature = {
				match: true,
				skipped: false,
				reason: "augmented signature (agent-extracted, human-confirmed)",
				claimed: sig.claimed,
				inferred: sig.inferred,
				augmented: augSig,
			};
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
		{ ...withStoreType, signature },
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
	if (r.construct?.augmented) {
		return {
			category: "construct_augmented",
			detail: `claimed ${r.construct.claimed}, graphify inferred ${r.construct.inferred}, agent-confirmed`,
		};
	}
	if (r.storeTypeUndeclared) {
		return { category: "store_type_undeclared" };
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
		if (r.signature.augmented) {
			return {
				category: "signature_augmented",
				detail: "agent-extracted, human-confirmed",
			};
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
	opts?: { dryRun?: boolean },
): Promise<
	| { ok: true; data: SubsystemModelVerificationSummary }
	| { ok: false; error: string }
> {
	const graph = await getSubsystemModel(graphId);
	if (!graph) return { ok: false, error: `unknown graph: ${graphId}` };

	const results: SubsystemModelVerificationSummary["results"] = [];
	const tally: Record<string, number> = {};
	const graphifyCache: GraphifyPassCache = new Map();
	const treeCache: SpanTreeCache = new Map();
	for (const c of graph.components) {
		const r = await verifySubsystemComponent(graphId, c.alias, {
			...opts,
			graphifyCache,
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
	const missingFileAliases = new Set(files.missing.map((m) => m.componentAlias));

	const findings: SubsystemModelAuditFinding[] = [];
	const checks: SubsystemModelAuditCheck[] = [];

	// One parsed graphify graph per purl for the whole pass — shared by the
	// per-component loop and the topology pass below.
	const graphifyCache: GraphifyPassCache = new Map();
	// One parsed tree-sitter tree per file for the whole pass.
	const treeCache: SpanTreeCache = new Map();

	// missing_file findings are attached in the per-component loop so we can
	// include a deterministic Graphify file-relocate fix when available.
	// Symbol presence is graphify-only (exact anchor).

	let unresolved = 0;
	let staleDeclarations = 0;
	let constructMismatches = 0;
	let signatureMismatches = 0;
	let weakAnchors = 0;
	let okComponents = 0;
	let filesVerified = 0;
	let symbolsVerified = 0;
	let declarationsFresh = 0;
	let constructsMatched = 0;
	let signaturesMatched = 0;
	let anchorsExact = 0;
	let externalsSkipped = 0;
	let missingSymbols = 0;

	const seenComponentIssue = new Set<string>([...missingFileAliases]);
	// Availability findings are per-repo (purl), not per-component: one finding
	// per unavailable repo rather than one per node that lives in it.
	const repoUnresolvedPurls = new Set<string>();
	const cacheUnavailablePurls = new Set<string>();

	for (const c of graph.components) {
		// A deprecated claim's source is gone upstream — deliberately, with a
		// commit recorded. Verifying it would only re-derive the deletion the
		// deprecation already states, as an unfixable `missing_file`. Skip it so
		// the model converges and a cleanup pass can drain the marker instead.
		if (c.deprecated) {
			externalsSkipped++;
			okComponents++;
			checks.push({
				componentAlias: c.alias,
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
				note: c.removedIn?.commit
					? `deprecated — removed in ${c.removedIn.commit}`
					: "deprecated — source removed upstream",
			});
			continue;
		}

		// A claim anchored into an install root is a third-party dependency
		// wearing a repo-relative path: `node_modules/` is gitignored and its
		// layout depends on hoisting, so the file can never resolve against the
		// checkout named by `purl`. There is nothing to verify here — count it as
		// n/a and report the rewrite, rather than leaving it as an environment
		// `blocked` claim no proposal can close. Checked before the external skip
		// because an external may carry such a path too, and the path is the
		// defect either way. `validateSubsystemModelCrossField` rejects new ones
		// at write time; this pass is for models stored before it.
		const dependency = installedDependencyPackage(c.file);
		if (dependency) {
			externalsSkipped++;
			okComponents++;
			findings.push({
				kind: "third_party_path",
				severity: "info",
				componentAlias: c.alias,
				componentName: c.name,
				message: `File ${c.file} points into node_modules — installed artifacts are not part of the repo and cannot be verified. Model ${dependency.packageName} as construct "external" with purl "pkg:npm/${dependency.packageName}" and no file, or anchor the claim to the package's real source.`,
			});
			checks.push({
				componentAlias: c.alias,
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
				note: `installed dependency (${dependency.packageName}) — no repo source declaration check`,
			});
			continue;
		}

		if (c.construct === "external" || c.construct === "custom_entity") {
			externalsSkipped++;
			okComponents++;
			checks.push({
				componentAlias: c.alias,
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
				note: "external / custom entity — no source declaration check",
			});
			continue;
		}

		const r = await verifySubsystemComponent(graphId, c.alias, {
			dryRun: true,
			graphifyCache,
			treeCache,
		});
		let issue = seenComponentIssue.has(c.alias);

		const check: SubsystemModelAuditCheck = {
			componentAlias: c.alias,
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
			const purl = (c.purl || "").trim();
			const repoPurl = isRepoPurl(purl);
			check.fileExists = null;
			check.graphify = "unavailable";
			check.note = repoPurl
				? `No local repoRoot for ${purl || c.file || c.alias}`
				: `Internal / declaration-only — no code repo for ${purl || c.alias}`;
			check.verdict = "skipped";
			if (repoPurl && !repoUnresolvedPurls.has(purl)) {
				repoUnresolvedPurls.add(purl);
				findings.push({
					kind: "repo_unresolved",
					severity: "info",
					purl,
					message: `Repo ${purl} is not available locally — clone it to verify its components`,
				});
				unresolved++;
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
				componentAlias: c.alias,
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
			if (r.declaration.freshness === "full") declarationsFresh++;
			if (r.declaration.freshness === "unanchored") {
				// An unanchored claim whose declaration span tree-sitter can pin
				// exactly is a deterministic one-click capture, not a hard failure.
				// Only the residual that needs source judgment stays an error.
				const derivedFix = adoptTreeSitterSpanFixFromVerify(r.declaration);
				if (derivedFix) {
					findings.push({
						kind: "construct_span_capturable",
						severity: "info",
						componentAlias: c.alias,
						componentName: c.name,
						message: `No span captured, but the declaration is derivable — ${derivedFix.label}.`,
						fix: derivedFix,
					});
				} else {
					// A hard failure: no captured span and tree-sitter could not
					// derive one deterministically — the agent lane must mint it.
					issue = true;
					const deriv = r.declaration.derivation;
					const why = deriv?.failedGates?.length
						? ` (derivation ${deriv.class}: ${deriv.failedGates.join(", ")})`
						: "";
					findings.push({
						kind: "construct_span_unconfirmed",
						severity: "error",
						componentAlias: c.alias,
						componentName: c.name,
						message: `No source span captured — capture a span (start/end/content hash) from source to verify this construct.${why}`,
					});
					seenComponentIssue.add(c.alias);
				}
			}
			if (r.declaration.freshness === "stale") {
				// A warning: the span was captured but drifted. A content-preserving
				// move carries a one-click re-pin; a content change needs the agent.
				const stored = c.declarationSpan;
				const fix = adoptGraphifyDeclarationRefFixFromVerify(
					c,
					r.declaration,
					r.anchor,
				);
				findings.push({
					kind: "construct_span_stale",
					severity: "info",
					componentAlias: c.alias,
					componentName: c.name,
					message: fix
						? `Declaration moved — Graphify pins L${fix.declarationSpan.startLine}${
								stored ? ` (model had L${stored.startLine})` : ""
							}`
						: `Declaration span no longer matches source — the content changed (stored L${stored?.startLine ?? "?"}).`,
					fix,
				});
				staleDeclarations++;
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
				componentAlias: c.alias,
				componentName: c.name,
				message: `Construct unclassified — claimed ${r.construct?.claimed ?? c.construct ?? "?"}; classify it from source.${
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
				componentAlias: c.alias,
				componentName: c.name,
				message: r.error ?? "Construct mismatch",
			});
			constructMismatches++;
			seenComponentIssue.add(c.alias);
		}

		// Store completeness — an in-memory store that declares no type, and a
		// store whose declared type may have drifted. Both are gaps (info), never
		// issues: the construct-verifier reads the declaration and (re-)authors
		// `declaration.valueType`. Mutually exclusive by construction.
		if (c.construct === "store") {
			if (storeTypeStale(c, r.declaration?.freshness)) {
				check.storeType = "stale";
				findings.push({
					kind: "store_type_stale",
					severity: "info",
					componentAlias: c.alias,
					componentName: c.name,
					message: `Store declaration moved — its declared value type may be out of date; re-read the declaration and re-propose \`declaration.valueType\` if the type changed.`,
				});
			} else {
				check.storeType = r.storeTypeUndeclared ? "undeclared" : "declared";
			}
		} else {
			check.storeType = "n/a";
		}
		if (r.storeTypeUndeclared) {
			findings.push({
				kind: "store_type_undeclared",
				severity: "info",
				componentAlias: c.alias,
				componentName: c.name,
				message:
					"In-memory store declares no type — read the state declaration and claim `declaration.valueType` (e.g. `Map<string, FeedState>`) or name its state members.",
			});
		}

		if (r.signature) {
			if (r.signature.skipped) check.signature = "skipped";
			else if (r.signature.augmented) {
				check.signature = "augmented";
				signaturesMatched++;
			} else if (r.signature.match) {
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
				componentAlias: c.alias,
				componentName: c.name,
				message:
					"Signature could not be confirmed automatically — claim the declared signature from source.",
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
				componentAlias: c.alias,
				componentName: c.name,
				message: fix
					? `${r.error ?? "Signature mismatch"} — model has no named types; graphify does (deterministic fill available)`
					: (r.error ?? "Signature mismatch"),
				fix,
			});
			signatureMismatches++;
			seenComponentIssue.add(c.alias);
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
				const base = { componentAlias: c.alias, componentName: c.name };
				if (resolution === "ambiguous") {
					issue = true;
					findings.push({
						...base,
						kind: "symbol_ambiguous",
						severity: "error",
						message: `Multiple Graphify nodes match ${c.symbol} (${r.anchor?.candidates?.length ?? 0} candidates)`,
					});
					seenComponentIssue.add(c.alias);
				} else {
					// A claimed symbol with no matching declaration is a broken
					// claim, not a confirmation gap: the file exists but nothing in
					// it declares the symbol. Error severity routes it to the
					// construct-fixer (the agent that can relocate, rename, or
					// deprecate), the same lane as a missing file. `issue = true`
					// marks the check a hard failure so the lane reads red, not
					// the yellow of an unconfirmed claim.
					issue = true;
					findings.push({
						...base,
						kind: "symbol_unmatched",
						severity: "error",
						message: `No Graphify node matches symbol ${c.symbol} in ${c.file}`,
					});
					seenComponentIssue.add(c.alias);
				}
				weakAnchors++;
			}
		} else if (r.cache && r.cache.status !== "ready") {
			check.anchor = "n/a";
			check.graphify = "unavailable";
			check.note = `Graphify cache ${r.cache.status}`;
			const purl = r.cache.purl;
			if (purl && !cacheUnavailablePurls.has(purl)) {
				cacheUnavailablePurls.add(purl);
				findings.push({
					kind: "graphify_unavailable",
					severity: "info",
					purl,
					message: `Graphify cache ${r.cache.status} for ${purl} — build it to verify constructs and anchors`,
				});
				unresolved++;
			}
		} else {
			check.graphify = "unavailable";
		}

		check.verdict = issue ? "issue" : "ok";
		if (!issue && r.ok) okComponents++;
		checks.push(check);
	}

	// --- Boundary membership: process (runtime) + module (containment) ---
	const augmentedModuleAliases = new Set<string>();
	for (const c of graph.components) {
		const mod = c.module?.trim();
		if (!mod || !c.file?.trim() || !c.symbol?.trim()) continue;
		const purl = c.purl?.trim();
		if (!purl || purl === "external") continue;
		const hit = await findAcceptedModuleAugmentation({
			purl,
			file: c.file,
			symbol: c.symbol,
			module: mod,
		});
		if (hit) augmentedModuleAliases.add(c.alias);
	}

	const boundary = auditBoundaryFields(graph.components, {
		augmentedModuleAliases,
	});

	// Process-boundary verification — read the accepted element set(s) for the
	// repos this model references. Same read the renderer's issues list does,
	// so the audit and the UI speak one vocabulary. Kept per-repo for the
	// backing check (a component can only be assigned to its own repo's
	// containers); merged for the boundary read (a container claiming a
	// process may live in any of the sets).
	const backingSets = new Map<string, C4Element[]>();
	for (const c of graph.components) {
		const repoKey = purlRepoKey(c.purl);
		if (!repoKey || backingSets.has(repoKey)) continue;
		backingSets.set(repoKey, (await readC4ElementSet(repoKey)).elements);
	}
	const processVerification = auditProcessVerification(
		graph.components,
		[...backingSets.values()].flat(),
	);
	boundary.checks.push(...processVerification.checks);

	// Container-first rule: a process gap with no accepted container to assign
	// from stays open until the container-verifier gets one accepted.
	const backingFindings = auditProcessBacking(graph.components, backingSets);
	// One finding per claim-less component: an unbacked gap subsumes the plain
	// missing finding for the same component (see the helper). All three
	// boundary passes merge here so the dedupe sees every missing emitter —
	// the boundary pass emits missing, verification emits unassigned/
	// proposed/rejected, backing emits unbacked.
	const processFindings = dropUnbackedMissing([
		...boundary.findings,
		...processVerification.findings,
		...backingFindings,
	]);
	for (const f of processFindings) {
		findings.push({
			kind: f.kind,
			severity: f.severity,
			processKey: f.processKey,
			componentAlias: f.componentAlias,
			componentName: f.componentName,
			moduleKey: f.moduleKey,
			message: f.message,
		});
	}

	// Trail step verification via call site augmentations
	let stepsVerified = 0;
	let stepsUnconfirmed = 0;
	let stepsStale = 0;
	const componentByAlias = new Map(graph.components.map((c) => [c.alias, c]));

	for (const trail of graph.trails ?? []) {
		for (let stepIndex = 0; stepIndex < trail.steps.length; stepIndex++) {
			const step = trail.steps[stepIndex]!;
			const toComponent = componentByAlias.get(step.to);
			const fromComponent = componentByAlias.get(step.from);

			// A calls step's site is the caller frame, so the portable schema
			// requires it. Surface stored models from before that requirement
			// as a hard gap so the UI can drive the fix.
			if (step.mechanism === "calls" && !step.site) {
				findings.push({
					kind: "step_site_unconfirmed",
					severity: "error",
					trailId: trail.id,
					step: stepIndex,
					message: `Trail "${trail.title}" step ${stepIndex + 1}: calls step has no site construct (${step.from} → ${step.to}); add the enclosing caller declaration.`,
				});
			}

			// The step's site purl determines the repo.
			const stepPurl = step.purl?.trim();
			if (!stepPurl || !isRepoPurl(stepPurl)) continue;

			const repoRoot = resolveRepoRootForPurl(stepPurl);
			if (!repoRoot) continue;

			// Prefer the step's own span; fall back to the accepted call-site
			// augmentation — the capture lane that mints it.
			let span = step.span;
			if (!span && toComponent?.file?.trim() && toComponent?.symbol?.trim()) {
				const aug = await findAcceptedCallSiteAugmentation({
					purl: stepPurl,
					file: step.file,
					symbol: step.symbol,
					targetFile: toComponent.file,
					targetSymbol: toComponent.symbol,
					mechanism: step.mechanism,
				});
				const claim = aug?.claims.callSite;
				if (claim) {
					span = {
						startLine: claim.lines.start,
						endLine: claim.lines.end,
						contentHash: claim.contentHash,
					};
				}
			}

			if (!span) {
				// No captured span — the step is unconfirmed (a gap, not a failure).
				stepsUnconfirmed++;
				findings.push({
					kind: "step_span_unconfirmed",
					severity: "error",
					trailId: trail.id,
					step: stepIndex,
					message: `Trail "${trail.title}" step ${stepIndex + 1}: step span not captured (${step.from} → ${step.to} via ${step.mechanism})`,
				});
				continue;
			}

			// `calls` claims the site lives in the source construct. When the
			// code is actually in a helper/child component, the honest label is
			// `uses` (a logical dependency) or the caller must be modeled and
			// `from` changed. Informational for now so existing models can be
			// reclassified without failing their audits.
			if (callsSiteOutsideFrom(step, fromComponent)) {
				const fromFile = fromComponent?.file?.trim();
				findings.push({
					kind: "step_site_outside_from",
					severity: "info",
					trailId: trail.id,
					step: stepIndex,
					message: `Trail "${trail.title}" step ${stepIndex + 1}: calls site is in ${step.file}${step.symbol ? ` (${step.symbol})` : ""}, outside ${step.from}${fromFile ? ` (${fromFile})` : ""}; use mechanism "uses" or model the caller and change "from".`,
				});
			}

			const filePath = join(repoRoot, step.file);
			try {
				const content = await fs.readFile(filePath, "utf8");
				const currentHash = hashContentRange(
					content,
					span.startLine,
					span.endLine,
				);
				if (currentHash === span.contentHash) {
					stepsVerified++;
				} else {
					stepsStale++;
					findings.push({
						kind: "step_span_stale",
						severity: "info",
						trailId: trail.id,
						step: stepIndex,
						message: `Trail "${trail.title}" step ${stepIndex + 1}: step span changed since verification (lines ${span.startLine}-${span.endLine} in ${step.file})`,
					});
				}

				// The resolved site construct is the caller/via frame. Verify it
				// independently: the range must be a real declaration, the hash
				// fresh, and the seam line inside it.
				if (step.site) {
					const site = step.site;
					const siteHash = hashContentRange(
						content,
						site.span.startLine,
						site.span.endLine,
					);
					if (siteHash !== site.span.contentHash) {
						findings.push({
							kind: "step_site_stale",
							severity: "info",
							trailId: trail.id,
							step: stepIndex,
							message: `Trail "${trail.title}" step ${stepIndex + 1}: site construct ${site.symbol} changed since it was captured (lines ${site.span.startLine}-${site.span.endLine} in ${step.file}).`,
						});
					}
					const resolvedSite = await enclosingDeclaration({
						repoRoot,
						file: step.file,
						line: site.span.startLine,
					}).catch(() => null);
					if (
						!resolvedSite ||
						resolvedSite.symbol !== site.symbol ||
						resolvedSite.startLine !== site.span.startLine ||
						resolvedSite.endLine !== site.span.endLine
					) {
						findings.push({
							kind: "step_site_mismatch",
							severity: "info",
							trailId: trail.id,
							step: stepIndex,
							message: `Trail "${trail.title}" step ${stepIndex + 1}: site construct ${site.symbol} does not resolve to ${step.file}:${site.span.startLine}-${site.span.endLine}${resolvedSite ? ` (found ${resolvedSite.symbol} at ${resolvedSite.startLine}-${resolvedSite.endLine})` : ""}.`,
						});
					}
					if (
						step.span &&
						!(
							site.span.startLine <= step.span.startLine &&
							step.span.endLine <= site.span.endLine
						)
					) {
						findings.push({
							kind: "step_site_mismatch",
							severity: "info",
							trailId: trail.id,
							step: stepIndex,
							message: `Trail "${trail.title}" step ${stepIndex + 1}: site construct ${site.symbol} (${site.span.startLine}-${site.span.endLine}) does not contain the seam (${step.span.startLine}-${step.span.endLine}).`,
						});
					}
				}

				// The target construct lives in its own repo/file. Verify its
				// declaration and hash when the target was resolved.
				if (step.target) {
					const target = step.target;
					const targetRoot = target.purl?.trim()
						? resolveRepoRootForPurl(target.purl)
						: null;
					if (targetRoot) {
						try {
							const targetContent = await fs.readFile(
								join(targetRoot, target.file),
								"utf8",
							);
							if (target.span) {
								const targetHash = hashContentRange(
									targetContent,
									target.span.startLine,
									target.span.endLine,
								);
								if (targetHash !== target.span.contentHash) {
									findings.push({
										kind: "step_target_stale",
										severity: "info",
										trailId: trail.id,
										step: stepIndex,
										message: `Trail "${trail.title}" step ${stepIndex + 1}: target construct ${target.symbol} changed since it was captured (lines ${target.span.startLine}-${target.span.endLine} in ${target.file}).`,
									});
								}
							}
							const resolvedTarget = await declarationForSymbol({
								repoRoot: targetRoot,
								file: target.file,
								symbol: target.symbol,
							});
							if (!resolvedTarget) {
								findings.push({
									kind: "step_target_mismatch",
									severity: "info",
									trailId: trail.id,
									step: stepIndex,
									message: `Trail "${trail.title}" step ${stepIndex + 1}: target construct ${target.symbol} does not resolve in ${target.file}.`,
								});
							} else if (
								target.span &&
								(resolvedTarget.startLine !== target.span.startLine ||
									resolvedTarget.endLine !== target.span.endLine)
							) {
								findings.push({
									kind: "step_target_mismatch",
									severity: "info",
									trailId: trail.id,
									step: stepIndex,
									message: `Trail "${trail.title}" step ${stepIndex + 1}: target construct ${target.symbol} resolves to ${resolvedTarget.startLine}-${resolvedTarget.endLine}, but the step claims ${target.span.startLine}-${target.span.endLine}.`,
								});
							}
						} catch {
							// Target checkout/file unreadable — reported by the repo/file
							// lanes (or simply not available locally). Do not invent a
							// mismatch from a missing checkpoint.
						}
					}
				}
			} catch {
				// File doesn't exist or can't be read — already covered by mechanical checks
				continue;
			}
		}
	}

	const summary = {
		components: graph.components.length,
		filesVerified,
		symbolsVerified,
		declarationsFresh,
		constructsMatched,
		signaturesMatched,
		anchorsExact,
		graphifyConfirmed: anchorsExact,
		externalsSkipped,
		missingFiles: files.missingCount,
		missingSymbols,
		trailFailures: 0,
		stepsUnconfirmed,
		stepsStale,
		stepsVerified,
		staleDeclarations,
		constructMismatches,
		signatureMismatches,
		weakAnchors,
		unresolved,
		ok: okComponents,
		modulesClaimed: boundary.summary.modulesClaimed,
		moduleFileOk: boundary.summary.moduleFileOk,
		moduleFileMismatch: boundary.summary.moduleFileMismatch,
		processNestsChecked: boundary.summary.processNestsChecked,
		processNestOk: boundary.summary.processNestOk,
		processNestDisagree: boundary.summary.processNestDisagree,
		processRequired: boundary.summary.processRequired,
		processClaimed: boundary.summary.processClaimed,
		processMissing: boundary.summary.processMissing,
	};

	const needsUpdate = findings.some((f) => f.severity === "error");

	const report: SubsystemModelAuditReport = {
		graphId,
		title: graph.title,
		checkedAt: new Date().toISOString(),
		needsUpdate,
		summary,
		checks,
		boundaryChecks: boundary.checks,
		findings,
	};

	const graphify = await assessSubsystemGraphifyReadiness(graph);
	const fingerprint = await buildAuditFingerprint({
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

	// Provenance: a full pass earns the verified pin, but only against a clean
	// referenced state. A dirty anchored file means the proven state has no
	// reproducible commit, so we leave verifiedAtCommits unstamped.
	if (classifyAuditReport(report) === "fully_verified") {
		try {
			if (await referencedFilesClean(graph.components, graph.trails)) {
				const commits = await capturePurlCommits(graph.components);
				await stampVerifiedCommits(graphId, commits);
			}
		} catch (err) {
			console.warn(
				`[audit] failed to stamp verified commits for ${graphId}: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
		}
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


