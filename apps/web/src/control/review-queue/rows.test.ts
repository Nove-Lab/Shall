import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type {
  BundleMember,
  EvidenceMember,
  ReviewBundle,
} from "../../spec/review";
import { KIND_LABEL, bundleSummary } from "./rows";

/**
 * WHAT THE QUEUE'S ROW VOCABULARY PROMISES: a word for every kind the wire can
 * send, and a one-line measure in which EACH KIND MEASURES ITSELF — nodes for
 * an approval, types for a work report, claimants for the two closures. The
 * bundles below are the daemon's own shape, written out.
 */
function member(id: string, fields: Partial<BundleMember> = {}): BundleMember {
  return {
    id,
    type: "Requirement",
    shortName: id,
    name: id,
    updatedAt: 1000,
    color: "yellow",
    reason: "unapproved",
    approval: null,
    rejection: null,
    closure: null,
    deletionProposed: false,
    sharedWith: [],
    ...fields,
  };
}

function claimant(id: string): EvidenceMember {
  return { ...member(id, { type: "Evidence" }), submittedBy: [] };
}

describe("KIND_LABEL", () => {
  test("every kind the wire can send has a word", () => {
    assert.deepEqual(Object.keys(KIND_LABEL).sort(), [
      "ac-closure",
      "spec-approval",
      "standalone-finding",
      "work-item-closure",
      "work-report",
    ]);
    for (const word of Object.values(KIND_LABEL)) {
      assert.ok(word.length > 0);
    }
  });
});

describe("bundleSummary — a spec approval", () => {
  const approval = (fields: Partial<ReviewBundle> = {}): ReviewBundle =>
    ({
      kind: "spec-approval",
      id: "spec-approval:R-0001",
      rootId: "R-0001",
      title: "R-0001",
      since: 1000,
      members: [member("R-0001"), member("AC-0001")],
      unchanged: [{ id: "AC-0002", type: "AcceptanceCriterion", shortName: "two", name: "two" }],
      counts: [],
      ...fields,
    }) as ReviewBundle;

  test("it is counted in nodes, with the untouched ones named beside them", () => {
    assert.equal(bundleSummary(approval()), "2 nodes (1 unchanged)");
  });

  test("one node is said in the singular", () => {
    assert.equal(
      bundleSummary(approval({ members: [member("R-0001")], unchanged: [] })),
      "1 node (0 unchanged)",
    );
  });

  test("a rejected member is named only when there is one", () => {
    assert.equal(
      bundleSummary(
        approval({
          members: [member("R-0001", { reason: "rejected" }), member("AC-0001")],
        }),
      ),
      "2 nodes (1 unchanged, 1 rejected)",
    );
  });
});

describe("bundleSummary — a work report", () => {
  const report = (counts: { type: string; count: number }[]): ReviewBundle =>
    ({
      kind: "work-report",
      id: "work-report:WL-0001",
      rootId: "WL-0001",
      title: "WL-0001",
      since: 1000,
      members: [member("WL-0001", { type: "WorkLog" }), member("EV-0001", { type: "Evidence" })],
      unchanged: [],
      counts,
    }) as ReviewBundle;

  test("it is counted BY TYPE, because a node count says nothing about the shape", () => {
    assert.equal(
      bundleSummary(report([{ type: "WorkLog", count: 1 }, { type: "Evidence", count: 10 }])),
      "WorkLog 1, Evidence 10",
    );
  });

  test("a report core counted no types for falls back to its nodes", () => {
    assert.equal(bundleSummary(report([])), "2 nodes");
  });
});

describe("bundleSummary — the other three", () => {
  test("a standalone finding says what kind of reading is waiting", () => {
    assert.equal(
      bundleSummary({
        kind: "standalone-finding",
        id: "standalone-finding:F-0001",
        rootId: "F-0001",
        title: "F-0001",
        since: 1000,
        members: [member("F-0001", { type: "Finding" })],
        unchanged: [],
        counts: [],
      } as ReviewBundle),
      "1 finding",
    );
  });

  test("a criterion's closure is counted in claimants, whatever colour each wears", () => {
    assert.equal(
      bundleSummary({
        kind: "ac-closure",
        id: "ac-closure:AC-0001",
        acId: "AC-0001",
        title: "AC-0001",
        since: 1000,
        ac: member("AC-0001", { type: "AcceptanceCriterion" }),
        evidence: [claimant("EV-0001"), claimant("EV-0002")],
        history: [],
      } as ReviewBundle),
      "evidence 2",
    );
  });

  test("a work item's closure is counted in reports, for the same reason", () => {
    assert.equal(
      bundleSummary({
        kind: "work-item-closure",
        id: "work-item-closure:WI-0001",
        workItemId: "WI-0001",
        title: "WI-0001",
        since: 1000,
        workItem: member("WI-0001", { type: "WorkItem" }),
        reports: [claimant("CR-0001")],
        targets: [],
        history: [],
      } as ReviewBundle),
      "reports 1",
    );
  });
});
