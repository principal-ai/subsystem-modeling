/**
 * Dry-run span derivability classifier — graphify anchor + tree-sitter parse.
 *
 * The derivation classifier itself is shared with the CLI through the core
 * audit layer. This module keeps the Studio-only orchestration: load a model,
 * resolve its checkouts and Graphify caches, then classify each component.
 */

import { promises as fs } from "node:fs";
import { resolveComponentAnchor } from "../../../subsystems-core/src/graphify/anchor";
import type { GraphifyNode } from "../../../subsystems-core/src/graphify/types";
import {
	deriveSpan,
	disposeSpanTreeCache,
	languageKey,
	type SpanClass,
	type SpanDerivation,
	type SpanTreeCache,
} from "../../../subsystems-core/src/audit/verify/span";
import {
	ensureCurrentGraphifyCachesForModel,
	getCachedGraphifyGraph,
	resolveRepoRootForPurl,
} from "./graphify-store";
import { loadGraphifyGraph } from "./graphify-runner";
import { resolveSandboxed } from "./sandboxed-path";
import {
	getSubsystemModel,
	listSubsystemModels,
} from "./subsystem-model-store";
import type { SubsystemComponent } from "../shared/contract";

export type { SpanClass, SpanDerivation, SpanTreeCache };
export { disposeSpanTreeCache, GATE_LABELS } from "../../../subsystems-core/src/audit/verify/span";

// ---------------------------------------------------------------------------
// orchestration
// ---------------------------------------------------------------------------

export interface ComponentSpanReport {
	modelId: string;
	alias: string;
	file: string;
	symbol?: string;
	construct?: string;
	result: SpanDerivation | { class: SpanClass; failedGates: string[]; evidence: string[]; language: string | null; graphifyStart: null; derivedEnd: null; declNodeType: null; declName: null };
}

export interface SpanClassificationSummary {
	total: number;
	byClass: Record<string, number>;
	byLanguage: Record<string, number>;
	byClassLanguage: Record<string, Record<string, number>>;
	failedGates: Record<string, number>;
	coverage: {
		anchored: number;
		fileRead: number;
		parsed: number;
	};
}

export interface SpanClassificationReport {
	models: number;
	components: ComponentSpanReport[];
	summary: SpanClassificationSummary;
}

function unknownResult(failed: string, language: string | null): SpanDerivation {
	return {
		class: "unknown",
		language,
		graphifyStart: null,
		derivedEnd: null,
		declNodeType: null,
		declName: null,
		failedGates: [failed],
		evidence: [],
	};
}

/** Not a code component — externals, missing identity. */
function skippedResult(language: string | null): SpanDerivation {
	return {
		class: "skipped",
		language,
		graphifyStart: null,
		derivedEnd: null,
		declNodeType: null,
		declName: null,
		failedGates: [],
		evidence: [],
	};
}

async function loadNodes(
	purl: string,
	repoRoot: string,
): Promise<GraphifyNode[] | null> {
	const cached = await getCachedGraphifyGraph(purl, { repoRoot });
	if (!cached) return null;
	try {
		const smoke = loadGraphifyGraph(cached.path);
		return (smoke.nodes ?? []) as GraphifyNode[];
	} catch {
		return null;
	}
}

async function classifyComponent(
	modelId: string,
	component: SubsystemComponent,
	treeCache: SpanTreeCache,
): Promise<ComponentSpanReport> {
	const base = {
		modelId,
		alias: component.alias,
		file: component.file ?? "",
		symbol: component.symbol,
		construct: component.construct,
	};
	const language = contextLanguage(component.file);

	if (
		component.construct === "external" ||
		component.construct === "custom_entity" ||
		!component.file ||
		!component.symbol ||
		!component.purl
	) {
		return { ...base, result: skippedResult(language) };
	}

	const repoRoot = resolveRepoRootForPurl(component.purl);
	if (!repoRoot) {
		return { ...base, result: unknownResult("no-checkout", language) };
	}

	let content: string;
	try {
		const abs = resolveSandboxed(repoRoot, component.file);
		content = await fs.readFile(abs, "utf8");
	} catch {
		return { ...base, result: unknownResult("file-unreadable", language) };
	}

	const nodes = await loadNodes(component.purl, repoRoot);
	if (!nodes) {
		return { ...base, result: unknownResult("no-graphify-cache", language) };
	}

	const anchor = resolveComponentAnchor(nodes, {
		file: component.file,
		symbol: component.symbol,
		kind: component.construct,
		purl: component.purl,
	});

	const result = await deriveSpan({
		content,
		file: component.file,
		symbol: component.symbol,
		construct: component.construct,
		anchor,
		storedSpan: component.declarationSpan,
		treeCache,
	});
	return { ...base, result };
}

function contextLanguage(file: string | undefined): string | null {
	return file ? languageKey(file) : null;
}

function summarize(components: ComponentSpanReport[]): SpanClassificationSummary {
	const byClass: Record<string, number> = {};
	const byLanguage: Record<string, number> = {};
	const byClassLanguage: Record<string, Record<string, number>> = {};
	const failedGates: Record<string, number> = {};
	let anchored = 0;
	let fileRead = 0;
	let parsed = 0;
	for (const c of components) {
		const cls = c.result.class;
		byClass[cls] = (byClass[cls] ?? 0) + 1;
		const lang = c.result.language ?? "unknown";
		byLanguage[lang] = (byLanguage[lang] ?? 0) + 1;
		byClassLanguage[cls] = byClassLanguage[cls] ?? {};
		byClassLanguage[cls]![lang] = (byClassLanguage[cls]![lang] ?? 0) + 1;
		for (const g of c.result.failedGates) {
			failedGates[g] = (failedGates[g] ?? 0) + 1;
		}
		if (c.result.graphifyStart != null) anchored++;
		if (!c.result.failedGates.includes("file-unreadable")) fileRead++;
		if (c.result.class !== "unknown" && c.result.declNodeType != null) parsed++;
	}
	return {
		total: components.length,
		byClass,
		byLanguage,
		byClassLanguage,
		failedGates,
		coverage: { anchored, fileRead, parsed },
	};
}

export interface ClassifyOptions {
	/** Build/refresh graphify caches before classifying (slow; default off). */
	ensure?: boolean;
	/** Progress callback, fired before each model is classified. */
	onModel?: (modelId: string, index: number) => void;
}

/** Classify every code component of one model (read-only). */
export async function classifyModelSpans(
	graphId: string,
	opts?: ClassifyOptions,
): Promise<SpanClassificationReport | null> {
	const graph = await getSubsystemModel(graphId);
	if (!graph) return null;
	if (opts?.ensure) {
		await ensureCurrentGraphifyCachesForModel(graph);
	}
	const components: ComponentSpanReport[] = [];
	const treeCache: SpanTreeCache = new Map();
	try {
		for (const c of graph.components) {
			components.push(await classifyComponent(graphId, c, treeCache));
		}
	} finally {
		disposeSpanTreeCache(treeCache);
	}
	return { models: 1, components, summary: summarize(components) };
}

/** Classify every code component across all stored models (read-only). */
export async function classifyAllSpans(
	opts?: ClassifyOptions,
): Promise<SpanClassificationReport> {
	const entries = await listSubsystemModels();
	const components: ComponentSpanReport[] = [];
	const treeCache: SpanTreeCache = new Map();
	let index = 0;
	try {
		for (const entry of entries) {
			opts?.onModel?.(entry.id, index++);
			const graph = await getSubsystemModel(entry.id);
			if (!graph) continue;
			if (opts?.ensure) {
				await ensureCurrentGraphifyCachesForModel(graph);
			}
			for (const c of graph.components) {
				components.push(await classifyComponent(entry.id, c, treeCache));
			}
		}
	} finally {
		disposeSpanTreeCache(treeCache);
	}
	return { models: entries.length, components, summary: summarize(components) };
}
