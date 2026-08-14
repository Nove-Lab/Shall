import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { TEXT_BYTE_CAP, judgeBody, judgeNodeId, judgeText } from "./validate.js";

/**
 * The refusal sentences, held as goldens.
 *
 * These strings are the product. They were written to be read by a person in a
 * panel, they survived a storage pivot unchanged, and the only way that stays
 * true is if changing one of them breaks a test — so every sentence below is
 * written out in full rather than assembled from the same template the code
 * uses, which would agree with any wording at all.
 *
 * The ORDER is asserted too, and for the same reason: the daemon's write doors
 * throw `problems[0]`, so the first element of that array is the door's voice.
 *
 * WHAT IS NOT ASSERTED HERE IS THE POINT OF THE FILE. There is no test that a
 * body must open with a heading, carry a `## Definition`, or avoid a `---`,
 * because there is no such rule: the body is free markdown and the graph does
 * not read it. The `judgeBody` block below asserts that freedom directly, so a
 * shape rule sneaking back in fails a test instead of quietly narrowing what a
 * person may write.
 */

// Spelled with `fromCharCode` rather than as escapes so that what this file
// says and what it holds cannot drift apart in an editor that renders one.
const NUL = String.fromCharCode(0);
const LONE_SURROGATE = String.fromCharCode(0xd800);

describe("judgeText", () => {
  test("trims, because the stored bytes are what the panel showed", () => {
    assert.deepEqual(judgeText("Name", "  a name \n"), {
      value: "a name",
      problem: null,
    });
  });

  test("does not judge emptiness — its two callers answer that differently", () => {
    assert.deepEqual(judgeText("Name", "   "), { value: "", problem: null });
  });

  test("refuses a NUL", () => {
    assert.equal(
      judgeText("Statement", `before${NUL}after`).problem,
      "Statement cannot contain a NUL character.",
    );
  });

  test("refuses a lone surrogate", () => {
    assert.equal(
      judgeText("Statement", `before${LONE_SURROGATE}after`).problem,
      "Statement is not well-formed text.",
    );
  });
});

describe("judgeBody", () => {
  const NUL_SENTENCE = "The specification cannot contain a NUL character.";
  const NOT_WELL_FORMED = "The specification is not well-formed text.";
  const OVER_CAP = "The specification cannot hold more than 256 KiB of text.";

  test("hands back a well-formed body exactly as it was written", () => {
    const body = "The daemon refuses a malformed id.\n\nEvery door judges it.";
    assert.deepEqual(judgeBody(body), { value: body, problems: [] });
  });

  test("settles CRLF and a lone CR to LF, so a re-read is what was written", () => {
    // A body arrives from a Windows editor or a checkout with `core.autocrlf`
    // on. If a CR reached the stored value, the file's own re-read would differ
    // from what the judgement approved and the fixpoint would not hold.
    assert.deepEqual(judgeBody("one\r\ntwo\rthree"), {
      value: "one\ntwo\nthree",
      problems: [],
    });
  });

  test("drops blank lines at both edges, whitespace-only ones included", () => {
    // A line of nothing but spaces or a tab is what an editor leaves behind and
    // what nobody means, so it counts as blank at an edge.
    assert.equal(judgeBody("\n  \n\t\nThe body.\n \n\n").value, "The body.");
  });

  test("keeps a blank line inside, which is a paragraph break", () => {
    // Only the edges are settled. An interior blank line is the author's
    // punctuation, and markdown reads it as one.
    const body = "A first paragraph.\n\n\nA second, two blank lines later.";
    assert.equal(judgeBody(`\n${body}\n`).value, body);
  });

  test("keeps the indentation a body opens with", () => {
    // This is why the edges are settled as whole BLANK LINES and not with a
    // trim. A trim takes the four spaces off the FIRST line only, because that
    // is where the value starts, and leaves them on the rest — what comes back
    // is not a code block but a paragraph with a line hanging off it.
    const block = "    const x = 1;\n    const y = 2;";
    assert.deepEqual(judgeBody(`\n  \n${block}\n\n`), {
      value: block,
      problems: [],
    });
  });

  test("a body of nothing but blank lines is a node with nothing to say yet", () => {
    // Emptiness is not judged here. A node whose specification has not been
    // written is a node someone is still writing, not a refusal.
    assert.deepEqual(judgeBody("  \n\t\n \n"), { value: "", problems: [] });
  });

  test("refuses a NUL", () => {
    // A file holding one is not text: git reads a NUL and calls the file
    // binary, which costs this design the diff, the merge and the review that
    // are the whole reason the spec moved into the repository.
    assert.deepEqual(judgeBody(`before${NUL}after`).problems, [NUL_SENTENCE]);
  });

  test("refuses a lone surrogate", () => {
    // It has no UTF-8 encoding at all, so what lands in the file is U+FFFD and
    // the value read back is not the value written.
    assert.deepEqual(judgeBody(`before${LONE_SURROGATE}after`).problems, [
      NOT_WELL_FORMED,
    ]);
  });

  test("accepts a body of exactly the cap", () => {
    // The boundary is asserted from both sides, because a cap tested only from
    // above agrees with an off-by-one that costs a person the last byte.
    assert.deepEqual(judgeBody("a".repeat(TEXT_BYTE_CAP)).problems, []);
  });

  test("refuses a body one byte past the cap", () => {
    assert.deepEqual(judgeBody("a".repeat(TEXT_BYTE_CAP + 1)).problems, [
      OVER_CAP,
    ]);
  });

  test("counts the cap in bytes and not in characters", () => {
    // One Korean syllable is three bytes, and the cap is a cap on the file.
    // Both bodies below are nowhere near 262144 CHARACTERS; one of them is
    // exactly 262144 bytes and the next character past it is the refusal.
    const syllables = Math.floor(TEXT_BYTE_CAP / 3);
    const atCap = `${"가".repeat(syllables)}a`;
    assert.equal(new TextEncoder().encode(atCap).length, TEXT_BYTE_CAP);
    assert.equal(atCap.length < TEXT_BYTE_CAP, true);
    assert.deepEqual(judgeBody(atCap).problems, []);
    assert.deepEqual(judgeBody(`${atCap}a`).problems, [OVER_CAP]);
  });

  test("measures the cap on the settled value and not on what arrived", () => {
    // The blank lines are dropped before anything is weighed, so a paste that
    // came with trailing newlines is not refused for bytes that will never
    // reach the file.
    const padded = `\n\n\n${"a".repeat(TEXT_BYTE_CAP)}\n\n\n`;
    assert.equal(padded.length > TEXT_BYTE_CAP, true);
    assert.deepEqual(judgeBody(padded).problems, []);
  });

  test("has no opinion about the shape of the markdown, which is the point", () => {
    // Everything a previous storage shape refused, all at once: the `## `
    // heading that used to delimit a section, the `---` that used to fence
    // frontmatter, a top-level heading, a repeated section name, a table and a
    // fence with a heading inside it. The body is the specification and it
    // belongs to whoever writes it, so none of this is the graph's business.
    const body = [
      "---",
      "",
      "# A top-level heading",
      "",
      "## Definition",
      "A term the graph never reads.",
      "",
      "## Definition",
      "Said twice, because the author wanted it twice.",
      "",
      "---",
      "",
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "```",
      "## even inside a fence",
      "---",
      "```",
    ].join("\n");
    assert.deepEqual(judgeBody(body), { value: body, problems: [] });
  });

  test("collects both problems in the order a person can act on them", () => {
    // `judgeBody` collects and never throws, because the loader is reading a
    // file a person or an agent hand-edited and wants everything wrong with it
    // in one pass. The write door takes `problems[0]` and that is its refusal,
    // so the character it cannot store is named before the size it cannot hold.
    assert.deepEqual(judgeBody(`${NUL}${"a".repeat(TEXT_BYTE_CAP + 1)}`).problems, [
      NUL_SENTENCE,
      OVER_CAP,
    ]);
  });
});

describe("judgeNodeId", () => {
  const SHAPE =
    "An id uses letters, digits, dots, hyphens and underscores, starts with a letter or digit, and holds at most 64 characters.";

  for (const id of [
    "R-0001",
    "A",
    "0",
    "a.b",
    "A_b-c.d",
    "CONS",
    "COM0",
    `R-${"0".repeat(62)}`,
  ]) {
    test(`accepts ${id.length > 20 ? "a 64-character id" : id}`, () => {
      assert.equal(judgeNodeId(id), null);
    });
  }

  for (const id of [
    "",
    "-R-0001",
    ".hidden",
    "_leading",
    "R 0001",
    "R/0001",
    "R:0001",
    "요구-0001",
    "R-0001\n",
    `R-${"0".repeat(63)}`,
  ]) {
    test(`refuses ${JSON.stringify(id)} by its shape`, () => {
      assert.equal(judgeNodeId(id), SHAPE);
    });
  }

  test("refuses a trailing dot", () => {
    assert.equal(
      judgeNodeId("R-0001."),
      "An id cannot end with a dot, because a name ending in a dot does not survive the trip to every machine this repository is cloned to.",
    );
  });

  for (const id of ["CON", "con", "NUL", "Aux", "com1", "LPT9", "PRN.md"]) {
    test(`refuses ${id}, which Windows keeps for a device`, () => {
      const head = id.split(".")[0];
      assert.equal(
        judgeNodeId(id),
        `${head} is a reserved device name on Windows, so no file can be named after it. Choose another id.`,
      );
    });
  }
});
