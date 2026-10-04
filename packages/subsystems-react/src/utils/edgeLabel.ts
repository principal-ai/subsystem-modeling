/**
 * Shared geometry for the HTML edge-label overlay and the ELK layout that
 * reserves room for it.
 *
 * The overlay (SubsystemComponentGraph) and the layout (elkLayout) must agree
 * on one fixed box size, or the space ELK leaves for a label drifts from what
 * actually renders. Keeping the geometry here lets both import the same values
 * without a component → util → component import cycle.
 */

/** Fixed width of every edge label, in flow/screen px. Wide enough for the
 *  longest mechanism (`registers-into`) plus horizontal padding at the label
 *  font size. */
export const EDGE_LABEL_WIDTH = 140;

/** Fixed height of every edge label. Sized to the label font plus padding. */
export const EDGE_LABEL_HEIGHT = 40;

/** Label font size. Fixed so every label renders at the same text size. */
export const EDGE_LABEL_FONT_SIZE = 14;

/**
 * Approx monospace advance at `EDGE_LABEL_FONT_SIZE` (14px), incl. the tiny
 * letter-spacing. Fira Code / SF Mono / Courier sit at ~0.6em (8.4px); rounded
 * up so a width estimate never undershoots and clips the label.
 */
const LABEL_CHAR_WIDTH = 8.5;

/** Chip chrome: horizontal padding is 8+8 in the overlay (see C4EdgeLabels). */
const LABEL_CHIP_CHROME = 16;

/**
 * Estimated rendered width of an edge label's chip, from its text. Both the
 * overlay and the ELK reservation must use this same number, or the reserved
 * run drifts from what renders. Clamped to a minimum so a one-word protocol
 * still reads as a chip.
 */
export function estimateEdgeLabelWidth(text: string): number {
  return Math.max(48, (text?.length ?? 0) * LABEL_CHAR_WIDTH + LABEL_CHIP_CHROME);
}

/**
 * Reserved label width for C4's own edges, used as the fallback/max when a
 * caller doesn't size per-label. C4's lines carry short protocols (`RPC`,
 * `HTTP`, `file I/O`), so the shared 140 (sized for the component graph's
 * `registers-into`) is wider than needed and inflates the run between boxes.
 */
export const C4_LABEL_WIDTH = 90;

/**
 * Clear space we want on each side of a label box.
 *
 * Passed as ELK's `interLayerSpacing` (`nodeNodeBetweenLayers`). ELK's
 * `CENTER_LAYER` label strategy inserts a dedicated label layer and applies
 * that spacing on *both* sides of it, so the resulting gap between the two
 * nodes an edge connects is:
 *
 *     EDGE_LABEL_WIDTH + 2 * EDGE_LABEL_SIDE_PADDING
 *
 * i.e. the reserved label box plus this clearance at each end. Setting a big
 * "min edge length" here double-counts (it is applied twice), which is how the
 * gap silently ballooned before.
 */
export const EDGE_LABEL_SIDE_PADDING = 32;

/** Actual end-to-end gap ELK leaves for a labelled edge (box + both clearances). */
export const EDGE_LABEL_EDGE_GAP =
  EDGE_LABEL_WIDTH + EDGE_LABEL_SIDE_PADDING * 2;

/**
 * How far (in flow px) the target end of an edge stops short of the node
 * border. ELK ends the path exactly on the border, so the arrowhead tip lands
 * on the border line; pulling it back this much lets the arrow visually touch
 * the node without overlapping its border. 0 = flush (old behaviour).
 */
export const EDGE_ARROW_INSET = 2;

/**
 * Build a "cloud" outline that fills a `w × h` box: a flat-ish bottom with
 * rounded corners and three top lobes (large left, medium middle, small right).
 * Used as the background silhouette for ambiguous (non-verifiable) edge labels —
 * a real cloud shape, which `border-radius` cannot express. Control points are
 * normalized (`0…1`) so the shape scales with the label box.
 */
function cloudPath(w: number, h: number): string {
  const p = (nx: number, ny: number) =>
    `${(nx * w).toFixed(2)} ${(ny * h).toFixed(2)}`;
  return [
    `M ${p(0.043, 0.65)}`,
    // Bottom-left rounded corner + flat bottom.
    `C ${p(0.014, 0.8)} ${p(0.05, 0.925)} ${p(0.114, 0.925)}`,
    `L ${p(0.829, 0.925)}`,
    // Bottom-right rounded corner up into the right (small) lobe.
    `C ${p(0.914, 0.925)} ${p(0.986, 0.825)} ${p(0.986, 0.675)}`,
    `C ${p(0.986, 0.475)} ${p(0.943, 0.325)} ${p(0.879, 0.325)}`,
    `C ${p(0.829, 0.325)} ${p(0.793, 0.425)} ${p(0.771, 0.525)}`,
    // Middle lobe.
    `C ${p(0.736, 0.275)} ${p(0.664, 0.15)} ${p(0.6, 0.2)}`,
    `C ${p(0.564, 0.225)} ${p(0.536, 0.3)} ${p(0.521, 0.375)}`,
    // Big left lobe.
    `C ${p(0.486, 0.1)} ${p(0.4, 0.025)} ${p(0.336, 0.075)}`,
    `C ${p(0.279, 0.1)} ${p(0.243, 0.225)} ${p(0.221, 0.375)}`,
    // Down the left side, back to the corner.
    `C ${p(0.2, 0.5)} ${p(0.143, 0.475)} ${p(0.1, 0.525)}`,
    `C ${p(0.064, 0.55)} ${p(0.057, 0.6)} ${p(0.043, 0.65)}`,
    'Z',
  ].join(' ');
}

/**
 * Extra height (flow px) the cloud rises above the label box. The cloud and
 * its text share the label box, but ambiguous labels draw a taller silhouette
 * that overhangs upward — so the cloud gets more presence without moving the
 * text or changing the verifiable labels' box.
 */
export const EDGE_LABEL_CLOUD_EXTRA_TOP = 14;

/** Cloud silhouette for ambiguous edge labels, matched to the label box. */
export const EDGE_LABEL_CLOUD_PATH = cloudPath(
  EDGE_LABEL_WIDTH,
  EDGE_LABEL_HEIGHT + EDGE_LABEL_CLOUD_EXTRA_TOP,
);

