import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  OPEN_REASONS,
  OPEN_REASON_LABEL,
  RULE_HINT,
  RULE_LABEL,
  healthLine,
  isEmptySpec,
  openByReason,
  percent,
  progressRows,
  ratioText,
  violatedCount,
  type HealthRule,
  type OpenCriterion,
  type Vitals,
} from "./rows";

/**
 * WHAT THE ROWS PROMISE. Core decides every number; what is left to hold to
 * account here is the fixed order of the four rows, which count goes over
 * which, the note that says what a denominator left out, the bar's arithmetic
 * at the edges, and that every word the wire can say has a label — written
 * against plain vitals the way the daemon serves them, with the numbers
 * written out rather than derived.
 */

function rule(
  id: HealthRule["id"],
  ordinal: number,
  nodes: readonly string[] = [],
): HealthRule {
  return {
    id,
    ordinal,
    subjectType: "Requirement",
    examined: nodes.length,
    nodes: nodes.map((held) => ({ id: held, shortName: held, name: held })),
  };
}

function open(id: string, reason: OpenCriterion["reason"]): OpenCriterion {
  return {
    id,
    shortName: id,
    name: id,
    reason,
    evidence: reason === "no-evidence" ? 0 : 1,
    bundleId: null,
    leftOpen: null,
  };
}

/** The seven rules, all clean, in the table's order. */
const CLEAN: HealthRule[] = [
  rule("requirement-without-criterion", 1),
  rule("scenario-without-criterion", 2),
  rule("actor-without-use-case", 3),
  rule("use-case-without-scenario", 4),
  rule("goal-without-responsibility", 5),
  rule("module-without-work-item", 6),
  rule("criterion-without-work-item", 7),
];

/** A specification part-way along, every row with something in it. */
const VITALS: Vitals = {
  empty: false,
  progress: {
    scenarios: {
      kind: "scenario-satisfaction",
      type: "Scenario",
      numerator: 7,
      denominator: 9,
      unspecified: 2,
      unsat: [],
    },
    requirements: {
      kind: "requirement-satisfaction",
      type: "Requirement",
      numerator: 5,
      denominator: 12,
      unspecified: 0,
      unsat: [],
    },
    criteria: {
      kind: "ac-closure",
      numerator: 24,
      denominator: 40,
      open: [
        open("AC-0001", "awaiting-review"),
        open("AC-0002", "no-evidence"),
        open("AC-0003", "left-open"),
        open("AC-0004", "no-evidence"),
      ],
    },
    workItems: {
      kind: "work-item-completion",
      numerator: 8,
      denominator: 14,
      open: [
        { id: "WI-0003", shortName: "WI-0003", name: "WI-0003", workItemState: "blocked" as const },
        { id: "WI-0004", shortName: "WI-0004", name: "WI-0004", workItemState: "blocked" as const },
        { id: "WI-0005", shortName: "WI-0005", name: "WI-0005", workItemState: "blocked" as const },
        { id: "WI-0006", shortName: "WI-0006", name: "WI-0006", workItemState: "ready" as const },
        { id: "WI-0007", shortName: "WI-0007", name: "WI-0007", workItemState: "ready" as const },
        { id: "WI-0008", shortName: "WI-0008", name: "WI-0008", workItemState: "ready" as const },
      ],
    },
  },
  health: CLEAN,
};

describe("progressRows", () => {
  test("four rows, in the specification's order, named both ways", () => {
    const rows = progressRows(VITALS);
    assert.deepEqual(
      rows.map((row) => [row.key, row.label, row.short]),
      [
        ["scenarios", "Scenario Satisfaction", "Scenario"],
        ["requirements", "Requirement Satisfaction", "Requirement"],
        ["criteria", "AC Closure", "AC"],
        ["work-items", "WorkItem Completion", "WorkItem"],
      ],
    );
  });

  test("each ratio is core's own numerator over core's own denominator", () => {
    const rows = progressRows(VITALS);
    assert.deepEqual(
      rows.map((row) => [row.numerator, row.denominator]),
      [
        [7, 9],
        [5, 12],
        [24, 40],
        [8, 14],
      ],
    );
  });

  test("the note says what the denominator left out, and is null when nothing was", () => {
    const rows = progressRows(VITALS);
    assert.deepEqual(
      rows.map((row) => row.note),
      ["2 unspecified", null, null, null],
    );
  });
});

describe("ratioText and percent", () => {
  test("the ratio is the two counts", () => {
    assert.equal(ratioText(7, 9), "7/9");
    assert.equal(ratioText(0, 0), "0/0");
  });

  test("the bar is nought over nothing, full at the whole, and rounded between", () => {
    assert.equal(percent(0, 0), 0);
    assert.equal(percent(9, 9), 100);
    assert.equal(percent(1, 3), 33);
    assert.equal(percent(2, 3), 67);
  });
});

describe("healthLine", () => {
  test("says every check passed when nothing is violated", () => {
    assert.equal(violatedCount(VITALS), 0);
    assert.equal(healthLine(VITALS), "All 7 checks passed");
  });

  test("counts the violated rules, singular and plural", () => {
    const one: Vitals = {
      ...VITALS,
      health: [rule("scenario-without-criterion", 2, ["SC-0002"]), ...CLEAN.slice(2)],
    };
    assert.equal(healthLine(one), "1 rule violated");
    const three: Vitals = {
      ...VITALS,
      health: [
        rule("actor-without-use-case", 3, ["A-0002"]),
        rule("module-without-work-item", 6, ["M-0002", "M-0003"]),
        rule("criterion-without-work-item", 7, ["AC-0009"]),
        ...CLEAN.slice(0, 2),
      ],
    };
    assert.equal(healthLine(three), "3 rules violated");
  });
});

describe("openByReason", () => {
  test("every reason is a key, empty or not, and each group keeps the wire's order", () => {
    const groups = openByReason(VITALS);
    assert.deepEqual(Object.keys(groups).sort(), [...OPEN_REASONS].sort());
    assert.deepEqual(
      OPEN_REASONS.map((reason) => [reason, groups[reason].map((held) => held.id)]),
      [
        ["no-evidence", ["AC-0002", "AC-0004"]],
        ["awaiting-review", ["AC-0001"]],
        ["left-open", ["AC-0003"]],
      ],
    );
    const none = openByReason({ ...VITALS, progress: { ...VITALS.progress, criteria: { ...VITALS.progress.criteria, open: [] } } });
    assert.deepEqual(Object.values(none), [[], [], []]);
  });
});

describe("the words", () => {
  test("every rule on the wire has a label and a hint that names a process", () => {
    for (const held of CLEAN) {
      assert.ok(RULE_LABEL[held.id].length > 0, held.id);
      assert.match(RULE_HINT[held.id], /\/shall:(specify|plan)/, held.id);
    }
  });

  test("every reason and every cause has a word", () => {
    for (const reason of OPEN_REASONS) {
      assert.ok(OPEN_REASON_LABEL[reason].length > 0, reason);
    }
  });

  test("emptiness is core's word and not a count", () => {
    assert.equal(isEmptySpec(VITALS), false);
    assert.equal(isEmptySpec({ ...VITALS, empty: true }), true);
  });
});
