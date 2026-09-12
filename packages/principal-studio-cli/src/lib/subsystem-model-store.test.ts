/**
 * Minimal tests for CLI subsystem-model structural validation.
 */

import { describe, expect, test } from 'bun:test';
import {
  findCreateProblems,
  findComponentConstructProblems,
  findRelationTypeProblems,
} from '../lib/subsystem-model-store.js';

describe('findCreateProblems', () => {
  test('requires title, components, relations', () => {
    expect(findCreateProblems({})).toEqual([
      'title is required',
      'components array is required',
      'relations array is required',
    ]);
  });

  test('accepts a minimal valid model', () => {
    expect(
      findCreateProblems({
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

  test('rejects unknown construct and mechanism', () => {
    expect(findComponentConstructProblems([{ id: 'a', construct: 'module' }])).toHaveLength(1);
    expect(
      findRelationTypeProblems([{ id: 'r1', from: 'a', to: 'b', relationType: 'teleports' }]),
    ).toHaveLength(1);
  });

  test('accepts a custom_entity actor', () => {
    expect(
      findComponentConstructProblems([
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
      ]),
    ).toEqual([]);
  });
});
