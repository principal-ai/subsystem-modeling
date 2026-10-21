import { describe, expect, test } from 'bun:test';
import type { SubsystemTrail } from './model';
import {
  buildStepEmphasisMap,
  emphasisForTrail,
  emphasisKey,
  findStepEmphasis,
  orphanedEmphasis,
  stepClaimKey,
  type StepEmphasisRecord,
} from './stepEmphasis';

function step(overrides: Partial<SubsystemTrail['steps'][number]> = {}): SubsystemTrail['steps'][number] {
  return {
    from: 'ui',
    to: 'api',
    mechanism: 'calls',
    file: 'src/ui/login.tsx',
    span: { startLine: 42, endLine: 42, contentHash: 'abc' },
    purl: 'pkg:github/acme/app#src/ui/login.tsx',
    symbol: 'Login.submit',
    ...overrides,
  };
}

function trail(id: string, steps: SubsystemTrail['steps']): SubsystemTrail {
  return { id, title: id, steps };
}

function record(trailId: string, stepKey: string): StepEmphasisRecord {
  return {
    trailId,
    stepKey,
    guidance: 'Why this step matters.',
    provenance: { source: 'author', at: '2026-10-19T00:00:00.000Z' },
  };
}

describe('stepClaimKey', () => {
  test('is stable for the same claim', () => {
    expect(stepClaimKey(step())).toBe(stepClaimKey(step()));
  });

  test('ignores annotation, which is not the claim', () => {
    expect(stepClaimKey(step({ annotation: 'why' }))).toBe(
      stepClaimKey(step()),
    );
  });

  test('changes when the claim changes', () => {
    const base = stepClaimKey(step());
    expect(base).not.toBe(stepClaimKey(step({ from: 'other' })));
    expect(base).not.toBe(stepClaimKey(step({ to: 'other' })));
    expect(base).not.toBe(stepClaimKey(step({ mechanism: 'feeds' })));
    expect(base).not.toBe(stepClaimKey(step({ file: 'src/other.ts' })));
    expect(base).not.toBe(stepClaimKey(step({ symbol: 'Other.submit' })));
    expect(base).not.toBe(
      stepClaimKey(step({ span: { startLine: 43, endLine: 43, contentHash: 'abc' } })),
    );
    expect(base).not.toBe(
      stepClaimKey(step({ span: { startLine: 42, endLine: 42, contentHash: 'changed' } })),
    );
  });
});

describe('step emphasis lookup', () => {
  test('resolves after steps are reordered', () => {
    const first = step({ symbol: 'first' });
    const second = step({ symbol: 'second' });
    const map = buildStepEmphasisMap([record('flow', stepClaimKey(first))]);
    const reordered = trail('flow', [second, first]);
    expect(findStepEmphasis(map, 'flow', reordered.steps[1]!)).toBeDefined();
    expect(findStepEmphasis(map, 'flow', reordered.steps[0]!)).toBeUndefined();
  });

  test('emphasisForTrail reports marks in current step order', () => {
    const a = step({ symbol: 'a' });
    const b = step({ symbol: 'b' });
    const c = step({ symbol: 'c' });
    const map = buildStepEmphasisMap([
      record('flow', stepClaimKey(c)),
      record('flow', stepClaimKey(a)),
    ]);
    expect(emphasisForTrail(map, trail('flow', [b, a, c])).map((r) => r.stepIndex)).toEqual([
      1, 2,
    ]);
  });

  test('an edited claim orphans its mark rather than re-binding it', () => {
    const original = step();
    const edited = step({ file: 'src/ui/login-v2.tsx' });
    const records = [record('flow', stepClaimKey(original))];
    const orphans = orphanedEmphasis(records, [trail('flow', [edited])]);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]!.stepKey).toBe(stepClaimKey(original));
  });

  test('live marks are not reported as orphans', () => {
    const live = step();
    const records = [record('flow', stepClaimKey(live))];
    expect(orphanedEmphasis(records, [trail('flow', [live])])).toEqual([]);
  });

  test('keys are scoped by trail id', () => {
    const shared = step();
    const map = buildStepEmphasisMap([record('flow-a', stepClaimKey(shared))]);
    expect(emphasisKey('flow-b', shared)).not.toBe(emphasisKey('flow-a', shared));
    expect(findStepEmphasis(map, 'flow-b', shared)).toBeUndefined();
  });
});
