/**
 * Host-side symbol inspection: resolve one symbol referenced by a declaration
 * against the cached graphify graph for its repo, and return what graphify
 * knows — the definition node, the declaration read from source, and the
 * candidate definitions when the name is ambiguous.
 *
 * Display-only: nothing here writes to the model or the graph. The declaration
 * is read straight from the local checkout at the node's anchor line, so it's
 * the real source text (not a reconstruction from graph edges).
 */

import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { findUniqueDefinitionBySymbol } from "../../../subsystems-react/src/graphify/anchor";
import { normalizeSourcePath } from "../../../subsystems-react/src/graphify/ids";
import { createGraphifyTypeResolver } from "../../../subsystems-react/src/graphify/resolve";
import type { GraphifyNode } from "../../../subsystems-react/src/graphify/types";
import type {
	SymbolInspection,
	SymbolInspectionCandidate,
	SymbolInspectionResolution,
	SymbolInspectionSource,
} from "@principal-ai/subsystems-react";
import { parseSourceLocation } from "./declaration-ref";
import { loadGraphifyGraph } from "./graphify-runner";
import {
	getCachedGraphifyGraph,
	resolveRepoRootForPurl,
} from "./graphify-store";
import { purlRepoKey } from "./subsystem-model-store";

/**
 * Extract a declaration's text from source, starting at `startLine` (1-based).
 * Balanced braces/parens/brackets bound the span; for braceless declarations
 * (`type X = A | B;`, Python `def f():`) the first line terminates it. Caps at
 * 200 lines so a malformed start can't run away.
 */
function extractDeclarationText(
	lines: string[],
	startLine: number,
): string | null {
	const start = startLine - 1;
	if (start < 0 || start >= lines.length) return null;
	const out: string[] = [];
	let depth = 0;
	let sawOpen = false;
	const max = Math.min(lines.length, start + 200);
	for (let i = start; i < max; i++) {
		const line = lines[i] ?? "";
		out.push(line);
		for (const ch of line) {
			if (ch === "{" || ch === "(" || ch === "[") {
				depth += 1;
				sawOpen = true;
			} else if (ch === "}" || ch === ")" || ch === "]") {
				depth -= 1;
			}
		}
		if (sawOpen && depth <= 0) break;
		if (!sawOpen) {
			const trimmed = line.trimEnd();
			if (trimmed.endsWith(";") || trimmed.endsWith("=>")) break;
			if (i === start && trimmed.endsWith(":")) break;
		}
	}
	return out.join("\n").replace(/\s+$/, "");
}

function nodeInfo(
	node: GraphifyNode,
): NonNullable<SymbolInspection["node"]> {
	const info: NonNullable<SymbolInspection["node"]> = {
		nodeId: String(node.id),
		label: String(node.label ?? ""),
	};
	if (node.source_file) {
		info.sourceFile = normalizeSourcePath(String(node.source_file));
	}
	if (node.source_location) info.sourceLocation = String(node.source_location);
	if (node.file_type) info.fileType = String(node.file_type);
	if (node.community_name) info.community = String(node.community_name);
	return info;
}

function candidateInfos(
	nodes: readonly GraphifyNode[],
): SymbolInspectionCandidate[] {
	// Deterministic: by source file path, then node id — graphify's node order
	// is not stable across rebuilds.
	return [...nodes]
		.sort((a, b) => {
			const fa = a.source_file ? normalizeSourcePath(String(a.source_file)) : "";
			const fb = b.source_file ? normalizeSourcePath(String(b.source_file)) : "";
			if (fa !== fb) return fa.localeCompare(fb);
			return String(a.id).localeCompare(String(b.id));
		})
		.slice(0, 8)
		.map((n) => {
			const c: SymbolInspectionCandidate = {
				nodeId: String(n.id),
				label: String(n.label ?? ""),
			};
			if (n.source_file) c.sourceFile = normalizeSourcePath(String(n.source_file));
			return c;
		});
}

export async function inspectSubsystemSymbol(input: {
	purl: string;
	file?: string;
	symbol: string;
	nodeId?: string;
}): Promise<SymbolInspection> {
	const symbol = input.symbol.trim();
	const purlKey = purlRepoKey(input.purl) ?? input.purl.trim();
	const empty: SymbolInspection = {
		symbol,
		purl: purlKey || input.purl,
		resolution: "missing",
	};
	if (!purlKey || !symbol) {
		return { ...empty, reason: "missing purl or symbol" };
	}

	const repoRoot = resolveRepoRootForPurl(purlKey);
	const cached = await getCachedGraphifyGraph(purlKey, {
		repoRoot: repoRoot ?? undefined,
	});
	if (!cached) {
		return {
			...empty,
			reason: repoRoot
				? "no graphify cache for this repo — run graphify"
				: "no local checkout for this repo",
		};
	}

	const smoke = loadGraphifyGraph(cached.path);
	const nodes = (smoke.nodes ?? []) as GraphifyNode[];

	// Resolve the symbol. A reference that carried a graphify node id is exact;
	// otherwise look the name up corpus-wide (never anchor to the *referencing*
	// component's file — that's a different symbol's file).
	let resolution: SymbolInspectionResolution = "missing";
	let node: GraphifyNode | null = null;
	let candidates: GraphifyNode[] = [];

	if (input.nodeId) {
		const r = createGraphifyTypeResolver(nodes).resolve(input.nodeId, symbol);
		resolution = r.status;
		node = r.node;
		candidates = r.candidates;
	} else {
		const u = findUniqueDefinitionBySymbol(nodes, symbol);
		if (u.status === "unique") {
			resolution = "resolved";
			node = u.node;
		} else if (u.status === "ambiguous") {
			resolution = "ambiguous";
			candidates = u.candidates;
		}
	}

	// Declaration: read the real source at the node's anchor line.
	let source: SymbolInspectionSource | undefined;
	const startLine = parseSourceLocation(node?.source_location ?? undefined);
	if (
		resolution === "resolved" &&
		node &&
		repoRoot &&
		node.source_file &&
		startLine != null
	) {
		const rel = normalizeSourcePath(String(node.source_file));
		const abs = join(repoRoot, rel);
		if (existsSync(abs)) {
			try {
				const content = await fs.readFile(abs, "utf8");
				const text = extractDeclarationText(content.split(/\r?\n/), startLine);
				if (text) source = { file: rel, startLine, text };
			} catch {
				/* unreadable — fall through to the status message */
			}
		}
	}

	let reason: string | undefined;
	if (resolution === "ambiguous") reason = "multiple definitions match";
	else if (resolution === "unresolved") {
		reason = "referenced but not defined in this corpus";
	} else if (resolution === "missing") {
		reason = "no matching definition in the cached graph";
	} else if (resolution === "resolved" && !source) {
		reason = repoRoot
			? "declaration source not readable"
			: "no local checkout for this repo";
	}

	return {
		symbol,
		purl: purlKey,
		resolution,
		...(node ? { node: nodeInfo(node) } : {}),
		...(source ? { source } : {}),
		...(candidates.length ? { candidates: candidateInfos(candidates) } : {}),
		...(reason ? { reason } : {}),
	};
}
