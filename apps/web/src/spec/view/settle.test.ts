// `node:test` and `node:assert` are typed by `@types/node`, which the web app's
// own tsconfig deliberately does not name — the app itself is a browser
// program. The three files here that run under `node --test` are excluded from
// that project and compiled by `tsconfig.node.json`, which names those types
// once for all three; no test file declares them for itself.
import assert from "node:assert/strict";
import { test } from "node:test";

import { settleColumns, type StackedCard, type StackedColumn } from "./settle";

/**
 * WHAT `settleColumns` PROMISES, one case per promise.
 *
 * THE PITCH AND THE FIRST ROW BELOW ARE THE FIXTURE'S OWN and are deliberately
 * not read from `GEOMETRY`: the module under test is arithmetic on the numbers
 * it is handed, and a test that pinned them to the layout would be pinning
 * something else. They are the graph view's numbers today — 44 + 18, and
 * 16 + 30 — so that a failure reads in the units of the board, and every worked
 * example here is computed from them.
 */
const PITCH = 62;
const TOP = 46;

/** A column of `rows` cards as the stack would have left it. */
function stack(prefix: string, rows: number): StackedCard[] {
  return Array.from({ length: rows }, (_, row) => ({
    id: `${prefix}${row}`,
    y: TOP + row * PITCH,
  }));
}

/**
 * One column's settled ys, top row first. A card the answer forgot comes back
 * as `NaN` rather than as `undefined`, so it fails every comparison below
 * instead of quietly passing a loose one.
 */
function ysOf(settled: Map<string, number>, column: StackedColumn): number[] {
  return column.map((card) => settled.get(card.id) ?? Number.NaN);
}

/** An answer in the shape of a stack, so that it can be settled again. */
function restack(
  settled: Map<string, number>,
  columns: readonly StackedColumn[],
): StackedColumn[] {
  return columns.map((column) =>
    column.map((card) => ({
      id: card.id,
      y: settled.get(card.id) ?? Number.NaN,
    })),
  );
}

/**
 * A board with tension in it: four columns of different heights, relations
 * running both ways across them, and one card (`a0`) holding two of them. It is
 * the fixture for the constraints, which are properties of ANY answer rather
 * than of a particular one — so they are asserted over a board nobody worked
 * out by hand.
 */
const THIN = stack("a", 2);
const FULLEST = stack("b", 5);
const MIDDLE = stack("c", 4);
const LONE = stack("d", 1);
const CROWDED: StackedColumn[] = [THIN, FULLEST, MIDDLE, LONE];
const CROWDED_EDGES = [
  { fromId: "a0", toId: "b4" },
  { fromId: "a1", toId: "c0" },
  { fromId: "b0", toId: "c3" },
  { fromId: "b2", toId: "d0" },
  { fromId: "c1", toId: "d0" },
  { fromId: "b3", toId: "a0" },
];
/** The last row of the fullest column, which is the board's own last row. */
const BOTTOM = TOP + (FULLEST.length - 1) * PITCH;

test("the fullest column keeps the placement the stack gave it", () => {
  // THERE IS NO `fixed` FLAG TO TURN OFF: the box pins this column and nothing
  // else does, which is the claim worth a case of its own. Four of the six
  // relations in the fixture end on `b`, and it does not move a pixel.
  const settled = settleColumns(CROWDED, CROWDED_EDGES, PITCH);
  assert.deepStrictEqual(ysOf(settled, FULLEST), [46, 108, 170, 232, 294]);
});

test("two columns tied for fullest are both pinned", () => {
  const left = stack("a", 3);
  const right = stack("b", 3);
  const single = stack("c", 1);
  const settled = settleColumns(
    [left, right, single],
    [
      { fromId: "a0", toId: "c0" },
      { fromId: "b2", toId: "c0" },
    ],
    PITCH,
  );
  assert.deepStrictEqual(ysOf(settled, left), [46, 108, 170]);
  assert.deepStrictEqual(ysOf(settled, right), [46, 108, 170]);
  // And the column that is free did move, or the two assertions above would
  // hold for the boring reason that nothing settles at all.
  assert.notDeepStrictEqual(ysOf(settled, single), [46]);
});

test("a board of equal columns cannot move, and that is not a fault", () => {
  // EVERY POPULATED COLUMN IS A FULLEST COLUMN HERE, so every one of them has
  // nought rows of slack and the answer is the stack however the relations run.
  // The case is here because "the settle step did nothing" is the first thing a
  // reader of such a board suspects a bug in; it is the board having no room.
  const left = stack("a", 3);
  const middle = stack("b", 3);
  const right = stack("c", 3);
  const settled = settleColumns(
    [left, middle, right, []],
    [
      { fromId: "a0", toId: "b2" },
      { fromId: "b0", toId: "c2" },
      { fromId: "c0", toId: "a2" },
    ],
    PITCH,
  );
  for (const column of [left, middle, right]) {
    assert.deepStrictEqual(ysOf(settled, column), [46, 108, 170]);
  }
});

test("a card never passes the card above it", () => {
  const settled = settleColumns(CROWDED, CROWDED_EDGES, PITCH);
  for (const column of CROWDED) {
    const byY = [...column].sort(
      (left, right) =>
        (settled.get(left.id) ?? Number.NaN) -
        (settled.get(right.id) ?? Number.NaN),
    );
    assert.deepStrictEqual(
      byY.map((card) => card.id),
      column.map((card) => card.id),
    );
  }
});

test("two cards in a column are never closer than the pitch", () => {
  const settled = settleColumns(CROWDED, CROWDED_EDGES, PITCH);
  for (const column of CROWDED) {
    const ys = ysOf(settled, column);
    for (const [index, y] of ys.slice(1).entries()) {
      const above = ys[index] as number;
      assert.ok(y - above >= PITCH, `gap of ${y - above} under ${PITCH}px`);
    }
  }
});

test("every card lands on the row lattice, on the board", () => {
  // THE LOAD-BEARING HALF OF THIS IS THE MODULUS. A card off the lattice is a
  // card whose column has staggered out of step with the rest, and the module
  // header counts what that costs the router — this is the case that would see
  // it happen. Whole pixels come with it here and are not the promise.
  const settled = settleColumns(CROWDED, CROWDED_EDGES, PITCH);
  for (const column of CROWDED) {
    for (const y of ysOf(settled, column)) {
      assert.equal((y - TOP) % PITCH, 0, `${y} is off the row lattice`);
      assert.ok(y >= TOP && y <= BOTTOM, `${y} is off the board`);
    }
  }
});

test("the same board settles the same way twice", () => {
  const first = settleColumns(CROWDED, CROWDED_EDGES, PITCH);
  const second = settleColumns(CROWDED, CROWDED_EDGES, PITCH);
  assert.deepStrictEqual(first, second);
  // The iteration order too, and not only the entries: a caller may build a
  // list out of this map, and that list must not depend on the run.
  assert.deepStrictEqual([...first.keys()], [...second.keys()]);
});

test("the answer is a fixed point, and settling it again moves nothing", () => {
  // THE SWEEPS STOP WHEN NOTHING MOVED, so this is that stopping rule asserted
  // from outside the module: hand the answer back as the stack and the whole
  // step — sweeps, solve, rounding and all — reproduces it. Home does not move
  // between the two runs, because it is read off the board's height and the
  // column's own, and the fullest column is pinned so the board's first row is
  // where it was. What is really being asked is whether a card the rounding
  // parked half a row from the row it wanted gets dragged off it on a second
  // look.
  const once = settleColumns(CROWDED, CROWDED_EDGES, PITCH);
  const twice = settleColumns(restack(once, CROWDED), CROWDED_EDGES, PITCH);
  assert.deepStrictEqual(twice, once);
});

test("a column with no relation at all comes back centred", () => {
  const pulled = stack("a", 3);
  const fullest = stack("b", 4);
  const untouched = stack("c", 2);
  const settled = settleColumns(
    [pulled, fullest, untouched],
    [{ fromId: "a0", toId: "b3" }],
    PITCH,
  );
  // Two cards on a four-row board, with nothing acting on them but `HOME`:
  // one row of slack above and one below, so they take the row that is left.
  assert.deepStrictEqual(ysOf(settled, untouched), [108, 170]);
  // `a` was equally free and answered to something else, so `c` sitting in the
  // middle is the anchoring term doing its work rather than the whole board
  // being frozen. `a` moved to where its relation wanted it: `a0`'s block wants
  // row 3, to be level with `b3`, and the column's one row of slack under a
  // four-row board is all it may take.
  assert.deepStrictEqual(ysOf(settled, pulled), [108, 170, 232]);
});

test("a relation inside one column is not a spring", () => {
  const columns = [stack("a", 3), stack("b", 4), stack("c", 2)];
  const across = [{ fromId: "a0", toId: "b3" }];
  const alsoWithin = [
    ...across,
    { fromId: "a0", toId: "a2" },
    { fromId: "b1", toId: "b3" },
    // A card pointing at itself is the same case — both ends, one column.
    { fromId: "c1", toId: "c1" },
  ];
  assert.deepStrictEqual(
    settleColumns(columns, alsoWithin, PITCH),
    settleColumns(columns, across, PITCH),
  );
});

test("a single-card column is free to leave its row", () => {
  const alone = stack("a", 1);
  const fullest = stack("b", 3);
  const settled = settleColumns(
    [alone, fullest],
    [{ fromId: "a0", toId: "b2" }],
    PITCH,
  );
  // By hand: `a0`'s target is (170 + 0.01*46) / 1.01 = 168.77…, which is
  // (168.77… − 46) / 62 = 1.98 rows down the lattice and rounds to the second
  // row of it, 46 + 2*62. The anchoring term is outvoted, and here it is
  // silenced as well — a fifth of a row's worth of pull for home is not enough
  // to hold the card off the row its neighbour is on.
  assert.deepStrictEqual(ysOf(settled, alone), [170]);
  assert.deepStrictEqual(ysOf(settled, fullest), [46, 108, 170]);
});

test("a card moves one row and takes the card below it along", () => {
  const pair = stack("a", 2);
  const fullest = stack("b", 3);
  const settled = settleColumns(
    [pair, fullest],
    [{ fromId: "a0", toId: "b1" }],
    PITCH,
  );
  // By hand, and this is the smallest whole move the step can make. Row 0 is
  // pulled to `b1` at 108: weight 1.01, target (108 + 0.46)/1.01 = 107.38…,
  // which at row 0 is also its z. Row 1 has no relation, so its target is its
  // home 108, and in z that is 108 − 62 = 46 — a decrease, which z may not do,
  // so the two rows pool at (108.46 + 1.08)/1.02 = 107.39…. That is
  // (107.39… − 46)/62 = 0.99 rows, one row down; `a0` lands on 108 level with
  // `b1`, and `a1`, which has no say in the matter, is carried to 170. ONE ROW
  // AND NOT ONE PIXEL is the whole of the correction this file was rewritten
  // for: 107.39… would have been a legal y before it and is not one now.
  assert.deepStrictEqual(ysOf(settled, pair), [108, 170]);
  assert.deepStrictEqual(ysOf(settled, fullest), [46, 108, 170]);
});

test("an edge naming a card that is not on the board is skipped", () => {
  const columns = [stack("a", 2), stack("b", 4)];
  const real = [{ fromId: "a0", toId: "b2" }];
  const withGhosts = [
    ...real,
    { fromId: "a0", toId: "ghost" },
    { fromId: "ghost", toId: "a1" },
    { fromId: "ghost", toId: "other-ghost" },
  ];
  assert.deepStrictEqual(
    settleColumns(columns, withGhosts, PITCH),
    settleColumns(columns, real, PITCH),
  );
});

test("two relations between one pair pull no harder than one", () => {
  const columns = [stack("a", 2), stack("b", 4)];
  const once = [{ fromId: "a0", toId: "b2" }];
  const thrice = [
    ...once,
    // The same pair again, and again the other way round: `highlightFor` counts
    // this pair once as a neighbour, and so must this.
    { fromId: "a0", toId: "b2" },
    { fromId: "b2", toId: "a0" },
  ];
  assert.deepStrictEqual(
    settleColumns(columns, thrice, PITCH),
    settleColumns(columns, once, PITCH),
  );
});

test("three columns, worked out by hand", () => {
  const a = stack("a", 2);
  const b = stack("b", 4);
  const c = stack("c", 2);
  const settled = settleColumns(
    [a, b, c],
    [
      { fromId: "a0", toId: "b2" },
      { fromId: "c1", toId: "b3" },
    ],
    PITCH,
  );

  // `b` is the fullest at four rows, so it is pinned at 46, 108, 170, 232 and
  // every number below is worked out against those. Neither of the other two
  // touches the other, so the first sweep is the answer and the second finds
  // nothing to change and stops the loop.
  assert.deepStrictEqual(ysOf(settled, b), [46, 108, 170, 232]);

  // A TWO-ROW COLUMN ON A FOUR-ROW BOARD IS HOME AT ROWS 1 AND 2 — one row of
  // slack above it and one below, so the middle is 108 and 170.
  //
  // COLUMN a. Row 0 is pulled to `b2` at 170: weight 1 + 0.3, target
  // (170 + 0.3*108)/1.3 = 155.69…, which at row 0 is also its z. Row 1 has no
  // relation, so its target is its own home, 170, and in z that is 170 − 62 =
  // 108. That is a violation — z may not decrease — so the two rows pool into
  // one block at (202.4 + 51)/1.6 = 146.75. In rows that is (146.75 − 46)/62 =
  // 1.63, which rounds to 2 and is inside the two rows of slack a two-row
  // column has here: `a0` lands on 46 + 2*62 = 170, level with the card it is
  // related to, and `a1` follows it a pitch below.
  assert.deepStrictEqual(ysOf(settled, a), [170, 232]);

  // COLUMN c, the same two ingredients the other way up. Row 0 has no relation
  // and wants its home, 108, whose z is also 108 — one row down, which is the
  // middle. Row 1 is pulled to `b3` at 232: target (232 + 0.3*170)/1.3 =
  // 217.69…, in z 155.69… — no violation, so nothing pools — and 1.77 rows,
  // rounding to 2. Row 1 is therefore written at 46 + (2 + 1)*62 = 232, the
  // board's last row and the tightest the slack allows.
  assert.deepStrictEqual(ysOf(settled, c), [108, 232]);
});

test("an empty board settles to an empty map", () => {
  assert.deepStrictEqual(settleColumns([], [], PITCH), new Map());
  assert.deepStrictEqual(
    settleColumns([[], []], [{ fromId: "a0", toId: "b0" }], PITCH),
    new Map(),
  );
});
