/**
 * Minimal tests for CLI subsystem-model structural validation.
 */

import { describe, expect, test } from 'bun:test';
import {
  findCreateProblems,
  findComponentConstructProblems,
  findEdgeMechanismProblems,
} from '../lib/subsystem-model-store.js';

describe('findCreateProblems', () => {
  test('requires title, components, edges', () => {
    expect(findCreateProblems({})).toEqual([
      'title is required',
      'components array is required',
      'edges array is required',
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
        edges: [],
      }),
    ).toEqual([]);
  });

  test('rejects unknown construct and mechanism', () => {
    expect(findComponentConstructProblems([{ id: 'a', construct: 'module' }])).toHaveLength(1);
    expect(
      findEdgeMechanismProblems([{ id: 'e1', from: 'a', to: 'b', mechanism: 'teleports' }]),
    ).toHaveLength(1);
  });
});
