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
          steps: [{ from: 'a', to: 'b', mechanism: 'calls', file: 'src/a.ts', line: 1, purl: 'pkg:github/acme/app#src/a.ts', symbol: 'a' }],
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
            steps: [{ from: 'ghost', to: 'a', mechanism: 'calls', file: 'src/a.ts', line: 1, purl: 'pkg:github/acme/app#src/a.ts', symbol: 'ghost' }],
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
            steps: [{ from: 'a', to: 'a', mechanism: 'calls', file: 'src/a.ts', line: 1, purl: 'pkg:github/acme/app#src/other.ts', symbol: 'a' }],
          },
        ],
      }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]!.path).toBe('/trails/0/steps/0/purl');
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
                line: 1,
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
});
