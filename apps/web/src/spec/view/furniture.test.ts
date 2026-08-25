import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  Z,
  bandPieces,
  cardNodeId,
  cardPieces,
  furniturePieces,
  graphIdOfCard,
  typeCardPieces,
  type Closure,
  type Satisfaction,
  type Signal,
  type WorkItemState,
} from "./furniture";
import { NOTHING_SELECTED, highlightFor, type Highlight } from "./highlight";
import { gridLayout, graphLayout, type Layout, type Placement } from "./layout";
import type { SpecNode } from "./model";

/**
 * WHAT THE CANVAS IS HANDED. Every piece below is checked for the three things
 * that were once only visible in a browser — its own declared box, the paint
 * order it carries, and the pointer style that lets a gesture through the
 * scenery — and every card for the four words the review sends and the three
 * the highlight answers.
 *
 * THE CARD BOX IS WRITTEN OUT: 148 by 44 in both views, which is the claim that
 * the graph opens at the grid's card size.
 */
const CARD_WIDTH = 148;
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

const NODES: SpecNode[] = [
  node("T-0001", "Term"),
  node("R-0001", "Requirement"),
  node("R-0002", "Requirement"),
  node("AC-0001", "AcceptanceCriterion"),
];

const BY_ID = new Map(NODES.map((held) => [held.id, held]));
const GRID = gridLayout(NODES);
const GRAPH = graphLayout(NODES, []);

const NO_SIGNALS = new Map<string, Signal>();
const NO_CLOSURES = new Map<string, Closure>();
const NO_STATES = new Map<string, WorkItemState>();
const NO_SATISFACTIONS = new Map<string, Satisfaction>();

function cards(
  layout: Layout,
  view: "grid" | "graph",
  highlight: Highlight = NOTHING_SELECTED,
  maps: {
    signals?: ReadonlyMap<string, Signal>;
    closures?: ReadonlyMap<string, Closure>;
    states?: ReadonlyMap<string, WorkItemState>;
    satisfactions?: ReadonlyMap<string, Satisfaction>;
    byId?: ReadonlyMap<string, SpecNode>;
  } = {},
) {
  return cardPieces(
    layout,
    view,
    maps.byId ?? BY_ID,
    maps.signals ?? NO_SIGNALS,
    maps.closures ?? NO_CLOSURES,
    maps.states ?? NO_STATES,
    maps.satisfactions ?? NO_SATISFACTIONS,
    highlight,
  );
}

describe("the canvas id", () => {
  test("a graph id goes in prefixed and comes back bare", () => {
    assert.equal(cardNodeId("R-0001"), "card:R-0001");
    assert.equal(graphIdOfCard(cardNodeId("R-0001")), "R-0001");
  });

  test("a piece of scenery's id is not a graph id", () => {
    assert.equal(graphIdOfCard("band:Intent"), null);
    assert.equal(graphIdOfCard("lane:Intent:Requirement:0"), null);
    assert.equal(graphIdOfCard("column:Intent:Requirement"), null);
  });
});

describe("bandPieces", () => {
  test("one strip per band, each declaring the box its component draws", () => {
    const pieces = bandPieces(GRID.bands);
    assert.deepEqual(
      pieces.map((piece) => piece.id),
      ["band:Domain", "band:Intent", "band:Plan", "band:Execution"],
    );
    for (const [index, piece] of pieces.entries()) {
      const band = GRID.bands[index];
      assert.ok(band !== undefined);
      assert.deepEqual(piece.position, { x: band.x, y: band.y });
      assert.deepEqual(piece.measured, { width: band.width, height: band.height });
      assert.equal(piece.zIndex, Z.band);
      assert.deepEqual(piece.style, { pointerEvents: "none" });
      assert.equal(piece.selectable, false);
      assert.equal(piece.connectable, false);
      assert.equal(piece.draggable, false);
    }
  });

  test("the first band draws no top rule, because a rule separates two bands", () => {
    assert.deepEqual(
      bandPieces(GRID.bands).map((piece) =>
        piece.type === "band" ? piece.data.ruled : null,
      ),
      [false, true, true, true],
    );
  });

  test("no bands is no strips", () => {
    assert.deepEqual(bandPieces([]), []);
  });
});

describe("furniturePieces", () => {
  test("the bands, then every lane, then every column header", () => {
    const pieces = furniturePieces(GRID);
    const kinds = pieces.map((piece) => piece.type);
    assert.deepEqual(
      [...new Set(kinds)],
      ["band", "lane", "column"],
    );
    assert.equal(
      pieces.filter((piece) => piece.type === "band").length,
      GRID.bands.length,
    );
    assert.equal(
      pieces.filter((piece) => piece.type === "lane").length,
      GRID.lanes.length,
    );
    assert.equal(
      pieces.filter((piece) => piece.type === "column").length,
      GRID.columns.length,
    );
  });

  test("a lane carries its own ruling, and its id is the layout's own key", () => {
    const lane = GRID.lanes[0];
    assert.ok(lane !== undefined);
    const piece = furniturePieces(GRID).find((held) => held.type === "lane");
    assert.ok(piece !== undefined && piece.type === "lane");
    assert.equal(piece.id, `lane:${lane.key}`);
    assert.deepEqual(piece.data, {
      width: lane.width,
      height: lane.height,
      rowPitch: lane.rowPitch,
      ruleOffset: lane.ruleOffset,
      ruleThickness: lane.ruleThickness,
    });
    assert.equal(piece.zIndex, Z.lane);
  });

  test("a column header spans the type's whole slot and declares a whole-pixel height", () => {
    const header = furniturePieces(GRID).find(
      (piece) => piece.type === "column" && piece.id === "column:Intent:Requirement",
    );
    assert.ok(header !== undefined && header.type === "column");
    const column = GRID.columns.find((held) => held.type === "Requirement");
    assert.ok(column !== undefined);
    assert.equal(header.data.width, column.width);
    assert.equal(header.data.count, 2);
    assert.ok(Number.isInteger(header.measured.height));
    assert.equal(header.zIndex, Z.column);
  });

  test("the graph draws no bands and rules no lanes, so it gets headers alone", () => {
    const pieces = furniturePieces(GRAPH);
    assert.deepEqual([...new Set(pieces.map((piece) => piece.type))], ["column"]);
  });

  test("the scenery paints under the relations, and the cards over them", () => {
    assert.ok(Z.band < Z.lane);
    assert.ok(Z.lane < Z.column);
    assert.ok(Z.column < Z.edge);
    assert.ok(Z.edge < Z.card);
    assert.ok(Z.card < Z.litEdge);
  });
});

describe("cardPieces", () => {
  test("one card per placement, at the placement's own position", () => {
    const pieces = cards(GRAPH, "graph");
    assert.deepEqual(
      pieces.map((piece) => piece.id),
      ["card:T-0001", "card:R-0001", "card:R-0002", "card:AC-0001"],
    );
    for (const [index, piece] of pieces.entries()) {
      const placed = GRAPH.placements[index] as Placement;
      assert.deepEqual(piece.position, { x: placed.x, y: placed.y });
    }
  });

  test("the card declares its box three times, and the two views declare the same one", () => {
    for (const [layout, view] of [
      [GRID, "grid"],
      [GRAPH, "graph"],
    ] as const) {
      const piece = cards(layout, view)[0];
      assert.ok(piece !== undefined);
      assert.equal(piece.width, CARD_WIDTH);
      assert.equal(piece.height, CARD_HEIGHT);
      assert.deepEqual(piece.measured, { width: CARD_WIDTH, height: CARD_HEIGHT });
      assert.equal(piece.data.width, CARD_WIDTH);
      assert.equal(piece.data.height, CARD_HEIGHT);
      assert.equal(piece.zIndex, Z.card);
      assert.equal(piece.draggable, false);
    }
  });

  test("a placement whose node is not in the map is skipped", () => {
    const partial = new Map([["R-0001", node("R-0001", "Requirement")]]);
    const pieces = cards(GRAPH, "graph", NOTHING_SELECTED, { byId: partial });
    assert.deepEqual(
      pieces.map((piece) => piece.id),
      ["card:R-0001"],
    );
  });

  test("a node with no entry in a map wears no word for it", () => {
    const piece = cards(GRAPH, "graph")[0];
    assert.ok(piece !== undefined);
    assert.equal(piece.data.signal, null);
    assert.equal(piece.data.closure, null);
    assert.equal(piece.data.workItemState, null);
    assert.equal(piece.data.satisfaction, null);
  });

  test("the four words the review sends travel through unread", () => {
    const pieces = cards(GRAPH, "graph", NOTHING_SELECTED, {
      signals: new Map<string, Signal>([["R-0001", "yellow"]]),
      closures: new Map<string, Closure>([["AC-0001", "closed"]]),
      states: new Map<string, WorkItemState>([["T-0001", "ready"]]),
      satisfactions: new Map<string, Satisfaction>([["R-0002", "unsat"]]),
    });
    const byId = new Map(pieces.map((piece) => [piece.data.node.id, piece.data]));
    assert.equal(byId.get("R-0001")?.signal, "yellow");
    assert.equal(byId.get("AC-0001")?.closure, "closed");
    assert.equal(byId.get("T-0001")?.workItemState, "ready");
    assert.equal(byId.get("R-0002")?.satisfaction, "unsat");
    assert.equal(byId.get("R-0001")?.closure, null);
  });

  test("with nothing picked, the board is drawn at full strength", () => {
    for (const piece of cards(GRAPH, "graph")) {
      assert.equal(piece.data.picked, false);
      assert.equal(piece.data.neighbour, false);
      assert.equal(piece.data.dimmed, false);
    }
  });

  test("the picked card, its neighbours and everything else are three answers", () => {
    const highlight = highlightFor(
      [{ id: "e1", fromId: "R-0001", toId: "T-0001" }],
      "R-0001",
    );
    const byId = new Map(
      cards(GRAPH, "graph", highlight).map((piece) => [piece.data.node.id, piece.data]),
    );
    assert.deepEqual(
      ["R-0001", "T-0001", "R-0002"].map((id) => {
        const data = byId.get(id);
        return [data?.picked, data?.neighbour, data?.dimmed];
      }),
      [
        [true, false, false],
        [false, true, false],
        [false, false, true],
      ],
    );
  });
});

describe("typeCardPieces", () => {
  const PLACEMENTS: Placement[] = [
    { id: "Term", type: "Term", band: "Domain", x: 0, y: 0, width: 60 },
    { id: "Requirement", type: "Requirement", band: "Intent", x: 200, y: 0 },
  ];
  const GEOMETRY = { cardWidth: 176, cardHeight: 28 };

  test("a card that sizes itself keeps its width; one that does not takes the geometry's", () => {
    const pieces = typeCardPieces(PLACEMENTS, GEOMETRY, NOTHING_SELECTED);
    assert.deepEqual(
      pieces.map((piece) => [piece.id, piece.width, piece.data.width]),
      [
        ["card:Term", 60, 60],
        ["card:Requirement", 176, 176],
      ],
    );
    for (const piece of pieces) {
      assert.equal(piece.height, GEOMETRY.cardHeight);
      assert.deepEqual(piece.measured, {
        width: piece.width,
        height: GEOMETRY.cardHeight,
      });
      assert.equal(piece.zIndex, Z.card);
      assert.equal(piece.draggable, false);
    }
  });

  test("it wears the same three highlight words a graph card does", () => {
    const highlight = highlightFor(
      [{ id: "pair", fromId: "Term", toId: "Requirement" }],
      "Term",
    );
    const pieces = typeCardPieces(
      [
        ...PLACEMENTS,
        { id: "Module", type: "Module", band: "Plan", x: 400, y: 0 },
      ],
      GEOMETRY,
      highlight,
    );
    assert.deepEqual(
      pieces.map((piece) => [piece.data.picked, piece.data.neighbour, piece.data.dimmed]),
      [
        [true, false, false],
        [false, true, false],
        [false, false, true],
      ],
    );
  });

  test("with nothing picked, no type card is lit or faded", () => {
    for (const piece of typeCardPieces(PLACEMENTS, GEOMETRY, NOTHING_SELECTED)) {
      assert.equal(piece.data.picked, false);
      assert.equal(piece.data.neighbour, false);
      assert.equal(piece.data.dimmed, false);
    }
  });
});
