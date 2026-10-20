import { describe, expect, test } from 'bun:test';
import type { SubsystemTrail } from './model';
import { buildTrailStack } from './trailStack';

const trail: SubsystemTrail = {
  id: 'stack',
  title: 'Stack',
  steps: [
    {
      from: 'panel',
      to: 'rpc',
      mechanism: 'calls',
      file: 'src/panel.ts',
      purl: 'pkg:github/acme/app#src/panel.ts',
      symbol: 'MaintenancePanel',
      target: {
        purl: 'pkg:github/acme/app#src/rpc.ts',
        file: 'src/rpc.ts',
        symbol: 'getRpc',
      },
    },
    {
      from: 'rpc',
      to: 'detail',
      mechanism: 'calls',
      file: 'src/rpc.ts',
      purl: 'pkg:github/acme/app#src/rpc.ts',
      symbol: 'getRpc',
      target: {
        purl: 'pkg:github/acme/app#src/detail.ts',
        file: 'src/detail.ts',
        symbol: 'modelDetail',
      },
    },
    {
      from: 'detail',
      to: 'touches',
      mechanism: 'calls',
      file: 'src/detail.ts',
      purl: 'pkg:github/acme/app#src/detail.ts',
      symbol: 'modelDetail',
      target: {
        purl: 'pkg:github/acme/app#src/touches.ts',
        file: 'src/touches.ts',
        symbol: 'commitTouches',
      },
    },
    {
      from: 'detail',
      to: 'remote',
      mechanism: 'calls',
      file: 'src/detail.ts',
      purl: 'pkg:github/acme/app#src/detail.ts',
      symbol: 'modelDetail',
      target: {
        purl: 'pkg:github/acme/app#src/remote.ts',
        file: 'src/remote.ts',
        symbol: 'remoteRefSha',
      },
    },
    {
      from: 'panel',
      to: 'merge',
      mechanism: 'uses',
      file: 'src/list.tsx',
      purl: 'pkg:github/acme/app#src/list.tsx',
      symbol: 'ModelList',
    },
    {
      from: 'merge',
      to: 'dots',
      mechanism: 'feeds',
      file: 'src/dots.tsx',
      purl: 'pkg:github/acme/app#src/dots.tsx',
      symbol: 'CommitDots',
    },
  ],
};

describe('buildTrailStack', () => {
  test('builds the caller chain for a nested call', () => {
    const stack = buildTrailStack(trail, 2);
    expect(stack.isCall).toBe(true);
    expect(stack.frames.map((f) => f.label)).toEqual([
      'MaintenancePanel',
      'getRpc',
      'modelDetail',
    ]);
    expect(stack.frames.map((f) => f.current)).toEqual([false, false, true]);
    expect(stack.callee).toBe('commitTouches');
  });

  test('a sibling call links to the shared parent, not the previous sibling', () => {
    const stack = buildTrailStack(trail, 3);
    expect(stack.frames.map((f) => f.stepIndex)).toEqual([0, 1, 3]);
    expect(stack.frames.map((f) => f.label)).toEqual([
      'MaintenancePanel',
      'getRpc',
      'modelDetail',
    ]);
    expect(stack.callee).toBe('remoteRefSha');
  });

  test('uses is an annotation on the frame it belongs to, not a frame', () => {
    const stack = buildTrailStack(trail, 4);
    expect(stack.isCall).toBe(false);
    expect(stack.frames.map((f) => f.label)).toEqual(['MaintenancePanel']);
    expect(stack.annotations).toEqual([
      { stepIndex: 4, mechanism: 'uses', label: 'uses merge', selected: true },
    ]);
  });

  test('a root call still shows its caller frame and callee', () => {
    const stack = buildTrailStack(trail, 0);
    expect(stack.frames.map((f) => f.label)).toEqual(['MaintenancePanel']);
    expect(stack.callee).toBe('getRpc');
  });

  test('a non-call step with no call context falls back to its source frame', () => {
    const stack = buildTrailStack(trail, 5);
    expect(stack.isCall).toBe(false);
    expect(stack.frames.map((f) => f.label)).toEqual(['CommitDots']);
    expect(stack.annotations[0]?.label).toBe('feeds dots');
  });

  test('out-of-range returns an empty view', () => {
    expect(buildTrailStack(trail, 99)).toEqual({
      frames: [],
      annotations: [],
      isCall: false,
    });
  });
});
