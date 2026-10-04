/**
 * C4 elements — the authored boxes on a diagram.
 *
 * A C4 diagram says something a code model cannot: *these* runs of code are
 * one deployable unit, *this* component has no home, *this* external system is
 * outside our boundary. That is an architectural judgement, and no amount of
 * reading `process` strings will produce it — `process` answers "where does
 * this run", which is a different question.
 *
 * So the element list is authored, and so is the `C4Model` projected from it.
 * There is no builder here: how edges are determined is still open, so a caller
 * supplies the drawable model directly rather than having trails converted into
 * lines.
 *
 * The element set is an umbrella over a model, not a standalone artifact: what
 * sits inside a box resolves from the model document's `process` fields, folded
 * to the claiming container's key by accepted consolidation records (see
 * `c4Evidence`). Nothing here stores membership, so nothing here can drift from
 * the model it organizes.
 *
 * ## Why a union and not one type with two axes
 *
 * C4's vocabulary is closed: software system, container, component, code —
 * plus person outside the boundary. An earlier shape here carried a `level`
 * (where it sits) and a `type` (what it is) as independent fields, which let
 * combinations that mean nothing (`external` + `data-store`) and invented one
 * that contradicts C4 (`library`, which is "typically not" an element at all).
 *
 * Four types carry only the fields the [C4 notation] requires for them:
 *
 *   - technology is required on containers and components, optional on an
 *     external system, absent on a person
 *   - a component names its container, because a C4 component belongs to
 *     exactly one container
 *   - there is no `library` type; a package that is not a deployable unit is
 *     recorded as a review comment, not a new element kind
 *
 * [C4 notation]: https://c4model.com/diagrams/notation
 */

/**
 * Has anyone signed off on this element yet?
 *
 * `proposed` is what an agent writes and a human has not looked at. `accepted`
 * is a human decision. `rejected` means the proposal was wrong and the box
 * should not be drawn at all.
 */
export type C4ElementState = 'proposed' | 'accepted' | 'rejected';

/** Fields every element carries, whatever its kind. */
interface C4ElementBase {
  /**
   * Stable identity: `container:studio-host`. Survives member churn, so a
   * reviewer's accept/reject keeps pointing at the same box next week.
   */
  id: string;
  /** Display name. */
  label: string;
  /**
   * Nesting parent. A component's container, or a container's system frame.
   * Absent on an external system or a person — both are outside the boundary:
   * an external is someone else's system, a person is never part of one.
   */
  parentId?: string;
  /** C4 asks every element to carry a one-line responsibility. */
  description?: string;
  state: C4ElementState;
  /** Why this element is proposed as it is — shown in the confirm UI. */
  rationale?: string;
  /** The component aliases this element groups. */
  members?: string[];
  /** Distinct constructs among the members, when resolved from a document. */
  constructs?: string[];
  /** Source model ids that contributed members, when attribution is supplied. */
  models?: string[];
  /** When the state last changed (ISO). */
  decidedAt?: string;
}

/**
 * What kind of thing a container is.
 *
 * C4 recognises exactly two: an `application` (a deployable program) or a
 * `data-store` (something the system reads or writes). There is deliberately
 * no `queue` kind — c4model is explicit that an individual queue or topic *is*
 * a data store, and that the message bus itself is not a container at all, so
 * a queue is a `data-store` whose technology/label say "queue".
 */
export type C4ContainerKind = 'application' | 'data-store';

/** A deployable unit or a store — the C4 level 2 box. */
export interface C4Container extends C4ElementBase {
  kind: 'container';
  /** What sort of container this is. */
  containerKind: C4ContainerKind;
  /** C4 requires a technology on every container. */
  technology: string;
  /**
   * The `process` key this container claims — the boundary it verifies,
   * matched exactly against the model document's keys. Not a member list:
   * the components inside resolve from the model document.
   */
  process?: string;
}

/**
 * A functional grouping inside a container — the C4 level 3 box.
 *
 * `container` is required, not inferred. C4 says all components inside a
 * container share one process space, so a component has exactly one parent;
 * inferring it from member overlap gets that wrong whenever one concept is
 * split across containers (an RPC bridge with a renderer half and a host half),
 * which is precisely the case worth being able to state.
 */
export interface C4Component extends C4ElementBase {
  kind: 'component';
  /** The id of the container this component sits inside. */
  container: string;
  /** C4 requires a technology on every component. */
  technology: string;
}
/** A software system outside the boundary we are drawing. */
export interface C4ExternalSystem extends C4ElementBase {
  kind: 'external-system';
  /** Often unknown for a third-party system, so optional here. */
  technology?: string;
}

/** A person. Outside the boundary, and never has technology. */
export interface C4Person extends C4ElementBase {
  kind: 'person';
}

/** One element. Four kinds, no fifth. */
export type C4Element = C4Container | C4Component | C4ExternalSystem | C4Person;

/**
 * A whole authored element list, for one repo or composed graph. This is the
 * shape the durable element store persists (`~/.principal/c4-elements/<purl>.json`):
 * **accepted elements only** — the set is the approved architecture, not a
 * history. `proposed` exists only on in-memory proposal scaffolds and is never
 * persisted; a rejected proposal stays remembered by the proposal store, which
 * is where proposing agents consult prior rejections.
 */
export interface C4ElementSet {
  /** Repo key this set describes, e.g. `pkg:github/owner/name`. */
  repoKey: string;
  /** ISO timestamp of the last change. */
  updatedAt?: string;
  elements: C4Element[];
}

/** Which level to draw. Determines which frames are drawn. */
export type C4View = 'container' | 'component';

/**
 * A compound frame the renderer draws: the system, or a container holding its
 * components. Never authored — `deriveC4Groups` produces these from the element
 * `parentId` chains and the current scope.
 */
export interface C4Group {
  id: string;
  kind: 'system' | 'container';
  label: string;
  parentId?: string;
  memberIds: string[];
}

/**
 * Derive the frames to draw from the elements and the current scope.
 *
 * A container becomes a frame whenever its components are on screen — in the
 * component view, or when it is the opened container. The system frame wraps
 * whichever containers are drawn. No frame is authored; this is the view of the
 * element set, so a container's identity (id, label, technology, colour) lives
 * only on the element.
 */
export function deriveC4Groups(
  model: Pick<C4Model, 'view' | 'system' | 'nodes' | 'openContainerId'>,
): C4Group[] {
  const groups: C4Group[] = [];
  const containers = model.nodes.filter((n): n is C4Container => n.kind === 'container');
  const components = model.nodes.filter((n): n is C4Component => n.kind === 'component');

  const opened = model.openContainerId ?? null;
  // Component view shows every container's components; container view shows a
  // container's components only when it is opened.
  const framing = (containerId: string): boolean =>
    model.view === 'component' || opened === containerId;

  const framedContainers: string[] = [];
  for (const c of containers) {
    const members = components
      .filter((comp) => (comp.container ?? comp.parentId) === c.id)
      .map((comp) => comp.id);
    if (members.length > 0 && framing(c.id)) {
      groups.push({
        id: c.id,
        kind: 'container',
        label: c.label,
        parentId: model.system.id,
        memberIds: members,
      });
      framedContainers.push(c.id);
    }
  }

  // The system frame wraps the framed containers (component view) or the whole
  // set of containers (container view) — the boundary is the system, so it must
  // NOT shrink to the opened container. Opening one adds a nested container
  // frame inside it; the system frame still spans everything.
  const systemMembers =
    model.view === 'component' ? framedContainers : containers.map((c) => c.id);
  if (systemMembers.length > 0) {
    groups.push({
      id: model.system.id,
      kind: 'system',
      label: model.system.label,
      memberIds: systemMembers,
    });
  }

  return groups;
}

/**
 * A line between two elements. Authored, like the boxes.
 *
 * C4 asks a container-diagram line to say the *technology/protocol* of the
 * interaction (`protocol`), and the label is that plus the trail verbs where
 * known. `label` is what the chip shows; `protocol` and `mechanisms` are kept
 * separate so a caller can render either.
 */
export interface C4Edge {
  id: string;
  source: string;
  target: string;
  /** Text the edge chip shows, e.g. `RPC` or `calls (HTTP)`. */
  label: string;
  /** The interaction's technology/protocol, e.g. `RPC`, `HTTP`, `stdin`. */
  protocol?: string;
  /** Trail verbs that produced this line (`calls`, `writes`, …). */
  mechanisms: string[];
  /** How many underlying steps this line rolled up. */
  count: number;
}

/**
 * Protocol hues, keyed by a canonical protocol token.
 *
 * C4's notation is colour-free, so this is a local choice — but on a container
 * diagram the protocol is what a reader wants to distinguish at a glance
 * (in-process RPC vs HTTP vs file I/O), more than the trail verb the line came
 * from. Keys are lowercase, matched loosely (see `protocolColor`).
 */
export const PROTOCOL_COLOR: Record<string, string> = {
  rpc: '#22c55e', // green — in-process call across a boundary
  http: '#e8853a', // orange — network request
  https: '#e8853a',
  rest: '#e8853a',
  graphql: '#e061a3', // pink
  fs: '#0ea5e9', // sky — disk
  'file i/o': '#0ea5e9',
  sql: '#a78bfa', // violet — a database
  sqlite: '#a78bfa',
  postgres: '#a78bfa',
  'json-rpc': '#22c55e',
  ws: '#e3b341', // gold — stream/socket
  websocket: '#e3b341',
  mcp: '#4ec9b0', // teal — agent/tool transport
  stdin: '#9ca3af', // gray — process boundary
  stdout: '#9ca3af',
};

/** Fallback hue for an edge whose protocol we have no colour for (or none). */
export const PROTOCOL_COLOR_FALLBACK = '#9ca3af';

/**
 * Colour for an edge's protocol. Matches the longest known token contained in
 * the (lowercased) protocol string, so `Electrobun RPC` finds `rpc` and
 * `JSON-RPC` finds the `json-rpc` entry before `rpc`.
 */
export function protocolColor(protocol: string | undefined): string {
  if (!protocol) return PROTOCOL_COLOR_FALLBACK;
  const p = protocol.toLowerCase();
  let best = '';
  for (const key of Object.keys(PROTOCOL_COLOR)) {
    if (key.length > best.length && p.includes(key)) best = key;
  }
  return best ? PROTOCOL_COLOR[best]! : PROTOCOL_COLOR_FALLBACK;
}

/**
 * A drawable C4 projection. Authored: the boxes and lines, nothing drawn for
 * you. Frames are derived by the renderer from the elements' `parentId` chains
 * — a container is a frame when its components are being shown (component view,
 * or opened via `openContainerId`), never a separately-authored thing.
 */
export interface C4Model {
  view: C4View;
  system: { id: string; label: string; repoKey?: string };
  nodes: C4Element[];
  edges: C4Edge[];
  /**
   * Drill-down scope: the id of a container whose components should be shown
   * inside it as a frame. Absent/null → the container is drawn as a box and its
   * components are hidden. The renderer derives the frames either way.
   */
  openContainerId?: string | null;
}

/**
 * `owner/name` from a purl, trimmed of scheme and fragment. Used to label the
 * system frame when a repo key is known.
 */
export function labelFromPurl(purl: string): string {
  const base = purl.replace(/^external:/, '').split('#')[0]?.trim() ?? '';
  const parts = base.split('/').filter(Boolean);
  return parts.slice(-2).join('/') || base || purl;
}
