import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NODE_TYPES } from "./canon.js";
import {
  ID_SEQUENCE_MAX,
  ID_SEQUENCE_WIDTH,
  formatNodeId,
  idPrefixFor,
  nextIdSuggestion,
} from "./ids.js";

/**
 * The padding is the whole point of the format, so it is what these tests hold.
 * Ids sort as bytes wherever they are read — a folder listing, a column, a
 * ledger — and at a fixed width byte order and numeric order agree. An id one
 * digit wider breaks that property for every id after it, which is why the
 * suggestion stops rather than offering one.
 *
 * A SUGGESTION IS ALL THIS IS. A person may type anything the id door accepts,
 * so nothing below asserts that stored ids have this shape — only that the
 * shape offered is the one that sorts, and that an id which does not have it is
 * passed over rather than parsed loosely.
 */

describe("idPrefixFor", () => {
  test("answers with the type's pinned prefix", () => {
    assert.equal(idPrefixFor("Requirement"), "R");
    assert.equal(idPrefixFor("AcceptanceCriterion"), "AC");
    assert.equal(idPrefixFor("Assumption"), "AS");
  });

  test("answers for every type on the roster", () => {
    for (const entry of NODE_TYPES) {
      assert.equal(idPrefixFor(entry.name), entry.prefix, entry.name);
    }
  });

  test("answers null for a type that is not one of the 21", () => {
    assert.equal(idPrefixFor("Widget"), null);
  });
});

describe("formatNodeId", () => {
  test("pads to the width, so byte order and numeric order agree", () => {
    assert.equal(formatNodeId("R", 3), "R-0003");
    assert.equal(formatNodeId("AC", 42), "AC-0042");
    assert.equal(formatNodeId("R", ID_SEQUENCE_MAX), "R-9999");
    // Unpadded, `R-10` would sort ahead of `R-2` and quietly reorder a column.
    assert.deepEqual([formatNodeId("R", 10), formatNodeId("R", 2)].sort(), [
      "R-0002",
      "R-0010",
    ]);
  });

  test("does not truncate past the width, which is why the suggestion stops", () => {
    // The padding only ever adds. An ordinal that does not fit comes back
    // wider, sorting between `R-0999` and `R-1000`, so `nextIdSuggestion`
    // refuses rather than emitting one.
    assert.equal(formatNodeId("R", ID_SEQUENCE_MAX + 1), "R-10000");
    assert.equal(ID_SEQUENCE_WIDTH, 4);
  });
});

describe("nextIdSuggestion", () => {
  test("offers the first ordinal when the type has no ids yet", () => {
    assert.equal(nextIdSuggestion("Requirement", []), "R-0001");
  });

  test("offers one past the highest taken, not one past the last written", () => {
    // The list arrives in whatever order the store walked the folder, so the
    // highest is found rather than assumed to be last.
    assert.equal(
      nextIdSuggestion("Requirement", ["R-0009", "R-0003", "R-0007"]),
      "R-0010",
    );
  });

  test("reads only its own type's ids, and a longer prefix is a different type", () => {
    // `AC-0007` starts with the letter an Actor's ids start with, and the
    // separator is what keeps the two sequences apart.
    assert.equal(nextIdSuggestion("Actor", ["AC-0007", "AS-0004"]), "A-0001");
    assert.equal(nextIdSuggestion("AcceptanceCriterion", ["AC-0007"]), "AC-0008");
  });

  test("passes over an id that is not the type's own four digits", () => {
    // A hand-typed id should not push the next suggestion anywhere: too few
    // digits, too many, and four characters that are not digits at all.
    assert.equal(
      nextIdSuggestion("Requirement", [
        "R-10",
        "R-000012",
        "R-00x1",
        "R--001",
        "R-0002",
      ]),
      "R-0003",
    );
  });

  test("offers nothing for a type outside the canon", () => {
    // Empty means "you type one", which the form already handles, so this never
    // throws at a caller holding a string it got from somewhere else.
    assert.equal(nextIdSuggestion("Widget", ["W-0001"]), "");
  });

  test("offers nothing once the sequence has reached its last ordinal", () => {
    // `R-10000` would sort between `R-0999` and `R-1000`, so the sequence stops
    // at the width rather than breaking the order for every id after it.
    assert.equal(
      nextIdSuggestion("Requirement", [formatNodeId("R", ID_SEQUENCE_MAX)]),
      "",
    );
    assert.equal(
      nextIdSuggestion("Requirement", [formatNodeId("R", ID_SEQUENCE_MAX - 1)]),
      "R-9999",
    );
  });
});
