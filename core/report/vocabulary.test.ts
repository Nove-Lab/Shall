import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { HealthRule, HealthRuleId, ReviewStatus } from "../arith/index.js";
import {
  aimsNoteOf,
  carrierOf,
  criterionOf,
  healthRuleLabelOf,
  healthSummaryOf,
  openReasonOf,
  registrationOf,
  workOf,
} from "./vocabulary.js";

/**
 * THE EMITTED WORDS, HELD TO THE BYTE. The reader of a report has never opened
 * Shall, so red, yellow, green, sat and unsat may not reach the page — this
 * file is what fails when one does, and what a reviewer reads to see every
 * word the report can say without opening a browser.
 *
 * THE TONE IS A ROLE AND THE LABEL CARRIES THE MEANING, so both are asserted:
 * a badge that lost its word would still be coloured and would say nothing.
 */

/** A status with every axis off, so each test turns on exactly the one it asks about. */
function statusOf(axes: Partial<ReviewStatus> = {}): ReviewStatus {
  return {
    id: "R-0001",
    color: "green",
    reason: "approved",
    approval: null,
    rejection: null,
    closure: null,
    leftOpen: null,
    workItemState: null,
    satisfaction: null,
    aims: null,
    spentAim: null,
    problem: null,
    ...axes,
  };
}

describe("registrationOf", () => {
  test("says the approval ledger's word, never the colour", () => {
    assert.deepEqual(registrationOf(statusOf({ color: "green" })), {
      label: "Approved",
      tone: "good",
    });
    assert.deepEqual(registrationOf(statusOf({ color: "yellow" })), {
      label: "Awaiting review",
      tone: "pending",
    });
    assert.deepEqual(registrationOf(statusOf({ color: "red" })), {
      label: "Needs attention",
      tone: "attention",
    });
  });

  test("answers for every node, so no node is left unlabelled", () => {
    for (const color of ["red", "yellow", "green"] as const) {
      const badge = registrationOf(statusOf({ color }));
      assert.notEqual(badge.label, "");
      assert.doesNotMatch(badge.label, /red|yellow|green/i);
    }
  });
});

describe("criterionOf", () => {
  test("says met or open for a criterion", () => {
    assert.deepEqual(criterionOf(statusOf({ closure: "closed" })), {
      label: "Met",
      tone: "good",
    });
    assert.deepEqual(criterionOf(statusOf({ closure: "open" })), {
      label: "Open",
      tone: "pending",
    });
  });

  test("says nothing at all for a node that is no closure subject", () => {
    assert.equal(criterionOf(statusOf({ closure: null })), null);
  });
});

describe("carrierOf", () => {
  test("says satisfied or not for a carrier that demands criteria", () => {
    assert.deepEqual(carrierOf(statusOf({ satisfaction: "sat" })), {
      label: "Satisfied",
      tone: "good",
    });
    assert.deepEqual(carrierOf(statusOf({ satisfaction: "unsat" })), {
      label: "Not yet satisfied",
      tone: "pending",
    });
  });

  test("reads a null satisfaction as unspecified, not as unmet", () => {
    // The one badge that is neutral: nobody has asked anything of this node
    // yet, which is a different thing from asking and not getting it.
    assert.deepEqual(carrierOf(statusOf({ satisfaction: null })), {
      label: "No criteria yet",
      tone: "neutral",
    });
  });
});

describe("workOf", () => {
  test("says the board's own word for a work item", () => {
    assert.deepEqual(workOf(statusOf({ workItemState: "done" })), {
      label: "Done",
      tone: "good",
    });
    assert.deepEqual(workOf(statusOf({ workItemState: "ready" })), {
      label: "Ready",
      tone: "pending",
    });
    assert.deepEqual(workOf(statusOf({ workItemState: "blocked" })), {
      label: "Blocked",
      tone: "attention",
    });
  });

  test("says nothing for a node that is not a work item", () => {
    assert.equal(workOf(statusOf({ workItemState: null })), null);
  });
});

describe("openReasonOf", () => {
  test("names each of the vitals' three reasons in plain words", () => {
    assert.equal(openReasonOf("no-evidence"), "No evidence yet");
    assert.equal(openReasonOf("awaiting-review"), "Awaiting review");
    assert.equal(openReasonOf("left-open"), "Left open");
  });
});

describe("aimsNoteOf", () => {
  test("says what is still aimed at an open criterion, and nothing while a verdict is ahead", () => {
    assert.equal(aimsNoteOf("spent"), "no work item left to judge it");
    assert.equal(aimsNoteOf("none"), "no work item aims at it");
    assert.equal(aimsNoteOf("pending"), null);
    assert.equal(aimsNoteOf(null), null);
  });
});

describe("healthRuleLabelOf", () => {
  const RULES: HealthRuleId[] = [
    "requirement-without-criterion",
    "scenario-without-criterion",
    "actor-without-use-case",
    "use-case-without-scenario",
    "goal-without-responsibility",
    "module-without-work-item",
    "criterion-without-work-item",
  ];

  test("names all seven checks", () => {
    assert.deepEqual(
      RULES.map(healthRuleLabelOf),
      [
        "Requirements without acceptance criteria",
        "Scenarios without acceptance criteria",
        "Actors without a use case",
        "Use cases without a scenario",
        "Goals no responsibility answers to",
        "Modules without a work item",
        "Criteria no work item targets",
      ],
    );
  });

  test("gives each check its own sentence, and never the rule's id", () => {
    const labels = RULES.map(healthRuleLabelOf);
    assert.equal(new Set(labels).size, RULES.length);
    for (const label of labels) {
      assert.doesNotMatch(label, /-/);
    }
  });
});

describe("healthSummaryOf", () => {
  /** A rule passes exactly when it names no node. */
  function rule(id: HealthRuleId, violators: number): HealthRule {
    return {
      id,
      ordinal: 1,
      subjectType: "Requirement",
      examined: 3,
      nodes: Array.from({ length: violators }, (_, index) => ({
        id: `R-000${index + 1}`,
        shortName: `r${index + 1}`,
        name: `Requirement ${index + 1}`,
      })),
    };
  }

  test("counts the rules that name no node, over however many arrived", () => {
    assert.equal(
      healthSummaryOf([
        rule("requirement-without-criterion", 0),
        rule("scenario-without-criterion", 2),
        rule("actor-without-use-case", 0),
      ]),
      "2 of 3 coverage checks pass",
    );
  });

  test("says none pass and all pass at the two ends", () => {
    assert.equal(
      healthSummaryOf([rule("module-without-work-item", 1)]),
      "0 of 1 coverage checks pass",
    );
    assert.equal(
      healthSummaryOf([rule("module-without-work-item", 0), rule("goal-without-responsibility", 0)]),
      "2 of 2 coverage checks pass",
    );
  });

  test("takes the total from the vitals, so an eighth rule needs no edit here", () => {
    assert.equal(healthSummaryOf([]), "0 of 0 coverage checks pass");
  });
});
