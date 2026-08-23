import type { ColumnHeader, Layout, Placement } from "./layout";

/**
 * WHERE THE LENS POINTS — as pure arithmetic over what the layout produced and
 * over the canvas it is drawn on.
 *
 * It sits beside `layout.ts` for the reason the layout does: the effects that
 * call it are React plumbing only a browser can run, and this is arithmetic
 * anything can state and check. Each behaviour here — where the graph opens, and
 * whether a card you just authored has to be revealed — was a defect found by
 * hand in a browser, and neither had a witness that could be executed until it
 * moved out of the component.
 *
 * THE TWO VIEWS MOVE BY DIFFERENT MACHINERY AND ASK THE SAME QUESTIONS. The
 * graph is a React Flow camera over an unbounded plane; the grid is a document
 * of the board's own size that the browser scrolls. A scroll is a translation,
 * so `scrolledViewport` states the one in the other's vocabulary and everything
 * below is written once.
 *
 * NOTHING HERE IS JUDGEMENT. These are screen coordinates: no filtering, no
 * staleness, no opinion about the graph. The view draws what the layout computed
 * and this only says where to look.
 *
 * Pure: no React, no `@xyflow/react`, no DOM, no clock, no randomness, and no
 * iteration over an unordered collection.
 */

/** React Flow's viewport in its own shape: a translation and a scale. */
export type Viewport = {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
};

/**
 * How big the visible box is — what "off screen" is measured against, and what a
 * reveal centres a card inside.
 *
 * In the graph it is React Flow's own pane. In the grid it is the scroll area's
 * viewport, which is NOT the React Flow pane any more: that pane is now the whole
 * board and is mostly outside the window.
 */
export type CanvasSize = { readonly width: number; readonly height: number };

/**
 * As much of a view's geometry as a camera needs: how big one card is.
 *
 * Two fields and not the four `edge-geometry.ts` asks for, because a camera has
 * no opinion about gaps. `GEOMETRY.grid` and `GEOMETRY.graph` both satisfy it,
 * so the caller passes the same object it passes everywhere else.
 */
export type CardGeometry = {
  readonly cardWidth: number;
  readonly cardHeight: number;
};

/**
 * THE ONE SCALE THIS SURFACE HAS. The grid is pinned to it — no zoom, no
 * fit-to-view, no minimap; movement there is scrolling and nothing else — and
 * the graph *opens* at it, so switching views is the same card at the same size
 * with no camera arithmetic in between.
 *
 * 1 is the scale the card is drawn at, and there is no zoom left in it to
 * spend. The card is two 16px text rows in a 44px box: at 0.7 a row renders
 * 11px, and at the fit-to-view that once framed every column it rendered under
 * 7 — and an id and a short name you cannot read is the entire content of a
 * card. The graph view still zooms by wheel; this number is only where it
 * OPENS.
 */
export const READABLE_ZOOM = 1;

/**
 * The gap between the canvas edge and the leftmost COLUMN HEADER, in screen
 * pixels, in both axes — the one place the graph view's opening inset is
 * written.
 *
 * The anchor is the header and not the first card: `openingViewport` below
 * explains why the two are different rules and why the header won.
 */
export const ANCHOR_MARGIN = 24;

/**
 * WHERE THE GRID OPENS: its own top-left corner, at the fixed scale.
 *
 * The grid is not a camera. Its scroll reference is the board's top-left corner,
 * so this is a constant rather than a function of the graph — an empty project
 * opens exactly where a full one does, and coming back from the graph view
 * returns here rather than inheriting wherever that view was panned to.
 *
 * It is a named export beside `openingViewport` rather than a branch inside it
 * so that each stays one claim that can be checked on its own. It restates React
 * Flow's own default viewport, and is passed anyway: which corner a view opens at
 * is this module's answer to give, not a library default to inherit silently.
 */
export function originViewport(): Viewport {
  return { x: 0, y: 0, zoom: READABLE_ZOOM };
}

/**
 * A SCROLLED DOCUMENT, RESTATED AS A VIEWPORT — the one place the grid's
 * vocabulary meets the graph's.
 *
 * The grid is not a camera at all now: its board is a DOM element of the board's
 * own size and the browser scrolls it. That is a translation and nothing else —
 * the board's origin is drawn at `-scrollLeft, -scrollTop` on screen, at the one
 * scale this surface has — so a scroll offset IS a viewport, and `revealNeeded`
 * below is one function answering for both views instead of two that can drift.
 *
 * It is stated here rather than inline in the effect that reads the element,
 * because the equivalence is arithmetic and the element is not.
 */
export function scrolledViewport(
  scrollLeft: number,
  scrollTop: number,
): Viewport {
  return { x: -scrollLeft, y: -scrollTop, zoom: READABLE_ZOOM };
}

/**
 * WHERE THE GRAPH OPENS — or `null`, which is a layout with no columns to
 * anchor against and nothing on screen to look at.
 *
 * THE ANCHOR IS THE LEFTMOST COLUMN HEADER, IN BOTH AXES. That header sits
 * `ANCHOR_MARGIN` in from the canvas's left edge and `ANCHOR_MARGIN` down from
 * its top, and its column's cards hang below it exactly as the layout placed
 * them.
 *
 * IT IS WRITTEN AGAINST THE LEFTMOST HEADER RATHER THAN AGAINST `Term`, AND
 * NEVER AS A LITERAL `{x: 24, y: 24}`. Term is that header today — it is the
 * canon's first row, it is Domain-layer, and `columnsInOrder` puts Domain
 * leftmost — but a hardcoded pair would quietly re-assume that the first header
 * sits at the layout's own origin, which is a fact about `graphLayout` and not
 * about this camera. Ask the layout where its leftmost header is and the two
 * can never drift apart.
 *
 * PLACEMENTS ARE DELIBERATELY NOT CONSULTED. The older rule anchored the
 * leftmost *populated* column, so a project with no nodes had no opening camera
 * at all: the graph view owed one forever and the readiness question below had
 * a case it could never answer. Headers exist as soon as there is a roster, and
 * the roster is compile-time here, so every project opens at the same place.
 * The cost, recorded rather than absorbed: a project whose nodes all sit in
 * Intent or further right opens with its first node off screen to the right.
 * That is the rule working, not failing.
 *
 * IT NO LONGER ASKS HOW BIG THE CANVAS IS, and the removal is worth recording
 * because it used to be the caller's hardest case. This took a `canvasHeight`
 * and answered `null` below a measured pane, so the graph's camera had to be
 * OWED across renders until React Flow reported a size. Nothing in the
 * arithmetic ever used that number — the anchor is the header's own position —
 * so the gate was a readiness question this function had no stake in, and it
 * cost the caller a pair of refs and a retry. The answer is available before the
 * first paint, which is what lets the view declare where it opens instead of
 * correcting itself afterwards.
 *
 * TIES GO TO THE FIRST COLUMN IN LAYOUT ORDER (the comparison is strict), so
 * two headers at the same x cannot make the same graph open two ways.
 */
export function openingViewport(layout: Layout): Viewport | null {
  let leftmost: ColumnHeader | undefined;
  for (const column of layout.columns) {
    if (leftmost === undefined || column.x < leftmost.x) leftmost = column;
  }
  if (leftmost === undefined) return null;

  return {
    x: ANCHOR_MARGIN - leftmost.x * READABLE_ZOOM,
    y: ANCHOR_MARGIN - leftmost.y * READABLE_ZOOM,
    zoom: READABLE_ZOOM,
  };
}

/**
 * DOES ANYTHING HAVE TO MOVE FOR THIS CARD TO BE SEEN?
 *
 * Both layouts place a node by its TYPE, so a node authored from anywhere can
 * land columns away from wherever you happen to be looking — measured on the
 * board this ports from: an `WorkItem` at x = 2435 in a 1200px canvas,
 * with the detail panel opening on it and the viewport never moving.
 *
 * FULLY ON SCREEN MEANS THE WHOLE CARD, not its top-left corner: a card cut in
 * half by the canvas edge is a card you cannot read, and on a two-line card the
 * half you lose is as likely to be the short name as the id. Authoring into the
 * part of the canvas you are already looking at moves nothing.
 *
 * BOTH VIEWS ASK THIS, AND NEITHER HAS TO BE NAMED HERE. The graph hands in the
 * camera it is looking through and its pane; the grid hands in
 * `scrolledViewport(…)` and the size of the scroll area's viewport. The
 * arithmetic cannot tell them apart, which is the point.
 */
export function revealNeeded(
  placement: Placement,
  geometry: CardGeometry,
  viewport: Viewport,
  canvas: CanvasSize,
): boolean {
  const left = placement.x * viewport.zoom + viewport.x;
  const top = placement.y * viewport.zoom + viewport.y;
  const onScreen =
    left >= 0 &&
    top >= 0 &&
    left + geometry.cardWidth * viewport.zoom <= canvas.width &&
    top + geometry.cardHeight * viewport.zoom <= canvas.height;
  return !onScreen;
}

/**
 * WHERE A CARD'S MIDDLE IS, in the board's own coordinates. What the graph view
 * hands to `setCenter`, and what the grid's scroll offset is measured back from.
 *
 * IT USED TO CARRY A CLAMP AND NO LONGER NEEDS ONE, which is worth recording
 * because the clamp was not decoration. The grid was panned by React Flow inside
 * a `translateExtent`, and `setCenter` writes the transform straight through
 * d3-zoom without its `constrain()` — so centring on a card near the board's own
 * corner painted blank space outside the board and snapped back only on the next
 * gesture. The grid is a scrolling document now: `scrollTo` is clamped to
 * `[0, scrollWidth - clientWidth]` by the browser, and the graph is unbounded and
 * never wanted a clamp in the first place. Nobody is left to hold in.
 */
export function cardCenter(
  placement: Placement,
  geometry: CardGeometry,
): { readonly x: number; readonly y: number } {
  return {
    x: placement.x + geometry.cardWidth / 2,
    y: placement.y + geometry.cardHeight / 2,
  };
}

/**
 * WHERE THE GRID'S SCROLL AREA HAS TO BE SCROLLED TO to put that card in the
 * middle of what is visible — the document-shaped answer to the same ask
 * `setCenter` serves in the graph.
 *
 * The result may be negative, or past the end of the board, and both are left
 * alone: the browser holds a `scrollTo` inside the element's own scroll range,
 * and the board element is floored at the viewport's size, so an out-of-range
 * answer here is simply not applied. There is no second opinion to keep in sync.
 */
export function revealScroll(
  placement: Placement,
  geometry: CardGeometry,
  canvas: CanvasSize,
): { readonly left: number; readonly top: number } {
  const centre = cardCenter(placement, geometry);
  return {
    left: centre.x - canvas.width / 2,
    top: centre.y - canvas.height / 2,
  };
}
