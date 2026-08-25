import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { CardGeometry } from "./edge-geometry";
import { routedEdges, type Incidence, type RoutableCard } from "./edges";
import type { Band } from "./model";

/**
 * WHAT THE RELATION BUILDER PROMISES: one routed entry per relation whose two
 * ends are on the board, a relation from a thing to itself drawn as an arch
 * rather than routed, the dashed answer taken from the two cards' bands, and
 * every OTHER card offered to the router as an obstacle.
 *
 * The geometry is this file's own round one, as in `edge-geometry.test.ts`: a
 * card is 100 by 40 and the column gap is 40, so a path steps 20 out of a
 * left/right border.
 */
const BOX: CardGeometry = {
  cardWidth: 100,
  cardHeight: 40,
  columnGap: 40,
  rowGap: 20,
};

function card(
  id: string,
  band: Band,
  x: number,
  y: number,
  width?: number,
): RoutableCard {
  return width === undefined ? { id, band, x, y } : { id, band, x, y, width };
}

function relation(fromId: string, toId: string): Incidence {
  return { id: `${fromId}->${toId}`, fromId, toId };
}

describe("routedEdges", () => {
  test("one entry per relation, in the order the relations arrived", () => {
    const cards = [
      card("A", "Intent", 0, 0),
      card("B", "Intent", 300, 0),
      card("C", "Intent", 600, 0),
    ];
    const built = routedEdges(
      cards,
      [relation("A", "B"), relation("B", "C"), relation("A", "C")],
      BOX,
      "graph",
    );
    assert.deepEqual(
      built.map((entry) => entry.edge.id),
      ["A->B", "B->C", "A->C"],
    );
  });

  test("a relation with an end that has no card is skipped, either end", () => {
    const cards = [card("A", "Intent", 0, 0), card("B", "Intent", 300, 0)];
    const built = routedEdges(
      cards,
      [
        relation("A", "GONE"),
        relation("GONE", "B"),
        relation("GONE", "ALSO-GONE"),
        relation("A", "B"),
      ],
      BOX,
      "graph",
    );
    assert.deepEqual(
      built.map((entry) => entry.edge.id),
      ["A->B"],
    );
  });

  test("a relation sinking into Domain is dashed, and no other is", () => {
    const cards = [
      card("T", "Domain", 0, 0),
      card("DE", "Domain", 300, 0),
      card("R", "Intent", 600, 0),
    ];
    const built = routedEdges(
      cards,
      [relation("R", "T"), relation("T", "DE"), relation("T", "R")],
      BOX,
      "graph",
    );
    assert.deepEqual(
      built.map((entry) => [entry.edge.id, entry.dashed]),
      [
        ["R->T", true],
        ["T->DE", false],
        ["T->R", false],
      ],
    );
  });
});

describe("routedEdges — a relation from a thing to itself", () => {
  test("it is an arch over the card, and neither detoured nor refused", () => {
    const built = routedEdges(
      [card("Requirement", "Intent", 0, 0)],
      [relation("Requirement", "Requirement")],
      BOX,
      "graph",
    );
    const [only] = built;
    assert.ok(only !== undefined);
    // Out of the left border at the card's middle, up over it, across, and back
    // into the right border travelling leftwards.
    assert.deepEqual(only.route.waypoints, [
      { x: 0, y: 20 },
      { x: -20, y: 20 },
      { x: -20, y: -20 },
      { x: 120, y: -20 },
      { x: 120, y: 20 },
      { x: 100, y: 20 },
    ]);
    assert.equal(only.route.detoured, false);
    assert.equal(only.route.fallback, false);
  });

  test("the arch is cut to a card that sizes itself, not to the geometry's width", () => {
    const built = routedEdges(
      [card("Term", "Domain", 0, 0, 60)],
      [relation("Term", "Term")],
      BOX,
      "graph",
    );
    const [only] = built;
    assert.ok(only !== undefined);
    assert.deepEqual(only.route.waypoints.at(-1), { x: 60, y: 20 });
    assert.deepEqual(only.route.waypoints.at(3), { x: 80, y: -20 });
  });
});

describe("routedEdges — what the router is given to avoid", () => {
  test("a third card between the two ends moves the path off the straight line", () => {
    const clear = routedEdges(
      [card("A", "Intent", 0, 0), card("B", "Intent", 400, 0)],
      [relation("A", "B")],
      BOX,
      "graph",
    );
    const obstructed = routedEdges(
      [
        card("A", "Intent", 0, 0),
        card("B", "Intent", 400, 0),
        card("C", "Intent", 200, 0),
      ],
      [relation("A", "B")],
      BOX,
      "graph",
    );
    assert.equal(clear[0]?.route.detoured, false);
    assert.equal(obstructed[0]?.route.detoured, true);
  });

  test("the relation's own two cards are not obstacles to it", () => {
    // The same board and the same middle card: it moves the relation that
    // passes it and not the one that ends on it.
    const cards = [
      card("A", "Intent", 0, 0),
      card("B", "Intent", 400, 0),
      card("C", "Intent", 200, 0),
    ];
    const built = routedEdges(
      cards,
      [relation("A", "B"), relation("A", "C")],
      BOX,
      "graph",
    );
    assert.deepEqual(
      built.map((entry) => [entry.edge.id, entry.route.detoured]),
      [
        ["A->B", true],
        ["A->C", false],
      ],
    );
  });

  test("an obstacle that sizes itself is avoided at its own width", () => {
    // A relation straight down a column at x = 450, and one card to the left of
    // it: at the geometry's 100 that card ends at 250 and is nowhere near the
    // path; at its own 300 it reaches the path's own line.
    const ends = [card("A", "Intent", 400, 0), card("B", "Intent", 400, 200)];
    const clear = routedEdges(
      [...ends, card("C", "Intent", 150, 100)],
      [relation("A", "B")],
      BOX,
      "graph",
    );
    const reaching = routedEdges(
      [...ends, card("C", "Intent", 150, 100, 300)],
      [relation("A", "B")],
      BOX,
      "graph",
    );
    assert.equal(clear[0]?.route.detoured, false);
    assert.equal(reaching[0]?.route.detoured, true);
  });
});
