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

export type SubsystemComponentConstruct =
  | 'class'
  | 'function'
  | 'method'
  | 'interface'
  | 'type_alias'
  | 'enum'
  | 'module'
  | 'store'
  | 'external';

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

export type SubsystemEdgeMechanism =
  | 'imports'
  | 'imports_from'
  | 're_exports'
  | 'defines'
  | 'calls'
  | 'extends'
  | 'inherits'
  | 'implements'
  | 'mixes_in'
  | 'uses'
  | 'method'
  | 'references'
  | 'contains'
  | 'feeds'
  | 'produces'
  | 'writes'
  | 'reads'
  | 'watches'
  | 'registers-into';

/** A component node — the named unit, construct-tagged; `file` is its location. */
export interface SubsystemComponent {
  id: string;
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
  /** One-line purpose shown on the node. */
  purpose?: string;
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
   * Runtime process membership — which deployment unit this node is a
   * member of (e.g. `principal-studio/host`, `principal-studio/renderer`). Nodes
   * sharing a `process` are drawn inside one boundary region (grouping is
   * `process ?? purl`); nodes without one sit outside every boundary
   * (external actors, services, libraries).
   */
  process?: string;
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
   * How this session *occupied* the component — `edited` (modified it) vs
   * `analyzed` (read deeply / built an understanding) vs `referenced`
   * (touched in passing). Drives clustering: edits strengthen a subsystem,
   * but a read-only investigation can still form one around an analyzed seam.
   */
  capture?: 'edited' | 'analyzed' | 'referenced';
  /**
   * Graphify drill-down detail for this component, when the facet is anchored
   * to a graphify node. Discriminated by kind (class/function/type/module/store/
   * external); rendered in the detail panel on click.
   */
  detail?: GraphifyComponentDetail;
  /**
   * Where the drill-down `detail` came from. `verified` = extracted from
   * source by tooling (graphify AST, signature extraction) — may be trusted
   * as matching the code. `authored` = written by the authoring agent/human
   * to highlight specific inputs/outputs — informative, not checked against
   * source. Detail without provenance is treated as `authored`; only tooling
   * may claim `verified`.
   */
  detailProvenance?: 'verified' | 'authored';
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

/** A cross-component edge in the subsystem graph. */
export interface SubsystemComponentEdge {
  id: string;
  from: string; // component id
  to: string; // component id or external target label
  mechanism: SubsystemEdgeMechanism;
  /** Concrete file/symbol refs backing the edge (the seam). */
  refs?: string[];
}

/**
 * A single site on an existing edge — the exact `file:line` where that edge's
 * seam manifests for a given flow. The edge stays the abstract contract
 * (`from`, `to`, `mechanism`); a throughline step picks the concrete
 * manifestation. One edge can appear in many steps.
 */
export interface SubsystemThroughlineStep {
  /** Id of the existing edge this hop traverses. */
  edgeId: string;
  /** Repo-root-relative path of the file where the edge fires. */
  file: string;
  /** 1-based line of the site within `file`. */
  line: number;
  /**
   * Frame name for this hop — the function/method/symbol on the stack at
   * this site. Optional so existing throughlines keep working; when set the
   * flows list shows it instead of mechanism + filename.
   */
  symbol?: string;
  /**
   * Free-text note anchored to this hop's site line. Optional — informative
   * only, never verified against source; the Pierre throughline code view
   * surfaces it in the annotation column next to the highlighted line.
   */
  annotation?: string;
}

/**
 * An ordered execution story over a graph's edges — each step references an
 * existing edge and the exact site where that relationship fires for a flow;
 * ordering is the array. One throughline per flow (save flow, load flow, …).
 */
export interface SubsystemThroughline {
  id: string;
  title: string;
  steps: SubsystemThroughlineStep[];
}

/**
 * Derive a consistent display `name` from a code `symbol` + construct.
 *
 * `symbol` is the source of truth (fully-qualified code identity). The name
 * is the symbol itself:
 *  - class/type/module/function/script/...  symbol → symbol (e.g. `SessionReader`)
 *  - method                               `Owner.method` → last segment (e.g. `SessionReader.normalize` → `normalize`)
 *  - module, no symbol → basename of `file` (e.g. `transcript.ts` → `transcript`) —
 *    a common-sense convention for whole-file modules, not a real TS name
 *  - otherwise                          no symbol → fall back to an existing name
 */
export function deriveNameFromSymbol(
  symbol: string | undefined,
  construct: SubsystemComponentConstruct,
  existingName?: string,
  file?: string,
  stereotype?: string,
): string {
  let name: string | undefined;
  if (symbol && symbol.trim()) {
    name = symbol;
  } else if (construct === 'module' && file) {
    const base = file.split('/').pop() ?? '';
    const clean = base.replace(/\.[^.]+$/, ''); // strip extension
    if (clean) name = clean;
  }
  if (!name) name = existingName ?? 'untitled';

  // Decorations = what the drill-down shows. Framework stereotypes can override
  // the language decoration (a React component wears `<>` instead of `()`).
  // Executable constructs wear `()`; brace-bodied constructs (interface,
  // type_alias, enum) wear ` {}`. Classes render bare — the construct badge
  // already says "class".
  // Everything else (class, store, module, external) renders bare.
  if (stereotype === 'component' && !name.startsWith('<')) {
    return `<${name}>`;
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

export interface SubsystemModelDocument {
  components: SubsystemComponent[];
  edges: SubsystemComponentEdge[];
  /** Ordered execution stories over the graph's edges (one per flow). */
  throughlines?: SubsystemThroughline[];
}

// ---------------------------------------------------------------------------
// React Flow conversion
// ---------------------------------------------------------------------------

export type SubsystemGraphNodeType = 'subsystem-component' | 'subsystem-group';

/**
 * One process boundary region — all components sharing a `process` value.
 * Nodes without a `process` sit outside every boundary (no region).
 */
export interface SubsystemProcessRegion {
  /** The `process` value (e.g. `principal-studio/host`). */
  key: string;
  /** Display label for the boundary frame. */
  label: string;
  /** Component ids that are members of this region. */
  memberIds: string[];
}

/** React Flow id for a process boundary group node. */
export function processGroupNodeId(processKey: string): string {
  return `process:${processKey}`;
}

/**
 * Derive boundary regions from a document — one per distinct non-empty
 * `process` value, in first-appearance order.
 */
export function getSubsystemRegions(
  doc: Pick<SubsystemModelDocument, 'components'>,
): SubsystemProcessRegion[] {
  const byProcess = new Map<string, string[]>();
  for (const c of doc.components) {
    const p = c.process?.trim();
    if (!p) continue;
    const list = byProcess.get(p) ?? [];
    list.push(c.id);
    byProcess.set(p, list);
  }
  return [...byProcess.entries()].map(([key, memberIds]) => ({
    key,
    label: key,
    memberIds,
  }));
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

export const MECHANISM_COLOR: Record<SubsystemEdgeMechanism, string> = {
  imports: '#0893d2', // blue
  imports_from: '#5aa9e6', // light blue
  re_exports: '#3aa5c9', // cyan-blue
  defines: '#2e86ab', // steel blue
  calls: '#4ec9b0', // teal
  extends: '#b48ead', // purple
  inherits: '#9b6fd0', // purple
  implements: '#c586c0', // magenta
  mixes_in: '#d474a8', // pink-magenta
  uses: '#e3b341', // gold
  method: '#c586c0', // magenta
  references: '#e07a5f', // terracotta
  contains: '#6c5ce7', // indigo
  feeds: '#22c55e', // green — data-flow into a processor
  produces: '#e07a5f', // terracotta — emits an output type
  writes: '#2f9e44', // deep green — mutates retained state
  reads: '#0ea5e9', // sky — pulls from retained state
  watches: '#9ca3af', // gray — observes, owns nothing
  'registers-into': '#ff6b35', // orange
};

export const MECHANISM_STYLE: Record<SubsystemEdgeMechanism, 'solid' | 'dashed' | 'dotted'> = {
  imports: 'solid',
  imports_from: 'solid',
  re_exports: 'solid',
  defines: 'solid',
  calls: 'solid',
  extends: 'dashed',
  inherits: 'dashed',
  implements: 'dashed',
  mixes_in: 'dashed',
  uses: 'solid',
  method: 'solid',
  references: 'dotted',
  contains: 'solid',
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
  ['imports', 'import statement (code-level dependency)', true],
  ['imports_from', 'imported by (reverse dependency)', true],
  ['re_exports', 're-exports symbols from', true],
  ['defines', 'defines / declares symbol', true],
  ['calls', 'function/method call (call graph edge)', true],
  ['extends', 'class inheritance', true],
  ['inherits', 'class inheritance', true],
  ['implements', 'implements interface / protocol', true],
  ['mixes_in', 'applies mixin', true],
  ['uses', 'general dependency (import, call, or reference)', false],
  ['method', 'structural: has method / member', true],
  ['references', 'type / symbol reference (not a call)', true],
  ['contains', 'structural: contains / encapsulates', true],
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

export const ROLE_LABEL: Record<SubsystemComponentRole, string> = {
  entry: 'entry',
  service: 'service',
};

/**
 * Primary badge text for a node: prefer framework stereotype over the
 * language construct so a React UI unit reads as "component" / "hook"
 * rather than "function". When both framework and stereotype are set,
 * show `framework · stereotype` (e.g. `react · component`).
 */
export function constructBadgeLabel(component: {
  construct: SubsystemComponentConstruct;
  framework?: string;
  stereotype?: string;
}): string {
  const constructLabel =
    component.construct === 'type_alias' ? 'type alias' : component.construct;
  if (component.stereotype && component.framework) {
    return `${component.framework} · ${component.stereotype}`;
  }
  if (component.stereotype) return component.stereotype;
  return constructLabel ?? '';
}

/** Default CSS floor for component nodes (padding aside). */
export const NODE_CSS_MIN_WIDTH = 150;
/** Inset of each top badge from the node edge (`left` / `right` style). */
export const BADGE_EDGE_INSET = 5;
/** Minimum gap between left construct badge and right role badge. */
const BADGE_PAIR_GAP = 8;
/** Badge box chrome: padding 5+5 + border 1+1. */
const BADGE_BOX_CHROME = 12;
/** Approx monospace uppercase width incl. letter-spacing (~0.5px). */
const BADGE_CHAR_WIDTH = 8;

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
}): number {
  const left = estimateBadgeLabelWidth(constructBadgeLabel(component));
  if (component.role == null) {
    return Math.max(NODE_CSS_MIN_WIDTH, BADGE_EDGE_INSET + left + BADGE_EDGE_INSET);
  }
  const right = estimateBadgeLabelWidth(ROLE_LABEL[component.role]);
  return Math.max(
    NODE_CSS_MIN_WIDTH,
    BADGE_EDGE_INSET + left + BADGE_PAIR_GAP + right + BADGE_EDGE_INSET,
  );
}

/**
 * Convert a subsystem graph document into React Flow nodes. Components that
 * carry a `process` get a `parentId` pointing at their boundary group node
 * (`process:<process>`); nodes without one stay top-level (outside every
 * boundary). The initial grid groups by `process ?? purl` so the pre-ELK
 * positions are already clustered; ELK then refines with compound layout.
 */
export function convertSubsystemToNodes(
  doc: SubsystemModelDocument,
  opts: { maxNodeWidth?: number } = {},
): SubsystemGraphNode[] {
  const { maxNodeWidth } = opts;
  // Group components into boundary regions by process when authored, else by
  // package. Process is runtime membership (drawn as one boundary region);
  // purl is code identity — nodes without a process (external actors,
  // services, libraries) fall back to purl and sit outside every boundary.
  const byPkg = new Map<string, SubsystemComponent[]>();
  for (const c of doc.components) {
    const regionKey = c.process ?? c.purl;
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
      const processKey = c.process?.trim();
      nodes.push({
        id: c.id,
        type: 'subsystem-component',
        ...(processKey ? { parentId: processGroupNodeId(processKey) } : {}),
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
 * Convert boundary regions into React Flow parent (group) nodes. One per
 * distinct `process` value; member components point at these via `parentId`.
 * Positions/sizes are placeholders — ELK compound layout overwrites them.
 */
export function convertSubsystemToGroups(
  doc: Pick<SubsystemModelDocument, 'components'>,
): SubsystemGraphNode[] {
  return getSubsystemRegions(doc).map((region) => ({
    id: processGroupNodeId(region.key),
    type: 'subsystem-group',
    position: { x: 0, y: 0 },
    width: 400,
    height: 300,
    data: { region },
  }));
}

/**
 * Convert a subsystem graph document into React Flow edges. Edges whose target
 * is an external label (not a component id) point at a synthetic stub so the
 * relationship is visible without a member node.
 */
export function convertSubsystemToEdges(doc: SubsystemModelDocument): SubsystemGraphEdge[] {
  const compIds = new Set(doc.components.map((c) => c.id));
  const edges: SubsystemGraphEdge[] = [];

  for (const e of doc.edges) {
    const color = MECHANISM_COLOR[e.mechanism];
    const style = MECHANISM_STYLE[e.mechanism];
    // If `to` is a real component, connect directly; otherwise point at a stub node.
    const isExternal = !compIds.has(e.to);
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
  doc: Pick<SubsystemModelDocument, 'components' | 'edges'>,
): string {
  const components = doc.components
    .map(({ id, purl, name, symbol, construct, file, purpose, process }) =>
      [id, purl, name, symbol ?? '', construct, file, purpose ?? '', process ?? ''].join('\0'))
    .sort()
    .join('\n');
  const edgeKey = doc.edges
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
  opts: { maxNodeWidth?: number; showEdgeLabels?: boolean; measuredWidths?: Map<string, number>; measuredHeights?: Map<string, number> } = {},
): Promise<{
  nodes: SubsystemGraphNode[];
  edges: SubsystemGraphEdge[];
  regions: SubsystemProcessRegion[];
}> {
  const { maxNodeWidth, showEdgeLabels, measuredWidths, measuredHeights } = opts;
  const nodes = convertSubsystemToNodes(doc, { maxNodeWidth });
  const edges = convertSubsystemToEdges(doc);
  // Boundary regions: one per multi-member process. Singletons get no frame —
  // strip the parentId convertSubsystemToNodes stamped so React Flow never
  // points at a non-existent parent.
  const regions = getSubsystemRegions(doc).filter((r) => r.memberIds.length >= 2);
  const regionKeys = new Set(regions.map((r) => r.key));
  for (const n of nodes) {
    if (n.type !== 'subsystem-component') continue;
    const proc = (n.data as SubsystemGraphNodeData).component?.process?.trim();
    if (proc && !regionKeys.has(proc)) {
      delete (n as { parentId?: string }).parentId;
    }
  }

  // External edge targets that aren't real components → create stub nodes so
  // cross-package edges have something to land on.
  const realIds = new Set(doc.components.map((c) => c.id));
  const externalIds: string[] = [];
  for (const e of doc.edges) {
    if (!realIds.has(e.to)) {
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
          id: extId,
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

  // ELK auto-layout: position nodes (layered, minimized crossings) with
  // process partitions as compound parents so boundaries shape the layout.
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
        groups: regions.map((r) => ({
          id: processGroupNodeId(r.key),
          memberIds: r.memberIds,
        })),
      });
      const groupNodes: SubsystemGraphNode[] = regions.flatMap((region) => {
        const bounds = result.groupBounds.get(processGroupNodeId(region.key));
        if (!bounds) return [];
        const group: SubsystemGraphNode = {
          id: processGroupNodeId(region.key),
          type: 'subsystem-group',
          position: { x: bounds.x, y: bounds.y },
          width: Math.max(200, bounds.width),
          height: Math.max(160, bounds.height),
          data: { region },
        };
        return [group];
      });
      // Parents first — React Flow resolves children via parentId.
      placedNodes = [...groupNodes, ...(result.nodes as SubsystemGraphNode[])];
      labelPositions = result.edgeLabelPositions;
      elkPathStrings = result.edgePaths;
      elkPathPoints = result.edgePathPoints;
    } catch (err) {
      // Fall back to the (unpositioned) grid if ELK is unavailable.
      console.warn('[subsystem-graph] ELK layout failed, using manual positions:', err);
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
