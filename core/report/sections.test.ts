import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { firstLineOf, partsOf } from "./sections.js";

/**
 * THE SPLITTER PROMISES TWO THINGS AND THESE HOLD IT TO BOTH. A body handed
 * back through `partsOf` is the body again minus its `##` lines — nothing
 * dropped, nothing reflowed, nothing invented — and a heading that is not
 * there answers null rather than the first thing that looked close.
 *
 * THE FENCE CASES ARE THE REASON THE WALK EXISTS. A body quotes markdown at
 * least as often as it writes it, and a `##` inside a code block that split a
 * section would silently cut a quoted document in half.
 */

/** The body with its `##` lines struck out — what the parts must rejoin to. */
function withoutHeadings(body: string): string {
  return body
    .split("\n")
    .filter((line) => !/^##\s+/.test(line))
    .join("\n");
}

describe("partsOf", () => {
  test("answers one null-heading part for a body with no headings", () => {
    const body = "A paragraph.\n\nAnd another, with a # that is not a heading.\n";
    assert.deepEqual(partsOf(body), [{ heading: null, markdown: body }]);
  });

  test("answers nothing for an empty body", () => {
    // Nothing to say and no heading to say it under: the caller renders
    // nothing rather than an empty section.
    assert.deepEqual(partsOf(""), []);
    assert.deepEqual(partsOf("\n  \n"), []);
  });

  test("keeps the text before the first heading under a null heading", () => {
    const parts = partsOf("Preamble.\n\n## Detail\nUnder the heading.\n");
    assert.deepEqual(parts, [
      { heading: null, markdown: "Preamble.\n" },
      { heading: "Detail", markdown: "Under the heading.\n" },
    ]);
  });

  test("names a heading trimmed of its marker and its trailing space", () => {
    const parts = partsOf("##   User Prompt   \nasked\n");
    assert.deepEqual(parts, [{ heading: "User Prompt", markdown: "asked\n" }]);
  });

  test("keeps an empty section, because the heading itself was written", () => {
    const parts = partsOf("## Notes\n\n## Result\ndone\n");
    assert.deepEqual(parts, [
      { heading: "Notes", markdown: "" },
      { heading: "Result", markdown: "done\n" },
    ]);
  });

  test("rejoins losslessly: the parts are the body minus the heading lines", () => {
    const body = [
      "Preamble line.",
      "",
      "## First",
      "alpha",
      "",
      "    indented block",
      "## Second",
      "",
      "beta",
      "",
    ].join("\n");
    const rejoined = partsOf(body)
      .map((part) => part.markdown)
      .join("\n");
    assert.equal(rejoined, withoutHeadings(body));
  });

  test("reads a ## inside a backtick fence as content", () => {
    const body = ["Shows the shape:", "", "```md", "## Not a heading", "text", "```", ""].join("\n");
    const parts = partsOf(body);
    assert.equal(parts.length, 1);
    assert.equal(parts[0]!.heading, null);
    assert.equal(parts[0]!.markdown, body);
  });

  test("reads a ## inside a tilde fence as content", () => {
    const body = ["~~~", "## Still content", "~~~", "", "## A real heading", "after", ""].join("\n");
    const parts = partsOf(body);
    assert.deepEqual(
      parts.map((part) => part.heading),
      [null, "A real heading"],
    );
    assert.match(parts[0]!.markdown, /## Still content/);
    assert.equal(parts[1]!.markdown, "after\n");
  });

  test("closes a fence on a longer marker of the same character", () => {
    const body = ["```", "## inside", "````", "## outside", ""].join("\n");
    assert.deepEqual(
      partsOf(body).map((part) => part.heading),
      [null, "outside"],
    );
  });

  test("does not close a fence on a shorter marker", () => {
    // Four backticks opened it, so three do not shut it and everything after
    // stays content.
    const body = ["````", "```", "## still inside", "````", "## outside", ""].join("\n");
    const parts = partsOf(body);
    assert.deepEqual(
      parts.map((part) => part.heading),
      [null, "outside"],
    );
    assert.match(parts[0]!.markdown, /## still inside/);
  });

  test("does not close a fence on a marker of the other character", () => {
    const body = ["```", "~~~", "## inside", "```", "## outside", ""].join("\n");
    assert.deepEqual(
      partsOf(body).map((part) => part.heading),
      [null, "outside"],
    );
  });

  test("splits at ## and at nothing deeper or shallower", () => {
    const body = ["# Title", "### Deeper", "#Tight", "## Real", "under", ""].join("\n");
    const parts = partsOf(body);
    assert.deepEqual(
      parts.map((part) => part.heading),
      [null, "Real"],
    );
    assert.equal(parts[0]!.markdown, "# Title\n### Deeper\n#Tight");
    assert.equal(parts[1]!.markdown, "under\n");
  });
});

describe("firstLineOf", () => {
  const body = [
    "Preamble.",
    "",
    "## User Prompt",
    "",
    "  Draw me the report.  ",
    "and then some",
    "",
    "## Empty Section",
    "",
    "   ",
    "",
  ].join("\n");

  test("answers the first non-empty line, trimmed", () => {
    assert.equal(firstLineOf(body, "User Prompt"), "Draw me the report.");
  });

  test("matches the heading case-insensitively and trimmed", () => {
    assert.equal(firstLineOf(body, "  user prompt  "), "Draw me the report.");
    assert.equal(firstLineOf("## user prompt\nasked\n", "User Prompt"), "asked");
  });

  test("answers null when the heading is not there", () => {
    assert.equal(firstLineOf(body, "Scenario Type"), null);
    assert.equal(firstLineOf("no headings at all\n", "User Prompt"), null);
  });

  test("answers null when the section has nothing under it", () => {
    assert.equal(firstLineOf(body, "Empty Section"), null);
  });

  test("never answers the text before the first heading", () => {
    // The null-heading part is not a section anybody named.
    assert.equal(firstLineOf("Preamble.\n", "Preamble."), null);
  });
});
