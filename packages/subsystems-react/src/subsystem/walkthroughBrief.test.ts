import { describe, expect, test } from 'bun:test';
import { buildStepBrief } from './walkthroughBrief';
import type { SubsystemWalkthrough } from './model';

const walkthrough: SubsystemWalkthrough = {
  id: 'auth-flow',
  title: 'Auth flow',
  steps: [
    {
      from: 'ui',
      to: 'api',
      mechanism: 'calls',
      file: 'src/ui/login.tsx',
      line: 42,
      purl: 'pkg:github/acme/app',
      symbol: 'Login.submit',
    },
    {
      from: 'api',
      to: 'store',
      mechanism: 'writes',
      file: 'src/api/session.ts',
      line: 7,
      purl: 'pkg:github/acme/app',
      symbol: 'Session.create',
      annotation: 'session row is written here',
    },
  ],
};

describe('buildStepBrief', () => {
  test('includes flow identity, position, and seam anchors', () => {
    const brief = buildStepBrief(walkthrough, 0);
    expect(brief).toContain('Walkthrough: Auth flow (auth-flow) — step 1/2');
    expect(brief).toContain('- from: `ui`');
    expect(brief).toContain('- to: `api`');
    expect(brief).toContain('- mechanism: `calls`');
    expect(brief).toContain('- symbol: `Login.submit`');
    expect(brief).toContain('- site: `src/ui/login.tsx:42`');
    expect(brief).toContain('- purl: `pkg:github/acme/app`');
  });

  test('omits the note when the step has no annotation', () => {
    expect(buildStepBrief(walkthrough, 0)).not.toContain('- note:');
  });

  test('includes the note when the step has an annotation', () => {
    const brief = buildStepBrief(walkthrough, 1);
    expect(brief).toContain('Walkthrough: Auth flow (auth-flow) — step 2/2');
    expect(brief).toContain('- note: session row is written here');
  });

  test('returns an empty string for an out-of-range index', () => {
    expect(buildStepBrief(walkthrough, 9)).toBe('');
    expect(buildStepBrief(walkthrough, -1)).toBe('');
  });
});
