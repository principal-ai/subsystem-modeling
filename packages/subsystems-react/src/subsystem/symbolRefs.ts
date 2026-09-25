/**
 * Referenced symbols inside a component's declaration.
 *
 * A declaration mentions other symbols — parameter/return types, property
 * types, `extends`/`implements`, and related callables (`callers`/`callees`,
 * `references`/`usedBy`). This module flattens the structured declaration into
 * a deduped, lookup-friendly list so the panel can offer a graphify inspection
 * per name, and defines the payload graphify returns for one.
 *
 * Slice 1 is display-only: the inspection payload is produced by the host (or,
 * in stories, by a fixture). Nothing here reads the graph.
 */

import type { GraphifyComponentDetail, GraphifyReferenceInfo } from '../graphify';

/** One symbol a declaration references, normalized for lookup. */
export interface DeclarationSymbolRef {
  /** Referenced name as written (e.g. `SessionRecord`), no call/`()` decoration. */
  name: string;
  /** Graphify node id when the backing reference carried one. */
  nodeId?: string;
  /** Reference context (`parameter_type`, `return_type`, `field`, `caller`, …). */
  context?: string;
  /** `L<line>` of the reference site, when known. */
  sourceLocation?: string;
}

// ---------------------------------------------------------------------------
// Graphify inspection payload
// ---------------------------------------------------------------------------

/**
 * How a symbol resolved against the cached graphify graph. Name-first, so it
 * mirrors the type-ref resolver (`graphify/resolve.ts`) rather than component
 * anchoring — there is no claimed file to fall back to.
 */
export type SymbolInspectionResolution =
  /** Exactly one definition node for the name. */
  | 'resolved'
  /** Referenced, but no definition in this corpus (external / ambient type). */
  | 'unresolved'
  /** Multiple same-label definitions. */
  | 'ambiguous'
  /** The name isn't in the graph at all. */
  | 'missing';

export interface SymbolInspectionNode {
  nodeId: string;
  label: string;
  /** Repo-root-relative source path. */
  sourceFile?: string;
  /** `L<line>` of the definition. */
  sourceLocation?: string;
  fileType?: string;
  community?: string;
}

export interface SymbolInspectionCandidate {
  nodeId: string;
  label: string;
  sourceFile?: string;
}

/**
 * The actual source declaration, read from the checkout at the node's anchor.
 * Used when graphify resolved a location but couldn't reconstruct the shape.
 */
export interface SymbolInspectionSource {
  file: string;
  startLine?: number;
  /** Declaration text as read from source. */
  text: string;
}

/**
 * What graphify has on one symbol. The useful payload is `declaration` — the
 * symbol's declaration shape, rebuilt from graph edges — with `source` as the
 * fallback when graphify knows where the symbol is but not what it is.
 * `resolution` and `candidates` explain a miss; the rest of the graph's
 * inference bookkeeping is deliberately not part of this payload.
 */
export interface SymbolInspection {
  symbol: string;
  purl?: string;
  resolution: SymbolInspectionResolution;
  node?: SymbolInspectionNode;
  /** The symbol's declaration, when graphify could reconstruct it. */
  declaration?: GraphifyComponentDetail;
  /** The declaration as read from source, when only the location is known. */
  source?: SymbolInspectionSource;
  candidates?: SymbolInspectionCandidate[];
  /** Human-readable reason when there's neither a declaration nor source. */
  reason?: string;
}

/**
 * True when there's no declaration to show — either graphify couldn't resolve
 * the symbol or couldn't reconstruct its shape. The case where offering
 * "add to model + agent" is worthwhile.
 */
export function isLimitedInspection(
  info: SymbolInspection | null | undefined,
): boolean {
  return !info?.declaration;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/** Names that carry no lookup value — primitives and non-identifiers. */
const PRIMITIVES: ReadonlySet<string> = new Set([
  'string',
  'number',
  'boolean',
  'bigint',
  'symbol',
  'void',
  'null',
  'undefined',
  'never',
  'any',
  'unknown',
  'object',
  'true',
  'false',
  'self',
  'None',
  'True',
  'False',
  'bool',
  'int',
  'float',
  'str',
  'bytes',
  'list',
  'dict',
  'tuple',
  'set',
]);

/**
 * Global / ambient namespaces and utility types. These aren't defined in the
 * repo, so surfacing them as clickable would only ever dead-end — leave them
 * plain text.
 */
const GLOBAL_NAMESPACES: ReadonlySet<string> = new Set([
  'JSX',
  'React',
  'NodeJS',
  'Intl',
  'globalThis',
]);

const GLOBAL_TYPES: ReadonlySet<string> = new Set([
  'HTMLElement',
  'Element',
  'Event',
  'Error',
  'Date',
  'RegExp',
  'Function',
  'Object',
  'Array',
  'ReadonlyArray',
  'ReadonlySet',
  'ReadonlyMap',
  'Promise',
  'PromiseLike',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Iterable',
  'Iterator',
  'AsyncIterable',
  'Generator',
  'Partial',
  'Required',
  'Readonly',
  'Record',
  'Pick',
  'Omit',
  'Exclude',
  'Extract',
  'ReturnType',
  'Parameters',
  'Awaited',
  'NonNullable',
  'InstanceType',
]);

function isKnownGlobal(name: string): boolean {
  if (PRIMITIVES.has(name) || GLOBAL_TYPES.has(name)) return true;
  const root = name.includes('.') ? name.split('.')[0]! : name;
  return GLOBAL_NAMESPACES.has(root);
}

/** A bare (optionally dotted) identifier we can look up by name. */
function isSimpleSymbolName(type: string | undefined | null): boolean {
  if (!type) return false;
  const t = type.trim();
  if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(t)) return false;
  return !isKnownGlobal(t);
}

/**
 * Named types buried in a composite type expression — generic args, inline
 * object members, unions, callable signatures. Property/parameter names are
 * dropped (they sit before a `:`); only type-position identifiers survive, and
 * only PascalCase ones, so `{ nodes: SubsystemGraphNode[] }` yields
 * `SubsystemGraphNode`, not `nodes`.
 */
function extractNestedTypeNames(type: string): string[] {
  let s = type;
  s = s.replace(/`(?:\\.|[^`\\])*`/g, ' ');
  s = s.replace(/'(?:\\.|[^'\\])*'/g, ' ');
  s = s.replace(/"(?:\\.|[^"\\])*"/g, ' ');
  // Drop property/parameter names: an identifier immediately before `:`/`?:`.
  s = s.replace(/([A-Za-z_$][\w$]*)\s*\??\s*:/g, ':');
  const found = new Set<string>();
  const re = /[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const raw = m[0]!;
    const root = raw.includes('.') ? raw.split('.')[0]! : raw;
    // Type names are PascalCase; skips keywords (`keyof`, `typeof`, …).
    if (!/^[A-Z]/.test(root)) continue;
    if (isKnownGlobal(raw)) continue;
    found.add(raw);
  }
  return [...found];
}

/**
 * Normalize a callable/related label (`normalize()`, `.get`, `capture-session`)
 * to a name. Labels are freer than type expressions — kebab-case is common.
 */
function normalizeRelatedName(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().replace(/^\./, '').replace(/\(\)$/, '');
  if (!/^[A-Za-z_$][\w$.-]*$/.test(t)) return null;
  return PRIMITIVES.has(t) ? null : t;
}

/**
 * Flatten a declaration into the set of symbols it references, deduped by name.
 * Entries backed by a `nodeId` win over bare-name entries.
 */
export function extractDeclarationSymbolRefs(
  declaration: GraphifyComponentDetail | undefined,
): DeclarationSymbolRef[] {
  if (!declaration) return [];

  const byName = new Map<string, DeclarationSymbolRef>();
  const add = (
    name: string | null | undefined,
    opts: { ref?: GraphifyReferenceInfo; context?: string; sourceLocation?: string } = {},
  ) => {
    if (!name) return;
    const existing = byName.get(name);
    const nodeId = opts.ref?.nodeId;
    const next: DeclarationSymbolRef = {
      name,
      nodeId: nodeId ?? existing?.nodeId,
      context: opts.ref?.context ?? opts.context ?? existing?.context,
      sourceLocation:
        opts.ref?.source_location ?? opts.sourceLocation ?? existing?.sourceLocation,
    };
    // Prefer the richer entry when we already have one with a nodeId.
    if (existing?.nodeId && !nodeId) return;
    byName.set(name, next);
  };

  const addType = (
    type: string | undefined,
    ref?: GraphifyReferenceInfo,
    context?: string,
  ) => {
    if (!type) return;
    const t = type.trim();
    if (isSimpleSymbolName(t)) {
      add(t, { ref, context });
      return;
    }
    // Composite type: surface the named types nested inside it.
    for (const name of extractNestedTypeNames(t)) add(name, { context });
  };

  const addCall = (
    call: { name?: string; source_location?: string } | undefined,
    context: string,
  ) => {
    if (!call) return;
    add(normalizeRelatedName(call.name), {
      context,
      sourceLocation: call.source_location,
    });
  };

  switch (declaration.kind) {
    case 'function':
      for (const p of declaration.parameters ?? []) addType(p.type, p.ref, 'parameter_type');
      addType(declaration.returnType, declaration.returnTypeRef, 'return_type');
      for (const c of declaration.callers ?? []) addCall(c, 'caller');
      for (const c of declaration.callees ?? []) addCall(c, 'callee');
      break;
    case 'method':
      for (const p of declaration.parameters ?? []) addType(p.type, p.ref, 'parameter_type');
      addType(declaration.returnType, undefined, 'return_type');
      break;
    case 'class':
      for (const m of declaration.methods ?? []) {
        for (const p of m.parameters ?? []) addType(p.type, p.ref, 'parameter_type');
        addType(m.returnType, m.returnTypeRef, 'return_type');
      }
      for (const p of declaration.properties ?? []) {
        addType(p.type, p.typeRef, 'field');
      }
      for (const name of declaration.extends ?? []) addType(name, undefined, 'extends');
      for (const name of declaration.implements ?? []) addType(name, undefined, 'implements');
      for (const r of declaration.references ?? []) {
        add(normalizeRelatedName(r.name), { ref: r, context: r.context ?? 'references' });
      }
      break;
    case 'type':
      for (const p of declaration.properties ?? []) {
        addType(p.type, p.typeRef, 'field');
      }
      for (const r of declaration.usedBy ?? []) {
        add(normalizeRelatedName(r.name), { ref: r, context: r.context ?? 'usedBy' });
      }
      for (const name of declaration.implementors ?? []) addType(name, undefined, 'implementor');
      addType(declaration.aliasOf, undefined, 'alias');
      for (const alt of declaration.unionOf ?? []) addType(alt, undefined, 'union');
      break;
    case 'store':
      for (const p of declaration.properties ?? []) {
        addType(p.type, p.typeRef, 'field');
      }
      break;
    default:
      break;
  }

  return [...byName.values()];
}
