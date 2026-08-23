import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  EDGE_GRAMMAR,
  NODE_TYPES,
  anchorsFor,
  closureKindOf,
  formatEdgeId,
  type SpecEdge,
  type SpecNode,
} from "../graph/index.js";
import {
  approvalPayload,
  blocksOf,
  type AcceptanceRecord,
  type ApprovalRecord,
  type RejectionRecord,
} from "../serialize/index.js";
import type { SpecGraph } from "../store/file-store.js";
import type { Ledgers, PayloadHash } from "./color.js";
import { reviewGraph } from "./review.js";
import {
  reviewBundles,
  scanRankOf,
  type BundleMember,
  type ReviewBundle,
  type ReviewQueue,
} from "./bundles.js";

/**
 * The review queue, over graphs built by hand and the identity hash.
 *
 * THE ASSERTIONS ARE ABOUT ARRANGEMENT, not about colour: which bundles stand
 * up, what is in them, in what order, and what is deliberately left out. The
 * colour of any one node is `color.test.ts`'s question and is taken as read
 * here — every fixture below approves what it wants green and refuses what it
 * wants red, and never asserts that the chain agreed.
 *
 * THE PROPERTY THAT MATTERS MOST IS COVERAGE: every yellow node is in at least
 * one bundle. A queue that quietly dropped a node would look tidy and would be
 * a lie about what is waiting, so it is checked over several shapes of graph
 * rather than argued about once.
 */

const hash: PayloadHash = (payload: string) => `sha256:${payload}`;

const APPROVER = { by: "t", at: "2026-08-15T00:00:00Z" };
const ACCEPTOR = { by: "t", at: "2026-08-16T00:00:00Z" };
const REFUSAL = {
  by: "t",
  at: "2026-08-16T12:00:00Z",
  rationale: "It proves the happy path and nothing else.",
};

function node(
  type: string,
  id: string,
  extra: Partial<SpecNode> = {},
): SpecNode {
  return {
    id,
    type,
    shortName: id,
    name: `${type} ${id}`,
    body: `What ${id} says.`,
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

function edge(fromId: string, type: string, toId: string): SpecEdge {
  return { id: formatEdgeId(fromId, type, toId), type, fromId, toId };
}

function graphOf(nodes: readonly SpecNode[], edges: readonly SpecEdge[]): SpecGraph {
  return { nodes: [...nodes], edges: [...edges], problems: [], refused: [] };
}

function hashOf(held: SpecNode, edges: readonly SpecEdge[]): string {
  return hash(
    approvalPayload(
      held.type,
      held.id,
      held,
      edges.filter((line) => line.fromId === held.id),
      blocksOf(held),
    ),
  );
}

function approve(
  held: SpecNode,
  edges: readonly SpecEdge[],
): [string, ApprovalRecord] {
  return [held.id, { approvedHash: hashOf(held, edges), ...APPROVER }];
}

function reject(
  held: SpecNode,
  edges: readonly SpecEdge[],
): [string, RejectionRecord] {
  return [held.id, { rejectedHash: hashOf(held, edges), ...REFUSAL }];
}

function accept(
  subject: SpecNode,
  claimants: readonly SpecNode[],
  edges: readonly SpecEdge[],
  // The kind is read off the subject, as the daemon's door reads it: a record
  // filed for a work item must SAY work item, or it stands for nothing.
  kind = closureKindOf(subject.type)?.kind ?? "criterion",
): [string, AcceptanceRecord] {
  return [
    subject.id,
    {
      kind,
      subjectHash: hashOf(subject, edges),
      claimants: new Map(
        claimants.map((held) => [held.id, hashOf(held, edges)] as const),
      ),
      ...ACCEPTOR,
    },
  ];
}

/** What each of the three books holds, said as the nodes a test cares about. */
interface Books {
  green?: readonly SpecNode[];
  rejected?: readonly SpecNode[];
  accepted?: readonly (readonly [SpecNode, readonly SpecNode[]])[];
}

function ledgersOf(edges: readonly SpecEdge[], books: Books = {}): Ledgers {
  return {
    approvals: new Map((books.green ?? []).map((held) => approve(held, edges))),
    rejections: new Map((books.rejected ?? []).map((held) => reject(held, edges))),
    acceptances: new Map(
      (books.accepted ?? []).map(([ac, evidence]) => accept(ac, evidence, edges)),
    ),
    hash,
  };
}

function queueOf(
  nodes: readonly SpecNode[],
  edges: readonly SpecEdge[],
  books: Books = {},
): ReviewQueue {
  return reviewBundles(graphOf(nodes, edges), ledgersOf(edges, books));
}

/** Every row of a bundle, whichever kind it is. */
function seatsOf(bundle: ReviewBundle): BundleMember[] {
  switch (bundle.kind) {
    case "ac-closure":
      return [bundle.ac, ...bundle.evidence];
    case "work-item-closure":
      return [bundle.workItem, ...bundle.reports];
    default:
      return bundle.members;
  }
}

function bundleIds(queue: ReviewQueue): string[] {
  return queue.bundles.map((bundle) => bundle.id);
}

function memberIds(queue: ReviewQueue, id: string): string[] {
  const bundle = queue.bundles.find((held) => held.id === id);
  assert.ok(bundle !== undefined, `no bundle ${id} in ${bundleIds(queue).join(", ")}`);
  return seatsOf(bundle).map((member) => member.id);
}

function memberIn(
  queue: ReviewQueue,
  bundleId: string,
  memberId: string,
): BundleMember {
  const bundle = queue.bundles.find((held) => held.id === bundleId);
  assert.ok(bundle !== undefined, `no bundle ${bundleId}`);
  const member = seatsOf(bundle).find((held) => held.id === memberId);
  assert.ok(member !== undefined, `no member ${memberId} in ${bundleId}`);
  return member;
}

/**
 * THE PROMISE: nothing yellow falls out of the queue. Asserted over whatever
 * graph a test hands it, so that a new arrangement of edges is one line to
 * check rather than a new argument to make.
 */
function assertEveryYellowIsBundled(
  nodes: readonly SpecNode[],
  edges: readonly SpecEdge[],
  books: Books = {},
): ReviewQueue {
  const graph = graphOf(nodes, edges);
  const ledgers = ledgersOf(edges, books);
  const queue = reviewBundles(graph, ledgers);
  const seated = new Set<string>();
  for (const bundle of queue.bundles) {
    for (const member of seatsOf(bundle)) {
      seated.add(member.id);
    }
  }
  for (const held of reviewGraph(graph, ledgers).statuses) {
    if (held.color === "yellow") {
      assert.ok(
        seated.has(held.id),
        `${held.id} is yellow and in no bundle: ${bundleIds(queue).join(", ")}`,
      );
    }
  }
  return queue;
}

/* ---------------------------------------------------------------- *
 * A legal intent spine, so that nothing below is red for a reason
 * the queue has no opinion about.
 * ---------------------------------------------------------------- */

const goal = node("Goal", "G-0001");
const actor = node("Actor", "A-0001");
const useCase = node("UseCase", "UC-0001");
const scenario = node("Scenario", "SC-0001");
const responsibility = node("SystemResponsibility", "SR-0001");
const requirement = node("Requirement", "R-0001");

/** Everything above the requirement — the part a test usually wants green. */
const ABOVE = [goal, actor, useCase, scenario, responsibility];
const SPINE = [...ABOVE, requirement];
const SPINE_EDGES = [
  edge("G-0001", "PURSUED_BY", "A-0001"),
  edge("A-0001", "PERFORMS", "UC-0001"),
  edge("UC-0001", "DETAILS", "SC-0001"),
  edge("SC-0001", "DERIVES_RESPONSIBILITY", "SR-0001"),
  edge("SR-0001", "REQUIRES", "R-0001"),
];

/**
 * The module that holds a work item to the graph — a work item is anchored by
 * the module that `ALLOCATES` it and by nothing else, so every fixture with a
 * work item in it has this module above it, realizing the spine's
 * responsibility.
 */
const module_ = node("Module", "M-0001");
const MODULE_EDGES = [edge("SR-0001", "IS_REALIZED_BY", "M-0001")];

describe("the scan order", () => {
  test("every type the canon has is somewhere in it", () => {
    // A type with no rank would sort somewhere arbitrary and nobody would
    // notice until a queue looked wrong.
    for (const entry of NODE_TYPES) {
      assert.notEqual(
        scanRankOf(entry.name),
        null,
        `${entry.name} has no rank`,
      );
    }
    assert.equal(scanRankOf("Sandwich"), null);
  });

  test("the one satellite is flagged, and every body type is not", () => {
    assert.deepEqual(scanRankOf("Decision"), { rank: 0, satellite: false });
    assert.deepEqual(scanRankOf("Goal"), { rank: 1, satellite: false });
    // `ASSUMES` runs from three bands at once, so an assumption has no depth of
    // its own: the flag is what sends it to borrow one per node, and the rank
    // here is only the fallback it takes when nothing living holds it.
    assert.deepEqual(scanRankOf("Assumption"), { rank: 20, satellite: true });
  });

  test("a Decision outranks every type the canon has", () => {
    // Said as a property and not as the number 0, because the number moves
    // whenever the canon does. A type slipped in above `Decision` would gather
    // a decision's own ripple into somebody else's bundle, and the card a
    // person reads would stop leading with the reason for the revision.
    const decision = scanRankOf("Decision");
    assert.ok(decision !== null);
    for (const entry of NODE_TYPES) {
      if (entry.name === "Decision") {
        continue;
      }
      const other = scanRankOf(entry.name);
      assert.ok(other !== null, `${entry.name} has no rank`);
      assert.ok(
        decision.rank < other.rank,
        `${entry.name} ranks ${other.rank}, at or above Decision's ${decision.rank}`,
      );
    }
  });

  test("every relation the canon allows runs down the scan order, except the ones the canon anchors upward", () => {
    // THE TWO TABLES SAY ONE THING FROM TWO SIDES, and this is where they are
    // held to it. `runsDownward` reads the order alone, so an edge that runs UP
    // it is the one walked backwards — and the only edges that may are the
    // handful the canon anchors a node BY: a log's ADDRESSES, a claim — and the
    // one that used to: a work item's TARGETS, which still points at the parent
    // and is still read backwards, but holds nothing since 2026-08-23. Any
    // other row pointing up the order is a bundle swallowing its own parent,
    // and any out-anchor pointing down is a node nothing reaches.
    //
    // A satellite borrows its rank per node, so a row with an `Assumption` at
    // either end of it is not this test's question.
    for (const row of EDGE_GRAMMAR) {
      const from = scanRankOf(row.fromType);
      const to = scanRankOf(row.toType);
      assert.ok(from !== null && to !== null);
      if (from.satellite || to.satellite) {
        continue;
      }
      const anchored = anchorsFor(row.fromType).some(
        (anchor) =>
          anchor.direction === "out" && anchor.edgeType === row.edgeType,
      );
      const said = `${row.fromType} ${row.edgeType} ${row.toType}`;
      // THE ONE DECLARED EXCEPTION, and the reason the question moved off the
      // anchor table. A `Decision` is held by the `AFFECTS` it draws, because
      // nothing in the canon points at a decision; and it outranks everything
      // it revises, because one yellow decision has to gather its whole ripple
      // into one bundle. The order wins — AFFECTS is walked forwards — and the
      // anchor table is left saying what HOLDS a decision rather than what
      // contains it.
      if (row.fromType === "Decision" && row.edgeType === "AFFECTS") {
        assert.ok(anchored, `${said} is what anchors the decision`);
        assert.ok(from.rank < to.rank, `${said} does not run down the order`);
        continue;
      }
      // THE OTHER DECLARED EXCEPTION, the mirror of the first. A work item's
      // TARGETS points at the criterion above it — so the walk reads it
      // backwards and a bundle never swallows the criterion — and it is no
      // anchor: a work item is held by the module that ALLOCATES it and by
      // nothing else, so the aim may run up the order while holding nothing.
      if (row.fromType === "WorkItem" && row.edgeType === "TARGETS") {
        assert.ok(!anchored, `${said} aims and does not hold`);
        assert.ok(from.rank > to.rank, `${said} does not run up the order`);
        continue;
      }
      assert.equal(
        from.rank > to.rank,
        anchored,
        `${said} runs ${from.rank > to.rank ? "up" : "down"} the order and is ${
          anchored ? "" : "not "
        }an out-anchor`,
      );
    }
  });
});

describe("every yellow node is in at least one bundle", () => {
  test("an intent spine nobody has approved", () => {
    assertEveryYellowIsBundled(SPINE, SPINE_EDGES);
  });

  test("a report with an assumption and a finding hanging off it", () => {
    const journal = node("Journal", "J-0001");
    const workLog = node("WorkLog", "WL-0001");
    const assumption = node("Assumption", "AS-0001");
    const finding = node("Finding", "F-0001");
    assertEveryYellowIsBundled(
      [...SPINE, journal, workLog, assumption, finding],
      [
        ...SPINE_EDGES,
        edge("J-0001", "LOGS", "WL-0001"),
        edge("WL-0001", "ASSUMES", "AS-0001"),
        edge("WL-0001", "RECORDS", "F-0001"),
      ],
      { green: ABOVE },
    );
  });

  test("a vocabulary nothing walks into", () => {
    const term = node("Term", "T-0001");
    const entity = node("DomainEntity", "DE-0001");
    assertEveryYellowIsBundled(
      [...SPINE, term, entity],
      [
        ...SPINE_EDGES,
        edge("R-0001", "MENTIONS", "T-0001"),
        edge("T-0001", "DENOTES", "DE-0001"),
      ],
      { green: ABOVE },
    );
  });

  test("a graph with refusals, decisions and a cycle in it", () => {
    const second = node("Requirement", "R-0002");
    const decision = node("Decision", "D-0001");
    const assumption = node("Assumption", "AS-0001");
    assertEveryYellowIsBundled(
      [...SPINE, second, decision, assumption],
      [
        ...SPINE_EDGES,
        edge("SR-0001", "REQUIRES", "R-0002"),
        edge("R-0001", "DEPENDS_ON", "R-0002"),
        edge("R-0002", "DEPENDS_ON", "R-0001"),
        edge("D-0001", "AFFECTS", "R-0002"),
        edge("R-0001", "ASSUMES", "AS-0001"),
      ],
      { green: ABOVE, rejected: [second] },
    );
  });
});

describe("roots", () => {
  test("a node whose only trouble is a standing refusal leaves the queue", () => {
    // Somebody read it and handed it back. It is the agent's turn, and the
    // queue is what is waiting for a person.
    const queue = queueOf(SPINE, SPINE_EDGES, {
      green: [...ABOVE, requirement],
      rejected: [requirement],
    });
    assert.deepEqual(bundleIds(queue), []);
  });

  test("a refused node rides along as a red member when a yellow root reaches it", () => {
    // A person judging the piece around it has to see that it is there, and
    // what was said about it.
    const assumption = node("Assumption", "AS-0001");
    const queue = queueOf(
      [...SPINE, assumption],
      [...SPINE_EDGES, edge("R-0001", "ASSUMES", "AS-0001")],
      { green: [...ABOVE, assumption], rejected: [assumption] },
    );
    assert.deepEqual(bundleIds(queue), ["spec:R-0001"]);
    assert.deepEqual(memberIds(queue, "spec:R-0001"), ["R-0001", "AS-0001"]);
    const member = memberIn(queue, "spec:R-0001", "AS-0001");
    assert.equal(member.color, "red");
    assert.equal(member.reason, "rejected");
    assert.deepEqual(member.rejection, REFUSAL);
    assert.deepEqual(member.approval, APPROVER);
  });
});

describe("what a row says about itself", () => {
  test("a member an agent has asked to delete says so on its row, and its siblings do not", () => {
    // The proposal sits inside the hashed payload, so the node is yellow and a
    // member like any other — but the card must not send it to [Approve all],
    // and it needs the flag to know. Nothing else about the bundle changes.
    const criterion = node("AcceptanceCriterion", "AC-0001", {
      deletionProposed: { by: "agent", rationale: "Superseded by AC-0002." },
    });
    const queue = queueOf(
      [...SPINE, criterion],
      [...SPINE_EDGES, edge("R-0001", "HAS_CRITERION", "AC-0001")],
      { green: ABOVE },
    );
    assert.deepEqual(memberIds(queue, "spec:R-0001"), ["R-0001", "AC-0001"]);
    assert.equal(memberIn(queue, "spec:R-0001", "AC-0001").deletionProposed, true);
    assert.equal(memberIn(queue, "spec:R-0001", "R-0001").deletionProposed, false);
  });
});

describe("the specification walk", () => {
  test("a satellite two nodes hang off goes with the deepest of them", () => {
    // A green Goal and a yellow Requirement share one assumption. Ranked by the
    // Goal it would stand up a bundle of its own beside the requirement's; it is
    // ranked by the requirement instead, and there is one bundle.
    //
    // IT IS ALSO THE LEVEL CASE `runsDownward` IS WRITTEN FOR. The assumption
    // borrows the requirement's own rank, so the `ASSUMES` into it is exactly
    // level; compared strictly, every assumption in every project would be
    // unreached and would stand a bundle of its own beside the node that made
    // it. Mutate the `<=` and this test is one of the ones that says so.
    const assumption = node("Assumption", "AS-0001");
    const queue = queueOf(
      [...SPINE, assumption],
      [
        ...SPINE_EDGES,
        edge("G-0001", "ASSUMES", "AS-0001"),
        edge("R-0001", "ASSUMES", "AS-0001"),
      ],
      { green: ABOVE },
    );
    assert.deepEqual(bundleIds(queue), ["spec:R-0001"]);
    assert.deepEqual(memberIds(queue, "spec:R-0001"), ["R-0001", "AS-0001"]);
  });

  test("a decision roots the bundle of what it affects", () => {
    // A decision is the reason a revision was made, so it leads the piece the
    // revision touched rather than riding at the bottom of it: the requirement
    // hangs under the decision, and a person reads the why first.
    const decision = node("Decision", "D-0001");
    const queue = queueOf(
      [...SPINE, decision],
      [...SPINE_EDGES, edge("D-0001", "AFFECTS", "R-0001")],
      { green: ABOVE },
    );
    assert.deepEqual(bundleIds(queue), ["spec:D-0001"]);
    assert.deepEqual(memberIds(queue, "spec:D-0001"), ["D-0001", "R-0001"]);
    const bundle = queue.bundles[0];
    assert.ok(bundle !== undefined && bundle.kind === "spec-approval");
    assert.deepEqual(bundle.counts, [
      { type: "Decision", count: 1 },
      { type: "Requirement", count: 1 },
    ]);
  });

  test("a yellow decision gathers its whole ripple into one bundle", () => {
    // THE WHOLE REASON RANK IS NOT RESIDENCE. The decision is filed in Plan and
    // outranks Goal, so a revision that reaches up into intent and sideways into
    // the vocabulary is ONE thing to judge and not three cards with no reason on
    // any of them. What it merely resolves is not part of that: RESOLVES crosses
    // into the record, and the finding stays in the report that found it.
    const module = node("Module", "M-0001");
    const term = node("Term", "T-0001");
    const decision = node("Decision", "D-0001");
    const journal = node("Journal", "J-0001");
    const workLog = node("WorkLog", "WL-0001");
    const finding = node("Finding", "F-0001");
    const nodes = [
      ...SPINE,
      module,
      term,
      decision,
      journal,
      workLog,
      finding,
    ];
    const edges = [
      ...SPINE_EDGES,
      edge("SR-0001", "IS_REALIZED_BY", "M-0001"),
      edge("D-0001", "AFFECTS", "G-0001"),
      edge("D-0001", "AFFECTS", "T-0001"),
      edge("D-0001", "AFFECTS", "M-0001"),
      edge("D-0001", "RESOLVES", "F-0001"),
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "RECORDS", "F-0001"),
    ];
    const queue = assertEveryYellowIsBundled(nodes, edges, {
      green: [
        actor,
        useCase,
        scenario,
        responsibility,
        requirement,
        module,
        journal,
        workLog,
      ],
    });
    assert.deepEqual(bundleIds(queue), ["spec:D-0001", "report:J-0001"]);
    // The goal and the term are in the decision's bundle and stand none of
    // their own — which is what the rank buys.
    assert.deepEqual(memberIds(queue, "spec:D-0001"), [
      "D-0001",
      "G-0001",
      "T-0001",
    ]);
    const bundle = queue.bundles.find((held) => held.id === "spec:D-0001");
    assert.ok(bundle !== undefined && bundle.kind === "spec-approval");
    // The green module it also revises is named and not judged.
    assert.deepEqual(
      bundle.unchanged.map((held) => held.id),
      ["A-0001", "UC-0001", "SC-0001", "SR-0001", "R-0001", "M-0001"],
    );
    // The finding is in neither list, and the counts say so over both at once.
    assert.equal(
      bundle.counts.some((count) => count.type === "Finding"),
      false,
    );
    assert.deepEqual(memberIds(queue, "report:J-0001"), ["F-0001"]);
  });

  test("a decision that affects a term does not descend into the vocabulary", () => {
    // One step across the Domain wall and no further. The term is being
    // rewritten and belongs on the card that says why; the entity it denotes is
    // a reference again, and stands where every domain node stands — alone.
    const decision = node("Decision", "D-0001");
    const term = node("Term", "T-0001");
    const entity = node("DomainEntity", "DE-0001");
    const queue = assertEveryYellowIsBundled(
      [decision, term, entity],
      [
        edge("D-0001", "AFFECTS", "T-0001"),
        edge("T-0001", "DENOTES", "DE-0001"),
      ],
    );
    assert.deepEqual(bundleIds(queue), ["spec:D-0001", "spec:DE-0001"]);
    assert.deepEqual(memberIds(queue, "spec:D-0001"), ["D-0001", "T-0001"]);
    assert.deepEqual(memberIds(queue, "spec:DE-0001"), ["DE-0001"]);
  });

  test("a decision does not swallow the vocabulary it merely mentions", () => {
    // The crossing is keyed on the EDGE and never on the type at its tail. The
    // same decision may revise one word and name another, and naming one is not
    // asking anybody to read it.
    const decision = node("Decision", "D-0001");
    const term = node("Term", "T-0001");
    const queue = assertEveryYellowIsBundled(
      [...SPINE, decision, term],
      [
        ...SPINE_EDGES,
        edge("D-0001", "AFFECTS", "R-0001"),
        edge("D-0001", "MENTIONS", "T-0001"),
      ],
      { green: ABOVE },
    );
    assert.deepEqual(bundleIds(queue), ["spec:D-0001", "spec:T-0001"]);
    assert.deepEqual(memberIds(queue, "spec:D-0001"), ["D-0001", "R-0001"]);
    assert.deepEqual(memberIds(queue, "spec:T-0001"), ["T-0001"]);
  });

  test("a decision is never somebody else's member", () => {
    // THE ACCEPTED LOSS, pinned here so nobody hands it back. Read backwards, a
    // green decision would ride along in the bundle of everything it ever
    // affected — and one old decision affecting two unrelated requirements would
    // weld their two bundles into one piece nobody decided to judge together. So
    // a decision roots its own bundle or it is not in the queue at all, and the
    // requirement below is judged on its own words.
    const decision = node("Decision", "D-0001");
    const queue = assertEveryYellowIsBundled(
      [...SPINE, decision],
      [...SPINE_EDGES, edge("D-0001", "AFFECTS", "R-0001")],
      { green: [...ABOVE, decision] },
    );
    assert.deepEqual(bundleIds(queue), ["spec:R-0001"]);
    assert.deepEqual(memberIds(queue, "spec:R-0001"), ["R-0001"]);
    const bundle = queue.bundles[0];
    assert.ok(bundle !== undefined && bundle.kind === "spec-approval");
    // Not in the unchanged list either: it is not reached, so it is not there
    // to be named.
    assert.deepEqual(bundle.unchanged, []);
  });

  test("two decisions affecting one requirement each stand a bundle, and the requirement says so", () => {
    // Two reasons are two cards. Only the root choice looks at what is covered,
    // so the requirement is a member of both, and each row points at the other
    // bundle — a person approving one is told the other is waiting on it too.
    const first = node("Decision", "D-0001");
    const second = node("Decision", "D-0002");
    const queue = queueOf(
      [...SPINE, first, second],
      [
        ...SPINE_EDGES,
        edge("D-0001", "AFFECTS", "R-0001"),
        edge("D-0002", "AFFECTS", "R-0001"),
      ],
      { green: ABOVE },
    );
    assert.deepEqual(bundleIds(queue), ["spec:D-0001", "spec:D-0002"]);
    assert.deepEqual(memberIds(queue, "spec:D-0001"), ["D-0001", "R-0001"]);
    assert.deepEqual(memberIds(queue, "spec:D-0002"), ["D-0002", "R-0001"]);
    assert.deepEqual(memberIn(queue, "spec:D-0001", "R-0001").sharedWith, [
      "spec:D-0002",
    ]);
    assert.deepEqual(memberIn(queue, "spec:D-0002", "R-0001").sharedWith, [
      "spec:D-0001",
    ]);
    assert.deepEqual(memberIn(queue, "spec:D-0001", "D-0001").sharedWith, []);
  });

  test("a node two roots both reach is in both bundles and each says so", () => {
    // The multi-parent rule. Only the ROOT choice looks at what is covered; the
    // walk does not, because a shared assumption really is part of both
    // decisions.
    const second = node("Goal", "G-0002");
    const assumption = node("Assumption", "AS-0001");
    const queue = queueOf(
      [goal, second, assumption],
      [
        edge("G-0001", "ASSUMES", "AS-0001"),
        edge("G-0002", "ASSUMES", "AS-0001"),
      ],
    );
    assert.deepEqual(bundleIds(queue), ["spec:G-0001", "spec:G-0002"]);
    assert.deepEqual(memberIds(queue, "spec:G-0001"), ["G-0001", "AS-0001"]);
    assert.deepEqual(memberIds(queue, "spec:G-0002"), ["G-0002", "AS-0001"]);
    assert.deepEqual(
      memberIn(queue, "spec:G-0001", "AS-0001").sharedWith,
      ["spec:G-0002"],
    );
    assert.deepEqual(
      memberIn(queue, "spec:G-0002", "AS-0001").sharedWith,
      ["spec:G-0001"],
    );
    assert.deepEqual(memberIn(queue, "spec:G-0001", "G-0001").sharedWith, []);
  });

  test("a cycle of DEPENDS_ON terminates, and stands no bundle at all", () => {
    // Two facts at once. The walk terminates — this test predates the loop
    // rule and that is still what it is here to prove. And since the loop
    // rule, both nodes are red for a reason the queue does not carry: a loop
    // is a seam in the graph, like an orphan and like the aim rule, and a
    // person cannot approve their way out of one. So neither roots a bundle,
    // neither rides in anybody's, and `shall check` is where it is said.
    const second = node("Requirement", "R-0002");
    const queue = queueOf(
      [...SPINE, second],
      [
        ...SPINE_EDGES,
        edge("SR-0001", "REQUIRES", "R-0002"),
        edge("R-0001", "DEPENDS_ON", "R-0002"),
        edge("R-0002", "DEPENDS_ON", "R-0001"),
      ],
      { green: ABOVE },
    );
    assert.deepEqual(bundleIds(queue), []);
  });

  test("a node that waits on a loop without being on it is still a card", () => {
    // Membership is the component and not reachability: R-0003 waits on the
    // pair and nothing waits on it, so it is not on the loop and the queue
    // still has work for a person. The two on the loop stay out of its bundle.
    const second = node("Requirement", "R-0002");
    const third = node("Requirement", "R-0003");
    const queue = queueOf(
      [...SPINE, second, third],
      [
        ...SPINE_EDGES,
        edge("SR-0001", "REQUIRES", "R-0002"),
        edge("SR-0001", "REQUIRES", "R-0003"),
        edge("R-0001", "DEPENDS_ON", "R-0002"),
        edge("R-0002", "DEPENDS_ON", "R-0001"),
        edge("R-0003", "DEPENDS_ON", "R-0001"),
      ],
      { green: ABOVE },
    );
    assert.deepEqual(bundleIds(queue), ["spec:R-0003"]);
    assert.deepEqual(memberIds(queue, "spec:R-0003"), ["R-0003"]);
  });

  test("a vocabulary word stands alone, and no walk descends into it", () => {
    const term = node("Term", "T-0001");
    const queue = queueOf(
      [...SPINE, term],
      [...SPINE_EDGES, edge("R-0001", "MENTIONS", "T-0001")],
      { green: ABOVE },
    );
    assert.deepEqual(bundleIds(queue), ["spec:R-0001", "spec:T-0001"]);
    assert.deepEqual(memberIds(queue, "spec:R-0001"), ["R-0001"]);
    assert.deepEqual(memberIds(queue, "spec:T-0001"), ["T-0001"]);
    const single = queue.bundles.find((held) => held.id === "spec:T-0001");
    assert.ok(single !== undefined && single.kind === "spec-approval");
    assert.deepEqual(single.unchanged, []);
    assert.deepEqual(single.counts, [{ type: "Term", count: 1 }]);
  });
});

describe("the work report", () => {
  const journal = node("Journal", "J-0001");
  const workLog = node("WorkLog", "WL-0001", { commits: ["a1b2c3", "d4e5f6"] });

  test("an assumption a work log made belongs to the report and roots nothing", () => {
    // A satellite takes the rank AND the side of what it hangs off, so an
    // assumption made in the middle of the work is judged as part of the record
    // that made it rather than standing up on the specification side.
    const assumption = node("Assumption", "AS-0001");
    const queue = queueOf(
      [journal, workLog, assumption],
      [
        edge("J-0001", "LOGS", "WL-0001"),
        edge("WL-0001", "ASSUMES", "AS-0001"),
      ],
    );
    assert.deepEqual(bundleIds(queue), ["report:J-0001"]);
    assert.deepEqual(memberIds(queue, "report:J-0001"), [
      "J-0001",
      "WL-0001",
      "AS-0001",
    ]);
  });

  test("a satellite hanging off a homeless one keeps the side of its homed attacher", () => {
    // THE GUARD THIS PINS IS DEFENSIVE AND THE CANON CANNOT REACH IT. `ASSUMES`
    // runs from five body types and from nothing else, so an assumption cannot
    // hold an assumption in any graph the loader will build — the triple below
    // is one `shall check` refuses, and the file carrying it never reaches the
    // arithmetic. But `attachersOf` selects by EDGE TYPE and never asks what the
    // far node is, so the shape arrives here whole, and `placeAt` prefers a
    // homed attacher over a homeless one for a reason: `NOWHERE` ranks last, and
    // last would win a plain deepest-rank comparison and carry the assumption to
    // the specification side, out of the record that made it.
    //
    // Written against an ungrammatical fixture on purpose. The alternative was a
    // guard nothing pins, which is a guard somebody deletes.
    const assumption = node("Assumption", "AS-0001");
    const homeless = node("Assumption", "AS-0002");
    const queue = queueOf(
      [journal, workLog, assumption, homeless],
      [
        edge("J-0001", "LOGS", "WL-0001"),
        edge("WL-0001", "ASSUMES", "AS-0001"),
        edge("AS-0002", "ASSUMES", "AS-0001"),
      ],
    );
    assert.ok(bundleIds(queue).includes("report:J-0001"));
    assert.ok(memberIds(queue, "report:J-0001").includes("AS-0001"));
    assert.ok(!bundleIds(queue).includes("spec:AS-0001"));
  });

  test("a work log no journal logs is a report of its own", () => {
    // Addressed by a work item and never logged. It is still work somebody has to
    // read, and the execution side is where it belongs.
    const criterion = node("AcceptanceCriterion", "AC-0001");
    const workItem = node("WorkItem", "WI-0001");
    const nodes = [...SPINE, module_, criterion, workItem, workLog];
    const edges = [
      ...SPINE_EDGES,
      ...MODULE_EDGES,
      edge("R-0001", "HAS_CRITERION", "AC-0001"),
      edge("M-0001", "ALLOCATES", "WI-0001"),
      edge("WI-0001", "TARGETS", "AC-0001"),
      edge("WL-0001", "ADDRESSES", "WI-0001"),
    ];
    const queue = queueOf(nodes, edges, {
      green: [...SPINE, module_, criterion, workItem],
    });
    assert.deepEqual(bundleIds(queue), ["report:WL-0001"]);
    assert.deepEqual(memberIds(queue, "report:WL-0001"), ["WL-0001"]);
  });

  test("a finding stays in the report, and a mention does not drag the vocabulary in", () => {
    // A FINDING STARTS NO RELATION AT ALL, so nothing points out of the record
    // at the spec it concerns — the ids it is about sit in its own frontmatter,
    // where nothing resolves them. What still points out is MENTIONS: the log
    // names a term, and the term is not part of the record for it. The counts
    // are over the members and the unchanged together, in canon order.
    const finding = node("Finding", "F-0001");
    // A second finding, already read, is the green member here: an evidence or
    // a report would each need the whole claim-and-aim chain this test is not
    // about — both are anchored by their claim now.
    const noted = node("Finding", "F-0002");
    const term = node("Term", "T-0001");
    const nodes = [...SPINE, journal, workLog, finding, noted, term];
    const edges = [
      ...SPINE_EDGES,
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "RECORDS", "F-0001"),
      edge("WL-0001", "RECORDS", "F-0002"),
      edge("WL-0001", "MENTIONS", "T-0001"),
    ];
    const queue = queueOf(nodes, edges, { green: [...SPINE, noted] });
    // The term is yellow and reached by nobody, so it stands alone — which is
    // the domain rule, and the proof that the report did not take it.
    assert.deepEqual(bundleIds(queue), ["spec:T-0001", "report:J-0001"]);
    const bundle = queue.bundles.find((held) => held.id === "report:J-0001");
    assert.ok(bundle !== undefined && bundle.kind === "work-report");
    assert.deepEqual(bundle.members.map((member) => member.id), [
      "J-0001",
      "WL-0001",
      "F-0001",
    ]);
    assert.deepEqual(bundle.unchanged, [
      {
        id: "F-0002",
        type: "Finding",
        shortName: "F-0002",
        name: "Finding F-0002",
      },
    ]);
    assert.deepEqual(bundle.counts, [
      { type: "Journal", count: 1 },
      { type: "WorkLog", count: 1 },
      { type: "Finding", count: 2 },
    ]);
    assert.equal(bundle.title, "J-0001 Journal J-0001");
    assert.equal(bundle.rootId, "J-0001");
  });

  test("a premature log rides along in the report, red, beside the rows it submitted", () => {
    // The log jumped its turn — the work item it addresses is blocked while the
    // chain is unread — so it is red; but its evidence is still a row a person
    // can judge, and a report that hid the author of its own rows would be a
    // report with a hole in it. So `premature` rides along the way `rejected`
    // does.
    const criterion = node("AcceptanceCriterion", "AC-0001");
    const workItem = node("WorkItem", "WI-0001");
    const evidence = node("Evidence", "EV-0001");
    const nodes = [...SPINE, module_, criterion, workItem, journal, workLog, evidence];
    const edges = [
      ...SPINE_EDGES,
      ...MODULE_EDGES,
      edge("R-0001", "HAS_CRITERION", "AC-0001"),
      edge("M-0001", "ALLOCATES", "WI-0001"),
      edge("WI-0001", "TARGETS", "AC-0001"),
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "WI-0001"),
      edge("WL-0001", "SUBMITS", "EV-0001"),
      edge("EV-0001", "CLAIMS", "AC-0001"),
    ];
    const queue = queueOf(nodes, edges);
    const report = queue.bundles.find((held) => held.id === "report:J-0001");
    assert.ok(report !== undefined && report.kind === "work-report");
    assert.deepEqual(
      report.members.map((member) => [member.id, member.color, member.reason]),
      [
        ["J-0001", "yellow", "unapproved"],
        ["WL-0001", "red", "premature"],
        ["EV-0001", "yellow", "unapproved"],
      ],
    );
  });

  test("a journal whose whole record is approved stands no bundle up", () => {
    const queue = queueOf(
      [journal, workLog],
      [edge("J-0001", "LOGS", "WL-0001")],
      { green: [journal, workLog] },
    );
    assert.deepEqual(bundleIds(queue), []);
  });
});

describe("a standalone finding", () => {
  const journal = node("Journal", "J-0001");
  const workLog = node("WorkLog", "WL-0001");

  test("a finding nobody recorded roots a card of its own, and a recorded one still rides in the report", () => {
    // The two births, in one graph. F-0001 was found inside a turn of work and
    // the log that found it says so, so it is read as part of that report;
    // F-0002 was brought between turns and no log names it, so it is nobody's
    // report and gets a card that says as much.
    const found = node("Finding", "F-0001");
    const brought = node("Finding", "F-0002");
    const nodes = [journal, workLog, found, brought];
    const edges = [
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "RECORDS", "F-0001"),
    ];
    const queue = assertEveryYellowIsBundled(nodes, edges);
    assert.deepEqual(bundleIds(queue), ["report:J-0001", "finding:F-0002"]);
    assert.deepEqual(memberIds(queue, "report:J-0001"), [
      "J-0001",
      "WL-0001",
      "F-0001",
    ]);
    // AND ONCE, NOT TWICE. The pass that mops up report-side roots would take
    // a loose finding as well, so the standalone pass marks it covered; the
    // coverage check above cannot see the difference between one card and two,
    // which is why the absence is spelled out.
    assert.equal(bundleIds(queue).includes("report:F-0002"), false);
    const bundle = queue.bundles.find((held) => held.id === "finding:F-0002");
    assert.ok(bundle !== undefined && bundle.kind === "standalone-finding");
    assert.equal(bundle.rootId, "F-0002");
    assert.equal(bundle.title, "F-0002 Finding F-0002");
    assert.equal(bundle.since, 1);
    assert.deepEqual(
      bundle.members.map((member) => [member.id, member.color, member.reason]),
      [["F-0002", "yellow", "unapproved"]],
    );
    assert.deepEqual(bundle.unchanged, []);
    assert.deepEqual(bundle.counts, [{ type: "Finding", count: 1 }]);
  });

  test("a finding a journal-less work log recorded is that log's report", () => {
    // Recorded is recorded. Nothing logged the log, so the log roots its own
    // report — and the finding it found belongs inside that, not on a card
    // saying nobody's work found it.
    const criterion = node("AcceptanceCriterion", "AC-0001");
    const workItem = node("WorkItem", "WI-0001");
    const finding = node("Finding", "F-0001");
    const nodes = [...SPINE, module_, criterion, workItem, workLog, finding];
    const edges = [
      ...SPINE_EDGES,
      ...MODULE_EDGES,
      edge("R-0001", "HAS_CRITERION", "AC-0001"),
      edge("M-0001", "ALLOCATES", "WI-0001"),
      edge("WI-0001", "TARGETS", "AC-0001"),
      edge("WL-0001", "ADDRESSES", "WI-0001"),
      edge("WL-0001", "RECORDS", "F-0001"),
    ];
    const queue = queueOf(nodes, edges, {
      green: [...SPINE, module_, criterion, workItem],
    });
    assert.deepEqual(bundleIds(queue), ["report:WL-0001"]);
    assert.deepEqual(memberIds(queue, "report:WL-0001"), ["WL-0001", "F-0001"]);
  });

  test("a finding a person has read is no card at all", () => {
    const brought = node("Finding", "F-0001");
    const queue = queueOf([brought], [], { green: [brought] });
    assert.deepEqual(bundleIds(queue), []);
  });

  test("a decision that answers a loose finding does not take it onto its card", () => {
    // The side wall, from the spec side. A decision is held by what it revises
    // and answers a finding besides, so both are yellow at once here — and they
    // are two cards, because dragging a record into a spec approval is exactly
    // what the wall is for.
    const decision = node("Decision", "D-0001");
    const brought = node("Finding", "F-0001");
    const nodes = [...SPINE, decision, brought];
    const edges = [
      ...SPINE_EDGES,
      edge("D-0001", "AFFECTS", "R-0001"),
      edge("D-0001", "RESOLVES", "F-0001"),
    ];
    const queue = assertEveryYellowIsBundled(nodes, edges, { green: SPINE });
    assert.deepEqual(bundleIds(queue), ["spec:D-0001", "finding:F-0001"]);
    assert.equal(memberIds(queue, "spec:D-0001").includes("F-0001"), false);
  });
});

describe("AC closure", () => {
  const criterion = node("AcceptanceCriterion", "AC-0001");
  const workItem = node("WorkItem", "WI-0001");
  const journal = node("Journal", "J-0001");
  const workLog = node("WorkLog", "WL-0001", { commits: ["a1b2c3", "d4e5f6"] });
  const first = node("Evidence", "EV-0001");
  const second = node("Evidence", "EV-0002");
  const third = node("Evidence", "EV-0003");

  // THE AIM CHAIN IS PART OF THE FIXTURE: the log addresses a work item that targets
  // the criterion, so the submitted claims are inside the aim — a log under no
  // work item may submit nothing that claims.
  const NODES = [...SPINE, module_, criterion, workItem, journal, workLog, first, second, third];
  const EDGES = [
    ...SPINE_EDGES,
    ...MODULE_EDGES,
    edge("R-0001", "HAS_CRITERION", "AC-0001"),
    edge("M-0001", "ALLOCATES", "WI-0001"),
    edge("WI-0001", "TARGETS", "AC-0001"),
    edge("J-0001", "LOGS", "WL-0001"),
    edge("WL-0001", "ADDRESSES", "WI-0001"),
    edge("WL-0001", "SUBMITS", "EV-0001"),
    edge("WL-0001", "SUBMITS", "EV-0002"),
    edge("WL-0001", "SUBMITS", "EV-0003"),
    edge("EV-0001", "CLAIMS", "AC-0001"),
    edge("EV-0002", "CLAIMS", "AC-0001"),
    edge("EV-0003", "CLAIMS", "AC-0001"),
  ];
  /** Everything approved — the whole list read, so the criterion is asked about. */
  const SETTLED: Books = {
    green: [...SPINE, module_, criterion, workItem, journal, workLog, first, second, third],
  };
  /** The same graph with EV-0002 unread and EV-0003 refused: not asked about. */
  const UNREAD: Books = {
    green: [...SPINE, module_, criterion, workItem, journal, workLog, first, third],
    rejected: [third],
  };
  /** A criterion left open over a list, as the daemon writes it. */
  function leftOpen(
    subject: SpecNode,
    claimants: readonly SpecNode[],
    edges: readonly SpecEdge[],
    kind: "criterion" | "workItem" = "criterion",
  ): [string, RejectionRecord] {
    return [
      subject.id,
      {
        rejectedHash: hashOf(subject, edges),
        leftOpen: {
          kind,
          claimants: new Map(
            claimants.map((held) => [held.id, hashOf(held, edges)] as const),
          ),
        },
        ...REFUSAL,
      },
    ];
  }

  test("stands up when something claims the criterion, all of it approved, and nobody has spoken", () => {
    const queue = queueOf(NODES, EDGES, SETTLED);
    assert.deepEqual(bundleIds(queue), ["closure:AC-0001"]);
    const bundle = queue.bundles[0];
    assert.ok(bundle !== undefined && bundle.kind === "ac-closure");
    assert.equal(bundle.acId, "AC-0001");
    assert.equal(bundle.title, "AC-0001 AcceptanceCriterion AC-0001");
    assert.equal(bundle.ac.closure, "open");
    // EVERY claimant is the list, in id order.
    assert.deepEqual(bundle.evidence.map((held) => held.id), [
      "EV-0001",
      "EV-0002",
      "EV-0003",
    ]);
    assert.deepEqual(bundle.evidence[0]?.submittedBy, [
      { workLogId: "WL-0001", commits: ["a1b2c3", "d4e5f6"] },
    ]);
    assert.deepEqual(bundle.history, []);
  });

  test("waits while a claimant is unread or refused — the criterion is open, and the report has the row", () => {
    // EV-0002 is yellow and EV-0003 red: no closure bundle. The report carries
    // both rows, and approving EV-0002 (and fixing EV-0003) is what brings the
    // criterion to the queue.
    const queue = queueOf(NODES, EDGES, UNREAD);
    assert.deepEqual(bundleIds(queue), ["report:J-0001"]);
    assert.deepEqual(memberIds(queue, "report:J-0001"), ["EV-0002", "EV-0003"]);
    assert.equal(memberIn(queue, "report:J-0001", "EV-0003").reason, "rejected");
    const status = reviewGraph(
      graphOf(NODES, EDGES),
      {
        approvals: new Map((UNREAD.green ?? []).map((held) => approve(held, EDGES))),
        rejections: new Map([reject(third, EDGES)]),
        acceptances: new Map(),
        hash,
      },
    ).statuses.find((held) => held.id === "AC-0001");
    assert.equal(status?.closure, "open");
  });

  test("waits while the criterion's own words are unread or refused", () => {
    // A YELLOW CRITERION IS A SPEC QUESTION AND NOT YET A CLOSURE ONE. It is in
    // the approval bundle — that is the question being asked about it — and the
    // closure question waits for the answer: there is nothing settled for the
    // evidence to be met against.
    const queue = queueOf(NODES, EDGES, {
      green: [...SPINE, module_, workItem, journal, workLog, first, second, third],
    });
    assert.deepEqual(bundleIds(queue), ["spec:AC-0001"]);
    // Refused, it is the agent's turn and out of the queue altogether — nothing
    // yellow reaches the red criterion here.
    const refused = queueOf(NODES, EDGES, {
      green: [...SPINE, module_, workItem, journal, workLog, first, second, third],
      rejected: [criterion],
    });
    assert.deepEqual(bundleIds(refused), []);
  });

  test("stays away when nothing claims the criterion yet", () => {
    const queue = queueOf(
      NODES.filter((held) => held.type !== "Evidence"),
      EDGES.filter((held) => held.type !== "SUBMITS" && held.type !== "CLAIMS"),
      { green: [...SPINE, module_, criterion, workItem, journal, workLog] },
    );
    assert.equal(
      queue.bundles.some((held) => held.kind === "ac-closure"),
      false,
    );
  });

  test("stays away while an acceptance over this list stands, and comes back when the list moves", () => {
    const closed = queueOf(NODES, EDGES, {
      ...SETTLED,
      accepted: [[criterion, [first, second, third]]],
    });
    assert.equal(
      closed.bundles.some((held) => held.kind === "ac-closure"),
      false,
    );
    // Closed over two of the three: a different list, so it is asked again.
    const stale = queueOf(NODES, EDGES, {
      ...SETTLED,
      accepted: [[criterion, [first, second]]],
    });
    assert.deepEqual(bundleIds(stale), ["closure:AC-0001"]);
  });

  test("stays away while a criterion left open over this list stands", () => {
    // The other exit: a person said "not met, and here is why". The word is in
    // the rejection ledger under the criterion's id, and it does not make the
    // criterion red or put it in a spec bundle.
    // `Books.rejected` writes node rejections; the left-open record is a
    // different shape and is built by hand beside the node rejection of EV-0003.
    const ledgers = {
      approvals: new Map((SETTLED.green ?? []).map((held) => approve(held, EDGES))),
      rejections: new Map([leftOpen(criterion, [first, second, third], EDGES)]),
      acceptances: new Map(),
      hash,
    };
    const asked = reviewBundles(graphOf(NODES, EDGES), ledgers);
    assert.deepEqual(bundleIds(asked), []);
    // The criterion is not red for it: the word is about the list.
    const status = reviewGraph(graphOf(NODES, EDGES), ledgers).statuses.find(
      (held) => held.id === "AC-0001",
    );
    assert.equal(status?.color, "green");
    assert.equal(status?.leftOpen?.rationale, REFUSAL.rationale);
  });
});

describe("work item closure", () => {
  const module = node("Module", "M-0001");
  const workItem = node("WorkItem", "WI-0001");
  const second = node("WorkItem", "WI-0002");
  const criterion = node("AcceptanceCriterion", "AC-0001");
  const journal = node("Journal", "J-0001");
  const log = node("WorkLog", "WL-0001", { commits: ["a1b2c3"] });
  const otherLog = node("WorkLog", "WL-0002", { commits: [] });
  const first = node("CompletionReport", "CR-0001");
  const later = node("CompletionReport", "CR-0002");

  // THE CLAIMANTS ARE COMPLETION REPORTS: each is submitted by a log that
  // addresses the work item, and claims that one work item — the aim rule's shape for
  // reports, kept legal so what is under test is the closure and not the aim.
  const NODES = [
    ...SPINE,
    criterion,
    module,
    workItem,
    second,
    journal,
    log,
    otherLog,
    first,
    later,
  ];
  const EDGES = [
    ...SPINE_EDGES,
    edge("R-0001", "HAS_CRITERION", "AC-0001"),
    edge("SR-0001", "IS_REALIZED_BY", "M-0001"),
    edge("M-0001", "ALLOCATES", "WI-0001"),
    edge("M-0001", "ALLOCATES", "WI-0002"),
    edge("WI-0001", "TARGETS", "AC-0001"),
    edge("J-0001", "LOGS", "WL-0001"),
    edge("J-0001", "LOGS", "WL-0002"),
    edge("WL-0001", "ADDRESSES", "WI-0001"),
    edge("WL-0002", "ADDRESSES", "WI-0001"),
    edge("WL-0001", "SUBMITS", "CR-0001"),
    edge("WL-0002", "SUBMITS", "CR-0002"),
    edge("CR-0001", "CLAIMS", "WI-0001"),
    edge("CR-0002", "CLAIMS", "WI-0001"),
  ];
  /** Everything read — so the work item is asked about and nothing else is waiting. */
  const SETTLED: Books = { green: NODES };

  test("stands up when reports claim the work item, all of it approved, and nobody has spoken", () => {
    const queue = queueOf(NODES, EDGES, SETTLED);
    assert.deepEqual(bundleIds(queue), ["completion:WI-0001"]);
    const bundle = queue.bundles[0];
    assert.ok(bundle !== undefined && bundle.kind === "work-item-closure");
    assert.equal(bundle.workItemId, "WI-0001");
    assert.equal(bundle.title, "WI-0001 WorkItem WI-0001");
    assert.equal(bundle.workItem.closure, "open");
    assert.deepEqual(
      bundle.reports.map((held) => held.id),
      ["CR-0001", "CR-0002"],
    );
    // The thread back to the work: who submitted the report, and its commits.
    assert.deepEqual(bundle.reports[0]?.submittedBy, [
      { workLogId: "WL-0001", commits: ["a1b2c3"] },
    ]);
    // The criteria it aimed at travel as context, with their own marks.
    assert.deepEqual(bundle.targets, [
      { id: "AC-0001", name: "AcceptanceCriterion AC-0001", closure: "open" },
    ]);
    assert.deepEqual(bundle.history, []);
  });

  test("waits while a report is unread, and asks again once it is approved", () => {
    const queue = queueOf(NODES, EDGES, {
      green: NODES.filter((held) => held.id !== "CR-0002"),
    });
    assert.equal(bundleIds(queue).includes("completion:WI-0001"), false);
    assert.deepEqual(memberIds(queue, "report:J-0001"), ["CR-0002"]);
  });

  test("leaves the queue on either word, and comes back when the list moves", () => {
    const closed = queueOf(NODES, EDGES, {
      ...SETTLED,
      accepted: [[workItem, [first, later]]],
    });
    assert.deepEqual(bundleIds(closed), []);

    // A third report claims the work item: a different list, so the question is
    // asked again even though the record still names the first two.
    const third = node("CompletionReport", "CR-0003");
    const grown = [...NODES, third];
    const wired = [
      ...EDGES,
      edge("WL-0001", "SUBMITS", "CR-0003"),
      edge("CR-0003", "CLAIMS", "WI-0001"),
    ];
    const again = queueOf(grown, wired, {
      green: grown,
      accepted: [[workItem, [first, later]]],
    });
    assert.deepEqual(bundleIds(again), ["completion:WI-0001"]);
  });

  test("a report claiming two work items is the aim rule's red, and neither work item is asked", () => {
    // The sharedWith mechanics a work log used to have are impossible here by
    // cardinality: a completion report claims exactly one work item, so a second
    // CLAIMS line is a breach — not a second seat.
    const wired = [...EDGES, edge("CR-0001", "CLAIMS", "WI-0002")];
    const queue = queueOf(NODES, wired, { green: NODES });
    assert.equal(
      queue.bundles.some((held) => held.kind === "work-item-closure"),
      false,
    );
  });

  test("a refused report is a hearing on the work item's card", () => {
    // The report is red, so the work item is not asked about at all — and once it
    // is fixed and approved, the refusal that happened is on the card as
    // history.
    const queue = queueOf(NODES, EDGES, {
      green: NODES,
      rejected: [later],
    });
    assert.equal(bundleIds(queue).includes("completion:WI-0001"), false);

    const fixed = { ...later, body: "The retry, now shown." };
    const healed = queueOf(
      NODES.map((held) => (held.id === "CR-0002" ? fixed : held)),
      EDGES,
      {
        green: NODES.map((held) => (held.id === "CR-0002" ? fixed : held)),
        rejected: [later],
      },
    );
    const bundle = healed.bundles.find(
      (held) => held.id === "completion:WI-0001",
    );
    assert.ok(bundle !== undefined && bundle.kind === "work-item-closure");
    assert.deepEqual(
      bundle.history.map((row) => row.reportId),
      ["CR-0002"],
    );
  });

  test("waits while the work item's own words are unread — the very state that made this rule", () => {
    // Reported from a screen: a green, closed work item was edited, so it went
    // yellow, the queue offered BOTH the approval and the closure, closing
    // worked, and the board showed a yellow work item wearing a green Done. The
    // closure question now waits for the approval.
    const queue = queueOf(NODES, EDGES, {
      green: NODES.filter((held) => held.id !== "WI-0001"),
    });
    assert.deepEqual(bundleIds(queue), ["spec:WI-0001"]);
    assert.equal(bundleIds(queue).includes("completion:WI-0001"), false);
  });

  test("is not asked while the work item's own wording is refused", () => {
    const queue = queueOf(NODES, EDGES, {
      green: NODES.filter((held) => held.id !== "WI-0001"),
      rejected: [workItem],
    });
    assert.equal(bundleIds(queue).includes("completion:WI-0001"), false);
  });
});

describe("the order of the queue", () => {
  test("closures first, then approvals, then reports, then a finding nobody recorded", () => {
    const criterion = node("AcceptanceCriterion", "AC-0001");
    const journal = node("Journal", "J-0001");
    const workLog = node("WorkLog", "WL-0001");
    const evidence = node("Evidence", "EV-0001");
    const term = node("Term", "T-0001");
    const brought = node("Finding", "F-0001");
    const nodes = [
      ...SPINE,
      criterion,
      journal,
      workLog,
      evidence,
      term,
      brought,
    ];
    const edges = [
      ...SPINE_EDGES,
      edge("R-0001", "HAS_CRITERION", "AC-0001"),
      edge("J-0001", "LOGS", "WL-0001"),
      // Nothing submits the evidence: submitted, its claim would answer to the
      // aim rule, and this test is about the order of kinds and not the aim.
      edge("EV-0001", "CLAIMS", "AC-0001"),
      edge("R-0001", "MENTIONS", "T-0001"),
    ];
    const queue = queueOf(nodes, edges, {
      green: [...SPINE, criterion, evidence],
    });
    assert.deepEqual(bundleIds(queue), [
      "closure:AC-0001",
      "spec:T-0001",
      "report:J-0001",
      "finding:F-0001",
    ]);
  });

  test("inside a kind, the oldest thing waiting comes first", () => {
    const older = node("Term", "T-0002", { updatedAt: 3 });
    const newer = node("Term", "T-0001", { updatedAt: 9 });
    const queue = queueOf([older, newer], []);
    assert.deepEqual(bundleIds(queue), ["spec:T-0002", "spec:T-0001"]);
    assert.deepEqual(
      queue.bundles.map((bundle) => bundle.since),
      [3, 9],
    );
  });
});
