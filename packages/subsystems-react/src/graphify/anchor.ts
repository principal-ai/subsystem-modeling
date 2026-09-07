/**
 * Resolve a subsystem component (file + symbol) to a graphify definition node.
 *
 * This is component *anchoring*, not type-ref stub rewiring (`resolve.ts`).
 * Conservative: never bind via corpus-wide same-name alone.
 */

import type { GraphifyNode } from './types';
import type { GraphifyAnchorResolution } from './consolidated';
import { normalizeGraphifyLabel } from './resolve';
import {
	graphifyFileStem,
	makeGraphifyId,
	normalizeSourcePath,
} from './ids';

export interface ComponentAnchorInput {
	file?: string;
	symbol?: string;
	kind?: string;
	purl?: string;
}

export interface ComponentAnchorResult {
	resolution: GraphifyAnchorResolution;
	node: GraphifyNode | null;
	candidates: GraphifyNode[];
	/** make_id strings attempted on the fast path. */
	triedIds: string[];
}

const FILE_SUFFIX_RE =
	/\.(py|js|jsx|ts|tsx|mjs|cjs|java|go|rs|rb|php|cs|cpp|cc|c|h|hpp|pas|pp|dpr|swift|kt|scala|dart|lua|pl|pm|ex|exs|zig|vue|svelte)$/i;

function isDefinition(node: GraphifyNode): boolean {
	if (node.file_type !== 'code') return false;
	const file = typeof node.source_file === 'string' ? node.source_file : '';
	if (!file) return false;
	const label = typeof node.label === 'string' ? node.label.trim() : '';
	return !!label && !FILE_SUFFIX_RE.test(label);
}

/** Label forms that might match a subsystem symbol on a graphify node. */
export function symbolLabelVariants(symbol: string): string[] {
	const raw = symbol.trim();
	if (!raw) return [];
	const last = raw.includes('.') ? (raw.split('.').pop() ?? raw) : raw;
	const variants = new Set<string>([
		raw,
		last,
		`${raw}()`,
		`${last}()`,
		`.${last}()`,
		`.${last}`,
	]);
	return [...variants];
}

function labelMatchesSymbol(label: string, symbol: string): boolean {
	const variants = symbolLabelVariants(symbol);
	const trimmed = label.trim();
	if (variants.includes(trimmed)) return true;
	const foldedLabel = normalizeGraphifyLabel(trimmed);
	return variants.some((v) => normalizeGraphifyLabel(v) === foldedLabel);
}

function candidateIdsFor(file: string, symbol: string): string[] {
	const stem = graphifyFileStem(file);
	if (!stem) return [];
	const parts = symbol.split('.').map((p) => p.trim()).filter(Boolean);
	const ids = new Set<string>();
	ids.add(makeGraphifyId(stem, symbol));
	if (parts.length > 0) ids.add(makeGraphifyId(stem, ...parts));
	if (parts.length === 2) {
		// Class method: make_id(class_id, method) ≈ make_id(stem, Class, method)
		ids.add(makeGraphifyId(stem, parts[0]!, parts[1]!));
	}
	return [...ids];
}

/**
 * Anchor a subsystem component onto a graphify definition node.
 */
export function resolveComponentAnchor(
	nodes: readonly GraphifyNode[],
	input: ComponentAnchorInput,
): ComponentAnchorResult {
	const file = input.file?.trim() ? normalizeSourcePath(input.file) : '';
	const symbol = input.symbol?.trim() ?? '';
	if (!file || !symbol) {
		return { resolution: 'missing', node: null, candidates: [], triedIds: [] };
	}

	const byId = new Map<string, GraphifyNode>();
	const inFile: GraphifyNode[] = [];
	for (const node of nodes) {
		byId.set(String(node.id), node);
		if (!isDefinition(node)) continue;
		const sf = normalizeSourcePath(String(node.source_file ?? ''));
		if (sf === file) inFile.push(node);
	}

	const triedIds = candidateIdsFor(file, symbol);
	const idHits: GraphifyNode[] = [];
	for (const id of triedIds) {
		const hit = byId.get(id);
		if (!hit || !isDefinition(hit)) continue;
		const sf = normalizeSourcePath(String(hit.source_file ?? ''));
		if (sf === file) idHits.push(hit);
	}
	const uniqueIdHits = [...new Map(idHits.map((n) => [String(n.id), n])).values()];
	if (uniqueIdHits.length === 1) {
		return {
			resolution: 'exact',
			node: uniqueIdHits[0]!,
			candidates: [],
			triedIds,
		};
	}
	if (uniqueIdHits.length > 1) {
		return {
			resolution: 'ambiguous',
			node: null,
			candidates: uniqueIdHits,
			triedIds,
		};
	}

	if (inFile.length === 0) {
		return { resolution: 'missing', node: null, candidates: [], triedIds };
	}

	const labelHits = inFile.filter((n) =>
		labelMatchesSymbol(String(n.label ?? ''), symbol),
	);
	if (labelHits.length === 1) {
		return {
			resolution: 'exact',
			node: labelHits[0]!,
			candidates: [],
			triedIds,
		};
	}
	if (labelHits.length > 1) {
		return {
			resolution: 'ambiguous',
			node: null,
			candidates: labelHits,
			triedIds,
		};
	}

	// File has code nodes but none matched the symbol.
	return {
		resolution: 'file-only',
		node: null,
		candidates: inFile.slice(0, 8),
		triedIds,
	};
}
