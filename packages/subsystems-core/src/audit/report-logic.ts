import type {
  SubsystemModelAuditFixGroup,
  SubsystemModelAuditReport,
  SubsystemModelAuditCheck,
  SubsystemModelAuditBoundaryCheck,
  SubsystemModelVerification,
  SubsystemModelVerificationLayer,
  SubsystemVerificationLane,
  VerificationLaneStatus,
} from './report'

export type SubsystemModelAuditVerdict =
  | 'fully_verified'
  | 'partially_verified'
  | 'issues'

export function auditFixGroups(
  report: SubsystemModelAuditReport,
): SubsystemModelAuditFixGroup[] {
  const byFix = new Map<string, number>()
  for (const finding of report.findings) {
    if (!finding.fix) continue
    byFix.set(finding.fix.id, (byFix.get(finding.fix.id) ?? 0) + 1)
  }
  return [...byFix.entries()].map(([fixId, count]) => ({
    fixId: fixId as SubsystemModelAuditFixGroup['fixId'],
    count,
  }))
}

export function auditIssueCount(report: SubsystemModelAuditReport): number {
  const fromFindings = report.findings.filter(
    (finding) => finding.severity === 'error',
  ).length
  if (fromFindings > 0) return fromFindings
  return report.checks.filter((check) => check.verdict === 'issue').length
}

export function auditHasIssues(report: SubsystemModelAuditReport): boolean {
  if (report.needsUpdate) return true
  if (report.checks.some((check) => check.verdict === 'issue')) return true
  return report.findings.some((finding) => finding.severity === 'error')
}

/** Gaps that are not failures — some checks confirmed, some still need follow-up. */
export function auditHasPartialGaps(report: SubsystemModelAuditReport): boolean {
  if (report.findings.some((finding) => finding.severity === 'info')) return true
  for (const check of report.checks) {
    if (check.verdict === 'issue') continue
    if (check.constructInferred === 'unknown' && check.constructMatch !== true) return true
    if (check.signature === 'skipped') return true
  }
  return report.boundaryChecks?.some((check) => check.verdict === 'gap') ?? false
}

export function classifyAuditReport(
  report: SubsystemModelAuditReport,
): SubsystemModelAuditVerdict {
  if (auditHasIssues(report)) return 'issues'
  if (auditHasPartialGaps(report)) return 'partially_verified'
  return 'fully_verified'
}

/** Fully verified construct claim: exact graph anchor, source, kind, signature, and span. */
export function isVerifiedConstructCheck(
  check: SubsystemModelAuditCheck,
): boolean {
  return (
    check.verdict === 'ok' &&
    check.graphify === 'confirmed' &&
    check.fileExists === true &&
    check.constructMatch === true &&
    check.signature !== 'mismatch' &&
    check.signature !== 'skipped' &&
    check.declarationFreshness !== 'stale' &&
    check.declarationFreshness !== 'missing'
  )
}

interface VerificationTally {
  verified: number
  open: number
  blocked: number
  na: number
  blocking: number
}

function emptyTally(): VerificationTally {
  return { verified: 0, open: 0, blocked: 0, na: 0, blocking: 0 }
}

function finalizeLayer(tally: VerificationTally): SubsystemModelVerificationLayer {
  const adjudicable = tally.verified + tally.open
  const coverage =
    adjudicable > 0
      ? tally.verified / adjudicable
      : tally.blocked > 0
        ? 0
        : 1
  return {
    verified: tally.verified,
    open: tally.open,
    blocked: tally.blocked,
    na: tally.na,
    coverage,
    blocking: tally.blocking,
  }
}

function mergeTallies(...tallies: VerificationTally[]): VerificationTally {
  const merged = emptyTally()
  for (const tally of tallies) {
    merged.verified += tally.verified
    merged.open += tally.open
    merged.blocked += tally.blocked
    merged.na += tally.na
    merged.blocking += tally.blocking
  }
  return merged
}

function classifyConstructCheck(
  check: SubsystemModelAuditCheck,
  tally: VerificationTally,
): void {
  if (check.graphify === 'skipped') {
    tally.na++
    return
  }
  if (check.verdict === 'issue' || check.fileExists === false) {
    tally.open++
    tally.blocking++
    return
  }
  if (check.fileExists === null || check.graphify === 'unavailable') {
    tally.blocked++
    return
  }
  if (isVerifiedConstructCheck(check)) {
    tally.verified++
    return
  }
  tally.open++
}

function classifyBoundaryCheck(
  check: SubsystemModelAuditBoundaryCheck,
  tally: VerificationTally,
): void {
  if (check.kind === 'skipped' || check.verdict === 'skipped') {
    tally.na++
    return
  }
  if (check.verdict === 'issue') {
    tally.open++
    tally.blocking++
    return
  }
  if (check.verdict === 'ok') {
    tally.verified++
    return
  }
  tally.open++
}

/** Derive the claim-based verification ledger from an audit report. */
export function summarizeVerification(
  report: SubsystemModelAuditReport,
): SubsystemModelVerification {
  const construct = emptyTally()
  const boundary = emptyTally()
  const topology = emptyTally()

  for (const check of report.checks) classifyConstructCheck(check, construct)
  for (const check of report.boundaryChecks ?? [])
    classifyBoundaryCheck(check, boundary)

  const total = finalizeLayer(mergeTallies(construct, boundary, topology))
  return {
    ...total,
    byLayer: {
      construct: finalizeLayer(construct),
      boundary: finalizeLayer(boundary),
      topology: finalizeLayer(topology),
    },
  }
}

function laneStatus(tally: VerificationTally): VerificationLaneStatus {
  if (tally.blocking > 0) return 'issues'
  if (tally.open > 0) return 'partial'
  if (tally.verified > 0) return 'verified'
  if (tally.blocked > 0) return 'blocked'
  return 'none'
}

/** Coarse verification status mapped onto the four model layers. */
export function summarizeLanes(
  report: SubsystemModelAuditReport,
  opts: { hasTrails: boolean },
): Record<SubsystemVerificationLane, VerificationLaneStatus> {
  const construct = emptyTally()
  for (const check of report.checks) classifyConstructCheck(check, construct)

  const staticTopology = emptyTally()
  const dynamicTopology = emptyTally()
  for (const check of report.boundaryChecks ?? []) {
    if (check.kind === 'module_file') classifyBoundaryCheck(check, staticTopology)
    if (
      check.kind === 'process_nest' ||
      check.kind === 'process_claim' ||
      check.kind === 'process_container'
    ) {
      classifyBoundaryCheck(check, dynamicTopology)
    }
  }

  const hasStepIssues = (report.summary.stepsStale ?? 0) > 0
  const hasUnconfirmedSteps = (report.summary.stepsUnconfirmed ?? 0) > 0
  const hasVerifiedSteps = (report.summary.stepsVerified ?? 0) > 0
  const hasAnyStepInfo = hasStepIssues || hasUnconfirmedSteps || hasVerifiedSteps
  const trail: VerificationLaneStatus = !opts.hasTrails
    ? 'none'
    : report.summary.trailFailures > 0 || hasStepIssues
      ? 'issues'
      : hasUnconfirmedSteps
        ? 'partial'
        : hasVerifiedSteps
          ? 'verified'
          : hasAnyStepInfo
            ? 'partial'
            : 'verified'

  const constructStatus: VerificationLaneStatus =
    report.summary.components > 0 && laneStatus(construct) === 'none'
      ? 'partial'
      : laneStatus(construct)

  return {
    construct: constructStatus,
    'static-topology': laneStatus(staticTopology),
    'dynamic-topology': laneStatus(dynamicTopology),
    trail,
  }
}
