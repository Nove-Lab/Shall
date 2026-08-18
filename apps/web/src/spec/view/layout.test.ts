import assert from "node:assert/strict";
import { test } from "node:test";

import { graphLayout, gridLayout, type Layout, type Placement } from "./layout";
import type { SpecEdge, SpecNode } from "./model";

/**
 * WHAT THE GRAPH LAYOUT PROMISES NOW THAT IT SETTLES — and, first of all, the
 * witness that the stack under the settle step is the stack that was there
 * before it.
 *
 * THE NUMBERS BELOW ARE WRITTEN OUT AND NEVER READ OFF `GEOMETRY`. A test that
 * derived them from the object the layout derives them from would keep passing
 * on the one day this file exists to fail — the day a card's home moves. They
 * are today's graph view: `topPadding + headerHeight` is the first row, the
 * pitch is `cardHeight + rowGap`, a column is `cardWidth + columnGap` from the
 * one before it, and the card box itself is 44 tall.
 */
const TOP = 46;
const PITCH = 62;
const COLUMN_PITCH = 188;
const CARD_HEIGHT = 44;

function node(id: string, type: string): SpecNode {
  return {
    id,
    type,
    shortName: id,
    name: id,
    body: "",
    createdAt: 0,
    updatedAt: 0,
  };
}

function edge(fromId: string, type: string, toId: string): SpecEdge {
  return { id: `${fromId} ${type} ${toId}`, type, fromId, toId };
}

/** One column's cards, in the order the layout emitted them. */
function column(layout: Layout, type: string): Placement[] {
  return layout.placements.filter((card) => card.type === type);
}

/**
 * A board with tension in it: four of the twenty-two columns populated, at four
 * different heights, and relations that reach across the whole width of it —
 * Requirement is column 7 and ImplementationTask column 16, so a settled Task
 * has been pulled past nine empty columns to get level with its Requirement.
 *
 * Requirement is the fullest at five, which is what makes it the column every
 * other one is measured against here.
 */
const NODES: SpecNode[] = [
  node("T-0001", "Term"),
  node("T-0002", "Term"),
  node("R-0001", "Requirement"),
  node("R-0002", "Requirement"),
  node("R-0003", "Requirement"),
  node("R-0004", "Requirement"),
  node("R-0005", "Requirement"),
  node("AC-0001", "AcceptanceCriterion"),
  node("IT-0001", "ImplementationTask"),
  node("IT-0002", "ImplementationTask"),
  node("IT-0003", "ImplementationTask"),
];

const EDGES: SpecEdge[] = [
  edge("IT-0001", "IMPLEMENTS", "R-0004"),
  edge("IT-0003", "IMPLEMENTS", "R-0005"),
  edge("AC-0001", "VERIFIES", "R-0002"),
  edge("R-0005", "MENTIONS", "T-0001"),
];

const STACKED = graphLayout(NODES, []);
const SETTLED = graphLayout(NODES, EDGES);

/** The board's last row, which is the fullest column's. See `settleColumns`. */
const BOTTOM = TOP + 4 * PITCH;

/** The four types the fixture populates, in the canon's own column order. */
const POPULATED = [
  "Term",
  "Requirement",
  "AcceptanceCriterion",
  "ImplementationTask",
];

test("a graph with no relations is placed exactly as it always was", () => {
  // THE ONE CASE THAT IS A LITERAL AND NOT A PROPERTY. Every other test here
  // holds for a whole family of answers; this one is the picture this repo drew
  // before there was a settle step, spelled out so that a change to any term of
  // it — the padding, the header, the pitch, the column order, the id sort —
  // has to be typed out here by whoever makes it.
  assert.deepStrictEqual(STACKED.placements, [
    { id: "T-0001", type: "Term", band: "Domain", x: 0, y: 46 },
    { id: "T-0002", type: "Term", band: "Domain", x: 0, y: 108 },
    { id: "R-0001", type: "Requirement", band: "Intent", x: 1316, y: 46 },
    { id: "R-0002", type: "Requirement", band: "Intent", x: 1316, y: 108 },
    { id: "R-0003", type: "Requirement", band: "Intent", x: 1316, y: 170 },
    { id: "R-0004", type: "Requirement", band: "Intent", x: 1316, y: 232 },
    { id: "R-0005", type: "Requirement", band: "Intent", x: 1316, y: 294 },
    {
      id: "AC-0001",
      type: "AcceptanceCriterion",
      band: "Intent",
      x: 1504,
      y: 46,
    },
    {
      id: "IT-0001",
      type: "ImplementationTask",
      band: "Plan",
      x: 3008,
      y: 46,
    },
    {
      id: "IT-0002",
      type: "ImplementationTask",
      band: "Plan",
      x: 3008,
      y: 108,
    },
    {
      id: "IT-0003",
      type: "ImplementationTask",
      band: "Plan",
      x: 3008,
      y: 170,
    },
  ]);
  // The columns those x's are: 0, 7, 8 and 16 of the canon's order.
  assert.deepStrictEqual(
    [0, 7, 8, 16].map((index) => index * COLUMN_PITCH),
    [0, 1316, 1504, 3008],
  );
});

test("the fullest column keeps the placement the stack gave it", () => {
  assert.deepStrictEqual(
    column(SETTLED, "Requirement").map((card) => card.y),
    [0, 1, 2, 3, 4].map((row) => TOP + row * PITCH),
  );
});

test("a relation does move the columns that are free to move", () => {
  // Without this the four cases below would all hold for a board that settles
  // to the stack, which is the one answer they must not be satisfied by.
  assert.notDeepStrictEqual(SETTLED.placements, STACKED.placements);
});

test("no column is re-ordered, and no card is closer than the pitch", () => {
  for (const type of POPULATED) {
    const cards = column(SETTLED, type);
    const byY = [...cards].sort((left, right) => left.y - right.y);
    assert.deepStrictEqual(
      byY.map((card) => card.id),
      cards.map((card) => card.id),
      `${type} came back in another order`,
    );
    for (const [index, card] of cards.slice(1).entries()) {
      const above = (cards[index] as Placement).y;
      assert.ok(
        card.y - above >= PITCH,
        `${card.id} sits ${card.y - above}px under the card above it`,
      );
    }
  }
});

test("every card lands on a whole pixel, inside the board", () => {
  for (const card of SETTLED.placements) {
    assert.ok(Number.isInteger(card.y), `${card.id} is at ${card.y}`);
    assert.ok(card.y >= TOP && card.y <= BOTTOM, `${card.id} is off the board`);
  }
});

test("settling moves nothing sideways and resizes nothing", () => {
  assert.deepStrictEqual(
    SETTLED.placements.map(({ id, type, band, x }) => ({ id, type, band, x })),
    STACKED.placements.map(({ id, type, band, x }) => ({ id, type, band, x })),
  );
  // The extent is the stack's arithmetic and the box is what keeps that honest:
  // a settled card cannot leave the box the stack occupied, so the board that
  // held the stack holds the answer.
  assert.deepStrictEqual(SETTLED.columns, STACKED.columns);
  assert.equal(SETTLED.width, STACKED.width);
  assert.equal(SETTLED.height, STACKED.height);
  assert.ok(BOTTOM + CARD_HEIGHT <= SETTLED.height);
});

test("the same graph lays out the same way twice", () => {
  assert.deepStrictEqual(graphLayout(NODES, EDGES), graphLayout(NODES, EDGES));
});

test("the grid never sees a relation", () => {
  // IT TAKES THE NODES AND NOTHING ELSE, which is the claim: the settle step is
  // the graph view's and a board of bands and ruled lanes has no free y for it
  // to solve for. An arity of one is how a caller is stopped from handing this
  // one the relations in the first place.
  assert.equal(gridLayout.length, 1);
  // And every column still steps by the grid's own pitch — 44 + 2*3 + 1 — which
  // is the shape a settle step reaching this view would break first.
  const grid = gridLayout(NODES);
  for (const type of POPULATED) {
    const ys = column(grid, type).map((card) => card.y);
    for (const [index, y] of ys.slice(1).entries()) {
      assert.equal(y - (ys[index] as number), 51, `${type} steps oddly`);
    }
  }
});
