import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  REFS_SHOWN,
  activityRows,
  rowNote,
  type ActivityEntry,
  type ActivityKind,
} from "./rows";

/**
 * WHAT THE ROWS PROMISE. The file keeps every record flat and the screen shows
 * it flat; what is left to hold to account is the one-to-one mapping, the order
 * it keeps, and the small arithmetic over a row's refs — written against plain
 * entries the way the daemon serves them, newest first, so that the panel's
 * one testable piece is testable without a browser.
 */

/** One entry as the wire carries it: the summary is the sentence. */
function delivery(
  kind: ActivityKind,
  at: string,
  summary: string,
  refs: readonly string[] = [],
): ActivityEntry {
  return { at, kind, refs, summary };
}

/** An ISO instant on one afternoon, so that a larger minute is a later record. */
function at(minute: number): string {
  return `2026-08-21T14:${String(minute).padStart(2, "0")}:00.000Z`;
}

describe("activityRows", () => {
  test("one row per entry, newest first in and newest first out", () => {
    const rows = activityRows([
      delivery("work_done", at(3), "Third turn", ["WL-0003"]),
      delivery("plan_done", at(2), "Planned", ["MD-0001"]),
      delivery("work_done", at(1), "First turn", ["WL-0001"]),
    ]);
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((row) => [row.kind, row.at, row.sentence]),
      [
        ["work_done", at(3), "Third turn"],
        ["plan_done", at(2), "Planned"],
        ["work_done", at(1), "First turn"],
      ],
    );
  });

  test("the row's key is the index of its entry", () => {
    const rows = activityRows([
      delivery("raise_landed", at(4), "Landed a decision", ["D-0001"]),
      delivery("work_done", at(3), "Done", ["WL-0003"]),
      delivery("plan_done", at(2), "Planned", ["MD-0001"]),
      delivery("specify_done", at(1), "Spec drawn", ["G-0001"]),
    ]);
    assert.deepEqual(
      rows.map((row) => row.key),
      ["0", "1", "2", "3"],
    );
  });

  test("the sentence is the summary verbatim", () => {
    const rows = activityRows([
      delivery("specify_done", at(1), "Spec drawn — Goal 2, UseCase 3", [
        "G-0001",
        "G-0002",
        "UC-0001",
        "UC-0002",
        "UC-0003",
      ]),
    ]);
    const row = rows[0];
    assert.ok(row !== undefined);
    assert.equal(row.sentence, "Spec drawn — Goal 2, UseCase 3");
    assert.deepEqual(row.refs, ["G-0001", "G-0002", "UC-0001"]);
    assert.equal(row.hiddenRefs, 2);
  });

  test("refs are deduplicated, capped at REFS_SHOWN, and the rest counted", () => {
    const rows = activityRows([
      delivery("work_done", at(1), "Touched many", [
        "R-0001",
        "R-0002",
        "R-0003",
        "R-0003",
        "R-0004",
        "R-0001",
        "R-0005",
      ]),
    ]);
    const row = rows[0];
    assert.ok(row !== undefined);
    assert.equal(REFS_SHOWN, 3);
    assert.deepEqual(row.refs, ["R-0001", "R-0002", "R-0003"]);
    assert.equal(row.hiddenRefs, 2);
  });

  test("a row with refs under the cap hides none", () => {
    const rows = activityRows([delivery("work_done", at(1), "Done", ["WL-0001"])]);
    const row = rows[0];
    assert.ok(row !== undefined);
    assert.deepEqual(row.refs, ["WL-0001"]);
    assert.equal(row.hiddenRefs, 0);
  });

  test("an empty month is no rows", () => {
    assert.deepEqual(activityRows([]), []);
  });
});

describe("rowNote", () => {
  test("rowNote spells refs and the overflow, or a dash", () => {
    const full = activityRows([
      delivery("work_done", at(1), "Done", ["R-0001", "R-0002", "R-0003", "R-0004"]),
    ])[0];
    assert.ok(full !== undefined);
    assert.equal(rowNote(full), "R-0001, R-0002, R-0003 and 1 more");

    const plain = activityRows([delivery("work_done", at(1), "Done", ["WL-0001"])])[0];
    assert.ok(plain !== undefined);
    assert.equal(rowNote(plain), "WL-0001");

    const bare = activityRows([delivery("raise_landed", at(1), "Nothing landed")])[0];
    assert.ok(bare !== undefined);
    assert.equal(rowNote(bare), "—");
  });
});
