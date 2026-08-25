import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  borderPointToward,
  cornerInset,
  floatingEndpoints,
  type CardGeometry,
  type CardOrigin,
} from "./edge-geometry";

/**
 * WHERE A RELATION MEETS A CARD, stated against a geometry of this file's own
 * choosing rather than against `GEOMETRY`. The module takes the box as an
 * argument precisely so it can be read without the layout, and round numbers
 * make every endpoint below one a reader can work out by hand: a card is 100 by
 * 40, so a left/right border's corner inset is 10 and a top/bottom border's is
 * 25.
 */
const BOX: CardGeometry = {
  cardWidth: 100,
  cardHeight: 40,
  columnGap: 40,
  rowGap: 20,
};

/** A card's top-left corner, and — for the two that size themselves — its width. */
function card(x: number, y: number, width?: number): CardOrigin {
  return width === undefined ? { x, y } : { x, y, width };
}

describe("cornerInset", () => {
  test("a quarter of the side, so it means the same on a short border as on a long one", () => {
    assert.equal(cornerInset(40), 10);
    assert.equal(cornerInset(100), 25);
  });

  test("never more than half the side, so the two insets cannot cross", () => {
    assert.equal(cornerInset(0), 0);
  });
});

describe("floatingEndpoints — the grid's two sides", () => {
  test("two columns: out of the left card's right border, into the right card's left", () => {
    const ends = floatingEndpoints(card(0, 0), card(200, 0), BOX, "grid");
    assert.equal(ends.sourceSide, "right");
    assert.equal(ends.targetSide, "left");
    assert.deepEqual([ends.sx, ends.sy], [100, 20]);
    assert.deepEqual([ends.tx, ends.ty], [200, 20]);
  });

  test("the same pair the other way round is the mirror image", () => {
    const ends = floatingEndpoints(card(200, 0), card(0, 0), BOX, "grid");
    assert.equal(ends.sourceSide, "left");
    assert.equal(ends.targetSide, "right");
    assert.deepEqual([ends.sx, ends.sy], [200, 20]);
    assert.deepEqual([ends.tx, ends.ty], [100, 20]);
  });

  test("a same-column pair leaves both cards on the right, into the gap", () => {
    const ends = floatingEndpoints(card(0, 0), card(0, 100), BOX, "grid");
    assert.equal(ends.sourceSide, "right");
    assert.equal(ends.targetSide, "right");
    // The ray runs parallel to the border it lands on, so each end takes its
    // own border's midpoint.
    assert.deepEqual([ends.sx, ends.sy], [100, 20]);
    assert.deepEqual([ends.tx, ends.ty], [100, 120]);
  });

  test("the grid never leaves by a top or bottom border, so its step is always half the column gap", () => {
    for (const target of [card(0, 400), card(0, -400), card(300, 400)]) {
      const ends = floatingEndpoints(card(0, 0), target, BOX, "grid");
      assert.equal(ends.offset, 20);
      assert.ok(ends.sourceSide === "left" || ends.sourceSide === "right");
      assert.ok(ends.targetSide === "left" || ends.targetSide === "right");
    }
  });
});

describe("floatingEndpoints — the graph's four", () => {
  test("a same-column pair hands off to the bottom and top borders", () => {
    const ends = floatingEndpoints(card(0, 0), card(0, 100), BOX, "graph");
    assert.equal(ends.sourceSide, "bottom");
    assert.equal(ends.targetSide, "top");
    assert.deepEqual([ends.sx, ends.sy], [50, 40]);
    assert.deepEqual([ends.tx, ends.ty], [50, 100]);
    // Anything leaving by a horizontal border steps into a row gap.
    assert.equal(ends.offset, 10);
  });

  test("the same pair upward leaves by the top and enters by the bottom", () => {
    const ends = floatingEndpoints(card(0, 100), card(0, 0), BOX, "graph");
    assert.equal(ends.sourceSide, "top");
    assert.equal(ends.targetSide, "bottom");
    assert.deepEqual([ends.sx, ends.sy], [50, 100]);
    assert.deepEqual([ends.tx, ends.ty], [50, 40]);
    assert.equal(ends.offset, 10);
  });

  test("a left/right pair steps into the column gap", () => {
    const ends = floatingEndpoints(card(0, 0), card(300, 0), BOX, "graph");
    assert.equal(ends.sourceSide, "right");
    assert.equal(ends.targetSide, "left");
    assert.deepEqual([ends.sx, ends.sy], [100, 20]);
    assert.deepEqual([ends.tx, ends.ty], [300, 20]);
    assert.equal(ends.offset, 20);
  });

  test("the box's own diagonal decides, and a tie hands off sideways", () => {
    // dy * width == dx * height exactly: 400 * 100 == 1000 * 40.
    const ends = floatingEndpoints(card(0, 0), card(1000, 400), BOX, "graph");
    assert.equal(ends.sourceSide, "right");
    assert.equal(ends.targetSide, "left");
  });

  test("a crossing that would land in a corner is held in the middle half of its border", () => {
    // Unclamped, the source's crossing is at y = 40 — its own bottom-right
    // corner — and the target's at y = 400, its top-left one.
    const ends = floatingEndpoints(card(0, 0), card(1000, 400), BOX, "graph");
    assert.equal(ends.sy, 30);
    assert.equal(ends.ty, 410);
  });
});

/**
 * TWO CARDS OF DIFFERENT WIDTHS, which only the metamodel's board has: each
 * card's own diagonal decides its own side, so a narrow card can hand off
 * sideways while the wide card it points at hands off vertically. Two
 * same-sized cards can never disagree that way — the two tests are the same
 * inequality with the widths swapped — so this is the one input that reaches a
 * relation with one horizontal end and one vertical one.
 */
describe("floatingEndpoints — a card that sizes itself", () => {
  test("a narrow source leaves sideways while the wide target it points down at takes its top", () => {
    const ends = floatingEndpoints(
      card(200, 0, 20),
      card(110, 40, 400),
      BOX,
      "graph",
    );
    assert.equal(ends.sourceSide, "right");
    assert.equal(ends.targetSide, "top");
    assert.equal(ends.offset, 10);
  });

  test("and takes its bottom when the wide target is above", () => {
    const ends = floatingEndpoints(
      card(200, 100, 20),
      card(110, 40, 400),
      BOX,
      "graph",
    );
    assert.equal(ends.sourceSide, "right");
    assert.equal(ends.targetSide, "bottom");
    assert.equal(ends.offset, 10);
  });

  test("a card with no width of its own is the geometry's one width", () => {
    const declared = floatingEndpoints(card(0, 0, 100), card(300, 0), BOX, "graph");
    const implied = floatingEndpoints(card(0, 0), card(300, 0), BOX, "graph");
    assert.deepEqual(declared, implied);
  });
});

describe("borderPointToward", () => {
  const CARD = { x: 0, y: 0, width: 100, height: 40 };

  test("the pointer's own direction picks the border, all four of them", () => {
    assert.deepEqual(borderPointToward(CARD, { x: 300, y: 20 }), { x: 100, y: 20 });
    assert.deepEqual(borderPointToward(CARD, { x: -300, y: 20 }), { x: 0, y: 20 });
    assert.deepEqual(borderPointToward(CARD, { x: 50, y: 300 }), { x: 50, y: 40 });
    assert.deepEqual(borderPointToward(CARD, { x: 50, y: -300 }), { x: 50, y: 0 });
  });

  test("a pointer at the card's own centre answers the right border's midpoint", () => {
    assert.deepEqual(borderPointToward(CARD, { x: 50, y: 20 }), { x: 100, y: 20 });
  });

  test("it shares the corner inset, so the preview leaves where the relation will", () => {
    // Straight down and far to the right: the crossing on the bottom border is
    // at x = 90, which is inside the outer quarter and comes back to 75.
    assert.deepEqual(borderPointToward(CARD, { x: 450, y: 220 }), { x: 75, y: 40 });
  });

  test("a pointer past the top-left corner is held off it too", () => {
    assert.deepEqual(borderPointToward(CARD, { x: -350, y: -180 }), { x: 25, y: 0 });
  });
});
