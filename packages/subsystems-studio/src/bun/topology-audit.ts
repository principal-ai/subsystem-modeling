/**
 * Topology (relations[]) audit helpers — mechanical endpoint checks plus
 * soft Graphify corroboration for relation types Graphify emits well.
 *
 * Soft rule: Graphify evidence can confirm a claim, but absence is a gap
 * (never a hard issue). Graphify is incomplete, especially for externals.
 */

import type {
	SubsystemComponent,
	SubsystemRelation,
	SubsystemRelationType,
} from "@principal-ai/subsystems-core";
import { resolveComponentAnchor } from "../../../subsystems-react/src/graphify/anchor";
import type {
	GraphifyEdge,
	GraphifyNode,
} from "../../../subsystems-react/src/graphify/types";

/** Graphify relation verbs that corroborate a model `imports` claim. */
export const GRAPHIFY_IMPORT_RELATIONS = new Set([
	"imports",
	"imports_from",
	"re_exports",
]);

/**
 * How a model `relationType` soft-maps onto Graphify edge verbs.
 * Types omitted here get endpoints-only (none today — full Set A is covered).
 */
export type SoftCorroborationSpec = {
	/** Graphify `relation` values that count as evidence. */
	graphifyRelations: ReadonlySet<string>;
	/** When true, either edge direction matches (import extractors vary). */
	eitherDirection: boolean;
	/** Allow external/unanchored targets via label/id hints (imports). */
	externalHints: boolean;
};

export const SOFT_CORROBORATION_BY_RELATION_TYPE: Record<
	SubsystemRelationType,
	SoftCorroborationSpec
> = {
	imports: {
		graphifyRelations: GRAPHIFY_IMPORT_RELATIONS,
		eitherDirection: true,
		externalHints: true,
	},
	method: {
		graphifyRelations: new Set(["method"]),
		eitherDirection: false,
		externalHints: false,
	},
	extends: {
		graphifyRelations: new Set(["inherits"]),
		eitherDirection: false,
		externalHints: false,
	},
	inherits: {
		graphifyRelations: new Set(["inherits"]),
		eitherDirection: false,
		externalHints: false,
	},
	implements: {
		graphifyRelations: new Set(["implements"]),
		eitherDirection: false,
		externalHints: false,
	},
	mixes_in: {
		graphifyRelations: new Set(["mixes_in"]),
		eitherDirection: false,
		externalHints: false,
	},
	references: {
		graphifyRelations: new Set(["references"]),
		eitherDirection: true,
		externalHints: false,
	},
};

export type TopologyRelationGraphify =
	| "confirmed"
	| "unconfirmed"
	| "unavailable"
	| "skipped"
	| "n/a";

export type TopologyRelationVerdict = "ok" | "issue" | "gap" | "skipped";

export interface TopologyRelationCheck {
	relationId: string;
	relationType: string;
	from: string;
	to: string;
	/** Soft Graphify corroboration. */
	graphify: TopologyRelationGraphify;
	verdict: TopologyRelationVerdict;
	note?: string;
}

export interface TopologyAuditFinding {
	kind: "topology_broken_endpoint" | "topology_relation_unconfirmed";
	severity: "error" | "info";
	relationId: string;
	from: string;
	to: string;
	message: string;
}

export interface TopologyAuditResult {
	checks: TopologyRelationCheck[];
	findings: TopologyAuditFinding[];
	summary: {
		relations: number;
		/** Soft Graphify checks attempted (all covered relationTypes). */
		softChecked: number;
		softConfirmed: number;
		softUnconfirmed: number;
		/** Imports subset — kept for summary UI / older callers. */
		importsChecked: number;
		importsConfirmed: number;
		importsUnconfirmed: number;
		brokenEndpoints: number;
	};
}

export interface GraphifyBundle {
	nodes: GraphifyNode[];
	edges: GraphifyEdge[];
}

function componentByAlias(
	components: readonly SubsystemComponent[],
): Map<string, SubsystemComponent> {
	return new Map(components.map((c) => [c.alias, c]));
}

function purlKey(purl: string | undefined): string | undefined {
	if (!purl) return undefined;
	const base = purl.split("#")[0]?.trim();
	return base || undefined;
}

/**
 * True when a Graphify edge in `allowed` connects the two node ids.
 * `eitherDirection` covers extractors that reverse source/target.
 */
export function graphifyHasRelationBetween(
	edges: readonly GraphifyEdge[],
	fromNodeId: string,
	toNodeId: string,
	allowed: ReadonlySet<string>,
	eitherDirection: boolean,
): boolean {
	for (const e of edges) {
		if (!allowed.has(String(e.relation))) continue;
		const s = String(e.source);
		const t = String(e.target);
		if (s === fromNodeId && t === toNodeId) return true;
		if (eitherDirection && s === toNodeId && t === fromNodeId) return true;
	}
	return false;
}

/** @deprecated Prefer graphifyHasRelationBetween — kept for existing tests. */
export function graphifyHasImportBetween(
	edges: readonly GraphifyEdge[],
	fromNodeId: string,
	toNodeId: string,
): boolean {
	return graphifyHasRelationBetween(
		edges,
		fromNodeId,
		toNodeId,
		GRAPHIFY_IMPORT_RELATIONS,
		true,
	);
}

/**
 * Soft match for edges into an external / unanchored target: any allowed
 * edge from `fromNodeId` whose target label/id looks like one of the hints.
 */
export function graphifyHasRelationTowardHints(
	edges: readonly GraphifyEdge[],
	nodes: readonly GraphifyNode[],
	fromNodeId: string,
	hints: readonly string[],
	allowed: ReadonlySet<string>,
): boolean {
	const normalized = hints
		.map((h) => h.trim().toLowerCase())
		.filter((h) => h.length > 0);
	if (normalized.length === 0) return false;

	const byId = new Map(nodes.map((n) => [String(n.id), n]));

	for (const e of edges) {
		if (String(e.source) !== fromNodeId) continue;
		if (!allowed.has(String(e.relation))) continue;
		const targetId = String(e.target);
		const target = byId.get(targetId);
		const haystacks = [
			targetId.toLowerCase(),
			String(target?.label ?? "")
				.trim()
				.toLowerCase(),
			String(target?.source_file ?? "")
				.trim()
				.toLowerCase(),
		].filter(Boolean);

		for (const hint of normalized) {
			for (const hay of haystacks) {
				if (hay.includes(hint) || hint.includes(hay)) return true;
			}
		}
	}
	return false;
}

/** @deprecated Prefer graphifyHasRelationTowardHints. */
export function graphifyHasImportTowardHints(
	edges: readonly GraphifyEdge[],
	nodes: readonly GraphifyNode[],
	fromNodeId: string,
	hints: readonly string[],
): boolean {
	return graphifyHasRelationTowardHints(
		edges,
		nodes,
		fromNodeId,
		hints,
		GRAPHIFY_IMPORT_RELATIONS,
	);
}

function externalHints(comp: SubsystemComponent): string[] {
	return [comp.alias, comp.name, comp.symbol ?? "", comp.purl ?? ""].filter(
		(s) => s.trim().length > 0 && s !== "external",
	);
}

function softSpecFor(
	relationType: string,
): SoftCorroborationSpec | undefined {
	if (relationType in SOFT_CORROBORATION_BY_RELATION_TYPE) {
		return SOFT_CORROBORATION_BY_RELATION_TYPE[
			relationType as SubsystemRelationType
		];
	}
	return undefined;
}

/**
 * Audit topology relations: endpoint integrity for all, soft Graphify
 * corroboration for every covered relationType when caches are available.
 *
 * `bundlesByPurl` maps purl repo keys → Graphify nodes/edges already loaded
 * for this audit (omit or null entry = unavailable).
 *
 * `augmentedRelationIds` — relation ids with an accepted relation
 * corroboration augmentation; treated as soft-confirmed when Graphify is thin.
 */
export function auditTopologyRelations(
	components: readonly SubsystemComponent[],
	relations: readonly SubsystemRelation[],
	bundlesByPurl: ReadonlyMap<string, GraphifyBundle | null>,
	opts?: { augmentedRelationIds?: ReadonlySet<string> },
): TopologyAuditResult {
	const byAlias = componentByAlias(components);
	const augmented = opts?.augmentedRelationIds;
	const checks: TopologyRelationCheck[] = [];
	const findings: TopologyAuditFinding[] = [];
	let softChecked = 0;
	let softConfirmed = 0;
	let softUnconfirmed = 0;
	let importsChecked = 0;
	let importsConfirmed = 0;
	let importsUnconfirmed = 0;
	let brokenEndpoints = 0;

	const getBundle = (purl: string | undefined): GraphifyBundle | null => {
		const key = purlKey(purl);
		if (!key || key === "external") return null;
		return bundlesByPurl.get(key) ?? null;
	};

	const pushConfirmed = (
		rel: SubsystemRelation,
		note: string,
	) => {
		softConfirmed++;
		if (rel.relationType === "imports") importsConfirmed++;
		checks.push({
			relationId: rel.id,
			relationType: rel.relationType,
			from: rel.from,
			to: rel.to,
			graphify: "confirmed",
			verdict: "ok",
			note,
		});
	};

	const pushUnconfirmed = (
		rel: SubsystemRelation,
		graphify: TopologyRelationGraphify,
		note: string,
	) => {
		if (augmented?.has(rel.id)) {
			pushConfirmed(rel, `relation confirmed (augmented) — ${note}`);
			return;
		}
		softUnconfirmed++;
		if (rel.relationType === "imports") importsUnconfirmed++;
		checks.push({
			relationId: rel.id,
			relationType: rel.relationType,
			from: rel.from,
			to: rel.to,
			graphify,
			verdict: "gap",
			note,
		});
		findings.push({
			kind: "topology_relation_unconfirmed",
			severity: "info",
			relationId: rel.id,
			from: rel.from,
			to: rel.to,
			message: note,
		});
	};

	for (const rel of relations) {
		const fromComp = byAlias.get(rel.from);
		const toComp = byAlias.get(rel.to);
		if (!fromComp || !toComp) {
			brokenEndpoints++;
			const missing = [
				!fromComp ? `from=${JSON.stringify(rel.from)}` : null,
				!toComp ? `to=${JSON.stringify(rel.to)}` : null,
			]
				.filter(Boolean)
				.join(", ");
			const note = `Broken relation endpoints (${missing})`;
			checks.push({
				relationId: rel.id,
				relationType: rel.relationType,
				from: rel.from,
				to: rel.to,
				graphify: "n/a",
				verdict: "issue",
				note,
			});
			findings.push({
				kind: "topology_broken_endpoint",
				severity: "error",
				relationId: rel.id,
				from: rel.from,
				to: rel.to,
				message: note,
			});
			continue;
		}

		const spec = softSpecFor(rel.relationType);
		if (!spec) {
			checks.push({
				relationId: rel.id,
				relationType: rel.relationType,
				from: rel.from,
				to: rel.to,
				graphify: "skipped",
				verdict: "ok",
				note: "endpoints present — no Graphify soft check for this relationType",
			});
			continue;
		}

		softChecked++;
		if (rel.relationType === "imports") importsChecked++;

		const fromBundle = getBundle(fromComp.purl);
		if (!fromBundle) {
			pushUnconfirmed(
				rel,
				"unavailable",
				`Graphify cache unavailable for ${rel.relationType} source — cannot corroborate`,
			);
			continue;
		}

		const fromAnchor = resolveComponentAnchor(fromBundle.nodes, {
			file: fromComp.file,
			symbol: fromComp.symbol,
			kind: fromComp.construct,
			purl: fromComp.purl,
		});
		if (fromAnchor.resolution !== "exact" || !fromAnchor.node) {
			pushUnconfirmed(
				rel,
				"unconfirmed",
				`${rel.relationType} source ${fromComp.alias} has no exact Graphify anchor — cannot corroborate`,
			);
			continue;
		}

		const fromNodeId = String(fromAnchor.node.id);
		let confirmed = false;
		let note: string;

		const toIsExternal =
			toComp.construct === "external" ||
			purlKey(toComp.purl) === "external" ||
			!toComp.file;

		if (toIsExternal) {
			if (spec.externalHints) {
				confirmed = graphifyHasRelationTowardHints(
					fromBundle.edges,
					fromBundle.nodes,
					fromNodeId,
					externalHints(toComp),
					spec.graphifyRelations,
				);
				note = confirmed
					? `Graphify shows a ${rel.relationType} edge toward this external`
					: `No Graphify ${rel.relationType} edge toward this external (soft gap)`;
			} else {
				confirmed = false;
				note = `Target is external — no Graphify soft check for ${rel.relationType} (soft gap)`;
			}
		} else {
			let toNodeId: string | null = null;
			const toBundleSamePurl =
				purlKey(toComp.purl) === purlKey(fromComp.purl)
					? fromBundle
					: getBundle(toComp.purl);
			const toNodes = toBundleSamePurl?.nodes ?? fromBundle.nodes;
			const toAnchor = resolveComponentAnchor(toNodes, {
				file: toComp.file,
				symbol: toComp.symbol,
				kind: toComp.construct,
				purl: toComp.purl,
			});
			if (toAnchor.resolution === "exact" && toAnchor.node) {
				toNodeId = String(toAnchor.node.id);
			}

			if (toNodeId) {
				confirmed = graphifyHasRelationBetween(
					fromBundle.edges,
					fromNodeId,
					toNodeId,
					spec.graphifyRelations,
					spec.eitherDirection,
				);
				note = confirmed
					? `Graphify corroborates this ${rel.relationType}`
					: `No Graphify ${rel.relationType} edge between anchors (soft gap)`;
			} else if (spec.externalHints) {
				confirmed = graphifyHasRelationTowardHints(
					fromBundle.edges,
					fromBundle.nodes,
					fromNodeId,
					externalHints(toComp),
					spec.graphifyRelations,
				);
				note = confirmed
					? `Graphify shows a ${rel.relationType} edge toward the target (target unanchored)`
					: `${rel.relationType} target has no exact Graphify anchor and no soft label match`;
			} else {
				confirmed = false;
				note = `${rel.relationType} target has no exact Graphify anchor (soft gap)`;
			}
		}

		if (confirmed) {
			pushConfirmed(rel, note);
		} else {
			pushUnconfirmed(rel, "unconfirmed", note);
		}
	}

	return {
		checks,
		findings,
		summary: {
			relations: relations.length,
			softChecked,
			softConfirmed,
			softUnconfirmed,
			importsChecked,
			importsConfirmed,
			importsUnconfirmed,
			brokenEndpoints,
		},
	};
}
