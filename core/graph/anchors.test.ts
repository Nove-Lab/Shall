import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ANCHOR_RULES,
  anchorPhrase,
  anchorsFor,
  isColored,
  isRootless,
  orphanStem,
} from "./anchors.js";
import { NODE_TYPES } from "./canon.js";
import { CLOSURE_KINDS, closureKindNamed, closureKindOf } from "./closure-kinds.js";
import { EDGE_GRAMMAR, isPermittedTriple } from "./grammar.js";

/**
 * The anchor table is hand-transcribed, so the tests below are what makes it
 * trustworthy rather than merely plausible.
 *
 * TWO OF THEM ARE THE REASON THIS FILE EXISTS. One walks the table against the
 * canon's roster, so a type added to `NODE_TYPES` cannot slip through without an
 * answer to "what holds it". The other walks every anchor against
 * `EDGE_GRAMMAR` in the direction the row wrote, so an anchor naming a relation
 * that could never reach a node of that type — a typo, a direction flipped —
 * fails here instead of turning a healthy node red on somebody's screen.
 */

describe("ANCHOR_RULES", () => {
  test("answers for every canon type and for no others", () => {
    // Sets rather than lists, because the roster's order is the canon's and this
    // table's order is only a convenience for reading the two side by side.
    const rows = new Set(ANCHOR_RULES.map((rule) => rule.type));
    const canon = new Set(NODE_TYPES.map((entry) => entry.name));
    assert.deepEqual(rows, canon);
    // Length as well as membership: a duplicated row would be invisible above.
    assert.equal(ANCHOR_RULES.length, NODE_TYPES.length);
  });

  for (const rule of ANCHOR_RULES) {
    for (const anchor of rule.anchors) {
      test(`${rule.type} is anchored by a ${anchor.edgeType} the grammar allows ${anchor.direction === "in" ? "into" : "out of"} it`, () => {
        const allowed = EDGE_GRAMMAR.some((row) =>
          anchor.direction === "in"
            ? row.edgeType === anchor.edgeType && row.toType === rule.type
            : row.edgeType === anchor.edgeType && row.fromType === rule.type,
        );
        assert.equal(allowed, true);
      });
    }
  }

  test("leaves rootless exactly the three the canon starts from, and the journal that starts the record", () => {
    // Written out rather than derived, because deriving it from the same table
    // the code reads would agree with any table at all. The three are where a
    // specification begins — a word, a thing, a goal — and the journal is where
    // the execution record begins; everything else in the record is held by
    // the work log that submitted or recorded it.
    assert.deepEqual(
      ANCHOR_RULES.filter((rule) => isRootless(rule.type)).map(
        (rule) => rule.type,
      ),
      ["Term", "DomainEntity", "Goal", "Journal"],
    );
  });

  test("does not call a type it has never heard of rootless", () => {
    // Both answer with no anchors, and only one of them may stand alone.
    assert.deepEqual(anchorsFor("Widget"), []);
    assert.equal(isRootless("Widget"), false);
    assert.equal(isRootless("Goal"), true);
  });
});

describe("isColored", () => {
  for (const entry of NODE_TYPES) {
    test(`${entry.name} is coloured, because every canon type is read by a person`, () => {
      assert.equal(isColored(entry.name), true);
    });
  }

  test("a type nothing knows has no colour to be asked about", () => {
    assert.equal(isColored("Widget"), false);
  });
});

describe("anchorPhrase", () => {
  test("reads as English for one anchor", () => {
    assert.equal(anchorPhrase("Requirement"), "a REQUIRES relation into it");
  });

  test("reads as a choice for two, and takes its article from the first", () => {
    assert.equal(
      anchorPhrase("Interface"),
      "an EXPOSES or CONSUMES relation into it",
    );
  });

  test("says which way the relation runs, which for a Decision is outward", () => {
    assert.equal(
      anchorPhrase("Decision"),
      "a RESOLVES or AFFECTS relation out of it",
    );
  });

  test("joins both directions when a type is held either way, as Evidence is", () => {
    // The row the doc comment promised would still read as one sentence: a
    // work log reaching in, or the evidence's own claim reaching out.
    assert.equal(
      anchorPhrase("Evidence"),
      "a SUBMITS relation into it or a CLAIMS relation out of it",
    );
  });

  test("has nothing to say about a type that anchors nothing", () => {
    // A caller writes the whole sentence or none of it — an empty fragment
    // dropped into one would read as a sentence with a hole in it.
    assert.equal(anchorPhrase("Goal"), null);
    assert.equal(anchorPhrase("Widget"), null);
  });
});

describe("orphanStem", () => {
  test("names the node, its type and what would have held it", () => {
    assert.equal(
      orphanStem("R-0001", "Requirement"),
      "R-0001 is a Requirement with no live anchor — it is held to the graph by a REQUIRES relation into it, and none stands",
    );
  });

  test("says so plainly for a type the canon anchors by nothing", () => {
    // A rootless type cannot be an orphan, so this is only ever reached for a
    // type outside the canon — and the clause still has to read as English.
    assert.equal(
      orphanStem("W-0001", "Widget"),
      "W-0001 is a Widget with no live anchor — it is held to the graph by nothing the canon names, and none stands",
    );
  });

  test("stops before the full stop, so each caller writes its own tail", () => {
    const stem = orphanStem("EV-0001", "Evidence");
    assert.equal(stem.endsWith("and none stands"), true);
    assert.equal(
      stem,
      "EV-0001 is a Evidence with no live anchor — it is held to the graph by a SUBMITS relation into it or a CLAIMS relation out of it, and none stands",
    );
  });
});

describe("CLOSURE_KINDS", () => {
  test("names two subjects, and each of them once", () => {
    assert.deepEqual(
      CLOSURE_KINDS.map((entry) => entry.kind),
      ["criterion", "task"],
    );
  });

  for (const entry of CLOSURE_KINDS) {
    test(`a ${entry.claimantType} may draw the ${entry.claim} that claims a ${entry.subjectType}`, () => {
      // The claim is a canon row read in the direction this table wrote it, so
      // a relation the grammar does not allow — or a direction flipped — fails
      // here rather than leaving a subject nothing can ever close.
      assert.equal(
        isPermittedTriple(entry.claimantType, entry.subjectType, entry.claim),
        true,
      );
    });

    test(`${entry.claimantType} is anchored by its own ${entry.claim}`, () => {
      // The claim runs FROM the claimant in both rows, which is what keeps a
      // new claim out of the subject's file — and the anchor table is where
      // that direction is already written down.
      assert.equal(
        anchorsFor(entry.claimantType).some(
          (anchor) =>
            anchor.direction === "out" && anchor.edgeType === entry.claim,
        ),
        true,
      );
    });
  }

  test("answers for the two subject types and for nothing else", () => {
    assert.equal(closureKindOf("AcceptanceCriterion")?.kind, "criterion");
    assert.equal(closureKindOf("ImplementationTask")?.kind, "task");
    assert.equal(closureKindOf("Evidence"), null);
    assert.equal(closureKindOf("Widget"), null);
  });

  test("finds a row back from the tag a record carries", () => {
    assert.equal(closureKindNamed("task").subjectType, "ImplementationTask");
    assert.equal(closureKindNamed("criterion").claim, "CLAIMS");
  });
});
