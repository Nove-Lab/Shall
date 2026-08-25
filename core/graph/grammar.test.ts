import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  EDGE_GRAMMAR,
  EDGE_TYPE_NAMES,
  grammarHint,
  isPermittedTriple,
  permittedEdgeTypes,
} from "./grammar.js";

/**
 * `anchors.test.ts` counts the table; this file asks it questions.
 *
 * THE HINTS ARE HELD AS GOLDENS, whole sentences and leading space included.
 * A caller appends one straight after the full stop of its own refusal, so the
 * join is part of the product: a hint that lost its space reads as a word run
 * into a sentence, and a hint that grew one reads as a double space in a panel.
 * They are written out rather than assembled from the same template the code
 * uses, which would agree with any wording at all.
 */

describe("EDGE_TYPE_NAMES", () => {
  test("holds each name once, in the order the table first writes it", () => {
    assert.equal(new Set(EDGE_TYPE_NAMES).size, EDGE_TYPE_NAMES.length);
    assert.deepEqual(EDGE_TYPE_NAMES.slice(0, 4), [
      "REFINES",
      "PURSUED_BY",
      "PERFORMS",
      "DETAILS",
    ]);
    assert.deepEqual(
      new Set(EDGE_TYPE_NAMES),
      new Set(EDGE_GRAMMAR.map((row) => row.edgeType)),
    );
  });

  test("is one name short of the canon's count, because DEPENDS_ON is two edges", () => {
    // v5 numbers `DEPENDS_ON` twice — Requirement to Requirement and WorkItem
    // to WorkItem — so a name alone cannot tell the two apart, which is why
    // `EDGE_GRAMMAR` and not this list decides what is allowed.
    assert.deepEqual(
      EDGE_GRAMMAR.filter((row) => row.edgeType === "DEPENDS_ON"),
      [
        { fromType: "Requirement", toType: "Requirement", edgeType: "DEPENDS_ON" },
        { fromType: "WorkItem", toType: "WorkItem", edgeType: "DEPENDS_ON" },
      ],
    );
  });
});

describe("permittedEdgeTypes", () => {
  test("usually answers with one relation", () => {
    assert.deepEqual(permittedEdgeTypes("Requirement", "AcceptanceCriterion"), [
      "HAS_CRITERION",
    ]);
  });

  test("answers with two where a module both publishes and calls a contract", () => {
    // Exposing and consuming are different facts about the same pair, so the
    // hint has to offer both rather than picking one.
    assert.deepEqual(permittedEdgeTypes("Module", "Interface"), [
      "EXPOSES",
      "CONSUMES",
    ]);
  });

  test("answers with nothing where the canon draws no line that way", () => {
    assert.deepEqual(permittedEdgeTypes("AcceptanceCriterion", "Requirement"), []);
    assert.deepEqual(permittedEdgeTypes("Widget", "Requirement"), []);
  });

  test("relates no two distinct types both ways", () => {
    // This is what makes the reverse clause worth printing: turning the arrow
    // around is a real move for the reader and never the same refusal again.
    const pairs = new Set(
      EDGE_GRAMMAR.map((row) => `${row.fromType} ${row.toType}`),
    );
    for (const pair of pairs) {
      const [from, to] = pair.split(" ") as [string, string];
      if (from !== to) {
        assert.equal(pairs.has(`${to} ${from}`), false, pair);
      }
    }
  });
});

describe("isPermittedTriple", () => {
  test("accepts every row the table holds", () => {
    for (const row of EDGE_GRAMMAR) {
      assert.equal(
        isPermittedTriple(row.fromType, row.toType, row.edgeType),
        true,
        `${row.fromType} ${row.edgeType} ${row.toType}`,
      );
    }
  });

  test("refuses a row that is wrong in any one of the three", () => {
    // The triple is the key, so each of the three has to be able to fail on its
    // own: a real relation between the wrong pair is as refused as a name the
    // canon does not have.
    assert.equal(
      isPermittedTriple("Requirement", "AcceptanceCriterion", "MENTIONS"),
      false,
    );
    assert.equal(
      isPermittedTriple("Scenario", "AcceptanceCriterion", "REQUIRES"),
      false,
    );
    assert.equal(
      isPermittedTriple("Requirement", "Constraint", "HAS_CRITERION"),
      false,
    );
    assert.equal(isPermittedTriple("Widget", "Requirement", "MENTIONS"), false);
  });

  test("refuses the second DEPENDS_ON between the first one's types", () => {
    // The name is shared and the endpoints are not, so indexing by name alone
    // would let a Requirement depend on a WorkItem.
    assert.equal(
      isPermittedTriple("Requirement", "WorkItem", "DEPENDS_ON"),
      false,
    );
  });
});

describe("grammarHint", () => {
  test("names this direction first, because that is the arrow already drawn", () => {
    assert.equal(
      grammarHint("Requirement", "AcceptanceCriterion"),
      " This direction allows: HAS_CRITERION.",
    );
  });

  test("lists both relations where the canon allows two", () => {
    assert.equal(
      grammarHint("Module", "Interface"),
      " This direction allows: EXPOSES, CONSUMES.",
    );
  });

  test("offers the reverse when the arrow could be turned around", () => {
    assert.equal(
      grammarHint("AcceptanceCriterion", "Requirement"),
      " The reverse direction allows: HAS_CRITERION.",
    );
  });

  test("says so outright when the canon relates the two no way at all", () => {
    // It used to say nothing, and nothing left the reader believing they had
    // merely reached for the wrong edge name between a pair that was fine.
    assert.equal(
      grammarHint("Finding", "Journal"),
      " Nothing in the canon relates a Finding to a Journal.",
    );
  });

  test("takes its articles from the one rule, so no refusal ships `a Interface`", () => {
    assert.equal(
      grammarHint("Interface", "Evidence"),
      " Nothing in the canon relates an Interface to an Evidence.",
    );
  });

  test("never names the reverse between two nodes of one type", () => {
    // The reverse of a self-loop is the same direction, so naming it would send
    // the reader off to redraw the arrow and meet the identical refusal.
    assert.equal(
      grammarHint("Requirement", "Requirement"),
      " This direction allows: DEPENDS_ON, CONFLICTS_WITH.",
    );
    assert.equal(
      grammarHint("Term", "Term"),
      " Nothing in the canon relates a Term to a Term.",
    );
  });

  test("always answers, and every answer opens with a space", () => {
    // A caller appends this straight after its own full stop, so the join
    // belongs here and not in each of them.
    for (const [from, to] of [
      ["Requirement", "AcceptanceCriterion"],
      ["Module", "Interface"],
      ["AcceptanceCriterion", "Requirement"],
      ["Finding", "Journal"],
      ["Term", "Term"],
      ["Widget", "Gadget"],
    ] as const) {
      const hint = grammarHint(from, to);
      assert.equal(hint.startsWith(" "), true, `${from} ${to}`);
      assert.equal(hint.endsWith("."), true, `${from} ${to}`);
    }
  });
});
