import { describe, expect, test } from 'bun:test';
import {
  buildRepoGroups,
  buildTreePathMapping,
  purlOwnerName,
  purlRepoKey,
  repoAvatarUrl,
} from './paths';

describe('purlRepoKey', () => {
  test('strips fragments and whitespace', () => {
    expect(purlRepoKey('pkg:github/acme/widget#src/x.ts')).toBe('pkg:github/acme/widget');
    expect(purlRepoKey('  pkg:github/acme/widget ')).toBe('pkg:github/acme/widget');
    expect(purlRepoKey(undefined)).toBeUndefined();
    expect(purlRepoKey('#only-a-fragment')).toBeUndefined();
  });
});

describe('purlOwnerName', () => {
  test('extracts the last two path segments', () => {
    expect(purlOwnerName('pkg:github/acme/widget#src/x.ts')).toBe('acme/widget');
    expect(purlOwnerName('pkg:npm/@scope/lib')).toBe('@scope/lib');
  });
});

describe('buildTreePathMapping', () => {
  test('single-repo graphs keep bare file paths', () => {
    const m = buildTreePathMapping([
      { file: 'src/a.ts', purl: 'pkg:github/acme/widget' },
      { file: 'src/b.ts', purl: 'pkg:github/acme/widget' },
    ]);
    expect(m.multiRepo).toBe(false);
    expect(m.entries.map((e) => e.displayPath)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(m.toFile.get('src/a.ts')).toBe('src/a.ts');
  });

  test('multi-repo graphs prefix entries with owner/name', () => {
    const m = buildTreePathMapping([
      { file: 'graphify/ids.py', purl: 'pkg:github/Graphify-Labs/graphify' },
      { file: 'packages/subsystems-react/src/x.ts', purl: 'pkg:github/principal-ai/core-lib#packages/subsystems-react/src/x.ts' },
    ]);
    expect(m.multiRepo).toBe(true);
    expect(m.toFile.get('Graphify-Labs/graphify/graphify/ids.py')).toBe('graphify/ids.py');
    expect(m.toDisplay.get('packages/subsystems-react/src/x.ts')).toBe(
      'principal-ai/core-lib/packages/subsystems-react/src/x.ts',
    );
  });

  test('same-named files in different repos stay distinct', () => {
    const m = buildTreePathMapping([
      { file: 'README.md', purl: 'pkg:github/acme/widget' },
      { file: 'README.md', purl: 'pkg:github/acme/other' },
    ]);
    expect(m.entries).toHaveLength(2);
  });

  test('components without files are skipped; purl-less components stay unprefixed', () => {
    const m = buildTreePathMapping([
      { file: 'a.ts', purl: 'pkg:github/acme/widget' },
      { file: '', purl: 'pkg:github/acme/widget' },
      { purl: 'pkg:github/acme/widget' },
      { file: 'loose.ts' },
    ]);
    // Two repos' worth of purls? No — the purl-less one has no repo key.
    expect(m.multiRepo).toBe(false);
    expect(m.toFile.get('loose.ts')).toBe('loose.ts');
  });
});

describe('buildRepoGroups', () => {
  test('groups by repo preserving first-appearance order', () => {
    const { multiRepo, groups } = buildRepoGroups([
      { file: 'a.ts', purl: 'pkg:github/acme/widget' },
      { file: 'g/x.py', purl: 'pkg:github/Graphify-Labs/graphify' },
      { file: 'b.ts', purl: 'pkg:github/acme/widget' },
    ]);
    expect(multiRepo).toBe(true);
    expect(groups.map((g) => g.repoKey)).toEqual(['pkg:github/acme/widget', 'pkg:github/Graphify-Labs/graphify']);
    expect(groups[0]!.owner).toBe('acme');
    expect(groups[0]!.repo).toBe('widget');
    expect(groups[0]!.entries.map((e) => e.file)).toEqual(['a.ts', 'b.ts']);
  });

  test('entries carry bare files (no synthetic prefixes)', () => {
    const { groups } = buildRepoGroups([
      { file: 'deep/nested/x.ts', purl: 'pkg:github/acme/widget#deep/nested/x.ts' },
    ]);
    expect(groups[0]!.entries[0]).toEqual({ displayPath: 'deep/nested/x.ts', file: 'deep/nested/x.ts' });
  });

  test('purl-less components land in a trailing unbadged group', () => {
    const { multiRepo, groups } = buildRepoGroups([
      { file: 'loose.ts' },
      { file: 'a.ts', purl: 'pkg:github/acme/widget' },
    ]);
    expect(multiRepo).toBe(false);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.repoKey).toBeUndefined();
    expect(groups[1]!.repoKey).toBe('pkg:github/acme/widget');
  });

  test('single-repo graphs yield one group and multiRepo=false', () => {
    const { multiRepo, groups } = buildRepoGroups([
      { file: 'a.ts', purl: 'pkg:github/acme/widget' },
      { file: 'b.ts', purl: 'pkg:github/acme/widget' },
    ]);
    expect(multiRepo).toBe(false);
    expect(groups).toHaveLength(1);
  });
});

describe('repoAvatarUrl', () => {
  test('github purls map to the owner avatar', () => {
    expect(repoAvatarUrl('pkg:github/Graphify-Labs/graphify#x/y.py')).toBe(
      'https://github.com/Graphify-Labs.png?size=64',
    );
  });

  test('non-github purls have no avatar', () => {
    expect(repoAvatarUrl('pkg:npm/@scope/lib')).toBeUndefined();
    expect(repoAvatarUrl(undefined)).toBeUndefined();
  });
});
