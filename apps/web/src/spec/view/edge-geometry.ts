/**
 * Where a relation meets a card — the floating attachment point, as arithmetic
 * over two card boxes and the view's own geometry.
 *
 * There is no handle to aim at and no dot to draw. The endpoint is the point
 * where the line between the two card centres crosses the card's border, so it
 * slides along that border as either card moves. Two rules sit on top of that.
 *
 * **The corner inset.** A relation leaving exactly at a right-angle corner
 * reads as a mistake, so the crossing is clamped into the middle half of
 * whichever border it lands on. It is a share of the side and not a pixel
 * count, so it means the same thing on a short border as on a long one — see
 * `cornerInset`.
 *
 * **The grid clamps the exit side to left or right; the graph uses all four.**
 * The grid packs a column at a 6px row gap, so a four-sided rule would put a
 * same-column pair's whole path inside those 6px: neighbours draw a ~6px tick,
 * and a pair two rows apart draws a vertical line straight through the card
 * between them — under it, since cards paint above relations. Clamped
 * sideways, every grid relation leaves into the column gap, where it is visible
 * and its interaction stroke can be right-clicked, which is the only way to
 * delete a relation. The graph view has a 40px column gap, an 18px row gap and
 * no bands, so it has room to leave by whichever border is nearest.
 *
 * The clamp only chooses *which* border; the point on it is still the crossing
 * and still slides, so nothing here is a fixed attachment point.
 *
 * This module does not draw. The path between the two endpoints belongs to
 * `edge-routing.ts`; the one thing said about it here is `offset`, which is a
 * fact about the gap between two columns and therefore a fact about this
 * geometry.
 *
 * Pure: no React, no `@xyflow/react`, no DOM, no clock, no randomness. The same
 * graph has to draw the same picture every time.
 */

export type BorderSide = "left" | "right" | "top" | "bottom";

/** Which Spec-plane view is asking. The two differ in exactly one rule. */
export type SpecView = "grid" | "graph";

export type Point = { readonly x: number; readonly y: number };

/** A card's box in flow coordinates — what a placement plus the geometry makes. */
export type CardBox = Point & {
  readonly width: number;
  readonly height: number;
};

/**
 * Where a card sits: its top-left corner in flow coordinates.
 *
 * Declared structurally rather than as the layout's own `Placement`, so this
 * module can be read and tested without the layout — any placement satisfies
 * it.
 */
export type CardOrigin = Point;

/**
 * The part of the layout's `GEOMETRY.grid` / `GEOMETRY.graph` this module
 * reads.
 *
 * **Every constant has one home, and for the card box that home is the
 * layout's `GEOMETRY`.** Nothing here restates a card width, a card height or a
 * gap: the module that reserves space for a card and the module that attaches a
 * line to it must read the same number, or the two drift and the picture is
 * subtly wrong in a way no test of either half alone would catch. The type is
 * structural rather than `typeof GEOMETRY.grid` because that object is a const
 * assertion, which would pin `columnGap` to its current literal.
 */
export type CardGeometry = {
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly columnGap: number;
  readonly rowGap: number;
};

export type FloatingEndpoints = {
  /** The point on the source card's border, in flow coordinates. */
  readonly sx: number;
  readonly sy: number;
  /** The point on the target card's border. */
  readonly tx: number;
  readonly ty: number;
  readonly sourceSide: BorderSide;
  readonly targetSide: BorderSide;
  /**
   * How far the path steps away from the border before it may turn — half the
   * gap it steps into, so the turn lands in the middle of the empty lane
   * rather than under the next card.
   *
   * The library's own default is 20, which is wider than the grid's whole 16px
   * column gap and wider than the graph's 18px row gap. Measured in a browser,
   * a step of 20 into an 18px row gap overshoots past its target, comes back
   * and goes down again — a scribble inside the gap instead of a line.
   *
   * Which gap depends on which borders the relation leaves by: a left/right
   * pair steps sideways into the column gap, and anything leaving a top or
   * bottom border steps into a row gap. The grid is always the former, since
   * its sides are clamped.
   *
   * It is also the only reason a same-column pair is visible at all: both
   * endpoints sit on the same border line, and the step is what draws the path
   * beside the cards instead of along their edge.
   */
  readonly offset: number;
};

function boxOf(origin: CardOrigin, geometry: CardGeometry): CardBox {
  return {
    x: origin.x,
    y: origin.y,
    width: geometry.cardWidth,
    height: geometry.cardHeight,
  };
}

function centreOf(box: CardBox): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * How much of either end of a border a relation may not attach to.
 *
 * The complaint this answers is about corners — an edge coming out of a card's
 * right-angle corner looks broken — and the first fix tried was four fixed side
 * midpoints, which would have thrown away the sliding attachment. This keeps
 * the slide and only forbids the outer quarter at each end.
 *
 * **A share of the side, not a number of pixels.** A pixel constant derived
 * from the short border and then applied to the long one only relocates the
 * defect: it removes the corner exit on a short side outright and moves it a
 * few percent along a 148px side, where it still reads as a corner exit. A
 * share has the same geometric meaning at every length — the endpoint lives in
 * the middle half of whichever border it lands on. On the two-line card that is
 * 11px of a 44px left/right border and 37px of a 148px top/bottom one.
 *
 * Deliberately not exported as a bare constant: an exported number is an
 * invitation to a second home for it. Callers that need the value ask this
 * function for a given side length.
 */
const CORNER_INSET_SHARE = 1 / 4;

/**
 * The inset a border can afford: never more than half its own length, or the
 * two insets would cross and the clamp would invert, with its low above its
 * high.
 *
 * The guard is slack while the share is under a half, and is kept because it is
 * the invariant rather than an arithmetic accident — it is what makes a
 * corrected share safe to type. The worst a correction can then do is collapse
 * the slide to a single midpoint.
 */
export function cornerInset(sideLength: number): number {
  return Math.min(sideLength * CORNER_INSET_SHARE, sideLength / 2);
}

/**
 * Which border faces a point — the box's own diagonal decides, so a wide flat
 * card hands off to its top or bottom edge only when the direction is genuinely
 * steeper than its corner.
 *
 * Ties, and a point exactly at the centre, answer `right`. The caller needs a
 * total function: a side chosen by anything less would make the same graph two
 * different pictures.
 */
function sideToward(box: CardBox, toward: Point): BorderSide {
  const centre = centreOf(box);
  const dx = toward.x - centre.x;
  const dy = toward.y - centre.y;
  if (Math.abs(dy) * box.width <= Math.abs(dx) * box.height) {
    return dx < 0 ? "left" : "right";
  }
  return dy < 0 ? "top" : "bottom";
}

/**
 * The grid's rule: the side that faces the other column, and `right` when the
 * two share a column.
 *
 * Applied to both cards it is symmetric — a same-column pair leaves both cards
 * on the right, into the gap; a pair in different columns leaves the left
 * card's right side and enters the right card's left side.
 */
function sideAcross(from: CardBox, to: CardBox): BorderSide {
  return centreOf(to).x < centreOf(from).x ? "left" : "right";
}

/**
 * Where the ray from a card's centre toward a point crosses one named border,
 * clamped to that border's span minus a corner inset at each end — so the
 * answer is always on the card and never in a corner.
 *
 * A ray parallel to the border (a same-column pair against a vertical side) has
 * no crossing and takes the border's midpoint, which is inside the inset by
 * construction.
 */
function pointOnSide(box: CardBox, side: BorderSide, toward: Point): Point {
  const centre = centreOf(box);
  const dx = toward.x - centre.x;
  const dy = toward.y - centre.y;

  if (side === "left" || side === "right") {
    const inset = cornerInset(box.height);
    const x = side === "left" ? box.x : box.x + box.width;
    const y = dx === 0 ? centre.y : centre.y + ((x - centre.x) / dx) * dy;
    return { x, y: clamp(y, box.y + inset, box.y + box.height - inset) };
  }

  const inset = cornerInset(box.width);
  const y = side === "top" ? box.y : box.y + box.height;
  const x = dy === 0 ? centre.x : centre.x + ((y - centre.y) / dy) * dx;
  return { x: clamp(x, box.x + inset, box.x + box.width - inset), y };
}

/** Both ends of one relation: where it leaves the source and where it meets the target. */
export function floatingEndpoints(
  source: CardOrigin,
  target: CardOrigin,
  geometry: CardGeometry,
  view: SpecView,
): FloatingEndpoints {
  const from = boxOf(source, geometry);
  const to = boxOf(target, geometry);
  const sourceSide =
    view === "grid" ? sideAcross(from, to) : sideToward(from, centreOf(to));
  const targetSide =
    view === "grid" ? sideAcross(to, from) : sideToward(to, centreOf(from));
  const start = pointOnSide(from, sourceSide, centreOf(to));
  const end = pointOnSide(to, targetSide, centreOf(from));
  const sideways =
    sourceSide !== "top" &&
    sourceSide !== "bottom" &&
    targetSide !== "top" &&
    targetSide !== "bottom";

  return {
    sx: start.x,
    sy: start.y,
    tx: end.x,
    ty: end.y,
    sourceSide,
    targetSide,
    offset: (sideways ? geometry.columnGap : geometry.rowGap) / 2,
  };
}

/**
 * The same attachment rule against a bare point rather than a second card —
 * what the connection line draws from while a person is dragging a new relation
 * out of a card.
 *
 * Four-sided in both views on purpose: the far end is a pointer, not a card, so
 * there is no column gap to route through and no view rule to obey. The line
 * follows the hand, and the moment it becomes a relation the drawn edge takes
 * the view's own rule.
 *
 * It shares the corner inset by delegating to the same function, so the preview
 * leaves the card exactly where the settled relation is about to. An unclamped
 * twin would buy a preview that jumps a few pixels on release.
 */
export function borderPointToward(card: CardBox, toward: Point): Point {
  return pointOnSide(card, sideToward(card, toward), toward);
}
