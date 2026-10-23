import { describe, expect, test } from 'bun:test';
import type { SubsystemComponent, SubsystemTrail } from './model';
import type { SubsystemIssue, SubsystemIssueTarget } from './IssueList';
import { buildTrailSidebarScope } from './trailSidebarScope';

const components: SubsystemComponent[] = [
  { alias: 'entry', name: 'Entry', construct: 'function', file: 'src/entry.ts', purl: 'pkg:github/acme/app', module: 'src', process: 'web' },
  { alias: 'store', name: 'Store', construct: 'function', file: 'src/store.ts', purl: 'pkg:github/acme/app', module: 'src', process: 'host' },
  { alias: 'other', name: 'Other', construct: 'function', file: 'src/other.ts', purl: 'pkg:github/acme/other', module: 'other', process: 'worker' },
];
const trail: SubsystemTrail = {
  id: 'save', title: 'Save record',
  steps: [{
    from: 'entry', to: 'store', mechanism: 'calls', file: 'src/seam.ts', purl: 'pkg:github/acme/app',
    target: { file: 'src/target.ts', purl: 'pkg:github/acme/shared#src/target.ts', symbol: 'persist' },
  }],
};
const finding = (id: string, target?: SubsystemIssueTarget): SubsystemIssue => ({
  id, kind: 'trail', severity: 'error', message: id, target,
});

describe('trail sidebar scope', () => {
  test('without a selected trail, keeps the model-wide files and findings', () => {
    const issues = [finding('global')];
    const scope = buildTrailSidebarScope(components, [trail], issues, null);
    expect(scope.trail).toBeNull();
    expect(scope.treePaths.entries.map((entry) => entry.file)).toEqual(components.map((component) => component.file));
    expect(scope.issues).toBe(issues);
  });

  test('includes endpoint declarations, seam sites, and target files, excluding unrelated files', () => {
    const scope = buildTrailSidebarScope(components, [trail], [], trail.id);
    expect(scope.trail).toBe(trail);
    expect(scope.treePaths.entries.map((entry) => entry.file)).toEqual([
      'src/entry.ts', 'src/store.ts', 'src/seam.ts', 'src/target.ts',
    ]);
    expect(scope.treePaths.multiRepo).toBe(true);
  });

  test('includes only findings for this trail and its participating constructs, boundaries, and repos', () => {
    const relevant = [
      finding('component', { kind: 'component', id: 'entry', label: 'Entry' }),
      finding('legacy-label', { kind: 'component', label: 'Store' }),
      finding('trail', { kind: 'trail', id: 'save', label: 'Save record' }),
      finding('step', { kind: 'step', id: 'save', stepIndex: 0, label: 'Entry → Store' }),
      finding('module', { kind: 'module', id: 'src', label: 'src' }),
      finding('process', { kind: 'process', id: 'host', label: 'Host' }),
      finding('repo', { kind: 'repo', id: 'pkg:github/acme/app#src/entry.ts', label: 'app' }),
      finding('target-repo', { kind: 'repo', id: 'pkg:github/acme/shared', label: 'shared' }),
    ];
    const unrelated = [
      finding('other-component', { kind: 'component', id: 'other', label: 'Other' }),
      finding('other-trail', { kind: 'trail', id: 'other', label: 'Other' }),
      finding('other-step', { kind: 'step', id: 'other', stepIndex: 0, label: 'Other step' }),
      finding('invalid-step', { kind: 'step', id: 'save', stepIndex: 10, label: 'Old step' }),
      finding('other-module', { kind: 'module', id: 'other', label: 'other' }),
      finding('other-process', { kind: 'process', id: 'worker', label: 'Worker' }),
      finding('other-repo', { kind: 'repo', id: 'pkg:github/acme/other', label: 'other' }),
      finding('graph', { kind: 'graph', label: 'Whole graph' }),
      finding('untargeted'),
    ];
    expect(buildTrailSidebarScope(components, [trail], [...relevant, ...unrelated], trail.id).issues).toEqual(relevant);
  });

  test('deduplicates repeated sites without merging identical paths from different repos', () => {
    const repeated: SubsystemTrail = {
      ...trail, steps: [trail.steps[0]!, trail.steps[0]!, {
        ...trail.steps[0]!, purl: 'pkg:github/acme/shared',
      }],
    };
    const paths = buildTrailSidebarScope(components, [repeated], [], trail.id).treePaths;
    expect(paths.entries.filter((entry) => entry.file === 'src/seam.ts')).toHaveLength(2);
    expect(paths.toFile.get('acme/shared/src/seam.ts')).toBe('src/seam.ts');
  });

  test('a removed trail restores model-wide content', () => {
    const scope = buildTrailSidebarScope(components, [], [], trail.id);
    expect(scope.trail).toBeNull();
    expect(scope.treePaths.entries).toHaveLength(3);
  });

  test('an empty trail has empty files and issues rather than falling back to the full model', () => {
    const empty: SubsystemTrail = { id: 'empty', title: 'Empty', steps: [] };
    const scope = buildTrailSidebarScope(components, [empty], [finding('global')], empty.id);
    expect(scope.trail).toBe(empty);
    expect(scope.treePaths.entries).toHaveLength(0);
    expect(scope.issues).toHaveLength(0);
  });
});
