/**
 * The drill-down morph — the vocabulary a graph uses to grow, shrink, slide and
 * fade its boxes between two ELK layouts, shared by the C4 canvas and the
 * component graph so a container animates the same way on either.
 *
 * Nothing here knows about a particular node type. A graph diffs two layouts
 * (`diffLayoutRects`), stamps the result on its nodes as `MorphNodeData`, and
 * each node view turns that into a position-only FLIP (`useFlip`) plus a fade
 * (`useFade`) through `useMorphStyle`. Size is never animated here: a box that
 * grows transitions its own `width`/`height`, so a scale on the wrapper would
 * distort its text and fight that transition.
 */

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

/** How long a box takes to glide and grow, in ms. */
export const MORPH_MS = 420;

/**
 * How long boxes arriving or leaving take to fade, in ms. The morph is
 * sequenced: the fade runs first, and the surviving boxes wait it out before
 * they move and grow (`moveDelayMs`). So the reveal clock is
 * `FADE_MS + MORPH_MS`, not just `MORPH_MS`.
 */
export const FADE_MS = 200;

/** Flow-space rect of a box node or a frame. */
export interface FlowRect { x: number; y: number; width: number; height: number }

/** A box's travel for the morph: its flow rect before → after. */
export interface FrameGrow { from: FlowRect; to: FlowRect }

/** What a node carries so its view can take part in the morph. */
export interface MorphNodeData {
  /** FLIP: absolute flow rects — where this box was, and where it now is. */
  growFrom?: FlowRect;
  frameRect?: FlowRect;
  /** Arriving in this layout — fades in. */
  entering?: boolean;
  /** Gone from this layout — kept for the morph, fades out. */
  leaving?: boolean;
  /** The move/grow waits this long for the fade to finish, in ms. */
  moveDelayMs?: number;
}

/** The slice of a laid-out graph the morph reads rects from. */
export interface MorphLayout {
  nodes: ReadonlyArray<{
    id: string;
    position: { x: number; y: number };
    parentId?: string;
    width?: number | null;
    height?: number | null;
  }>;
  /** Frame rects, already absolute. */
  groupBounds: ReadonlyMap<string, FlowRect>;
}

/**
 * A node's rect in **absolute** flow space, walking the parent chain.
 *
 * `groupBounds` is already absolute; a leaf's `position` is relative to its
 * parent, so each ancestor's origin is added in turn.
 *
 * The FLIP needs absolute rects, not parent-relative ones. React Flow places a
 * node at its new absolute position (parent origin + relative position) and
 * moves children along with the parent's *wrapper* — while our FLIP transform
 * lives on the node's inner div, which the children do not inherit. So a node's
 * own transform must cover its full absolute delta; rebasing it to the parent
 * would leave it short by exactly the parent's movement (the "subtle drift"
 * before a leaving box disappears).
 */
export function absoluteRectOf(layout: MorphLayout, id: string): FlowRect | null {
  const frame = layout.groupBounds.get(id);
  if (frame) return { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
  const node = layout.nodes.find((n) => n.id === id);
  if (!node) return null;
  const origin = node.parentId ? absoluteRectOf(layout, node.parentId) : null;
  return {
    x: (origin?.x ?? 0) + node.position.x,
    y: (origin?.y ?? 0) + node.position.y,
    width: node.width ?? 0,
    height: node.height ?? 0,
  };
}

/**
 * Every box whose rect changes between two layouts, so frames *and* cards grow,
 * shrink and slide together. `null` when nothing moved (e.g. the initial paint),
 * so a caller can tell "no morph" from "a morph of nothing".
 *
 * Covers nested boxes too: rects are absolute (`absoluteRectOf`), so a child's
 * transform covers its full delta rather than fighting its parent's wrapper.
 */
export function diffLayoutRects(prev: MorphLayout, next: MorphLayout): Map<string, FrameGrow> | null {
  const grows = new Map<string, FrameGrow>();
  const ids = new Set([
    ...prev.groupBounds.keys(),
    ...next.groupBounds.keys(),
    ...prev.nodes.map((n) => n.id),
    ...next.nodes.map((n) => n.id),
  ]);
  for (const id of ids) {
    const from = absoluteRectOf(prev, id);
    const to = absoluteRectOf(next, id);
    if (!from || !to) continue;
    if (from.x === to.x && from.y === to.y && from.width === to.width && from.height === to.height) {
      continue;
    }
    grows.set(id, { from, to });
  }
  return grows.size > 0 ? grows : null;
}

/**
 * Whether committing a layout should also move the camera.
 *
 * A morph — a commit that has rects to FLIP from — must not. Every element
 * already on screen is sliding from the rect the reader last saw it at, and that
 * anchoring *is* the morph; a viewport move on top of it makes each card's
 * on-screen path the sum of two independent animations, so nothing lands where
 * the FLIP said it would.
 *
 * A commit with no `grows` is a genuine change: the first paint, a new system, a
 * different element set, or the grid fallback after an ELK failure. There is no
 * continuity to preserve there and the content may genuinely not be on screen, so
 * fit. An *empty* map fits for the same reason — no element is anchoring, so there
 * is nothing a camera move could contradict.
 *
 * @param grows the rects to animate from, exactly as the nodes received them.
 */
export function shouldRefitCamera(grows: Map<string, FrameGrow> | null): boolean {
  return !grows || grows.size === 0;
}

/**
 * FLIP between two absolute flow rects: render transformed back onto `from`,
 * then release onto `to`.
 *
 * The step back **must** happen while rendering, not in an effect. An effect runs
 * after the browser has already painted, so the element is painted at its new
 * position for one frame and only then jumps back — a visible teleport, which is
 * the exact thing this hook exists to remove. Adjusting state during render lets
 * React apply the transform in the same commit, so the new position is never
 * painted untransformed.
 *
 * The rects are keyed by value: a graph mints fresh rect objects each layout, so
 * comparing identity would re-fire the whole morph on unrelated re-renders.
 */
export function useFlip(from: FlowRect | undefined, to: FlowRect | undefined) {
  const key = from && to ? `${from.x},${from.y},${to.x},${to.y}` : '';
  const [lastKey, setLastKey] = useState(key);
  const [placed, setPlaced] = useState(!key);
  if (key !== lastKey) {
    setLastKey(key);
    setPlaced(false);
  }
  useEffect(() => {
    if (!key) return;
    const raf = requestAnimationFrame(() => setPlaced(true));
    return () => cancelAnimationFrame(raf);
  }, [key]);
  return {
    flipping: key !== '',
    placed,
    dx: from && to ? from.x - to.x : 0,
    dy: from && to ? from.y - to.y : 0,
  };
}

/**
 * Opacity for a box arriving or leaving the layout. An arriving box mounts
 * hidden and fades in; a leaving box is kept (out of the new layout) for the
 * morph, then fades out — a removal reads as a fade, not a pop.
 */
export function useFade(entering?: boolean, leaving?: boolean) {
  const animate = entering === true || leaving === true;
  const [shown, setShown] = useState(entering !== true);
  useEffect(() => {
    if (!animate) return;
    const raf = requestAnimationFrame(() => setShown(leaving !== true));
    return () => cancelAnimationFrame(raf);
  }, [animate, entering, leaving]);
  if (!animate) return { opacity: 1, transition: undefined as string | undefined };
  return { opacity: shown ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` };
}

/**
 * The position-only morph for a node's wrapper: the FLIP slide and the fade, as
 * inline style. Size is left to the node's own transition, so the two compose
 * without either fighting the other.
 *
 * `transform: none` needs no transition, and a box that only changed *size* has
 * nothing to slide — so neither is listed unless it is actually animating.
 */
export function useMorphStyle(data: MorphNodeData): CSSProperties {
  const { growFrom, frameRect, entering, leaving, moveDelayMs = 0 } = data;
  const { flipping, placed, dx, dy } = useFlip(growFrom, frameRect);
  const sliding = flipping && (dx !== 0 || dy !== 0);
  const fade = useFade(entering, leaving);
  const transitions = [
    ...(fade.transition ? [fade.transition] : []),
    ...(sliding && placed ? [`transform ${MORPH_MS}ms ease-out ${moveDelayMs}ms`] : []),
  ];
  return {
    transformOrigin: 'top left',
    transform: sliding && !placed ? `translate(${dx}px, ${dy}px)` : 'none',
    transition: transitions.length > 0 ? transitions.join(', ') : 'none',
    opacity: fade.opacity,
  };
}
