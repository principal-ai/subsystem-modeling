import { describe, expect, test } from 'bun:test';
import type { SubsystemTrail } from './model';
import {
  decorationModelIds,
  decorationTrailId,
  decorationTrailKey,
  findDecorationTrail,
  groupDecorationTrailsByModel,
  type DecorationTrailRef,
} from './decoration';

function ref(modelId: string, trailId: string): DecorationTrailRef {
  return { kind: 'base', modelId, trailId };
}

const draftTrail: SubsystemTrail = {
  id: 'planned-open',
  title: 'Planned open',
  steps: [],
};

describe('decoration trail refs', () => {
  test('keys are scoped by model', () => {
    expect(decorationTrailKey(ref('model-a', 'open'))).toBe('model-a:open');
    expect(decorationTrailKey(ref('model-a', 'open'))).not.toBe(
      decorationTrailKey(ref('model-b', 'open')),
    );
  });

  test('a draft trail keys like a base trail', () => {
    const draft: DecorationTrailRef = {
      kind: 'draft',
      modelId: 'model-a',
      trail: draftTrail,
    };
    expect(decorationTrailKey(draft)).toBe('model-a:planned-open');
    expect(decorationTrailId(draft)).toBe('planned-open');
  });

  test('groups trails by their own model, preserving authored order', () => {
    const groups = groupDecorationTrailsByModel([
      ref('web', 'open'),
      ref('server', 'handle'),
      ref('web', 'save'),
      ref('worker', 'consume'),
    ]);
    expect(groups.map((g) => g.modelId)).toEqual(['web', 'server', 'worker']);
    expect(groups[0]!.trails.map((t) => decorationTrailId(t))).toEqual([
      'open',
      'save',
    ]);
    expect(groups[1]!.trails.map((t) => decorationTrailId(t))).toEqual([
      'handle',
    ]);
  });

  test('lists distinct models in first-seen order', () => {
    expect(
      decorationModelIds([
        ref('web', 'open'),
        ref('server', 'handle'),
        ref('web', 'save'),
      ]),
    ).toEqual(['web', 'server']);
  });

  test('finds a trail by model and trail id, not trail id alone', () => {
    const refs = [ref('web', 'open'), ref('server', 'open')];
    expect(findDecorationTrail(refs, 'server', 'open')?.modelId).toBe('server');
    expect(findDecorationTrail(refs, 'worker', 'open')).toBeUndefined();
  });
});
