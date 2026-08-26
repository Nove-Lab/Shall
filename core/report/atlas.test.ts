import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NODE_TYPES } from "../graph/canon.js";
import { chapterFileOf, hasOwnPage, homeOf, hrefFrom, owningChapterOf, pageFileOf } from "./atlas.js";

/**
 * NO TYPE MAY BE HOMELESS. The atlas is the report's only answer to "where is
 * this node shown", and a canon type it has no row for would be a node the
 * report links at and never draws — so the roster itself is the test's input,
 * and a twenty-second type arriving upstream fails here before it can ship a
 * report with a dead link in it.
 *
 * EVERY NODE NOW HAS A PAGE. There are no chapter-anchored homes left: a
 * chapter is a table of rows, and a node's content lives at `nodes/<id>.html`,
 * so every home is that file with no anchor to disambiguate. What a chapter
 * still owns is the page's back link, which is what `owningChapterOf` answers.
 *
 * THE HREF ARITHMETIC IS PLAIN SEGMENT WALKING, deliberately, so the emitted
 * files read the same from `file://` and behind the daemon's route. Every
 * direction a page actually links in — index to chapter, chapter to chapter,
 * up to a node page, back down, and the stylesheet — is spelled out below.
 */

describe("homeOf", () => {
  test("sends every one of the canon's types to a page of its own", () => {
    assert.equal(NODE_TYPES.length, 21);
    for (const entry of NODE_TYPES) {
      assert.deepEqual(
        homeOf("X-0001", entry.name),
        { file: "nodes/X-0001.html", anchor: null },
        entry.name,
      );
    }
  });

  test("names the page after the id it was asked about", () => {
    assert.deepEqual(homeOf("T-0001", "Term"), { file: "nodes/T-0001.html", anchor: null });
    assert.deepEqual(homeOf("R-0001", "Requirement"), {
      file: "nodes/R-0001.html",
      anchor: null,
    });
    assert.deepEqual(homeOf("AC-0001", "AcceptanceCriterion"), {
      file: "nodes/AC-0001.html",
      anchor: null,
    });
  });

  test("answers null for a type outside the canon", () => {
    // The renderer draws such a link as plain text; guessing a file would emit
    // a link at a page nothing writes.
    assert.equal(homeOf("Z-0001", "Zebra"), null);
    assert.equal(homeOf("Z-0001", ""), null);
  });

  test("inherits no home off Object's prototype", () => {
    // A type called "toString" must miss, not answer with whatever `in` finds
    // up the prototype chain.
    assert.equal(homeOf("X-0001", "toString"), null);
    assert.equal(homeOf("X-0001", "constructor"), null);
  });
});

describe("hasOwnPage", () => {
  test("is true for all twenty-one canon types", () => {
    const paged = NODE_TYPES.filter((entry) => hasOwnPage(entry.name));
    assert.equal(paged.length, 21);
    assert.equal(paged.length, NODE_TYPES.length);
  });

  test("is false for anything the canon does not name", () => {
    assert.equal(hasOwnPage("Zebra"), false);
    assert.equal(hasOwnPage(""), false);
  });

  test("is false for a name that only the prototype answers to", () => {
    assert.equal(hasOwnPage("toString"), false);
    assert.equal(hasOwnPage("constructor"), false);
    assert.equal(hasOwnPage("hasOwnProperty"), false);
  });
});

describe("owningChapterOf", () => {
  test("gives each chapter's types back to the chapter that assembles them", () => {
    assert.equal(owningChapterOf("Term"), "01-terms");
    assert.equal(owningChapterOf("Goal"), "02-goals");
    assert.equal(owningChapterOf("Scenario"), "03-actors");
    assert.equal(owningChapterOf("SystemResponsibility"), "04-responsibilities");
    assert.equal(owningChapterOf("AcceptanceCriterion"), "05-requirements");
    assert.equal(owningChapterOf("Decision"), "06-design");
    assert.equal(owningChapterOf("Journal"), "07-progress");
  });

  test("names, for every canon type, a chapter that has a file", () => {
    for (const entry of NODE_TYPES) {
      const owner = owningChapterOf(entry.name);
      assert.notEqual(owner, null, entry.name);
      assert.match(chapterFileOf(owner!), /^chapters\/\d\d-[a-z-]+\.html$/, entry.name);
    }
  });

  test("answers null for a type outside the canon, prototype names included", () => {
    assert.equal(owningChapterOf("Zebra"), null);
    assert.equal(owningChapterOf("toString"), null);
  });
});

describe("pageFileOf", () => {
  test("gives the node pages their path from one place", () => {
    assert.equal(pageFileOf("J-0007"), "nodes/J-0007.html");
    assert.equal(pageFileOf("AC-0001"), "nodes/AC-0001.html");
  });
});

describe("chapterFileOf", () => {
  test("refuses a slug no chapter answers to", () => {
    assert.throws(() => chapterFileOf("08-appendix"), /No chapter is called 08-appendix/);
  });
});

describe("hrefFrom", () => {
  test("walks down from the index into a chapter", () => {
    assert.equal(
      hrefFrom("index.html", { file: "chapters/01-terms.html", anchor: null }),
      "chapters/01-terms.html",
    );
  });

  test("walks sideways between two chapters", () => {
    assert.equal(
      hrefFrom("chapters/01-terms.html", { file: "chapters/02-goals.html", anchor: null }),
      "02-goals.html",
    );
    assert.equal(
      hrefFrom("chapters/01-terms.html", { file: "chapters/02-goals.html", anchor: "G-0001" }),
      "02-goals.html#G-0001",
    );
  });

  test("walks up from a chapter to the index", () => {
    assert.equal(
      hrefFrom("chapters/02-goals.html", { file: "index.html", anchor: null }),
      "../index.html",
    );
  });

  test("walks up and over from a chapter to a node page", () => {
    assert.equal(
      hrefFrom("chapters/05-requirements.html", { file: "nodes/AC-0001.html", anchor: null }),
      "../nodes/AC-0001.html",
    );
  });

  test("walks back from a node page to the chapter that owns it", () => {
    assert.equal(
      hrefFrom("nodes/AC-0001.html", { file: "chapters/05-requirements.html", anchor: null }),
      "../chapters/05-requirements.html",
    );
    assert.equal(
      hrefFrom("nodes/AC-0001.html", { file: "chapters/05-requirements.html", anchor: "R-0001" }),
      "../chapters/05-requirements.html#R-0001",
    );
  });

  test("says only the anchor for a link into the file it stands in", () => {
    assert.equal(
      hrefFrom("chapters/05-requirements.html", {
        file: "chapters/05-requirements.html",
        anchor: "R-0001",
      }),
      "#R-0001",
    );
  });

  test("says the file's own name when it points at itself with no anchor", () => {
    assert.equal(
      hrefFrom("chapters/05-requirements.html", {
        file: "chapters/05-requirements.html",
        anchor: null,
      }),
      "05-requirements.html",
    );
  });

  test("reaches the stylesheet from every depth the report emits", () => {
    const css = { file: "assets/report.css", anchor: null };
    assert.equal(hrefFrom("chapters/01-terms.html", css), "../assets/report.css");
    assert.equal(hrefFrom("nodes/AC-0001.html", css), "../assets/report.css");
    assert.equal(hrefFrom("index.html", css), "assets/report.css");
  });

  test("resolves a node's home the way the renderer will", () => {
    const home = homeOf("T-0001", "Term")!;
    assert.equal(hrefFrom("chapters/05-requirements.html", home), "../nodes/T-0001.html");
    assert.equal(hrefFrom("nodes/AC-0001.html", home), "T-0001.html");
    assert.equal(hrefFrom("index.html", home), "nodes/T-0001.html");
  });
});
