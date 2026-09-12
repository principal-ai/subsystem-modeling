/**
 * Validation harness: TS free-function parameter_type / return_type edges
 * (graphify feature branch) exercised through principal-studio's real code paths.
 *
 * Before (graphify 0.9.50): no free function had type edges → every function
 * signature check skipped. After (feat/ts-free-fn-param-return-edges): 209
 * free functions carry parameter_type/return_type/generic_arg edges.
 *
 * This script loads the PATCHEd cached graph and runs the exact Verify
 * machinery (resolveComponentAnchor → inferConstructFromGraphify → extractGraphifySignature
 * → compareSignatures) against authored `ClaimedSignature` values taken from the
 * real TS sources.
 */
import { getCachedGraphifyGraph } from '../src/bun/graphify-store';
import { loadGraphifyGraph } from '../src/bun/graphify-runner';
import { resolveComponentAnchor } from '../../subsystems-react/src/graphify/anchor';
import { extractGraphifySignature, compareSignatures } from '../../subsystems-react/src/graphify/signature';
import type { GraphifyNode } from '../../subsystems-react/src/graphify/types';

const PURL = 'pkg:github/principal-ai/principal-view-core-library';
const REPO_ROOT = '/Users/griever/Developer/visual-validation/principal-view-core-library';
const PATCHED_STORE =
	'/var/folders/k0/9ntrn3013w180q3x6k2l0xm00000gn/T/opencode/pvcl-store';

interface DemoCase {
	label: string;
	file: string;
	symbol: string;
	claimed?: { parameters?: Array<{ name?: string; type: string }>; returnType?: string };
}

const cases: DemoCase[] = [
	{
		label: 'subsystemModelToExcalidrawScene',
		file: 'packages/subsystems-studio/src/mainview/excalidraw/subsystemToExcalidraw.ts',
		symbol: 'subsystemModelToExcalidrawScene',
		claimed: {
			parameters: [
				{ name: 'components', type: 'SubsystemComponent[]' },
				{ name: 'edges', type: 'SubsystemComponentEdge[]' },
				{ name: 'name', type: 'string' },
			],
			returnType: 'Promise<ExcalidrawScene>',
		},
	},
	{
		label: 'excalidrawSceneToSubsystemModel',
		file: 'packages/subsystems-studio/src/mainview/excalidraw/excalidrawToSubsystem.ts',
		symbol: 'excalidrawSceneToSubsystemModel',
		claimed: { parameters: [{ name: 'scene', type: 'ExcalidrawLikeScene' }], returnType: 'RebuiltSubsystemModel' },
	},
	{
		label: 'analyzeBeats',
		file: 'packages/subsystems-studio/src/bun/beat-analysis.ts',
		symbol: 'analyzeBeats',
		claimed: {
			parameters: [{ name: 'events', type: 'SessionEventRow[]' }],
			returnType: 'BeatAnalysis',
		},
	},
	{
		label: 'buildAgentSessionsView',
		file: 'packages/subsystems-studio/src/mainview/views/AgentSessions.tsx',
		symbol: 'buildAgentSessionsView',
		claimed: {
			parameters: [
				{
					name: 'opts',
					type: '{ sessionId: string; title: string; events: SessionEventRow[] | null; sessionMeta: { slug: string; title: string; agent?: string } | null; dirSet: Set<string>; repoOwner: string | null; repoName: string | null; repoRoot?: string; models?: string[] }',
				},
			],
			returnType: 'AgentSessionsView | null',
		},
	},
];

interface StoreGraph {
	label: string;
	nodes: GraphifyNode[];
	links: Array<{ source: unknown; target: unknown; relation: string; context?: string }>;
}

async function loadStoreGraph(label: string, storeRoot: string): Promise<StoreGraph> {
	const hit = await getCachedGraphifyGraph(PURL, { storeRoot, repoRoot: REPO_ROOT });
	if (!hit) throw new Error(`no cached graph in ${label}`);
	const g = loadGraphifyGraph(hit.path);
	return { label, nodes: g.nodes as GraphifyNode[], links: g.links ?? [] };
}

const patched = await loadStoreGraph('patched (isolated)', PATCHED_STORE);
const appStore = await loadStoreGraph('app default store', undefined as unknown as string);

function run(label: string, sg: StoreGraph): void {
	const byId = new Map<string, GraphifyNode>(sg.nodes.map((n) => [String(n.id), n]));
	console.log(`\n== ${label} (free functions) ==`);
	for (const c of cases) {
		const anchor = resolveComponentAnchor(sg.nodes, {
			file: c.file,
			symbol: c.symbol,
			kind: 'function',
			purl: PURL,
		});
		if (!anchor.node) {
			console.log(`${c.label.padEnd(30)} anchor=${anchor.resolution} (${anchor.node ? '' : 'no node'})`);
			continue;
		}
		const inferred = extractGraphifySignature(String(anchor.node.id), sg.links, byId);
		const cmp = compareSignatures(c.claimed, inferred);
		console.log(
			[
				c.label.padEnd(30),
				`anchor=${anchor.resolution}`,
				`signal=${inferred.hasSignal}`,
				`skip=${cmp.skipped}`,
				`code=${cmp.skipCode ?? '-'}`,
				`match=${cmp.match}`,
				`reason=${cmp.reason ?? '-'}`,
				`claimed[${(cmp.claimed.parameterTypes.join(','))}] -> [${cmp.claimed.returnTypes.join(',')}]`,
				`inferred[${(cmp.inferred.parameterTypes.join(','))}] -> [${cmp.inferred.returnTypes.join(',')}]`,
				`inline=${inferred.inlineParameters ?? 0}`,
			].join('  '),
		);
	}
}

function diffSummary(): void {
	console.log('\n== type-edge coverage (app default store now serves patched graph) ==');
	const count = (sg: StoreGraph): number =>
		new Set(
			sg.links
				.filter(
					(e) =>
						e.relation === 'references' &&
						(e.context === 'parameter_type' ||
							e.context === 'return_type' ||
							e.context === 'generic_arg'),
				)
				.map((e) => String(e.source)),
		).size;
	console.log(`nodes with any type edge: before≈200 (0.9.50)  app-store=${count(appStore)}  isolated=${count(patched)}`);
}

diffSummary();
run('app default store (patched)', appStore);
run('patched (isolated)', patched);