import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  NO_CLOSURES,
  NO_SATISFACTIONS,
  NO_SIGNALS,
  NO_WORK_ITEM_STATES,
  approvable,
  closuresOf,
  deletionSentence,
  firstLine,
  impactSentence,
  judgeable,
  nodesById,
  problemCount,
  referrersOf,
  satisfactionsOf,
  signalsOf,
  statusesById,
  workItemStatesOf,
  type ReviewReport,
  type ReviewStatus,
} from "./review";
import type { SpecEdge, SpecNode } from "./spec-node";

/**
 * WHERE THE WIRE MEETS THE CANVAS. Nothing in this file works a verdict out, so
 * what is left to hold to account is the crossing itself: which of the daemon's
 * four words reach a map, which absences are answers rather than gaps, the two
 * gates a button reads, and the sentences a person is shown before a deletion.
 *
 * The reports below are the daemon's own shape, written out as plain records.
 */
function status(
  id: string,
  fields: Partial<ReviewStatus> = {},
): ReviewStatus {
  return {
    id,
    color: "yellow",
    reason: "unapproved",
    approval: null,
    rejection: null,
    closure: null,
    leftOpen: null,
    workItemState: null,
    satisfaction: null,
    aims: null,
    spentAim: null,
    problem: null,
    ...fields,
  };
}

function report(statuses: ReviewStatus[]): ReviewReport {
  return { statuses, missing: [], broken: [] };
}

/** One board: a coloured requirement, a closed criterion, a ready work item. */
const REPORT: ReviewReport = report([
  status("R-0001", { color: "green", reason: "approved", satisfaction: "sat" }),
  status("R-0002", { color: "red", reason: "orphan", satisfaction: "unsat" }),
  status("AC-0001", { closure: "closed" }),
  status("AC-0002", { closure: "open" }),
  status("WI-0001", { workItemState: "ready", closure: "open" }),
  status("T-0001"),
]);

describe("the four maps", () => {
  test("no report is the one shared empty map, for each of them", () => {
    assert.equal(signalsOf(null), NO_SIGNALS);
    assert.equal(closuresOf(null), NO_CLOSURES);
    assert.equal(workItemStatesOf(null), NO_WORK_ITEM_STATES);
    assert.equal(satisfactionsOf(null), NO_SATISFACTIONS);
    for (const empty of [NO_SIGNALS, NO_CLOSURES, NO_WORK_ITEM_STATES, NO_SATISFACTIONS]) {
      assert.equal(empty.size, 0);
    }
  });

  test("every status has a colour, so the signal map keys them all", () => {
    assert.deepEqual(
      [...signalsOf(REPORT)],
      [
        ["R-0001", "green"],
        ["R-0002", "red"],
        ["AC-0001", "yellow"],
        ["AC-0002", "yellow"],
        ["WI-0001", "yellow"],
        ["T-0001", "yellow"],
      ],
    );
  });

  test("only a closure subject is in the closure map — a null is left out", () => {
    assert.deepEqual(
      [...closuresOf(REPORT)],
      [
        ["AC-0001", "closed"],
        ["AC-0002", "open"],
        ["WI-0001", "open"],
      ],
    );
  });

  test("only a work item carries the board's word", () => {
    assert.deepEqual([...workItemStatesOf(REPORT)], [["WI-0001", "ready"]]);
  });

  test("only a carrier that demands something carries a satisfaction", () => {
    assert.deepEqual(
      [...satisfactionsOf(REPORT)],
      [
        ["R-0001", "sat"],
        ["R-0002", "unsat"],
      ],
    );
  });

  test("a report with no statuses is a map with no entries, and not the shared one", () => {
    const bare = report([]);
    assert.equal(signalsOf(bare).size, 0);
    assert.notEqual(signalsOf(bare), NO_SIGNALS);
  });
});

describe("the lookups the panels build", () => {
  test("the statuses keyed by id, reason and all", () => {
    const byId = statusesById(REPORT);
    assert.equal(byId.size, 6);
    assert.equal(byId.get("R-0002")?.reason, "orphan");
    assert.equal(byId.get("GONE"), undefined);
  });

  test("no report is no statuses to key", () => {
    assert.equal(statusesById(null).size, 0);
  });

  test("the nodes keyed by id", () => {
    const nodes: SpecNode[] = [
      { id: "R-0001", type: "Requirement", shortName: "one", name: "One", body: "", createdAt: 0, updatedAt: 0 },
    ];
    assert.equal(nodesById(nodes).get("R-0001")?.name, "One");
    assert.equal(nodesById([]).size, 0);
  });
});

describe("the two gates", () => {
  test("only yellow and green can be judged; red has no door", () => {
    assert.equal(judgeable({ color: "yellow" }), true);
    assert.equal(judgeable({ color: "green" }), true);
    assert.equal(judgeable({ color: "red" }), false);
  });

  test("approve shows for a yellow member with no deletion standing over it", () => {
    assert.equal(approvable({ color: "yellow", deletionProposed: false }), true);
    assert.equal(approvable({ color: "yellow", deletionProposed: true }), false);
    assert.equal(approvable({ color: "green", deletionProposed: false }), false);
    assert.equal(approvable({ color: "red", deletionProposed: false }), false);
  });
});

describe("what a deletion leaves behind", () => {
  const EDGES: SpecEdge[] = [
    { id: "e1", type: "MENTIONS", fromId: "R-0001", toId: "T-0001" },
    { id: "e2", type: "MENTIONS", fromId: "R-0002", toId: "T-0001" },
    { id: "e3", type: "DENOTES", fromId: "T-0001", toId: "DE-0001" },
  ];

  test("only the relations pointing in — the ones that start at it go with it", () => {
    assert.deepEqual(
      referrersOf(EDGES, "T-0001").map((edge) => edge.id),
      ["e1", "e2"],
    );
    assert.deepEqual(referrersOf(EDGES, "DE-0001").map((edge) => edge.id), ["e3"]);
    assert.deepEqual(referrersOf(EDGES, "R-0001"), []);
  });

  test("the sentence names the node and says it cannot be undone", () => {
    const said = deletionSentence("R-0001");
    assert.ok(said.startsWith("R-0001 leaves the graph"));
    assert.ok(said.endsWith("This cannot be undone."));
  });

  test("the impact is counted in relations, and said three ways", () => {
    assert.equal(impactSentence("T-0001", 0), "Nothing points at T-0001.");
    assert.ok(impactSentence("T-0001", 1).startsWith("One relation points at T-0001."));
    assert.ok(impactSentence("T-0001", 2).startsWith("2 relations point at T-0001."));
  });
});

describe("firstLine", () => {
  test("it cuts on the author's own break, and never mid-word", () => {
    assert.equal(firstLine("The first line\nand the rest"), "The first line");
    assert.equal(firstLine("One line only"), "One line only");
    assert.equal(firstLine(""), "");
    assert.equal(firstLine("\nsecond"), "");
  });
});

describe("problemCount", () => {
  test("the two lists counted together, and nought for no report", () => {
    assert.equal(problemCount(null), 0);
    assert.equal(problemCount(REPORT), 0);
    assert.equal(
      problemCount({
        statuses: [],
        missing: [{ id: "R-0009", referencedBy: [{ fromId: "WI-0001", type: "IMPLEMENTS" }] }],
        broken: [
          { file: "spec/intent/Requirement/R-0010.md", problems: ["no front matter"] },
          { file: "spec/domain/Term/T-0009.md", problems: ["no title"] },
        ],
      }),
      3,
    );
  });
});
