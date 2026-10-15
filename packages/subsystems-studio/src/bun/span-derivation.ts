/**
 * Dry-run span derivability classifier — graphify anchor + tree-sitter parse.
 *
 * For every code component: resolve the graphify definition node, read the file
 * at its `source_location` start line, parse with tree-sitter, and derive the
 * declaration's end line. Then classify how *decidable* that derivation is —
 * deterministic (a stored span re-hashes unchanged), trivial (all structural
 * gates pass), ambiguous (candidates/gates disagree), or unknown (no anchor /
 * grammar / parse).
 *
 * Read-only by design: this never writes a span. It exists to measure, across
 * stored models, how often graphify + tree-sitter is enough on its own before we
 * commit routing (auto-apply vs Jev vs agent).
 */

import { promises as fs } from "node:fs";
import type { Tree } from "web-tree-sitter";
import { grammarFile } from "./tree-sitter-assets";
import { parserFor } from "./tree-sitter-parser";
import {
	resolveComponentAnchor,
	type ComponentAnchorResult,
} from "../../../subsystems-react/src/graphify/anchor";
import type {
	GraphifyNode,
} from "../../../subsystems-react/src/graphify/types";
import { hashContentRange, parseSourceLocation } from "./declaration-ref";
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

/** `ts`/`tsx`/`js`/`py` — the dialect key used below. */
function languageKey(file: string): string | null {
	const wasm = grammarFile(file);
	if (!wasm) return null;
	return wasm.replace("tree-sitter-", "").replace(".wasm", "");
}

// ---------------------------------------------------------------------------
// declaration kinds + kind→construct mapping
// ---------------------------------------------------------------------------

const TS_DECLARATIONS = new Set([
	"interface_declaration",
	"type_alias_declaration",
	"function_declaration",
	"generator_function_declaration",
	"class_declaration",
	"abstract_class_declaration",
	"method_definition",
	"enum_declaration",
	"lexical_declaration",
	"variable_declarator",
]);

const PY_DECLARATIONS = new Set([
	"function_definition",
	"class_definition",
	"decorated_definition",
	"assignment",
]);

const GO_DECLARATIONS = new Set([
	"function_declaration",
	"method_declaration",
	"type_declaration",
]);

function declarationKinds(key: string): Set<string> {
	if (key === "python") return PY_DECLARATIONS;
	if (key === "go") return GO_DECLARATIONS;
	return TS_DECLARATIONS;
}

/** Map a tree-sitter node type to the model construct vocabulary. */
function constructForNode(nodeType: string): string | null {
	switch (nodeType) {
		case "interface_declaration":
			return "interface";
		case "type_alias_declaration":
			return "type_alias";
		case "class_declaration":
		case "abstract_class_declaration":
			return "class";
		case "method_definition":
		case "function_signature":
		case "abstract_method_signature":
		case "method_declaration":
			return "method";
		case "function_declaration":
		case "generator_function_declaration":
			return "function";
		case "enum_declaration":
			return "enum";
		default:
			return null; // lexical/variable — could be store or function; not classifiable
	}
}

/** True when the derived construct is compatible with the claimed one. */
function kindCompatible(claimed: string | undefined, derived: string | null): boolean {
	if (!derived) return true; // variable/unknown node type — not a kind gate
	if (!claimed || claimed === "external") return true;
	if (derived === claimed) return true;
	// A store/function variable holding a class/function is not classifiable here.
	if (derived === "type_alias" && claimed === "type") return true;
	return false;
}

// ---------------------------------------------------------------------------
// derivation
// ---------------------------------------------------------------------------

export type SpanClass =
	| "deterministic"
	| "trivial"
	| "ambiguous"
	| "unknown"
	| "skipped";

export interface SpanDerivation {
	class: SpanClass;
	language: string | null;
	graphifyStart: number | null;
	derivedEnd: number | null;
	declNodeType: string | null;
	declName: string | null;
	failedGates: string[];
	evidence: string[];
}

interface Candidate {
	type: string;
	end: number;
	name: string | null;
	hasError: boolean;
	hasBody: boolean;
}

function nameOf(node: {
	type: string;
	childForFieldName?: (f: string) => { text: string } | null;
	namedChildren: Array<{
		type: string;
		text: string;
		childForFieldName?: (f: string) => { text: string } | null;
	}>;
}): string | null {
	const direct = node.childForFieldName?.("name");
	if (direct?.text) return direct.text;
	if (node.type === "lexical_declaration") {
		const d = node.namedChildren.find((c) => c.type === "variable_declarator");
		return d?.childForFieldName?.("name")?.text ?? null;
	}
	if (node.type === "type_declaration") {
		// Go: `type Name …` — the name lives on the nested type_spec.
		const spec = node.namedChildren.find((c) => c.type === "type_spec");
		return spec?.childForFieldName?.("name")?.text ?? null;
	}
	if (node.type === "assignment") {
		// Python: `NAME = …` — no name field; the left identifier is the name.
		const left = node.namedChildren.find((c) => c.type === "identifier");
		return left?.text ?? null;
	}
	if (node.type === "decorated_definition") {
		const d = node.namedChildren.find(
			(c) => c.type === "function_definition" || c.type === "class_definition",
		);
		return d?.childForFieldName?.("name")?.text ?? null;
	}
	return null;
}

const BODY_TYPES = new Set([
	"statement_block",
	"class_body",
	"interface_body",
	"enum_body",
	"block",
]);

function hasBodyChild(node: { namedChildren: Array<{ type: string }> }): boolean {
	return node.namedChildren.some((c) => BODY_TYPES.has(c.type));
}

function collectCandidates(
	root: { type: string; startPosition: { row: number }; endPosition: { row: number }; namedChildren: unknown[] },
	targetRow: number,
	kinds: Set<string>,
	out: Array<Record<string, unknown>> = [],
): Array<Record<string, unknown>> {
	const anyNode = root as unknown as {
		type: string;
		startPosition: { row: number };
		endPosition: { row: number };
		namedChildren: Array<Record<string, unknown>>;
		childForFieldName?: (f: string) => { text: string } | null;
		hasError: boolean;
	};
	if (anyNode.startPosition.row === targetRow && kinds.has(anyNode.type)) {
		out.push(anyNode);
	}
	for (const c of anyNode.namedChildren) {
		collectCandidates(c as never, targetRow, kinds, out);
	}
	return out;
}

function normalizeCandidates(raw: Array<Record<string, unknown>>): Candidate[] {
	const cands: Candidate[] = raw.map((n) => {
		const node = n as unknown as {
			type: string;
			endPosition: { row: number };
			hasError: boolean;
			namedChildren: Array<{ type: string }>;
			childForFieldName?: (f: string) => { text: string } | null;
		};
		return {
			type: node.type,
			end: node.endPosition.row + 1,
			name: nameOf(node as never),
			hasError: node.hasError,
			hasBody: hasBodyChild(node),
		};
	});
	// lexical_declaration duplicates its variable_declarator (same name + end).
	const seen = new Set<string>();
	const deduped: Candidate[] = [];
	for (const c of cands) {
		const key = `${c.name ?? "?"}:${c.end}`;
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(c);
	}
	return deduped;
}

const GATE_LABELS: Record<string, string> = {
	"no-anchor": "graphify could not anchor file+symbol",
	"no-grammar": "no tree-sitter grammar for this extension",
	"no-candidate": "no declaration node starts on the graphify line",
	"multiple-candidates": "more than one declaration starts on the line",
	"name-mismatch": "declaration name does not match the claimed symbol",
	"kind-mismatch": "declaration kind does not match the claimed construct",
	"parse-error": "tree-sitter reported a syntax error in the declaration",
	"file-unreadable": "file could not be read from the checkout",
};

/** Per-audit-pass parse-tree cache, keyed by repo file path. */
export type SpanTreeCache = Map<string, Tree>;

export interface DeriveInput {
	content: string;
	file: string;
	symbol?: string;
	construct?: string;
	anchor: ComponentAnchorResult;
	storedSpan?: { startLine: number; endLine: number; contentHash: string };
	/** Shared across components of the same pass (parse once per file). */
	treeCache?: SpanTreeCache;
}

/**
 * Classify one declaration span derivation. Pure given `content` + anchor.
 */
export async function deriveSpan(input: DeriveInput): Promise<SpanDerivation> {
	const evidence: string[] = [];
	const failed: string[] = [];

	const graphifyStart =
		input.anchor.resolution === "exact" && input.anchor.node
			? parseSourceLocation(
					typeof input.anchor.node.source_location === "string"
						? input.anchor.node.source_location
						: undefined,
				)
			: null;
	evidence.push(`anchor=${input.anchor.resolution}`);
	if (graphifyStart == null) {
		failed.push("no-anchor");
		return {
			class: "unknown",
			language: languageKey(input.file),
			graphifyStart: null,
			derivedEnd: null,
			declNodeType: null,
			declName: null,
			failedGates: failed,
			evidence,
		};
	}
	evidence.push(`graphify L${graphifyStart}`);

	if (!grammarFile(input.file)) {
		failed.push("no-grammar");
		return {
			class: "unknown",
			language: null,
			graphifyStart,
			derivedEnd: null,
			declNodeType: null,
			declName: null,
			failedGates: failed,
			evidence,
		};
	}

	const parser = await parserFor(input.file);
	if (!parser) {
		failed.push("no-grammar");
		return {
			class: "unknown",
			language: null,
			graphifyStart,
			derivedEnd: null,
			declNodeType: null,
			declName: null,
			failedGates: failed,
			evidence,
		};
	}

	// Parse once per file per audit pass: reuse a cached tree when the caller
	// shares one (many components live in the same file).
	let tree = input.treeCache?.get(input.file) ?? null;
	if (!tree) {
		tree = parser.parse(input.content);
		parser.delete?.();
		if (tree) input.treeCache?.set(input.file, tree);
	} else {
		parser.delete?.();
	}
	if (!tree) {
		failed.push("parse-error");
		return {
			class: "unknown",
			language: languageKey(input.file),
			graphifyStart,
			derivedEnd: null,
			declNodeType: null,
			declName: null,
			failedGates: failed,
			evidence,
		};
	}
	const key = languageKey(input.file) ?? "typescript";
	const kinds = declarationKinds(key);

	// Candidates at the graphify line; if none, look a few lines forward
	// (graphify may point at a leading decorator or doc comment).
	let row = graphifyStart - 1;
	let candidates = normalizeCandidates(
		collectCandidates(tree.rootNode as never, row, kinds),
	);
	let offset = 0;
	if (candidates.length === 0) {
		for (let probe = 1; probe <= 5; probe++) {
			candidates = normalizeCandidates(
				collectCandidates(tree.rootNode as never, row + probe, kinds),
			);
			if (candidates.length > 0) {
				offset = probe;
				break;
			}
		}
		if (offset > 0) evidence.push(`anchor offset +${offset} line(s)`);
	}

	if (candidates.length === 0) {
		failed.push("no-candidate");
		return {
			class: "unknown",
			language: key,
			graphifyStart,
			derivedEnd: null,
			declNodeType: null,
			declName: null,
			failedGates: failed,
			evidence,
		};
	}
	if (candidates.length > 1) {
		failed.push("multiple-candidates");
		const ends = new Set(candidates.map((c) => c.end));
		if (ends.size === 1) evidence.push(`${candidates.length} nodes, one end line`);
		return {
			class: "ambiguous",
			language: key,
			graphifyStart,
			derivedEnd: null,
			declNodeType: candidates[0]!.type,
			declName: candidates[0]!.name,
			failedGates: failed,
			evidence,
		};
	}

	const cand = candidates[0]!;
	evidence.push(`node=${cand.type} end=L${cand.end}`);

	// name gate
	if (input.symbol && cand.name) {
		const last = input.symbol.includes(".")
			? (input.symbol.split(".").pop() ?? input.symbol)
			: input.symbol;
		const matches =
			cand.name === input.symbol || cand.name === last;
		if (!matches) {
			failed.push("name-mismatch");
			evidence.push(`node name=${cand.name} ≠ symbol=${input.symbol}`);
		} else {
			evidence.push(`name=${cand.name} matches`);
		}
	} else if (input.symbol && !cand.name) {
		evidence.push("declaration has no name field");
	}

	// kind gate
	const derivedConstruct = constructForNode(cand.type);
	if (!kindCompatible(input.construct, derivedConstruct)) {
		failed.push("kind-mismatch");
		evidence.push(`kind=${derivedConstruct} ≠ claim=${input.construct}`);
	}

	// parse gate
	if (cand.hasError) {
		failed.push("parse-error");
	}

	const derivedEnd = cand.end;

	// deterministic: a stored span re-hashes unchanged at the derived range.
	if (
		input.storedSpan &&
		hashContentRange(input.content, graphifyStart, derivedEnd) ===
			input.storedSpan.contentHash
	) {
		evidence.push("re-hashes to stored contentHash");
		return {
			class: "deterministic",
			language: key,
			graphifyStart,
			derivedEnd,
			declNodeType: cand.type,
			declName: cand.name,
			failedGates: [],
			evidence,
		};
	}

	const class_: SpanClass = failed.length === 0 ? "trivial" : "ambiguous";
	if (class_ === "trivial" && !cand.hasBody) evidence.push("bodyless (signature only)");
	return {
		class: class_,
		language: key,
		graphifyStart,
		derivedEnd,
		declNodeType: cand.type,
		declName: cand.name,
		failedGates: failed,
		evidence,
	};
}

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

/** Not a code component — externals, proposed placeholders, missing identity. */
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
		component.proposed ||
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
	for (const c of graph.components) {
		components.push(await classifyComponent(graphId, c, treeCache));
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
	return { models: entries.length, components, summary: summarize(components) };
}

export { GATE_LABELS };
