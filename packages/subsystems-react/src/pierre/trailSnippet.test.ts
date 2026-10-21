import { describe, expect, test } from 'bun:test';
import type { SubsystemTrailStep } from '../subsystem/model';
import { sliceTrailStep, trailCallSelection } from './trailSnippet';

const contents = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n');
const step: SubsystemTrailStep = {
  from: 'caller',
  to: 'callee',
  mechanism: 'calls',
  file: 'src/caller.ts',
  purl: 'pkg:github/example/repo#src/caller.ts',
  symbol: 'loadModel',
  site: {
    symbol: 'loadModel',
    span: { startLine: 10, endLine: 70, contentHash: 'caller' },
  },
  span: { startLine: 35, endLine: 38, contentHash: 'call' },
  target: {
    file: 'src/callee.ts',
    purl: 'pkg:github/example/repo#src/callee.ts',
    symbol: 'readFile',
    span: { startLine: 2, endLine: 8, contentHash: 'callee' },
  },
};

describe('trail construct snippets', () => {
  test('shows the full caller span without extra context, not the callee span', () => {
    const slice = sliceTrailStep(contents, step, 8);
    expect(slice.sliceStart).toBe(10);
    expect(slice.sliceEnd).toBe(70);
    expect(slice.contents).toBe(contents.split('\n').slice(9, 70).join('\n'));
    expect(slice.focusOffset).toBe(26);
  });

  test('highlights every line of a multiline call inside the construct', () => {
    const slice = sliceTrailStep(contents, step, 8);
    expect(trailCallSelection(step, slice)).toEqual({ start: 26, end: 29 });
  });

  test('preserves single-line call highlighting', () => {
    const single = { ...step, span: { ...step.span!, endLine: 35 } };
    expect(trailCallSelection(single, sliceTrailStep(contents, single, 8)))
      .toEqual({ start: 26, end: 26 });
  });

  test('keeps a context window for older steps without a site construct', () => {
    const legacy = { ...step, site: undefined };
    const slice = sliceTrailStep(contents, legacy, 8);
    expect(slice.sliceStart).toBe(27);
    expect(slice.sliceEnd).toBe(46);
    expect(slice.focusOffset).toBe(9);
    expect(trailCallSelection(legacy, slice)).toEqual({ start: 9, end: 12 });
  });

  test('does not highlight the declaration as a call when call evidence is missing', () => {
    const unverified = { ...step, span: undefined };
    const slice = sliceTrailStep(contents, unverified, 8);
    expect(slice.sliceStart).toBe(10);
    expect(slice.sliceEnd).toBe(70);
    expect(slice.focusOffset).toBe(1);
    expect(trailCallSelection(unverified, slice)).toBeNull();
  });

  test('clips stale call ranges to the displayed construct', () => {
    const stale = { ...step, span: { ...step.span!, startLine: 68, endLine: 75 } };
    expect(trailCallSelection(stale, sliceTrailStep(contents, stale, 8)))
      .toEqual({ start: 59, end: 61 });
  });

  test('does not highlight unrelated lines when the call falls outside the construct', () => {
    const stale = { ...step, span: { ...step.span!, startLine: 80, endLine: 82 } };
    expect(trailCallSelection(stale, sliceTrailStep(contents, stale, 8))).toBeNull();
  });
});
