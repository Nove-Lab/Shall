import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  ANCHOR_MARGIN,
  READABLE_ZOOM,
  cardCenter,
  openingViewport,
  originViewport,
  revealNeeded,
  revealScroll,
  scrolledViewport,
  type CardGeometry,
} from "./camera";
import { graphLayout, gridLayout, type Layout, type Placement } from "./layout";
import type { SpecNode } from "./model";

/**
 * WHERE THE LENS POINTS. The two layouts are built for real rather than
 * fabricated, because the one claim `openingViewport` makes is that it asks the
 * layout where its leftmost header is instead of assuming the answer; the
 * numbers it is checked against are this file's own — the margin and the card
 * box — and never read off `GEOMETRY`.
 */
const CARD: CardGeometry = { cardWidth: 148, cardHeight: 44 };

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

function placement(x: number, y: number): Placement {
  return { id: "R-0001", type: "Requirement", band: "Intent", x, y };
}

const NODES: SpecNode[] = [node("T-0001", "Term"), node("R-0001", "Requirement")];

describe("the two openings", () => {
  test("the grid opens at its own top-left corner, at the one scale", () => {
    assert.deepEqual(originViewport(), { x: 0, y: 0, zoom: READABLE_ZOOM });
  });

  test("a scroll offset is a viewport translated the other way", () => {
    assert.deepEqual(scrolledViewport(120, 40), {
      x: -120,
      y: -40,
      zoom: READABLE_ZOOM,
    });
    assert.deepEqual(scrolledViewport(1, 2), { x: -1, y: -2, zoom: READABLE_ZOOM });
  });

  test("the graph anchors its leftmost column header at the margin, in both axes", () => {
    const layout = graphLayout(NODES, []);
    const leftmost = layout.columns.reduce((held, column) =>
      column.x < held.x ? column : held,
    );
    assert.deepEqual(openingViewport(layout), {
      x: ANCHOR_MARGIN - leftmost.x,
      y: ANCHOR_MARGIN - leftmost.y,
      zoom: READABLE_ZOOM,
    });
  });

  test("it asks the layout rather than assuming the first header sits at the origin", () => {
    const shifted: Layout = {
      ...graphLayout(NODES, []),
      columns: [
        { type: "Requirement", band: "Intent", label: "Requirement", count: 0, x: 500, y: 12, width: 148 },
        { type: "Term", band: "Domain", label: "Term", count: 0, x: 300, y: 12, width: 148 },
      ],
    };
    assert.deepEqual(openingViewport(shifted), {
      x: ANCHOR_MARGIN - 300,
      y: ANCHOR_MARGIN - 12,
      zoom: READABLE_ZOOM,
    });
  });

  test("ties go to the first column in layout order", () => {
    const tied: Layout = {
      ...graphLayout(NODES, []),
      columns: [
        { type: "Term", band: "Domain", label: "Term", count: 0, x: 40, y: 0, width: 148 },
        { type: "Goal", band: "Intent", label: "Goal", count: 0, x: 40, y: 99, width: 148 },
      ],
    };
    assert.equal(openingViewport(tied)?.y, ANCHOR_MARGIN);
  });

  test("a layout with no columns has nothing to anchor against", () => {
    const bare: Layout = { ...graphLayout(NODES, []), columns: [] };
    assert.equal(openingViewport(bare), null);
  });

  test("the grid's own layout answers too — it is the same arithmetic", () => {
    const opening = openingViewport(gridLayout(NODES));
    assert.ok(opening !== null);
    assert.equal(opening.zoom, READABLE_ZOOM);
  });
});

describe("revealNeeded", () => {
  const CANVAS = { width: 1000, height: 600 };
  const AT_REST = { x: 0, y: 0, zoom: 1 };

  test("a card wholly inside the canvas moves nothing", () => {
    assert.equal(
      revealNeeded(placement(100, 100), CARD, AT_REST, CANVAS),
      false,
    );
  });

  test("a card whose last pixel is the canvas's own edge is still on screen", () => {
    assert.equal(
      revealNeeded(
        placement(CANVAS.width - 148, CANVAS.height - 44),
        CARD,
        AT_REST,
        CANVAS,
      ),
      false,
    );
  });

  test("one pixel off any of the four edges has to be revealed", () => {
    assert.equal(revealNeeded(placement(-1, 100), CARD, AT_REST, CANVAS), true);
    assert.equal(revealNeeded(placement(100, -1), CARD, AT_REST, CANVAS), true);
    assert.equal(
      revealNeeded(placement(CANVAS.width - 147, 100), CARD, AT_REST, CANVAS),
      true,
    );
    assert.equal(
      revealNeeded(placement(100, CANVAS.height - 43), CARD, AT_REST, CANVAS),
      true,
    );
  });

  test("the viewport's translation and zoom are both applied", () => {
    // The same card at x = 1200 is off screen at rest and on screen once the
    // camera has panned 400 to the left.
    assert.equal(revealNeeded(placement(1200, 100), CARD, AT_REST, CANVAS), true);
    assert.equal(
      revealNeeded(placement(1200, 100), CARD, { x: -400, y: 0, zoom: 1 }, CANVAS),
      false,
    );
    // And at half scale it fits without the camera moving at all.
    assert.equal(
      revealNeeded(placement(1200, 100), CARD, { x: 0, y: 0, zoom: 0.5 }, CANVAS),
      false,
    );
  });
});

describe("where a card's middle is", () => {
  test("half a card in from its top-left corner", () => {
    assert.deepEqual(cardCenter(placement(100, 200), CARD), { x: 174, y: 222 });
  });

  test("the scroll that centres it is that middle less half the viewport", () => {
    assert.deepEqual(
      revealScroll(placement(100, 200), CARD, { width: 1000, height: 600 }),
      { left: -326, top: -78 },
    );
    assert.deepEqual(
      revealScroll(placement(2000, 1400), CARD, { width: 1000, height: 600 }),
      { left: 1574, top: 1122 },
    );
  });
});
