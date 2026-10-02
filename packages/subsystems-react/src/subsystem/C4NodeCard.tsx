/**
 * C4NodeCard — the box an element draws as, with nothing else.
 *
 * Extracted from `C4Graph.tsx` so the visual encoding can be inspected,
 * reviewed, and unit-tested without standing up a graph. React Flow supplies
 * edges and hit-testing; this supplies the reading surface.
 *
 * The encoding has one job: make confirmation state legible at a glance. A box
 * nobody has looked at must not read the same as a box a person signed off.
 * Everything else here is C4 notation — a type, a technology, a description —
 * surfaced in the order a reader wants it.
 */

import { useTheme } from '@principal-ade/industry-theme';
import { describeConstructBreakdown } from './model';
import type { C4Node } from './toC4';

/**
 * Card box. Near-square rather than a wide strip: a C4 element carries four
 * things at once (tag, label, type + technology, and the notation gap it still
 * has), and a wide strip forces the last two to truncate. The extra height is
 * what lets the `needs …` marker sit on its own line instead of clipping.
 */
export const NODE_W = 210;
export const NODE_H = 138;

/**
 * Fixed slot heights, so rows line up across every card regardless of which
 * optional fields are present. Without these a card missing its notation-gap
 * marker is two lines shorter and a row of cards reads as ragged.
 */
const LABEL_SLOT_H = 40;
const GAP_SLOT_H = 18;

type Theme = ReturnType<typeof useTheme>['theme'];

export interface NodeStyle {
  color: string;
  dash: string;
  width: number;
}

/**
 * Border style and colour for one node, by what we know about it.
 *
 * Confirmation state wins over C4 kind: an accepted container and a raw
 * derived container are both "containers", and the reader's first question
 * about either is whether anyone vouched for it.
 */
export function nodeStyle(node: C4Node, theme: Theme, selected = false): NodeStyle {
  const muted = theme.colors.border ?? '#555';
  if (selected) return { color: theme.colors.primary ?? '#5aa', dash: 'solid', width: 3 };

  // Border width carries the C4 level, so a component stays a component even
  // in grayscale or for a reader who cannot separate the hues.
  const weight = node.kind === 'component' ? 1 : 2;

  switch (node.decoration?.state) {
    case 'accepted':
      // Solid and saturated — part of the architecture now.
      return { color: theme.colors.primary ?? '#4ec9b0', dash: 'solid', width: weight };
    case 'proposed':
      // Dashed — an agent asked; a human has not answered.
      return { color: theme.colors.warning ?? '#e8a33a', dash: 'dashed', width: weight };
    case 'rejected':
      // Should never be drawn (toC4 drops it); belt-and-braces.
      return { color: muted, dash: 'dotted', width: 1 };
    default:
      break;
  }

  // No association at all — the raw derivation. Muted, so confirmed boxes
  // read as the stronger signal.
  switch (node.kind) {
    case 'external':
      return { color: theme.colors.warning ?? '#a78bfa', dash: 'solid', width: weight };
    case 'actor':
      return { color: theme.colors.accent ?? theme.colors.info ?? '#e3b341', dash: 'solid', width: weight };
    default:
      return { color: muted, dash: 'solid', width: weight };
  }
}

function baseName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** The type + technology line under the label. */
export function nodeSubtitle(node: C4Node): string {
  const d = node.decoration;
  if (d?.type || d?.technology) return [d.type, d.technology].filter(Boolean).join(' · ');

  // No confirmed attributes: fall back to what the document told us.
  if (node.kind === 'component') {
    return `${node.component?.construct ?? 'code'}${node.component?.file ? ` · ${baseName(node.component.file)}` : ''}`;
  }
  const count = node.members.length;
  return `${describeConstructBreakdown(node.constructs)}${count > 0 ? ` · ${count} component${count === 1 ? '' : 's'}` : ''}`;
}

/**
 * The C4 level — what the box IS.
 *
 * Deliberately independent of confirmation state. An accepted container is
 * still a container, and a component is a component whether or not anyone has
 * reviewed it; collapsing the two into one label is what made the two
 * indistinguishable. Confirmation is a separate axis (`nodeStateTag`).
 */
export function nodeTag(node: C4Node): string {
  return node.kind;
}

/**
 * Confirmation state, as its own short tag. Empty when nothing was proposed —
 * which is itself the distinction from a reviewed element.
 */
export function nodeStateTag(node: C4Node): string {
  switch (node.decoration?.state) {
    case 'accepted':
      return 'confirmed';
    case 'proposed':
      return 'proposed';
    case 'rejected':
      return 'rejected';
    default:
      return 'unconfirmed';
  }
}

/**
 * Shape cue for the C4 level, independent of colour and dash pattern.
 *
 * Colour alone is not enough: a container and a component with no association
 * both fall back to the muted border, so they were identical in grayscale.
 * The convention:
 *
 *   container   solid rectangle   — a runtime boundary, drawn to scale
 *   component   rounded rectangle — a part inside one, drawn smaller
 *   external    rounded rectangle + dashed (nothing to confirm inside)
 *   actor       fully rounded      — a person, not a box
 */
export function nodeShape(node: C4Node): { radius: number; dash: 'solid' | 'dashed' } {
  switch (node.kind) {
    case 'actor':
      return { radius: NODE_H / 2, dash: 'solid' };
    case 'external':
      return { radius: 14, dash: 'dashed' };
    case 'component':
      return { radius: 14, dash: 'solid' };
    default:
      return { radius: 4, dash: 'solid' };
  }
}

/**
 * C4 notation requires a technology and a description on every container.
 * Name the gaps rather than leaving them to be noticed.
 */
export function nodeMissing(node: C4Node): string[] {
  if (node.kind !== 'container') return [];
  const missing: string[] = [];
  if (!node.decoration?.technology) missing.push('technology');
  if (!node.decoration?.description) missing.push('description');
  return missing;
}

export interface C4NodeCardProps {
  node: C4Node;
  selected?: boolean;
  /** Draw React Flow's edge handles. Off when rendering a bare gallery. */
  handles?: React.ReactNode;
  onClick?: () => void;
}

export function C4NodeCard({ node, selected = false, handles, onClick }: C4NodeCardProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const style = nodeStyle(node, theme, selected);
  const shape = nodeShape(node);
  const missing = nodeMissing(node);
  const unconfirmed = !node.decoration?.state;

  return (
    <div
      onClick={onClick}
      style={{
        width: NODE_W,
        minHeight: NODE_H,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        // Top-aligned, not centred: the number of lines varies (the notation-gap
        // marker is conditional), and centring pushes the tag to a different
        // height on every card. In a graph grid that makes the row unscannable.
        justifyContent: 'flex-start',
        gap: 3,
        padding: '10px 12px',
        borderRadius: shape.radius,
        background: theme.colors.backgroundSecondary ?? theme.colors.background,
        border: `${style.width} ${style.dash} ${style.color}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: theme.fonts.body,
      }}
    >
      {/* Level and state on one row, separately styled. The level is what the
          box IS; the state is whether anyone has vouched for it. Merging them
          into one label is what made containers and components unreadable. */}
      <span
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          fontFamily: theme.fonts.monospace,
          fontSize: theme.fontSizes[0],
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}
      >
        <span
          style={{
            color: style.color,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          {nodeTag(node)}
        </span>
        <span
          title={unconfirmed ? 'Nobody has reviewed this element yet' : undefined}
          style={{
            color: unconfirmed ? muted : style.color,
            // Unconfirmed is a quiet absence, not a loud claim.
            opacity: unconfirmed ? 0.75 : 1,
            letterSpacing: 0,
            textTransform: 'none',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          {nodeStateTag(node)}
        </span>
      </span>
      {/* Two lines rather than an ellipsis: a truncated label hides the very
          thing that distinguishes two containers from each other. The fixed
          height reserves both lines even for a one-line label, so the subtitle
          below sits at the same y on every card. */}
      <span
        style={{
          fontWeight: 600,
          fontSize: theme.fontSizes[2],
          color: theme.colors.text,
          lineHeight: 1.25,
          height: LABEL_SLOT_H,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
        title={node.label}
      >
        {node.label}
      </span>
      <span
        style={{
          fontFamily: theme.fonts.monospace,
          fontSize: theme.fontSizes[0],
          color: muted,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={node.decoration?.description ?? node.members.join(', ')}
      >
        {nodeSubtitle(node)}
      </span>
      {/* Reserved row: without it, a card with no notation gap is two lines
          shorter and the row of cards reads as ragged. */}
      <span style={{ height: GAP_SLOT_H }} aria-hidden="true" />
      {missing.length > 0 && (
        <span
          title={`C4 requires a ${missing.join(' and a ')} on every container`}
          style={{
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[0],
            color: theme.colors.warning ?? '#e8a33a',
            lineHeight: 1.3,
            height: GAP_SLOT_H,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          needs {missing.join(' + ')}
        </span>
      )}
      {handles}
    </div>
  );
}