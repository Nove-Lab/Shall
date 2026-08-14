import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { TEXT_BYTE_CAP } from "./attributes.js";
import { judgeAttributes, judgeNodeId, judgeText } from "./validate.js";

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
 */

// Spelled with `fromCharCode` rather than as escapes so that what this file
// says and what it holds cannot drift apart in an editor that renders one.
const NUL = String.fromCharCode(0);
const LONE_SURROGATE = String.fromCharCode(0xd800);
const LINE_SEPARATOR = String.fromCharCode(0x2028);

/** A Requirement with every required slot filled and nothing wrong with it. */
const REQUIREMENT: Record<string, string> = {
  statement: "The daemon refuses a malformed id.",
  description: "Every door judges the id before it judges anything else.",
  requirement_type: "functional",
  priority: "high",
};

function filled(overrides: Record<string, string>): Record<string, string> {
  return { ...REQUIREMENT, ...overrides };
}

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

describe("judgeAttributes", () => {
  test("accepts a filled roster and answers with the filled slots only", () => {
    const judged = judgeAttributes(
      "Requirement",
      filled({ rationale: "   " }),
    );
    assert.deepEqual(judged.problems, []);
    assert.deepEqual(judged.values, REQUIREMENT);
  });

  test("refuses a type the canon does not have, and says nothing else", () => {
    const judged = judgeAttributes("Sandwich", { statement: "anything" });
    assert.deepEqual(judged.problems, ["Unknown node type: Sandwich"]);
    assert.deepEqual(judged.values, {});
  });

  test("refuses an attribute this type does not carry, in stored names", () => {
    const judged = judgeAttributes("Scenario", {
      priority: "high",
      scenario_type: "main",
      preconditions: "The cart holds at least one item.",
      steps: "The shopper opens the cart.",
      postconditions: "An order exists.",
    });
    assert.equal(
      judged.problems[0],
      "A Scenario does not carry priority. It carries scenario_type, preconditions, steps, postconditions and nothing else.",
    );
  });

  test("refuses a NUL in a slot, by the label a person is reading", () => {
    const judged = judgeAttributes(
      "Requirement",
      filled({ statement: `one${NUL}two` }),
    );
    assert.deepEqual(judged.problems, [
      "Statement cannot contain a NUL character.",
    ]);
  });

  test("refuses a lone surrogate in a slot", () => {
    const judged = judgeAttributes(
      "Requirement",
      filled({ description: `one${LONE_SURROGATE}two` }),
    );
    assert.deepEqual(judged.problems, ["Description is not well-formed text."]);
  });

  test("a slot refused for its characters is not also called empty", () => {
    const judged = judgeAttributes(
      "Requirement",
      filled({ statement: NUL }),
    );
    assert.deepEqual(judged.problems, [
      "Statement cannot contain a NUL character.",
    ]);
    assert.equal("statement" in judged.values, false);
  });

  test("names every empty required slot at once", () => {
    const judged = judgeAttributes("Requirement", {
      statement: "",
      description: "   ",
      requirement_type: "functional",
      priority: "high",
    });
    assert.deepEqual(judged.problems, [
      "A Requirement requires Statement, Description.",
    ]);
  });

  test("refuses a line break in a line value", () => {
    const judged = judgeAttributes(
      "Requirement",
      filled({ statement: "one\ntwo" }),
    );
    assert.deepEqual(judged.problems, [
      "Statement is one line, so it cannot contain a line break.",
    ]);
  });

  test("refuses U+2028 in a line value, which no file calls a line break", () => {
    const judged = judgeAttributes(
      "Requirement",
      filled({ statement: `one${LINE_SEPARATOR}two` }),
    );
    assert.deepEqual(judged.problems, [
      "Statement is one line, so it cannot contain a line break.",
    ]);
  });

  test("refuses a value past the byte cap", () => {
    const judged = judgeAttributes(
      "Requirement",
      filled({ description: "a".repeat(TEXT_BYTE_CAP + 1) }),
    );
    assert.deepEqual(judged.problems, [
      "Description cannot hold more than 256 KiB of text.",
    ]);
  });

  test("counts the cap in bytes and not in characters", () => {
    // Three bytes each, so a third of the cap plus one syllable is over it
    // while the character count is nowhere near.
    const judged = judgeAttributes(
      "Requirement",
      filled({ description: "가".repeat(Math.floor(TEXT_BYTE_CAP / 3) + 1) }),
    );
    assert.deepEqual(judged.problems, [
      "Description cannot hold more than 256 KiB of text.",
    ]);
  });

  test("refuses a choice outside its vocabulary, in stored spellings", () => {
    const judged = judgeAttributes(
      "Requirement",
      filled({ requirement_type: "urgent" }),
    );
    assert.deepEqual(judged.problems, [
      "Requirement Type must be one of functional, non_functional.",
    ]);
  });

  test('refuses a prose line beginning with "## "', () => {
    const judged = judgeAttributes(
      "Requirement",
      filled({ description: "Fine so far.\n## Not fine\nmore" }),
    );
    assert.deepEqual(judged.problems, [
      'Description cannot contain a line that begins with "## " — that is how a spec file names its sections.',
    ]);
  });

  test("allows the rest of markdown inside prose", () => {
    // Everything a section delimiter is not: a deeper heading, a horizontal
    // rule that looks like the frontmatter fence, a code fence, a `##` with no
    // space after it, and an indented one.
    const prose = "### A heading\n\n---\n\n```\ncode\n```\n\n##Nospace\n\n  ## indented";
    const judged = judgeAttributes(
      "Requirement",
      filled({ description: prose }),
    );
    assert.deepEqual(judged.problems, []);
    assert.equal(judged.values["description"], prose);
  });

  test('refuses "## " even inside a code fence, because the reader has no fences', () => {
    const judged = judgeAttributes(
      "Requirement",
      filled({ description: "```\n## Steps\n```" }),
    );
    assert.deepEqual(judged.problems, [
      'Description cannot contain a line that begins with "## " — that is how a spec file names its sections.',
    ]);
  });

  test("normalizes CRLF and lone CR in prose before judging it", () => {
    const judged = judgeAttributes(
      "Requirement",
      filled({ description: "one\r\ntwo\rthree" }),
    );
    assert.deepEqual(judged.problems, []);
    assert.equal(judged.values["description"], "one\ntwo\nthree");
  });

  test("keeps the indentation a prose value opens with", () => {
    // A trim takes the spaces off the first line and leaves them on the rest,
    // which turns a code block into a paragraph with three lines hanging off it.
    const block = "    const x = 1;\n    const y = 2;";
    const judged = judgeAttributes(
      "Requirement",
      filled({ description: `\n  \n${block}\n\n` }),
    );
    assert.deepEqual(judged.problems, []);
    assert.equal(judged.values["description"], block);
  });

  test("still drops a prose value that is nothing but blank lines", () => {
    const judged = judgeAttributes(
      "Requirement",
      filled({ description: "  \n\t\n \n" }),
    );
    assert.deepEqual(judged.problems, ["A Requirement requires Description."]);
  });

  test("trims a line value whole, because a scalar has no indentation to keep", () => {
    const judged = judgeAttributes(
      "Requirement",
      filled({ statement: "   The daemon refuses it.   " }),
    );
    assert.deepEqual(judged.problems, []);
    assert.equal(judged.values["statement"], "The daemon refuses it.");
  });

  test("discovers problems in the order the doors used to throw them", () => {
    const judged = judgeAttributes("Requirement", {
      owner: "someone",
      statement: `one${NUL}two`,
      description: "  ",
      requirement_type: "urgent",
      priority: "high",
    });
    assert.deepEqual(judged.problems, [
      "A Requirement does not carry owner. It carries statement, description, requirement_type, priority, rationale and nothing else.",
      "Statement cannot contain a NUL character.",
      "A Requirement requires Description.",
      "Requirement Type must be one of functional, non_functional.",
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
