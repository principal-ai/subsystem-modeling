import { describe, expect, test } from 'bun:test';
import type { GraphifyNode } from './types';
import {
	graphifyFileStem,
	makeGraphifyId,
	normalizeGraphifyId,
} from './ids';
import { resolveComponentAnchor, symbolLabelVariants, findUniqueDefinitionBySymbol } from './anchor';

function node(
	id: string,
	label: string,
	sourceFile: string,
	location?: string,
): GraphifyNode {
	return {
		id,
		label,
		file_type: 'code',
		source_file: sourceFile,
		source_location: location ?? '',
	};
}

describe('makeGraphifyId', () => {
	test('matches graphify path+symbol slug shape', () => {
		const stem = graphifyFileStem(
			'packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx',
		);
		expect(stem).toBe(
			'packages/subsystems-studio/src/mainview/views/SubsystemModelView',
		);
		expect(makeGraphifyId(stem, 'SubsystemModelView')).toBe(
			'packages_subsystems_studio_src_mainview_views_subsystemmodelview_subsystemmodelview',
		);
	});

	test('normalize is idempotent on ascii', () => {
		const id = makeGraphifyId('Foo/Bar', 'Baz');
		expect(normalizeGraphifyId(id)).toBe(id);
	});
});

describe('symbolLabelVariants', () => {
	test('includes call-style labels', () => {
		expect(symbolLabelVariants('SubsystemModelView')).toContain(
			'SubsystemModelView()',
		);
		expect(symbolLabelVariants('SessionReader.normalize')).toContain('normalize()');
		expect(symbolLabelVariants('SessionReader.normalize')).toContain('.normalize()');
	});
});

describe('resolveComponentAnchor', () => {
	const file =
		'packages/subsystems-studio/src/mainview/views/SubsystemModelView.tsx';
	const defId = makeGraphifyId(graphifyFileStem(file), 'SubsystemModelView');
	const corpus: GraphifyNode[] = [
		node(defId, 'SubsystemModelView()', file, 'L27'),
		node(
			makeGraphifyId(graphifyFileStem(file)),
			'SubsystemModelView.tsx',
			file,
			'L1',
		),
		node(
			makeGraphifyId(
				graphifyFileStem('other/SessionReader.ts'),
				'SessionReader',
			),
			'SessionReader',
			'other/SessionReader.ts',
			'L1',
		),
	];

	test('exact via make_id reconstruction', () => {
		const r = resolveComponentAnchor(corpus, {
			file,
			symbol: 'SubsystemModelView',
		});
		expect(r.resolution).toBe('exact');
		expect(r.node?.id).toBe(defId);
		expect(r.node?.source_location).toBe('L27');
	});

	test('exact via label when id reconstruction misses', () => {
		const weirdId = 'weird_id_not_from_make_id';
		const local = [
			node(weirdId, 'subsystemGraphToExcalidrawScene()', 'packages/x.ts', 'L10'),
		];
		const r = resolveComponentAnchor(local, {
			file: 'packages/x.ts',
			symbol: 'subsystemGraphToExcalidrawScene',
		});
		expect(r.resolution).toBe('exact');
		expect(r.node?.id).toBe(weirdId);
	});

	test('file-only when file has nodes but symbol misses', () => {
		const r = resolveComponentAnchor(corpus, {
			file,
			symbol: 'DoesNotExist',
		});
		expect(r.resolution).toBe('file-only');
		expect(r.candidates.length).toBeGreaterThan(0);
	});

	test('missing when file absent from graph', () => {
		const r = resolveComponentAnchor(corpus, {
			file: 'no/such/file.ts',
			symbol: 'Foo',
		});
		expect(r.resolution).toBe('missing');
	});

	test('does not bind via corpus-wide same name in another file', () => {
		const r = resolveComponentAnchor(corpus, {
			file: 'packages/elsewhere/SessionReader.ts',
			symbol: 'SessionReader',
		});
		expect(r.resolution).toBe('missing');
	});
});

describe('findUniqueDefinitionBySymbol', () => {
	test('unique when one defining file', () => {
		const nodes = [
			node('a', 'HostInfo', 'src/a.ts', 'L1'),
			node('b', 'Other', 'src/b.ts', 'L1'),
		];
		const r = findUniqueDefinitionBySymbol(nodes, 'HostInfo');
		expect(r.status).toBe('unique');
		if (r.status === 'unique') expect(r.node.source_file).toBe('src/a.ts');
	});

	test('ambiguous when same symbol in two files', () => {
		const nodes = [
			node('a', 'Foo()', 'src/a.ts', 'L1'),
			node('b', 'Foo()', 'src/b.ts', 'L1'),
		];
		const r = findUniqueDefinitionBySymbol(nodes, 'Foo');
		expect(r.status).toBe('ambiguous');
	});

	test('none when symbol absent', () => {
		const r = findUniqueDefinitionBySymbol(
			[node('a', 'Bar', 'src/a.ts')],
			'Foo',
		);
		expect(r.status).toBe('none');
	});
});
