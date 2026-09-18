/**
 * Structural + cross-field validation for the CLI (schema gate mirror).
 */

import { describe, expect, test } from 'bun:test';
import { findSubsystemModelProblems } from '../lib/subsystem-model-validation.js';

describe('findSubsystemModelProblems', () => {
  test('requires title, components, relations (schema)', () => {
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
            id: 'api',
            name: 'checkoutApi',
            construct: 'function',
            file: 'src/api.ts',
            purl: 'pkg:github/you/app',
          },
        ],
        relations: [],
      }),
    ).toEqual([]);
  });

  test('rejects an unknown construct (schema)', () => {
    const problems = findSubsystemModelProblems({
      title: 'x',
      components: [
        { id: 'a', name: 'A', construct: 'module', file: 'src/a.ts', purl: 'pkg:github/a/b' },
      ],
      relations: [],
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
            id: 'tech',
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
        relations: [],
      }),
    ).toEqual([]);
  });

  test('create gate rejects a module without a file (cross-field)', () => {
    const problems = findSubsystemModelProblems({
      title: 'x',
      components: [
        { id: 'a', name: 'a', construct: 'function', module: 'src/host', file: '', purl: 'pkg:github/a/b' },
      ],
      relations: [],
    });
    expect(problems.some((p) => p.includes('file is empty'))).toBe(true);
  });

  test('rejects a relation endpoint with no component (cross-field)', () => {
    const problems = findSubsystemModelProblems({
      title: 'x',
      components: [
        { id: 'a', name: 'a', construct: 'function', file: 'src/a.ts', purl: 'pkg:github/a/b' },
      ],
      relations: [{ id: 'r1', from: 'a', to: 'ghost', relationType: 'imports' }],
    });
    expect(problems.some((p) => p.includes('/relations/0/to'))).toBe(true);
  });
});
