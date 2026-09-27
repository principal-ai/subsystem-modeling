/**
 * CLI per-purl commit capture (the offline create path).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  capturePurlCommits,
  purlRepoKey,
  registerProjectInAlexandria,
} from './purl-commits.js';
import { createSubsystemModel, updateSubsystemModel } from './subsystem-model-store.js';

let tmp: string;
let repo: string;
const KEY = 'pkg:github/a/repo-a';

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'cli-commits-'));
  process.env['PRINCIPAL_SUBSYSTEM_MODELS_HOME'] = tmp;
  process.env['PRINCIPAL_ALEXANDRIA_HOME'] = tmp;
  repo = join(tmp, 'repo-a');
  const run = (args: string[]) => {
    const r = spawnSync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  };
  spawnSync('git', ['init', repo], { encoding: 'utf8' });
  run(['config', 'user.email', 'test@example.com']);
  run(['config', 'user.name', 'test']);
  writeFileSync(join(repo, 'x.ts'), 'export const x = 1;\n');
  run(['add', 'x.ts']);
  run(['commit', '-m', 'init']);
  registerProjectInAlexandria(repo, 'https://github.com/a/repo-a.git');
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
  delete process.env['PRINCIPAL_SUBSYSTEM_MODELS_HOME'];
  delete process.env['PRINCIPAL_ALEXANDRIA_HOME'];
});

describe('purlRepoKey', () => {
  test('strips fragments', () => {
    expect(purlRepoKey('pkg:github/a/b#src/x.ts')).toBe('pkg:github/a/b');
    expect(purlRepoKey(undefined)).toBeUndefined();
  });
});

describe('capturePurlCommits (injected)', () => {
  test('skips unresolved purls rather than fabricating', () => {
    const out = capturePurlCommits(
      [
        { alias: 'a', purl: `${KEY}#x.ts` },
        { alias: 'b', purl: 'pkg:github/a/unknown#x.ts' },
      ],
      { resolveRoot: (key) => (key === KEY ? '/r' : undefined), head: () => 'abc' },
    );
    expect(out).toEqual({ [KEY]: 'abc' });
  });
});

describe('capturePurlCommits (real git)', () => {
  test('captures the live HEAD for a registered repo', () => {
    const out = capturePurlCommits([{ alias: 'a', purl: `${KEY}#x.ts` }]);
    expect(out[KEY]).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('createSubsystemModel', () => {
  test('anchors createdAtCommits per purl; update preserves it', async () => {
    const created = await createSubsystemModel({
      title: 'cli prov',
      components: [{ alias: 'a', name: 'a', construct: 'function', file: 'x.ts', purl: `${KEY}#x.ts` }],
      relations: [],
    });
    expect(created.createdAtCommits?.[KEY]).toMatch(/^[0-9a-f]{40}$/);

    const updated = await updateSubsystemModel(created.id, { description: 'edit' });
    expect(updated?.createdAtCommits).toEqual(created.createdAtCommits);
  });
});
