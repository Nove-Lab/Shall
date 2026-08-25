import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { CardBox, Point } from "./edge-geometry";
import {
  labelFits,
  labelRoom,
  routeAroundCards,
  selfLoopPath,
  stepPath,
  type RouteRequest,
} from "./edge-routing";

/**
 * THE ROUTER'S WORKED EXAMPLES, beside the corpus that `edge-routing.test.ts`
 * runs. That file asserts properties over forty generated boards and states
 * that no case of it asserts a coordinate; this one is the other half — one
 * request at a time, with the polyline written out — so that each family the
 * search offers, each side pair `baseTurns` answers for, the refusal the module
 * documents and the label's own arithmetic have a witness that names them.
 *
 * THE NUMBERS ARE THIS FILE'S OWN. A request is four numbers and two sides, so
 * nothing here needs a layout: cards are placed where the arithmetic is easy to
 * follow, and every expected polyline below can be worked out by hand from the
 * step-out and the turn rule.
 */

/** A request with nothing in the way unless a case puts something there. */
function request(fields: Partial<RouteRequest> & Pick<RouteRequest, "start" | "startSide" | "end" | "endSide">): RouteRequest {
  return { offset: 20, obstacles: [], ...fields };
}

function box(x: number, y: number, width = 100, height = 40): CardBox {
  return { x, y, width, height };
}

describe("routeAroundCards — the turns an unobstructed relation takes", () => {
  test("two facing left/right borders split at the midpoint x", () => {
    const route = routeAroundCards(
      request({
        start: { x: 100, y: 20 },
        startSide: "right",
        end: { x: 300, y: 60 },
        endSide: "left",
      }),
    );
    assert.deepEqual(route.waypoints, [
      { x: 100, y: 20 },
      { x: 200, y: 20 },
      { x: 200, y: 60 },
      { x: 300, y: 60 },
    ]);
    assert.equal(route.detoured, false);
    assert.equal(route.fallback, false);
  });

  test("two right borders hook out to the further of the two and back", () => {
    const route = routeAroundCards(
      request({
        start: { x: 100, y: 20 },
        startSide: "right",
        end: { x: 100, y: 120 },
        endSide: "right",
      }),
    );
    assert.deepEqual(route.waypoints, [
      { x: 100, y: 20 },
      { x: 120, y: 20 },
      { x: 120, y: 120 },
      { x: 100, y: 120 },
    ]);
  });

  test("two left borders hook the other way", () => {
    const route = routeAroundCards(
      request({
        start: { x: 100, y: 20 },
        startSide: "left",
        end: { x: 100, y: 120 },
        endSide: "left",
      }),
    );
    assert.deepEqual(route.waypoints, [
      { x: 100, y: 20 },
      { x: 80, y: 20 },
      { x: 80, y: 120 },
      { x: 100, y: 120 },
    ]);
  });

  test("a bottom facing a top splits at the midpoint y", () => {
    const route = routeAroundCards(
      request({
        offset: 10,
        start: { x: 50, y: 40 },
        startSide: "bottom",
        end: { x: 250, y: 200 },
        endSide: "top",
      }),
    );
    assert.deepEqual(route.waypoints, [
      { x: 50, y: 40 },
      { x: 50, y: 120 },
      { x: 250, y: 120 },
      { x: 250, y: 200 },
    ]);
  });

  test("two bottom borders hook out below both", () => {
    const route = routeAroundCards(
      request({
        offset: 10,
        start: { x: 50, y: 40 },
        startSide: "bottom",
        end: { x: 250, y: 140 },
        endSide: "bottom",
      }),
    );
    assert.deepEqual(route.waypoints, [
      { x: 50, y: 40 },
      { x: 50, y: 150 },
      { x: 250, y: 150 },
      { x: 250, y: 140 },
    ]);
  });

  test("two top borders hook out above both", () => {
    const route = routeAroundCards(
      request({
        offset: 10,
        start: { x: 50, y: 0 },
        startSide: "top",
        end: { x: 250, y: 100 },
        endSide: "top",
      }),
    );
    assert.deepEqual(route.waypoints, [
      { x: 50, y: 0 },
      { x: 50, y: -10 },
      { x: 250, y: -10 },
      { x: 250, y: 100 },
    ]);
  });

  test("one of each side is a single elbow, turning at the horizontal end's row", () => {
    const route = routeAroundCards(
      request({
        offset: 10,
        start: { x: 100, y: 20 },
        startSide: "right",
        end: { x: 250, y: 100 },
        endSide: "top",
      }),
    );
    assert.deepEqual(route.waypoints, [
      { x: 100, y: 20 },
      { x: 250, y: 20 },
      { x: 250, y: 100 },
    ]);
  });

  test("and the elbow turns at the vertical end's column when the sides are swapped", () => {
    const route = routeAroundCards(
      request({
        offset: 10,
        start: { x: 50, y: 0 },
        startSide: "top",
        end: { x: 300, y: 60 },
        endSide: "right",
      }),
    );
    assert.deepEqual(route.waypoints, [
      { x: 50, y: 0 },
      { x: 50, y: 60 },
      { x: 300, y: 60 },
    ]);
  });
});

describe("routeAroundCards — going around", () => {
  test("a card on the straight line moves the path and says so", () => {
    const route = routeAroundCards(
      request({
        start: { x: 100, y: 20 },
        startSide: "right",
        end: { x: 400, y: 20 },
        endSide: "left",
        obstacles: [box(200, 0)],
      }),
    );
    assert.equal(route.detoured, true);
    assert.equal(route.fallback, false);
    assert.deepEqual(route.waypoints[0], { x: 100, y: 20 });
    assert.deepEqual(route.waypoints.at(-1), { x: 400, y: 20 });
    for (const rect of [box(200, 0)]) {
      assert.equal(entersAny(route.waypoints, rect), false);
    }
  });

  test("overlapping cards merge into one span, and the lane is the gap past them", () => {
    const route = routeAroundCards(
      request({
        start: { x: 100, y: 20 },
        startSide: "right",
        end: { x: 600, y: 20 },
        endSide: "left",
        // 198..302, 248..352 and 218..262: the second extends the merged span,
        // the third is swallowed whole by it.
        obstacles: [box(200, 0), box(250, 0), box(220, 0, 40)],
      }),
    );
    assert.equal(route.fallback, false);
    for (const rect of [box(200, 0), box(250, 0), box(220, 0, 40)]) {
      assert.equal(entersAny(route.waypoints, rect), false);
    }
  });

  /**
   * THE THIRD FAMILY, which needs a board no elbow and no single lane can
   * cross: a wall down the source's own column, a wall across the row it leaves
   * by, and a third across the row the target is entered by. Every elbow and
   * every Z is then either blocked or doubling back, and the answer is one lane
   * of each axis — out along the source's row, up a clear column, across above
   * everything, and down into the target.
   */
  test("a staircase, when no elbow and no single lane will do", () => {
    const walls = [box(60, 140, 120, 600), box(300, 60, 200, 80), box(300, 380, 200, 80)];
    const route = routeAroundCards(
      request({
        start: { x: 100, y: 100 },
        startSide: "right",
        end: { x: 600, y: 400 },
        endSide: "bottom",
        obstacles: walls,
      }),
    );
    assert.deepEqual(route.waypoints, [
      { x: 100, y: 100 },
      { x: 120, y: 100 },
      { x: 120, y: 38 },
      { x: 600, y: 38 },
      { x: 600, y: 400 },
    ]);
    assert.equal(route.detoured, true);
    assert.equal(route.fallback, false);
    for (const rect of walls) {
      assert.equal(entersAny(route.waypoints, rect), false);
    }
  });

  /**
   * THE REFUSAL THE MODULE DOCUMENTS, executed. One card closer to the source's
   * exit border than the step-out puts the mandatory first point inside that
   * card's clearance box, and every candidate begins with it — so the search
   * refuses at once and hands back the straight line, which is not safe to draw
   * as an ordinary relation. `RoutedPath.fallback` is what says so.
   */
  test("a card sitting on an endpoint's step-out refuses the whole search", () => {
    const route = routeAroundCards(
      request({
        start: { x: 400, y: 322 },
        startSide: "left",
        end: { x: 148, y: 322 },
        endSide: "right",
        obstacles: [box(242, 300, 148, 44)],
      }),
    );
    assert.equal(route.fallback, true);
    assert.equal(route.detoured, false);
    assert.deepEqual(route.waypoints, [
      { x: 400, y: 322 },
      { x: 148, y: 322 },
    ]);
    // And the line it hands back does cross the card, which is the whole reason
    // the flag exists.
    assert.equal(entersAny(route.waypoints, box(242, 300, 148, 44)), true);
  });
});

/** Whether any of the polyline's segments passes through the rectangle's interior. */
function entersAny(points: readonly Point[], rect: CardBox): boolean {
  for (let index = 0; index + 1 < points.length; index += 1) {
    const from = points[index] as Point;
    const to = points[index + 1] as Point;
    const lo = { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y) };
    const hi = { x: Math.max(from.x, to.x), y: Math.max(from.y, to.y) };
    if (
      lo.x < rect.x + rect.width &&
      hi.x > rect.x &&
      lo.y < rect.y + rect.height &&
      hi.y > rect.y
    ) {
      return true;
    }
  }
  return false;
}

describe("stepPath", () => {
  test("a straight run is a move and a line, with no corner in between", () => {
    const { d } = stepPath([
      { x: 0, y: 10 },
      { x: 100, y: 10 },
    ]);
    assert.equal(d, "M0 10L100 10");
  });

  test("a corner off a horizontal run is cut back and rounded through the vertex", () => {
    const { d } = stepPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    assert.equal(d, "M0 0L 95,0Q 100,0 100,5L100 100");
  });

  test("a corner off a vertical run is the same arithmetic the other way round", () => {
    const { d } = stepPath([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ]);
    assert.equal(d, "M0 0L 0,95Q 0,100 5,100L100 100");
  });

  test("the corner never cuts back further than half the shorter segment", () => {
    const { d } = stepPath([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 100 },
    ]);
    assert.equal(d, "M0 0L 2,0Q 4,0 4,2L4 100");
  });

  test("every combination of turn direction rounds toward the way the path goes", () => {
    assert.equal(
      stepPath([
        { x: 100, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ]).d,
      "M100 0L 5,0Q 0,0 0,5L0 100",
    );
    assert.equal(
      stepPath([
        { x: 100, y: 100 },
        { x: 0, y: 100 },
        { x: 0, y: 0 },
      ]).d,
      "M100 100L 5,100Q 0,100 0,95L0 0",
    );
    assert.equal(
      stepPath([
        { x: 0, y: 100 },
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]).d,
      "M0 100L 0,5Q 0,0 5,0L100 0",
    );
    assert.equal(
      stepPath([
        { x: 100, y: 100 },
        { x: 100, y: 0 },
        { x: 0, y: 0 },
      ]).d,
      "M100 100L 100,5Q 100,0 95,0L0 0",
    );
  });

  test("an empty path draws a move to the origin and names it", () => {
    const { d, label } = stepPath([]);
    assert.equal(d, "M0 0L0 0");
    assert.deepEqual(label, { x: 0, y: 0, room: 0 });
  });
});

describe("the label's slot", () => {
  test("the middle of the longest horizontal run, with that run's own length", () => {
    const { label } = stepPath([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 100 },
      { x: 240, y: 100 },
    ]);
    assert.deepEqual(label, { x: 140, y: 100, room: 200 });
  });

  test("ties go to the earlier run, so the same route names the same slot twice", () => {
    const { label } = stepPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 200, y: 50 },
    ]);
    assert.deepEqual(label, { x: 50, y: 0, room: 100 });
  });

  test("a route with no horizontal run at all is the halfway point, with no room", () => {
    const { label } = stepPath([
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ]);
    assert.deepEqual(label, { x: 50, y: 50, room: 0 });
  });

  test("halfway is measured along the path and not between its ends", () => {
    const { label } = stepPath([
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 50, y: 100 },
    ]);
    assert.deepEqual(label, { x: 50, y: 50, room: 0 });
  });
});

describe("labelRoom and labelFits", () => {
  test("seven pixels a character and eight of padding", () => {
    assert.equal(labelRoom(""), 8);
    assert.equal(labelRoom("HAS_CRITERION"), 99);
  });

  test("a run exactly as wide as the name fits, and one pixel narrower does not", () => {
    assert.equal(labelFits({ x: 0, y: 0, room: 99 }, "HAS_CRITERION"), true);
    assert.equal(labelFits({ x: 0, y: 0, room: 98 }, "HAS_CRITERION"), false);
    assert.equal(labelFits({ x: 0, y: 0, room: 0 }, "MENTIONS"), false);
  });
});

describe("selfLoopPath", () => {
  test("out of the left border, over the card, and back into the right one", () => {
    const route = selfLoopPath(box(200, 100), 20);
    assert.deepEqual(route.waypoints, [
      { x: 200, y: 120 },
      { x: 180, y: 120 },
      { x: 180, y: 80 },
      { x: 320, y: 80 },
      { x: 320, y: 120 },
      { x: 300, y: 120 },
    ]);
    assert.equal(route.detoured, false);
    assert.equal(route.fallback, false);
  });

  test("the arch's top is where the name goes — the only clear space it has", () => {
    const { label } = stepPath(selfLoopPath(box(200, 100), 20).waypoints);
    assert.deepEqual(label, { x: 250, y: 80, room: 140 });
  });
});
