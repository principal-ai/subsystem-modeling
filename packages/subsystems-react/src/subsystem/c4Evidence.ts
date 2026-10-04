/**
 * C4 evidence — the pure read-side of proposing and verifying C4 containers.
 *
 * This module does not decide anything. The proposing agent reads the
 * subsystem diagrams, queries the existing containers, reasons, and writes
 * its own rationale; what lives here is only the mechanical part of that
 * loop:
 *
 *   - `proposeElements` — the proposal scaffold: skip keys containers
 *     already claim, skip boundaries no container can be discerned from
 *     (no runtime code behind them)
 *   - `verifyProcessBoundaries` — a boundary's verification status, read
 *     off the claiming container
 *   - `verificationIssues` — those statuses as dynamic-topology findings,
 *     so verification surfaces through the standard diagnostics pipeline
 *   - `findUnassigned` — runtime components no `process` names at all
 *
 * Judgements — is this the same unit under a different name? is one function
 * a deployable unit? — belong to the agent and the human, never to a
 * matcher.
 */

import type { C4Container, C4ContainerKind, C4Element, C4ElementSet } from './c4';
import type { SubsystemIssue } from './IssueList';

/** The fields the propose/verify gates read off a component. */
export interface C4MemberView {
  alias: string;
  construct: string;
  purl: string;
  process?: string;
  framework?: string;
  module?: string;
  role?: string;
  declaration?: unknown;
}

/** Constructs that execute at runtime — the only things a container can be. */
const RUNTIME_CONSTRUCTS = new Set(['function', 'class', 'custom_entity']);

function storageOf(m: C4MemberView): string | undefined {
  const d = m.declaration as { kind?: string; storage?: string } | undefined;
  return d?.kind === 'store' ? d.storage : undefined;
}

/** True when a component runs, and so can be part of a deployable unit. */
export function isRuntimeConstruct(construct: string): boolean {
  return RUNTIME_CONSTRUCTS.has(construct);
}

/**
 * Runtime components that state no `process` at all.
 *
 * These are the components an agent cannot place by inference, because there
 * is nothing to infer from. They are a standing question, not a per-element
 * concern.
 */
export function findUnassigned(members: readonly C4MemberView[]): C4MemberView[] {
  return members.filter((m) => !m.process && isRuntimeConstruct(m.construct));
}

/**
 * How far a process boundary has travelled toward being a container.
 *
 * A boundary starts `unassigned` — no container claims it. Proposing an
 * element for it (see `proposeElements`) assigns the boundary to a container,
 * which reads as `proposed` until a human decides. `accepted` verifies the
 * boundary: someone approved this run of code as one deployable unit.
 * `rejected` means the proposal was wrong and the boundary should not be
 * drawn as a box.
 */
export type C4ProcessVerification =
  | 'unassigned'
  | 'proposed'
  | 'rejected'
  | 'verified';

/** One process boundary's assignment and its review state. */
export interface C4ProcessBoundaryStatus {
  /** The `process` key, e.g. `principal-studio/host`. */
  key: string;
  /** Aliases carrying this key in the model, when the caller supplied them. */
  memberAliases: string[];
  status: C4ProcessVerification;
  /** The container whose state decided the status. Absent when `unassigned`. */
  element?: C4Element;
}

/**
 * Read a process boundary's verification off its container assignment.
 *
 * The claimant is the container whose `process` equals the boundary's key —
 * a plain string match, no indirection. Two keys that are one deployable unit
 * under two names are fixed in the model document (a consolidation proposal
 * rewrites the components' `process` fields), so the reader never sees a
 * discrepancy to resolve. When several containers claim one key (a
 * hand-edited set can do this), the decided one wins: accepted over rejected
 * over proposed, so one reviewer's yes outranks another's no.
 *
 * Pure: the same rollup and elements always read the same. `rollup` accepts
 * `SubsystemProcessRegion`s directly — only `key` and `memberAliases` are read.
 */
export function verifyProcessBoundaries(options: {
  rollup: ReadonlyArray<{ key: string; memberAliases?: readonly string[] }>;
  elements: readonly C4Element[];
}): C4ProcessBoundaryStatus[] {
  const byKey = new Map<string, C4Element[]>();
  for (const e of options.elements) {
    if (e.kind !== 'container' || !e.process) continue;
    const list = byKey.get(e.process) ?? [];
    list.push(e);
    byKey.set(e.process, list);
  }

  const precedence = { accepted: 0, rejected: 1, proposed: 2 } as const;
  return options.rollup.map(({ key, memberAliases }) => {
    const aliases = [...(memberAliases ?? [])];
    const claimants = byKey.get(key) ?? [];
    if (claimants.length === 0) {
      return { key, memberAliases: aliases, status: 'unassigned' as const };
    }
    const decided = [...claimants].sort(
      (a, b) => precedence[a.state] - precedence[b.state] || a.id.localeCompare(b.id),
    )[0]!;
    const status = decided.state === 'accepted' ? ('verified' as const) : decided.state;
    return { key, memberAliases: aliases, status, element: decided };
  });
}

/**
 * Verification statuses as diagnostics findings — the dynamic-topology layer
 * of the issues list. One finding per boundary that is NOT verified: an
 * unclaimed boundary is the absence a proposing agent run resolves, a
 * `proposed` one awaits the human's decision, a `rejected` one records that
 * the decision was no. `verified` reports nothing — the audit reports
 * absence only, and silence is the good state.
 *
 * The findings ride the existing pipeline untouched: they badge the process
 * frame (target kind `process`), list under Dynamic topology, focus their
 * members on click, and carry the fix the decision needs. Pure over its
 * input, like the rest of this module.
 */
export function verificationIssues(
  statuses: readonly C4ProcessBoundaryStatus[],
): SubsystemIssue[] {
  const out: SubsystemIssue[] = [];
  for (const { key, status, element } of statuses) {
    if (status === 'verified') continue;
    const label = element?.label ?? key;
    out.push({
      id: `process-verification:${key}`,
      severity: 'info',
      kind: `boundary_process_${status}`,
      message:
        status === 'unassigned'
          ? `No C4 container claims this process boundary yet — a proposing agent run would scaffold one.`
          : status === 'proposed'
            ? `Container "${label}" claims this boundary and awaits a decision.`
            : `Container "${label}" was rejected for this boundary — it stays unclaimed until a container is accepted.`,
      target: { kind: 'process', id: key, label: key },
      fix:
        status === 'unassigned'
          ? { label: 'Propose container' }
          : status === 'proposed'
            ? { label: 'Accept container' }
            : undefined,
    });
  }
  return out;
}

/**
 * A starting point for an agent, shaped by the two questions that matter when
 * assessing a process boundary:
 *
 *   1. **Does a container already exist for it?** (`elements`) — a key one
 *      already claims is never re-proposed; proposing another would be
 *      exactly the duplicate this module exists to prevent. The exact claim
 *      is a fact and skipped here; whether a *similarly named* container is
 *      the same unit is a judgement, so it belongs to the agent querying the
 *      container list — the fix there is a consolidation proposal, not a
 *      second box.
 *   2. **Can the boundary be discerned into a container?** — code that never
 *      runs cannot be, so a library-shaped group gets no proposal; that
 *      fact is the agent's to report, not the scaffold's.
 *
 * For boundaries passing both, one `proposed` container per key. The
 * rationale is the proposing agent's own reasoning, written on the proposal
 * it POSTs — this scaffold does not fabricate one. A scaffold to edit and
 * argue with — not an answer, and never `accepted`.
 */
export function proposeElements(options: {
  repoKey: string;
  rollup: ReadonlyArray<{
    key: string;
    members: readonly C4MemberView[];
    frameworks: readonly string[];
  }>;
  /** Containers that already exist (from the element store), by `process` claim. */
  elements?: readonly C4Element[];
}): C4ElementSet {
  const existing = options.elements ?? [];
  const claimed = new Set(existing.flatMap((e) => (e.kind === 'container' && e.process ? [e.process] : [])));

  const elements: C4Container[] = [];
  for (const { key, members, frameworks } of options.rollup) {
    if (claimed.has(key)) continue; // already covered — exact claim, a fact
    const runtime = members.filter((m) => isRuntimeConstruct(m.construct));
    if (members.length > 0 && runtime.length === 0) continue; // not discernible: code that never runs

    elements.push({
      id: `container:${key}`,
      kind: 'container',
      process: key,
      label: key,
      containerKind: suggestContainerKind(members),
      // C4 requires a technology on every container. With no framework signal
      // the honest value is empty and the notation-gap check reports it —
      // inventing "TypeScript" here would be exactly the derivation this
      // module stopped doing.
      technology: frameworks.length > 0 ? frameworks.join(' + ') : '',
      state: 'proposed',
    });
  }

  return {
    repoKey: options.repoKey,
    elements: elements.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/**
 * A first guess at what sort of container this is, offered as a *default* for
 * the agent to override.
 *
 * Note there is no `library` answer, even for a library-shaped group. C4 says
 * a module "typically" is not an element at all, so the honest response to a
 * library is a review comment: the `library_shaped` concern carries the
 * question, and the element is proposed as `application` for a person to
 * reject or demote. There is deliberately no `concerns` parameter here for the
 * caller to consult — passing one would only invite another kind back into the
 * vocabulary.
 *
 * The store split is deliberately conservative: only durable storage becomes
 * `data-store`, because over-claiming that is the more damaging error.
 */
export function suggestContainerKind(members: readonly C4MemberView[]): C4ContainerKind {
  const stores = members.filter((m) => m.construct === 'store');
  if (stores.length > 0) {
    const persists = stores.some((m) => storageOf(m) === 'external' || storageOf(m) === 'disk');
    return persists ? 'data-store' : 'application';
  }
  return 'application';
}