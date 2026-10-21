/**
 * Graphify supplies candidates; source supplies declaration identity, kind and
 * span. No subsystem-model membership, inferred graph kind, or display label
 * alone is accepted as verification.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import type { Node as SyntaxNode } from "web-tree-sitter";
import type { GraphifyNode } from "../../../subsystems-react/src/graphify/types";
import type { SourceConstruct } from "../shared/contract";
import { normalizeDeclarationLine, parseSourceLocation } from "./declaration-ref";
import { sharedParserFor, parseWith } from "./tree-sitter-parser";
import { grammarFile } from "./tree-sitter-assets";

interface Declaration {
	name: string;
	symbol: string;
	construct: string;
	startLine: number;
	endLine: number;
	/** Graphify may point at the declaration after an export/decorator wrapper. */
	anchorEnd: number;
	hasError: boolean;
	contentHash: string;
}

const kinds: Record<string, string> = {
	function_declaration: "function", generator_function_declaration: "function",
	function_definition: "function", function_item: "function",
	function_signature: "function",
	class_declaration: "class", abstract_class_declaration: "class",
	class_definition: "class", class: "class", struct_item: "class",
	interface_declaration: "type", type_alias_declaration: "type",
	enum_declaration: "type", type_spec: "type", type_item: "type",
	enum_item: "type", trait_item: "type", interface: "type",
	method_definition: "method", method_declaration: "method",
	method_signature: "method", abstract_method_signature: "method",
	constructor_declaration: "method", method: "method", singleton_method: "method",
	public_field_definition: "field", property_signature: "field",
	const_item: "variable", static_item: "variable",
	internal_module: "module", module: "module", mod_item: "module",
};

function declarationKind(node: SyntaxNode): string | undefined {
	if (node.type === "function_item" && node.parent?.parent?.type === "impl_item") return "method";
	if (node.type === "function_definition") {
		let parent = node.parent;
		if (parent?.type === "decorated_definition") parent = parent.parent;
		if (parent?.type === "block" && parent.parent?.type === "class_definition") return "method";
	}
	if (node.type === "variable_declarator") {
		const value = node.childForFieldName("value");
		return value && /^(arrow_function|function_expression|generator_function)$/.test(value.type)
			? "function" : "variable";
	}
	return kinds[node.type];
}

function declarationName(node: SyntaxNode): string | undefined {
	const name = node.childForFieldName("name");
	// Destructured/dynamic names cannot serve as an unambiguous identity.
	if (!name || /pattern|computed|subscript|member_expression/.test(name.type)) return undefined;
	return name.text.trim() || undefined;
}

function receiverName(node: SyntaxNode): string | undefined {
	const receiver = node.childForFieldName("receiver");
	const findType = (part: SyntaxNode): string | undefined => {
		if (part.type === "type_identifier") return part.text;
		for (const child of part.namedChildren) {
			if (!child) continue;
			const name = findType(child);
			if (name) return name;
		}
	};
	return receiver ? findType(receiver) : undefined;
}

/** Cache parsed, hashed metadata, not WASM trees or source text. Bounded LRU. */
interface ParsedDeclarations { declarations: Declaration[]; hasError: boolean }
const declarationCache = new Map<string, ParsedDeclarations | null>();
const MAX_CACHED_FILES = 512;

async function declarationsFor(file: string, content: string): Promise<ParsedDeclarations | null> {
	const key = `${file.slice(file.lastIndexOf(".")).toLowerCase()}\0${createHash("sha256").update(content).digest("hex")}`;
	if (declarationCache.has(key)) {
		const cached = declarationCache.get(key)!;
		declarationCache.delete(key);
		declarationCache.set(key, cached);
		return cached;
	}
	const parser = await sharedParserFor(file);
	if (!parser) return null;
	const tree = await parseWith(parser, content);
	try {
		const declarations: Declaration[] = [];
		const lines = content.split(/\r?\n/).map(normalizeDeclarationLine);
		const visit = (node: SyntaxNode, scopes: string[]) => {
			const construct = declarationKind(node);
			const name = construct ? declarationName(node) : undefined;
			let innerScopes = scopes;
			if (node.type === "impl_item") {
				const type = node.childForFieldName("type")?.text;
				if (type) innerScopes = [...scopes, type];
			}
			if (construct && name) {
				let start = node;
				// A declarator needs its const/let/export wrapper to retain its
				// signature and any modifiers, not just the initializer.
				if (node.type === "variable_declarator" && node.parent?.namedChildren.filter((c) => c?.type === "variable_declarator").length === 1) {
					start = node.parent;
				}
				while (start.parent && /^(export_statement|decorated_definition)$/.test(start.parent.type)) start = start.parent;
				const receiver = node.type === "method_declaration" ? receiverName(node) : undefined;
				const qualifiedScopes = receiver ? [...scopes, receiver] : scopes;
				const symbol = [...qualifiedScopes, name].join(".");
				const startLine = start.startPosition.row + 1;
				const endLine = start.endPosition.row + 1;
				declarations.push({
					name, symbol,
					construct,
					startLine, endLine, anchorEnd: node.startPosition.row + 1,
					hasError: start.hasError,
					contentHash: createHash("sha256").update(lines.slice(startLine - 1, endLine).join("\n")).digest("hex").slice(0, 32),
				});
				if (["class", "function", "method", "module", "type"].includes(construct)) innerScopes = [...qualifiedScopes, name];
			}
			for (const child of node.namedChildren) if (child) visit(child, innerScopes);
		};
		visit(tree.rootNode, []);
		const parsed = { declarations, hasError: tree.rootNode.hasError };
		declarationCache.set(key, parsed);
		if (declarationCache.size > MAX_CACHED_FILES) declarationCache.delete(declarationCache.keys().next().value!);
		return parsed;
	} finally {
		tree.delete();
	}
}

/** A resolved source declaration with its full range, for step site/target refs. */
export interface ResolvedConstructDeclaration {
	symbol: string;
	construct: string;
	startLine: number;
	endLine: number;
	contentHash: string;
}

function toResolvedDeclaration(declaration: Declaration): ResolvedConstructDeclaration {
	return {
		symbol: declaration.symbol,
		construct: declaration.construct,
		startLine: declaration.startLine,
		endLine: declaration.endLine,
		contentHash: declaration.contentHash,
	};
}

/**
 * Resolve the innermost declaration containing `line` in `file`.
 *
 * Trail step sites are hand-authored call-site lines, while the frame the UI
 * wants is the enclosing construct (a method inside a class, a helper inside a
 * module). Picking the smallest containing range gives that frame; the full
 * `startLine..endLine` is what the code view should show.
 */
export async function enclosingDeclaration(input: {
	repoRoot: string;
	file: string;
	line: number;
}): Promise<ResolvedConstructDeclaration | null> {
	const root = await fs.realpath(input.repoRoot);
	const content = await safeSource(root, input.file);
	const declarations = (await declarationsFor(input.file, content))?.declarations ?? [];
	const containing = declarations.filter(
		(d) => d.startLine <= input.line && input.line <= d.endLine,
	);
	containing.sort(
		(a, b) =>
			a.endLine - a.startLine - (b.endLine - b.startLine) ||
			b.symbol.length - a.symbol.length ||
			a.symbol.localeCompare(b.symbol),
	);
	const first = containing[0];
	return first ? toResolvedDeclaration(first) : null;
}

/**
 * Resolve a declaration by qualified symbol in `file`. Exact qualified match
 * first (`Class.method`), then a unique simple-name match — never a guess when
 * the simple name is ambiguous.
 */
export async function declarationForSymbol(input: {
	repoRoot: string;
	file: string;
	symbol: string;
}): Promise<ResolvedConstructDeclaration | null> {
	const root = await fs.realpath(input.repoRoot);
	const content = await safeSource(root, input.file);
	const declarations = (await declarationsFor(input.file, content))?.declarations ?? [];
	const exact = declarations.find((d) => d.symbol === input.symbol);
	if (exact) return toResolvedDeclaration(exact);
	const simple = input.symbol.split(".").at(-1);
	const matches = declarations.filter((d) => d.name === simple);
	return matches.length === 1 ? toResolvedDeclaration(matches[0]!) : null;
}

function graphSymbol(label: string): string {
	return label.trim().replace(/^\.+/, "").replace(/\(\)$/, "").replace(/::/g, ".");
}

function candidates(nodes: readonly GraphifyNode[]): Map<string, GraphifyNode[]> {
	const files = new Map<string, GraphifyNode[]>();
	for (const node of nodes) {
		if (node.file_type !== "code" || typeof node.source_file !== "string" || !node.source_file ||
			typeof node.label !== "string" || !node.label.trim()) continue;
		const file = node.source_file.replace(/\\/g, "/").replace(/^\.\//, "");
		// File/module containers and imported/external stubs are not source
		// declarations. A source location is required even to become a candidate.
		if (node.label.trim() === basename(file) || !parseSourceLocation(node.source_location ?? "")) continue;
		const group = files.get(file) ?? [];
		group.push(node);
		files.set(file, group);
	}
	return files;
}

async function safeSource(root: string, file: string): Promise<string> {
	if (isAbsolute(file) || file.split("/").includes("..")) throw new Error("Unsafe source path.");
	const path = await fs.realpath(resolve(root, file));
	const rel = relative(root, path);
	if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("Source path escapes checkout.");
	const stat = await fs.stat(path);
	if (!stat.isFile() || stat.size > 5_000_000) throw new Error("Source is not a readable file below 5 MB.");
	return fs.readFile(path, "utf8");
}

export interface GraphConstructInventory {
	constructs: SourceConstruct[];
	coverage: Record<SourceConstruct["verification"]["status"], number>;
}

/** Parse each candidate file once, then resolve graph anchors against that index. */
export async function verifyGraphConstructs(input: {
	repoRoot: string;
	purl: string;
	nodes: readonly GraphifyNode[];
	signal?: AbortSignal;
}): Promise<GraphConstructInventory> {
	const root = await fs.realpath(input.repoRoot);
	const checkedAt = new Date().toISOString();
	const rows = new Map<string, SourceConstruct>();
	let scanned = 0;
	for (const [file, nodes] of candidates(input.nodes)) {
		input.signal?.throwIfAborted();
		// Parsing is synchronous CPU; hop off the event loop periodically so the
		// host keeps answering RPC (including the analysis progress poll).
		if (++scanned % 25 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
		let declarations: Declaration[] | null = null;
		let content = "";
		let error: string | undefined;
		try {
			if (grammarFile(file)) {
				content = await safeSource(root, file);
				declarations = (await declarationsFor(file, content))?.declarations ?? null;
			}
		} catch {
			input.signal?.throwIfAborted();
			// Do not reflect source text, paths outside the repo, or parser internals.
			// A single unreadable/unparseable file yields `error` candidates for that
			// file instead of aborting the whole run.
			error = "Could not read or initialize the parser for this source file.";
		}
		const byLine = new Map<number, Declaration[]>();
		const declarationCounts = new Map<string, number>();
		for (const declaration of declarations ?? []) {
			declarationCounts.set(declaration.symbol, (declarationCounts.get(declaration.symbol) ?? 0) + 1);
			for (let line = declaration.startLine; line <= declaration.anchorEnd; line++) {
				const group = byLine.get(line) ?? [];
				group.push(declaration);
				byLine.set(line, group);
			}
		}
		const lines = content.split(/\r?\n/);
		for (const node of nodes) {
			const anchor = parseSourceLocation(node.source_location!)!;
			const label = graphSymbol(node.label);
			const simpleName = label.split(".").at(-1)!;
			let anchored = byLine.get(anchor) ?? [];
			// Graphify sometimes starts at a preceding comment/blank line. Do
			// not jump across executable source to a nearby same-named symbol.
			for (let next = anchor; !anchored.length && next < anchor + 5; next++) {
				if (!/^\s*(?:$|\/\/|\/\*|\*|#)/.test(lines[next - 1] ?? "")) break;
				anchored = byLine.get(next + 1) ?? [];
			}
			const matches = anchored.filter((d) => d.name === simpleName && (!label.includes(".") || d.symbol === label));
			const declaration = matches.length === 1 ? matches[0] : undefined;
			let status: SourceConstruct["verification"]["status"] = error ? "error" : declarations === null ? "unsupported" : "unresolved";
			const duplicateIdentity = declaration && declarationCounts.get(declaration.symbol)! > 1;
			const evidence = error ?? (declarations === null ? "No bundled parser for this file type."
				: matches.length > 1 ? "The graph anchor matches multiple declarations."
				: !declaration ? "The graph anchor and name do not identify one supported source declaration."
				: duplicateIdentity ? "Multiple declarations share this file and qualified name."
				: declaration.hasError ? "The declaration contains a source parse error."
				: "Graph anchor, parsed qualified name, declaration kind and source span verified.");
			if (declaration && !duplicateIdentity && !declaration.hasError && !error) status = "verified";
			const symbol = declaration?.symbol ?? label;
			// Unresolved anchors stay distinct. Multiple graph nodes for the
			// same verified source declaration become one row.
			const id = `${file}\0${symbol}${status === "verified" ? "" : `\0${node.id}`}`;
			const existing = rows.get(id);
			if (existing) {
				existing.graphNodeIds.push(node.id);
				continue;
			}
			rows.set(id, {
				id, name: symbol, symbol, construct: declaration?.construct ?? "unknown",
				file, purl: input.purl, repoKey: input.purl, packageRelativeFile: file,
				graphNodeIds: [node.id], graphStartLine: anchor, models: [],
				verification: { status, evidence, checkedAt },
				span: status === "verified" && declaration ? {
					startLine: declaration.startLine, endLine: declaration.endLine, contentHash: declaration.contentHash,
				} : undefined,
			});
		}
	}
	const constructs = [...rows.values()].sort((a, b) => a.file.localeCompare(b.file) ||
		(a.graphStartLine ?? 0) - (b.graphStartLine ?? 0) || a.symbol.localeCompare(b.symbol));
	const coverage = { verified: 0, unresolved: 0, unsupported: 0, error: 0 };
	for (const row of constructs) coverage[row.verification.status]++;
	return { constructs, coverage };
}
