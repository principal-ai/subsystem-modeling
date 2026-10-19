/**
 * Symbol-focused view projection: one graphify node (the focal symbol) plus its
 * radius-1 neighborhood, mapped onto inputs the subsystem canvas can draw.
 *
 * This is a projection, not an authored model. The center and its neighbors
 * stay graphify nodes and the relations are passed through with their raw
 * verbs (`calls`, `imports`, ……), so the canvas colors them from the graphify
 * palette and draws them dashed — derived facts, never subsystem claims.
 *
 * Containment is expressed structurally, the way an authored model does it:
 * the center's file becomes a `module` frame (its members carry `module`), and
 * `contains` edges are dropped because the frame already says it.
 */

import type { GraphifyEdge, GraphifyNode } from './types';
import { inferConstructFromGraphify } from './construct';
import type { InferredGraphifyConstruct } from './construct';
import type {
  SubsystemComponent,
  SubsystemComponentConstruct,
  SubsystemGraphifyRelation,
} from '../subsystem/model';

/** The focal node and the slice of the graph around it. */
export interface SymbolFocusedViewInput {
  /** The symbol the view is about. */
  center: GraphifyNode;
  /** graphify nodes adjacent to the center (typically what its edges reach). */
  neighbors: readonly GraphifyNode[];
  /** Edges to draw — pass the center's incident edges plus any neighbor-to-neighbor edges worth showing. */
  edges: readonly GraphifyEdge[];
}

export interface SymbolFocusedViewOptions {
  /** PURL of the repo the graphify ids were built from (e.g. `pkg:github/o/r`). */
  repoPurl: string;
  /**
   * Construct to draw the center as. Defaults to graphify's inferred construct.
   * Pass an override when the host has a stronger claim (a verified
   * declaration, an audit finding): inference reads structure only, so a bare
   * type node with no `implements` edge infers as `unknown`.
   */
  centerConstruct?: SubsystemComponentConstruct;
}

/** Canvas inputs for one focal symbol. */
export interface SymbolFocusedViewGraph {
  components: SubsystemComponent[];
  graphifyRelations: SubsystemGraphifyRelation[];
}

/**
 * graphify's inferred vocabulary has no `module` construct — files are module
 * *frames* on this canvas, not nodes — and no subsystem-specific constructs
 * (`store`, `custom_entity`), so those fall back to the construct that draws
 * as a plain box.
 */
const INFERRED_TO_CONSTRUCT: Record<InferredGraphifyConstruct, SubsystemComponentConstruct> = {
  class: 'class',
  function: 'function',
  method: 'method',
  type: 'interface',
  module: 'external',
  unknown: 'external',
};

function parseLine(location?: string | null): number | undefined {
  const m = /^L(\d+)$/.exec(location ?? '');
  return m ? Number(m[1]) : undefined;
}

/**
 * Graphify labels carry their own decoration: functions end `name()`, methods
 * start `.name()`. A subsystem `symbol` is the bare code identity and the node
 * renderer re-derives the `()` / `.` decoration itself, so passing a decorated
 * label through would double it.
 */
function symbolOf(label: string): string {
  let s = label.trim();
  if (s.endsWith('()')) s = s.slice(0, -2);
  if (s.startsWith('.')) s = s.slice(1);
  return s;
}

/**
 * Project one graphify symbol and its neighborhood onto canvas inputs.
 *
 * Callees are stamped with the CALL-SITE line from the center's outgoing
 * edges, not their own declaration line — `orderByLine` then stacks them in
 * the order the center reaches them, which is what a focused view is read for.
 */
export function toSymbolFocusedView(
  input: SymbolFocusedViewInput,
  options: SymbolFocusedViewOptions,
): SymbolFocusedViewGraph {
  const { center, neighbors, edges } = input;
  const centerFile = typeof center.source_file === 'string' ? center.source_file : '';
  const purlFor = (file: string): string => (file ? `${options.repoPurl}#${file}` : options.repoPurl);

  // The file node standing for the center's own file is dropped: its
  // containment becomes the frame around the center and its same-file
  // neighbors. Files reached in OTHER files stay as nodes.
  const members = neighbors.filter(
    (n) =>
      n.id !== center.id &&
      !(
        inferConstructFromGraphify(n, edges).construct === 'module' &&
        typeof n.source_file === 'string' &&
        n.source_file === centerFile
      ),
  );

  const aliasById = new Map<string, string>([[center.id, 'center']]);
  members.forEach((n, i) => aliasById.set(n.id, `n${i}`));

  const centerConstruct =
    options.centerConstruct ??
    INFERRED_TO_CONSTRUCT[inferConstructFromGraphify(center, edges).construct];
  const centerLine = parseLine(center.source_location);

  const centerComponent: SubsystemComponent = {
    alias: 'center',
    name: symbolOf(center.label),
    symbol: symbolOf(center.label),
    construct: centerConstruct,
    file: centerFile,
    purl: purlFor(centerFile),
    purpose: `graphify center — ${center.label}`,
    ...(centerLine != null ? { line: centerLine } : {}),
    ...(centerConstruct !== 'external' && centerFile ? { module: centerFile } : {}),
  };

  // `component.line` is the call site for a callee: the center's outgoing edge
  // location. A callee the center does not reach keeps its declaration line.
  const callLineByAlias = new Map<string, number>();
  for (const e of edges) {
    if (e.source !== center.id) continue;
    const to = aliasById.get(e.target);
    const line = parseLine(e.source_location);
    if (to && line != null) callLineByAlias.set(to, line);
  }

  const components: SubsystemComponent[] = [centerComponent];
  members.forEach((n, i) => {
    const alias = `n${i}`;
    const inferred = inferConstructFromGraphify(n, edges).construct;
    const construct = INFERRED_TO_CONSTRUCT[inferred];
    const file = typeof n.source_file === 'string' ? n.source_file : '';
    const line = callLineByAlias.get(alias) ?? parseLine(n.source_location);
    const symbol = symbolOf(n.label);
    components.push({
      alias,
      name: symbol,
      symbol,
      construct,
      file,
      purl: purlFor(file),
      purpose:
        inferred === 'module'
          ? 'graphify file node in another file — kept as a node (outside the center frame)'
          : `graphify ${inferred} neighbor`,
      ...(line != null ? { line } : {}),
      // Members of the center's file join its frame; others stand alone.
      ...(file && file === centerFile ? { module: centerFile } : {}),
    });
  });

  // Raw graphify edges, passed straight through (no verb folding).
  // `contains` is dropped: the frame carries containment, not an edge.
  const graphifyRelations: SubsystemGraphifyRelation[] = [];
  edges.forEach((e, i) => {
    if (e.relation === 'contains') return;
    const from = aliasById.get(e.source);
    const to = aliasById.get(e.target);
    if (!from || !to) return;
    const line = parseLine(e.source_location);
    graphifyRelations.push({
      id: `g${i}`,
      from,
      to,
      relation: e.relation,
      ...(e.source_file ? { refs: [e.source_file] } : {}),
      ...(line != null ? { line } : {}),
      ...(e.confidence ? { confidence: e.confidence } : {}),
      ...(e.context ? { context: e.context } : {}),
    });
  });

  return { components, graphifyRelations };
}
