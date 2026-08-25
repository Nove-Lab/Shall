import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { lineDiff, linesOf, wholeFile, type DiffRow } from "./diff";

/**
 * WHAT THE LINE DIFF PROMISES: the two files as one list of rows, a deletion
 * above its replacement, and — over the cell cap — an answer that says less and
 * still says nothing false. The rows are written out as `kind:text` pairs
 * because that is the whole of what the screen reads off them.
 */
function shape(rows: readonly DiffRow[]): string[] {
  return rows.map((row) => `${row.kind}:${row.text}`);
}

describe("linesOf", () => {
  test("a file with nothing in it is no lines, and not one empty one", () => {
    assert.deepEqual(linesOf(""), []);
  });

  test("the one newline that terminates the last line is dropped", () => {
    assert.deepEqual(linesOf("one\ntwo\n"), ["one", "two"]);
    assert.deepEqual(linesOf("one\ntwo"), ["one", "two"]);
  });

  test("a second trailing newline is a real blank line and stays", () => {
    assert.deepEqual(linesOf("one\n\n"), ["one", ""]);
    assert.deepEqual(linesOf("\n"), [""]);
  });

  test("carriage returns are settled first, so a checkout is not reported as an edit", () => {
    assert.deepEqual(linesOf("one\r\ntwo\r\n"), ["one", "two"]);
    assert.deepEqual(linesOf("one\r\ntwo"), linesOf("one\ntwo"));
  });
});

describe("lineDiff", () => {
  test("two identical files are all unchanged", () => {
    assert.deepEqual(shape(lineDiff("one\ntwo\n", "one\ntwo\n")), [
      "same:one",
      "same:two",
    ]);
  });

  test("a line added in the middle is one added row", () => {
    assert.deepEqual(shape(lineDiff("one\nthree\n", "one\ntwo\nthree\n")), [
      "same:one",
      "add:two",
      "same:three",
    ]);
  });

  test("a line removed from the middle is one deleted row", () => {
    assert.deepEqual(shape(lineDiff("one\ntwo\nthree\n", "one\nthree\n")), [
      "same:one",
      "del:two",
      "same:three",
    ]);
  });

  test("on a replacement the deletion comes first, so the change reads as one line", () => {
    assert.deepEqual(shape(lineDiff("one\nold\nthree\n", "one\nnew\nthree\n")), [
      "same:one",
      "del:old",
      "add:new",
      "same:three",
    ]);
  });

  test("whichever file outlasts the other has its tail all one kind", () => {
    assert.deepEqual(shape(lineDiff("one\n", "one\ntwo\nthree\n")), [
      "same:one",
      "add:two",
      "add:three",
    ]);
    assert.deepEqual(shape(lineDiff("one\ntwo\nthree\n", "one\n")), [
      "same:one",
      "del:two",
      "del:three",
    ]);
  });

  test("an empty side is the whole of the other side, one way or the other", () => {
    assert.deepEqual(shape(lineDiff("", "one\ntwo\n")), ["add:one", "add:two"]);
    assert.deepEqual(shape(lineDiff("one\ntwo\n", "")), ["del:one", "del:two"]);
    assert.deepEqual(lineDiff("", ""), []);
  });

  test("the longest common subsequence is kept, not the first match", () => {
    assert.deepEqual(shape(lineDiff("a\nb\nc\nd\n", "b\nd\ne\n")), [
      "del:a",
      "same:b",
      "del:c",
      "same:d",
      "add:e",
    ]);
  });

  test("over the cell cap the answer is the whole of one file and then the other", () => {
    // 2001 against 2001 is 4 004 001 cells, which is past the cap; the same two
    // files one line shorter each are not, and are diffed properly.
    const before = Array.from({ length: 2001 }, (_, index) => `line ${String(index)}`).join("\n");
    const after = `${before}\nlast`;
    const coarse = lineDiff(before, after);
    assert.equal(coarse.length, 2001 + 2002);
    assert.deepEqual(new Set(coarse.slice(0, 2001).map((row) => row.kind)), new Set(["del"]));
    assert.deepEqual(new Set(coarse.slice(2001).map((row) => row.kind)), new Set(["add"]));
  });
});

describe("wholeFile", () => {
  test("every line unchanged, for the case with nothing to compare against", () => {
    assert.deepEqual(shape(wholeFile("one\ntwo\n")), ["same:one", "same:two"]);
    assert.deepEqual(wholeFile(""), []);
  });
});
