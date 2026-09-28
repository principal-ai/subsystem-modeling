/**
 * Subsystem component/group node + edge renderers.
 *
 * Lightweight, purpose-built for the subsystem component graph: a component
 * renders its name (kind-tagged, colored by package) plus its symbol/purpose.
 * Groups render as package containers. Clicking
 * a component calls `onSelect` (to open the entry point / file).
 */

import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
  type EdgeProps,
} from '@xyflow/react';
import { useTheme } from '@principal-ade/industry-theme';
import {
  edgeColor,
  edgeStrokeStyle,
  PROPOSED_COLOR,
  constructBadgeColor,
  constructBadgeLabel,
  rightBadgeLabel,
  rightBadgeColor,
  storageBadgeLabel,
  storageBadgeColor,
  deriveNameFromSymbol,
  nodeMinWidthForBadges,
  MODULE_BADGE_INSET,
  moduleBadgeLabel,
  moduleBadgeHoverLabel,
  moduleBadgeWidth,
  packageColor,
  type SubsystemGraphNodeData,
  type SubsystemGroupNodeData,
  type SubsystemGraphEdge,
} from './model';
import { componentColor } from '../pierre/constructColors';
import { resolvePierreSyntaxThemeName } from '../pierre/pierreSyntaxTheme';

export const CONSTRUCT_LABEL: Record<string, string> = {
  class: 'class',
  function: 'function',
  method: 'method',
  interface: 'interface',
  type_alias: 'type alias',
  enum: 'enum',
  store: 'store',
  external: 'external',
  custom_entity: 'entity',
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
  onSelect?: (componentAlias: string) => void;
  /** Click an edge (or its label) — select the relationship. */
  onEdgeSelect?: (edgeId: string) => void;
  /** Hover a component (null on leave) — associates it with the file tree. */
  onHover?: (componentAlias: string | null) => void;
  /** Upper bound for node width; nodes grow with content up to this, then wrap. */
  maxNodeWidth?: number;
}

/**
 * Root callbacks carried through node data (injected by the graph component).
 * Kept as a module-scope fallback for the graph; standalone mounts (e.g. a
 * single node previewed outside the canvas) should scope their own callbacks
 * via `SubsystemCallbacksProvider` so they never hit the graph's handlers.
 */
export const SUBSYSTEM_CALLBACKS: SubsystemGraphCallbacks = {};

const SubsystemCallbacksContext = createContext<SubsystemGraphCallbacks | null>(
  null,
);

/**
 * Scope graph callbacks to a subtree. Wrap a standalone `SubsystemComponentNode`
 * in this (with `{}` to neutralize clicks/hover) so it doesn't dispatch into the
 * module-scope `SUBSYSTEM_CALLBACKS` owned by a mounted graph.
 */
export function SubsystemCallbacksProvider({
  value,
  children,
}: {
  value: SubsystemGraphCallbacks;
  children: ReactNode;
}) {
  return (
    <SubsystemCallbacksContext.Provider value={value}>
      {children}
    </SubsystemCallbacksContext.Provider>
  );
}

function useSubsystemCallbacks(): SubsystemGraphCallbacks {
  return useContext(SubsystemCallbacksContext) ?? SUBSYSTEM_CALLBACKS;
}

export function SubsystemComponentNode(props: NodeProps<Node<SubsystemGraphNodeData, 'subsystem-component'>>) {
  const { theme, mode } = useTheme();
  const callbacks = useSubsystemCallbacks();
  const { data, selected, width: nodeWidth, height: nodeHeight } = props;
  const c = data.component;
  const [hover, setHover] = useState(false);
  // Construct owns node color, derived from the active Pierre syntax theme —
  // the same palette the declaration panel and file drawer render with. Role
  // shows as the hover badge, not as color — for now; a role glyph/accent may
  // come later. A component-authored `color` override wins over the construct.
  const color = componentColor(c, resolvePierreSyntaxThemeName(mode));
  // Left badge: framework brand (e.g. React cyan) when the label is a
  // framework stereotype; otherwise the same construct color as the border.
  const badgeColor = constructBadgeColor(c) ?? color;
  const configuredMax = callbacks.maxNodeWidth;
  const maxWidth = configuredMax ?? 300;
  // `symbol` is the source of truth; `name` is derived from it consistently.
  const displayName = deriveNameFromSymbol(c.symbol, c.construct, c.name, c.file, c.stereotype);
  // Top badges are absolutely positioned — widen the node so they nowrap
  // instead of wrapping, including when construct + role/proposed share the top.
  const badgeMinWidth = nodeMinWidthForBadges(c);
  const topRightLabel = rightBadgeLabel(c);
  const topRightColor = rightBadgeColor(c);
  // Store retention backing badge — memory/disk/db, beside role (orthogonal).
  const storageLabel = storageBadgeLabel(c);
  const storageColor = storageBadgeColor(c);
  // Set while a file is open in the drawer: true → spotlight, false → dim,
  // absent (no file open) → neutral.
  const fileMatch = data.fileMatch as boolean | undefined;
  // Node fill lifts on hover as the clickability affordance; badges share it
  // so they read as tabs on the same surface rather than floating patches.
  const nodeBg = theme.colors.backgroundSecondary ?? theme.colors.background;
  const hoverBg =
    theme.colors.backgroundHover ?? theme.colors.backgroundTertiary ?? nodeBg;
  // Border: proposed uses the goldenrod accent (dashed); construct color stays
  // on the left badge. File-open spotlight still wins with primary.
  const borderColor = fileMatch
    ? theme.colors.primary
    : c.proposed
      ? PROPOSED_COLOR
      : color;
  // Selection is stamped into data by the graph component — React Flow's own
  // `selected` never updates because the node stops click propagation.
  const isSelected = selected || (data.isSelected as boolean | undefined) === true;
  // Externals are "outside" the system — square corners on the node + badges.
  const isExternal = c.construct === 'external';
  const nodeRadius = isExternal ? 0 : 8;
  const badgeRadius = isExternal ? 0 : 4;
  // The border thickens on selection / file-match. Absolutely-positioned
  // badges are laid out from the padding box (inside the border), so a raw
  // `top` / `left` would slide with the border. Anchor them to the border box
  // instead, offsetting by the border width. Side badges sit flush with the
  // node's left / right edge (`-borderW`); the top reference stays at -9.
  const borderW = isSelected || fileMatch ? 4 : 2;
  const badgeTop = -9 - borderW;
  const badgeEdge = -borderW;

  return (
    <div
      onMouseEnter={() => {
        setHover(true);
        callbacks.onHover?.(c.alias);
      }}
      onMouseLeave={() => {
        setHover(false);
        callbacks.onHover?.(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        callbacks.onSelect?.(c.alias);
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
        borderRadius: nodeRadius,
        background: hover ? hoverBg : nodeBg,
        // Selected / file-matched nodes get a thicker border. Proposed nodes
        // use a dashed goldenrod border; left construct badge keeps construct color.
        border: `${borderW}px ${c.proposed ? 'dashed' : 'solid'} ${borderColor}`,
        boxShadow: fileMatch
          ? `0 1px 4px rgba(0,0,0,0.25), 0 0 12px ${theme.colors.primary}55`
          : '0 1px 4px rgba(0,0,0,0.25)',
        opacity: fileMatch === false || data.dimmed === true ? 0.18 : 1,
        transition: 'opacity 150ms ease, background-color 120ms ease',
        cursor: 'pointer',
        fontFamily: theme.fonts.body,
      }}
    >
      {/* Construct / stereotype badge — prefers framework stereotype so a
          React UI unit reads as "react · component" instead of "function".
          Persistent; pointer-events none so clicks pass through to the node.
          Framework badges use brand color; border stays construct-colored. */}
      <div
        style={{
          position: 'absolute',
          top: badgeTop,
          left: badgeEdge,
          zIndex: 1,
          fontFamily: theme.fonts.monospace,
          fontSize: theme.fontSizes[1],
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          lineHeight: '17px',
          whiteSpace: 'nowrap',
          color: badgeColor,
          background: nodeBg,
          border: `2px solid ${badgeColor}`,
          borderRadius: badgeRadius,
          padding: '2px 8px',
        }}
      >
        {constructBadgeLabel(c)}
      </div>

      {/* Secondary badge cluster — proposed wins over role when both are set;
          store storage (retention backing) sits beside, since it is
          orthogonal to topology. Persistent; pointer-events pass through.
          Sits astride the bottom edge, centered (mirroring the top construct
          badge's straddle), so the top edge stays free for the construct tag. */}
      {(topRightLabel != null || storageLabel != null) && (
        <div
          style={{
            position: 'absolute',
            bottom: badgeTop,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1,
            display: 'flex',
            gap: 6,
            whiteSpace: 'nowrap',
          }}
        >
          {storageLabel != null && storageColor != null && (
            <span
              style={{
                fontFamily: theme.fonts.monospace,
                fontSize: theme.fontSizes[1],
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                lineHeight: '17px',
                color: storageColor,
                background: nodeBg,
                border: `2px solid ${storageColor}`,
                borderRadius: badgeRadius,
                padding: '2px 8px',
              }}
            >
              {storageLabel}
            </span>
          )}
          {topRightLabel != null && topRightColor != null && (
            <span
              style={{
                fontFamily: theme.fonts.monospace,
                fontSize: theme.fontSizes[1],
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                lineHeight: '17px',
                color: topRightColor,
                background: nodeBg,
                border: `2px solid ${topRightColor}`,
                borderRadius: badgeRadius,
                padding: '2px 8px',
              }}
            >
              {topRightLabel}
            </span>
          )}
        </div>
      )}

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
          decoration (`()` or ` {}`) — only show it when it adds information
          (e.g. the dotted host on methods, or a different code identity). */}
      {c.symbol &&
        c.symbol !==
          displayName
            .replace(/ ?\{\}$/, '')
            .replace(/\(\)$/, '') && (
        <div
          style={{
            fontSize: theme.fontSizes[0],
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
 * Boundary frame — a React Flow parent node for a process or module region.
 * Members render inside via `parentId`; this draws the labeled container only
 * (no handles, no selection). Border color derives from the region key.
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
  // Explicit host override wins over the derived (hash-based) frame color.
  const color = data.color ?? packageColor(region?.key ?? 'process');
  const dimmed = data.dimmed === true;
  const hidden = (data as { hidden?: boolean }).hidden === true;
  // Label is the region identity alone (path / process key / owner/name).
  // Kind is carried by frame chrome (square = process; rounded = module/package)
  // — don't prefix `module ·` / `package ·` or the path reads twice.
  const label = region?.label ?? '';
  const [expandedLabel, setExpandedLabel] = useState<string | null>(null);
  const isModule = region?.kind === 'module';
  const isProcess = region?.kind === 'process';
  const expanded = isModule && expandedLabel === label;
  const availableBadgeWidth = Math.max(0, (width ?? 400) - MODULE_BADGE_INSET * 2 - 4);
  const collapsedLabel = isModule ? moduleBadgeLabel(label, availableBadgeWidth) : label;
  // A module badge is collapsible while something collapsed, and stays
  // togglable while expanded (so the full path can collapse back).
  const canToggle = isModule && (expanded || collapsedLabel !== label);
  // Hover affords clickability by revealing more of the path — the badge
  // widens to fit real text (never stretched), hinting before the click.
  const [hover, setHover] = useState(false);
  const hoveredLabel =
    isModule && canToggle ? moduleBadgeHoverLabel(label, availableBadgeWidth) : label;
  const frameRadius = isProcess ? 0 : 12;
  const badgeRadius = isProcess ? 0 : 4;
  const badgeBg = theme.colors.backgroundSecondary ?? theme.colors.background;
  // Processes are deployment units — solid frame. Modules/packages stay dashed
  // until selected.
  const frameStyle = isProcess || selected ? 'solid' : 'dashed';
  // Process keeps a tinted fill; module / package bodies stay transparent so
  // nested frames don't stack washes.
  const frameFill = isProcess ? `${color}14` : 'transparent';

  if (!region) return null;

  return (
    <div
      style={{
        position: 'relative',
        width: width ?? 400,
        height: height ?? 300,
        boxSizing: 'border-box',
        borderRadius: frameRadius,
        border: `2px ${frameStyle} ${color}`,
        background: frameFill,
        opacity: hidden ? 0 : dimmed ? 0.35 : 1,
        transition: 'opacity 150ms ease',
        pointerEvents: 'none',
      }}
    >
      <div
        className={isModule ? 'nodrag nopan' : undefined}
        role={canToggle ? 'button' : undefined}
        tabIndex={canToggle && !hidden ? 0 : undefined}
        aria-expanded={canToggle ? expanded : undefined}
        aria-label={canToggle ? `${expanded ? 'Collapse' : 'Expand'} module path: ${label}` : undefined}
        title={isProcess ? 'Double-click to focus this process' : undefined}
        onMouseEnter={canToggle ? () => setHover(true) : undefined}
        onMouseLeave={canToggle ? () => setHover(false) : undefined}
        onClick={canToggle ? (event) => {
          event.stopPropagation();
          setExpandedLabel(expanded ? null : label);
        } : undefined}
        onKeyDown={canToggle ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            setExpandedLabel(expanded ? null : label);
          } else if (event.key === 'Escape' && expanded) {
            event.stopPropagation();
            setExpandedLabel(null);
          }
        } : undefined}
        style={{
          position: 'absolute',
          // Process: the tab sits flush over the frame's top border (`top:
          // -2` — the frame border is 2px) and carries its own full border, so
          // the two read as one piece. Module/package are centred astride the
          // top edge like component badges. Always set left/transform
          // explicitly — React Flow reuses group DOM nodes and `undefined`
          // does not clear a prior value.
          top: isProcess ? -2 : 0,
          left: isProcess ? '50%' : 12,
          transform: isProcess ? 'translateX(-50%)' : 'translateY(-50%)',
          zIndex: canToggle ? 10 : undefined,
          // Width is explicit while collapsible so hover-reveal of more path
          // text animates; the cap keeps both states inside the frame.
          width:
            isModule && canToggle && !expanded
              ? hover
                ? Math.min(availableBadgeWidth, moduleBadgeWidth(hoveredLabel))
                : Math.min(availableBadgeWidth, moduleBadgeWidth(collapsedLabel))
              : undefined,
          transition: 'width 140ms ease, box-shadow 120ms ease',
          cursor: canToggle || isProcess ? 'pointer' : undefined,
          // The trailing halo squares the rounded corners back off in the fill
          // colour, so an edge crossing a corner can't show through the notch.
          // Square (process) badges have no notch, and the halo would erase the
          // frame border they now sit flush on, so they skip it.
          boxShadow: isProcess
            ? undefined
            : `${canToggle && hover ? `0 2px 10px ${color}55, ` : ''}0 0 0 1.5px ${badgeBg}`,
          fontFamily: theme.fonts.monospace,
          fontSize: theme.fontSizes[3],
          fontWeight: 700,
          letterSpacing: 0.6,
          color,
          background: badgeBg,
          border: `2px solid ${color}`,
          borderTopWidth: 2,
          borderRadius: badgeRadius,
          padding: '3px 9px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          boxSizing: 'border-box',
          pointerEvents: hidden ? 'none' : 'auto',
          ...(isModule
            ? {
                // Cap the collapsed badge at the frame's inner width so it
                // never spills past the module — it gets the `…`/click-to-
                // expand treatment instead. Expanding lifts the cap so the
                // full path grows the badge past the frame's edge.
                maxWidth: expanded ? undefined : availableBadgeWidth,
              }
            : undefined),
        }}
      >
        {canToggle ? (
          <span style={{ whiteSpace: 'nowrap' }}>
            {expanded ? label : hover ? hoveredLabel : collapsedLabel}
          </span>
        ) : (
          label
        )}
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
  const mechanism = data?.mechanism ?? 'uses';
  // Color + dash resolve from provenance: subsystem mechanisms use the
  // MECHANISM_* tables, graphify-native relations use the separate
  // GRAPHIFY_RELATION_* palette (see edgeColor / edgeStrokeStyle).
  const edgeRef = { mechanism, provenance: data?.provenance };
  const color = edgeColor(edgeRef);
  // Dash style encodes provenance (graphify) and relationship kind (dashed =
  // inverted-control or observational: hierarchy, registration, watches).
  const isDashed = edgeStrokeStyle(edgeRef) === 'dashed';
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

