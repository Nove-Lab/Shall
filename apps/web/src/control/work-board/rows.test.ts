import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { FixSpecItem, ImplementItem, WorkBoard } from "../../spec/review";
import {
  BOARD_KIND_LABEL,
  boardRows,
  rowSince,
  rowSummary,
  rowTitle,
  type BoardRow,
} from "./rows";

/**
 * WHAT THE BOARD'S ONE LIST PROMISES. Core has already sorted each half and
 * decided every count; what is left here is the order the two halves are joined
 * in, what a row is called when it has no id, the one line each kind measures
 * itself by, and which instant a row started waiting at — written against plain
 * items the way the daemon serves them.
 */
function fix(fields: Partial<FixSpecItem> = {}): FixSpecItem {
  return {
    key: "fix:R-0001",
    id: "R-0001",
    type: "Requirement",
    shortName: "one",
    name: "The first requirement",
    kind: "grammar",
    reason: "orphan",
    detail: "Nothing reaches it.",
    file: "spec/intent/Requirement/R-0001.md",
    by: null,
    at: null,
    updatedAt: 1000,
    ...fields,
  };
}

function implement(fields: Partial<ImplementItem> = {}): ImplementItem {
  return {
    key: "work-item:WI-0001",
    id: "WI-0001",
    shortName: "one",
    name: "Draw the board",
    updatedAt: 2000,
    modules: [{ id: "M-0001", shortName: "web", name: "The web app" }],
    requirements: [],
    targets: [],
    addressedBy: [],
    depth: 0,
    ...fields,
  };
}

const BOARD: WorkBoard = {
  fixSpec: [fix(), fix({ key: "fix:R-0002", id: "R-0002" })],
  implement: [implement(), implement({ key: "work-item:WI-0002", id: "WI-0002" })],
};

describe("boardRows", () => {
  test("Fix Spec first, then Implement, each half in core's own order", () => {
    assert.deepEqual(
      boardRows(BOARD).map((row) => [row.kind, row.item.key]),
      [
        ["fix", "fix:R-0001"],
        ["fix", "fix:R-0002"],
        ["implement", "work-item:WI-0001"],
        ["implement", "work-item:WI-0002"],
      ],
    );
  });

  test("a board with one half empty is that half's rows and nothing else", () => {
    assert.deepEqual(boardRows({ fixSpec: [], implement: [implement()] }).length, 1);
    assert.deepEqual(boardRows({ fixSpec: [fix()], implement: [] }).length, 1);
    assert.deepEqual(boardRows({ fixSpec: [], implement: [] }), []);
  });

  test("both kinds have a word, and the map is the only place they are spelled", () => {
    assert.deepEqual(Object.keys(BOARD_KIND_LABEL).sort(), ["fix", "implement"]);
    for (const row of boardRows(BOARD)) {
      assert.ok(BOARD_KIND_LABEL[row.kind].length > 0);
    }
  });
});

describe("rowTitle", () => {
  test("a work item is its id and its name", () => {
    assert.equal(
      rowTitle({ kind: "implement", item: implement() }),
      "WI-0001 Draw the board",
    );
  });

  test("a fix with an id and a name says both", () => {
    assert.equal(
      rowTitle({ kind: "fix", item: fix() }),
      "R-0001 The first requirement",
    );
  });

  test("a fix with an id and no name is the id alone", () => {
    assert.equal(rowTitle({ kind: "fix", item: fix({ name: null }) }), "R-0001");
  });

  test("a row for a file that would not read is the path", () => {
    assert.equal(
      rowTitle({ kind: "fix", item: fix({ id: null, file: "spec/intent/Requirement/R-9.md" }) }),
      "spec/intent/Requirement/R-9.md",
    );
  });

  test("a row with neither an id nor a file says so rather than nothing", () => {
    assert.equal(
      rowTitle({ kind: "fix", item: fix({ id: null, file: null }) }),
      "a file that would not read",
    );
  });
});

describe("rowSummary", () => {
  test("a fix is the rule's own word and the first line of what was said", () => {
    assert.equal(
      rowSummary({
        kind: "fix",
        item: fix({ reason: "rejected", detail: "The name is wrong.\nAnd so is the body." }),
      }),
      "rejected · The name is wrong.",
    );
  });

  test("a work item is the module it belongs to, its criteria and the work on it", () => {
    const row: BoardRow = {
      kind: "implement",
      item: implement({
        modules: [
          { id: "M-0001", shortName: "web", name: "web" },
          { id: "M-0002", shortName: "core", name: "core" },
        ],
        targets: [{ id: "AC-0001", name: "one", closure: "open" }],
        addressedBy: [
          { id: "WL-0001", name: "a turn", color: "yellow" },
          { id: "WL-0002", name: "another", color: "green" },
        ],
      }),
    };
    assert.equal(rowSummary(row), "M-0001, M-0002 · 1 criterion · 2 work logs");
  });

  test("what a work item has none of is left out rather than said as nought", () => {
    assert.equal(
      rowSummary({ kind: "implement", item: implement() }),
      "M-0001",
    );
    assert.equal(
      rowSummary({
        kind: "implement",
        item: implement({
          targets: [
            { id: "AC-0001", name: "one", closure: "open" },
            { id: "AC-0002", name: "two", closure: null },
          ],
        }),
      }),
      "M-0001 · 2 criteria",
    );
  });

  test("a work item with nothing attached says so", () => {
    assert.equal(
      rowSummary({ kind: "implement", item: implement({ modules: [] }) }),
      "nothing attached yet",
    );
  });
});

describe("rowSince", () => {
  test("a work item is dated by the file's own mtime", () => {
    assert.equal(rowSince({ kind: "implement", item: implement() }), 2000);
  });

  test("a rejection is dated by the hearing, and everything else by the file", () => {
    assert.equal(
      rowSince({ kind: "fix", item: fix({ at: "2026-08-21T14:00:00.000Z" }) }),
      "2026-08-21T14:00:00.000Z",
    );
    assert.equal(rowSince({ kind: "fix", item: fix() }), 1000);
  });

  test("an id nothing answers to has neither", () => {
    assert.equal(
      rowSince({ kind: "fix", item: fix({ at: null, updatedAt: null }) }),
      null,
    );
  });
});
