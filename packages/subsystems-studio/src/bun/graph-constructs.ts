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
import type { ConstructHistoryObservation, ConstructHistoryTarget, ConstructHistoryTransition } from "../shared/construct-history";
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
	shapeHash: string;
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
				const nameNode = node.childForFieldName("name")!;
				const shape = `${node.text.slice(0, nameNode.startIndex - node.startIndex)}<name>${node.text.slice(nameNode.endIndex - node.startIndex)}`;
				declarations.push({
					name, symbol,
					construct,
					startLine, endLine, anchorEnd: node.startPosition.row + 1,
					hasError: start.hasError,
					contentHash: createHash("sha256").update(lines.slice(startLine - 1, endLine).join("\n")).digest("hex").slice(0, 32),
					shapeHash: createHash("sha256").update(`${construct}\0${shape.replace(/\s+/g, " ")}`).digest("hex").slice(0, 32),
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
	/** History must stop on operational faults, not manufacture historical gaps. */
	strict?: boolean;
	/** Historical matching only needs the files containing active targets. */
	files?: ReadonlySet<string>;
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
		if (input.files && !input.files.has(file)) continue;
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
				declarationShapeHash: status === "verified" ? declaration?.shapeHash : undefined,
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

export function graphHistoryTargets(inventory: GraphConstructInventory): ConstructHistoryTarget[] {
	return inventory.constructs.filter((row) => row.verification.status === "verified" && row.span).map((row) => ({
		id: row.id, name: row.name, file: row.file, symbol: row.symbol, construct: row.construct,
	}));
}

/**
 * Identity set of a graph's code candidates, before source verification. This
 * is the cheap census the death/creation diff runs on: "Graphify succeeded and
 * the identity is not here" is enough. File/module containers and import stubs
 * are already excluded by `candidates`.
 */
export function graphCandidateIdentities(nodes: readonly GraphifyNode[]): Map<string, { file: string; symbol: string }> {
	const identities = new Map<string, { file: string; symbol: string }>();
	for (const [file, group] of candidates(nodes)) {
		// Only source languages with a bundled parser: manifest/dependency nodes
		// (e.g. package.json entries) are not constructs.
		if (!grammarFile(file)) continue;
		for (const node of group) {
			const symbol = graphSymbol(node.label!);
			if (!symbol) continue;
			const key = `${file}\0${symbol}`;
			if (!identities.has(key)) identities.set(key, { file, symbol });
		}
	}
	return identities;
}

/**
 * Identity changes between an older and a newer adjacent snapshot. Only exact
 * file/qualified-symbol identity: no rename, move or split reconciliation, so
 * those surface as one removal plus one introduction.
 */
export function diffConstructIdentities(
	older: ReadonlyMap<string, { file: string; symbol: string }>,
	newer: ReadonlyMap<string, { file: string; symbol: string }>,
): ConstructHistoryTransition[] {
	const transitions: ConstructHistoryTransition[] = [];
	for (const [key, value] of older) {
		if (!newer.has(key)) transitions.push({ kind: "removed", file: value.file, symbol: value.symbol });
	}
	for (const [key, value] of newer) {
		if (!older.has(key)) transitions.push({ kind: "introduced", file: value.file, symbol: value.symbol });
	}
	return transitions.sort((a, b) => a.kind.localeCompare(b.kind) || a.file.localeCompare(b.file) || a.symbol.localeCompare(b.symbol));
}

/** Preserve the existing conservative no-gap, exact-identity/rename policy. */
export async function matchGraphHistoryConstructs(input: {
	repoRoot: string;
	purl: string;
	nodes: readonly GraphifyNode[];
	targets: ConstructHistoryTarget[];
	newer?: ConstructHistoryObservation[];
	renames: Map<string, string>;
	signal?: AbortSignal;
	detectIntroductions?: boolean;
	/** The newer snapshot's actual first parent, not merely the next selected date. */
	adjacent?: boolean;
	/** Complete Git tree. Symlinks/submodules cannot prove source absence. */
	sourceTree?: ReadonlyMap<string, "file" | "other">;
	/** Full-inventory coverage at this snapshot; introduction-detection runs only. */
	onInventory?: (coverage: GraphConstructInventory["coverage"]) => void;
}): Promise<ConstructHistoryObservation[]> {
	const newer = new Map(input.newer?.map((observation) => [observation.targetId, observation]));
	const locations = new Map<string, string>();
	for (const target of input.targets) {
		const previous = newer.get(target.id);
		if (input.newer && previous?.status !== "matched") continue;
		const file = previous?.file ?? target.file;
		locations.set(target.id, input.renames.get(file) ?? file);
	}
	if (!locations.size) return input.targets.map((target) => {
		const previous = newer.get(target.id);
		return input.detectIntroductions && (previous?.status === "absent" || previous?.status === "not-traced")
			? { targetId: target.id, status: "not-traced", evidence: "Earlier than the confirmed introduction boundary; earlier incarnations are not traced." }
			: { targetId: target.id, status: "unresolved", evidence: `Trace already unresolved at a newer snapshot: ${previous?.evidence ?? "unknown"}` };
	});
	const inventory = await verifyGraphConstructs({
		...input, strict: true,
		files: input.detectIntroductions ? undefined : new Set(locations.values()),
	});
	// A full inventory is only built when introduction detection verifies every
	// candidate file; a target-file subset is not a coverage measurement.
	if (input.detectIntroductions) input.onInventory?.(inventory.coverage);
	const byIdentity = new Map(inventory.constructs.map((row) => [`${row.file}\0${row.symbol}`, row]));
	const olderNames = new Set([...candidates(input.nodes).values()].flat()
		.map((node) => graphSymbol(node.label).split(".").at(-1)));
	const olderShapes = new Set(inventory.constructs.map((row) => row.declarationShapeHash).filter(Boolean));
	const expectedIdentities = new Set(input.targets.flatMap((target) => {
		const file = locations.get(target.id);
		return file ? [`${file}\0${newer.get(target.id)?.symbol ?? target.symbol}`] : [];
	}));
	const unclaimedKinds = new Set(inventory.constructs.filter((row) => row.verification.status === "verified" &&
		!expectedIdentities.has(`${row.file}\0${row.symbol}`)).map((row) => row.construct));
	const root = await fs.realpath(input.repoRoot);
	const observations: ConstructHistoryObservation[] = [];
	for (const target of input.targets) {
		input.signal?.throwIfAborted();
		// Some targets trigger source reads/parses below; yield so RPC stays live.
		if (observations.length % 100 === 0 && observations.length) await new Promise<void>((resolve) => setTimeout(resolve, 0));
		const previous = newer.get(target.id);
		const file = locations.get(target.id);
		if (input.detectIntroductions && (previous?.status === "absent" || previous?.status === "not-traced")) {
			observations.push({ targetId: target.id, status: "not-traced", evidence: "Earlier than the confirmed introduction boundary; earlier incarnations are not traced." });
			continue;
		}
		if (!file) {
			observations.push({ targetId: target.id, status: "unresolved", evidence: `Trace already unresolved at a newer snapshot: ${previous?.evidence ?? "unknown"}` });
			continue;
		}
		const row = byIdentity.get(`${file}\0${previous?.symbol ?? target.symbol}`);
		if (!row?.span || row.verification.status !== "verified") {
			let evidence = row?.verification.evidence ?? "No exact source-verified graph declaration at this snapshot.";
			let absent = false;
			if (input.detectIntroductions && input.adjacent && input.sourceTree && previous?.status === "matched") {
				const name = (previous.symbol ?? target.symbol).split(".").at(-1)!;
				if (!previous.declarationShapeHash) evidence = "No saved declaration fingerprint for checking possible renames.";
				else if (olderNames.has(name) || olderShapes.has(previous.declarationShapeHash) ||
					(target.construct && unclaimedKinds.has(target.construct))) {
					evidence = "An older same-named, same-shaped, or unclaimed same-kind declaration could explain a move or rename; introduction is unknown.";
				} else if (!input.sourceTree.has(file)) {
					absent = true;
					evidence = "Git confirms this file is absent in the immediate first parent; no file rename or declaration move/rename candidate explains it.";
				} else if (input.sourceTree.get(file) !== "file") {
					evidence = "A symlink or submodule cannot establish source absence.";
				} else {
					// Graph absence is not source absence. Parse even files with no
					// graph nodes, and reject errors or unindexed name occurrences.
					let content: string | undefined;
					let parsed: ParsedDeclarations | null = null;
					let parseFailed = false;
					try {
						content = await safeSource(root, file);
						parsed = await declarationsFor(file, content);
					} catch {
						input.signal?.throwIfAborted();
						// One unreadable/unparseable file must not abort a whole run;
						// a failed parse can never prove absence, so stay unknown.
						parseFailed = true;
					}
					if (parseFailed) {
						evidence = "Source parsing failed for this file; introduction is unknown.";
					} else {
						const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
						const mentioned = new RegExp(`(?<![$\\p{ID_Continue}])${escaped}(?![$\\p{ID_Continue}])`, "u").test(content ?? "");
						const possibleRename = parsed?.declarations.some((declaration) => declaration.construct === target.construct &&
							!expectedIdentities.has(`${file}\0${declaration.symbol}`));
						absent = !!parsed && !parsed.hasError && !mentioned && !possibleRename &&
							!parsed.declarations.some((declaration) => declaration.symbol === (previous.symbol ?? target.symbol));
						evidence = absent
							? "Successfully parsed the immediate first parent's source: declaration and name absent, with no move/rename candidate."
							: "Source parsing, an existing name, or unsupported syntax prevents confirming absence; introduction is unknown.";
					}
				}
			}
			observations.push({ targetId: target.id, status: absent ? "absent" : "unresolved",
				...(absent ? { absence: "confirmed" as const, file, symbol: previous?.symbol ?? target.symbol } : {}), evidence });
			continue;
		}
		if (target.construct && target.construct !== row.construct) {
			observations.push({ targetId: target.id, status: "unresolved", evidence: "The parsed declaration kind no longer matches the target." });
			continue;
		}
		observations.push({
			targetId: target.id, status: "matched", file, symbol: row.symbol,
			declarationShapeHash: row.declarationShapeHash,
			...row.span, evidence: `${file === (previous?.file ?? target.file) ? "Exact file/symbol" : "Git file rename"}; ${row.verification.evidence}`,
		});
	}
	return observations;
}
