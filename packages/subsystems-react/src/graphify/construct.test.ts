import { describe, expect, test } from 'bun:test';
import type { GraphifyEdge, GraphifyNode } from './types';
import { inferConstructFromGraphify, constructsMatch } from './construct';

function node(
	id: string,
	label: string,
	sourceFile = 'src/Foo.ts',
	extra?: Partial<GraphifyNode>,
): GraphifyNode {
	return {
		id,
		label,
		file_type: 'code',
		source_file: sourceFile,
		source_location: 'L1',
		...extra,
	};
}

function edge(
	source: string,
	target: string,
	relation: string,
): GraphifyEdge {
	return {
		source,
		target,
		relation,
		confidence: 'EXTRACTED',
		source_file: 'src/Foo.ts',
	};
}

describe('inferConstructFromGraphify', () => {
	test('outgoing method edges → class', () => {
		const n = node('cls', 'SessionReader');
		const edges = [edge('cls', 'cls_get', 'method')];
		const r = inferConstructFromGraphify(n, edges);
		expect(r.construct).toBe('class');
		expect(r.evidence[0]).toContain('outgoing method');
	});

	test('call-style label + no methods → function', () => {
		const n = node('fn', 'SubsystemModelView()');
		const r = inferConstructFromGraphify(n, []);
		expect(r.construct).toBe('function');
	});

	test('method-style label + incoming method → method', () => {
		const n = node('m', '.validate()');
		const edges = [edge('cls', 'm', 'method')];
		const r = inferConstructFromGraphify(n, edges);
		expect(r.construct).toBe('method');
	});

	test('method takes priority over call-style function', () => {
		const n = node('m', '.generate()');
		const edges = [edge('CodeGenerator', 'm', 'method')];
		expect(inferConstructFromGraphify(n, edges).construct).toBe('method');
	});

	test('incoming implements → type', () => {
		const n = node('iface', 'StoryboardRegistryInterface');
		const edges = [edge('MockRegistry', 'iface', 'implements')];
		expect(inferConstructFromGraphify(n, edges).construct).toBe('type');
	});

	test('filename label → module', () => {
		const n = node(
			'mod',
			'SubsystemModelView.tsx',
			'packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx',
		);
		expect(inferConstructFromGraphify(n, []).construct).toBe('module');
	});

	test('bare symbol with no edges → unknown', () => {
		const n = node('x', 'INSPECTOR_KEYS');
		expect(inferConstructFromGraphify(n, []).construct).toBe('unknown');
	});

	test('class wins over implements on same node', () => {
		const n = node('cls', 'TypeScriptGenerator');
		const edges = [
			edge('cls', 'cls_gen', 'method'),
			edge('Other', 'cls', 'implements'),
		];
		expect(inferConstructFromGraphify(n, edges).construct).toBe('class');
	});
});

describe('constructsMatch', () => {
	test('exact string equality', () => {
		expect(constructsMatch('function', 'function')).toBe(true);
		expect(constructsMatch('class', 'function')).toBe(false);
	});

	test('external / missing claimed skips', () => {
		expect(constructsMatch('external', 'function')).toBe(true);
		expect(constructsMatch(undefined, 'unknown')).toBe(true);
	});

	test('no class≈function alias', () => {
		expect(constructsMatch('class', 'function')).toBe(false);
		expect(constructsMatch('function', 'class')).toBe(false);
	});
});
