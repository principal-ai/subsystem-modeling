import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { NodeFileSystemAdapter } from '@principal-ai/repository-abstraction/node';
import { ScopesCanvasValidator } from './ScopesCanvasValidator';
import type { ExtendedCanvas } from '../types/canvas';

function makeScopeNode(opts: {
  id: string;
  scope: string;
  description?: string;
  paths?: string[];
}): any {
  return {
    id: opts.id,
    type: 'otel-scope',
    description: opts.description ?? `${opts.scope} scope`,
    ...(opts.paths !== undefined ? { paths: opts.paths } : {}),
    otel: { scope: opts.scope },
    x: 0,
    y: 0,
    width: 100,
    height: 50,
  };
}

function makeCanvas(nodes: any[]): ExtendedCanvas {
  return { nodes, edges: [] } as ExtendedCanvas;
}

function withTempRepo(layout: string[], fn: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'scope-paths-'));
  try {
    for (const rel of layout) {
      const full = join(root, rel);
      mkdirSync(full, { recursive: true });
      writeFileSync(join(full, '.keep'), '');
    }
    return fn(root).finally(() => rmSync(root, { recursive: true, force: true }));
  } catch (e) {
    rmSync(root, { recursive: true, force: true });
    throw e;
  }
}

describe('ScopesCanvasValidator scope paths', () => {
  test('no paths declared → no path violations', async () => {
    const canvas = makeCanvas([makeScopeNode({ id: 's1', scope: 'a.b' })]);
    const v = new ScopesCanvasValidator(new NodeFileSystemAdapter());
    const r = await v.validate({
      scopesCanvas: canvas,
      ownedScopes: ['a.b'],
      basePath: '/tmp',
    });
    expect(r.violations.find(x => x.ruleId.startsWith('scopes-paths'))).toBeUndefined();
  });

  test('scopes-paths-multiple warns when more than one path', async () => {
    await withTempRepo(['packages/a/src', 'packages/a/generated'], async (root) => {
      const canvas = makeCanvas([
        makeScopeNode({
          id: 's1',
          scope: 'a',
          paths: ['packages/a/src', 'packages/a/generated'],
        }),
      ]);
      const v = new ScopesCanvasValidator(new NodeFileSystemAdapter());
      const r = await v.validate({ scopesCanvas: canvas, ownedScopes: ['a'], basePath: root });
      const w = r.violations.find(x => x.ruleId === 'scopes-paths-multiple');
      expect(w).toBeDefined();
      expect(w?.severity).toBe('warn');
    });
  });

  test('scopes-paths-missing warns when path does not exist', async () => {
    await withTempRepo(['packages/a/src'], async (root) => {
      const canvas = makeCanvas([
        makeScopeNode({ id: 's1', scope: 'a', paths: ['packages/a/missing'] }),
      ]);
      const v = new ScopesCanvasValidator(new NodeFileSystemAdapter());
      const r = await v.validate({ scopesCanvas: canvas, ownedScopes: ['a'], basePath: root });
      const w = r.violations.find(x => x.ruleId === 'scopes-paths-missing');
      expect(w).toBeDefined();
      expect(w?.severity).toBe('warn');
    });
  });

  test('scopes-paths-overlap errors on identical paths across scopes', async () => {
    await withTempRepo(['packages/shared/src'], async (root) => {
      const canvas = makeCanvas([
        makeScopeNode({ id: 's1', scope: 'a', paths: ['packages/shared/src'] }),
        makeScopeNode({ id: 's2', scope: 'b', paths: ['packages/shared/src'] }),
      ]);
      const v = new ScopesCanvasValidator(new NodeFileSystemAdapter());
      const r = await v.validate({
        scopesCanvas: canvas,
        ownedScopes: ['a', 'b'],
        basePath: root,
      });
      const e = r.violations.find(x => x.ruleId === 'scopes-paths-overlap');
      expect(e).toBeDefined();
      expect(e?.severity).toBe('error');
      expect(r.valid).toBe(false);
    });
  });

  test('parent-child path nesting is allowed (no overlap error)', async () => {
    await withTempRepo(['packages/subsystems-core/src/validation'], async (root) => {
      const canvas = makeCanvas([
        makeScopeNode({ id: 's1', scope: 'principal-ai.core', paths: ['packages/subsystems-core/src'] }),
        makeScopeNode({
          id: 's2',
          scope: 'principal-ai.core.validation',
          paths: ['packages/subsystems-core/src/validation'],
        }),
      ]);
      const v = new ScopesCanvasValidator(new NodeFileSystemAdapter());
      const r = await v.validate({
        scopesCanvas: canvas,
        ownedScopes: ['principal-ai.core', 'principal-ai.core.validation'],
        basePath: root,
      });
      expect(r.violations.find(x => x.ruleId === 'scopes-paths-overlap')).toBeUndefined();
    });
  });
});
