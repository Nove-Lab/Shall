import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Incidence } from "./edges";
import { NOTHING_SELECTED, highlightFor } from "./highlight";

/**
 * WHAT THE ONE-HOP NEIGHBOURHOOD PROMISES: the selected node and the nodes one
 * relation away from it, whichever way the arrow points, and the relations
 * incident to the selection by their own ids. Written against a small board
 * with an arrow in each direction, a pair joined twice, and a node nothing
 * reaches.
 */
function edge(id: string, fromId: string, toId: string): Incidence {
  return { id, fromId, toId };
}

/**
 * R-0001 is the middle of everything: it points at T-0001 and at T-0002, and
 * AC-0001 and WI-0001 point back at it — twice, in WI-0001's case. R-0002 and
 * T-0003 are on the board and touch nothing.
 */
const EDGES: Incidence[] = [
  edge("e1", "R-0001", "T-0001"),
  edge("e2", "R-0001", "T-0002"),
  edge("e3", "AC-0001", "R-0001"),
  edge("e4", "WI-0001", "R-0001"),
  edge("e5", "WI-0001", "R-0001"),
  edge("e6", "R-0002", "T-0003"),
];

describe("highlightFor", () => {
  test("nothing selected is the one shared value, and it is empty", () => {
    const highlight = highlightFor(EDGES, null);
    assert.equal(highlight, NOTHING_SELECTED);
    assert.equal(highlight.selected, null);
    assert.equal(highlight.nodes.size, 0);
    assert.equal(highlight.edges.size, 0);
  });

  test("the same object comes back every time, so a memo on it rebuilds nothing", () => {
    assert.equal(highlightFor(EDGES, null), highlightFor([], null));
  });

  test("the selection lights itself and its neighbours, whichever way each arrow runs", () => {
    const highlight = highlightFor(EDGES, "R-0001");
    assert.equal(highlight.selected, "R-0001");
    assert.deepEqual(
      [...highlight.nodes],
      ["R-0001", "T-0001", "T-0002", "AC-0001", "WI-0001"],
    );
  });

  test("two relations between one pair are one neighbour and two lit lines", () => {
    const highlight = highlightFor(EDGES, "WI-0001");
    assert.deepEqual([...highlight.nodes], ["WI-0001", "R-0001"]);
    assert.deepEqual([...highlight.edges], ["e4", "e5"]);
  });

  test("a relation neither end of which is the selection stays dark", () => {
    const highlight = highlightFor(EDGES, "R-0001");
    assert.deepEqual([...highlight.edges], ["e1", "e2", "e3", "e4", "e5"]);
    assert.equal(highlight.edges.has("e6"), false);
    assert.equal(highlight.nodes.has("T-0003"), false);
  });

  test("a leaf lights only the node that reaches it", () => {
    const highlight = highlightFor(EDGES, "T-0001");
    assert.deepEqual([...highlight.nodes], ["T-0001", "R-0001"]);
    assert.deepEqual([...highlight.edges], ["e1"]);
  });

  test("a relation from a thing to itself is counted once, on the first arm", () => {
    const highlight = highlightFor([edge("loop", "M-0001", "M-0001")], "M-0001");
    assert.deepEqual([...highlight.nodes], ["M-0001"]);
    assert.deepEqual([...highlight.edges], ["loop"]);
  });

  test("a selected id with no node behind it lights itself and dims the rest", () => {
    const highlight = highlightFor(EDGES, "GONE");
    assert.deepEqual([...highlight.nodes], ["GONE"]);
    assert.equal(highlight.edges.size, 0);
  });
});
