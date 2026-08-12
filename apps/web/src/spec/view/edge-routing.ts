import type { BorderSide, CardBox, Point } from "./edge-geometry";

/**
 * How a relation gets from one card to the other without going through a third.
 *
 * The shape of the answer is borrowed from `libavoid` — obstacles are
 * rectangles with a margin, the path is orthogonal, and a route is picked by
 * turns and then length rather than by a physics simulation — but nothing is
 * taken from it. The JS ports are WASM, and a routing library is a dependency
 * decision far above one canvas feature.
 *
 * **This module owns the path between the endpoints and nothing else.** Where a
 * relation meets a card is `edge-geometry.ts`'s law and survives untouched: the
 * endpoint is still the crossing of the centre-to-centre line with the border,
 * it still slides as either card moves, and it is still held out of the corner
 * zone. The router never chooses an endpoint; it is handed two.
 *
 * **It also owns the drawing (`stepPath`), deliberately.** The library's
 * `getSmoothStepPath` takes two points and cannot express a detour, so the
 * alternative was to check one geometry and draw another. One polyline is
 * computed, tested against the cards, and then turned into the `d` attribute;
 * there is no second model of the path anywhere.
 *
 * **What an unobstructed relation looks like does not change.** `baseTurns`
 * reproduces the library's own `getPoints` for the side families this surface
 * produces, `CORNER_RADIUS` is the library's own default, and `stepPath` rounds
 * a corner by the library's own arithmetic. So a relation with nothing in its
 * way is drawn exactly where it would have been drawn with no router at all,
 * and only a relation that *would* have crossed a card moves. That is not an
 * optimisation — it is why moving an unrelated card does not redraw the board.
 *
 * Pure: no React, no `@xyflow/react`, no DOM, no clock, no randomness, and no
 * iteration over an unordered collection. Identical input gives a byte-
 * identical `d` string, because a canvas that redraws itself differently on the
 * same data is a canvas nobody can measure.
 */

/**
 * How far a routed path stays off a card it is not attached to, in flow units.
 *
 * **Two is not a round number, it is the grid's row gap divided.** The tightest
 * channel on either view is the grid's 6px row gap, whose centre line is 3px
 * from the card above and 3px from the card below. A clearance of 3 or more
 * would close that channel — every horizontal lane in the grid would be refused
 * and long relations would have nowhere to run — while 2 leaves the lane open
 * with a pixel to spare and still keeps the stroke off the border it passes.
 *
 * One constant, one home: tests read `CARD_CLEARANCE` rather than restating 2,
 * so correcting it is a one-line diff.
 */
export const CARD_CLEARANCE = 2;

/**
 * The corner radius, and it is the library's own default rather than a taste of
 * ours: both views drew `getSmoothStepPath`'s 5px corners before this module
 * existed, so keeping the number is what makes an unobstructed relation
 * pixel-identical to the one that was there before.
 */
const CORNER_RADIUS = 5;

/**
 * How many turns a routed path may take between the two cards. Four is the
 * staircase — out of the source's side, along a clear lane, across, and in to
 * the target's — and it is where the search stops. Past four turns a relation
 * stops reading as a line between two things and starts reading as a maze; a
 * route that needs more is refused and named (`fallback`) rather than drawn.
 */
const BEND_BUDGET = 4;

/**
 * How many candidate lanes per axis the search will consider, nearest the
 * direct line first.
 *
 * The lane set is derived from the gaps between cards, so on a column layout it
 * is the channel structure of the view — a dozen is already more than the
 * widest board offers between any two cards. The cap exists so the staircase
 * family, which pairs every vertical lane with every horizontal one, has a
 * stated bound rather than an accidental one: 12 x 12 x 2 is 288 candidate
 * paths, and that is the worst this function can cost per relation.
 */
const LANE_BUDGET = 12;

/** The path a relation is drawn along, and whether anything moved it. */
export type RoutedPath = {
  /** Corner to corner, `start` first and `end` last, no two consecutive points collinear. */
  readonly waypoints: readonly Point[];
  /** True when a card was in the way and the path went around it. */
  readonly detoured: boolean;
  /**
   * True when a card was in the way and no route within the bend budget was
   * clear, so the straight line between the endpoints is drawn instead.
   *
   * **A named fallback, never a silent one.** The honest failure of a router is
   * "I could not", and a caller that wants to say so on screen — or a test that
   * wants to assert the boxed-in case — needs to tell it apart from success.
   *
   * **WHAT ACTUALLY TRIGGERS IT IS MUCH WEAKER THAN "BOXED IN ON EVERY SIDE",
   * and the returned line is not safe to draw as an ordinary edge.** Every
   * candidate polyline begins `start -> a`, where `a = stepOut(start, side,
   * offset)` is mandatory, so ONE third card sitting closer to an endpoint's
   * exit border than `offset` puts `a` inside that card's clearance box and
   * refuses the whole search at once. Executed, in the graph view with a single
   * obstacle: source card at 400..548 x 300..344, target at 0..148 x 300..344,
   * one other card at 242..390 x 300..344 — `a` is (380, 322), the grown
   * obstacle is 240..392 x 298..346, `a` is strictly inside it, and the answer is
   * `fallback` with `[start, end]`, a line whose 148px middle runs through that
   * card's interior. A clear route inside this module's own families and inside
   * `BEND_BUDGET` exists there and is simply not expressible — it needs a
   * shortened first step, or a lane on a grown obstacle's own edge, and
   * `laneCentres` only ever offers gap centres of the merged spans.
   *
   * So `fallback: true` means "the polyline below may cross a card": a caller
   * must draw it distinctly rather than as a normal relation. Two repairs were
   * identified and neither is made here, because both change where a cleared
   * relation is drawn and the routing families are carried over as they were —
   * clamping the step-out to the largest clear distance instead of abandoning,
   * and seeding the lane lists with the grown obstacles' own edges beside the gap
   * centres.
   *
   * IT IS UNREACHABLE FROM TODAY'S TWO LAYOUTS. `gridLayout` and `graphLayout`
   * place cards on a pitch that keeps every step-out clear — measured, 25,376
   * source/target pairs across both views and four canvas heights produced zero
   * fallbacks, with 6px of slack at the deepest. It is latent, not live.
   */
  readonly fallback: boolean;
};

export type RouteRequest = {
  /** Where the relation leaves the source card — `floatingEndpoints`' `sx`/`sy`, post-clamp. */
  readonly start: Point;
  readonly startSide: BorderSide;
  /** Where it meets the target card — `tx`/`ty`, post-clamp. */
  readonly end: Point;
  readonly endSide: BorderSide;
  /** How far the path steps out of a border before it may turn — `floatingEndpoints`' `offset`. */
  readonly offset: number;
  /** Every card in view except the two this relation is attached to. */
  readonly obstacles: readonly CardBox[];
};

type Span = { readonly lo: number; readonly hi: number };

const NORMAL: Readonly<Record<BorderSide, Point>> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

function isHorizontal(side: BorderSide): boolean {
  return side === "left" || side === "right";
}

function stepOut(from: Point, side: BorderSide, offset: number): Point {
  const normal = NORMAL[side];
  return { x: from.x + normal.x * offset, y: from.y + normal.y * offset };
}

/** True when `to` is not behind `from` along the border's outward normal — no doubling back. */
function outward(from: Point, to: Point, side: BorderSide): boolean {
  const normal = NORMAL[side];
  return (to.x - from.x) * normal.x + (to.y - from.y) * normal.y >= 0;
}

/**
 * Drop duplicate and collinear points, so a turn in the returned list is a turn
 * a person can see. Bend counting, the budget and the scoring all read this
 * list, and each of them would be wrong by a different amount if a straight run
 * were allowed to carry a vertex in the middle of it.
 */
function simplify(points: readonly Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    const last = kept[kept.length - 1];
    if (last !== undefined && last.x === point.x && last.y === point.y) continue;
    const before = kept[kept.length - 2];
    if (
      last !== undefined &&
      before !== undefined &&
      ((before.x === last.x && last.x === point.x) ||
        (before.y === last.y && last.y === point.y))
    ) {
      kept[kept.length - 1] = point;
      continue;
    }
    kept.push(point);
  }
  return kept;
}

/**
 * Does a segment pass through the interior of a rectangle — Liang–Barsky,
 * strict.
 *
 * **Strict matters here.** A path that runs exactly along a card's border is
 * legal — it is what the corner-inset clamp produces at the endpoint's own
 * card, and what a lane centred in a 6px gap approaches — while a path that
 * enters by even a fraction is the defect this module exists to remove.
 * `t1 - t0 > 0` is the whole of that distinction.
 */
function segmentEntersRect(from: Point, to: Point, rect: CardBox): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (edge: number, distance: number): boolean => {
    if (edge === 0) return distance > 0;
    const t = distance / edge;
    if (edge < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    return true;
  };
  if (!clip(-dx, from.x - rect.x)) return false;
  if (!clip(dx, rect.x + rect.width - from.x)) return false;
  if (!clip(-dy, from.y - rect.y)) return false;
  if (!clip(dy, rect.y + rect.height - from.y)) return false;
  return t1 - t0 > 0;
}

function grown(rect: CardBox, by: number): CardBox {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + 2 * by,
    height: rect.height + 2 * by,
  };
}

function blocked(
  points: readonly Point[],
  obstacles: readonly CardBox[],
): boolean {
  for (let index = 0; index + 1 < points.length; index += 1) {
    const from = points[index] as Point;
    const to = points[index + 1] as Point;
    for (const rect of obstacles) if (segmentEntersRect(from, to, rect)) return true;
  }
  return false;
}

function length(points: readonly Point[]): number {
  let total = 0;
  for (let index = 0; index + 1 < points.length; index += 1) {
    const from = points[index] as Point;
    const to = points[index + 1] as Point;
    total += Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  }
  return total;
}

/**
 * The lanes one axis offers: the centre of every gap between the cards, plus
 * one lane clear of the whole board at each end.
 *
 * **A gap in the merged spans is a gap everywhere.** Both views are column
 * layouts — every card in a column shares an x span, every row of a band shares
 * a y span — so merging the spans and taking the middle of what is left is
 * exactly the channel structure of the picture: the column gaps on x, the row
 * and band gaps on y. And because the merge is over *all* the cards handed in,
 * a lane between two merged spans is one no card occupies at any point along
 * it, which is what makes it worth trying first.
 *
 * It is only a candidate list: every path built on it is still tested against
 * every card, so a clever lane and a stupid one are checked the same way.
 */
function laneCentres(spans: readonly Span[], reach: number): number[] {
  const sorted = [...spans].sort(
    (left, right) => left.lo - right.lo || left.hi - right.hi,
  );
  const merged: Span[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && span.lo <= last.hi) {
      if (span.hi > last.hi) merged[merged.length - 1] = { lo: last.lo, hi: span.hi };
      continue;
    }
    merged.push(span);
  }

  const lanes: number[] = [];
  for (let index = 0; index + 1 < merged.length; index += 1) {
    lanes.push(((merged[index] as Span).hi + (merged[index + 1] as Span).lo) / 2);
  }
  const first = merged[0];
  const last = merged[merged.length - 1];
  if (first !== undefined) lanes.push(first.lo - reach);
  if (last !== undefined) lanes.push(last.hi + reach);
  return lanes;
}

/**
 * The lane list: the two endpoints' own lanes offered alongside the gap lanes,
 * ordered nearest-the-direct-line first, then capped.
 *
 * The cap is applied after the ordering, so on a board with more than
 * `LANE_BUDGET` gap lanes closer to the direct line than the endpoints' own,
 * the endpoints' lanes fall off the end. That is the budget doing its job
 * rather than an exception to it.
 *
 * The `Set` is only a de-duplicator: it is built from an ordered array and
 * sorted before anything reads it, so no iteration order reaches the drawn
 * path.
 */
function lanesFor(
  centres: readonly number[],
  own: readonly number[],
  toward: number,
): number[] {
  const unique = [...new Set([...own, ...centres])];
  unique.sort(
    (left, right) =>
      Math.abs(left - toward) - Math.abs(right - toward) || left - right,
  );
  return unique.slice(0, LANE_BUDGET);
}

/**
 * The turns an unobstructed relation takes — the library's `getPoints`,
 * restated for the side families this surface produces, so that a relation with
 * nothing in its way keeps the picture it always had.
 *
 *   - both ends on a left/right border, facing each other → a Z split at the
 *     midpoint x
 *   - both on a top/bottom border, facing each other → a Z split at the
 *     midpoint y
 *   - both on the same side (a same-column pair in the grid) → out to the far
 *     side of the two and back, which for two cards in one column is the
 *     vertical hook in the column gap
 *   - one of each → a single elbow
 */
function baseTurns(
  a: Point,
  startSide: BorderSide,
  b: Point,
  endSide: BorderSide,
): Point[] {
  const horizontal = isHorizontal(startSide);
  if (horizontal !== isHorizontal(endSide)) {
    return horizontal ? [{ x: b.x, y: a.y }] : [{ x: a.x, y: b.y }];
  }
  if (horizontal) {
    const facing = startSide !== endSide;
    const middle = facing
      ? (a.x + b.x) / 2
      : startSide === "right"
        ? Math.max(a.x, b.x)
        : Math.min(a.x, b.x);
    return [
      { x: middle, y: a.y },
      { x: middle, y: b.y },
    ];
  }
  const facing = startSide !== endSide;
  const middle = facing
    ? (a.y + b.y) / 2
    : startSide === "bottom"
      ? Math.max(a.y, b.y)
      : Math.min(a.y, b.y);
  return [
    { x: a.x, y: middle },
    { x: b.x, y: middle },
  ];
}

/** A candidate's full polyline, or `null` when it doubles back or overspends the bend budget. */
function assemble(
  request: RouteRequest,
  a: Point,
  b: Point,
  turns: readonly Point[],
): Point[] | null {
  const first = turns[0] ?? b;
  const last = turns[turns.length - 1] ?? a;
  if (!outward(a, first, request.startSide)) return null;
  if (!outward(b, last, request.endSide)) return null;
  const points = simplify([request.start, a, ...turns, b, request.end]);
  if (points.length - 2 > BEND_BUDGET) return null;
  return points;
}

/**
 * Fewest turns, then shortest, then the lexicographically smaller list.
 *
 * The third key is not decoration. Without it two candidates of equal turns and
 * equal length would be separated by whichever the loop happened to reach
 * first, and the same board would draw two different pictures across a
 * refactor, a re-order of the obstacle list, or a different engine's sort. With
 * it the order is total.
 */
function better(candidate: readonly Point[], incumbent: readonly Point[]): boolean {
  if (candidate.length !== incumbent.length) {
    return candidate.length < incumbent.length;
  }
  const difference = length(candidate) - length(incumbent);
  if (difference !== 0) return difference < 0;
  for (let index = 0; index < candidate.length; index += 1) {
    const one = candidate[index] as Point;
    const other = incumbent[index] as Point;
    if (one.x !== other.x) return one.x < other.x;
    if (one.y !== other.y) return one.y < other.y;
  }
  return false;
}

function pickClear(
  request: RouteRequest,
  a: Point,
  b: Point,
  families: readonly (readonly Point[])[],
  obstacles: readonly CardBox[],
): Point[] | null {
  let best: Point[] | null = null;
  for (const turns of families) {
    const points = assemble(request, a, b, turns);
    if (points === null || blocked(points, obstacles)) continue;
    if (best === null || better(points, best)) best = points;
  }
  return best;
}

/**
 * Where a relation runs.
 *
 * The straight-ahead path is tried first and kept when it is clear, so nothing
 * moves that did not have to. When a card is in the way the search widens by
 * turns: one elbow, then a Z through a single lane, then the staircase through
 * one lane of each axis. The first family that offers a clear path wins, and
 * inside a family the best is the fewest-turns / shortest / lexicographically
 * smallest — a total order, so two runs on the same board draw the same
 * picture.
 */
export function routeAroundCards(request: RouteRequest): RoutedPath {
  const a = stepOut(request.start, request.startSide, request.offset);
  const b = stepOut(request.end, request.endSide, request.offset);
  const obstacles = request.obstacles.map((rect) => grown(rect, CARD_CLEARANCE));

  const base = simplify([
    request.start,
    a,
    ...baseTurns(a, request.startSide, b, request.endSide),
    b,
    request.end,
  ]);
  if (!blocked(base, obstacles)) {
    return { waypoints: base, detoured: false, fallback: false };
  }

  const verticals = lanesFor(
    laneCentres(
      request.obstacles.map((rect) => ({
        lo: rect.x - CARD_CLEARANCE,
        hi: rect.x + rect.width + CARD_CLEARANCE,
      })),
      request.offset,
    ),
    [a.x, b.x],
    (a.x + b.x) / 2,
  );
  const horizontals = lanesFor(
    laneCentres(
      request.obstacles.map((rect) => ({
        lo: rect.y - CARD_CLEARANCE,
        hi: rect.y + rect.height + CARD_CLEARANCE,
      })),
      request.offset,
    ),
    [a.y, b.y],
    (a.y + b.y) / 2,
  );

  const elbowsAndSplits: Point[][] = [[{ x: b.x, y: a.y }], [{ x: a.x, y: b.y }]];
  for (const x of verticals) {
    elbowsAndSplits.push([
      { x, y: a.y },
      { x, y: b.y },
    ]);
  }
  for (const y of horizontals) {
    elbowsAndSplits.push([
      { x: a.x, y },
      { x: b.x, y },
    ]);
  }
  const simple = pickClear(request, a, b, elbowsAndSplits, obstacles);
  if (simple !== null) {
    return { waypoints: simple, detoured: true, fallback: false };
  }

  const staircases: Point[][] = [];
  for (const x of verticals) {
    for (const y of horizontals) {
      staircases.push([
        { x, y: a.y },
        { x, y },
        { x: b.x, y },
      ]);
      staircases.push([
        { x: a.x, y },
        { x, y },
        { x, y: b.y },
      ]);
    }
  }
  const stepped = pickClear(request, a, b, staircases, obstacles);
  if (stepped !== null) {
    return { waypoints: stepped, detoured: true, fallback: false };
  }

  return {
    waypoints: [request.start, request.end],
    detoured: false,
    fallback: true,
  };
}

function distance(from: Point, to: Point): number {
  return Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
}

/**
 * WHERE A RELATION'S NAME CAN BE WRITTEN, and how much room there is for it.
 *
 * **The middle of the route's longest HORIZONTAL run, and never the halfway
 * point by length.** Those are the same place on a long detour and are nowhere
 * near each other on the commonest relation in this grammar: two cards in
 * adjacent columns are joined by one straight segment the width of the column
 * gap — 16px in the grid, 40px in the graph — and a name centred there is a
 * ~98px box laid across a 16px line, so the line, its arrowhead and most of the
 * name all disappear under the two cards. That was the defect; `room` is what a
 * caller checks so it cannot come back.
 *
 * **Horizontal only, because a label is a horizontal box of text.** Every
 * vertical channel on both boards is a column gap, and no relation name in the
 * canon is 16 or 40 pixels wide, so a name centred on a vertical run is a
 * fragment clipped by the cards on either side of it. A route with no
 * horizontal run at all answers `room: 0` — the halfway point, and nothing
 * fits in it.
 *
 * `room` is the polyline's own run length. The drawn corner cuts up to
 * `CORNER_RADIUS` off each end of it, so a name that only just fits may reach a
 * few pixels into the curve; that is 5px on a run of at least the name's own
 * width, and it is not worth a second measurement to recover.
 */
export type LabelSlot = {
  readonly x: number;
  readonly y: number;
  /** The run's length in flow units, or 0 when the route has no horizontal run. */
  readonly room: number;
};

/** The point half the path's length along it — where a label goes when nothing better exists. */
function halfwayPoint(waypoints: readonly Point[]): Point {
  const head = waypoints[0] ?? { x: 0, y: 0 };
  const half = length(waypoints) / 2;
  let walked = 0;
  for (let index = 0; index + 1 < waypoints.length; index += 1) {
    const from = waypoints[index] as Point;
    const to = waypoints[index + 1] as Point;
    const run = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
    if (walked + run >= half && run > 0) {
      const share = (half - walked) / run;
      return {
        x: from.x + (to.x - from.x) * share,
        y: from.y + (to.y - from.y) * share,
      };
    }
    walked += run;
  }
  return head;
}

/**
 * The longest horizontal run's middle. Ties go to the earlier run — the
 * comparison is strict — so the same route names the same slot every time.
 */
function labelSlot(waypoints: readonly Point[]): LabelSlot {
  let best: LabelSlot | null = null;
  for (let index = 0; index + 1 < waypoints.length; index += 1) {
    const from = waypoints[index] as Point;
    const to = waypoints[index + 1] as Point;
    if (from.y !== to.y) continue;
    const room = Math.abs(to.x - from.x);
    if (best !== null && room <= best.room) continue;
    best = { x: (from.x + to.x) / 2, y: from.y, room };
  }
  if (best !== null) return best;

  const middle = halfwayPoint(waypoints);
  return { x: middle.x, y: middle.y, room: 0 };
}

/**
 * The waypoint list as an SVG `d`, with the place a label may be written on it.
 *
 * **The corner arithmetic is the library's own** (`@xyflow/system`'s `getBend`,
 * restated): cut back from the vertex by the smaller of the two half-segments
 * and the radius, then a quadratic through the vertex. It is restated rather
 * than imported because the library exposes only the whole two-point path
 * builder, and a routed path has more than two points — the same reason this
 * module draws at all rather than handing the job back to
 * `getSmoothStepPath`. Keeping the arithmetic identical is what makes a routed
 * corner and an unrouted corner the same corner.
 *
 * The label's slot is `LabelSlot` above, which carries the room it has as well
 * as where it is: this module knows the route and therefore knows whether a name
 * would fit on it, and the drawing side knows how wide the name is.
 */
export function stepPath(waypoints: readonly Point[]): {
  readonly d: string;
  readonly label: LabelSlot;
} {
  const head = waypoints[0] ?? { x: 0, y: 0 };
  const tail = waypoints[waypoints.length - 1] ?? head;

  let d = `M${head.x} ${head.y}`;
  for (let index = 1; index + 1 < waypoints.length; index += 1) {
    const before = waypoints[index - 1] as Point;
    const at = waypoints[index] as Point;
    const after = waypoints[index + 1] as Point;
    const size = Math.min(
      distance(before, at) / 2,
      distance(at, after) / 2,
      CORNER_RADIUS,
    );
    if (before.y === at.y) {
      const xDir = before.x < after.x ? -1 : 1;
      const yDir = before.y < after.y ? 1 : -1;
      d += `L ${at.x + size * xDir},${at.y}Q ${at.x},${at.y} ${at.x},${at.y + size * yDir}`;
      continue;
    }
    const xDir = before.x < after.x ? 1 : -1;
    const yDir = before.y < after.y ? -1 : 1;
    d += `L ${at.x},${at.y + size * yDir}Q ${at.x},${at.y} ${at.x + size * xDir},${at.y}`;
  }
  d += `L${tail.x} ${tail.y}`;

  return { d, label: labelSlot(waypoints) };
}
