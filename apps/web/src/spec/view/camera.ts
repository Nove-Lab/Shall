import type { ColumnHeader, Layout, Placement } from "./layout";

/**
 * WHERE THE LENS POINTS — as pure arithmetic over what the layout produced and
 * over the canvas it is drawn on.
 *
 * It sits beside `layout.ts` for the reason the layout does: the effects that
 * call it are React plumbing only a browser can run, and this is arithmetic
 * anything can state and check. Each behaviour here — where each view opens, how
 * far the grid may be scrolled, and whether a card you just authored has to be
 * revealed — was a defect found by hand in a browser, and none of them had a
 * witness that could be executed until it moved out of the component.
 *
 * NOTHING HERE IS JUDGEMENT. These are screen coordinates for React Flow's own
 * viewport: no filtering, no staleness, no opinion about the graph. The view
 * draws what the layout computed and this only says where to look.
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

/** The canvas's pixel size — what "off screen" and "undersized" are measured against. */
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
 * The two world-space corners a viewport may not be moved outside — React
 * Flow's `translateExtent`, restated here so this module imports nothing but a
 * type from its neighbour.
 */
export type Extent = readonly [
  readonly [number, number],
  readonly [number, number],
];

/**
 * THE ONE SCALE THIS SURFACE HAS. The grid is pinned to it — no zoom, no
 * fit-to-view, no minimap; movement there is scrolling and nothing else — and
 * the graph *opens* at it, so switching views is the same card at the same size
 * with no camera arithmetic in between.
 *
 * 1 is the scale the card is drawn at, and there is no zoom left in it to
 * spend. The card is two 16px text rows in a 44px box: at 0.7 a row renders
 * 11px, and at the fit-to-view that once framed all twenty-three columns it
 * rendered under 7 — and an id and a short name you cannot read is the entire
 * content of a card. The graph view still zooms by wheel; this number is only
 * where it OPENS.
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
 * The grid is not a camera. Its scroll reference is the board's top-left
 * corner, so this is a constant rather than a function of the graph — an empty
 * project opens exactly where a full one does, and coming back from the graph
 * view returns here rather than inheriting wherever that view was panned to.
 *
 * It is a named export beside `openingViewport` rather than a branch inside it
 * so that each stays one claim that can be checked on its own.
 */
export function originViewport(): Viewport {
  return { x: 0, y: 0, zoom: READABLE_ZOOM };
}

/**
 * WHERE THE GRAPH OPENS — or `null`, which means NOT YET and never "no camera
 * needed".
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
 * `null` MEANS NOT YET, AND THE CALLER MUST STAY PENDING ON IT. The canvas is
 * measured after mount — React Flow reports height 0 until it has — so a view
 * entered inside that window has nothing to aim at. A caller that treats `null`
 * as "done" spends its one-shot entry on a camera it never applied, and the
 * view opens at whatever the other one left behind.
 *
 * TIES GO TO THE FIRST COLUMN IN LAYOUT ORDER (the comparison is strict), so
 * two headers at the same x cannot make the same graph open two ways.
 */
export function openingViewport(
  layout: Layout,
  canvasHeight: number,
): Viewport | null {
  if (canvasHeight === 0) return null;

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
 * WHAT THE BOARD MAY BE SCROLLED OVER — its own content, or the canvas,
 * whichever is larger on each axis. React Flow's `translateExtent`, computed
 * where it can be executed rather than only observed.
 *
 * THE `max()` IS LOAD-BEARING, and it is the whole reason this is not simply
 * the layout's size. d3-zoom's `constrain()` CENTRES an extent smaller than the
 * viewport, so a board narrower or shorter than the canvas does not merely fail
 * to clamp panning — it is yanked into the middle of the screen, away from the
 * top-left corner that is the scroll reference. Taking the larger of the two on
 * each axis keeps the extent at least viewport-sized, and the origin stays the
 * origin. This is the kind of line that gets "simplified" away and then costs a
 * day, so: do not drop the `max()`.
 *
 * Overflow is a scroll and not a cap. The content grows with the graph, and
 * there is deliberately no rule here of the shape "the board is never taller
 * than N".
 *
 * AN UNMEASURED CANVAS IS NOT A SMALL ONE, and this function cannot tell them
 * apart. React Flow reports width and height 0 until it has measured the pane,
 * and a `max()` against 0 is the bare layout — which d3 then centres, and never
 * re-constrains when the extent later grows, so the board opens translated by a
 * few hundred pixels and stays there. The caller answers that one, by handing
 * the library its unbounded pair until there is a real canvas; this function
 * answers only the geometry.
 */
export function contentExtent(layout: Layout, canvas: CanvasSize): Extent {
  return [
    [0, 0],
    [
      Math.max(layout.width, canvas.width),
      Math.max(layout.height, canvas.height),
    ],
  ];
}

/**
 * DOES THE CAMERA HAVE TO MOVE FOR THIS CARD TO BE SEEN?
 *
 * Both layouts place a node by its TYPE, so a node authored from anywhere can
 * land columns away from wherever you happen to be looking — measured on the
 * board this ports from: an `ImplementationTask` at x = 2435 in a 1200px canvas,
 * with the detail panel opening on it and the viewport never moving.
 *
 * FULLY ON SCREEN MEANS THE WHOLE CARD, not its top-left corner: a card cut in
 * half by the canvas edge is a card you cannot read, and on a two-line card the
 * half you lose is as likely to be the short name as the id. Authoring into the
 * part of the canvas you are already looking at moves nothing.
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
 * WHERE THE CAMERA MAY ACTUALLY BE CENTRED to show that card — and
 * `translateExtent` does not answer it. This function is the whole reason that
 * sentence needs saying.
 *
 * THE LIBRARY ENFORCES `translateExtent` INSIDE d3-zoom's `constrain()`, WHICH
 * RUNS ON GESTURES. `setCenter` goes `panZoom.setViewport` -> `d3Zoom.transform`
 * and writes the transform straight through, skipping the constraint entirely.
 * So revealing a card near the grid's left or top edge would centre on it
 * anyway — painting blank space above and to the left of the origin that is the
 * grid's whole scroll reference — and then snap back on the next wheel event,
 * which is to say after anyone had already looked at it.
 *
 * THE CLAMP IS THE EXTENT READ BACK AS THE RANGE OF LEGAL CENTRES: half a
 * viewport in from each corner, in world units, hence the division by the zoom
 * the reveal is about to apply. It is pure arithmetic, so it is stated here
 * rather than inline in the effect, where nothing could execute it.
 *
 * The graph view hands in the library's own unbounded pair and gets its target
 * back untouched.
 */
export function revealCenter(
  placement: Placement,
  geometry: CardGeometry,
  extent: Extent,
  canvas: CanvasSize,
  zoom: number,
): { readonly x: number; readonly y: number } {
  const halfWidth = canvas.width / (2 * zoom);
  const halfHeight = canvas.height / (2 * zoom);
  return {
    x: between(
      placement.x + geometry.cardWidth / 2,
      extent[0][0] + halfWidth,
      extent[1][0] - halfWidth,
    ),
    y: between(
      placement.y + geometry.cardHeight / 2,
      extent[0][1] + halfHeight,
      extent[1][1] - halfHeight,
    ),
  };
}

/**
 * Held inside `[low, high]` — or the midpoint of the two when the range is
 * empty, which is an extent smaller than the viewport and is the same answer
 * d3-zoom gives that case.
 */
function between(value: number, low: number, high: number): number {
  if (high < low) return (low + high) / 2;
  return Math.min(Math.max(value, low), high);
}
