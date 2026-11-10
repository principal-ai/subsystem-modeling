import { describe, expect, test } from 'bun:test'
import {
  auditFixGroups,
  auditIssueCount,
  classifyAuditReport,
  summarizeLanes,
  summarizeVerification,
} from './report-logic'
import type {
  SubsystemModelAuditCheck,
  SubsystemModelAuditReport,
} from './report'

function check(overrides: Partial<SubsystemModelAuditCheck> = {}): SubsystemModelAuditCheck {
  return {
    componentAlias: 'component',
    fileExists: true,
    symbolDeclared: true,
    graphify: 'confirmed',
    verdict: 'ok',
    constructMatch: true,
    signature: 'match',
    declarationFreshness: 'full',
    ...overrides,
  }
}

function report(
  overrides: Partial<SubsystemModelAuditReport> = {},
): SubsystemModelAuditReport {
  return {
    graphId: 'model',
    title: 'model',
    checkedAt: '2026-01-01T00:00:00.000Z',
    needsUpdate: false,
    summary: {
      components: 0,
      filesVerified: 0,
      symbolsVerified: 0,
      declarationsFresh: 0,
      constructsMatched: 0,
      signaturesMatched: 0,
      anchorsExact: 0,
      graphifyConfirmed: 0,
      externalsSkipped: 0,
      missingFiles: 0,
      missingSymbols: 0,
      trailFailures: 0,
      stepsUnconfirmed: 0,
      stepsStale: 0,
      stepsVerified: 0,
      staleDeclarations: 0,
      constructMismatches: 0,
      signatureMismatches: 0,
      weakAnchors: 0,
      unresolved: 0,
      ok: 0,
      modulesClaimed: 0,
      moduleFileOk: 0,
      moduleFileMismatch: 0,
      processNestsChecked: 0,
      processNestOk: 0,
      processNestDisagree: 0,
      processRequired: 0,
      processClaimed: 0,
      processMissing: 0,
    },
    checks: [],
    findings: [],
    ...overrides,
  }
}

describe('audit report logic', () => {
  test('classifies issues before gaps and counts error findings', () => {
    expect(classifyAuditReport(report())).toBe('fully_verified')
    expect(
      classifyAuditReport(
        report({
          findings: [{ kind: 'repo_unresolved', severity: 'info', message: 'missing repo' }],
        }),
      ),
    ).toBe('partially_verified')
    const issue = report({
      needsUpdate: true,
      findings: [{ kind: 'missing_file', severity: 'error', message: 'missing file' }],
    })
    expect(classifyAuditReport(issue)).toBe('issues')
    expect(auditIssueCount(issue)).toBe(1)
  })

  test('derives claim and lane coverage from checks and findings', () => {
    const value = report({
      summary: { ...report().summary, components: 1, stepsVerified: 1 },
      checks: [check()],
      boundaryChecks: [
        {
          componentAlias: 'component',
          kind: 'module_file',
          verdict: 'gap',
        },
      ],
    })
    const verification = summarizeVerification(value)
    expect(verification.verified).toBe(1)
    expect(verification.open).toBe(1)
    expect(verification.byLayer.boundary.open).toBe(1)
    expect(summarizeLanes(value, { hasTrails: true })).toEqual({
      construct: 'verified',
      'static-topology': 'partial',
      'dynamic-topology': 'none',
      trail: 'verified',
    })
  })

  test('groups deterministic fixes by kind', () => {
    const value = report({
      findings: [
        {
          kind: 'construct_span_capturable',
          severity: 'info',
          message: 'capture span',
          fix: {
            id: 'adopt_tree_sitter_span',
            label: 'Capture span',
            declarationSpan: { startLine: 1, endLine: 2, contentHash: 'hash' },
          },
        },
        {
          kind: 'construct_span_capturable',
          severity: 'info',
          message: 'capture another span',
          fix: {
            id: 'adopt_tree_sitter_span',
            label: 'Capture span',
            declarationSpan: { startLine: 3, endLine: 4, contentHash: 'hash' },
          },
        },
      ],
    })
    expect(auditFixGroups(value)).toEqual([
      { fixId: 'adopt_tree_sitter_span', count: 2 },
    ])
  })
})
