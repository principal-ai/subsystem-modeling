/**
 * C4 associations — the confirmed, human-approved layer.
 *
 * `toC4.ts` derives a C4 projection from the flat document, but a derivation
 * cannot be right about architecture on its own. The document says *what a
 * symbol is* and *where it runs*; it does not say whether two runs are one
 * deployable unit, whether a library is a container, or whether a store is a
 * C4 data store.
 *
 * So the derivation proposes, and this module records what a person (or an
 * agent a person approved) concluded:
 *
 *   process key          derived key      association
 *   ─────────────────────────────────────────────────────────
 *   subsystems-studio/host   ─┐
 *                              ├─────►  container:studio-host
 *   principal-studio/host    ─┘        (state: accepted)
 *
 * The association is the join point. It names one C4 element and lists the
 * derived keys that belong to it, which is how dedup works without inventing
 * anything: several keys claimed by one id collapse into one box.
 *
 * ## Why this is not in the subsystem document
 *
 * A `C4Association` is a claim about *architecture*, not about *code*. Putting
 * it on the document would mean every re-audit had to re-derive and re-defend
 * it, and it would make the shared standard carry an opinion the models have
 * no evidence for. Keeping it separate means the portable document stays
 * source-anchored and this layer stays revisable on its own.
 *
 * ## What an agent may and may not do
 *
 * An agent may *propose* associations — `state: 'proposed'` — including merges,
 * including retyping a store as a data store, including writing `technology`
 * and `description` from the source it read. It may not set `state:
 * 'accepted'`. That field is the human's, and it is the only field that
 * changes what is drawn: a proposed association shows as a proposal, an
 * accepted one is part of the architecture, and a rejected one is not drawn.
 */

import type { C4Association, C4ElementType, C4Model } from './toC4';

/** The sidecar: a set of associations for one repo (or one composed graph). */
export interface C4AssociationSet {
  /** Repo key this set describes, e.g. `pkg:github/owner/name`. */
  repoKey: string;
  /** ISO timestamp of the last change. */
  updatedAt?: string;
  associations: C4Association[];
}

/** Why an agent proposes what it proposes — the reviewable part. */
export interface C4AssociationReason {
  /** Stable id of the derived key or association this concerns. */
  target: string;
  kind: C4ConcernKind;
  message: string;
  /** Aliases of the components that triggered the concern. */
  members?: string[];
}

/**
 * The questions worth a human's attention, derived mechanically.
 *
 * These are the checks from the C4 notation rules that the document cannot
 * answer on its own. An agent turns each into a proposal; a person answers.
 */
export type C4ConcernKind =
  /** two or more process keys may be the same deployable unit */
  | 'merge_candidate'
  /** exactly one member — a lone function is not a deployable unit */
  | 'singleton'
  /** no member that executes at runtime — a library is not a container */
  | 'library_shaped'
  /** C4 requires technology on every container */
  | 'missing_technology'
  /** members claim more than one repo — a container cannot straddle systems */
  | 'spans_repos'
  /** a store whose storage kind was never decided */
  | 'store_unclassified'
  /** external with no resolvable identity */
  | 'external_unidentified'
  /** a runtime component with no process at all */
  | 'unassigned';

/** Construct that executes at runtime, i.e. can be a deployable unit's code. */
const RUNTIME_CONSTRUCTS = new Set(['function', 'class', 'custom_entity']);

/** The fields `deriveConcerns` reads off a component. Structural on purpose:
 *  it accepts a real `SubsystemComponent` as well as a hand-built literal.
 *  `declaration` is the full construct-declaration union, so a component
 *  passes straight through without the caller reshaping it. */
export interface C4MemberView {
  alias: string;
  construct: string;
  purl: string;
  process?: string;
  framework?: string;
  declaration?: unknown;
}

/** A store's declared storage kind, or undefined when it never declared one. */
function storageOf(m: C4MemberView): string | undefined {
  const d = m.declaration as { kind?: string; storage?: string } | undefined;
  return d?.kind === 'store' ? d.storage : undefined;
}

/**
 * Derive the questions worth asking about one container key.
 *
 * Pure over the rollup, so it runs identically against a single model, the 40
 * composed models, or a fixture.
 */
export function deriveConcerns(
  key: string,
  members: readonly C4MemberView[],
  tech: { frameworks: readonly string[] } = { frameworks: [] },
): C4AssociationReason[] {
  const out: C4AssociationReason[] = [];
  const aliases = members.map((m) => m.alias);
  const runtime = members.filter((m) => RUNTIME_CONSTRUCTS.has(m.construct));

  if (members.length === 1) {
    out.push({
      target: key,
      kind: 'singleton',
      message: `process "${key}" has exactly one member (${aliases[0]}) — a lone function is not a deployable unit`,
      members: aliases,
    });
  }

  // No member executes at runtime ⇒ this cannot be a deployable unit,
  // regardless of how many members it has. A lone interface and a package of
  // interfaces fail the same way.
  if (members.length > 0 && runtime.length === 0) {
    out.push({
      target: key,
      kind: 'library_shaped',
      message: `process "${key}" has ${members.length} member(s) but none execute at runtime (${[...new Set(members.map((m) => m.construct))].join(', ')}) — this reads as a library, not a container`,
      members: aliases,
    });
  }

  if (runtime.length > 0 && tech.frameworks.length === 0) {
    out.push({
      target: key,
      kind: 'missing_technology',
      message: `container "${key}" has no framework signal — C4 requires a technology on every container`,
      members: aliases,
    });
  }

  const repos = new Set(members.map((m) => (m.purl ?? '').split('#')[0]).filter((r) => r && !r.startsWith('external:')));
  if (repos.size > 1) {
    out.push({
      target: key,
      kind: 'spans_repos',
      message: `process "${key}" spans ${repos.size} repo keys (${[...repos].join(', ')}) — a C4 container cannot straddle a system boundary`,
      members: aliases,
    });
  }

  const stores = members.filter((m) => m.construct === 'store');
  const unclassified = stores.filter((m) => !storageOf(m));
  if (unclassified.length > 0) {
    out.push({
      target: key,
      kind: 'store_unclassified',
      message: `${unclassified.length} store(s) in "${key}" declare no storage kind (${unclassified.map((m) => m.alias).join(', ')}) — decide whether each is a C4 data store or an internal detail`,
      members: unclassified.map((m) => m.alias),
    });
  }

  return out;
}

/**
 * Suggest merges between container keys that share a trailing role.
 *
 * `subsystems-studio/host` and `principal-studio/host` are the same role under
 * two app names. This is a *suggestion*, never a merge — the whole question is
 * whether they are one process or two, and only the user knows.
 */
export function suggestMerges(
  rollup: ReadonlyArray<{ key: string; memberCount: number }>,
): Array<{ role: string; keys: string[]; reason: string }> {
  const byRole = new Map<string, string[]>();
  for (const { key } of rollup) {
    const slash = key.lastIndexOf('/');
    if (slash <= 0) continue; // a bare key has no app/role shape
    const role = key.slice(slash + 1);
    const list = byRole.get(role) ?? [];
    list.push(key);
    byRole.set(role, list);
  }
  const out: Array<{ role: string; keys: string[]; reason: string }> = [];
  for (const [role, keys] of [...byRole].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (keys.length < 2) continue;
    out.push({
      role,
      keys: [...keys].sort(),
      reason: `${keys.length} process keys end in "/${role}" (${keys.sort().join(', ')}) — one deployable unit under two names, or two units?`,
    });
  }
  return out;
}

/**
 * Compose a suggested association set from a derived rollup.
 *
 * This is the agent's starting point: every derived key becomes one proposed
 * association, shaped by the mechanical evidence. Nothing here is accepted —
 * `buildAssociations` is a convenience for authoring, not an oracle.
 */
export function buildAssociations(
  options: {
    repoKey: string;
    rollup: ReadonlyArray<{
      key: string;
      members: readonly C4MemberView[];
      frameworks: readonly string[];
    }>;
    /** Merges a person has already decided on: groups of keys → one id. */
    merges?: ReadonlyArray<{ id: string; keys: string[] }>;
    author?: string;
  },
): C4AssociationSet {
  const merged = new Map<string, string>();
  for (const m of options.merges ?? []) {
    for (const k of m.keys) merged.set(k, m.id);
  }

  const byId = new Map<string, C4Association>();
  for (const entry of options.rollup) {
    const assocId = merged.get(entry.key);
    const id = assocId ?? `container:${entry.key}`;
    const concerns = deriveConcerns(entry.key, entry.members, { frameworks: entry.frameworks });
    const hasStore = entry.members.some((m) => m.construct === 'store');
    const tech = entry.frameworks.length > 0 ? entry.frameworks.join(' + ') : undefined;

    const existing = byId.get(id);
    if (existing) {
      // Folded into an existing merge group — keep one element, add the key.
      if (!existing.sourceKeys.includes(entry.key)) existing.sourceKeys.push(entry.key);
      continue;
    }

    byId.set(id, {
      id,
      level: 'container',
      sourceKeys: [entry.key],
      label: entry.key,
      type: inferType(entry.members, concerns),
      technology: tech,
      state: 'proposed',
      rationale: concerns.map((c) => c.message).join(' ') || undefined,
      author: options.author,
    });
    void hasStore;
  }

  return {
    repoKey: options.repoKey,
    associations: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/**
 * How much evidence backs one association.
 *
 * Computed from the rollup rather than stored, so it never goes stale as
 * models change. Used to pick the survivor of a merge.
 */
export function associationWeight(
  a: C4Association,
  memberCount: ReadonlyMap<string, number>,
): number {
  let n = 0;
  for (const k of a.sourceKeys) n += memberCount.get(k) ?? 0;
  return n;
}

/** Best mechanical guess at a C4 element type, from the evidence available. */
function inferType(
  members: readonly C4MemberView[],
  concerns: readonly C4AssociationReason[],
): C4ElementType {
  if (concerns.some((c) => c.kind === 'library_shaped')) return 'library';
  const stores = members.filter((m) => m.construct === 'store');
  if (stores.length > 0) {
    // Only call it a data store when the storage kind says so; otherwise the
    // store may just be an in-memory detail of the application.
    const persists = stores.some((m) => storageOf(m) === 'external' || storageOf(m) === 'disk');
    return persists ? 'data-store' : 'application';
  }
  return 'application';
}

/**
 * Fold a decided merge into an association set.
 *
 * Two derived keys that are really one container have to become ONE
 * association claiming BOTH keys — not two associations, and not one
 * association whose key was rewritten to the other's id. `toC4` collapses a
 * box per association id, so a key must stay a key all the way through or the
 * merge silently does nothing.
 *
 * ## Which side survives
 *
 * The **largest** side wins, not the caller's choice. `subsystems-studio/host`
 * holds 113 components and `principal-studio/host` holds 1; folding the big
 * one into the small one would leave the box labelled after an almost-empty
 * process and lose its confirmed technology. Merging is a dedup, so the
 * survivor should be the one carrying the evidence.
 *
 * Returns a new set; the input is untouched. Idempotent: merging an already
 * merged set changes nothing.
 */
export function mergeAssociations(
  associations: readonly C4Association[],
  keys: readonly string[],
  /**
   * Optional caller override — skip it to get the evidence-driven default.
   */
  preferKey?: string,
  /**
   * Components per derived key, from the rollup. This is what decides the
   * survivor when every side claims a single key, which is the common case:
   * `subsystems-studio/host` and `principal-studio/host` each hold exactly one
   * derived key, so key count cannot break the tie.
   */
  memberCount?: ReadonlyMap<string, number>,
): C4Association[] {
  const wanted = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
  if (wanted.length < 2) return [...associations];

  const involved = associations.filter((a) => a.sourceKeys.some((k) => wanted.includes(k)));
  if (involved.length < 2) return [...associations];

  const survivor =
    (preferKey ? involved.find((a) => a.sourceKeys.includes(preferKey.trim())) : undefined) ??
    [...involved].sort((a, b) => {
      const wa = associationWeight(a, memberCount ?? new Map());
      const wb = associationWeight(b, memberCount ?? new Map());
      if (wa !== wb) return wb - wa;
      // No evidence either way: stable, and least surprising.
      return a.id.localeCompare(b.id);
    })[0]!;

  const absorbed = involved.filter((a) => a.id !== survivor.id);
  const absorbedIds = new Set(absorbed.map((a) => a.id));

  const merged: C4Association = {
    ...survivor,
    sourceKeys: [...new Set([...survivor.sourceKeys, ...absorbed.flatMap((a) => a.sourceKeys)])].sort(),
    rationale:
      [survivor.rationale, ...absorbed.map((a) => a.rationale)].filter(Boolean).join(' | ') || undefined,
  };

  return [...associations.filter((a) => !absorbedIds.has(a.id) && a.id !== survivor.id), merged].sort(
    (a, b) => a.id.localeCompare(b.id),
  );
}

/** Summary counts for the confirm UI: how much is proposed vs accepted. */
export function summarizeAssociations(
  model: C4Model,
  associations: readonly C4Association[],
): {
  confirmed: number;
  proposed: number;
  rejected: number;
  mergedAway: number;
  missingTechnology: number;
  needsDecision: number;
} {
  const accepted = associations.filter((a) => a.state === 'accepted');
  const proposed = associations.filter((a) => a.state === 'proposed');
  const rejected = associations.filter((a) => a.state === 'rejected');
  const confirmedIds = new Set(accepted.map((a) => a.id));
  const mergedAway = accepted.reduce((n, a) => n + (a.sourceKeys.length - 1), 0);

  // A raw derived key with no association is unconfirmed, not wrong.
  const derivedKeys = new Set<string>();
  for (const n of model.nodes) if (n.kind === 'container') derivedKeys.add(n.key ?? n.id);
  const unconfirmed = [...derivedKeys].filter((k) => ![...confirmedIds].some((id) => associations.find((a) => a.id === id)?.sourceKeys.includes(k))).length;

  const missingTechnology = model.nodes.filter((n) => n.kind === 'container' && !n.decoration?.technology).length;

  return {
    confirmed: accepted.length,
    proposed: proposed.length,
    rejected: rejected.length,
    mergedAway,
    missingTechnology,
    needsDecision: proposed.length + unconfirmed,
  };
}