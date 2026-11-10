/**
 * Graphify supplies candidates; source supplies declaration identity, kind and
 * span. No subsystem-model membership, inferred graph kind, or display label
 * alone is accepted as verification.
 *
 * Declaration parsing and symbol resolution are shared with the CLI through
 * the core audit layer. This module keeps the Studio-only construct inventory.
 */
import { promises as fs } from "node:fs";
import { basename } from "node:path";
import type { GraphifyNode } from "../../../subsystems-core/src/graphify/types";
import type { SourceConstruct } from "../shared/contract";
import {
	enclosingDeclaration,
	declarationForSymbol,
	parseDeclarations,
	safeSource,
	type ParsedDeclaration,
} from "../../../subsystems-core/src/audit/verify/declarations";
import { parseSourceLocation } from "../../../subsystems-core/src/audit/hash";
import { grammarFile } from "../../../subsystems-core/src/audit/verify/grammar";

export { enclosingDeclaration, declarationForSymbol };

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
		let declarations: ParsedDeclaration[] | null = null;
		let content = "";
		let error: string | undefined;
		try {
			if (grammarFile(file)) {
				content = await safeSource(root, file);
				declarations = (await parseDeclarations(file, content))?.declarations ?? null;
			}
		} catch {
			input.signal?.throwIfAborted();
			// Do not reflect source text, paths outside the repo, or parser internals.
			// A single unreadable/unparseable file yields `error` candidates for that
			// file instead of aborting the whole run.
			error = "Could not read or initialize the parser for this source file.";
		}
		const byLine = new Map<number, ParsedDeclaration[]>();
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
