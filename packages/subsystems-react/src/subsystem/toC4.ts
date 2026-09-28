/**
 * toC4 — project a subsystem-model (or a composition of them) onto C4 levels.
 *
 * The stored document is flat: `components[]` carry `process` (runtime unit),
 * `purl` (repo/package), `construct`, `role`, `module`, plus `relations[]`
 * (static) and `walkthroughs[]` (dynamic). C4 wants a hierarchy above the
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
}

/** A compound frame (the system, or a container holding components). */
export interface C4Group {
  id: string;
  kind: 'system' | 'container';
  label: string;
  parentId?: string;
  /** Member C4 node ids (or nested group ids for the system). */
  memberIds: string[];
}

/** A rolled-up collaboration. `relationship` = static, `flow` = walkthrough. */
export interface C4Edge {
  id: string;
  source: string;
  target: string;
  kind: 'relationship' | 'flow';
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

export interface ToC4Options {
  view?: C4View;
  /** Override the system title; defaults to the repo key's owner/name. */
  systemLabel?: string;
  /** Override the repo key used for the system id. */
  repoKey?: string;
  /** Model-id attribution per component alias (e.g. from a merge sidecar). */
  modelsByAlias?: Record<string, string[]>;
}

const EXTERNAL_PURL = 'external';
const UNASSIGNED = '(unassigned)';

/** A code component (not an external, not an actor/entity). */
export function isGroundedComponent(c: SubsystemComponent): boolean {
  return c.construct !== 'external' && c.construct !== 'custom_entity';
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

  for (const c of doc.components) {
    let id: string;
    let kind: C4Kind;
    let label: string;
    let parentId: string | undefined;
    let key: string | undefined;

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
      id = componentNodeId(c.alias);
      kind = 'component';
      label = c.name;
      parentId = containerNodeId(key);
    } else {
      key = containerKey(c);
      id = containerNodeId(key);
      kind = 'container';
      label = key === UNASSIGNED ? 'Unassigned' : key;
      parentId = systemId;
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
        ...(kind === 'component' ? { component: c } : {}),
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
      const label = id.slice('container:'.length);
      groups.push({ id, kind: 'container', label: label === UNASSIGNED ? 'Unassigned' : label, parentId: systemId, memberIds });
      containerIds.push(id);
    }
    if (containerIds.length > 0) {
      groups.push({ id: systemId, kind: 'system', label: system.label, memberIds: containerIds });
    }
  }

  // --- Edges: roll each endpoint up to its owner at this view -------------
  const relEdges = new Map<string, C4Edge>();
  const flowEdges = new Map<string, C4Edge>();

  const addEdge = (
    bucket: Map<string, C4Edge>,
    source: string | undefined,
    target: string | undefined,
    kind: C4Edge['kind'],
    mechanism: string,
  ) => {
    if (!source || !target || source === target) return;
    const key = `${source}\0${target}`;
    let edge = bucket.get(key);
    if (!edge) {
      edge = { id: `${kind}:${key}`, source, target, kind, label: '', mechanisms: [], count: 0 };
      bucket.set(key, edge);
    }
    edge.count += 1;
    if (!edge.mechanisms.includes(mechanism)) edge.mechanisms.push(mechanism);
  };

  for (const r of doc.relations ?? []) {
    addEdge(relEdges, ownerOf.get(r.from), ownerOf.get(r.to), 'relationship', r.relationType);
  }
  for (const w of doc.walkthroughs ?? []) {
    for (const s of w.steps ?? []) {
      addEdge(flowEdges, ownerOf.get(s.from), ownerOf.get(s.to), 'flow', s.mechanism);
    }
  }

  const edges = [...relEdges.values(), ...flowEdges.values()];
  for (const e of edges) e.label = [...e.mechanisms].sort().join(' + ');

  return {
    view,
    system,
    nodes: [...nodes.values()].filter((n) => n.kind !== 'system'),
    groups,
    edges,
  };
}
