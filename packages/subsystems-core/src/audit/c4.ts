/**
 * Minimal C4 read-side used by the audit engine.
 *
 * The full C4 model lives in the viewer package. The audit only needs to read
 * a container's `process` claim and review state, so it takes a structural
 * element shape here instead of depending on the renderer.
 */

export type C4AuditElementState = 'proposed' | 'accepted' | 'rejected'

export interface C4AuditElement {
  id: string
  kind: string
  state: C4AuditElementState
  process?: string
  label?: string
}

export type C4ProcessVerification =
  | 'unassigned'
  | 'proposed'
  | 'rejected'
  | 'verified'

export interface C4ProcessBoundaryStatus {
  /** The `process` key, e.g. `principal-studio/host`. */
  key: string
  /** Aliases carrying this key in the model, when the caller supplied them. */
  memberAliases: string[]
  status: C4ProcessVerification
  /** The container whose state decided the status. Absent when `unassigned`. */
  element?: C4AuditElement
}

/**
 * Read a process boundary's verification off its container assignment.
 *
 * The claimant is the container whose `process` equals the boundary's key —
 * a plain string match. When several containers claim one key, the decided one
 * wins: accepted over rejected over proposed, so one reviewer's yes outranks
 * another's no. Pure.
 */
export function verifyProcessBoundaries(options: {
  rollup: ReadonlyArray<{ key: string; memberAliases?: readonly string[] }>
  elements: readonly C4AuditElement[]
}): C4ProcessBoundaryStatus[] {
  const byKey = new Map<string, C4AuditElement[]>()
  for (const element of options.elements) {
    if (element.kind !== 'container' || !element.process) continue
    const list = byKey.get(element.process) ?? []
    list.push(element)
    byKey.set(element.process, list)
  }

  const precedence = { accepted: 0, rejected: 1, proposed: 2 } as const
  return options.rollup.map(({ key, memberAliases }) => {
    const aliases = [...(memberAliases ?? [])]
    const claimants = byKey.get(key) ?? []
    if (claimants.length === 0) {
      return { key, memberAliases: aliases, status: 'unassigned' as const }
    }
    const decided = [...claimants].sort(
      (a, b) =>
        precedence[a.state] - precedence[b.state] || a.id.localeCompare(b.id),
    )[0]!
    const status =
      decided.state === 'accepted' ? ('verified' as const) : decided.state
    return { key, memberAliases: aliases, status, element: decided }
  })
}
