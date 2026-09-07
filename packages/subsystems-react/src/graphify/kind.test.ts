import { describe, expect, test } from 'bun:test';
import type { GraphifyEdge, GraphifyNode } from './types';
import { inferGraphifyKind, kindsMatch } from './kind';

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

describe('inferGraphifyKind', () => {
	test('outgoing method edges → class', () => {
		const n = node('cls', 'SessionReader');
		const edges = [edge('cls', 'cls_get', 'method')];
		const r = inferGraphifyKind(n, edges);
		expect(r.kind).toBe('class');
		expect(r.evidence[0]).toContain('outgoing method');
	});

	test('call-style label + no methods → function', () => {
		const n = node('fn', 'SubsystemModelView()');
		const r = inferGraphifyKind(n, []);
		expect(r.kind).toBe('function');
	});

	test('method-style label + incoming method → method', () => {
		const n = node('m', '.validate()');
		const edges = [edge('cls', 'm', 'method')];
		const r = inferGraphifyKind(n, edges);
		expect(r.kind).toBe('method');
	});

	test('method takes priority over call-style function', () => {
		const n = node('m', '.generate()');
		const edges = [edge('CodeGenerator', 'm', 'method')];
		expect(inferGraphifyKind(n, edges).kind).toBe('method');
	});

	test('incoming implements → type', () => {
		const n = node('iface', 'StoryboardRegistryInterface');
		const edges = [edge('MockRegistry', 'iface', 'implements')];
		expect(inferGraphifyKind(n, edges).kind).toBe('type');
	});

	test('filename label → module', () => {
		const n = node(
			'mod',
			'SubsystemModelView.tsx',
			'packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx',
		);
		expect(inferGraphifyKind(n, []).kind).toBe('module');
	});

	test('bare symbol with no edges → unknown', () => {
		const n = node('x', 'INSPECTOR_KEYS');
		expect(inferGraphifyKind(n, []).kind).toBe('unknown');
	});

	test('class wins over implements on same node', () => {
		const n = node('cls', 'TypeScriptGenerator');
		const edges = [
			edge('cls', 'cls_gen', 'method'),
			edge('Other', 'cls', 'implements'),
		];
		expect(inferGraphifyKind(n, edges).kind).toBe('class');
	});
});

describe('kindsMatch', () => {
	test('exact string equality', () => {
		expect(kindsMatch('function', 'function')).toBe(true);
		expect(kindsMatch('class', 'function')).toBe(false);
	});

	test('external / missing claimed skips', () => {
		expect(kindsMatch('external', 'function')).toBe(true);
		expect(kindsMatch(undefined, 'unknown')).toBe(true);
	});

	test('no class≈function alias', () => {
		expect(kindsMatch('class', 'function')).toBe(false);
		expect(kindsMatch('function', 'class')).toBe(false);
	});
});
