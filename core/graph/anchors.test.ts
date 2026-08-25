import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ANCHOR_RULES,
  anchorPhrase,
  anchorsFor,
  isColored,
  isRootless,
  orphanFixSentence,
  orphanStem,
} from "./anchors.js";
import { articleFor, openingArticleFor } from "./article.js";
import { NODE_TYPES } from "./canon.js";
import { CLOSURE_KINDS, closureKindNamed, closureKindOf } from "./closure-kinds.js";
import type { ClosureSubject } from "./closure-kinds.js";
import { EDGE_GRAMMAR, EDGE_TYPE_NAMES, isPermittedTriple } from "./grammar.js";

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
 *
 * THE GRAMMAR IS HAND-TRANSCRIBED TOO, and no other file counts it. The
 * `EDGE_GRAMMAR` block below is where its shape is written out by hand — how
 * many rows, how many names, which types a decision may revise, and the two
 * names nothing may answer to — because a table is the one thing that cannot
 * be checked against itself.
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

  test("leaves rootless the three the canon starts from, the journal that starts the record, and the finding that may start outside it", () => {
    // Written out rather than derived, because deriving it from the same table
    // the code reads would agree with any table at all. The three are where a
    // specification begins — a word, a thing, a goal — and the journal is where
    // the execution record begins. The finding is there for a different reason:
    // its belonging follows its birth, so one made mid-turn is recorded by that
    // work log and one brought between turns is held by nothing. The rest of
    // the record is held by the work log that logged it, or — evidence and
    // reports — by its own claim.
    assert.deepEqual(
      ANCHOR_RULES.filter((rule) => isRootless(rule.type)).map(
        (rule) => rule.type,
      ),
      ["Term", "DomainEntity", "Goal", "Journal", "Finding"],
    );
  });

  test("holds a Finding by nothing, and it points at nothing", () => {
    // Nothing has to reach a finding and nothing may leave one: the canon gives
    // it no outgoing relation at all, so the ids it concerns sit in its own
    // frontmatter where nothing resolves them and a dangling one is not a
    // fault. The empty filter is the executable half of that sentence — a
    // relation drawn out of a finding would have to be invented here first.
    assert.deepEqual(anchorsFor("Finding"), []);
    assert.equal(isRootless("Finding"), true);
    assert.deepEqual(
      EDGE_GRAMMAR.filter((row) => row.fromType === "Finding"),
      [],
    );
    // ROOTLESS IS NOT RETIRED. A work log still records the findings its turn
    // of work made, and that is still the only relation the canon points at a
    // finding with — what changed is that a finding no longer has to be on the
    // far end of one.
    assert.deepEqual(
      EDGE_GRAMMAR.filter((row) => row.edgeType === "RECORDS"),
      [{ fromType: "WorkLog", toType: "Finding", edgeType: "RECORDS" }],
    );
  });

  test("does not call a type it has never heard of rootless", () => {
    // Both answer with no anchors, and only one of them may stand alone.
    assert.deepEqual(anchorsFor("Widget"), []);
    assert.equal(isRootless("Widget"), false);
    assert.equal(isRootless("Goal"), true);
  });
});

describe("EDGE_GRAMMAR", () => {
  test("is 74 rows under 28 names, and answers to neither ESCALATES nor RAISES", () => {
    // The counts are a hand-written pair because membership alone is blind to
    // a row added beside a row removed. The two names are written out for the
    // opposite reason: they are the ones an old file, an old ledger or an old
    // habit will reach back for, and a row put under either has to be invented
    // here before it can reach a node. Nothing raises a question — the canon
    // has no node to park one in — and a finding escalates nothing, because it
    // starts no relation at all.
    assert.equal(EDGE_GRAMMAR.length, 74);
    assert.equal(EDGE_TYPE_NAMES.length, 28);
    for (const name of ["ESCALATES", "RAISES"]) {
      assert.equal(EDGE_TYPE_NAMES.includes(name), false);
      assert.equal(
        EDGE_GRAMMAR.some((row) => row.edgeType === name),
        false,
      );
    }
  });

  test("lets a Decision AFFECTS every type of the three living bands and no record", () => {
    // Written out by hand and in the table's own order, for the reason the
    // rootless list is: a set read back out of the canon's roster would agree
    // with any table at all, including one that let a decision revise a work
    // log. What is absent is the point of the list — `Decision` itself, so
    // that two of them cannot anchor each other while revising nothing, and
    // every Execution type, because what happened is not revised by deciding
    // something afterwards.
    const affects = EDGE_GRAMMAR.filter((row) => row.edgeType === "AFFECTS");
    assert.deepEqual(
      affects.map((row) => row.toType),
      [
        "Term",
        "DomainEntity",
        "Goal",
        "Actor",
        "UseCase",
        "Scenario",
        "SystemResponsibility",
        "Requirement",
        "AcceptanceCriterion",
        "Constraint",
        "Assumption",
        "Module",
        "Interface",
        "DataSchema",
        "WorkItem",
      ],
    );
    // One source, so the fifteen above are the whole of the edge.
    assert.deepEqual(
      new Set(affects.map((row) => row.fromType)),
      new Set(["Decision"]),
    );
  });

  test("gives RESOLVES one row, and it is the row no anchor counts", () => {
    // Nothing holds a decision by it, which is what makes answering no finding
    // legal: a revision somebody simply wanted is as good a reason as one an
    // agent reported, and three findings answered at once are still one
    // decision. It is also the one row that runs from the specification into
    // the record, which is why a bundle stops here rather than dragging a work
    // report into a spec approval.
    assert.deepEqual(
      EDGE_GRAMMAR.filter((row) => row.edgeType === "RESOLVES"),
      [{ fromType: "Decision", toType: "Finding", edgeType: "RESOLVES" }],
    );
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

  test("holds a Decision outward, by what it revises and not by what it answers", () => {
    // AFFECTS alone, and this sentence is where the canon's "at least one"
    // reaches a person: a decision that revises nothing is not a decision,
    // while one that answers no finding is merely a revision somebody wanted.
    assert.equal(anchorPhrase("Decision"), "an AFFECTS relation out of it");
  });

  test("joins both directions when a type is held either way, as a WorkLog is", () => {
    // The row the doc comment promised would still read as one sentence: a
    // journal reaching in, or the log's own addressing reaching out.
    assert.equal(
      anchorPhrase("WorkLog"),
      "a LOGS relation into it or an ADDRESSES relation out of it",
    );
  });

  test("holds an Evidence by its claim alone — the submitter says who brought it, not what it is about", () => {
    assert.equal(anchorPhrase("Evidence"), "a CLAIMS relation out of it");
  });

  test("holds a work item by the module that allocates it, and by nothing else", () => {
    // Its own TARGETS line aims and does not hold: a work item belongs to a
    // module by definition, so a work item no module allocates is an orphan
    // however many criteria it targets — and the phrase says only the one
    // relation that would have held it.
    assert.deepEqual(anchorsFor("WorkItem"), [
      { direction: "in", edgeType: "ALLOCATES" },
    ]);
    assert.equal(anchorPhrase("WorkItem"), "an ALLOCATES relation into it");
  });

  test("has nothing to say about a type that anchors nothing", () => {
    // A caller writes the whole sentence or none of it — an empty fragment
    // dropped into one would read as a sentence with a hole in it.
    assert.equal(anchorPhrase("Goal"), null);
    assert.equal(anchorPhrase("Finding"), null);
    assert.equal(anchorPhrase("Widget"), null);
  });
});

describe("a or an, in front of the canon's own names", () => {
  // THE ARTICLE SHIPS IN THE TEMPLATES, so getting it wrong is not a typo in a
  // rare refusal — it is `a Actor` in the file a person reads before writing
  // their first node. The rule has one home and this walks the whole canon
  // against it, which is the only arrangement in which a type added later
  // cannot arrive with the wrong article.
  test("every canon name reads correctly, and UseCase is the one whose letter lies", () => {
    const AN = new Set([
      "Actor",
      "AcceptanceCriterion",
      "Assumption",
      "Evidence",
      "Interface",
    ]);
    for (const entry of NODE_TYPES) {
      assert.equal(
        articleFor(entry.name),
        AN.has(entry.name) ? "an" : "a",
        entry.name,
      );
    }
    // Written out rather than derived: `UseCase` opens with a vowel and says
    // "yoo", and a test that computed the answer would agree with any rule.
    assert.equal(articleFor("UseCase"), "a");
    assert.equal(openingArticleFor("UseCase"), "A");
    assert.equal(openingArticleFor("Evidence"), "An");
  });

  test("every relation the canon has takes the letter's answer", () => {
    // No edge type needs the exception: the vowel-initial ones all say their
    // vowel. If one ever does not, it belongs beside `UseCase` and this fails.
    for (const name of EDGE_TYPE_NAMES) {
      assert.equal(articleFor(name), /^[AEIOU]/.test(name) ? "an" : "a", name);
    }
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

  test("carries the check's own tail in `orphanFixSentence`, and nothing else's", () => {
    // Two speakers say this one identically — `shall check` and the Work
    // Board's Fix Spec row — so it has one home. The approve and reject doors
    // keep tails of their own and quote the stem, which is why the tail is
    // added here rather than folded into the diagnosis above.
    assert.equal(
      orphanFixSentence("M-0002", "Module"),
      "M-0002 is a Module with no live anchor — it is held to the graph by an IS_REALIZED_BY relation into it, and none stands. Draw the relation, or remove the node.",
    );
    assert.equal(
      orphanFixSentence("M-0002", "Module").startsWith(
        orphanStem("M-0002", "Module"),
      ),
      true,
    );
  });

  test("stops before the full stop, so each caller writes its own tail", () => {
    const stem = orphanStem("EV-0001", "Evidence");
    assert.equal(stem.endsWith("and none stands"), true);
    assert.equal(
      stem,
      "EV-0001 is an Evidence with no live anchor — it is held to the graph by a CLAIMS relation out of it, and none stands",
    );
  });
});

describe("CLOSURE_KINDS", () => {
  test("names two subjects, and each of them once", () => {
    assert.deepEqual(
      CLOSURE_KINDS.map((entry) => entry.kind),
      ["criterion", "workItem"],
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
    assert.equal(closureKindOf("WorkItem")?.kind, "workItem");
    assert.equal(closureKindOf("Evidence"), null);
    assert.equal(closureKindOf("Widget"), null);
  });

  test("finds a row back from the tag a record carries", () => {
    assert.equal(closureKindNamed("workItem").subjectType, "WorkItem");
    assert.equal(closureKindNamed("criterion").claim, "CLAIMS");
  });

  test("throws for a tag with no row rather than closing the wrong thing", () => {
    // The cast is what a third subject added to the union without a row here
    // would look like at the call site. The throw is the whole point: a
    // default would close a criterion when a record asked about something
    // else, and would do it quietly.
    assert.throws(() => closureKindNamed("evidence" as ClosureSubject), {
      message: "No closure kind named evidence",
    });
  });
});
