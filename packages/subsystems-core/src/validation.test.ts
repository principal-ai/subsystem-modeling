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
    relations: [],
    ...partial,
  } as SubsystemModelDocument;
}

describe('validateSubsystemModelCrossField', () => {
  test('accepts a consistent document', () => {
    const d = doc({
      components: [comp('a'), comp('b')],
      relations: [{ id: 'r1', from: 'a', to: 'b', relationType: 'imports' }],
      walkthroughs: [
        {
          id: 'w1',
          title: 'flow',
          steps: [{ from: 'a', to: 'b', mechanism: 'calls', file: 'src/a.ts', line: 1 }],
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

  test('flags relation endpoints that reference no component', () => {
    const problems = validateSubsystemModelCrossField(
      doc({
        components: [comp('a')],
        relations: [{ id: 'r1', from: 'a', to: 'ghost', relationType: 'imports' }],
      }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]!.path).toBe('/relations/0/to');
  });

  test('flags walkthrough step endpoints that reference no component', () => {
    const problems = validateSubsystemModelCrossField(
      doc({
        components: [comp('a')],
        walkthroughs: [
          {
            id: 'w1',
            title: 'flow',
            steps: [{ from: 'ghost', to: 'a', mechanism: 'calls', file: 'src/a.ts', line: 1 }],
          },
        ],
      }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]!.path).toBe('/walkthroughs/0/steps/0/from');
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
});
