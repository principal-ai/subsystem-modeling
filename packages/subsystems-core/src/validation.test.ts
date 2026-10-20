import { describe, expect, test } from 'bun:test';
import { validateSubsystemModelCrossField } from './validation';
import type { SubsystemModelDocument } from './types/subsystem-model';

function comp(
  alias: string,
  extra: Partial<SubsystemModelDocument['components'][number]> = {},
) {
  return {
    alias,
    name: alias,
    construct: 'function' as const,
    file: `src/${alias}.ts`,
    purl: 'pkg:github/acme/app',
    ...extra,
  };
}

function doc(partial: Partial<SubsystemModelDocument>): SubsystemModelDocument {
  return {
    title: 't',
    components: [],
    ...partial,
  } as SubsystemModelDocument;
}

describe('validateSubsystemModelCrossField', () => {
  test('accepts a consistent document', () => {
    const d = doc({
      components: [comp('a'), comp('b')],
      trails: [
        {
          id: 'w1',
          title: 'flow',
          steps: [{ from: 'a', to: 'b', mechanism: 'calls', file: 'src/a.ts', purl: 'pkg:github/acme/app#src/a.ts', symbol: 'a' }],
        },
      ],
    });
    expect(validateSubsystemModelCrossField(d)).toEqual([]);
  });

  test('flags duplicate component aliases', () => {
    const problems = validateSubsystemModelCrossField(
      doc({ components: [comp('a'), comp('a')] }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]!.message).toContain('duplicate alias');
  });

  test('flags trail step endpoints that reference no component', () => {
    const problems = validateSubsystemModelCrossField(
      doc({
        components: [comp('a')],
        trails: [
          {
            id: 'w1',
            title: 'flow',
            steps: [{ from: 'ghost', to: 'a', mechanism: 'calls', file: 'src/a.ts', purl: 'pkg:github/acme/app#src/a.ts', symbol: 'ghost' }],
          },
        ],
      }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]!.path).toBe('/trails/0/steps/0/from');
  });

  test('flags trail step purl fragments that mismatch the step file', () => {
    const problems = validateSubsystemModelCrossField(
      doc({
        components: [comp('a')],
        trails: [
          {
            id: 'w1',
            title: 'flow',
            steps: [{ from: 'a', to: 'a', mechanism: 'calls', file: 'src/a.ts', purl: 'pkg:github/acme/app#src/other.ts', symbol: 'a' }],
          },
        ],
      }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]!.path).toBe('/trails/0/steps/0/purl');
  });

  test('flags a site construct that does not contain the seam span', () => {
    const problems = validateSubsystemModelCrossField(
      doc({
        components: [comp('a'), comp('b')],
        trails: [
          {
            id: 'w1',
            title: 'flow',
            steps: [
              {
                from: 'a',
                to: 'b',
                mechanism: 'calls',
                file: 'src/a.ts',
                purl: 'pkg:github/acme/app#src/a.ts',
                symbol: 'a',
                span: { startLine: 20, endLine: 20, contentHash: 'h' },
                site: {
                  symbol: 'a',
                  span: { startLine: 1, endLine: 10, contentHash: 'h' },
                },
              },
            ],
          },
        ],
      }),
    );
    expect(problems.some((p) => p.path === '/trails/0/steps/0/site/span')).toBe(true);
    expect(problems.find((p) => p.path === '/trails/0/steps/0/site/span')!.message).toContain(
      'does not contain the seam span',
    );
  });

  test('flags a target purl fragment that mismatches the target file', () => {
    const problems = validateSubsystemModelCrossField(
      doc({
        components: [comp('a'), comp('b')],
        trails: [
          {
            id: 'w1',
            title: 'flow',
            steps: [
              {
                from: 'a',
                to: 'b',
                mechanism: 'calls',
                file: 'src/a.ts',
                purl: 'pkg:github/acme/app#src/a.ts',
                symbol: 'a',
                target: {
                  purl: 'pkg:github/acme/app#src/b-other.ts',
                  file: 'src/b.ts',
                  symbol: 'b',
                },
              },
            ],
          },
        ],
      }),
    );
    expect(problems.some((p) => p.path === '/trails/0/steps/0/target/purl')).toBe(true);
  });

  test('module implies file, exempting external/proposed', () => {
    const bad = validateSubsystemModelCrossField(
      doc({ components: [comp('a', { module: 'src/host', file: '' })] }),
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]!.message).toContain('file is empty');

    expect(
      validateSubsystemModelCrossField(
        doc({
          components: [
            comp('ext', { module: 'pkg:npm/x', construct: 'external', file: '' }),
            comp('plan', { module: 'src/host', file: '', proposed: true }),
            comp('ok', { module: 'src/host', file: 'src/host/main.ts' }),
          ],
        }),
      ),
    ).toEqual([]);
  });

  test('flags a component file pointing into node_modules', () => {
    const problems = validateSubsystemModelCrossField(
      doc({
        components: [
          comp('dep', {
            construct: 'store',
            file: 'packages/react/node_modules/@pierre/diffs/dist/highlighter/shared_highlighter.js',
          }),
          comp('bare', { file: 'node_modules/left-pad/index.js' }),
          // An external may carry such a path too — the path is the defect
          // whichever construct claims it.
          comp('ext', {
            construct: 'external',
            file: 'packages/react/node_modules/@pierre/diffs/dist/components/CodeView.js',
          }),
        ],
      }),
    );
    expect(problems).toHaveLength(3);
    expect(problems[0]!.path).toBe('/components/0/file');
    expect(problems[0]!.message).toContain('node_modules');
    expect(problems[1]!.path).toBe('/components/1/file');
    expect(problems[2]!.path).toBe('/components/2/file');
  });

  test('accepts node_modules only as an external/proposed component identity', () => {
    expect(
      validateSubsystemModelCrossField(
        doc({
          components: [
            // A dependency modeled as a package: no file, npm purl.
            comp('dep', {
              construct: 'external',
              file: '',
              purl: 'pkg:npm/@pierre/diffs',
            }),
            // A planned in-repo component may sit where it will live.
            comp('plan', { file: 'packages/x/node_modules/y/z.ts', proposed: true }),
            // `node_modulesx` is an ordinary directory, not the install root.
            comp('ok', { file: 'packages/node_modulesx/z.ts' }),
          ],
        }),
      ),
    ).toEqual([]);
  });

  test('flags a trail step anchored in node_modules', () => {
    const problems = validateSubsystemModelCrossField(
      doc({
        components: [comp('a')],
        trails: [
          {
            id: 'w1',
            title: 'flow',
            steps: [
              {
                from: 'a',
                to: 'a',
                mechanism: 'calls',
                file: 'packages/react/node_modules/@pierre/diffs/dist/index.js',
                purl: 'pkg:npm/@pierre/diffs#packages/react/node_modules/@pierre/diffs/dist/index.js',
                symbol: 'a',
              },
            ],
          },
        ],
      }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]!.path).toBe('/trails/0/steps/0/file');
  });

  test('accepts an ordered span on a component and a step', () => {
    expect(
      validateSubsystemModelCrossField(
        doc({
          components: [
            comp('a', {
              declarationSpan: { startLine: 1, endLine: 9, contentHash: 'h' },
            }),
          ],
          trails: [
            {
              id: 'w1',
              title: 'flow',
              steps: [
                {
                  from: 'a',
                  to: 'a',
                  mechanism: 'calls',
                  file: 'src/a.ts',
                  purl: 'pkg:github/acme/app#src/a.ts',
                  symbol: 'a',
                  span: { startLine: 3, endLine: 3, contentHash: 'h' },
                },
              ],
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  test('flags a span whose endLine precedes startLine', () => {
    const problems = validateSubsystemModelCrossField(
      doc({
        components: [
          comp('a', {
            declarationSpan: { startLine: 10, endLine: 4, contentHash: 'h' },
          }),
        ],
        trails: [
          {
            id: 'w1',
            title: 'flow',
            steps: [
              {
                from: 'a',
                to: 'a',
                mechanism: 'calls',
                file: 'src/a.ts',
                purl: 'pkg:github/acme/app#src/a.ts',
                symbol: 'a',
                span: { startLine: 8, endLine: 2, contentHash: 'h' },
              },
            ],
          },
        ],
      }),
    );
    expect(problems).toHaveLength(2);
    expect(problems[0]!.path).toBe('/components/0/declarationSpan');
    expect(problems[0]!.message).toContain('precedes startLine');
    expect(problems[1]!.path).toBe('/trails/0/steps/0/span');
  });
});
