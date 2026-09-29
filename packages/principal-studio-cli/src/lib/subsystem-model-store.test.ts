/**
 * Structural + cross-field validation for the CLI (schema gate mirror).
 */

import { describe, expect, test } from 'bun:test';
import { findSubsystemModelProblems } from '../lib/subsystem-model-validation.js';

describe('findSubsystemModelProblems', () => {
  test('requires title and components (schema)', () => {
    const problems = findSubsystemModelProblems({});
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain('required');
  });

  test('accepts a minimal valid model', () => {
    expect(
      findSubsystemModelProblems({
        title: 'Checkout',
        components: [
          {
            alias: 'api',
            name: 'checkoutApi',
            construct: 'function',
            file: 'src/api.ts',
            purl: 'pkg:github/you/app',
          },
        ],
      }),
    ).toEqual([]);
  });

  test('rejects an unknown construct (schema)', () => {
    const problems = findSubsystemModelProblems({
      title: 'x',
      components: [
        { alias: 'a', name: 'A', construct: 'module', file: 'src/a.ts', purl: 'pkg:github/a/b' },
      ],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('allowed:');
  });

  test('accepts a custom_entity actor', () => {
    expect(
      findSubsystemModelProblems({
        title: 'x',
        components: [
          {
            alias: 'tech',
            name: 'FacilitiesTechnician',
            construct: 'custom_entity',
            entityKind: 'Person',
            file: '',
            purl: 'pkg:github/novatech/facilities-ops',
            declaration: {
              kind: 'custom_entity',
              attributes: [{ key: 'level', value: 'L1' }],
            },
          },
        ],
      }),
    ).toEqual([]);
  });

  test('create gate rejects a module without a file (cross-field)', () => {
    const problems = findSubsystemModelProblems({
      title: 'x',
      components: [
        { alias: 'a', name: 'a', construct: 'function', module: 'src/host', file: '', purl: 'pkg:github/a/b' },
      ],
    });
    expect(problems.some((p) => p.includes('file is empty'))).toBe(true);
  });
});
