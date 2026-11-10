/**
 * Trail rules shared by the audit engine and the UI.
 */

import type {
  SubsystemComponent,
  SubsystemTrail,
  SubsystemTrailStep,
} from '../types/subsystem-model'
import type { SubsystemModelAuditFinding } from './report'

type StepSite = Pick<
  SubsystemTrailStep,
  'mechanism' | 'file' | 'span' | 'site'
>
type FromComponent = Pick<SubsystemComponent, 'file' | 'declarationSpan'>

/**
 * True when a `calls` step's site is not housed by its `from` component.
 *
 * - Different file → outside (the component cannot contain the site).
 * - Same file but the stored site span falls outside the component's
 *   declaration span → outside (a sibling construct, not a nested one).
 * - Unknown component span / site span → not enough evidence to call it
 *   outside; stay permissive so missing spans stay a separate finding.
 *
 * Always false for non-`calls` mechanisms: `uses`, `feeds`, `writes`, … are
 * allowed to point at evidence in another construct.
 */
export function callsSiteOutsideFrom(
  step: StepSite,
  from: FromComponent | undefined,
): boolean {
  if (step.mechanism !== 'calls' || !from) return false

  const fromFile = from.file?.trim()
  if (fromFile && fromFile !== step.file) return true

  const fromSpan = from.declarationSpan
  const siteSpan = step.site?.span ?? step.span
  if (fromSpan && siteSpan) {
    return !(
      fromSpan.startLine <= siteSpan.startLine &&
      siteSpan.endLine <= fromSpan.endLine
    )
  }

  return false
}

/**
 * Components with no trail edges.
 *
 * A standalone node may be intentional, but is worth a second look in a
 * subsystem graph whose purpose is to explain relationships.
 */
export function unconnectedComponentFindings(
  components: readonly SubsystemComponent[],
  trails: readonly SubsystemTrail[],
): SubsystemModelAuditFinding[] {
  const connected = new Set<string>()
  for (const trail of trails) {
    for (const step of trail.steps ?? []) {
      connected.add(step.from)
      connected.add(step.to)
    }
  }
  return components
    .filter((component) => !connected.has(component.alias))
    .map((component) => ({
      kind: 'component_unconnected' as const,
      severity: 'info' as const,
      componentAlias: component.alias,
      componentName: component.name,
      message: `Component ${JSON.stringify(component.name)} has no trail edges. Add a trail if it participates in this subsystem, or remove it if it is out of scope.`,
    }))
}
