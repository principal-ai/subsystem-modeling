/**
 * C4NodeCard — the box an element draws as, with nothing else.
 *
 * Extracted from `C4Graph.tsx` so the visual encoding can be inspected,
 * reviewed, and unit-tested without standing up a graph. React Flow supplies
 * edges and hit-testing; this supplies the reading surface.
 *
 * The encoding has one job: make confirmation state legible at a glance. A box
 * nobody has looked at must not read the same as a box a person signed off.
 * Kind is carried by shape and size — plus an icon for a container's sort,
 * application vs data-store — and C4 notation is surfaced in the order a reader
 * wants it: technology on the top row, description under the label.
 */

import { useTheme } from '@principal-ade/industry-theme';
import { AppWindow, Database } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { TechMark, technologyBrand } from './techIcons';
import type { C4Element } from './c4';

/**
 * Card box for a container: a wide rectangle. A container carries four things
 * at once (technology row, label, description, and the notation gap it still
 * has), and a strip would force the last two to wrap hard.
 */
export const NODE_W = 250;
export const NODE_H = 150;

/**
 * A component is a proper square — equal sides, and visibly smaller than the
 * container it sits inside. Square-vs-rectangle is the clearest signal that
 * these are different C4 levels, and it survives grayscale and colour-blind
 * reading where a border-weight difference alone does not.
 */
export const COMPONENT_SIZE = 140;

/**
 * Per-level box size. The graph lays out against these, so a square component
 * and a rectangular container do not collide at a shared nominal width.
 */
export function nodeSize(node: C4Element): { width: number; height: number } {
  return node.kind === 'component'
    ? { width: COMPONENT_SIZE, height: COMPONENT_SIZE }
    : { width: NODE_W, height: NODE_H };
}

/**
 * Fixed label slot, so the description below sits at the same y on every card
 * even when a label is one line rather than two.
 */
const LABEL_SLOT_H = 40;

type Theme = ReturnType<typeof useTheme>['theme'];

export interface NodeStyle {
  color: string;
  dash: 'solid' | 'dashed' | 'dotted';
  width: number;
}

/**
 * Border style for one node: colour from **technology**, dash and weight from
 * **confirmation state** and level.
 *
 * One axis per channel, so nothing is said twice:
 *
 *   colour         → technology (the brand hue; see `technologyBrand`)
 *   dash           → confirmation state (solid accepted, dashed proposed)
 *   weight         → C4 level, as a grayscale redundancy for the square
 *   shape + size   → C4 kind (`nodeShape`, `nodeSize`)
 *
 * Colour moved from state to technology: on a container diagram the reader
 * wants "is this Bun or React" at a glance, and the state already reads off the
 * dash. A selected node overrides colour so a click target stands out.
 */
/** The technology string for an element, if its kind has one. */
export function nodeTechnology(node: C4Element): string | undefined {
  switch (node.kind) {
    case 'container':
    case 'component':
      return node.technology;
    case 'external-system':
      return node.technology;
    case 'person':
      return undefined;
  }
}

export function nodeStyle(node: C4Element, theme: Theme, selected = false): NodeStyle {
  const muted = theme.colors.border ?? '#555';
  const techColor = technologyBrand(nodeTechnology(node))?.color;
  if (selected) return { color: theme.colors.primary ?? '#5aa', dash: 'solid', width: 3 };

  // Border weight carries the level, so a component stays a component even
  // in grayscale or for a reader who cannot separate the hues.
  const weight = node.kind === 'component' ? 1 : 2;
  const color = techColor ?? muted;

  switch (node.state) {
    case 'accepted':
      // Solid — part of the architecture now.
      return { color, dash: 'solid', width: weight };
    case 'proposed':
      // Dashed — an agent asked; a human has not answered.
      return { color, dash: 'dashed', width: weight };
    case 'rejected':
      // Should never be drawn (a rejected element is not projected); belt-and-braces.
      return { color: muted, dash: 'dotted', width: 1 };
  }
}

/**
 * The line under the label: the element's one-line responsibility, which C4
 * asks every element to carry. No fallback — when nothing is stated, the
 * notation-gap row says so rather than the card inventing a summary.
 */
export function nodeSubtitle(node: C4Element): string {
  return node.description ?? '';
}

/**
 * What the box IS — its C4 kind. An accepted container is still a container;
 * collapsing the two is what once made containers and components unreadable.
 * Confirmation state is a separate axis carried by the border (see
 * `nodeStyle`), not by a word on the card.
 */
export function nodeTag(node: C4Element): string {
  return node.kind;
}

/**
 * The icon on the top row: a container's sort, **application vs data-store**.
 *
 * The C4 kind itself does not need a glyph — the box shape already carries it
 * (square vs rectangle vs pill), and the row's one text slot is worth more
 * spent on the technology. Only containers have a C4-recognised split, so the
 * other kinds return nothing.
 */
export function nodeKindIcon(node: C4Element): LucideIcon | undefined {
  switch (node.kind) {
    case 'container':
      return node.containerKind === 'data-store' ? Database : AppWindow;
    case 'component':
    case 'external-system':
    case 'person':
      return undefined;
  }
}

/**
 * The text on the top row: the technology the box is built with (Bun, React,
 * Postgres…). Falls back to the container kind / C4 kind when no technology is
 * stated, so the row is never blank.
 */
export function nodeTopLabel(node: C4Element): string {
  const technology = nodeTechnology(node);
  if (technology) return technology;
  switch (node.kind) {
    case 'container':
      return node.containerKind;
    case 'component':
    case 'external-system':
    case 'person':
      return node.kind;
  }
}

/** How a box is drawn. Shape carries the C4 kind, independent of colour. */
export type C4ShapeKind = 'rect' | 'square' | 'pill';

export interface NodeShape {
  kind: C4ShapeKind;
  /** Corner radius, for the shapes that use one. */
  radius: number;
}

/**
 * Shape cue for the C4 kind, independent of colour and dash — both of which
 * belong to confirmation state.
 *
 * The convention:
 *
 *   container        wide rectangle, sharp corners — a runtime boundary
 *   component        square — a part inside one (see `nodeSize`)
 *   external system  wide rectangle, rounded     — someone else's system
 *   person           pill                          — not a box at all
 *
 * An external system is separated from a container by radius alone, which is
 * a weak cue. That is deliberate rather than an oversight: the border dash is
 * the only channel that could say "outside our control" loudly, and it is
 * already spent on proposed-vs-accepted. The kind icon says it, and the frame
 * position says it structurally.
 */
export function nodeShape(node: C4Element): NodeShape {
  switch (node.kind) {
    case 'person':
      return { kind: 'pill', radius: NODE_H / 2 };
    case 'external-system':
      return { kind: 'rect', radius: 14 };
    case 'component':
      return { kind: 'square', radius: 6 };
    case 'container':
      return { kind: 'rect', radius: 4 };
  }
}

/**
 * The gaps the C4 notation still wants on this element, named rather than left
 * to be noticed.
 *
 * Containers are where the notation is strictest: it requires a technology and
 * a description on every one. A component needs a technology too, but a
 * component drawn without a parent already reports `unknown_container`, and
 * that is the question worth asking first.
 */
export function nodeMissing(node: C4Element): string[] {
  if (node.kind !== 'container') return [];
  const missing: string[] = [];
  if (!node.technology) missing.push('technology');
  if (!node.description) missing.push('description');
  return missing;
}

export interface C4NodeCardProps {
  node: C4Element;
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
  const Icon = nodeKindIcon(node);
  const brand = technologyBrand(nodeTechnology(node));
  const topLabel = nodeTopLabel(node);
  const subtitle = nodeSubtitle(node);

  const size = nodeSize(node);
  // A pill (a person) has no straight left edge, so left-aligned text reads as
  // spilling out of the oval. Centre the text and inset it from the curve.
  const centered = shape.kind === 'pill';

  return (
    <div
      onClick={onClick}
      style={{
        width: size.width,
        minHeight: size.height,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        // Top-aligned, not centred: the number of lines varies (the notation-gap
        // marker is conditional), and centring pushes the tag to a different
        // height on every card. In a graph grid that makes the row unscannable.
        justifyContent: 'flex-start',
        gap: 3,
        padding: centered ? '10px 30px' : '10px 12px',
        borderRadius: shape.radius,
        background: theme.colors.backgroundSecondary ?? theme.colors.background,
        border: `${style.width}px ${style.dash} ${style.color}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: theme.fonts.body,
      }}
    >
      {/* Left: the brand mark when we hold the official one, then the
          technology. Right: a container's C4 sort, application vs data-store.
          The kind itself stays on the shape, confirmation on the border (see
          `nodeShape`, `nodeStyle`). */}
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: centered ? 'center' : 'space-between',
          gap: 6,
          fontFamily: theme.fonts.monospace,
          fontSize: theme.fontSizes[0],
          color: muted,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          minWidth: 0,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {brand && <TechMark brand={brand} />}
          <span
            style={{
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            {topLabel}
          </span>
        </span>
        {Icon && (
          <span
            title={node.kind === 'container' ? node.containerKind : node.kind}
            aria-label={node.kind === 'container' ? node.containerKind : node.kind}
            style={{ display: 'inline-flex', flexShrink: 0, color: style.color }}
          >
            <Icon size={13} strokeWidth={2.25} />
          </span>
        )}
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
          textAlign: centered ? 'center' : 'left',
        }}
        title={node.label}
      >
        {node.label}
      </span>
      {subtitle && (
        <span
          style={{
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[0],
            color: muted,
            lineHeight: 1.35,
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
            textAlign: centered ? 'center' : 'left',
          }}
        >
          {subtitle}
        </span>
      )}
      {handles}
    </div>
  );
}