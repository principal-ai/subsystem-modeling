import { describe, expect, test } from 'bun:test';
import { analyzeComposeOverlap, codeIdentity, formatComposeOverlap } from './compose-overlap.js';

const repo = 'pkg:github/acme/app';

function code(
  alias: string,
  file: string,
  symbol: string,
  purl = repo,
): {
  alias: string;
  construct: string;
  file: string;
  symbol: string;
  purl: string;
} {
  return { alias, construct: 'function', file, symbol, purl };
}

describe('codeIdentity', () => {
  test('ignores externals and file-less code', () => {
    expect(
      codeIdentity({ construct: 'external', file: '', purl: 'external:db', name: 'db' } as never),
    ).toBeNull();
    expect(codeIdentity({ construct: 'function', file: '', symbol: 'boot', purl: repo })).toBeNull();
  });

  test('joins on repo, file, and symbol', () => {
    const hit = codeIdentity(code('boot', 'src/main.ts', 'boot', `${repo}#src/main.ts`));
    expect(hit?.repoKey).toBe(repo);
    expect(hit?.key).toContain('src/main.ts');
    expect(hit?.key.endsWith('\0boot')).toBe(true);
  });
});

describe('analyzeComposeOverlap', () => {
  test('same alias in different files does not overlap', () => {
    const report = analyzeComposeOverlap([
      { id: 'a', title: 'A', components: [code('app', 'src/a.ts', 'run')] },
      { id: 'b', title: 'B', components: [code('app', 'src/b.ts', 'run')] },
    ]);
    expect(report.repos).toHaveLength(1);
    expect(report.repos[0]?.segregates).toBe(true);
    expect(report.repos[0]?.groups).toHaveLength(2);
  });

  test('shared code identity glues models; a third model stays alone', () => {
    const report = analyzeComposeOverlap([
      {
        id: 'a',
        title: 'Sessions',
        components: [code('tabs', 'src/index.ts', 'tabs'), code('only-a', 'src/a.ts', 'onlyA')],
      },
      {
        id: 'b',
        title: 'Maintainer',
        components: [code('tabs', 'src/index.ts', 'tabs')],
      },
      {
        id: 'c',
        title: 'Graphify',
        components: [code('list', 'src/graphify.ts', 'listRepos')],
      },
    ]);
    const repoReport = report.repos[0]!;
    expect(repoReport.segregates).toBe(true);
    expect(repoReport.groups.map((g) => g.models.map((m) => m.id).sort())).toEqual([
      ['a', 'b'],
      ['c'],
    ]);
    const glued = repoReport.groups[0]!;
    expect(glued.shared).toEqual([
      {
        repoKey: repo,
        file: 'src/index.ts',
        symbol: 'tabs',
        modelIds: ['a', 'b'],
      },
    ]);
    expect(glued.cutModelIds).toEqual([]);
  });

  test('a shared external does not glue models', () => {
    const external = {
      alias: 'db',
      construct: 'external',
      file: '',
      purl: 'external:postgres',
    };
    const report = analyzeComposeOverlap([
      { id: 'a', title: 'A', components: [code('a', 'src/a.ts', 'a'), external] },
      { id: 'b', title: 'B', components: [code('b', 'src/b.ts', 'b'), external] },
    ]);
    expect(report.repos[0]?.segregates).toBe(true);
    expect(report.repos[0]?.groups.every((g) => g.shared.length === 0)).toBe(true);
  });

  test('one overlap group does not segregate', () => {
    const report = analyzeComposeOverlap([
      { id: 'a', title: 'A', components: [code('boot', 'src/main.ts', 'boot')] },
      { id: 'b', title: 'B', components: [code('boot', 'src/main.ts', 'boot')] },
    ]);
    expect(report.repos[0]?.segregates).toBe(false);
    expect(report.repos[0]?.groups).toHaveLength(1);
  });

  test('a bridge model is a cut', () => {
    const report = analyzeComposeOverlap([
      { id: 'a', title: 'A', components: [code('a', 'src/a.ts', 'a'), code('ab', 'src/ab.ts', 'ab')] },
      { id: 'b', title: 'B', components: [code('ab', 'src/ab.ts', 'ab'), code('bc', 'src/bc.ts', 'bc')] },
      { id: 'c', title: 'C', components: [code('bc', 'src/bc.ts', 'bc'), code('c', 'src/c.ts', 'c')] },
    ]);
    expect(report.repos[0]?.groups[0]?.cutModelIds).toEqual(['b']);
  });

  test('models with no code identity are unscoped', () => {
    const report = analyzeComposeOverlap([
      {
        id: 'ext',
        title: 'Actors',
        components: [{ alias: 'person', construct: 'custom_entity', file: '', purl: repo }],
      },
    ]);
    expect(report.repos).toEqual([]);
    expect(report.unscoped.map((m) => m.id)).toEqual(['ext']);
  });
});

describe('formatComposeOverlap', () => {
  test('states whether the repo falls into disjoint groups', () => {
    const text = formatComposeOverlap(
      analyzeComposeOverlap([
        { id: 'a', title: 'A', components: [code('a', 'src/a.ts', 'a')] },
        { id: 'b', title: 'B', components: [code('b', 'src/b.ts', 'b')] },
      ]),
    );
    expect(text).toContain('Disjoint groups: yes');
    expect(text).toContain('group 1');
    expect(text).toContain('group 2');
  });
});
