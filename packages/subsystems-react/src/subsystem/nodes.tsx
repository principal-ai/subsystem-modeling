/**
 * Subsystem component/group node + edge renderers.
 *
 * Lightweight, purpose-built for the subsystem component graph: a component
 * renders its name (kind-tagged, colored by package) plus its symbol/purpose.
 * Groups render as package containers. Clicking
 * a component calls `onSelect` (to open the entry point / file).
 */

import { useState } from 'react';
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
  type EdgeProps,
} from '@xyflow/react';
import { useTheme } from '@principal-ade/industry-theme';
import {
  MECHANISM_COLOR,
  MECHANISM_STYLE,
  ROLE_COLOR,
  ROLE_LABEL,
  constructBadgeLabel,
  deriveNameFromSymbol,
  BADGE_EDGE_INSET,
  nodeMinWidthForBadges,
  packageColor,
  type SubsystemGraphNodeData,
  type SubsystemGroupNodeData,
  type SubsystemGraphEdge,
} from './model';
import { constructColorsFromPierreTheme } from '../pierre/constructColors';
import { resolvePierreSyntaxThemeName } from '../pierre/pierreSyntaxTheme';

export const CONSTRUCT_LABEL: Record<string, string> = {
  class: 'class',
  function: 'function',
  method: 'method',
  interface: 'interface',
  type_alias: 'type alias',
  enum: 'enum',
  module: 'module',
  store: 'store',
  external: 'external',
};

/** Insert zero-width spaces at identifier word boundaries so long names wrap
 *  on naming conventions (snake_case `foo_`|`bar`, camelCase `foo`|`Bar`,
 *  PascalCase `Foo`|`Bar`, acronym `ABC`|`Def`) instead of mid-character. */
function breakWords(s: string): string {
  const zwsp = '\u200b';
  return s
    // camelCase: lower/digit → Upper  (and the boundary before it holds)
    .replace(/([a-z0-9])([A-Z])/g, `$1${zwsp}$2`)
    // acronym → word: `ABC`|`Def` (two Uppercase then a lowercase)
    .replace(/([A-Z])([A-Z][a-z])/g, `$1${zwsp}$2`)
    // separators: break after `_`, `-`, `.`
    .replace(/([_\-.])([^_\-.\u200b])/g, `$1${zwsp}$2`);
}

export interface SubsystemGraphCallbacks {
  /** Click a component — open its file/entry point. */
  onSelect?: (componentId: string) => void;
  /** Click the filename badge — open that component's file in the drawer
   *  (same path as clicking the file link in the declaration panel). */
  onOpenFile?: (componentId: string) => void;
  /** Click an edge (or its label) — select the relationship. */
  onEdgeSelect?: (edgeId: string) => void;
  /** Hover a component (null on leave) — associates it with the file tree. */
  onHover?: (componentId: string | null) => void;
  /** Upper bound for node width; nodes grow with content up to this, then wrap. */
  maxNodeWidth?: number;
}

/** Root callbacks carried through node data (injected by the graph component). */
export const SUBSYSTEM_CALLBACKS: SubsystemGraphCallbacks = {};

export function SubsystemComponentNode(props: NodeProps<Node<SubsystemGraphNodeData, 'subsystem-component'>>) {
  const { theme, mode } = useTheme();
  const { data, selected, width: nodeWidth, height: nodeHeight } = props;
  const c = data.component;
  // Construct owns node color, derived from the active Pierre syntax theme —
  // the same palette the declaration panel and file drawer render with. Role
  // shows as the hover badge, not as color — for now; a role glyph/accent may
  // come later.
  const color = constructColorsFromPierreTheme(resolvePierreSyntaxThemeName(mode))[c.construct];
  const [hover, setHover] = useState(false);
  const configuredMax = SUBSYSTEM_CALLBACKS.maxNodeWidth;
  const maxWidth = configuredMax ?? 300;
  // `symbol` is the source of truth; `name` is derived from it consistently.
  const displayName = deriveNameFromSymbol(c.symbol, c.construct, c.name, c.file, c.stereotype);
  // Top badges are absolutely positioned — widen the node so they nowrap
  // instead of wrapping, including when construct + role badges share the top.
  const badgeMinWidth = nodeMinWidthForBadges(c);
  // Set while a file is open in the drawer: true → spotlight, false → dim,
  // absent (no file open) → neutral.
  const fileMatch = data.fileMatch as boolean | undefined;
  // Selection is stamped into data by the graph component — React Flow's own
  // `selected` never updates because the node stops click propagation.
  const isSelected = selected || (data.isSelected as boolean | undefined) === true;

  return (
    <div
      onMouseEnter={() => {
        setHover(true);
        SUBSYSTEM_CALLBACKS.onHover?.(c.id);
      }}
      onMouseLeave={() => {
        setHover(false);
        SUBSYSTEM_CALLBACKS.onHover?.(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        SUBSYSTEM_CALLBACKS.onSelect?.(c.id);
      }}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        boxSizing: 'border-box',
        width: nodeWidth,
        height: nodeHeight,
        minWidth: badgeMinWidth,
        maxWidth,
        padding: '6px 10px',
        borderRadius: 8,
        background: theme.colors.backgroundSecondary ?? theme.colors.background,
        // Selected / file-matched nodes get a thicker border; kind colors are
        // kept for selection (thickness only). The file-open spotlight keeps
        // its primary tint.
        border: `${isSelected || fileMatch ? 4 : 2}px solid ${fileMatch ? theme.colors.primary : color}`,
        boxShadow: fileMatch
          ? `0 1px 4px rgba(0,0,0,0.25), 0 0 12px ${theme.colors.primary}55`
          : '0 1px 4px rgba(0,0,0,0.25)',
        opacity: fileMatch === false || data.dimmed === true ? 0.18 : 1,
        transition: 'opacity 150ms ease',
        cursor: 'pointer',
        fontFamily: theme.fonts.body,
      }}
    >
      {/* Construct / stereotype badge — prefers framework stereotype so a
          React UI unit reads as "react · component" instead of "function".
          Persistent; pointer-events none so clicks pass through to the node. */}
      <div
        style={{
          position: 'absolute',
          top: -9,
          left: BADGE_EDGE_INSET,
          zIndex: 1,
          fontFamily: theme.fonts.monospace,
          fontSize: theme.fontSizes[0] * 1.1,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          lineHeight: '17px',
          whiteSpace: 'nowrap',
          color,
          background: theme.colors.backgroundSecondary ?? theme.colors.background,
          border: `1px solid ${color}`,
          borderRadius: 4,
          padding: '0 5px',
        }}
      >
        {constructBadgeLabel(c)}
      </div>

      {/* Role badge — top-right, only when the node carries a topology role.
          Role color (entry orange / service blue) on the badge; the node
          border stays construct-colored. */}
      {c.role != null && (
        <div
          style={{
            position: 'absolute',
            top: -9,
            right: BADGE_EDGE_INSET,
            zIndex: 1,
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[0] * 1.1,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            lineHeight: '17px',
            whiteSpace: 'nowrap',
            color: ROLE_COLOR[c.role],
            background: theme.colors.backgroundSecondary ?? theme.colors.background,
            border: `1px solid ${ROLE_COLOR[c.role]}`,
            borderRadius: 4,
            padding: '0 5px',
          }}
        >
          {ROLE_LABEL[c.role]}
        </div>
      )}

      {/* Filename badge — a strip across the bottom border, shown on hover
          and pinned while this node's file is open in the drawer (fileMatch).
          Mirrors the construct/role tab badges; hidden for fileless nodes. */}
      {(hover || fileMatch === true) && c.file ? (
        <div
          style={{
            position: 'absolute',
            bottom: -13,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1,
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[0] * 1.1,
            letterSpacing: 0.5,
            lineHeight: '17px',
            whiteSpace: 'nowrap',
            // filename stays neutral — the construct color belongs to the
            // borders and badges, not the file name
            color: theme.colors.text ?? theme.colors.textSecondary,
            background: theme.colors.backgroundSecondary ?? theme.colors.background,
            border: `1px solid ${color}`,
            borderRadius: 4,
            padding: '0 5px',
            cursor: 'pointer',
          }}
          onClick={(e) => {
            // Open the file directly; don't also toggle node selection.
            e.stopPropagation();
            SUBSYSTEM_CALLBACKS.onOpenFile?.(c.id);
          }}
        >
          {c.file.split('/').pop()}
        </div>
      ) : null}

      {/* Purpose is no longer shown as a hover tooltip below the node — it
          lives in the declaration panel and the graphify detail payload. */}

      <div
        style={{
          fontSize: theme.fontSizes[2],
          fontWeight: 600,
          color: theme.colors.text,
          lineHeight: 1.2,
          textAlign: 'center',
          // Let long names wrap within the node's capped width (instead of
          // truncating), but cap each line so the node doesn't grow unbounded.
          whiteSpace: 'normal',
          overflowWrap: 'anywhere',
          maxWidth: '100%',
          fontFamily: theme.fonts.body,
        }}
      >
        {breakWords(displayName)}
      </div>

      {/* Hide the identity line when the symbol is just the title without its
          decoration (`()`, ` {}`, or `<>`) — only show it when it adds
          information (e.g. the dotted host on methods, or a different code
          identity). */}
      {c.symbol &&
        c.symbol !==
          displayName
            .replace(/^<(.+)>$/, '$1')
            .replace(/ ?\{\}$/, '')
            .replace(/\(\)$/, '') && (
        <div
          style={{
            fontSize: theme.fontSizes[0] * 0.82,
            fontFamily: theme.fonts.monospace,
            color: color,
            marginTop: 1,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%',
          }}
          title={c.symbol}
        >
          {c.symbol}
        </div>
      )}

      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

/**
 * Process boundary frame — a React Flow parent node. Members render inside
 * via `parentId`; this draws the labeled container only (no handles, no
 * selection). The border color derives deterministically from the process key
 * so each deployment unit reads as its own region.
 */
export function SubsystemGroupNode(props: NodeProps<Node<SubsystemGroupNodeData, 'subsystem-group'>>) {
  const { theme } = useTheme();
  const { data, width, height, selected } = props as unknown as {
    data: SubsystemGroupNodeData;
    width?: number;
    height?: number;
    selected?: boolean;
  };
  const region = data.region;
  const color = packageColor(region?.key ?? 'process');
  const dimmed = data.dimmed === true;
  const hidden = (data as { hidden?: boolean }).hidden === true;

  if (!region) return null;

  return (
    <div
      style={{
        position: 'relative',
        width: width ?? 400,
        height: height ?? 300,
        boxSizing: 'border-box',
        borderRadius: 12,
        border: `2px ${selected ? 'solid' : 'dashed'} ${color}`,
        background: `${color}14`,
        opacity: hidden ? 0 : dimmed ? 0.35 : 1,
        transition: 'opacity 150ms ease',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -19,
          left: 12,
          fontFamily: theme.fonts.monospace,
          fontSize: theme.fontSizes[3],
          fontWeight: 700,
          letterSpacing: 0.6,
          color,
          background: theme.colors.backgroundSecondary ?? theme.colors.background,
          border: `1px solid ${color}`,
          borderRadius: 4,
          padding: '1px 7px',
          whiteSpace: 'nowrap',
        }}
      >
        {region.label}
      </div>
    </div>
  );
}

/** `#rrggbb` + alpha → `#rrggbbaa`. Used to dim a stroke/marker by color so
 *  each opacity gets its own SVG marker id — path `opacity` leaks across every
 *  edge that shares a `url(#marker)` (the focused edge's arrowhead dims). */
export function hexWithAlpha(hex: string, alpha: number): string {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? [...raw].map((c) => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${full}${a}`;
}

/**
 * File-open spotlight flag for a node. `true` = lives in the open file,
 * `false` = dim, `undefined` = render neutrally.
 *
 * Focused-edge endpoints stay neutral when they don't live in the open file
 * (the target of a focused edge must not dim with the rest).
 */
export function fileMatchForNode(
  nodeFile: string | undefined,
  openFile: string | null,
  isFocusEndpoint: boolean,
): boolean | undefined {
  if (!openFile) return undefined;
  if (nodeFile === openFile) return true;
  if (isFocusEndpoint) return undefined;
  return false;
}

/**
 * Hide / dim a node or edge while flows are open.
 * - not in any opened flow → hidden
 * - in an opened flow, but not the selected flow/step → dimmed
 * - in the selected flow or step (or opened with nothing selected) → full
 */
export function flowElementVisibility(opts: {
  inOpened: boolean;
  inSelected: boolean;
  anyOpened: boolean;
  anySelected: boolean;
}): { hidden: boolean; dimmed: boolean } {
  const { inOpened, inSelected, anyOpened, anySelected } = opts;
  if (!anyOpened && !anySelected) return { hidden: false, dimmed: false };
  if (!inOpened && !inSelected) return { hidden: true, dimmed: false };
  if (anySelected && !inSelected) return { hidden: false, dimmed: true };
  return { hidden: false, dimmed: false };
}

export const EDGE_DIM_ALPHA = 0.15;

/** Subsystem edge — SVG path only. The mechanism label is rendered as an
 *  absolutely-positioned HTML overlay OUTSIDE the ReactFlow tree (by the
 *  parent Inner component) so it sits above the pane and receives pointer
 *  events. */
export function SubsystemEdge({
  data,
  markerEnd,
}: EdgeProps<SubsystemGraphEdge>) {
  const path = data?.elkPath ?? '';
  const mechanism = data?.mechanism ?? 'imports';
  const color = MECHANISM_COLOR[mechanism] ?? '#888';
  // Dash style comes from the mechanism table (dashed = inverted-control or
  // observational relationships: hierarchy, registration, watches).
  const isDashed = MECHANISM_STYLE[mechanism] === 'dashed';
  const dimmed = data?.dimmed === true;
  // Dim the stroke by color, never via path `opacity`. SVG markers are shared
  // by id; opacity on the referencing path paints every arrowhead that uses
  // the same marker — including the focused edge's target.
  const stroke = dimmed ? hexWithAlpha(color, EDGE_DIM_ALPHA) : color;

  return (
    <>
      {/* Invisible wide interaction path — React Flow's pane uses this for
          hit-testing onEdgeClick. Must be pointer-events:stroke so the pane
          delegates the click to onEdgeClick. */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="react-flow__edge-interaction"
      />
      {/* Visible edge line — pointer-events:none so it never intercepts the
          HTML label overlay rendered by the parent component. */}
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray={isDashed ? '6 4' : undefined}
        markerEnd={markerEnd}
        style={{ pointerEvents: 'none' }}
      />
    </>
  );
}

