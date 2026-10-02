/**
 * toC4 — project a subsystem-model (or a composition of them) onto C4 levels.
 *
 * The stored document is flat: `components[]` carry `process` (runtime unit),
 * `purl` (repo/package), `construct`, `role`, `module`, plus `trails[]`
 * (dynamic). C4 wants a hierarchy above the
 * component — system → container → component — with externals and actors
 * outside it. This module derives that hierarchy without inventing data:
 *
 *   system     ← the repo key (purlRepoKey of the first grounded component)
 *   container  ← component.process            (runtime/deployment boundary)
 *   component  ← a grounded component
 *   external   ← construct: 'external'
 *   actor      ← construct: 'custom_entity'   (their authored actor/entity)
 *
 * Edges are rolled up to the owner of each endpoint at the chosen view, so the
 * container view shows container↔container collaborations and the component
 * view shows component↔component ones. Intra-owner edges (from === to) drop.
 *
 * Pure over the document so it is unit-testable and reusable by any renderer.
 */

import type { SubsystemComponent, SubsystemModelDocument } from './model';

/** C4 levels plus the two "outside the system" concepts. */
export type C4Kind = 'system' | 'container' | 'component' | 'external' | 'actor';

/** Which projection to build: containers (level 2) or components (level 3). */
export type C4View = 'container' | 'component';

/** A C4 element the renderer can draw as a box. */
export interface C4Node {
  id: string;
  kind: C4Kind;
  label: string;
  /** Compound parent (container → system, component → container). */
  parentId?: string;
  /** Grouping key the node was derived from (process key, purl, alias). */
  key?: string;
  /**
   * Every derived key folded into this node, when one association claims more
   * than one. Present only on a merged box — a node built from a single key
   * leaves it undefined and `key` tells the whole story.
   */
  sourceKeys?: string[];
  /** Source component aliases rolled into this node. */
  members: string[];
  /** Distinct constructs among the members (for a quick breakdown). */
  constructs: string[];
  /** True when any member is a `store` construct (a data store in C4). */
  isStore: boolean;
  /** Present only in the component view — the backing component. */
  component?: SubsystemComponent;
  /** Source model ids that contributed members, when attribution is supplied. */
  models?: string[];
  /**
   * Confirmed C4 attributes, supplied by a decoration. Absent for the raw
   * derivation — a bare `toC4(doc)` proposes nothing and confirms nothing.
   */
  decoration?: C4Decoration;
}

/**
 * The C4 attributes a reviewer (or an agent they approve) attaches to one
 * derived box. This is the seam between "the models said X" and "a person
 * agreed X is a container with technology Y".
 */
export interface C4Decoration {
  /** Identity of the confirmed element. Replaces the derived node id, which is
   *  what makes two derived keys able to collapse into one box. */
  id: string;
  /** Display name. Defaults to the grouping key. */
  label?: string;
  /** C4 element type — required by the notation, absent from the document. */
  type?: C4ElementType;
  /** C4 "technology" — required on every container by the notation. */
  technology?: string;
  /** One-line responsibility. Derivable from member `purpose`. */
  description?: string;
  /** Has a person looked at this yet? */
  state?: C4AssociationState;
  /** Override the nesting parent (container id) for a component-level element. */
  parentId?: string;
}

/**
 * C4 element type — the shape of the box.
 *
 * The document has no field for this: `construct` says what a *declaration* is
 * (function / store / external), not what an *element* is. c4model.com requires
 * a type on every element, so this is something the projection has to supply
 * or the reviewer has to confirm.
 */
export type C4ElementType =
  /** a deployable unit — web app, server, CLI, desktop app */
  | 'application'
  /** a database, file store, or blob store */
  | 'data-store'
  /** a queue or topic */
  | 'queue'
  /** a JAR / assembly / npm package: organised *within* a container, not one */
  | 'library'
  /** another software system, outside our boundary */
  | 'software-system'
  /** a human */
  | 'person';

/** A compound frame (the system, or a container holding components). */
export interface C4Group {
  id: string;
  kind: 'system' | 'container';
  label: string;
  parentId?: string;
  /** Member C4 node ids (or nested group ids for the system). */
  memberIds: string[];
}

/** A rolled-up collaboration — a trail flow between owners. */
export interface C4Edge {
  id: string;
  source: string;
  target: string;
  kind: 'flow';
  label: string;
  mechanisms: string[];
  count: number;
}

export interface C4Model {
  view: C4View;
  system: C4Node;
  nodes: C4Node[];
  groups: C4Group[];
  edges: C4Edge[];
}

/**
 * Has anyone signed off on this element yet?
 *
 * `proposed` is what an agent writes and a human has not looked at. `accepted`
 * is a human decision. `rejected` means the derivation was wrong and the box
 * should not be drawn at all — the one state that removes a node.
 */
export type C4AssociationState = 'proposed' | 'accepted' | 'rejected';

/**
 * One confirmed C4 element: a container or component a person (or an agent a
 * person approved) has said is a real element of the architecture.
 *
 * This lives OUTSIDE the subsystem model document on purpose. The document
 * describes code — what a symbol is and where it runs. Whether two of those
 * runs are one deployable unit is a different, revisable claim about the
 * architecture, and writing it back would mean the next audit had to defend it.
 */
export interface C4Association {
  /** Stable identity for this element: `container:<slug>`. Survives renames. */
  id: string;
  /** What C4 level this is. Determines where it is drawn. */
  level: 'container' | 'component';
  /**
   * The derived keys this element absorbs. One key in the common case; more
   * than one when several `process` values are really the same deployable.
   * This is the whole dedup mechanism: merging is claiming several keys under
   * one id, so the rollup below collapses them into a single box for free.
   */
  sourceKeys: string[];
  label: string;
  /** C4 requires a type on every element. */
  type: C4ElementType;
  /** C4 requires technology on every container. */
  technology?: string;
  /** C4 requires a description on every element. */
  description?: string;
  state: C4AssociationState;
  /** Why the association says what it says — shown in the confirm UI. */
  rationale?: string;
  /** Who or what authored this association. */
  author?: string;
  /** When the state last changed (ISO). */
  decidedAt?: string;
}

export interface ToC4Options {
  view?: C4View;
  /** Override the system title; defaults to the repo key's owner/name. */
  systemLabel?: string;
  /** Override the repo key used for the system id. */
  repoKey?: string;
  /** Model-id attribution per component alias (e.g. from a merge sidecar). */
  modelsByAlias?: Record<string, string[]>;
  /**
   * Confirmed elements. When supplied, a derived key claimed by an
   * `accepted` association is drawn as that association's box instead of as a
   * raw key, and a `rejected` one is not drawn at all.
   */
  associations?: readonly C4Association[];
}

const EXTERNAL_PURL = 'external';
const UNASSIGNED = '(unassigned)';

/** A code component (not an external, not an actor/entity). */
export function isGroundedComponent(c: SubsystemComponent): boolean {
  return c.construct !== 'external' && c.construct !== 'custom_entity';
}

/**
 * Index confirmed associations by the derived keys they claim.
 *
 * First writer wins on a contested key so the result does not depend on array
 * order, and the loser is reported so the conflict is visible rather than
 * silently dropped.
 */
export function indexAssociations(
  associations: readonly C4Association[] | undefined,
): {
  byKey: Map<string, C4Association>;
  contested: Array<{ key: string; kept: string; dropped: string }>;
} {
  const byKey = new Map<string, C4Association>();
  const contested: Array<{ key: string; kept: string; dropped: string }> = [];
  if (!associations) return { byKey, contested };

  // Stable order: accepted before proposed, so a confirmed decision outranks a
  // speculative one for the same key.
  const ordered = [...associations].sort((a, b) => {
    const rank = (s: C4AssociationState) => (s === 'accepted' ? 0 : s === 'proposed' ? 1 : 2);
    return rank(a.state) - rank(b.state) || a.id.localeCompare(b.id);
  });

  for (const a of ordered) {
    for (const key of a.sourceKeys) {
      const existing = byKey.get(key);
      if (existing && existing.id !== a.id) {
        contested.push({ key, kept: existing.id, dropped: a.id });
        continue;
      }
      byKey.set(key, a);
    }
  }
  return { byKey, contested };
}

/** True when a resolved association means this box should not be drawn. */
function isSuppressed(a: C4Association | undefined): boolean {
  return a?.state === 'rejected';
}

/** `owner/name` from a purl, trimmed of scheme and fragment. */
export function labelFromPurl(purl: string): string {
  const base = purl.replace(/^external:/, '').split('#')[0]?.trim() ?? '';
  const parts = base.split('/').filter(Boolean);
  return parts.slice(-2).join('/') || base || purl;
}

/** The repo key the system is derived from: first grounded component's purl. */
export function deriveRepoKey(doc: SubsystemModelDocument): string | undefined {
  for (const c of doc.components) {
    const p = (c.purl ?? '').split('#')[0]?.trim();
    if (p && p !== EXTERNAL_PURL && !p.startsWith('external:')) return p;
  }
  return undefined;
}

/** Stable identity for an external: its real purl, else the model-local alias. */
function externalKey(c: SubsystemComponent): string {
  const purl = (c.purl ?? '').trim();
  if (purl && purl !== EXTERNAL_PURL && purl !== 'external:proposed') return purl;
  return `alias:${c.alias}`;
}

function containerKey(c: SubsystemComponent): string {
  return c.process?.trim() || UNASSIGNED;
}

/**
 * Derive the C4 projection of a (possibly composed) subsystem document.
 *
 * @param doc - a portable document, or a composed one with canonical aliases.
 * @param options - view + optional system naming + attribution.
 */
export function toC4(doc: SubsystemModelDocument, options: ToC4Options = {}): C4Model {
  const view: C4View = options.view ?? 'container';
  const repoKey = options.repoKey ?? deriveRepoKey(doc) ?? 'system';
  const systemId = `system:${repoKey}`;
  const { byKey: assocByKey } = indexAssociations(options.associations);
  // Id -> association, so a container frame can be labelled from its
  // association even when no node exists for it (component view).
  const assocById = new Map<string, C4Association>();
  for (const a of options.associations ?? []) assocById.set(a.id, a);

  const system: C4Node = {
    id: systemId,
    kind: 'system',
    label: options.systemLabel ?? labelFromPurl(repoKey),
    key: repoKey,
    members: [],
    constructs: [],
    isStore: false,
  };

  const nodes = new Map<string, C4Node>();
  const ownerOf = new Map<string, string>();

  const containerNodeId = (key: string) => `container:${key}`;
  const componentNodeId = (alias: string) => `component:${alias}`;

  /**
   * Resolve one derived container key into the box that should carry it.
   *
   * An accepted association wins: its id becomes the node id, so every key it
   * claims rolls into one node (that is the dedup), and its label / type /
   * technology / description become the node's presentation. A rejected one
   * means the box is not drawn at all. Unclaimed keys keep the raw derived
   * behaviour, so the projection is still useful with zero associations.
   */
  const resolveContainer = (key: string): { id: string; label: string; assoc: C4Association | undefined } => {
    const assoc = assocByKey.get(key);
    if (assoc && assoc.level === 'container') {
      return { id: assoc.id, label: assoc.label, assoc };
    }
    if (view === 'component') {
      return { id: containerNodeId(key), label: key === UNASSIGNED ? 'Unassigned' : key, assoc: undefined };
    }
    return { id: containerNodeId(key), label: key === UNASSIGNED ? 'Unassigned' : key, assoc: undefined };
  };

  for (const c of doc.components) {
    let id: string;
    let kind: C4Kind;
    let label: string;
    let parentId: string | undefined;
    let key: string | undefined;
    let assoc: C4Association | undefined;

    if (c.construct === 'external') {
      key = externalKey(c);
      id = `external:${key}`;
      kind = 'external';
      label = key.startsWith('alias:') ? c.name : labelFromPurl(key);
    } else if (c.construct === 'custom_entity') {
      key = c.alias;
      id = `actor:${c.alias}`;
      kind = 'actor';
      label = c.name;
    } else if (view === 'component') {
      key = containerKey(c);
      const resolved = resolveContainer(key);
      if (isSuppressed(resolved.assoc)) continue;
      id = componentNodeId(c.alias);
      kind = 'component';
      label = c.name;
      parentId = resolved.id;
      assoc = undefined; // the component itself has no association
    } else {
      key = containerKey(c);
      const resolved = resolveContainer(key);
      if (isSuppressed(resolved.assoc)) continue;
      id = resolved.id;
      kind = 'container';
      label = resolved.label;
      parentId = systemId;
      assoc = resolved.assoc;
    }

    ownerOf.set(c.alias, id);

    let node = nodes.get(id);
    if (!node) {
      node = {
        id,
        kind,
        label,
        parentId,
        key,
        members: [],
        constructs: [],
        isStore: false,
        // A merged box is built from several derived keys. Track them as a
        // set so the confirm UI can show what was folded together — without
        // this, the accumulation would run once per member, not per key.
        ...(assoc && assoc.sourceKeys.length > 1 ? { sourceKeys: [...assoc.sourceKeys] } : {}),
        ...(kind === 'component' ? { component: c } : {}),
        ...(assoc ? { decoration: toDecoration(assoc) } : {}),
      };
      nodes.set(id, node);
    }
    node.members.push(c.alias);
    if (!node.constructs.includes(c.construct)) node.constructs.push(c.construct);
    if (c.construct === 'store') node.isStore = true;
    const models = options.modelsByAlias?.[c.alias];
    if (models && models.length > 0) {
      node.models = [...new Set([...(node.models ?? []), ...models])];
    }
  }

  // --- Groups (compound frames) ------------------------------------------
  const groups: C4Group[] = [];
  const labelForContainerId = (id: string): string =>
    nodes.get(id)?.label ??
    assocById.get(id)?.label ??
    (id.startsWith('container:') ? id.slice('container:'.length) : id);
  if (view === 'container') {
    const containerIds = [...nodes.values()].filter((n) => n.kind === 'container').map((n) => n.id);
    if (containerIds.length > 0) {
      groups.push({ id: systemId, kind: 'system', label: system.label, memberIds: containerIds });
    }
  } else {
    const byContainer = new Map<string, string[]>();
    for (const n of nodes.values()) {
      if (n.kind !== 'component' || !n.parentId) continue;
      const list = byContainer.get(n.parentId) ?? [];
      list.push(n.id);
      byContainer.set(n.parentId, list);
    }
    const containerIds: string[] = [];
    for (const [id, memberIds] of byContainer) {
      groups.push({ id, kind: 'container', label: labelForContainerId(id), parentId: systemId, memberIds });
      containerIds.push(id);
    }
    if (containerIds.length > 0) {
      groups.push({ id: systemId, kind: 'system', label: system.label, memberIds: containerIds });
    }
  }

  // --- Edges: roll each endpoint up to its owner at this view -------------
  const flowEdges = new Map<string, C4Edge>();

  const addEdge = (
    bucket: Map<string, C4Edge>,
    source: string | undefined,
    target: string | undefined,
    kind: C4Edge['kind'],
    mechanism: string,
  ) => {
    if (!source || !target || source === target) return;
    // An endpoint whose box was rejected has no owner; the edge cannot be
    // drawn, so drop it rather than inventing a dangling arrow.
    if (!nodes.has(source) || !nodes.has(target)) return;
    const key = `${source}\0${target}`;
    let edge = bucket.get(key);
    if (!edge) {
      edge = { id: `${kind}:${key}`, source, target, kind, label: '', mechanisms: [], count: 0 };
      bucket.set(key, edge);
    }
    edge.count += 1;
    if (!edge.mechanisms.includes(mechanism)) edge.mechanisms.push(mechanism);
  };

  for (const w of doc.trails ?? []) {
    for (const s of w.steps ?? []) {
      addEdge(flowEdges, ownerOf.get(s.from), ownerOf.get(s.to), 'flow', s.mechanism);
    }
  }

  const edges = [...flowEdges.values()];
  for (const e of edges) e.label = [...e.mechanisms].sort().join(' + ');

  return {
    view,
    system,
    nodes: [...nodes.values()].filter((n) => n.kind !== 'system'),
    groups,
    edges,
  };
}

/** Project an association down to the attributes a node carries. */
function toDecoration(a: C4Association): C4Decoration {
  return {
    id: a.id,
    label: a.label,
    type: a.type,
    technology: a.technology,
    description: a.description,
    state: a.state,
  };
}
