import { describe, expect, test } from 'bun:test';
import { issueCategory, issueKindLabel } from './IssueList';

/**
 * Every C4 process-verification kind must land in the dynamic-topology
 * category. These kinds are emitted by new audit passes over time, and an
 * unmapped kind silently falls through to `construct` — the list then files a
 * process finding under Constructs while the maintenance lane tally counts it
 * as dynamic-topology, so the construct lane reads verified (green) beside a
 * process issue. The regressions are real: `boundary_process_missing` shipped
 * unmapped long before the container-first kinds joined it.
 */
describe('issueCategory — C4 process kinds', () => {
  const processKinds = [
    'boundary_process_missing',
    'boundary_process_nest_disagree',
    'boundary_process_unassigned',
    'boundary_process_proposed',
    'boundary_process_rejected',
    'boundary_process_unbacked',
  ];

  for (const kind of processKinds) {
    test(`${kind} categorizes as dynamic-topology`, () => {
      expect(issueCategory({ id: 'x', severity: 'info', kind, message: '' })).toBe(
        'dynamic-topology',
      );
    });
  }

  test('mapped kinds get human labels, not the humanized fallback', () => {
    expect(issueKindLabel({ id: 'x', severity: 'info', kind: 'boundary_process_missing', message: '' })).toBe(
      'Process claim missing',
    );
    expect(issueKindLabel({ id: 'x', severity: 'info', kind: 'boundary_process_unbacked', message: '' })).toBe(
      'Process claim unbacked',
    );
  });
});
