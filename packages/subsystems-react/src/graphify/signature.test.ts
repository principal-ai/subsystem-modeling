import { describe, expect, test } from 'bun:test';
import type { GraphifyEdge, GraphifyNode } from './types';
import {
	compareSignatures,
	extractGraphifySignature,
	extractNamedTypes,
} from './signature';

function node(id: string, label: string): GraphifyNode {
	return { id, label, file_type: 'code', source_file: 'a.ts' };
}

function ref(
	source: string,
	target: string,
	context: 'parameter_type' | 'return_type' | 'inline_parameter',
): GraphifyEdge {
	return {
		source,
		target,
		relation: 'references',
		context,
		confidence: 'EXTRACTED',
		source_file: 'a.ts',
	};
}

describe('extractNamedTypes', () => {
	test('strips primitives and wrappers', () => {
		expect(extractNamedTypes('Promise<BuiltSessionEvents>')).toEqual([
			'BuiltSessionEvents',
		]);
		expect(extractNamedTypes('string')).toEqual([]);
		expect(extractNamedTypes('{ tabId: string }')).toEqual([]);
	});

	test('splits unions and keeps named types', () => {
		expect(extractNamedTypes('Foo | Bar | null')).toEqual(['Bar', 'Foo']);
	});

	test('drops inline objects but keeps sibling names', () => {
		expect(
			extractNamedTypes('Opts & { includeRaw?: boolean }'),
		).toEqual(['Opts']);
	});
});

describe('extractGraphifySignature', () => {
	test('collects parameter_type and return_type edges', () => {
		const nodes = new Map([
			['fn', node('fn', 'build()')],
			['A', node('A', 'DataProcessor')],
			['R', node('R', 'Result')],
		]);
		const edges = [
			ref('fn', 'A', 'parameter_type'),
			ref('fn', 'R', 'return_type'),
		];
		const sig = extractGraphifySignature('fn', edges, nodes);
		expect(sig.hasSignal).toBe(true);
		expect(sig.parameters.map((p) => p.type)).toEqual(['DataProcessor']);
		expect(sig.returnType).toBe('Result');
	});

	test('counts inline_parameter self-edges', () => {
		const nodes = new Map([['fn', node('fn', 'build()')]]);
		const sig = extractGraphifySignature(
			'fn',
			[
				ref('fn', 'fn', 'inline_parameter'),
				ref('fn', 'fn', 'inline_parameter'),
			],
			nodes,
		);
		expect(sig.inlineParameters).toBe(2);
		expect(sig.hasSignal).toBe(false);
	});
});

describe('compareSignatures', () => {
	test('skips when graphify has no signature edges', () => {
		const r = compareSignatures(
			{ parameters: [{ type: 'SessionReader' }], returnType: 'void' },
			{ parameters: [], hasSignal: false },
		);
		expect(r.skipped).toBe(true);
		expect(r.match).toBe(true);
	});

	test('classifies skip: no claimable named types', () => {
		const r = compareSignatures(
			{ parameters: [{ type: '{ tabId: string }' }] },
			{ parameters: [], hasSignal: false },
		);
		expect(r.skipped).toBe(true);
		expect(r.skipCode).toBe('no_claimed_types');
	});

	test('classifies skip: claimed types only as generic_arg', () => {
		const r = compareSignatures(
			{ returnType: 'Promise<BuiltSessionEvents>' },
			{
				parameters: [],
				hasSignal: false,
				genericArgs: [{ type: 'BuiltSessionEvents', nodeId: 'n' }],
			},
		);
		expect(r.skipped).toBe(true);
		expect(r.skipCode).toBe('generic_arg_only');
	});

	test('classifies skip: partial generic_arg coverage', () => {
		const r = compareSignatures(
			{ parameters: [{ type: 'Foo' }], returnType: 'Bar' },
			{
				parameters: [],
				hasSignal: false,
				genericArgs: [{ type: 'Foo', nodeId: 'n' }],
			},
		);
		expect(r.skipped).toBe(true);
		expect(r.skipCode).toBe('partially_generic_arg');
	});

	test('classifies skip: claimed names have no edges at all', () => {
		const r = compareSignatures(
			{ returnType: 'Element' },
			{ parameters: [], hasSignal: false },
		);
		expect(r.skipped).toBe(true);
		expect(r.skipCode).toBe('unresolved_claimed_types');
	});

	test('matches named type bags', () => {
		const inferred = {
			hasSignal: true,
			parameters: [
				{ type: 'DataProcessor', nodeId: 'a' },
				{ type: 'LintOptions', nodeId: 'b' },
			],
			returnType: 'Result',
			returnTypeNodeId: 'r',
		};
		const r = compareSignatures(
			{
				parameters: [
					{ type: 'DataProcessor' },
					{ type: 'Promise<LintOptions>' },
				],
				returnType: 'Promise<Result>',
			},
			inferred,
		);
		expect(r.match).toBe(true);
		expect(r.skipped).toBe(false);
	});

	test('hard-fails on parameter bag mismatch', () => {
		const r = compareSignatures(
			{ parameters: [{ type: 'Foo' }], returnType: 'Result' },
			{
				hasSignal: true,
				parameters: [{ type: 'Bar', nodeId: 'b' }],
				returnType: 'Result',
			},
		);
		expect(r.match).toBe(false);
		expect(r.reason).toBe('parameter_types_mismatch');
	});

	test('empty claimed vs graphify types fails', () => {
		const r = compareSignatures(
			{ parameters: [] },
			{
				hasSignal: true,
				parameters: [{ type: 'DataProcessor', nodeId: 'a' }],
				returnType: 'Result',
			},
		);
		expect(r.match).toBe(false);
	});

	test('anon param claim + marker parity: params verified, unresolved return skips', () => {
		// buildAgentSessionsView shape: 1 anonymous `opts` (marker present),
		// named return type only in the claim (npm type, no graph edge).
		const r = compareSignatures(
			{
				parameters: [
					{
						type: '{ sessionId: string; events: SessionEventRow[] | null }',
					},
				],
				returnType: 'AgentSessionsView',
			},
			{
				parameters: [],
				hasSignal: false,
				inlineParameters: 1,
				genericArgs: [],
			},
		);
		expect(r.skipped).toBe(true);
		expect(r.match).toBe(true);
		expect(r.skipCode).toBe('unresolved_claimed_types');
		expect(r.reason).toMatch(/params verified/);
	});

	test('anon params verified + wrapper-indirected return skips as generic_arg', () => {
		// processSessionEvents shape: 1 anonymous opts + Promise-wrapped return.
		const r = compareSignatures(
			{
				parameters: [
					{
						type: '{ sessionId: string; events: SessionEventRow[] | null }',
					},
				],
				returnType: 'Promise<BuiltSessionEvents>',
			},
			{
				parameters: [],
				hasSignal: false,
				inlineParameters: 1,
				genericArgs: [{ type: 'BuiltSessionEvents', nodeId: 'n' }],
			},
		);
		expect(r.skipped).toBe(true);
		expect(r.match).toBe(true);
		expect(r.skipCode).toBe('generic_arg_only');
		expect(r.reason).toMatch(/params verified/);
	});

	test('params verified but mixed generic+unresolved return stays a hard mismatch', () => {
		const r = compareSignatures(
			{
				parameters: [{ type: '{ a: string }' }],
				returnType: 'Promise<Foo> | Bar',
			},
			{
				parameters: [],
				hasSignal: false,
				inlineParameters: 1,
				genericArgs: [{ type: 'Foo', nodeId: 'n' }],
			},
		);
		expect(r.skipped).toBe(false);
		expect(r.match).toBe(false);
		expect(r.reason).toBe('return_type_mismatch');
	});

	test('anon param claim with marker and no return claim: matches', () => {
		// analyzeSessionInBackground shape: inline opts only, no return type.
		const r = compareSignatures(
			{ parameters: [{ type: '{ sessionId: string; title: string }' }] },
			{ parameters: [], hasSignal: false, inlineParameters: 1 },
		);
		expect(r.skipped).toBe(false);
		expect(r.match).toBe(true);
	});

	test('graph marker without matching claim is a params mismatch', () => {
		const r = compareSignatures(
			{ parameters: [] },
			{ parameters: [], hasSignal: false, inlineParameters: 1 },
		);
		expect(r.skipped).toBe(false);
		expect(r.match).toBe(false);
		expect(r.reason).toBe('parameter_types_mismatch');
	});

	test('anon claim with no marker stays skipped (default graph, no signal)', () => {
		const r = compareSignatures(
			{ parameters: [{ type: '{ tabId: string }' }] },
			{ parameters: [], hasSignal: false },
		);
		expect(r.skipped).toBe(true);
		expect(r.skipCode).toBe('no_claimed_types');
	});
});
