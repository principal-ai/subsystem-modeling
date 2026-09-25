/**
 * Build the Storybook declaration-search fixture from a real graphify graph.
 *
 * Reads a graphify `graph.json` (defaults to the latest cached graph for
 * `pkg:github/principal-ai/subsystem-modeling`), infers the construct for every
 * code declaration using the same {@link inferConstructFromGraphify} rules the
 * app uses, and rebuilds a `GraphifyComponentDetail` from the incident edges so
 * the search list can render the real declaration panel. Writes one compact
 * rows fixture consumed by the ConstructsSearch story.
 *
 *   bun scripts/build-constructs-fixture.ts [--graph <graph.json>]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
	extractGraphifySignature,
	inferConstructFromGraphify,
	type GraphifyCallInfo,
	type GraphifyClassDetail,
	type GraphifyComponentDetail,
	type GraphifyEdge,
	type GraphifyFunctionDetail,
	type GraphifyGraph,
	type GraphifyMethodInfo,
	type GraphifyNode,
	type GraphifyParamInfo,
	type GraphifyReferenceInfo,
	type GraphifyTypeDetail,
} from "@principal-ai/subsystems-react";

const OUT = resolve(
	import.meta.dir,
	"../src/mainview/fixtures/graphify-constructs-sample.json",
);
const STORE_ROOT = join(homedir(), ".principal", "graphify-graphs");
const DEFAULT_PURL = "pkg:github/principal-ai/subsystem-modeling";

/** Keep fan-out bounded so a hub function doesn't dominate the fixture. */
const MAX_CALL_EDGES = 40;

const CODE_FILE_RE =
	/\.(py|js|jsx|ts|tsx|mjs|cjs|java|go|rs|rb|php|cs|cpp|cc|c|h|hpp|pas|pp|dpr|swift|kt|scala|dart|lua|pl|pm|ex|exs|zig|vue|svelte)$/i;

interface IndexEntry {
	purl?: string;
	purlKey?: string;
	dirtyHash?: string | null;
	builtAt?: string;
	graphJsonPath?: string;
}

/** Latest cached clean graph for the default purl, else newest dirty slot. */
function defaultGraphPath(): string | null {
	try {
		const index = JSON.parse(
			readFileSync(join(STORE_ROOT, "_index.json"), "utf8"),
		) as { entries?: IndexEntry[] };
		const entries = (index.entries ?? []).filter(
			(e) =>
				(e.purlKey ?? e.purl) === DEFAULT_PURL && e.graphJsonPath,
		);
		if (entries.length === 0) return null;
		entries.sort((a, b) => {
			const clean = Number(!a.dirtyHash) - Number(!b.dirtyHash);
			if (clean !== 0) return -clean;
			return (b.builtAt ?? "").localeCompare(a.builtAt ?? "");
		});
		return entries[0]!.graphJsonPath!;
	} catch {
		return null;
	}
}

function graphPathFromArgs(): string {
	const flag = process.argv.indexOf("--graph");
	const explicit = flag >= 0 ? process.argv[flag + 1] : undefined;
	const path = explicit ? resolve(explicit) : defaultGraphPath();
	if (!path || !existsSync(path)) {
		throw new Error(
			explicit
				? `graph.json not found: ${explicit}`
				: `no cached graph for ${DEFAULT_PURL} — pass --graph <path>`,
		);
	}
	return path;
}

function isCandidate(node: GraphifyNode): boolean {
	if (node.file_type !== "code") return false;
	const file = typeof node.source_file === "string" ? node.source_file : "";
	if (!file || !CODE_FILE_RE.test(file)) return false;
	return String(node.label ?? "").trim().length > 0;
}

function lineFromLocation(loc: unknown): number | null {
	if (typeof loc !== "string") return null;
	const m = /^L(\d+)$/.exec(loc.trim());
	return m ? Number(m[1]) : null;
}

function labelOf(id: unknown, nodesById: ReadonlyMap<string, GraphifyNode>): string {
	const key = String(id);
	const node = nodesById.get(key);
	const label = node && typeof node.label === "string" ? node.label.trim() : "";
	return label || key;
}

function locationOf(edge: GraphifyEdge): string | undefined {
	return typeof edge.source_location === "string" ? edge.source_location : undefined;
}

/**
 * Declaration order as written in the file, not the order graphify emitted the
 * edges. Nodes the graph gave no line for sort last, keeping edge order among
 * themselves.
 */
function lineOf(
	id: unknown,
	nodesById: ReadonlyMap<string, GraphifyNode>,
): number {
	const node = nodesById.get(String(id));
	return lineFromLocation(node?.source_location) ?? Number.MAX_SAFE_INTEGER;
}

/** `.findGitRoot()` → `findGitRoot`; drops the method-sigil and call parens. */
function methodName(label: string): string {
	return label.replace(/^\./, "").replace(/\(\)$/, "");
}

function symbolFromLabel(label: string): string {
	return label.replace(/^\./, "").replace(/\(\)$/, "");
}

function buildDeclaration(
	nodeId: string,
	construct: string,
	out: ReadonlyMap<string, GraphifyEdge[]>,
	inc: ReadonlyMap<string, GraphifyEdge[]>,
	nodesById: ReadonlyMap<string, GraphifyNode>,
): GraphifyComponentDetail | undefined {
	const outgoing = out.get(nodeId) ?? [];
	const incoming = inc.get(nodeId) ?? [];

	const paramsOf = (id: string): GraphifyParamInfo[] => {
		const sig = extractGraphifySignature(id, out.get(id) ?? [], nodesById);
		return sig.parameters.map((p) => ({
			type: p.type,
			ref: { nodeId: p.nodeId, name: p.type },
		}));
	};
	const returnOf = (id: string) => {
		const sig = extractGraphifySignature(id, out.get(id) ?? [], nodesById);
		return sig.returnType
			? { returnType: sig.returnType, ref: { nodeId: sig.returnTypeNodeId ?? "", name: sig.returnType } }
			: {};
	};
	const callInfo = (otherId: unknown, edge: GraphifyEdge): GraphifyCallInfo => ({
		nodeId: String(otherId),
		name: labelOf(otherId, nodesById),
		source_location: locationOf(edge),
	});
	const refInfo = (otherId: unknown, edge: GraphifyEdge): GraphifyReferenceInfo => ({
		nodeId: String(otherId),
		name: labelOf(otherId, nodesById),
		context: typeof edge.context === "string" ? edge.context : undefined,
		source_location: locationOf(edge),
	});

	if (construct === "function") {
		const ret = returnOf(nodeId);
		return {
			kind: "function",
			parameters: paramsOf(nodeId),
			returnType: ret.returnType,
			returnTypeRef: ret.ref,
			callers: incoming
				.filter((e) => e.relation === "calls")
				.slice(0, MAX_CALL_EDGES)
				.map((e) => callInfo(e.source, e)),
			callees: outgoing
				.filter((e) => e.relation === "calls")
				.slice(0, MAX_CALL_EDGES)
				.map((e) => callInfo(e.target, e)),
		} satisfies GraphifyFunctionDetail;
	}

	if (construct === "method") {
		const host = incoming.find((e) => e.relation === "method");
		const ret = returnOf(nodeId);
		return {
			kind: "method",
			hostClass: host ? labelOf(host.source, nodesById) : "Host",
			parameters: paramsOf(nodeId),
			returnType: ret.returnType,
		};
	}

	if (construct === "class") {
		const methods: GraphifyMethodInfo[] = outgoing
			.filter((e) => e.relation === "method")
			.sort((a, b) => lineOf(a.target, nodesById) - lineOf(b.target, nodesById))
			.map((e) => {
				const mid = String(e.target);
				const ret = returnOf(mid);
				return {
					nodeId: mid,
					name: methodName(labelOf(mid, nodesById)),
					parameters: paramsOf(mid),
					returnType: ret.returnType,
					returnTypeRef: ret.ref,
				};
			});
		return {
			kind: "class",
			methods,
			properties: outgoing
				.filter((e) => e.relation === "defines" && e.context === "field")
				.sort((a, b) => lineOf(a.target, nodesById) - lineOf(b.target, nodesById))
				.map((e) => ({ name: labelOf(e.target, nodesById) })),
			extends: outgoing
				.filter((e) => e.relation === "inherits" || e.relation === "extends")
				.map((e) => labelOf(e.target, nodesById)),
			implements: outgoing
				.filter((e) => e.relation === "implements")
				.map((e) => labelOf(e.target, nodesById)),
			instantiations: incoming
				.filter((e) => e.relation === "calls")
				.slice(0, MAX_CALL_EDGES)
				.map((e) => callInfo(e.source, e)),
			references: outgoing
				.filter((e) => e.relation === "references")
				.map((e) => refInfo(e.target, e)),
		} satisfies GraphifyClassDetail;
	}

	if (construct === "type") {
		return {
			kind: "type",
			properties: outgoing
				.filter((e) => e.relation === "defines")
				.sort((a, b) => lineOf(a.target, nodesById) - lineOf(b.target, nodesById))
				.map((e) => ({ name: labelOf(e.target, nodesById) })),
			usedBy: incoming
				.filter((e) => e.relation === "references")
				.map((e) => refInfo(e.source, e)),
			implementors: incoming
				.filter((e) => e.relation === "inherits" || e.relation === "implements")
				.map((e) => labelOf(e.source, nodesById)),
		} satisfies GraphifyTypeDetail;
	}

	return undefined;
}

function main(): void {
	const graphPath = graphPathFromArgs();
	const graph = JSON.parse(readFileSync(graphPath, "utf8")) as GraphifyGraph;
	const nodes = graph.nodes ?? [];
	const links = (graph.links ?? graph.edges ?? []) as GraphifyEdge[];

	const nodesById = new Map<string, GraphifyNode>();
	for (const node of nodes) nodesById.set(String(node.id), node);

	const candidates = new Map<string, GraphifyNode>();
	for (const node of nodes) {
		if (isCandidate(node)) candidates.set(String(node.id), node);
	}

	// Only edges touching a candidate are needed (for inference + drill-down).
	const out = new Map<string, GraphifyEdge[]>();
	const inc = new Map<string, GraphifyEdge[]>();
	const push = (map: Map<string, GraphifyEdge[]>, id: string, edge: GraphifyEdge) => {
		const list = map.get(id);
		if (list) list.push(edge);
		else map.set(id, [edge]);
	};
	for (const edge of links) {
		const source = String(edge.source);
		const target = String(edge.target);
		if (candidates.has(source)) push(out, source, edge);
		if (candidates.has(target)) push(inc, target, edge);
	}

	const moduleRows: string[] = [];
	const declarations = [...candidates.values()]
		.flatMap((node) => {
			const id = String(node.id);
			const label = String(node.label ?? "").trim();
			const { construct } = inferConstructFromGraphify(node, [
				...(out.get(id) ?? []),
				...(inc.get(id) ?? []),
			]);
			// A module node is a file, not a construct — and every row already
			// prints its file. Keep them out of the construct list.
			if (construct === "module") {
				moduleRows.push(id);
				return [];
			}
			const declaration = buildDeclaration(id, construct, out, inc, nodesById);
			return [
				{
					id,
					name: label,
					symbol: symbolFromLabel(label),
					construct,
					file: String(node.source_file ?? ""),
					line: lineFromLocation(node.source_location),
					community:
						typeof node.community === "number" ? node.community : null,
					...(declaration ? { declaration } : {}),
				},
			];
		})
		.sort(
			(a, b) =>
				a.file.localeCompare(b.file) ||
				(a.line ?? 0) - (b.line ?? 0) ||
				a.name.localeCompare(b.name),
		);

	const withDeclaration = declarations.filter((d) => d.declaration).length;
	const payload = {
		source: {
			graphJsonPath: graphPath,
			purl: DEFAULT_PURL,
			builtAtCommit:
				typeof graph.built_at_commit === "string"
					? graph.built_at_commit
					: null,
			generatedAt: new Date().toISOString(),
			nodeCount: nodes.length,
			edgeCount: links.length,
			declarationCount: declarations.length,
			declarationsWithDetail: withDeclaration,
			/** File-level nodes omitted because they aren't constructs. */
			moduleNodesOmitted: moduleRows.length,
		},
		declarations,
	};

	mkdirSync(dirname(OUT), { recursive: true });
	writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	console.log(
		`wrote ${declarations.length} declarations (${withDeclaration} with detail, ${moduleRows.length} module nodes omitted) to ${OUT}`,
	);
}

main();
