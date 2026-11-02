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
import { AppWindow, Component, Database, Maximize2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { technologyBrand } from './techIcons';
import type { C4Element } from './c4';
import {
  CARD_GAP,
  CARD_PAD_Y,
  ContainerCardHeader,
  LABEL_SLOT_H,
  NODE_H,
  NODE_W,
  TECH_SLOT_H,
  TOGGLE_INSET,
  TOGGLE_SIZE,
} from './containerCard';

// The card metrics live in `containerCard` so the component graph's frames can
// share them; re-exported here so the C4 canvas keeps one import.
export {
  NODE_H,
  NODE_W,
  OPEN_FOOTER_PAD,
  OPEN_HEADER_PAD,
  OPEN_SIDE_PAD,
} from './containerCard';

/**
 * A component has to *read* as a square, and equal sides do not manage that.
 *
 * A literally square box is perceived as tall: the eye measures it against the
 * upright frame and the surrounding boxes, not against an abstract 1:1, so it
 * lands looking narrower than it is. The correction is to make the real thing
 * wider than it is tall, which is what this is for.
 *
 * 8:7 is further than the textbook 5%, and deliberately: the card's height is a
 * `minHeight`, so a long description grows the drawn box past the height
 * reserved here (see the probe below). 160 buys the square reading against a
 * *rendered* height that runs past 140, not just against the nominal one.
 *
 * The level signal survives it: 8:7 is still unmistakably the square member of
 * the set against the container's 5:3, and still beats a border-weight
 * difference alone under grayscale and colour-blind reading.
 */
export const COMPONENT_ASPECT = 8 / 7;

/** Short side of a component card — the height, and a hard ceiling on the drawn box. */
export const COMPONENT_H = 140;

/** Long side — the optically corrected one. 160, derived so the ratio is the constant. */
export const COMPONENT_W = Math.round(COMPONENT_H * COMPONENT_ASPECT);

/**
 * Nominal edge of a component card, for callers that sized a box off a single
 * number. It is the *short* side; the width the graph lays out against is
 * `COMPONENT_W`, not this.
 */
export const COMPONENT_SIZE = COMPONENT_H;

/**
 * Per-level box size. The graph lays out against these, so a near-square
 * component and a rectangular container do not collide at a shared nominal
 * width.
 */
export function nodeSize(node: C4Element): { width: number; height: number } {
  return node.kind === 'component'
    ? { width: COMPONENT_W, height: COMPONENT_H }
    : { width: NODE_W, height: NODE_H };
}

/**
 * Space a component card reserves above and below the constructs nested inside
 * it when it is grown (a component with constructs becomes an ELK parent, the
 * same way an opened container does). A component has no technology row and no
 * collapse affordance, so this is its label slot plus padding.
 */
export const COMPONENT_HEADER_PAD = CARD_PAD_Y * 2 + LABEL_SLOT_H + CARD_GAP;
export const COMPONENT_FOOTER_PAD = CARD_PAD_Y;

/** The description's line height, as a multiple of its font size. */
const DESC_LINE_HEIGHT = 1.35;
/**
 * How many description lines fit in a card of this height before the drawn box
 * would grow past the box the layout reserved for it.
 *
 * A card's height is a contract with the layout: ELK sized the node, the system
 * frame and every edge against it. The description is the one part of a card whose
 * length the layout cannot know, so it is clamped to what fits rather than allowed
 * to push the border out past the frame drawn around it. Height is a *minimum* on
 * the card, so without this a long description silently grows the drawn box while
 * ELK — and therefore the boundary and the edge endpoints — keeps the old size.
 *
 * `hasTechRow` matters because an empty technology row is zero-height: a person
 * card has one more line of room than a container. The row is pinned to
 * `TECH_SLOT_H` when it has content, so this is exact rather than approximate.
 */
export function descriptionLineBudget(opts: {
  reservedHeight: number;
  lineHeight: number;
  /** The card's border, which sits above the content and varies by kind. */
  borderWidth: number;
  hasTechRow: boolean;
  /** Whether a collapse affordance is drawn at the bottom-right. */
  reservesFooter: boolean;
}): number {
  const { reservedHeight, lineHeight, borderWidth, hasTechRow, reservesFooter } = opts;
  if (lineHeight <= 0) return 0;
  const topChrome =
    borderWidth + CARD_PAD_Y + LABEL_SLOT_H + CARD_GAP + (hasTechRow ? TECH_SLOT_H : 0) + CARD_GAP;
  // Reserving the footer is not the same as the card's own bottom padding. The
  // toggle is `position: absolute` inset from the *padding* box, so it reaches
  // `inset + size` up from the content box's bottom edge — and a description that
  // only cleared the padding would still have its last line drawn through the
  // button. Measured: the last line lands in the bottom ~26px band, and the toggle
  // occupies the bottom 28 of it.
  const bottomChrome = reservesFooter
    ? Math.max(CARD_PAD_Y, TOGGLE_INSET + TOGGLE_SIZE)
    : CARD_PAD_Y;
  return Math.max(0, Math.floor((reservedHeight - topChrome - bottomChrome) / lineHeight));
}

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
  if (selected) return {
    color: theme.colors.accent ?? theme.colors.primary ?? theme.colors.text ?? '#5aa',
    dash: node.state === 'proposed' ? 'dashed' : node.state === 'rejected' ? 'dotted' : 'solid',
    width: 3,
  };

  // Border weight carries the level, so a component stays a component even
  // in grayscale or for a reader who cannot separate the hues.
  const weight = node.kind === 'component' ? 1 : 2;
  // Components use primary for contrast; containers retain their technology hue.
  const color = node.kind === 'component' ? (theme.colors.primary ?? muted) : (techColor ?? muted);

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
 *
 * A component returns `''`: its technology is almost always the container's, so
 * restating it is noise. The container frame already carries it.
 */
export function nodeTopLabel(node: C4Element): string {
  if (node.kind === 'component') return '';
  const technology = nodeTechnology(node);
  if (technology) return technology;
  switch (node.kind) {
    case 'container':
      return node.containerKind;
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
  /**
   * Horizontal text alignment. This is a level cue, not a typographic
   * preference: a column of left-aligned containers beside a set of centred
   * ones reads as two kinds without comparing box sizes, and unlike the aspect
   * ratio it survives a crop or a narrow viewport.
   */
  align: 'left' | 'center';
}

/**
 * Shape cue for the C4 kind, independent of colour and dash — both of which
 * belong to confirmation state.
 *
 * The convention:
 *
 *   container        wide rectangle, slight radius — a runtime boundary
 *   component        square, text centred       — a part inside one
 *   external system  wide rectangle, no radius   — someone else's system
 *   person           pill, text centred          — not a box at all
 *
 * `square` here is a corner treatment, not a claim about the dimensions: a
 * component's box is optically 8:7 (see `COMPONENT_ASPECT`) and still reads as
 * this shape.
 *
 * A container keeps a slight radius; an external system is drawn with none, so
 * the two are distinguishable by corner treatment as well as by the kind icon
 * and frame position. Alignment is the third, cheapest cue — it needs no
 * comparison against anything. The border dash stays spent on
 * proposed-vs-accepted.
 */
export function nodeShape(node: C4Element): NodeShape {
  switch (node.kind) {
    case 'person':
      return { kind: 'pill', radius: NODE_H / 2, align: 'center' };
    case 'external-system':
      return { kind: 'rect', radius: 0, align: 'left' };
    case 'component':
      return { kind: 'square', radius: 6, align: 'center' };
    case 'container':
      return { kind: 'rect', radius: 4, align: 'left' };
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
  /**
   * Number of `C4Component`s authored inside this element. The card can't see
   * the model, so the graph passes it in; shown right-aligned on the technology
   * row for containers. Omitted/0 → no count.
   */
  componentCount?: number;
  /**
   * When set, the card draws an expand affordance (bottom-right) that calls
   * this — the drill-down trigger. Only containers with components pass it.
   */
  onExpand?: () => void;
  /**
   * Explicit box size, overriding the kind's default. Lets a host animate the
   * card (the drill-down grow) without the card owning that state.
   */
  width?: number;
  height?: number;
  /**
   * Show the description line under the label. Off when the card is grown to
   * host components — the internals occupy that space.
   * @default true
   */
  showDescription?: boolean;
  /**
   * Content drawn below the header (label / technology / description). Used by
   * the grown card to host its component cards.
   */
  children?: React.ReactNode;
  /**
   * Delay the width/height transition by this many ms — the drill-down
   * sequences the fade before the move/grow, so the size change waits it out.
   * @default 0
   */
  transitionDelayMs?: number;
  /**
   * The width/height transition duration, in ms. The graph passes its
   * `MORPH_MS` so the grow and the component reveal (`settled`) share one clock
   * and cannot drift apart.
   * @default 420
   */
  sizeTransitionMs?: number;
}

export function C4NodeCard({ node, selected = false, handles, onClick, componentCount = 0, onExpand, width, height, showDescription = true, children, transitionDelayMs = 0, sizeTransitionMs = 420 }: C4NodeCardProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const style = nodeStyle(node, theme, selected);
  const shape = nodeShape(node);
  const Icon = nodeKindIcon(node);
  const brand = technologyBrand(nodeTechnology(node));
  // An unbranded container's border is the muted theme border — fine for a
  // hairline, too dark for the glyph and the box accent. Keep a selected card's
  // accent, and otherwise give the whole card a legible neutral.
  const accentColor =
    node.kind === 'container' && !brand && !selected
      ? theme.colors.textSecondary
      : style.color;
  const topLabel = nodeTopLabel(node);
  const subtitle = nodeSubtitle(node);

  const size = nodeSize(node);
  // The height the layout reserved for this card — what the system frame and the
  // edge endpoints were placed against. Everything below sizes to this, not to
  // whatever the content would like.
  const reservedHeight = height ?? size.height;
  // A container always has a technology row (at minimum the member count); a
  // person never does.
  const hasTechRow = !!topLabel || node.kind === 'container';
  const descLineHeightPx = theme.fontSizes[0] * DESC_LINE_HEIGHT;
  const descLines = descriptionLineBudget({
    reservedHeight,
    lineHeight: descLineHeightPx,
    borderWidth: style.width,
    hasTechRow,
    // The affordance is drawn exactly when the card can be expanded or collapsed.
    reservesFooter: !!onExpand,
  });
  const centered = shape.align === 'center';
  // The pill's inset is a separate concern from alignment, and a centred
  // component must not inherit it: 30px of each side would leave a 160-wide box
  // 100px of text, which wraps the description into exactly the extra lines
  // that grow the box past the height the layout reserved.
  const pillInset = shape.kind === 'pill';

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        width: width ?? size.width,
        // A hard height, not a minimum. The card *is* the box the layout reserved
        // — the system frame is fitted around it and every edge endpoint is placed
        // against it — so it must not be able to grow itself. `overflow: hidden`
        // makes that structural: if the content ever exceeds the box, it is clipped
        // rather than drawn outside the boundary. The description is clamped above
        // so that clipping is never what you actually see.
        height: reservedHeight,
        transition: `width ${sizeTransitionMs}ms ease-out ${transitionDelayMs}ms, height ${sizeTransitionMs}ms ease-out ${transitionDelayMs}ms`,
        overflow: 'hidden',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        // Top-aligned, not centred: the number of lines varies (the notation-gap
        // marker is conditional), and centring pushes the tag to a different
        // height on every card. In a graph grid that makes the row unscannable.
        justifyContent: 'flex-start',
        gap: CARD_GAP,
        padding: pillInset ? '10px 30px' : '10px 12px',
        borderRadius: shape.radius,
        background: theme.colors.backgroundSecondary ?? theme.colors.background,
        border: `${style.width}px ${style.dash} ${accentColor}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: theme.fonts.body,
      }}
    >
      <ContainerCardHeader
        label={node.label}
        Icon={Icon}
        iconLabel={node.kind === 'container' ? node.containerKind : node.kind}
        color={accentColor}
        iconColor={accentColor}
        topLabel={topLabel}
        brand={brand}
        hasTechRow={hasTechRow}
        count={node.kind === 'container' ? { value: componentCount, Icon: Component } : undefined}
        centered={centered}
      />      {showDescription && subtitle && descLines > 0 && (
        <span
          style={{
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[0],
            color: muted,
            lineHeight: DESC_LINE_HEIGHT,
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
            textAlign: centered ? 'center' : 'left',
            // Clamped to the room the layout left for it. The card's height is a
            // contract with ELK — the boundary and every edge endpoint are placed
            // against it — so the description cannot be allowed to grow the box.
            // Same mechanism the label uses above; the count is derived from the
            // reserved height rather than tuned by hand.
            display: '-webkit-box',
            WebkitLineClamp: descLines,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {subtitle}
        </span>
      )}
      {children}
      {/* Drill-down affordance: bottom-right, its own hit target so the card's
          own click (select) is unaffected. */}
      {onExpand && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
          aria-label="Show components"
          style={{
            position: 'absolute',
            right: TOGGLE_INSET,
            bottom: TOGGLE_INSET,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: TOGGLE_SIZE,
            height: TOGGLE_SIZE,
            padding: 0,
            borderRadius: 4,
            border: `1px solid ${accentColor}`,
            background: theme.colors.backgroundSecondary ?? theme.colors.background,
            color: accentColor,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          <Maximize2 size={13} strokeWidth={2.25} />
        </button>
      )}
      {handles}
    </div>
  );
}
