/**
 * C4 projection — the read side that turns a stored subsystem model (plus any
 * accepted C4 containers) into a drawable `C4Model`.
 *
 * Two sources, one canvas:
 *
 *   - `accepted` — containers a human approved in `~/.principal/c4-elements`.
 *     Their `process` claims decide membership; nothing is inferred.
 *   - `draft` — one provisional container per runtime `process` key, derived
 *     from the model itself. Clearly unverified, never written back.
 *
 * `auto` picks accepted when at least one accepted container claims a process
 * key this model actually uses; otherwise it falls back to draft. That keeps a
 * model with unrelated accepted containers from rendering an empty C4.
 *
 * Edges are always *derived*: cross-boundary trail steps fold into lines with
 * mechanism labels and `trailRefs` provenance. There is no accepted edge store
 * to read, and a draft has no authored edge set.
 *
 * The builder is pure over its inputs. The host resolves repo keys and reads
 * the element sets; nothing here touches disk.
 */

import type {
	C4ContainerKind,
	C4Edge,
	C4Element,
	C4Model,
	C4TrailRef,
} from "@principal-ai/subsystems-react";
import { labelFromPurl } from "@principal-ai/subsystems-react";
import type {
	StoredSubsystemModel,
	SubsystemComponent,
	SubsystemTrail,
} from "../shared/contract";
import { readC4ElementSet } from "./c4-element-store";
import { isRepoPurl, purlRepoKey } from "./subsystem-model-store";

export type C4ProjectionSource = "accepted" | "draft" | "auto";
export type C4ResolvedSource = "accepted" | "draft";

export interface C4ProjectionCounts {
	containers: number;
	externals: number;
	edges: number;
	/** Every component in the model, drawn or not. */
	components: number;
	/** Components with no `process`, so no container can claim them. */
	unassignedComponents: number;
	/** Process keys with runtime code that no accepted container claims. */
	unbackedProcesses: number;
}

export interface C4ProjectionResult {
	model: C4Model;
	source: C4ResolvedSource;
	/** Element id → component aliases. Used to build construct graphs. */
	memberships: Record<string, string[]>;
	counts: C4ProjectionCounts;
	/** Repo keys the model references. */
	repos: string[];
	/** Aliases of components that state no `process`. */
	unassignedComponents: string[];
	/** Process keys that no accepted container claims (accepted source only). */
	unbackedProcesses: string[];
}

interface Built {
	elements: C4Element[];
	memberships: Map<string, string[]>;
	unassignedComponents: string[];
}

const RUNTIME_CONSTRUCTS = new Set(["function", "class", "custom_entity"]);

/** `site/web` → `site-web`; stable, readable element ids. */
function slug(value: string): string {
	const out = value
		.replace(/[^a-zA-Z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.toLowerCase();
	return out || "element";
}

/** Keep ids deterministic and unique even when two keys slug the same way. */
function uniqueId(prefix: string, key: string, used: Set<string>): string {
	const base = `${prefix}:${slug(key)}`;
	if (!used.has(base)) {
		used.add(base);
		return base;
	}
	let n = 2;
	while (used.has(`${base}-${n}`)) n += 1;
	const id = `${base}-${n}`;
	used.add(id);
	return id;
}

function techOf(members: readonly SubsystemComponent[]): string {
	const seen = new Set<string>();
	for (const member of members) {
		const framework = member.framework?.trim();
		if (framework) seen.add(framework);
	}
	return [...seen].join(", ");
}

/** A process with no grounded code behind it names something outside. */
function isExternalProcess(process: string, members: readonly SubsystemComponent[]): boolean {
	if (process.startsWith("external/") || process.startsWith("local/")) return true;
	return members.every((member) => !member.file?.trim());
}

function containerKindOf(members: readonly SubsystemComponent[]): C4ContainerKind {
	return members.some((member) => member.construct === "store") ? "data-store" : "application";
}

function systemFor(
	document: Pick<StoredSubsystemModel, "title">,
	repos: readonly string[],
): C4Model["system"] {
	const title = document.title?.trim();
	const label =
		title || (repos.length === 1 ? labelFromPurl(repos[0]!) : undefined) || "System";
	const key = repos.length === 1 ? repos[0]! : label;
	return {
		id: `system:${slug(key)}`,
		label,
		...(repos.length === 1 ? { repoKey: repos[0]! } : {}),
	};
}

/** Normalize an accepted element into this projection's frame. */
function normalizeElement(element: C4Element, systemId: string): C4Element {
	if (element.kind === "container") return { ...element, parentId: systemId };
	if (element.kind === "component") {
		return {
			...element,
			parentId: element.container ?? element.parentId,
		};
	}
	// Externals and people sit outside the boundary; a stored parentId would
	// nest them under the system frame, which is wrong.
	const { parentId: _ignored, ...outside } = element;
	return outside;
}

function membershipsOf(
	elements: readonly C4Element[],
	components: readonly SubsystemComponent[],
): Map<string, string[]> {
	const byProcess = new Map<string, string[]>();
	for (const component of components) {
		const process = component.process?.trim();
		if (!process) continue;
		const list = byProcess.get(process) ?? [];
		list.push(component.alias);
		byProcess.set(process, list);
	}

	const out = new Map<string, string[]>();
	for (const element of elements) {
		if (element.kind === "container") {
			out.set(element.id, element.process ? (byProcess.get(element.process.trim()) ?? []) : []);
		} else if (element.kind === "component" || element.kind === "external-system") {
			out.set(element.id, [...(element.members ?? [])]);
		}
	}
	return out;
}

/**
 * Draft elements: one provisional container per runtime `process` key.
 *
 * A file-less / `external/` / `local/` process becomes an external system, so a
 * line leaving the boundary has somewhere to land. Components with no `process`
 * are not invented into containers — they are reported as unassigned.
 */
function buildDraft(
	components: readonly SubsystemComponent[],
	systemId: string,
): Built {
	const byProcess = new Map<string, SubsystemComponent[]>();
	const unassignedComponents: string[] = [];
	for (const component of components) {
		const process = component.process?.trim();
		if (!process) {
			unassignedComponents.push(component.alias);
			continue;
		}
		const list = byProcess.get(process) ?? [];
		list.push(component);
		byProcess.set(process, list);
	}

	const used = new Set<string>();
	const elements: C4Element[] = [];
	const memberships = new Map<string, string[]>();
	for (const [process, members] of byProcess) {
		const aliases = members.map((member) => member.alias);
		if (isExternalProcess(process, members)) {
			const id = uniqueId("external", process, used);
			elements.push({
				kind: "external-system",
				id,
				label: process,
				members: aliases,
				technology: techOf(members) || "external",
				state: "proposed",
				description: `${aliases.length} component${aliases.length === 1 ? "" : "s"} outside the boundary.`,
			});
			memberships.set(id, aliases);
			continue;
		}

		const hasRuntime = members.some((member) => RUNTIME_CONSTRUCTS.has(member.construct));
		if (!hasRuntime) {
			// No runtime code means no deployable unit. Keep the aliases
			// unassigned rather than drawing a library as a container.
			unassignedComponents.push(...aliases);
			continue;
		}

		const id = uniqueId("container", process, used);
		elements.push({
			kind: "container",
			id,
			label: process,
			containerKind: containerKindOf(members),
			technology: techOf(members),
			process,
			parentId: systemId,
			state: "proposed",
			description: `${aliases.length} component${aliases.length === 1 ? "" : "s"} derived from process ${process}.`,
		});
		memberships.set(id, aliases);
	}

	return {
		elements,
		memberships,
		unassignedComponents: unassignedComponents.sort(),
	};
}

/** Accepted elements, normalized and joined to their members. */
function buildAccepted(
	elements: readonly C4Element[],
	components: readonly SubsystemComponent[],
	systemId: string,
): Built {
	const normalized = elements
		.filter((element) => element.state !== "rejected")
		.map((element) => normalizeElement(element, systemId));
	return {
		elements: normalized,
		memberships: membershipsOf(normalized, components),
		unassignedComponents: components.filter((c) => !c.process?.trim()).map((c) => c.alias),
	};
}

/**
 * Fold cross-boundary trail steps into C4 lines.
 *
 * Only top-level elements participate — a component in the container view is
 * not drawn, so its aliases must not steal an edge from the container that
 * holds it. When two elements claim the same alias, the first in element order
 * wins (containers are emitted before authored components).
 */
function foldEdges(
	elements: readonly C4Element[],
	memberships: ReadonlyMap<string, readonly string[]>,
	trails: readonly SubsystemTrail[] | undefined,
): C4Edge[] {
	const drawn = elements.filter(
		(element) =>
			element.kind === "container" ||
			element.kind === "external-system" ||
			element.kind === "person",
	);
	const elementOfAlias = new Map<string, string>();
	for (const element of drawn) {
		for (const alias of memberships.get(element.id) ?? []) {
			if (!elementOfAlias.has(alias)) elementOfAlias.set(alias, element.id);
		}
	}

	interface Acc {
		source: string;
		target: string;
		mechanism: string;
		refs: Map<string, number[]>;
	}
	const byKey = new Map<string, Acc>();
	for (const trail of trails ?? []) {
		(trail.steps ?? []).forEach((step, index) => {
			const source = elementOfAlias.get(step.from);
			const target = elementOfAlias.get(step.to);
			if (!source || !target || source === target) return;
			const key = `${source}\u0000${target}\u0000${step.mechanism}`;
			let acc = byKey.get(key);
			if (!acc) {
				acc = { source, target, mechanism: step.mechanism, refs: new Map() };
				byKey.set(key, acc);
			}
			const steps = acc.refs.get(trail.id) ?? [];
			steps.push(index);
			acc.refs.set(trail.id, steps);
		});
	}

	return [...byKey.values()]
		.map((acc): C4Edge => {
			const trailRefs: C4TrailRef[] = [...acc.refs.entries()].map(
				([trailId, stepIndices]) => ({ trailId, stepIndices }),
			);
			return {
				id: `e:${acc.source}->${acc.target}:${acc.mechanism}`,
				source: acc.source,
				target: acc.target,
				label: acc.mechanism,
				protocol: acc.mechanism,
				mechanisms: [acc.mechanism],
				count: trailRefs.reduce((n, ref) => n + ref.stepIndices.length, 0),
				trailRefs,
			};
		})
		.sort((a, b) => a.id.localeCompare(b.id));
}

/** Repo keys a model references, deduped in first-seen order. Pseudo-purls
 *  (`external:…`) are not repos and are excluded. */
export function repoKeysOf(
	components: readonly SubsystemComponent[],
): string[] {
	const seen = new Set<string>();
	for (const component of components) {
		const purl = component.purl;
		if (!isRepoPurl(purl)) continue;
		const key = purlRepoKey(purl);
		if (key) seen.add(key);
	}
	return [...seen];
}

export function buildC4Projection(input: {
	document: Pick<StoredSubsystemModel, "title" | "components" | "trails">;
	acceptedElements?: readonly C4Element[];
	source?: C4ProjectionSource;
}): C4ProjectionResult {
	const components = input.document.components ?? [];
	const trails = input.document.trails ?? [];
	const repos = repoKeysOf(components);
	const system = systemFor(input.document, repos);
	const processKeys = new Set(
		components
			.map((component) => component.process?.trim())
			.filter((process): process is string => Boolean(process)),
	);
	const processMembers = new Map<string, SubsystemComponent[]>();
	for (const component of components) {
		const process = component.process?.trim();
		if (!process) continue;
		const list = processMembers.get(process) ?? [];
		list.push(component);
		processMembers.set(process, list);
	}
	// Only container-shaped processes can be "unbacked"; an external or a
	// library-shaped key is not waiting on a container decision.
	const containerProcessKeys = [...processMembers.entries()]
		.filter(
			([process, members]) =>
				!isExternalProcess(process, members) &&
				members.some((member) => RUNTIME_CONSTRUCTS.has(member.construct)),
		)
		.map(([process]) => process);
	const accepted = input.acceptedElements ?? [];

	const backed = accepted.some(
		(element) =>
			element.kind === "container" &&
			typeof element.process === "string" &&
			processKeys.has(element.process.trim()),
	);
	const requested = input.source ?? "auto";
	const resolved: C4ResolvedSource =
		requested === "accepted" ? "accepted" : requested === "draft" ? "draft" : backed ? "accepted" : "draft";

	const built =
		resolved === "accepted"
			? buildAccepted(accepted, components, system.id)
			: buildDraft(components, system.id);

	const edges = foldEdges(built.elements, built.memberships, trails);
	const claimedProcesses = new Set(
		built.elements
			.filter((element): element is Extract<C4Element, { kind: "container" }> => element.kind === "container")
			.map((element) => element.process?.trim())
			.filter((process): process is string => Boolean(process)),
	);
	const unbackedProcesses =
		resolved === "accepted"
			? containerProcessKeys.filter((process) => !claimedProcesses.has(process))
			: [];

	const containers = built.elements.filter((element) => element.kind === "container");
	const externals = built.elements.filter((element) => element.kind === "external-system");

	return {
		model: { view: "container", system, nodes: built.elements, edges },
		source: resolved,
		memberships: Object.fromEntries(built.memberships),
		counts: {
			containers: containers.length,
			externals: externals.length,
			edges: edges.length,
			components: components.length,
			unassignedComponents: built.unassignedComponents.length,
			unbackedProcesses: unbackedProcesses.length,
		},
		repos,
		unassignedComponents: built.unassignedComponents,
		unbackedProcesses,
	};
}

/**
 * Host entry point: resolve the model's repos, read their accepted element
 * sets, and project. An absent set reads as empty, so a repo with no accepted
 * containers falls through to draft under `auto`.
 */
export async function buildC4ProjectionForModel(
	graph: StoredSubsystemModel,
	source: C4ProjectionSource = "auto",
): Promise<C4ProjectionResult> {
	const repos = repoKeysOf(graph.components ?? []);
	const sets = await Promise.all(repos.map((repo) => readC4ElementSet(repo)));
	const byId = new Map<string, C4Element>();
	for (const set of sets) {
		for (const element of set.elements) {
			// Later repos win on an id collision; ids are repo-scoped in practice,
			// so this is only a guard against a hand-edited file.
			byId.set(element.id, element);
		}
	}
	return buildC4Projection({
		document: graph,
		acceptedElements: [...byId.values()],
		source,
	});
}
