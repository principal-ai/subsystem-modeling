/**
 * Subsystem component-graph data model + converters.
 *
 * A subsystem snapshot (see the "Subsystem artifact: facets" topic) is captured
 * as component nodes (construct-tagged source units), file refs, integration edges,
 * and entry points. This module defines the minimal document shape for the
 * *graph* facet and converts it to React Flow nodes/edges — packages render as
 * subgraphs, only cross-package edges leave the box, and shared seams
 * (registries/barrels/facades) are edge targets, never member nodes.
 *
 * Self-contained in this package (not yet promoted to `@principal-ai/core`), so
 * we can iterate on the UI + story without publishing a dependency.
 */

import {
  MarkerType,
  type Edge,
  type Node,
} from '@xyflow/react';
import { computeElkLayout, calculatePathLength } from '../utils/elkLayout';
import type { GraphifyComponentDetail } from '../graphify';
import type { SubsystemDeclarationRef } from './declarationRef';
import { purlOwnerName, purlRepoKey } from './paths';

/** Structured declaration shape — same union as graphify drill-down payloads. */
export type SubsystemConstructDeclaration = GraphifyComponentDetail;
export type SubsystemDeclarationProvenance = 'verified' | 'authored';

export type SubsystemComponentConstruct =
  | 'class'
  | 'function'
  | 'method'
  | 'interface'
  | 'type_alias'
  | 'enum'
  | 'store'
  | 'external'
  | 'custom_entity';

/**
 * Semantic role — where the node sits in the topology, orthogonal to
 * `construct` (what it is). Roles have *inherited* anatomy: an entry renders
 * as its real code shape (function dispatcher, type contract); a service has
 * no source at all (`construct: 'external'` + purl identity). Contrast with
 * `construct: 'store'`, which introduces its own anatomy (the state block) —
 * that is why store is a construct and not a role. Role nodes must stay anchored to real code: an
 * `entry` is a boundary element (route dispatcher, message contract) carrying
 * the wire address as identity; a `service` is an external system the process
 * calls out to (identity via purl, no `process` — it belongs to no region).
 */
export type SubsystemComponentRole = 'entry' | 'service';

/**
 * Framework that owns a stereotype vocabulary (open string).
 * Examples: `react`, `vue`, `nestjs`, `django`, `spring`.
 * Empty when the node is language-only / framework-agnostic.
 */
export type SubsystemFramework = string;

/**
 * Framework-level pattern stamped on a language construct (open string).
 * Examples: `component`, `hook`, `middleware`, `controller`, `guard`.
 * Empty when no framework pattern applies. Pair with `framework` when set —
 * a React component stays `construct: 'function'` with
 * `framework: 'react'` + `stereotype: 'component'`.
 */
export type SubsystemStereotype = string;

// ---------------------------------------------------------------------------
// Declaration tokens — structured source representation
// ---------------------------------------------------------------------------

export type SubsystemDeclTokenKind =
  | 'keyword'
  | 'name'
  | 'member'
  | 'type'
  | 'punctuation'
  | 'string'
  | 'newline';

export interface SubsystemDeclToken {
  text: string;
  kind: SubsystemDeclTokenKind;
  /** Shiki/Pierre foreground when tokenized client-side; omitted on legacy wire tokens. */
  color?: string;
}

/**
 * Topology relation type — structural / module / type claims.
 * Belongs on `relations[]`, not on walkthrough hops.
 */
export type SubsystemRelationType =
  | 'extends'
  | 'inherits'
  | 'implements'
  | 'mixes_in'
  | 'method'
  | 'references';

/**
 * Walkthrough hop mechanism — runtime seams with a `file:line` site.
 */
export type SubsystemWalkthroughMechanism =
  | 'calls'
  | 'uses'
  | 'feeds'
  | 'produces'
  | 'writes'
  | 'reads'
  | 'watches'
  | 'registers-into';

/** Union for derived graph-edge styling (relationType or hop mechanism). */
export type SubsystemEdgeMechanism =
  | SubsystemRelationType
  | SubsystemWalkthroughMechanism;

/**
 * Which edge vocabulary the canvas draws. The two vocabularies are disjoint;
 * a view shows only edges (and their labels) from the selected source.
 * - `relations`: only topology relation edges (`extends`, `implements`, …)
 * - `walkthroughs`: only walkthrough hop edges (`calls`, `feeds`, …)
 */
export type SubsystemEdgeView = 'relations' | 'walkthroughs';

/** A component node — the named unit, construct-tagged; `file` is its location. */
export interface SubsystemComponent {
  /**
   * Model-local stable alias, unique per model. Referenced by relation /
   * walkthrough `from` / `to`; edges point at the alias, not the location.
   * Code identity (for composed multi-model views) lives on
   * `purl` + `file` + `symbol`, not here.
   */
  alias: string;
  name: string;
  /**
   * The node's construct — what it IS as a declaration (class, function,
   * method, interface, type alias, enum, store, external), driving node
   * anatomy, color, badge, and the verification strategy. Every construct
   * anchors to a definition; runtime occurrences (variables, activations,
   * instances) are NOT constructs — they belong to a future execution-mode
   * graph whose occurrence nodes reference these definitions. Ontology:
   * construct = what it is, framework + stereotype = which framework pattern
   * it plays, role = where it sits, process = where it runs. Prefer
   * `framework` + `stereotype` over inventing framework-specific constructs
   * (a React component is still `construct: 'function'`).
   */
  construct: SubsystemComponentConstruct;
  /** Source location the component lives in (repo-root-relative path). */
  file: string;
  /** PURL identifying the repo or package this component lives in (for subgraph grouping). */
  purl: string;
  /**
   * App/repo logo shown on the declaration card in place of the GitHub owner
   * avatar (any image URL or data URI). Optional; typically one image stamped
   * across the components of a repo.
   */
  logo?: string;
  /** One-line purpose shown on the node. */
  purpose?: string;
  /**
   * Design / migration placeholder — participates in edges and flows but is
   * not a live source declaration yet. Verification skips source checks until
   * promoted (`proposed` cleared, `file` + `symbol` filled). Orthogonal to
   * `construct` (intended shape) and `role` (topology).
   */
  proposed?: boolean;
  /**
   * Semantic role — where the node sits in the topology (boundary element,
   * external system), orthogonal to `construct` (what it is). Drives the
   * glyph and the edge-pairing rules: boundary-crossing edges must terminate
   * at an entry or a service. Retained state is NOT a role — it is
   * `construct: 'store'` (state-block anatomy, `writes`/`reads`/`watches`
   * inbound, `produces` outbound).
   */
  role?: SubsystemComponentRole;
  /**
   * Framework that owns the stereotype vocabulary (e.g. `react`, `nestjs`).
   * Orthogonal to `construct` — leave empty for language-only units.
   */
  framework?: SubsystemFramework;
  /**
   * Framework pattern this declaration plays (e.g. `component`, `hook`).
   * When set, the node badge prefers this label over the construct name so
   * a React UI unit reads as "component" rather than "function".
   */
  stereotype?: SubsystemStereotype;
  /**
   * Open-string entity kind for `construct: 'custom_entity'` nodes — what the
   * actor/entity is (e.g. `Person`, `agent`, `queue`). Not code; there is no
   * graphify anchor. Contrast with `construct` (what the declaration is) and
   * `role` (where it sits topologically). Empty/unset for code constructs.
   */
  entityKind?: string;
  /**
   * Authored color override for the node border + badges, when the themed
   * construct color isn't wanted. Primarily for `construct: 'custom_entity'`
   * (an author picks a fitting hue for a Person/agent/queue) — but usable on
   * any construct. Any `#rrggbb` string; when set it wins over the
   * construct-derived color, mirrors in the declaration panel. Leave unset to
   * inherit the Pierre construct palette.
   */
  color?: string;
  /**
   * Runtime process membership — which deployment unit this node is a
   * member of (e.g. `principal-studio/host`, `principal-studio/renderer`). Nodes
   * sharing a `process` are drawn inside one boundary region; nodes without
   * one sit outside every process boundary (external actors, services,
   * libraries). Orthogonal to `module` (source-file frame).
   */
  process?: string;
  /**
   * Source-module membership — which file/module this export belongs to
   * (e.g. `src/session/transcript.ts`). Nodes sharing a `module` are drawn
   * inside one boundary frame. Prefer this over inventing a module construct:
   * each export keeps its real construct (`function` / `class` / …) and the
   * file reads as a frame. Orthogonal to `process` (runtime deployment).
   * When both are set, the module frame is the component's parent (finer
   * grain); process framing still groups siblings that share a process.
   */
  module?: string;
  /** A symbol this component exposes / is (the node's identity). */
  symbol?: string;
  /**
   * Semantic layer/phase for the layout (e.g. `1` = input, `2` = processing,
   * `3` = output). When set, ELK places the component in this layer so the
   * graph reads as a left-to-right pipeline and *conveys the idea* rather than
   * letting ELK guess the order.
   */
  layer?: number;
  /**
   * Structured declaration shape of the construct (params, members, type
   * buckets, …). Single source of truth for the click panel — authored by
   * agents/CLI or filled by verified graphify capture. Discriminated by kind.
   */
  declaration?: SubsystemConstructDeclaration;
  /**
   * Where the structured `declaration` came from. `verified` = extracted from
   * source by tooling (graphify AST, signature extraction) — may be trusted
   * as matching the code. `authored` = written by the authoring agent/human
   * to highlight specific inputs/outputs — informative, not checked against
   * source. Declaration without provenance is treated as `authored`; only
   * tooling may claim `verified`.
   */
  declarationProvenance?: SubsystemDeclarationProvenance;
  /**
   * Pre-tokenized declaration for the detail panel. When present, the
   * renderer skips client-side tokenization. Tokens are language-agnostic;
   * a different language just needs a different tokenizer and text joiner.
   */
  tokens?: SubsystemDeclToken[];
  /**
   * Anchored declaration location: graphify start line + hash of that line's
   * content at capture time. Populated by verify when an exact anchor resolves.
   */
  declarationRef?: SubsystemDeclarationRef;
}

/** A topology relation between components (structural / module / type). */
export interface SubsystemRelation {
  id: string;
  from: string;
  to: string;
  relationType: SubsystemRelationType;
  /** Concrete file/symbol refs backing the relation. */
  refs?: string[];
}

/**
 * Derived / display graph edge used by renderers. Built from `relations`
 * and/or walkthrough hops — not authored as its own document field.
 */
export interface SubsystemComponentEdge {
  id: string;
  from: string; // component alias
  to: string; // component alias or external target label
  mechanism: SubsystemEdgeMechanism;
  /** Concrete file/symbol refs backing the edge (the seam). */
  refs?: string[];
}

/**
 * A single runtime hop — `from`/`to`/`mechanism` plus the exact `file:line`
 * where that seam fires for a walkthrough.
 */
export interface SubsystemWalkthroughStep {
  from: string;
  to: string;
  mechanism: SubsystemWalkthroughMechanism;
  /** Repo-root-relative path of the file where the seam fires. */
  file: string;
  /** 1-based line of the site within `file`. */
  line: number;
  /**
   * File-anchored purl of the seam site (e.g.
   * `pkg:github/owner/name#path/to/file.ts`), mirroring component `purl`.
   * Required: readers resolve the checkout from this instead of guessing
   * the repo from the step's endpoint components.
   */
  purl: string;
  /**
   * Frame name for this hop — the function/method on the stack at the site.
   * Required; the Walkthroughs list shows this instead of a bare
   * mechanism + filename fallback.
   */
  symbol: string;
  /**
   * Free-text note anchored to this hop's site line. Optional — informative
   * only, never verified against source; the Pierre walkthrough code view
   * surfaces it in the annotation column next to the highlighted line.
   */
  annotation?: string;
}

/** An ordered runtime walkthrough — one named behavior story. */
export interface SubsystemWalkthrough {
  id: string;
  title: string;
  steps: SubsystemWalkthroughStep[];
}

export interface SubsystemModelDocument {
  components: SubsystemComponent[];
  /** Topology relations (structural / module / type). May be empty. */
  relations: SubsystemRelation[];
  /** Ordered runtime walkthroughs (one per named behavior). */
  walkthroughs?: SubsystemWalkthrough[];
}

/** Stable id for a derived graph edge from a relation or walkthrough hop. */
export function derivedGraphEdgeId(
  from: string,
  to: string,
  mechanism: SubsystemEdgeMechanism,
): string {
  return `${from}--${mechanism}-->${to}`;
}

/**
 * Build display edges for the graph canvas from topology relations and
 * walkthrough hops (deduped by from/to/mechanism).
 */
/** React Flow / canvas edge id for a walkthrough hop. */
export function walkthroughStepGraphEdgeId(
  step: Pick<SubsystemWalkthroughStep, 'from' | 'to' | 'mechanism'>,
): string {
  return derivedGraphEdgeId(step.from, step.to, step.mechanism);
}

/**
 * Move one walkthrough from `from` to `to`, returning a new array. Used by the
 * flows panel's drag-to-reorder: the array order is the walkthroughs' display
 * order, so a reorder is just an array splice. Out-of-range `from` returns a
 * shallow copy unchanged; `to` is clamped into range.
 */
export function reorderWalkthroughs(
  walkthroughs: readonly SubsystemWalkthrough[],
  from: number,
  to: number,
): SubsystemWalkthrough[] {
  const next = [...walkthroughs];
  if (!Number.isInteger(from) || from < 0 || from >= next.length) return next;
  const target = Math.max(0, Math.min(to, next.length - 1));
  if (target === from) return next;
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(target, 0, moved);
  return next;
}

/**
 * Final index for a drag-reorder given the insertion `boundary` (one of the
 * `n + 1` gaps between rows) and the dragged row's `from` index. Removing the
 * dragged row shifts every boundary after it down one, so a boundary past
 * `from` maps to `boundary - 1`. Feed the result to `reorderWalkthroughs` as
 * `to`; a result equal to `from` is a no-op.
 */
export function reorderTargetIndex(boundary: number, from: number): number {
  return boundary - (boundary > from ? 1 : 0);
}

export function deriveGraphEdges(doc: {
  relations?: readonly SubsystemRelation[];
  walkthroughs?: readonly SubsystemWalkthrough[];
}): SubsystemComponentEdge[] {
  const byId = new Map<string, SubsystemComponentEdge>();
  for (const r of doc.relations ?? []) {
    const id = r.id || derivedGraphEdgeId(r.from, r.to, r.relationType);
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        from: r.from,
        to: r.to,
        mechanism: r.relationType,
        refs: r.refs,
      });
    }
  }
  for (const w of doc.walkthroughs ?? []) {
    for (const step of w.steps) {
      const id = derivedGraphEdgeId(step.from, step.to, step.mechanism);
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          from: step.from,
          to: step.to,
          mechanism: step.mechanism,
        });
      }
    }
  }
  return [...byId.values()];
}

/**
 * True when the model has components but no topology or walkthrough edges.
 * Those snapshots are a catalog of declarations, not a graph.
 */
export function isConstructsOnlyModel(doc: {
  components: readonly { alias: string }[];
  relations?: readonly SubsystemRelation[];
  walkthroughs?: readonly SubsystemWalkthrough[];
}): boolean {
  if (doc.components.length === 0) return false;
  return deriveGraphEdges({
    relations: doc.relations,
    walkthroughs: doc.walkthroughs,
  }).length === 0;
}

/**
 * Derive a consistent display `name` from a code `symbol` + construct.
 *
 * `symbol` is the source of truth (fully-qualified code identity). The name
 * is the symbol itself:
 *  - class/type/function/...  symbol → symbol (e.g. `SessionReader`)
 *  - method                   `Owner.method` → last segment (e.g. `SessionReader.normalize` → `normalize`)
 *  - otherwise                no symbol → fall back to an existing name
 */
export function deriveNameFromSymbol(
  symbol: string | undefined,
  construct: SubsystemComponentConstruct,
  existingName?: string,
  _file?: string,
  stereotype?: string,
): string {
  let name: string | undefined;
  if (symbol && symbol.trim()) {
    name = symbol;
  }
  if (!name) name = existingName ?? 'untitled';

  // Decorations = what the drill-down shows. Executable constructs wear `()`;
  // brace-bodied constructs (interface, type_alias, enum) wear ` {}`. Classes
  // render bare — the construct badge already says "class". Framework
  // stereotypes (e.g. a React component) also render bare.
  // Everything else (class, store, external) renders bare.
  if (stereotype === 'component') {
    return name;
  }
  if ((construct === 'function' || construct === 'method') && !name.endsWith('()')) {
    name = `${name}()`;
  }
  if (
    (construct === 'interface' ||
      construct === 'type_alias' ||
      construct === 'enum') &&
    !name.endsWith('{}')
  ) {
    name = `${name} {}`;
  }
  return name;
}

const CONSTRUCT_PLURALS: Record<string, string> = {
  class: 'classes',
  function: 'functions',
  method: 'methods',
  interface: 'interfaces',
  type_alias: 'type aliases',
  enum: 'enums',
  store: 'stores',
  external: 'externals',
  custom_entity: 'custom entities',
};

/**
 * One-line summary of what a group of declarations contains, e.g.
 * `6 functions · 2 classes`. Used for aggregate frame boxes, which describe
 * their contents (constructs) rather than their container. Empty/blank
 * constructs are ignored. At most three groups; the rest folds into `+N more`.
 */
export function describeConstructBreakdown(constructs: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const raw of constructs) {
    const c = (raw ?? '').trim();
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const parts = ranked.slice(0, 3).map(([c, n]) => {
    if (n === 1) return `1 ${c}`;
    return `${n} ${CONSTRUCT_PLURALS[c] ?? `${c}s`}`;
  });
  if (ranked.length > 3) parts.push(`+${ranked.length - 3} more`);
  return parts.join(' · ') || 'empty';
}

/**
 * Human-readable purl identity — drops the `pkg:<type>/` scheme wrapper and
 * trailing version, keeping the package / owner-repo identity:
 *
 *   pkg:npm/@principal-ai/core         → `@principal-ai/core`
 *   pkg:github/principal-ai/my-repo    → `principal-ai/my-repo`
 *   pkg:npm/left-pad@1.3.0             → `left-pad`
 *   pkg:generic/local--Users-me-my-app → `Users-me-my-app (local)`
 *
 * Local purls encode the absolute path with dashes for slashes, which is not
 * losslessly decodable — shown as-is with a `(local)` marker.
 */
export function formatPurl(purl: string): string {
  const match = /^pkg:[^/#?]+\/(.+)$/.exec(purl);
  if (!match) return purl;
  let identity = match[1].split(/[?#]/)[0];
  const at = identity.indexOf('@');
  if (at > 0) identity = identity.slice(0, at); // trailing @version
  if (identity.startsWith('local--')) {
    return `${identity.slice('local--'.length)} (local)`;
  }
  return identity;
}

// ---------------------------------------------------------------------------
// React Flow conversion
// ---------------------------------------------------------------------------

export type SubsystemGraphNodeType = 'subsystem-component' | 'subsystem-group';

/**
 * One boundary region — process (runtime), module (source file), or package
 * (repo identity from `purl`). Nodes without that membership sit outside
 * those frames. Package frames are derived from `purl` (no separate field);
 * they only appear when the graph spans multiple repos (by default).
 */
export interface SubsystemProcessRegion {
  /** Discriminator — which field / identity produced this region. */
  kind: 'process' | 'module' | 'package';
  /** The `process` / `module` value, or purl repo key for packages. */
  key: string;
  /** Display label for the boundary frame. */
  label: string;
  /** Component ids that are members of this region. */
  memberAliases: string[];
}

/** Options for which boundary frames are kept. */
export interface BoundaryFrameOptions {
  /**
   * Keep 1-member process / module / package frames. Default false
   * (singleton rule — frames need 2+ members).
   */
  showSingletonFrames?: boolean;
  /**
   * When package frames are drawn from component `purl`s.
   * - `multi-repo` (default): only when 2+ distinct repo purls
   * - `always`: frame every multi-member package even in a single-repo graph
   * - `never`: no package frames
   */
  packageFrames?: 'multi-repo' | 'always' | 'never';
}

/** React Flow id for a process boundary group node. */
export function processGroupNodeId(processKey: string): string {
  return `process:${processKey}`;
}

/** React Flow id for a module boundary group node. */
export function moduleGroupNodeId(moduleKey: string): string {
  return `module:${moduleKey}`;
}

export const MODULE_BADGE_INSET = 12;
const MODULE_BADGE_CHAR_WIDTH = 12.5;
const MODULE_BADGE_CHROME = 16;
const MODULE_FRAME_BORDER = 4;

export function moduleBadgeLabel(path: string, availableWidth = 0): string {
  if (path.length * MODULE_BADGE_CHAR_WIDTH + MODULE_BADGE_CHROME <= availableWidth) {
    return path;
  }
  const parts = path.split(/[\\/]/).filter((part) => part !== '' && part !== '.');
  if (parts.length <= 2) return path;
  return `${parts[0]}/…/${parts[parts.length - 1]}`;
}

/**
 * Hover form of the badge: the collapsed `first/…/last` plus as many trailing
 * path segments as fit in `availableWidth`. Greedily pulls segments off the
 * tail so hovering reveals the path without ever distorting the glyphs or
 * spilling past the frame's inner width. Falls back to the full path (no
 * collapse) if everything fits.
 */
export function moduleBadgeHoverLabel(path: string, availableWidth = 0): string {
  if (path.length * MODULE_BADGE_CHAR_WIDTH + MODULE_BADGE_CHROME <= availableWidth) {
    return path;
  }
  const parts = path.split(/[\\/]/).filter((part) => part !== '' && part !== '.');
  if (parts.length <= 2) return path;
  let tailStart = parts.length - 1;
  while (tailStart > 1) {
    const candidate = `${parts[0]}/…/${parts.slice(tailStart - 1).join('/')}`;
    if (candidate.length * MODULE_BADGE_CHAR_WIDTH + MODULE_BADGE_CHROME <= availableWidth) {
      tailStart -= 1;
    } else {
      break;
    }
  }
  return `${parts[0]}/…/${parts.slice(tailStart).join('/')}`;
}

/** Estimated render width (px) of the badge for `path` in the badge font. */
export function moduleBadgeWidth(path: string): number {
  return Math.ceil(path.length * MODULE_BADGE_CHAR_WIDTH + MODULE_BADGE_CHROME);
}

export function moduleMinWidthForBadge(path: string): number {
  const collapsed = moduleBadgeLabel(path);
  // `…` renders ~1.4× a regular char in the bold badge font — account for it
  // so a path that just crosses the fit threshold doesn't collapse in vain.
  const expanded = path[0] === '…' ? 0 : 1;
  const glyphWidth = collapsed.length * MODULE_BADGE_CHAR_WIDTH + 4 * expanded;
  return Math.ceil(
    glyphWidth + MODULE_BADGE_CHROME + MODULE_BADGE_INSET * 2 + MODULE_FRAME_BORDER,
  );
}

/** React Flow id for a package (repo) boundary group node. */
export function packageGroupNodeId(packageKey: string): string {
  return `package:${packageKey}`;
}

/** React Flow id for a boundary group of any kind. */
export function boundaryGroupNodeId(region: Pick<SubsystemProcessRegion, 'kind' | 'key'>): string {
  if (region.kind === 'module') return moduleGroupNodeId(region.key);
  if (region.kind === 'package') return packageGroupNodeId(region.key);
  return processGroupNodeId(region.key);
}

/**
 * Repo/package key used for package frames — `purl` with fragment stripped.
 * Externals and custom entities are not package-frame members.
 */
export function componentPackageKey(
  c: Pick<SubsystemComponent, 'purl' | 'construct'>,
): string | undefined {
  if (c.construct === 'external' || c.construct === 'custom_entity') return undefined;
  const key = purlRepoKey(c.purl);
  if (!key || key === 'external') return undefined;
  return key;
}

function packageRegionLabel(packageKey: string): string {
  return purlOwnerName(packageKey) ?? formatPurl(packageKey);
}

/**
 * Derive process boundary regions — one per distinct non-empty `process`
 * value, in first-appearance order.
 */
export function getSubsystemRegions(
  doc: Pick<SubsystemModelDocument, 'components'>,
): SubsystemProcessRegion[] {
  const byProcess = new Map<string, string[]>();
  for (const c of doc.components) {
    const p = c.process?.trim();
    if (!p) continue;
    const list = byProcess.get(p) ?? [];
    list.push(c.alias);
    byProcess.set(p, list);
  }
  return [...byProcess.entries()].map(([key, memberAliases]) => ({
    kind: 'process' as const,
    key,
    label: key,
    memberAliases,
  }));
}

/**
 * Derive module boundary regions — one per distinct non-empty `module`
 * value, in first-appearance order. Label is the module path (file).
 */
export function getSubsystemModuleRegions(
  doc: Pick<SubsystemModelDocument, 'components'>,
): SubsystemProcessRegion[] {
  const byModule = new Map<string, string[]>();
  for (const c of doc.components) {
    const m = c.module?.trim();
    if (!m) continue;
    const list = byModule.get(m) ?? [];
    list.push(c.alias);
    byModule.set(m, list);
  }
  return [...byModule.entries()].map(([key, memberAliases]) => ({
    kind: 'module' as const,
    key,
    label: key,
    memberAliases,
  }));
}

/**
 * Derive package (repo) boundary regions from component `purl`s — one per
 * distinct repo key. Does not apply multi-repo / singleton filters; callers
 * decide via {@link buildBoundaryLayoutGroups}.
 */
export function getSubsystemPackageRegions(
  doc: Pick<SubsystemModelDocument, 'components'>,
): SubsystemProcessRegion[] {
  const byPackage = new Map<string, string[]>();
  for (const c of doc.components) {
    const key = componentPackageKey(c);
    if (!key) continue;
    const list = byPackage.get(key) ?? [];
    list.push(c.alias);
    byPackage.set(key, list);
  }
  return [...byPackage.entries()].map(([key, memberAliases]) => ({
    kind: 'package' as const,
    key,
    label: packageRegionLabel(key),
    memberAliases,
  }));
}

/**
 * One compound frame for ELK / React Flow — modules nest under processes,
 * processes under packages, when membership is shared.
 */
export interface BoundaryLayoutGroup {
  id: string;
  memberAliases: string[];
  /** When set, this group is a child of another boundary group. */
  parentId?: string;
  region: SubsystemProcessRegion;
}

function keepRegion(
  r: SubsystemProcessRegion,
  showSingletons: boolean,
): boolean {
  return showSingletons || r.memberAliases.length >= 2;
}

/**
 * Build the package → process → module → leaf group tree for layout.
 *
 * Package frames come from `purl` (no separate component field). By default
 * they only appear when the graph spans 2+ distinct repos. Multi-member
 * modules nest under a process when every member shares that process;
 * processes nest under a package the same way.
 */
export function buildBoundaryLayoutGroups(
  doc: Pick<SubsystemModelDocument, 'components'>,
  opts: BoundaryFrameOptions = {},
): BoundaryLayoutGroup[] {
  const showSingletons = opts.showSingletonFrames === true;
  const packageMode = opts.packageFrames ?? 'multi-repo';
  const byAlias = new Map(doc.components.map((c) => [c.alias, c]));

  const allPackages = getSubsystemPackageRegions(doc);
  const packageEligible =
    packageMode === 'always'
      ? true
      : packageMode === 'never'
        ? false
        : allPackages.length >= 2;
  const packages = packageEligible
    ? allPackages.filter((r) => keepRegion(r, showSingletons))
    : [];
  const keptPackageKeys = new Set(packages.map((r) => r.key));

  const modules = getSubsystemModuleRegions(doc).filter((r) =>
    keepRegion(r, showSingletons),
  );
  const processes = getSubsystemRegions(doc).filter((r) =>
    keepRegion(r, showSingletons),
  );
  const keptProcessKeys = new Set(processes.map((r) => r.key));

  // Leaves owned by a multi-member module belong to that module's frame
  // exclusively. Multi-member modules are always built by ELK (never skipped
  // as singletons), so letting a process/package group also list them
  // directly would parent the same leaf twice and ELK throws
  // ("value already present"). Mixed-process modules (common in composed
  // graphs, where models frame one file under different processes) never
  // nest — without this claim they land in both frames.
  const claimedByModule = new Set<string>();
  for (const r of modules) {
    if (r.memberAliases.length >= 2) {
      for (const alias of r.memberAliases) claimedByModule.add(alias);
    }
  }
  // Same rule one level up: a leaf owned by a multi-member process frame
  // must not also sit directly in a package frame. (Singleton processes
  // never claim — ELK skips them and promotes the member upward, so the
  // member has to stay reachable through its package or ungrouped.)
  const claimedByProcess = new Set<string>();
  for (const r of processes) {
    if (r.memberAliases.length >= 2) {
      for (const alias of r.memberAliases) claimedByProcess.add(alias);
    }
  }

  const moduleGroups: BoundaryLayoutGroup[] = modules.map((r) => {
    const processesOfMembers = new Set<string>();
    const packagesOfMembers = new Set<string>();
    for (const alias of r.memberAliases) {
      const c = byAlias.get(alias);
      const p = c?.process?.trim();
      if (p) processesOfMembers.add(p);
      const pkg = c ? componentPackageKey(c) : undefined;
      if (pkg) packagesOfMembers.add(pkg);
    }
    let parentId: string | undefined;
    if (processesOfMembers.size === 1) {
      const p = [...processesOfMembers][0]!;
      if (keptProcessKeys.has(p)) parentId = processGroupNodeId(p);
    }
    if (!parentId && packagesOfMembers.size === 1) {
      const pkg = [...packagesOfMembers][0]!;
      if (keptPackageKeys.has(pkg)) parentId = packageGroupNodeId(pkg);
    }
    return {
      id: moduleGroupNodeId(r.key),
      memberAliases: [...r.memberAliases],
      parentId,
      region: r,
    };
  });

  const processGroups: BoundaryLayoutGroup[] = processes.map((r) => {
    const processId = processGroupNodeId(r.key);
    const nestedModules = moduleGroups.filter((m) => m.parentId === processId);
    const nestedModuleKeys = new Set(nestedModules.map((m) => m.region.key));
    const directLeaves = r.memberAliases.filter((alias) => {
      if (claimedByModule.has(alias)) return false;
      const mod = byAlias.get(alias)?.module?.trim();
      if (!mod) return true;
      return !nestedModuleKeys.has(mod);
    });

    const packagesOfMembers = new Set<string>();
    for (const alias of r.memberAliases) {
      const c = byAlias.get(alias);
      const pkg = c ? componentPackageKey(c) : undefined;
      if (pkg) packagesOfMembers.add(pkg);
    }
    let parentId: string | undefined;
    if (packagesOfMembers.size === 1) {
      const pkg = [...packagesOfMembers][0]!;
      if (keptPackageKeys.has(pkg)) parentId = packageGroupNodeId(pkg);
    }

    return {
      id: processId,
      memberAliases: [...nestedModules.map((m) => m.id), ...directLeaves],
      parentId,
      region: r,
    };
  });

  const packageGroups: BoundaryLayoutGroup[] = packages.map((r) => {
    const packageId = packageGroupNodeId(r.key);
    const nestedProcesses = processGroups.filter((p) => p.parentId === packageId);
    const nestedModules = moduleGroups.filter((m) => m.parentId === packageId);
    const claimed = new Set<string>();
    for (const p of nestedProcesses) {
      for (const alias of p.region.memberAliases) claimed.add(alias);
    }
    for (const m of nestedModules) {
      for (const alias of m.region.memberAliases) claimed.add(alias);
    }
    const directLeaves = r.memberAliases.filter(
      (alias) =>
        !claimed.has(alias) &&
        !claimedByModule.has(alias) &&
        !claimedByProcess.has(alias),
    );
    return {
      id: packageId,
      memberAliases: [
        ...nestedProcesses.map((p) => p.id),
        ...nestedModules.map((m) => m.id),
        ...directLeaves,
      ],
      region: r,
    };
  });

  return [...moduleGroups, ...processGroups, ...packageGroups];
}

export interface SubsystemGraphNodeData extends Record<string, unknown> {
  component: SubsystemComponent;
  /** Set while a file is open in the drawer: true if this node's component
   *  lives in that file (spotlighted), false otherwise (dimmed). Absent when
   *  no file is open — render neutrally. */
  fileMatch?: boolean;
  /** True while this node is on an opened-but-unselected flow. */
  dimmed?: boolean;
}

export interface SubsystemGroupNodeData extends Record<string, unknown> {
  region: SubsystemProcessRegion;
  /** True while the region's members are dimmed by flow focus. */
  dimmed?: boolean;
}

export type SubsystemGraphNode =
  | Node<SubsystemGraphNodeData, 'subsystem-component'>
  | Node<SubsystemGroupNodeData, 'subsystem-group'>;

export interface SubsystemGraphEdgeData extends Record<string, unknown> {
  mechanism: SubsystemEdgeMechanism;
  refs?: string[];
  /** True while another edge is selected — render this edge (and its label)
   *  dimmed to focus the selected relationship. */
  dimmed?: boolean;
  /** ELK-computed label midpoint (from the actual edge path, not node centers). */
  labelX?: number;
  labelY?: number;
  /** Polyline length in flow-space units (for capping screen-space label size). */
  pathLength?: number;
  /** ELK-computed SVG edge path (overrides React Flow's default path). */
  elkPath?: string;
}

export type SubsystemGraphEdge = Edge<SubsystemGraphEdgeData>;

/**
 * Runtime vocabulary of relation types — mirrors `SubsystemRelationType`.
 * Used to split derived display edges into their relation vs walkthrough
 * source (the two unions are disjoint).
 */
export const SUBSYSTEM_RELATION_TYPES = [
  'extends',
  'inherits',
  'implements',
  'mixes_in',
  'method',
  'references',
] as const satisfies readonly SubsystemRelationType[];

/** Runtime vocabulary of walkthrough hop mechanisms — mirrors `SubsystemWalkthroughMechanism`. */
export const SUBSYSTEM_WALKTHROUGH_MECHANISMS = [
  'calls',
  'uses',
  'feeds',
  'produces',
  'writes',
  'reads',
  'watches',
  'registers-into',
] as const satisfies readonly SubsystemWalkthroughMechanism[];

const RELATION_TYPE_SET: ReadonlySet<string> = new Set(SUBSYSTEM_RELATION_TYPES);
const WALKTHROUGH_MECHANISM_SET: ReadonlySet<string> = new Set(
  SUBSYSTEM_WALKTHROUGH_MECHANISMS,
);

/** True when a mechanism belongs to the topology relation vocabulary. */
export function isRelationMechanism(
  mechanism: string,
): mechanism is SubsystemRelationType {
  return RELATION_TYPE_SET.has(mechanism);
}

/** True when a mechanism belongs to the walkthrough hop vocabulary. */
export function isWalkthroughMechanism(
  mechanism: string,
): mechanism is SubsystemWalkthroughMechanism {
  return WALKTHROUGH_MECHANISM_SET.has(mechanism);
}

export const MECHANISM_COLOR: Record<SubsystemEdgeMechanism, string> = {
  calls: '#4ec9b0', // teal
  extends: '#b48ead', // purple
  inherits: '#9b6fd0', // purple
  implements: '#c586c0', // magenta
  mixes_in: '#d474a8', // pink-magenta
  uses: '#e3b341', // gold
  method: '#c586c0', // magenta
  references: '#e07a5f', // terracotta
  feeds: '#22c55e', // green — data-flow into a processor
  produces: '#e07a5f', // terracotta — emits an output type
  writes: '#2f9e44', // deep green — mutates retained state
  reads: '#0ea5e9', // sky — pulls from retained state
  watches: '#9ca3af', // gray — observes, owns nothing
  'registers-into': '#ff6b35', // orange
};

export const MECHANISM_STYLE: Record<SubsystemEdgeMechanism, 'solid' | 'dashed' | 'dotted'> = {
  calls: 'solid',
  extends: 'dashed',
  inherits: 'dashed',
  implements: 'dashed',
  mixes_in: 'dashed',
  uses: 'solid',
  method: 'solid',
  references: 'dotted',
  feeds: 'solid',
  produces: 'solid',
  writes: 'solid',
  reads: 'solid',
  watches: 'dashed',
  'registers-into': 'dashed',
};

/** Mechanism → [description, verifiable-with-graphify]. Drives the "not
 *  directly verifiable" styling of edge labels. */
export const MECHANISM_DESCRIPTIONS: [SubsystemEdgeMechanism, string, boolean][] = [
  ['calls', 'function/method call (call graph edge)', true],
  ['extends', 'class inheritance', true],
  ['inherits', 'class inheritance', true],
  ['implements', 'implements interface / protocol', true],
  ['mixes_in', 'applies mixin', true],
  ['uses', 'general dependency (import, call, or reference)', false],
  ['method', 'structural: has method / member', true],
  ['references', 'type / symbol reference (not a call)', true],
  ['feeds', 'data flow: output feeds into input', false],
  ['produces', 'data flow: produces / outputs', false],
  ['writes', 'state access: mutates retained state', true],
  ['reads', 'state access: reads retained state', true],
  ['watches', 'observes retained state without owning it', false],
  ['registers-into', 'registration pattern', false],
];

/** Package color palette (derived deterministically from the package name). */
export function packageColor(name: string): string {
  const palette = [
    '#0893d2',
    '#4ec9b0',
    '#ff6b35',
    '#b48ead',
    '#e3b341',
    '#5aa9e6',
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/** Color per semantic role — applied ONLY to the role badge (top-right tab on
 *  nodes that carry a role). The node border stays construct-colored. Note:
 *  `service` currently equals the old class hex; harmless while role badges
 *  are the only surface using it, but pick a distinct value if roles ever
 *  take over node borders. */
export const ROLE_COLOR: Record<SubsystemComponentRole, string> = {
  entry: '#ff6b35', // orange — boundary element
  service: '#0893d2', // blue — external system
};

/**
 * Brand color for the left construct/stereotype badge when a framework owns
 * the label (e.g. `react · component`). Node border stays construct-colored.
 */
export const FRAMEWORK_BADGE_COLOR: Record<string, string> = {
  react: '#61dafb', // React cyan
};

export const ROLE_LABEL: Record<SubsystemComponentRole, string> = {
  entry: 'entry',
  service: 'service',
};

/** Right-badge accent for `proposed: true` (no role, or combined with role). */
export const PROPOSED_COLOR = '#b8860b'; // darkgoldenrod — not-yet-in-source

/**
 * Top-right badge label: proposed wins over role when both are set
 * (proposed is the temporary exception to scan for; role stays on the model).
 * Returns null when neither applies.
 */
export function rightBadgeLabel(component: {
  role?: SubsystemComponentRole;
  proposed?: boolean;
}): string | null {
  if (component.proposed) return 'proposed';
  if (component.role != null) return ROLE_LABEL[component.role];
  return null;
}

/** Color for the top-right badge (role and/or proposed). */
export function rightBadgeColor(component: {
  role?: SubsystemComponentRole;
  proposed?: boolean;
}): string | null {
  if (component.proposed) return PROPOSED_COLOR;
  if (component.role != null) return ROLE_COLOR[component.role];
  return null;
}

/** Display label per store `storage` backing. */
export const STORAGE_LABEL: Record<string, string> = {
  memory: 'memory',
  disk: 'disk',
  external: 'db',
};

/** Right-badge accent per store `storage` backing — retention reads as its
 *  own hue so memory / disk / db are scannable from far on a canvas. */
export const STORAGE_COLOR: Record<string, string> = {
  memory: '#5aa9e6', // sky — process-lifetime RAM
  disk: '#e3b341', // amber — this process on the filesystem
  external: '#c46fd8', // violet — mediated by another system (db/service)
};

function storeStorage(component: {
  declaration?: GraphifyComponentDetail;
}): string | undefined {
  return component.declaration?.kind === 'store'
    ? component.declaration.storage
    : undefined;
}

/** Top-right storage badge for `construct: 'store'` nodes with an authored
 *  `storage` declaration — how the retained state is backed. Sits beside the
 *  role/proposed badge (storage is orthogonal to topology). Null otherwise. */
export function storageBadgeLabel(component: {
  construct: SubsystemComponentConstruct;
  declaration?: GraphifyComponentDetail;
}): string | null {
  if (component.construct !== 'store') return null;
  const storage = storeStorage(component);
  return storage ? (STORAGE_LABEL[storage] ?? storage) : null;
}

export function storageBadgeColor(component: {
  construct: SubsystemComponentConstruct;
  declaration?: GraphifyComponentDetail;
}): string | null {
  if (component.construct !== 'store') return null;
  const storage = storeStorage(component);
  return storage ? (STORAGE_COLOR[storage] ?? null) : null;
}

/**
 * Primary badge text for a node: prefer framework stereotype over the
 * language construct so a React UI unit reads as "component" / "hook"
 * rather than "function". When both framework and stereotype are set,
 * show `framework · stereotype` (e.g. `react · component`). A custom
 * entity wears its `entityKind` (Person/agent/queue) as the badge.
 */
export function constructBadgeLabel(component: {
  construct: SubsystemComponentConstruct;
  framework?: string;
  stereotype?: string;
  entityKind?: string;
}): string {
  if (component.construct === 'custom_entity' && component.entityKind) {
    return component.entityKind;
  }
  const constructLabel =
    component.construct === 'type_alias' ? 'type alias' : component.construct;
  if (component.stereotype && component.framework) {
    return `${component.framework} · ${component.stereotype}`;
  }
  if (component.stereotype) return component.stereotype;
  return constructLabel ?? '';
}

/**
 * Left-badge accent: framework brand when the badge shows a framework
 * stereotype (e.g. React cyan for `react · component`); otherwise null so
 * the caller falls back to construct color. Border stays construct-colored.
 */
export function constructBadgeColor(component: {
  framework?: string;
  stereotype?: string;
}): string | null {
  if (component.framework == null || component.stereotype == null) return null;
  return FRAMEWORK_BADGE_COLOR[component.framework] ?? null;
}

/** Default CSS floor for component nodes (padding aside). */
export const NODE_CSS_MIN_WIDTH = 150;
/** Inset of each top badge from the node edge (`left` / `right` style). */
export const BADGE_EDGE_INSET = 5;
/** Minimum gap between left construct badge and right role badge. */
const BADGE_PAIR_GAP = 8;
/**
 * Node border thickness reserved on each side of the badge span. Top badges are
 * positioned from the padding edge (inside the border), so a `left: 5px` badge
 * starts `border + inset` from the border-box edge. Reserve the widest border
 * (4px when selected / file-matched) so the pair gap survives selection.
 */
const BADGE_NODE_BORDER = 4;
/** Badge box chrome: padding 8+8 + border 2+2. */
const BADGE_BOX_CHROME = 20;
/**
 * Approx monospace uppercase advance incl. letter-spacing. Badge font is
 * 13.2px; Fira Code / SF Mono / Courier all sit at ~0.6em (7.9px) plus 0.5px
 * tracking ≈ 8.4px. Rounded up so estimates never undershoot — an undershoot
 * eats into BADGE_PAIR_GAP and lets the left/right badges touch.
 */
const BADGE_CHAR_WIDTH = 8.5;

/** Estimated rendered width of a top tab badge label. */
export function estimateBadgeLabelWidth(label: string): number {
  return (label?.length ?? 0) * BADGE_CHAR_WIDTH + BADGE_BOX_CHROME;
}

/**
 * Minimum node width so top badges stay on one line and (when both are
 * present) don't overlap — badges are absolutely positioned, so they don't
 * contribute to layout unless we widen the node explicitly.
 */
export function nodeMinWidthForBadges(component: {
  construct: SubsystemComponentConstruct;
  framework?: string;
  stereotype?: string;
  role?: SubsystemComponentRole;
  proposed?: boolean;
  entityKind?: string;
  declaration?: GraphifyComponentDetail;
}): number {
  const left = estimateBadgeLabelWidth(constructBadgeLabel(component));
  const rightBadges = [
    storageBadgeLabel(component),
    rightBadgeLabel(component),
  ].filter((l): l is string => l != null);
  if (rightBadges.length === 0) {
    return Math.max(
      NODE_CSS_MIN_WIDTH,
      BADGE_NODE_BORDER + BADGE_EDGE_INSET + left + BADGE_EDGE_INSET + BADGE_NODE_BORDER,
    );
  }
  const right = rightBadges
    .map(estimateBadgeLabelWidth)
    .reduce((acc, w) => acc + BADGE_PAIR_GAP + w);
  return Math.max(
    NODE_CSS_MIN_WIDTH,
    BADGE_NODE_BORDER +
      BADGE_EDGE_INSET +
      left +
      BADGE_PAIR_GAP +
      right +
      BADGE_EDGE_INSET +
      BADGE_NODE_BORDER,
  );
}

/**
 * Convert a subsystem graph document into React Flow nodes. Components that
 * carry a `module` get a `parentId` pointing at their module frame
 * (`module:<path>`); otherwise a `process` stamps `process:<process>`.
 * Package (`purl`) parents are stamped later in `buildSubsystemGraph` only
 * when package frames are kept. Module frames may nest under process →
 * package. The initial grid clusters by `module ?? process ?? purl`; ELK
 * then refines with compound layout.
 */
export function convertSubsystemToNodes(
  doc: SubsystemModelDocument,
  opts: { maxNodeWidth?: number } = {},
): SubsystemGraphNode[] {
  const { maxNodeWidth } = opts;
  // Cluster for the pre-ELK grid: module (source file) → process (runtime)
  // → purl (package identity).
  const byPkg = new Map<string, SubsystemComponent[]>();
  for (const c of doc.components) {
    const regionKey = c.module ?? c.process ?? c.purl;
    const list = byPkg.get(regionKey) ?? [];
    list.push(c);
    byPkg.set(regionKey, list);
  }

  const nodes: SubsystemGraphNode[] = [];
  const COLS = 2;
  const COL_W = 240;
  const ROW_H = 150;
  const PAD = 30;
  const GROUP_GAP = 60;

  let cursorY = PAD;
  for (const comps of byPkg.values()) {
    const rows = Math.ceil(comps.length / COLS);
    const heightPx = ROW_H * rows;

    comps.forEach((c, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      // Estimate rendered node width from the longest text line so ELK reserves
      // the right space (names can wrap, so we cap at the configurable max).
      const text = [c.symbol, c.name, c.file?.split('/').pop() ?? '']
        .filter((t): t is string => !!t)
        .sort((a, b) => b.length - a.length)[0];
      const cap = maxNodeWidth ?? 300;
      const textWidth = Math.min(cap, Math.max(60, (text?.length ?? 10) * 8));
      // Account for CSS minWidth (incl. top badges) and padding/border so ELK's
      // port positions match the actual rendered node boundaries.
      const cssMinWidth = nodeMinWidthForBadges(c);
      const cssPadding = 20; // horizontal padding (left + right)
      const cssBorder = 4; // 2px border each side
      const rawWidth = Math.max(cssMinWidth, textWidth + cssPadding + cssBorder);
      const nodeWidth = Math.max(cssMinWidth, Math.min(cap, rawWidth));
      const moduleKey = c.module?.trim();
      const processKey = c.process?.trim();
      const parentId = moduleKey
        ? moduleGroupNodeId(moduleKey)
        : processKey
          ? processGroupNodeId(processKey)
          : undefined;
      nodes.push({
        id: c.alias,
        type: 'subsystem-component',
        ...(parentId ? { parentId } : {}),
        position: { x: PAD + col * COL_W, y: cursorY + row * ROW_H },
        width: nodeWidth,
        height: 84,
        data: { component: c },
      });
    });
    cursorY += heightPx + PAD * 2 + GROUP_GAP;
  }
  return nodes;
}

/**
 * Convert boundary regions into React Flow parent (group) nodes. Nesting
 * (package → process → module) is stamped via `parentId` on groups.
 * Positions/sizes are placeholders — ELK compound layout overwrites them.
 */
export function convertSubsystemToGroups(
  doc: Pick<SubsystemModelDocument, 'components'>,
  opts: BoundaryFrameOptions = {},
): SubsystemGraphNode[] {
  return buildBoundaryLayoutGroups(doc, opts).map((g) => ({
    id: g.id,
    type: 'subsystem-group' as const,
    position: { x: 0, y: 0 },
    width: 400,
    height: 300,
    ...(g.parentId ? { parentId: g.parentId } : {}),
    data: { region: g.region },
  }));
}

/**
 * Convert a subsystem graph document into React Flow edges. Edges whose target
 * is an external label (not a component alias) point at a synthetic stub so the
 * relationship is visible without a member node.
 */
export function convertSubsystemToEdges(doc: SubsystemModelDocument): SubsystemGraphEdge[] {
  const compAliases = new Set(doc.components.map((c) => c.alias));
  const edges: SubsystemGraphEdge[] = [];

  for (const e of deriveGraphEdges(doc)) {
    const color = MECHANISM_COLOR[e.mechanism];
    const style = MECHANISM_STYLE[e.mechanism];
    // If `to` is a real component, connect directly; otherwise point at a stub node.
    const isExternal = !compAliases.has(e.to);
    const targetId = isExternal ? `external:${e.to}` : e.to;

    edges.push({
      id: e.id,
      source: e.from,
      target: targetId,
      data: { mechanism: e.mechanism, refs: e.refs },
      type: 'subsystem-edge',
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 32, height: 32 },
      style: { color, stroke: color, strokeDasharray: style === 'dashed' ? '6 4' : undefined },
      // `label` feeds ELK's label-space reservation only; the visible label is
      // rendered by the custom SubsystemEdge as an HTML overlay.
      label: e.mechanism,
      // Mechanism label rendered via the custom SubsystemEdge (an HTML overlay
      // above the SVG edges, so it can't be hidden behind other edge lines).
    });
  }
  return edges;
}

/** Stable key for layout-affecting graph fields (ignores declarationRef, etc.). */
export function subsystemGraphLayoutKey(
  doc: Pick<SubsystemModelDocument, 'components' | 'relations' | 'walkthroughs'>,
): string {
  const components = doc.components
    .map(({ alias, purl, name, symbol, construct, file, purpose, process, module }) =>
      [alias, purl, name, symbol ?? '', construct, file, purpose ?? '', process ?? '', module ?? ''].join('\0'))
    .sort()
    .join('\n');
  const edgeKey = deriveGraphEdges(doc)
    .map(({ id, from, to, mechanism }) => [id, from, to, mechanism].join('\0'))
    .sort()
    .join('\n');
  return `${components}|${edgeKey}`;
}

/**
 * Build the full React Flow graph (nodes + edges) using **ELK auto-layout** to
 * position every node (including external stub targets), so the graph is
 * layered with minimized crossings.
 */
export async function buildSubsystemGraph(
  doc: SubsystemModelDocument,
  opts: {
    maxNodeWidth?: number;
    showEdgeLabels?: boolean;
    measuredWidths?: Map<string, number>;
    measuredHeights?: Map<string, number>;
  } & BoundaryFrameOptions = {},
): Promise<{
  nodes: SubsystemGraphNode[];
  edges: SubsystemGraphEdge[];
  regions: SubsystemProcessRegion[];
}> {
  const {
    maxNodeWidth,
    showEdgeLabels,
    measuredWidths,
    measuredHeights,
    showSingletonFrames,
    packageFrames,
  } = opts;
  const frameOpts: BoundaryFrameOptions = { showSingletonFrames, packageFrames };
  const nodes = convertSubsystemToNodes(doc, { maxNodeWidth });
  const edges = convertSubsystemToEdges(doc);
  // Nested boundary tree: package → process → module → leaves.
  const layoutGroups = buildBoundaryLayoutGroups(doc, frameOpts);
  const regions = layoutGroups.map((g) => g.region);
  const regionIds = new Set(layoutGroups.map((g) => g.id));
  const byAlias = new Map(doc.components.map((c) => [c.alias, c]));

  // Resolve leaf parentIds against kept frames: module → process → package.
  // Stamp package parents here (not in convertSubsystemToNodes) so single-repo
  // graphs never provisionally parent under a package that will be dropped.
  for (const n of nodes) {
    if (n.type !== 'subsystem-component') continue;
    const parentId = (n as { parentId?: string }).parentId;
    if (parentId && regionIds.has(parentId)) continue;
    const comp = (n.data as SubsystemGraphNodeData).component ?? byAlias.get(n.id);
    const processKey = comp?.process?.trim();
    const processId = processKey ? processGroupNodeId(processKey) : undefined;
    if (processId && regionIds.has(processId)) {
      (n as { parentId?: string }).parentId = processId;
      continue;
    }
    const packageKey = comp ? componentPackageKey(comp) : undefined;
    const packageId = packageKey ? packageGroupNodeId(packageKey) : undefined;
    if (packageId && regionIds.has(packageId)) {
      (n as { parentId?: string }).parentId = packageId;
      continue;
    }
    if (parentId) delete (n as { parentId?: string }).parentId;
  }

  // External edge targets that aren't real components → create stub nodes so
  // cross-package edges have something to land on.
  const realAliases = new Set(doc.components.map((c) => c.alias));
  const externalIds: string[] = [];
  for (const e of deriveGraphEdges(doc)) {
    if (!realAliases.has(e.to)) {
      const extId = `external:${e.to}`;
      if (!externalIds.includes(extId)) externalIds.push(extId);
    }
  }
  for (const extId of externalIds) {
      const label = extId.replace(/^external:/, '');
      const extTextWidth = Math.min(300, Math.max(150, label.length * 8));
      nodes.push({
        id: extId,
        type: 'subsystem-component',
        position: { x: 0, y: 0 },
        width: Math.max(150, extTextWidth + 24),
      height: 60,
      data: {
        component: {
          alias: extId,
          name: label,
          construct: 'external',
          purl: 'external',
          file: '',
          purpose: 'cross-package integration target (not a member node)',
        },
      },
      draggable: false,
    });
  }

  // Apply measured dimensions (second pass) so ELK gets the real node sizes.
  if (measuredWidths && measuredWidths.size > 0) {
    for (const n of nodes) {
      const mw = measuredWidths.get(n.id);
      if (mw) n.width = mw;
    }
  }
  if (measuredHeights && measuredHeights.size > 0) {
    for (const n of nodes) {
      const mh = measuredHeights.get(n.id);
      if (mh) n.height = mh;
    }
  }

  // ELK auto-layout: nested compound parents (process → module → leaves).
  let placedNodes = nodes;
  let labelPositions = new Map<string, { x: number; y: number }>();
  let elkPathStrings = new Map<string, string>();
  let elkPathPoints = new Map<string, { x: number; y: number }[]>();
  if (nodes.length > 0) {
    try {
      const result = await computeElkLayout(nodes, edges, {
        routingStyle: 'orthogonal',
        direction: 'RIGHT',
        nodeSpacing: 60,
        edgeSpacing: 30,
        edgeNodeSpacing: 60,
        interLayerSpacing: 120,
        preserveNodePositions: false,
        edgeLabels: showEdgeLabels === false ? { enabled: false } : { enabled: true, placement: 'CENTER' },
        groups: layoutGroups.map((g) => ({
          id: g.id,
          memberIds: g.memberAliases,
          parentId: g.parentId,
          minWidth: g.region.kind === 'module' ? moduleMinWidthForBadge(g.region.label) : undefined,
        })),
      });
      const builtGroupIds = new Set(result.groupBounds.keys());
      // Parents before children — package, then process, then module frames.
      const packageGroupNodes: SubsystemGraphNode[] = [];
      const processGroupNodes: SubsystemGraphNode[] = [];
      const moduleGroupNodes: SubsystemGraphNode[] = [];
      for (const g of layoutGroups) {
        const bounds = result.groupBounds.get(g.id);
        if (!bounds) continue;
        const parentId =
          g.parentId && builtGroupIds.has(g.parentId) ? g.parentId : undefined;
        const group: SubsystemGraphNode = {
          id: g.id,
          type: 'subsystem-group',
          position: { x: bounds.x, y: bounds.y },
          width: Math.max(200, bounds.width),
          height: Math.max(160, bounds.height),
          ...(parentId ? { parentId } : {}),
          data: { region: g.region },
        };
        if (g.region.kind === 'package') packageGroupNodes.push(group);
        else if (g.region.kind === 'process') processGroupNodes.push(group);
        else moduleGroupNodes.push(group);
      }
      // Clear leaf parentIds that point at groups ELK dropped.
      for (const n of result.nodes as SubsystemGraphNode[]) {
        if (n.type !== 'subsystem-component') continue;
        const parentId = (n as { parentId?: string }).parentId;
        if (parentId && !builtGroupIds.has(parentId)) {
          delete (n as { parentId?: string }).parentId;
        }
      }
      placedNodes = [
        ...packageGroupNodes,
        ...processGroupNodes,
        ...moduleGroupNodes,
        ...(result.nodes as SubsystemGraphNode[]),
      ];
      labelPositions = result.edgeLabelPositions;
      elkPathStrings = result.edgePaths;
      elkPathPoints = result.edgePathPoints;
    } catch (err) {
      // Fall back to the (unpositioned) grid if ELK is unavailable — still
      // emit multi-member frames so parentId targets exist.
      console.warn('[subsystem-graph] ELK layout failed, using manual positions:', err);
      const packageGroupNodes: SubsystemGraphNode[] = [];
      const processGroupNodes: SubsystemGraphNode[] = [];
      const moduleGroupNodes: SubsystemGraphNode[] = [];
      for (const g of layoutGroups) {
        const group: SubsystemGraphNode = {
          id: g.id,
          type: 'subsystem-group',
          position: { x: 0, y: 0 },
          width: 400,
          height: 300,
          ...(g.parentId ? { parentId: g.parentId } : {}),
          data: { region: g.region },
        };
        if (g.region.kind === 'package') packageGroupNodes.push(group);
        else if (g.region.kind === 'process') processGroupNodes.push(group);
        else moduleGroupNodes.push(group);
      }
      placedNodes = [
        ...packageGroupNodes,
        ...processGroupNodes,
        ...moduleGroupNodes,
        ...nodes,
      ];
    }
  }

  // Stamp ELK-computed label midpoints onto edge data so the overlay can
  // position labels at the actual path midpoint (not the node-center midpoint).
  for (const e of edges) {
    const pos = labelPositions.get(e.id);
    if (pos) {
      const d = (e as SubsystemGraphEdge).data as SubsystemGraphEdgeData;
      d.labelX = pos.x;
      d.labelY = pos.y;
    }
    const elkP = elkPathStrings.get(e.id);
    if (elkP) {
      const d = (e as SubsystemGraphEdge).data as SubsystemGraphEdgeData;
      d.elkPath = elkP;
    }
    const pts = elkPathPoints.get(e.id);
    if (pts && pts.length > 1) {
      const d = (e as SubsystemGraphEdge).data as SubsystemGraphEdgeData;
      d.pathLength = calculatePathLength(pts);
    }
  }

  return { nodes: placedNodes, edges, regions };
}
