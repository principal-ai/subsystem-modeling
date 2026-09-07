/**
 * Host-side verify for one subsystem component: filesystem + graphify anchor
 * + kind check (after exact anchor).
 */

import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
	resolveComponentAnchor,
	type ComponentAnchorResult,
} from "../../../subsystems-react/src/graphify/anchor";
import { inferGraphifyKind, kindsMatch } from "../../../subsystems-react/src/graphify/kind";
import {
	compareSignatures,
	extractGraphifySignature,
} from "../../../subsystems-react/src/graphify/signature";
import type {
	GraphifyEdge,
	GraphifyNode,
} from "../../../subsystems-react/src/graphify/types";
import type { SubsystemComponentVerificationResult } from "../shared/contract";
import {
	buildDeclarationRef,
	hashDeclarationLineFromContent,
	parseSourceLocation,
	type SubsystemDeclarationRef,
} from "./declaration-ref";
import { loadGraphifyGraph } from "./graphify-runner";
import {
	assessSubsystemGraphifyReadiness,
	getCachedGraphifyGraph,
	resolveRepoRootForPurl,
} from "./graphify-store";
import {
	fileDeclaresSymbol,
	getSubsystemModel,
	purlRepoKey,
	resolveRepoRootForComponent,
	updateSubsystemModel,
} from "./subsystem-model-store";
import type { SubsystemComponent } from "../shared/contract";

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

	await updateSubsystemModel(graphId, {
		components: components.map((c) =>
			c.id === component.id ? { ...c, declarationRef: ref } : c,
		),
	});

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
): Promise<SubsystemComponentVerificationResult> {
	if (!anchor) return result;
	const declaration = await captureDeclaration(
		graphId,
		components,
		component,
		anchor,
		fileContent,
		repoRoot,
	);
	return declaration ? { ...result, declaration } : result;
}

export async function verifySubsystemComponent(
	graphId: string,
	componentId: string,
): Promise<SubsystemComponentVerificationResult> {
	const graph = await getSubsystemModel(graphId);
	if (!graph) {
		return { ok: false, error: `unknown graph: ${graphId}` };
	}
	const component = graph.components.find((c) => c.id === componentId);
	if (!component) {
		return { ok: false, error: `unknown component: ${componentId}`, componentId };
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
			if (typeof component.symbol === "string" && component.symbol.trim()) {
				fileResult.symbolDeclared = fileDeclaresSymbol(fileContent, component.symbol);
			}
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

	const base: SubsystemComponentVerificationResult = {
		ok: true,
		componentId,
		file: fileResult,
		cache,
		anchor: mapAnchor(anchor),
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
		);
	}

	const inferred = inferGraphifyKind(anchor.node, edges);
	const claimed = String(component.construct ?? "");
	const match =
		kindsMatch(claimed, inferred.kind) && inferred.kind !== "unknown";
	const construct: NonNullable<SubsystemComponentVerificationResult["construct"]> = {
		claimed,
		inferred: inferred.kind,
		match,
		evidence: inferred.evidence,
	};

	if (inferred.kind === "unknown") {
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
				code: "construct_unknown",
				error: `construct unknown for anchored node (claimed ${claimed})`,
				construct,
			},
		);
	}
	if (!kindsMatch(claimed, inferred.kind)) {
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
				error: `kind mismatch: claimed ${claimed}, inferred ${inferred.kind}`,
				construct,
			},
		);
	}

	const withKind: SubsystemComponentVerificationResult = { ...base, kind };

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
		);
	}

	const nodesById = new Map(nodes.map((n) => [String(n.id), n]));
	const inferredSig = extractGraphifySignature(
		String(anchor.node.id),
		edges,
		nodesById,
	);
	const claimedForCompare =
		component.detail &&
		(component.detail.kind === "function" || component.detail.kind === "method")
			? {
					parameters:
						"parameters" in component.detail
							? (component.detail.parameters as Array<{
									name?: string;
									type: string;
								}>)
							: undefined,
					returnType:
						"returnType" in component.detail
							? (component.detail.returnType as string | undefined)
							: undefined,
				}
			: undefined;

	const sig = compareSignatures(claimedForCompare, inferredSig);
	const signature: NonNullable<SubsystemComponentVerificationResult["signature"]> =
		{
			match: sig.match,
			skipped: sig.skipped,
			reason: sig.reason,
			skipCode: sig.skipCode,
			claimed: sig.claimed,
			inferred: sig.inferred,
		};

	if (!sig.match && !sig.skipped) {
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
			case "construct_unknown":
				return { category: "construct_unknown", detail: r.construct?.inferred };
			case "construct_mismatch":
				return {
					category: "construct_mismatch",
					detail: `claimed ${r.kind?.claimed}, inferred ${r.kind?.inferred}`,
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
	return { category: "kind_only" };
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
		kind?: string;
		file?: string;
		symbol?: string;
		verdict: string;
		detail?: string;
		cache?: { status?: string; purl?: string; repoRoot?: string };
		signature?: SubsystemComponentVerificationResult["signature"];
		kindInfo?: SubsystemComponentVerificationResult["kind"];
		anchorResolution?: string;
	}>;
}

/** Verify every component of a subsystem graph (host-side verify machinery). */
export async function verifySubsystemModel(
	graphId: string,
): Promise<
	| { ok: true; data: SubsystemModelVerificationSummary }
	| { ok: false; error: string }
> {
	const graph = await getSubsystemModel(graphId);
	if (!graph) return { ok: false, error: `unknown graph: ${graphId}` };

	const results: SubsystemModelVerificationSummary["results"] = [];
	const tally: Record<string, number> = {};
	for (const c of graph.components) {
		const r = await verifySubsystemComponent(graphId, c.id);
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
			kindInfo: r.kind,
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
