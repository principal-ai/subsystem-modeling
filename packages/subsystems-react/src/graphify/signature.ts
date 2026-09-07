/**
 * Signature / params verification against graphify `references` edges.
 *
 * Graphify does not store arity or parameter names — only `parameter_type` /
 * `return_type` edges to type nodes (unions become multiple edges). Comparison
 * is therefore **named type bags**, not positional arity.
 *
 * Many TS/JS functions have no such edges yet. When graphify has no signature
 * signal, the check is skipped (not a hard fail) so Verify can still gate on
 * kind. When graphify *does* emit types, claimed detail must match.
 */

import type { GraphifyEdge, GraphifyNode } from './types';

/** Inferred signature from graphify edges (no param names). */
export interface GraphifyInferredSignature {
	parameters: Array<{ type: string; nodeId: string }>;
	returnType?: string;
	returnTypeNodeId?: string;
	/**
	 * Types reachable only via `generic_arg` edges (Promise<X>, Array<X>,
	 * Omit<X,…>, Map<…>). Kept out of `parameters`/`returnType` — not read
	 * by the bag comparison — so skipped cases can be told apart.
	 */
	genericArgs?: Array<{ type: string; nodeId: string }>;
	/**
	 * Count of `inline_parameter` self-edges (anonymous object-literal params).
	 * Graphify emits one per anon param only with its `--inline-params` flag.
	 */
	inlineParameters?: number;
	/** True when at least one parameter_type or return_type edge exists. */
	hasSignal: boolean;
}

export interface ClaimedSignature {
	parameters?: Array<{ name?: string; type: string }>;
	returnType?: string;
}

/**
 * Granular skip classification. `signature_skipped` means "graphify has no
 * parameter_type/return_type edges to compare", but *why* matters for future
 * work:
 * - `no_claimed_types`: authored detail has no named types (primitives/inline).
 * - `generic_arg_only`: claimed types resolve, but only as `generic_arg`
 *   (Promise/Omit/Map/Array wrappers) — this extractor does not read them.
 * - `partially_generic_arg`: some, not all, claimed types resolve as generic_arg.
 * - `unresolved_claimed_types`: claimed names have no edges at all
 *   (global/npm types, or a dropped same-file label collision).
 */
export type SignatureSkipCode =
	| 'no_claimed_types'
	| 'generic_arg_only'
	| 'partially_generic_arg'
	| 'unresolved_claimed_types';

export interface SignatureCompareResult {
	match: boolean;
	/** Skipped because graphify had no parameter/return type edges. */
	skipped: boolean;
	reason?: string;
	/** Granular skip classification when `skipped` is true. */
	skipCode?: SignatureSkipCode;
	claimed: { parameterTypes: string[]; returnTypes: string[] };
	inferred: { parameterTypes: string[]; returnTypes: string[] };
}

const PRIMITIVES = new Set([
	'string',
	'number',
	'boolean',
	'void',
	'null',
	'undefined',
	'any',
	'unknown',
	'never',
	'object',
	'symbol',
	'bigint',
	'true',
	'false',
	'this',
]);

/** Common generic wrappers — keep inner type names, drop the wrapper. */
const TYPE_WRAPPERS = new Set([
	'Promise',
	'Array',
	'ReadonlyArray',
	'Map',
	'Set',
	'WeakMap',
	'WeakSet',
	'Record',
	'Partial',
	'Required',
	'Readonly',
	'Awaited',
	'NonNullable',
	'ReturnType',
	'Parameters',
	'InstanceType',
	'Pick',
	'Omit',
	'Exclude',
	'Extract',
]);

/**
 * Pull comparable named type identifiers out of an authored / graphify type
 * string. Skips primitives, inline object types, and known wrappers.
 */
export function extractNamedTypes(typeStr: string): string[] {
	if (!typeStr || !typeStr.trim()) return [];
	let s = typeStr;
	// Drop string/template literals so their contents aren't tokens.
	s = s.replace(/`(?:\\.|[^`\\])*`/g, ' ');
	s = s.replace(/'(?:\\.|[^'\\])*'/g, ' ');
	s = s.replace(/"(?:\\.|[^"\\])*"/g, ' ');
	// Drop inline object / mapped types (non-greedy, repeated for nesting).
	for (let i = 0; i < 8; i++) {
		const next = s.replace(/\{[^{}]*\}/g, ' ');
		if (next === s) break;
		s = next;
	}
	const found = new Set<string>();
	const re = /[A-Za-z_][A-Za-z0-9_.]*/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(s)) !== null) {
		const raw = m[0]!;
		const base = raw.includes('.') ? (raw.split('.').pop() ?? raw) : raw;
		if (PRIMITIVES.has(base)) continue;
		if (TYPE_WRAPPERS.has(base)) continue;
		// Skip lone lowercase keywords that aren't types we care about.
		if (base === 'typeof' || base === 'keyof' || base === 'infer' || base === 'extends') {
			continue;
		}
		found.add(base);
	}
	return [...found].sort();
}

function labelOf(
	nodeId: string,
	nodesById: ReadonlyMap<string, GraphifyNode>,
): string {
	const n = nodesById.get(nodeId);
	const label = n && typeof n.label === 'string' ? n.label.trim() : '';
	return label || nodeId;
}

/** Collect parameter_type / return_type edges for a callable node. */
export function extractGraphifySignature(
	nodeId: string,
	edges: readonly GraphifyEdge[],
	nodesById: ReadonlyMap<string, GraphifyNode>,
): GraphifyInferredSignature {
	const id = String(nodeId);
	const parameters: GraphifyInferredSignature['parameters'] = [];
	const genericArgs: GraphifyInferredSignature['genericArgs'] = [];
	let returnType: string | undefined;
	let returnTypeNodeId: string | undefined;
	let inlineParameters = 0;

	for (const e of edges) {
		if (String(e.source) !== id || e.relation !== 'references') continue;
		const ctx = e.context;
		const target = String(e.target);
		if (ctx === 'parameter_type') {
			parameters.push({ type: labelOf(target, nodesById), nodeId: target });
		} else if (ctx === 'return_type' && returnType === undefined) {
			returnType = labelOf(target, nodesById);
			returnTypeNodeId = target;
		} else if (ctx === 'generic_arg') {
			genericArgs.push({ type: labelOf(target, nodesById), nodeId: target });
		} else if (ctx === 'inline_parameter') {
			inlineParameters += 1;
		}
	}

	return {
		parameters,
		genericArgs,
		returnType,
		returnTypeNodeId,
		inlineParameters,
		hasSignal: parameters.length > 0 || returnType !== undefined,
	};
}

function bagsEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function claimedBags(claimed: ClaimedSignature | undefined): {
	parameterTypes: string[];
	returnTypes: string[];
} {
	const parameterTypes = new Set<string>();
	for (const p of claimed?.parameters ?? []) {
		for (const t of extractNamedTypes(p.type)) parameterTypes.add(t);
	}
	const returnTypes = new Set<string>();
	if (claimed?.returnType) {
		for (const t of extractNamedTypes(claimed.returnType)) returnTypes.add(t);
	}
	return {
		parameterTypes: [...parameterTypes].sort(),
		returnTypes: [...returnTypes].sort(),
	};
}

function inferredBags(inferred: GraphifyInferredSignature): {
	parameterTypes: string[];
	returnTypes: string[];
} {
	const parameterTypes = new Set<string>();
	for (const p of inferred.parameters) {
		for (const t of extractNamedTypes(p.type)) parameterTypes.add(t);
	}
	const returnTypes = new Set<string>();
	if (inferred.returnType) {
		for (const t of extractNamedTypes(inferred.returnType)) returnTypes.add(t);
	}
	return {
		parameterTypes: [...parameterTypes].sort(),
		returnTypes: [...returnTypes].sort(),
	};
}

/**
 * Compare authored function/method detail signature to graphify edges.
 *
 * - No graphify signal → skipped (match=true).
 * - Otherwise named-type bags for params and return must match exactly.
 */
export function compareSignatures(
	claimed: ClaimedSignature | undefined,
	inferred: GraphifyInferredSignature,
): SignatureCompareResult {
	const claimedBagsResult = claimedBags(claimed);
	const inferredBagsResult = inferredBags(inferred);

	// Anonymous object-literal params ("inline") carry no named types, so they
	// only ever surface via graphify's `inline_parameter` markers. A claim of an
	// inline param against a graph with no marker proves nothing (the store
	// graph may predate the flag), so absence alone keeps the skip path. When
	// the graph DOES emit a marker, anon-count parity is compared like any
	// parameter signal.
	const claimedAnonCount = (claimed?.parameters ?? []).filter((p) =>
		(p.type ?? '').trim().startsWith('{'),
	).length;
	const inferredAnonCount = inferred.inlineParameters ?? 0;
	const hasAnonSignal = inferredAnonCount > 0;

	if (!inferred.hasSignal && !hasAnonSignal) {
		const claimedTypes = new Set<string>([
			...claimedBagsResult.parameterTypes,
			...claimedBagsResult.returnTypes,
		]);
		const genericArgTypes = new Set(
			(inferred.genericArgs ?? []).map((a) => a.type),
		);
		const sorted = [...claimedTypes].sort();
		let skipCode: SignatureSkipCode;
		let reason: string;
		if (sorted.length === 0) {
			skipCode = 'no_claimed_types';
			reason = 'no claimable named types in authored signature (primitives/inline only)';
		} else {
			const found = sorted.filter((t) => genericArgTypes.has(t));
			if (found.length === sorted.length) {
				skipCode = 'generic_arg_only';
				reason = `claimed types ([${sorted.join(', ')}]) present only as generic_arg (wrapper-indirected: Promise/Omit/Map/Array) — extractor does not read generic_arg`;
			} else if (found.length > 0) {
				skipCode = 'partially_generic_arg';
				reason = `claimed types resolve only via generic_arg for ${found.join(', ')}; rest unresolved (${sorted.filter((t) => !genericArgTypes.has(t)).join(', ')})`;
			} else {
				skipCode = 'unresolved_claimed_types';
				reason = `claimed types ([${sorted.join(', ')}]) have no parameter_type/return_type/generic_arg edges (global/npm types or dropped same-file label collision)`;
			}
		}
		return {
			match: true,
			skipped: true,
			reason,
			skipCode,
			claimed: claimedBagsResult,
			inferred: inferredBagsResult,
		};
	}

	const paramsOk = bagsEqual(
		claimedBagsResult.parameterTypes,
		inferredBagsResult.parameterTypes,
	);
	const anonParamsOk = claimedAnonCount === inferredAnonCount;
	const returnOk = bagsEqual(
		claimedBagsResult.returnTypes,
		inferredBagsResult.returnTypes,
	);
	const match = paramsOk && anonParamsOk && returnOk;
	if (paramsOk && anonParamsOk && !returnOk) {
		// Params verified, but the claimed return types can't be backed. When
		// every claimed return type is either wrapper-indirected (generic_arg:
		// Promise<X>, Omit<X,…>) or entirely unresolved (global/npm/DOM types),
		// that's a coverage gap, not a lie — mark the check skipped instead of
		// hard-failing, mirroring the pre-signal skip classification. A mixed
		// bag (some generic, some unresolved) stays a hard mismatch.
		const claimReturn = claimedBagsResult.returnTypes;
		if (claimReturn.length > 0) {
			const genericArgTypes = new Set(
				(inferred.genericArgs ?? []).map((a) => a.type),
			);
			const gen = claimReturn.filter((t) => genericArgTypes.has(t));
			const unresolved = claimReturn.filter((t) => !genericArgTypes.has(t));
			let skipCode: SignatureSkipCode | undefined;
			let reason: string | undefined;
			if (gen.length === claimReturn.length) {
				skipCode = 'generic_arg_only';
				reason = `claimed return types ([${claimReturn.join(', ')}]) present only as generic_arg (wrapper-indirected: Promise/Omit/Map/Array) — extractor does not read generic_arg; params verified`;
			} else if (unresolved.length === claimReturn.length) {
				skipCode = 'unresolved_claimed_types';
				reason = `claimed return types ([${claimReturn.join(', ')}]) have no parameter_type/return_type/generic_arg edges (global/npm types or dropped same-file label collision); params verified`;
			}
			if (skipCode) {
				return {
					match: true,
					skipped: true,
					reason,
					skipCode,
					claimed: claimedBagsResult,
					inferred: inferredBagsResult,
				};
			}
		}
	}
	return {
		match,
		skipped: false,
		reason: match
			? undefined
			: !paramsOk || !anonParamsOk
				? 'parameter_types_mismatch'
				: 'return_type_mismatch',
		claimed: claimedBagsResult,
		inferred: inferredBagsResult,
	};
}
