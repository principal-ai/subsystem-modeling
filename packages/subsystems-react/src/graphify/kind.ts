/**
 * Infer a subsystem-style kind from a graphify node + edges.
 *
 * Graphify does not store `kind` on nodes (everything is `file_type: "code"`).
 * Class vs function vs type is derived from structure — same rules as
 * `GraphifyComponentDetail` in consolidated.ts.
 */

import type { GraphifyEdge, GraphifyNode } from './types';

/** Kind inferred from graph structure (never read off the node). */
export type InferredGraphifyKind =
	| 'class'
	| 'function'
	| 'method'
	| 'type'
	| 'module'
	| 'unknown';

export interface InferGraphifyKindResult {
	kind: InferredGraphifyKind;
	evidence: string[];
}

const FILE_LABEL_RE =
	/\.(py|js|jsx|ts|tsx|mjs|cjs|java|go|rs|rb|php|cs|cpp|cc|c|h|hpp|pas|pp|dpr|swift|kt|scala|dart|lua|pl|pm|ex|exs|zig|vue|svelte)$/i;

function isMethodStyleLabel(label: string): boolean {
	return label.trim().startsWith('.');
}

function isCallStyleLabel(label: string): boolean {
	return label.trim().endsWith('()');
}

function isFilenameLabel(label: string, sourceFile: string): boolean {
	const trimmed = label.trim();
	if (FILE_LABEL_RE.test(trimmed)) return true;
	if (!sourceFile) return false;
	const base = sourceFile.replace(/\\/g, '/').split('/').pop() ?? '';
	return !!base && trimmed === base;
}

/**
 * Infer kind for a definition node from its label and incident edges.
 *
 * Priority: class → method → function → type → module → unknown.
 */
export function inferGraphifyKind(
	node: GraphifyNode,
	edges: readonly GraphifyEdge[],
): InferGraphifyKindResult {
	const id = String(node.id);
	const label = String(node.label ?? '').trim();
	const sourceFile =
		typeof node.source_file === 'string' ? node.source_file : '';
	const evidence: string[] = [];

	const outgoingMethod = edges.filter(
		(e) => String(e.source) === id && e.relation === 'method',
	);
	if (outgoingMethod.length > 0) {
		evidence.push(`${outgoingMethod.length} outgoing method edge(s)`);
		return { kind: 'class', evidence };
	}

	const incomingMethod = edges.filter(
		(e) => String(e.target) === id && e.relation === 'method',
	);
	if (incomingMethod.length > 0 && isMethodStyleLabel(label)) {
		evidence.push(
			`incoming method edge from ${String(incomingMethod[0]!.source)}`,
			`label ${label}`,
		);
		return { kind: 'method', evidence };
	}

	if (isCallStyleLabel(label)) {
		evidence.push(`call-style label ${label}`);
		return { kind: 'function', evidence };
	}

	const incomingImplements = edges.filter(
		(e) => String(e.target) === id && e.relation === 'implements',
	);
	if (incomingImplements.length > 0) {
		evidence.push(
			`${incomingImplements.length} incoming implements edge(s)`,
		);
		return { kind: 'type', evidence };
	}

	if (node.type === 'module' || isFilenameLabel(label, sourceFile)) {
		evidence.push(
			node.type === 'module'
				? 'node.type=module'
				: `filename label ${label}`,
		);
		return { kind: 'module', evidence };
	}

	if (label) evidence.push(`unclassified label ${label}`);
	else evidence.push('no classifying signals');
	return { kind: 'unknown', evidence };
}

/** Type-family constructs all infer as the coarse 'type' — graph structure
 *  (implements/references edges) cannot sub-classify interface vs alias vs
 *  enum vs variable; only the source declaration can. */
const TYPE_FAMILY: ReadonlySet<string> = new Set(['interface', 'type_alias', 'enum']);

/** Strict claimed-vs-inferred check, with type-family compatibility. */
export function kindsMatch(
	claimed: string | undefined,
	inferred: InferredGraphifyKind,
): boolean {
	if (!claimed || claimed === 'external') return true;
	if (TYPE_FAMILY.has(claimed)) return inferred === 'type';
	return claimed === inferred;
}
