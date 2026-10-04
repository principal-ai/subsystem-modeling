/**
 * Compose every subsystem model touching one repo-key into a single graph.
 *
 * Identity, not aliasing: code (+ proposed-with-intent) joins on
 * (purlRepoKey, file, symbol-or-None); external/custom_entity joins on exact
 * (purl, normalized name) with purl != 'external' (bare externals stay
 * model-scoped). Alias-text / name-only matching is rejected — the stored
 * models contain same-alias-different-identity false friends (e.g. one
 * repo's `app-worker` matching service vs frontend handler; a code `store`
 * vs an external DB table sharing an alias).
 *
 * Edges resolve per-model in alias-space and are rebased to the canonical
 * alias, so the output is a materialized, validatable document (the existing
 * schema + cross-field checks apply unchanged). Attribute divergences are
 * grouped as conflicts, never normalized — an agent pass fixes source models
 * consistent via proposals.
 *
 * Pure over documents (no disk I/O) so it is unit-testable; callers load
 * models from the store.
 */

import type { SubsystemComponent } from "../shared/contract";
import {
	purlRepoKey,
	type StoredSubsystemModel,
	type SubsystemDocumentBody,
} from "./subsystem-model-store";

/** One stored model participating in the compose, with its store id. */
export interface MergeInputModel {
	/** Store id (sg-...) — stable ordering + local namespacing. */
	id: string;
	document: SubsystemDocumentBody;
	/** Per-purl commit when this model last passed fully_verified. */
	verifiedAtCommits?: Record<string, string>;
}

export interface MergeConflictValue {
	value: unknown;
	/** Model ids (stable order) holding this value. */
	sources: string[];
}

export interface MergeConflict {
	/** Canonical alias of the composed node. */
	nodeKey: string;
	field: string;
	values: MergeConflictValue[];
}

export interface MergedNodeSource {
	/** Canonical alias in the composed document. */
	alias: string;
	sourceAliases: string[];
	sourceModels: string[];
}

export interface MergeSidecar {
	nodes: MergedNodeSource[];
	conflicts: MergeConflict[];
}

export interface MergeResult {
	/**
	 * Materialized composed graph: validatable components/trails plus a
	 * traceable title/description (stored-model shape minus store metadata —
	 * the contract document itself has no title).
	 */
	document: Pick<
		StoredSubsystemModel,
		"title" | "description" | "components" | "trails"
	>;
	sidecar: MergeSidecar;
}

interface GroupMember {
	modelId: string;
	component: SubsystemComponent;
	/** Whether this model has verifiedAtCommits for the component's purl. */
	isVerified: boolean;
}

function normName(name: string | undefined): string {
	return (name ?? "").trim().toLowerCase();
}

function isNonCode(c: SubsystemComponent): boolean {
	return c.construct === "external" || c.construct === "custom_entity";
}

/**
 * Join key for one component within one model. Same key in different models
 * means the same node. Components without enough identity to join safely
 * (bare externals, file-less code) fall back to a model-scoped key so they
 * never unify — the agent alignment pass fuses true duplicates later.
 */
function joinKeyFor(modelId: string, c: SubsystemComponent): string {
	const file = (c.file ?? "").trim();
	const purl = (c.purl ?? "").trim();
	if (isNonCode(c)) {
		if (purl !== "" && purl !== "external") {
			return `ext\0${purl}\0${normName(c.name)}`;
		}
		return `local\0${modelId}\0${c.alias}`;
	}
	const repo = purlRepoKey(purl) ?? "";
	if (file === "") return `local\0${modelId}\0${c.alias}`;
	const symbol = (c.symbol ?? "").trim();
	return `code\0${repo}\0${file}\0${symbol}`;
}

/** Distinct non-empty values of a field across group members, stable order. */
function distinctFieldValues(
	members: GroupMember[],
	pick: (c: SubsystemComponent) => unknown,
): Array<{ value: unknown; sources: string[] }> {
	const seen = new Map<string, { value: unknown; sources: string[] }>();
	for (const m of members) {
		const v = pick(m.component);
		if (v === undefined || v === null || v === "") continue;
		const k = JSON.stringify(v) ?? String(v);
		const e = seen.get(k);
		if (e) {
			if (!e.sources.includes(m.modelId)) e.sources.push(m.modelId);
		} else {
			seen.set(k, { value: v, sources: [m.modelId] });
		}
	}
	return [...seen.values()];
}

function recordConflict(
	conflicts: MergeConflict[],
	nodeKey: string,
	field: string,
	vals: Array<{ value: unknown; sources: string[] }>,
): void {
	if (vals.length > 1) conflicts.push({ nodeKey, field, values: vals });
}

/**
 * Merge one identity group into a single component. Deterministic: members
 * arrive in stable model order and every pick is first-non-empty-wins, with
 * two principled overrides (grounded beats proposed; declaration from a
 * verified model beats unverified). Real divergences are recorded, not resolved.
 */
function mergeGroup(
	members: GroupMember[],
	conflicts: MergeConflict[],
	canonicalAlias: string,
): SubsystemComponent {
	const first = members[0]!.component;
	const merged: SubsystemComponent = { ...first, alias: canonicalAlias };

	const take = <T>(
		field: string,
		pick: (c: SubsystemComponent) => T,
		prefer?: () => T | undefined,
	): void => {
		const vals = distinctFieldValues(members, pick);
		if (vals.length === 0) return;
		const winner = prefer?.() ?? (vals[0]!.value as T);
		(merged as unknown as Record<string, unknown>)[field] = winner;
		recordConflict(conflicts, canonicalAlias, field, vals);
	};

	// Display name: prefer the member whose name aligns with its symbol
	// (renderers derive display from symbol anyway), else first.
	take("name", (c) => c.name, () => {
		const aligned = members.find(
			(m) =>
				(m.component.name ?? "").trim() !== "" &&
				(m.component.symbol ?? "").trim() !== "" &&
				(m.component.name ?? "").trim() === (m.component.symbol ?? "").trim(),
		);
		return aligned?.component.name;
	});
	take("purpose", (c) => c.purpose);
	take("role", (c) => c.role);
	take("construct", (c) => c.construct);
	take("process", (c) => c.process);
	take("module", (c) => c.module);
	// `layer` is deliberately NOT carried into the merged document. It is a
	// per-model pipeline hint (each model numbers its own layers 0..n), so
	// first-wins across models yields incomparable ranks that fight the
	// composed layout. Dropped, ELK derives ranks purely from topology.
	delete merged.layer;
	take("framework", (c) => c.framework);
	take("stereotype", (c) => c.stereotype);
	take("entityKind", (c) => c.entityKind);
	take("color", (c) => c.color);
	take("file", (c) => c.file);
	take("symbol", (c) => c.symbol);
	take("purl", (c) => c.purl);
	take("tokens", (c) => c.tokens);
	take("declarationRef", (c) => c.declarationRef);
	// Declaration: prefer from a model whose audit verified this component's purl.
	take("declaration", (c) => c.declaration, () => {
		const verified = members.find(
			(m) => m.component.declaration !== undefined && m.isVerified,
		);
		return verified?.component.declaration;
	});

	// Grounded beats proposed: a placeholder disappears once any model
	// grounds the declaration.
	if (!members.every((m) => m.component.proposed === true)) {
		delete merged.proposed;
	}

	return merged;
}

/** Stable model order: sorted by store id (sg-<timestamp>-… is chronological). */
function stableOrder(models: MergeInputModel[]): MergeInputModel[] {
	return [...models].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function uniqueId(base: string, used: Set<string>): string {
	if (!used.has(base)) {
		used.add(base);
		return base;
	}
	let n = 1;
	let cand = `${base}__dup${n}`;
	while (used.has(cand)) {
		n++;
		cand = `${base}__dup${n}`;
	}
	used.add(cand);
	return cand;
}

/**
 * Compose models into one materialized document + sidecar. Trail steps
 * are rebased to canonical aliases through each model's own alias space;
 * unresolvable endpoints (external labels) pass through untouched. Id
 * collisions across models are disambiguated deterministically.
 */
export function mergeSubsystemModels(models: MergeInputModel[]): MergeResult {
	const ordered = stableOrder(models);

	// Group components by join key, first-seen order.
	const groups = new Map<string, GroupMember[]>();
	for (const m of ordered) {
		for (const c of m.document.components ?? []) {
			const key = joinKeyFor(m.id, c);
			// Check if the model has verifiedAtCommits for this component's purl
			const componentPurl = purlRepoKey(c.purl) ?? "";
			const isVerified = componentPurl !== "" && 
				m.verifiedAtCommits !== undefined && 
				componentPurl in m.verifiedAtCommits;
			const member: GroupMember = { modelId: m.id, component: c, isVerified };
			const g = groups.get(key);
			if (g) g.push(member);
			else groups.set(key, [member]);
		}
	}

	const conflicts: MergeConflict[] = [];
	const sources: MergedNodeSource[] = [];
	const components: SubsystemComponent[] = [];
	// Per-model alias -> canonical alias, for edge rebasing.
	const aliasIndex = new Map<string, string>();
	const usedAliases = new Set<string>();

	for (const members of groups.values()) {
		const first = members[0]!;
		let canonical = first.component.alias;
		if (usedAliases.has(canonical)) {
			canonical = `${first.component.alias}__${first.modelId}`;
			let n = 1;
			while (usedAliases.has(canonical)) {
				n++;
				canonical = `${first.component.alias}__${first.modelId}-${n}`;
			}
		}
		usedAliases.add(canonical);
		components.push(mergeGroup(members, conflicts, canonical));
		const sourceAliases: string[] = [];
		const sourceModels: string[] = [];
		for (const m of members) {
			aliasIndex.set(`${m.modelId}\0${m.component.alias}`, canonical);
			if (!sourceAliases.includes(m.component.alias)) sourceAliases.push(m.component.alias);
			if (!sourceModels.includes(m.modelId)) sourceModels.push(m.modelId);
		}
		sources.push({ alias: canonical, sourceAliases, sourceModels });
	}

	const rebase = (modelId: string, endpoint: string): string =>
		aliasIndex.get(`${modelId}\0${endpoint}`) ?? endpoint;

	const usedTrailIds = new Set<string>();
	const trails = ordered.flatMap((m) =>
		(m.document.trails ?? []).map((w) => ({
			...w,
			id: uniqueId(w.id, usedTrailIds),
			steps: (w.steps ?? []).map((s) => ({
				...s,
				from: rebase(m.id, s.from),
				to: rebase(m.id, s.to),
			})),
		})),
	);

	const repoKeys = new Set<string>();
	for (const m of ordered) {
		for (const c of m.document.components ?? []) {
			const k = purlRepoKey(c.purl);
			if (k) repoKeys.add(k);
		}
	}
	const modelIds = ordered.map((m) => m.id);
	const title =
		repoKeys.size === 1
			? `Composed: ${[...repoKeys][0]}`
			: "Composed subsystem models";

	return {
		document: {
			title,
			description: `Composed from ${ordered.length} model(s): ${modelIds.join(", ")}.`,
			components,
			trails,
		},
		sidecar: { nodes: sources, conflicts },
	};
}
