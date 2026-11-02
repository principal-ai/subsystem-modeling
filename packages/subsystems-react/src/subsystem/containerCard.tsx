/**
 * The shared card vocabulary a container draws with — on the C4 canvas as a
 * `C4NodeCard`, and on the component graph as a process / package frame.
 *
 * Both canvases draw the same two rows at the top of a container: the label
 * (two lines, kind glyph on the right) and the technology row (brand mark,
 * technology, member count). Keeping the rows and their metrics here is what
 * lets the two cards read as one notation, and what keeps each card's chrome a
 * known quantity for the layout that has to reserve room for it.
 */

import { useTheme } from '@principal-ade/industry-theme';
import type { LucideIcon } from 'lucide-react';
import { TechMark } from './techIcons';
import type { TechBrand } from './techIcons';

/**
 * Card box for a container: a wide rectangle. A container carries four things
 * at once (technology row, label, description, and the notation gap it still
 * has), and a strip would force the last two to wrap hard.
 */
export const NODE_W = 250;
export const NODE_H = 150;

/**
 * Fixed label slot, so the description below sits at the same y on every card
 * even when a label is one line rather than two.
 */
export const LABEL_SLOT_H = 40;

/**
 * The technology row's height, pinned for the same reason as the label slot: the
 * row is a line of text plus an optional 16px brand mark, so its natural height
 * depends on which of those are present. Pinning it makes the card's chrome a
 * known quantity, which is what lets `descriptionLineBudget` say how many
 * description lines fit — and lets the footer pad and the header pad agree about
 * where the card's content actually ends.
 */
export const TECH_SLOT_H = 18;

/** The card's own vertical padding (`padding: '10px 12px'`). */
export const CARD_PAD_Y = 10;

/** The card's own horizontal padding. */
export const CARD_PAD_X = 12;

/** The card's flex `gap`, between each of its rows. */
export const CARD_GAP = 3;

/**
 * Breathing room between a grown container's own chrome and the components nested
 * inside it.
 *
 * The description is hidden while grown, so the components land where the
 * description would have been — immediately under the technology row. Without
 * this the gap is the width of one row gap, which reads as the components being
 * crowded against the header while the sides and footer sit `OPEN_SIDE_PAD` away.
 * This is not chrome: nothing is drawn in it.
 */
export const OPEN_HEADER_AIR = 16;

/**
 * Space a *grown* container reserves above its nested components: the card's own
 * padding, its label slot, its technology row, the gaps between them, and a little
 * air. The description is hidden while grown, so it is not part of this.
 *
 * Derived from the same constants the card is built from, rather than written as
 * a literal, so it cannot drift from `descriptionLineBudget` — which subtracts
 * exactly this chrome (and no air) to decide how much description a closed card
 * can show. Those two disagreeing is how a card ends up taller than the box ELK
 * laid out for it.
 *
 * The graph hands this to ELK as the compound parent's top padding rather than
 * nudging the children down itself — so the parent's size and the children's
 * placement are still one ELK fit, not our arithmetic layered on top of it.
 */
export const OPEN_HEADER_PAD =
  CARD_PAD_Y * 2 + LABEL_SLOT_H + CARD_GAP + TECH_SLOT_H + CARD_GAP + OPEN_HEADER_AIR;

/**
 * The drill-down affordance, in the card's own box. Extracted from the button's
 * style so the reserved footer cannot drift from the thing it is reserving for —
 * the two numbers are the same number.
 */
export const TOGGLE_SIZE = 22;
export const TOGGLE_INSET = 6;

/**
 * Space a *grown* container reserves below its nested components, so the last row
 * does not sit under the collapse affordance.
 *
 * The toggle is absolutely positioned, so it takes no space in the card's flow and
 * ELK knows nothing about it: without this the parent is fitted to its children
 * alone and the final row is drawn straight through the button. Reserving the
 * toggle's own reach plus a little air keeps that an ELK fit too, rather than
 * something we nudge afterwards.
 */
export const OPEN_FOOTER_PAD = TOGGLE_INSET + TOGGLE_SIZE + 8;

/**
 * Space a *grown* container reserves to the left and right of its nested
 * components.
 *
 * Deliberately the footer's number rather than its own: the nested cards should
 * sit in one uniform inset, not a wider one at the bottom than at the sides. Both
 * are wider than the card's own 12px text inset — the label and technology row are
 * the container's chrome and sit flush with its padding, while the nested cards
 * are separate boxes it contains, and at the same inset they read as part of that
 * chrome rather than held inside it.
 */
export const OPEN_SIDE_PAD = OPEN_FOOTER_PAD;

export interface ContainerCardHeaderProps {
  label: string;
  /** The kind glyph beside the label — a container's sort, a package's mark. */
  Icon?: LucideIcon;
  /** Accessible name for the glyph. */
  iconLabel?: string;
  /** The border colour; the glyph takes it so the two read as one accent. */
  color: string;
  /** Override for the kind glyph colour; defaults to `color`. */
  iconColor?: string;
  /** The technology row's text. Empty hides the text but not the row. */
  topLabel?: string;
  /** The official technology mark, when we hold one. */
  brand?: TechBrand;
  /**
   * Whether the technology row is pinned to `TECH_SLOT_H`. A container always has
   * one (at minimum its member count); a person never does, and its row stays
   * zero-height so the description gets the line.
   */
  hasTechRow: boolean;
  /** Right-aligned count in the technology row — how many members the box groups. */
  count?: { value: number; Icon: LucideIcon };
  /** Centre the rows (components, people) instead of left-aligning them. */
  centered?: boolean;
}

/**
 * The two rows at the top of every container card: label, then technology.
 *
 * Heights are pinned (`LABEL_SLOT_H`, `TECH_SLOT_H`) so the rows land at the same
 * y on every card and the chrome below them can be reserved exactly — see
 * `OPEN_HEADER_PAD`.
 */
export function ContainerCardHeader({
  label,
  Icon,
  iconLabel,
  color,
  iconColor,
  topLabel,
  brand,
  hasTechRow,
  count,
  centered = false,
}: ContainerCardHeaderProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  return (
    <>
      {/* The label row: the name, then the kind mark. Two lines rather than an
          ellipsis — a truncated label hides the very thing that distinguishes
          two containers from each other. The fixed height reserves both lines
          even for a one-line label, so the row below sits at the same y on
          every card. */}
      <span
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: centered ? 'center' : 'space-between',
          gap: 6,
          height: LABEL_SLOT_H,
          // Without this the slot shrinks when the content exceeds the card's fixed
          // height, and `descriptionLineBudget`'s chrome stops being the chrome —
          // measured at 39.11px instead of 40 the moment the description ran long.
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: theme.fonts.body,
            fontWeight: 600,
            fontSize: theme.fontSizes[2],
            color: theme.colors.text,
            lineHeight: 1.25,
            maxHeight: LABEL_SLOT_H,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textAlign: centered ? 'center' : 'left',
            minWidth: 0,
          }}
        >
          {label}
        </span>
        {Icon && (
          <span
            aria-label={iconLabel}
            style={{
              display: 'inline-flex',
              flexShrink: 0,
              color: iconColor ?? color,
              // Nudge down so the glyph optically centres on the first text line.
              marginTop: 3,
            }}
          >
            <Icon size={16} strokeWidth={2.25} />
          </span>
        )}
      </span>
      {/* The technology row: the brand mark when we hold the official one, then
          the technology. Right-aligned, the number of members the box groups. */}
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
          // Pinned, like the label slot above it: an empty row would otherwise be
          // zero-height and the description budget would have to guess which cards
          // have a technology row. Empty stays zero — a person has no technology.
          ...(hasTechRow ? { height: TECH_SLOT_H, flexShrink: 0 } : {}),
        }}
      >
        {topLabel && (
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
        )}
        {count && (
          <span
            style={{
              flexShrink: 0,
              letterSpacing: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {count.value}
            <count.Icon size={12} strokeWidth={2.25} />
          </span>
        )}
      </span>
    </>
  );
}
