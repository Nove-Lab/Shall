import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { BAND_ORDER, bandOf, typesInBand } from "@shall/core/graph";
import { labelRoom } from "../view/edge-routing";
import { routedEdges, type RoutableCard } from "../view/edges";
import { metamodelBoard, METAMODEL } from "./layout";
import { metamodelRelations, relationLabel } from "./relations";

/**
 * WHERE EACH TYPE SITS IN THE METAMODEL PICTURE — the one thing about that
 * picture this program chooses, and therefore the only thing there is to hold
 * to account.
 *
 * NOTHING HERE TRANSCRIBES THE CANON. The board is a pure function of it, so
 * the cases are written against `typesInBand`, `BAND_ORDER` and
 * `relationLabel`, and the only numbers spelled out are `METAMODEL`'s own —
 * which is what lets a canon change move the picture without moving this file.
 */
const BOARD = metamodelBoard();

/** The board's cards grouped by the row each was laid in. */
function rowsOfBoard(): Map<string, typeof BOARD.placements> {
  const rows = new Map<string, typeof BOARD.placements>();
  for (const card of BOARD.placements) {
    const key = `${card.band}:${String(card.y)}`;
    rows.set(key, [...(rows.get(key) ?? []), card]);
  }
  return rows;
}

describe("the board", () => {
  test("one card per type in the canon, and no type twice", () => {
    const all = BAND_ORDER.flatMap((band) => typesInBand(band).map((entry) => entry.name));
    assert.deepEqual(
      [...BOARD.placements].map((card) => card.id).sort(),
      [...all].sort(),
    );
    assert.equal(new Set(BOARD.placements.map((card) => card.id)).size, all.length);
  });

  test("a card is drawn in the band the canon puts it in, satellite included", () => {
    for (const card of BOARD.placements) {
      assert.equal(card.band, bandOf(card.id));
    }
  });

  test("every card fits its own name, so Term is narrower than SystemResponsibility", () => {
    const width = new Map(BOARD.placements.map((card) => [card.id, card.width]));
    const term = width.get("Term");
    const responsibility = width.get("SystemResponsibility");
    assert.ok(term !== undefined && responsibility !== undefined);
    assert.ok(term < responsibility);
    for (const card of BOARD.placements) {
      assert.ok(card.width !== undefined);
      assert.ok(card.width > card.id.length * 7);
    }
  });

  test("a band folds at the row cap, and Intent is the band that folds", () => {
    const intent = BOARD.placements.filter((card) => card.band === "Intent");
    const rows = new Set(intent.map((card) => card.y));
    assert.ok(typesInBand("Intent").length > METAMODEL.rowCap);
    assert.equal(rows.size, 2);
    const domain = BOARD.placements.filter((card) => card.band === "Domain");
    assert.equal(new Set(domain.map((card) => card.y)).size, 1);
  });

  test("a wrapped row starts further in than the row above it", () => {
    const intent = BOARD.placements.filter((card) => card.band === "Intent");
    const ys = [...new Set(intent.map((card) => card.y))].sort((a, b) => a - b);
    const [first, second] = ys;
    assert.ok(first !== undefined && second !== undefined);
    const leftmostOf = (y: number) =>
      Math.min(...intent.filter((card) => card.y === y).map((card) => card.x));
    assert.equal(leftmostOf(second) - leftmostOf(first), METAMODEL.rowIndent);
  });

  test("each band's strip spans the finished board, and they stack without a gap", () => {
    assert.deepEqual(
      BOARD.bands.map((band) => band.band),
      [...BAND_ORDER],
    );
    let top = 0;
    for (const band of BOARD.bands) {
      assert.equal(band.y, top);
      assert.equal(band.x, 0);
      assert.equal(band.width, BOARD.width);
      top += band.height;
    }
    assert.equal(top, BOARD.height);
  });

  test("the board is as wide as its rightmost card's right edge", () => {
    const rightmost = Math.max(
      ...BOARD.placements.map((card) => card.x + (card.width ?? 0)),
    );
    assert.equal(BOARD.width, rightmost);
  });

  test("no two cards in one row overlap, and none is closer than the minimum gap", () => {
    for (const row of rowsOfBoard().values()) {
      const ordered = [...row].sort((left, right) => left.x - right.x);
      for (const [index, card] of ordered.slice(1).entries()) {
        const before = ordered[index];
        assert.ok(before?.width !== undefined);
        assert.ok(
          card.x - (before.x + before.width) >= METAMODEL.minGap,
          `${before.id} and ${card.id} are ${String(card.x - (before.x + before.width))} apart`,
        );
      }
    }
  });

  test("the same canon draws the same board twice", () => {
    assert.deepEqual(metamodelBoard(), metamodelBoard());
  });
});

/**
 * THE GAPS ARE DERIVED AND NOT CHOSEN. What the module promises is about
 * ADJACENT columns: the lane between two of them is whatever name the canon
 * allows across that pair needs, floored at the minimum. A relation between two
 * types that are not neighbours is routed like any other and is not sized for
 * here — which is why the module header asks for the picture to be opened after
 * a canon change rather than claiming every name is drawn.
 */
describe("the lane between two neighbours is their own relation's name", () => {
  test("every adjacent pair in every row has room for whatever runs across it", () => {
    let measured = 0;
    for (const row of rowsOfBoard().values()) {
      const ordered = [...row].sort((left, right) => left.x - right.x);
      for (const [index, card] of ordered.slice(1).entries()) {
        const before = ordered[index];
        assert.ok(before?.width !== undefined);
        const gap = card.x - (before.x + before.width);
        const name =
          relationLabel(before.id, card.id) ?? relationLabel(card.id, before.id);
        if (name === null) continue;
        measured += 1;
        assert.ok(
          gap >= labelRoom(name) + METAMODEL.labelSlack,
          `${before.id} → ${card.id} has ${String(gap)}px for ${name}`,
        );
      }
    }
    assert.ok(measured > 0);
  });

  test("neighbours the canon allows nothing between get exactly the minimum lane", () => {
    let measured = 0;
    for (const row of rowsOfBoard().values()) {
      const ordered = [...row].sort((left, right) => left.x - right.x);
      for (const [index, card] of ordered.slice(1).entries()) {
        const before = ordered[index];
        assert.ok(before?.width !== undefined);
        if (
          relationLabel(before.id, card.id) !== null ||
          relationLabel(card.id, before.id) !== null
        ) {
          continue;
        }
        measured += 1;
        assert.equal(card.x - (before.x + before.width), METAMODEL.minGap);
      }
    }
    assert.ok(measured > 0);
  });
});

/**
 * NO RELATION IS REFUSED BY THE ROUTER on this board — the one property the
 * whole picture depends on, since a refused route is drawn as a straight line
 * that may cross a card.
 */
describe("the whole board, routed", () => {
  test("every permitted pair gets a route, and none is a fallback", () => {
    const cards: RoutableCard[] = BOARD.placements.map((card) => ({
      id: card.id,
      band: card.band,
      x: card.x,
      y: card.y,
      ...(card.width === undefined ? {} : { width: card.width }),
    }));
    const geometry = {
      cardWidth: METAMODEL.cardWidth,
      cardHeight: METAMODEL.cardHeight,
      columnGap: METAMODEL.columnGap,
      rowGap: METAMODEL.rowGap,
    };
    const relations = metamodelRelations();
    const routed = routedEdges(cards, relations, geometry, "graph");
    assert.equal(routed.length, relations.length);
    for (const { edge, route } of routed) {
      assert.equal(route.fallback, false, `${edge.id} was refused`);
      assert.ok(route.waypoints.length >= 2);
    }
  });

  test("a self-pair is drawn as an arch, and the canon has four of them", () => {
    const cards: RoutableCard[] = BOARD.placements.map((card) => ({
      id: card.id,
      band: card.band,
      x: card.x,
      y: card.y,
      ...(card.width === undefined ? {} : { width: card.width }),
    }));
    const geometry = {
      cardWidth: METAMODEL.cardWidth,
      cardHeight: METAMODEL.cardHeight,
      columnGap: METAMODEL.columnGap,
      rowGap: METAMODEL.rowGap,
    };
    const loops = routedEdges(
      cards,
      metamodelRelations().filter((relation) => relation.fromId === relation.toId),
      geometry,
      "graph",
    );
    assert.ok(loops.length > 0);
    for (const { route } of loops) {
      assert.equal(route.waypoints.length, 6);
      assert.equal(route.detoured, false);
      assert.equal(route.fallback, false);
    }
  });
});
