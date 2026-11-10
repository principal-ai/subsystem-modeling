import type {
	GraphifyAuditModel,
	GraphifyAuditProvider,
} from "../../../subsystems-core/src/audit/graphify-provider";
import { cacheGraphifyAuditProvider } from "../../../subsystems-core/src/audit/graphify-provider";
import { loadGraphifyGraph } from "./graphify-runner";
import {
	assessSubsystemGraphifyReadiness,
	ensureCurrentGraphifyCachesForModel,
	getCachedGraphifyGraph,
	resolveRepoRootForPurl,
} from "./graphify-store";
import type { GraphifyEdge, GraphifyNode } from "../../../subsystems-core/src/graphify/types";

function edgesOf(graph: { links?: unknown[]; edges?: unknown[] }): unknown[] {
	const edges = graph.links ?? graph.edges ?? [];
	return Array.isArray(edges) ? edges : [];
}

/** Current Studio implementation of the shared audit graph port. */
export function createStudioGraphifyAuditProvider(): GraphifyAuditProvider {
	return cacheGraphifyAuditProvider({
		ensureCurrent: (model: GraphifyAuditModel) =>
			ensureCurrentGraphifyCachesForModel(model),
		readiness: (model, buildingPurls) =>
			assessSubsystemGraphifyReadiness(model, buildingPurls),
		resolveRepoRoot: resolveRepoRootForPurl,
		loadGraph: async (purl, options) => {
			const entry = await getCachedGraphifyGraph(purl, {
				repoRoot: options?.repoRoot,
			});
			if (!entry) return null;
			const graph = loadGraphifyGraph(entry.path);
			return {
				nodes: (graph.nodes ?? []) as GraphifyNode[],
				edges: edgesOf(graph) as GraphifyEdge[],
			};
		},
	});
}
