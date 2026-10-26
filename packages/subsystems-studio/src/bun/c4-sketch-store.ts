/**
 * The C4 sketch store — durable home for authored, unverified C4 hypotheses.
 *
 * Layout: `~/.principal/c4-sketches/<id>.json`. A sketch is deliberately
 * separate from both the subsystem-model store and the accepted element store:
 *
 *   - it may exist before any model does;
 *   - it carries components, externals, persons, and edges;
 *   - it never claims acceptance, so every element is normalized to `proposed`.
 *
 * There is no model association or grounding state in this store; a sketch is
 * a standalone artifact.
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	C4Edge,
	C4Element,
	C4Model,
} from "@principal-ai/subsystems-react";
import type {
	C4Sketch,
	C4SketchSummary as ContractSketchSummary,
} from "../shared/contract";

const ROOT = join(homedir(), ".principal", "c4-sketches");

/** Root home for the store; tests override with `PRINCIPAL_C4_SKETCHES_HOME`. */
function storeRoot(override?: string): string {
	const env = process.env["PRINCIPAL_C4_SKETCHES_HOME"]?.trim();
	return override ?? (env ? env : ROOT);
}

export interface C4SketchCreateInput {
	title: string;
	repoKeys?: string[];
	model: C4Model;
	author?: string;
	notes?: string;
}

export interface C4SketchPatch {
	title?: string;
	repoKeys?: string[];
	model?: C4Model;
	author?: string;
	notes?: string;
}

export type C4SketchWriteResult =
	| { ok: true; sketch: C4Sketch }
	| { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function dedupe(values: readonly string[]): string[] {
	const seen = new Set<string>();
	for (const value of values) {
		const trimmed = value.trim();
		if (trimmed) seen.add(trimmed);
	}
	return [...seen];
}

function newSketchId(): string {
	return `c4s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeFileName(id: string): string {
	const safe = id.replace(/[^a-zA-Z0-9._-]/g, "_");
	return `${safe || "sketch"}.json`;
}

function sketchPath(id: string, root?: string): string {
	return join(storeRoot(root), safeFileName(id));
}

/**
 * Structural validation for an authored model. Deliberately permissive on the
 * fields a top-down sketch may not know yet (technology, description); strict
 * on identity and references, so a broken edge/container cannot be stored.
 */
export function validateC4SketchModel(model: unknown): string[] {
	const problems: string[] = [];
	if (!isRecord(model)) return ["model is required"];
	const view = model["view"];
	if (view !== "container" && view !== "component") {
		problems.push("model.view must be container or component");
	}
	const system = model["system"];
	if (!isRecord(system)) problems.push("model.system is required");
	else {
		if (typeof system["id"] !== "string" || !system["id"].trim()) {
			problems.push("model.system.id is required");
		}
		if (typeof system["label"] !== "string" || !system["label"].trim()) {
			problems.push("model.system.label is required");
		}
	}

	const nodes = model["nodes"];
	if (!Array.isArray(nodes)) {
		problems.push("model.nodes must be an array");
		return problems;
	}
	const ids = new Set<string>();
	for (const [index, node] of nodes.entries()) {
		if (!isRecord(node)) {
			problems.push(`nodes[${index}] must be an object`);
			continue;
		}
		const id = node["id"];
		if (typeof id !== "string" || !id.trim()) {
			problems.push(`nodes[${index}].id is required`);
		} else if (ids.has(id)) {
			problems.push(`duplicate node id: ${id}`);
		} else {
			ids.add(id);
		}
		if (typeof node["label"] !== "string" || !node["label"].trim()) {
			problems.push(`nodes[${index}].label is required`);
		}
		const kind = node["kind"];
		if (
			kind !== "container" &&
			kind !== "component" &&
			kind !== "external-system" &&
			kind !== "person"
		) {
			problems.push(`nodes[${index}].kind is not a C4 kind`);
			continue;
		}
		if (kind === "container") {
			const containerKind = node["containerKind"];
			if (containerKind !== "application" && containerKind !== "data-store") {
				problems.push(
					`nodes[${index}].containerKind must be application or data-store`,
				);
			}
		}
		if (kind === "component") {
			const container = node["container"];
			if (typeof container !== "string" || !container.trim()) {
				problems.push(`nodes[${index}].container is required`);
			}
		}
		if (node["members"] !== undefined && !isStringArray(node["members"])) {
			problems.push(`nodes[${index}].members must be an array of strings`);
		}
	}
	// Component containers must resolve after the full id set is known.
	for (const [index, node] of nodes.entries()) {
		if (!isRecord(node) || node["kind"] !== "component") continue;
		const container = node["container"];
		if (typeof container === "string" && container.trim() && !ids.has(container)) {
			problems.push(`nodes[${index}].container references unknown node: ${container}`);
		}
	}

	const edges = model["edges"];
	if (!Array.isArray(edges)) {
		problems.push("model.edges must be an array");
		return problems;
	}
	const edgeIds = new Set<string>();
	for (const [index, edge] of edges.entries()) {
		if (!isRecord(edge)) {
			problems.push(`edges[${index}] must be an object`);
			continue;
		}
		const id = edge["id"];
		if (typeof id !== "string" || !id.trim()) {
			problems.push(`edges[${index}].id is required`);
		} else if (edgeIds.has(id)) {
			problems.push(`duplicate edge id: ${id}`);
		} else {
			edgeIds.add(id);
		}
		const source = edge["source"];
		const target = edge["target"];
		if (typeof source !== "string" || !ids.has(source)) {
			problems.push(`edges[${index}].source references unknown node`);
		}
		if (typeof target !== "string" || !ids.has(target)) {
			problems.push(`edges[${index}].target references unknown node`);
		}
		if (typeof edge["label"] !== "string") {
			problems.push(`edges[${index}].label is required`);
		}
		if (edge["mechanisms"] !== undefined && !isStringArray(edge["mechanisms"])) {
			problems.push(`edges[${index}].mechanisms must be an array of strings`);
		}
		if (edge["count"] !== undefined && typeof edge["count"] !== "number") {
			problems.push(`edges[${index}].count must be a number`);
		}
	}

	const openIds = model["openContainerIds"];
	if (openIds !== undefined && !isStringArray(openIds)) {
		problems.push("model.openContainerIds must be an array of strings");
	}
	const openId = model["openContainerId"];
	if (openId !== undefined && openId !== null && typeof openId !== "string") {
		problems.push("model.openContainerId must be a string or null");
	}
	return problems;
}

/** Force the authored model into sketch truth: `proposed`, with stable edges. */
function normalizeModel(model: C4Model): C4Model {
	const openIds = dedupe([
		...(model.openContainerIds ?? []),
		...(model.openContainerId ? [model.openContainerId] : []),
	]).sort();
	return {
		view: model.view,
		system: { ...model.system },
		nodes: model.nodes.map(
			(node): C4Element => ({ ...node, state: "proposed" }),
		),
		edges: model.edges.map(
			(edge): C4Edge => ({
				...edge,
				mechanisms: [...(edge.mechanisms ?? [])],
				count: edge.count ?? 0,
			}),
		),
		...(openIds.length > 0 ? { openContainerIds: openIds } : {}),
	};
}

function validateCreate(input: C4SketchCreateInput): string[] {
	const problems: string[] = [];
	if (typeof input.title !== "string" || !input.title.trim()) {
		problems.push("title is required");
	}
	if (input.repoKeys !== undefined && !isStringArray(input.repoKeys)) {
		problems.push("repoKeys must be an array of strings");
	}
	problems.push(...validateC4SketchModel(input.model));
	return problems;
}

function validatePatch(patch: C4SketchPatch): string[] {
	const problems: string[] = [];
	if (patch.title !== undefined && (typeof patch.title !== "string" || !patch.title.trim())) {
		problems.push("title must be a non-empty string");
	}
	if (patch.repoKeys !== undefined && !isStringArray(patch.repoKeys)) {
		problems.push("repoKeys must be an array of strings");
	}
	if (patch.model !== undefined) problems.push(...validateC4SketchModel(patch.model));
	return problems;
}

async function readSketch(id: string, root?: string): Promise<C4Sketch | null> {
	try {
		const raw = await fs.readFile(sketchPath(id, root), "utf8");
		const parsed = JSON.parse(raw) as C4Sketch;
		if (!parsed || typeof parsed.id !== "string" || !parsed.model) return null;
		if (validateC4SketchModel(parsed.model).length > 0) return null;
		return parsed;
	} catch {
		return null;
	}
}

async function writeSketch(sketch: C4Sketch, root?: string): Promise<void> {
	await fs.mkdir(storeRoot(root), { recursive: true });
	await fs.writeFile(
		sketchPath(sketch.id, root),
		`${JSON.stringify(sketch, null, "\t")}\n`,
		"utf8",
	);
}

export function c4SketchSummary(sketch: C4Sketch): ContractSketchSummary {
	const nodes = sketch.model.nodes;
	const counts = {
		containers: nodes.filter((node) => node.kind === "container").length,
		components: nodes.filter((node) => node.kind === "component").length,
		externals: nodes.filter((node) => node.kind === "external-system").length,
		persons: nodes.filter((node) => node.kind === "person").length,
		edges: sketch.model.edges.length,
	};
	return {
		id: sketch.id,
		title: sketch.title,
		repoKeys: [...sketch.repoKeys],
		...(sketch.author ? { author: sketch.author } : {}),
		createdAt: sketch.createdAt,
		updatedAt: sketch.updatedAt,
		counts,
	};
}

export async function getC4Sketch(
	id: string,
	root?: string,
): Promise<C4Sketch | null> {
	return readSketch(id, root);
}

/** List sketches, newest first, optionally filtered to one repo key. */
export async function listC4Sketches(
	filter?: { repoKey?: string },
	root?: string,
): Promise<ContractSketchSummary[]> {
	let files: string[];
	try {
		files = await fs.readdir(storeRoot(root));
	} catch {
		return [];
	}
	const sketches: ContractSketchSummary[] = [];
	for (const file of files) {
		if (!file.endsWith(".json")) continue;
		const sketch = await readSketch(file.slice(0, -5), root);
		if (!sketch) continue;
		if (filter?.repoKey && !sketch.repoKeys.includes(filter.repoKey)) continue;
		sketches.push(c4SketchSummary(sketch));
	}
	return sketches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createC4Sketch(
	input: C4SketchCreateInput,
	root?: string,
): Promise<C4SketchWriteResult> {
	const problems = validateCreate(input);
	if (problems.length > 0) return { ok: false, error: problems.join("; ") };
	const now = new Date().toISOString();
	const sketch: C4Sketch = {
		id: newSketchId(),
		title: input.title.trim(),
		repoKeys: dedupe(input.repoKeys ?? []),
		model: normalizeModel(input.model),
		...(input.author?.trim() ? { author: input.author.trim() } : {}),
		...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
		createdAt: now,
		updatedAt: now,
	};
	await writeSketch(sketch, root);
	return { ok: true, sketch };
}

export async function updateC4Sketch(
	id: string,
	patch: C4SketchPatch,
	root?: string,
): Promise<C4SketchWriteResult> {
	const problems = validatePatch(patch);
	if (problems.length > 0) return { ok: false, error: problems.join("; ") };
	const existing = await readSketch(id, root);
	if (!existing) return { ok: false, error: `unknown sketch: ${id}` };
	const sketch: C4Sketch = {
		...existing,
		...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
		...(patch.repoKeys !== undefined ? { repoKeys: dedupe(patch.repoKeys) } : {}),
		...(patch.model !== undefined ? { model: normalizeModel(patch.model) } : {}),
		...(patch.author !== undefined
			? patch.author.trim()
				? { author: patch.author.trim() }
				: { author: undefined }
			: {}),
		...(patch.notes !== undefined
			? patch.notes.trim()
				? { notes: patch.notes.trim() }
				: { notes: undefined }
			: {}),
		updatedAt: new Date().toISOString(),
	};
	await writeSketch(sketch, root);
	return { ok: true, sketch };
}

export async function deleteC4Sketch(id: string, root?: string): Promise<boolean> {
	try {
		await fs.unlink(sketchPath(id, root));
		return true;
	} catch {
		return false;
	}
}
