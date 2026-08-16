import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  NODE_TYPES,
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
  ac: SpecNode,
  evidence: readonly SpecNode[],
  edges: readonly SpecEdge[],
): [string, AcceptanceRecord] {
  return [
    ac.id,
    {
      acHash: hashOf(ac, edges),
      evidence: new Map(
        evidence.map((held) => [held.id, hashOf(held, edges)] as const),
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
  return bundle.kind === "ac-closure"
    ? [bundle.ac, ...bundle.evidence]
    : bundle.members;
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

  test("the three satellites are flagged, and every body type is not", () => {
    assert.deepEqual(scanRankOf("Decision"), {
      rank: 19,
      satellite: true,
    });
    assert.deepEqual(scanRankOf("Goal"), { rank: 0, satellite: false });
  });
});

describe("every yellow node is in at least one bundle", () => {
  test("an intent spine nobody has approved", () => {
    assertEveryYellowIsBundled(SPINE, SPINE_EDGES);
  });

  test("a report with a satellite and a finding hanging off it", () => {
    const journal = node("Journal", "J-0001");
    const workLog = node("WorkLog", "WL-0001");
    const question = node("Question", "Q-0001");
    const finding = node("Finding", "F-0001");
    assertEveryYellowIsBundled(
      [...SPINE, journal, workLog, question, finding],
      [
        ...SPINE_EDGES,
        edge("J-0001", "LOGS", "WL-0001"),
        edge("WL-0001", "RAISES", "Q-0001"),
        edge("WL-0001", "RECORDS", "F-0001"),
        edge("F-0001", "ESCALATES", "R-0001"),
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

  test("a decision is read backwards into the requirement it affects", () => {
    // Its AFFECTS points at the parent. Followed forwards, one yellow decision
    // would swallow the requirement subtree it merely comments on.
    const decision = node("Decision", "D-0001");
    const queue = queueOf(
      [...SPINE, decision],
      [...SPINE_EDGES, edge("D-0001", "AFFECTS", "R-0001")],
      { green: ABOVE },
    );
    assert.deepEqual(bundleIds(queue), ["spec:R-0001"]);
    assert.deepEqual(memberIds(queue, "spec:R-0001"), ["R-0001", "D-0001"]);
    const bundle = queue.bundles[0];
    assert.ok(bundle !== undefined && bundle.kind === "spec-approval");
    assert.deepEqual(bundle.counts, [
      { type: "Requirement", count: 1 },
      { type: "Decision", count: 1 },
    ]);
  });

  test("a decision that resolves a question takes the question's rank, not the last one", () => {
    // The rank recurses through the satellite chain: D → Q → R. Ranked at the
    // fallback instead, the decision would sort after the question rather than
    // beside it.
    const question = node("Question", "Q-0001");
    const decision = node("Decision", "D-0001");
    const queue = queueOf(
      [...SPINE, question, decision],
      [
        ...SPINE_EDGES,
        edge("R-0001", "RAISES", "Q-0001"),
        edge("D-0001", "RESOLVES", "Q-0001"),
      ],
      { green: ABOVE },
    );
    assert.deepEqual(bundleIds(queue), ["spec:R-0001"]);
    assert.deepEqual(memberIds(queue, "spec:R-0001"), [
      "R-0001",
      "D-0001",
      "Q-0001",
    ]);
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

  test("a cycle of DEPENDS_ON terminates and makes one bundle", () => {
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
    assert.deepEqual(bundleIds(queue), ["spec:R-0001"]);
    assert.deepEqual(memberIds(queue, "spec:R-0001"), ["R-0001", "R-0002"]);
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

  test("a question a work log raised belongs to the report and roots nothing", () => {
    const question = node("Question", "Q-0001");
    const queue = queueOf(
      [journal, workLog, question],
      [
        edge("J-0001", "LOGS", "WL-0001"),
        edge("WL-0001", "RAISES", "Q-0001"),
      ],
    );
    assert.deepEqual(bundleIds(queue), ["report:J-0001"]);
    assert.deepEqual(memberIds(queue, "report:J-0001"), [
      "J-0001",
      "WL-0001",
      "Q-0001",
    ]);
  });

  test("a decision whose one question hangs off nothing still goes with the work log its other question was raised by", () => {
    // Two questions: one raised by the work log, one raised by nobody (an
    // orphan, red by the anchor rules). The decision resolves both. Its place
    // must follow the LIVING, HOMED chain — through Q-0001 to WL-0001, into the
    // report — and not the homeless one, whose fallback rank happens to be the
    // last one and would win a plain "deepest" comparison.
    const asked = node("Question", "Q-0001");
    const stray = node("Question", "Q-0002");
    const decision = node("Decision", "D-0001");
    const queue = queueOf(
      [journal, workLog, asked, stray, decision],
      [
        edge("J-0001", "LOGS", "WL-0001"),
        edge("WL-0001", "RAISES", "Q-0001"),
        edge("D-0001", "RESOLVES", "Q-0001"),
        edge("D-0001", "RESOLVES", "Q-0002"),
      ],
      { green: [journal, workLog] },
    );
    // Q-0001 is yellow, so the report stands; D-0001 is read backwards into
    // Q-0001's report and is not a report — or a spec approval — of its own.
    // The two share a rank (the decision takes the question's), so the id
    // decides the order between them.
    assert.deepEqual(bundleIds(queue), ["report:J-0001"]);
    assert.deepEqual(memberIds(queue, "report:J-0001"), ["D-0001", "Q-0001"]);
  });

  test("a work log no journal logs is a report of its own", () => {
    // Addressed by a task and never logged. It is still work somebody has to
    // read, and the execution side is where it belongs.
    const criterion = node("AcceptanceCriterion", "AC-0001");
    const task = node("ImplementationTask", "IT-0001");
    const nodes = [...SPINE, criterion, task, workLog];
    const edges = [
      ...SPINE_EDGES,
      edge("R-0001", "HAS_CRITERION", "AC-0001"),
      edge("IT-0001", "TARGETS", "AC-0001"),
      edge("WL-0001", "ADDRESSES", "IT-0001"),
    ];
    const queue = queueOf(nodes, edges, {
      green: [...SPINE, criterion, task],
    });
    assert.deepEqual(bundleIds(queue), ["report:WL-0001"]);
    assert.deepEqual(memberIds(queue, "report:WL-0001"), ["WL-0001"]);
  });

  test("a finding that escalates does not drag the requirement into the report", () => {
    // ESCALATES points OUT of the record at something the report is about. The
    // counts are over the members and the unchanged together, in canon order.
    const finding = node("Finding", "F-0001");
    const evidence = node("Evidence", "EV-0001");
    const nodes = [...SPINE, journal, workLog, finding, evidence];
    const edges = [
      ...SPINE_EDGES,
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "RECORDS", "F-0001"),
      edge("WL-0001", "SUBMITS", "EV-0001"),
      edge("F-0001", "ESCALATES", "R-0001"),
    ];
    const queue = queueOf(nodes, edges, { green: [...SPINE, evidence] });
    assert.deepEqual(bundleIds(queue), ["report:J-0001"]);
    const bundle = queue.bundles[0];
    assert.ok(bundle !== undefined && bundle.kind === "work-report");
    assert.deepEqual(bundle.members.map((member) => member.id), [
      "J-0001",
      "WL-0001",
      "F-0001",
    ]);
    assert.deepEqual(bundle.unchanged, [
      {
        id: "EV-0001",
        type: "Evidence",
        shortName: "EV-0001",
        name: "Evidence EV-0001",
      },
    ]);
    assert.deepEqual(bundle.counts, [
      { type: "Journal", count: 1 },
      { type: "WorkLog", count: 1 },
      { type: "Evidence", count: 1 },
      { type: "Finding", count: 1 },
    ]);
    assert.equal(bundle.title, "J-0001 Journal J-0001");
    assert.equal(bundle.rootId, "J-0001");
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

describe("AC closure", () => {
  const criterion = node("AcceptanceCriterion", "AC-0001");
  const journal = node("Journal", "J-0001");
  const workLog = node("WorkLog", "WL-0001", { commits: ["a1b2c3", "d4e5f6"] });
  const first = node("Evidence", "EV-0001");
  const second = node("Evidence", "EV-0002");
  const third = node("Evidence", "EV-0003");

  const NODES = [...SPINE, criterion, journal, workLog, first, second, third];
  const EDGES = [
    ...SPINE_EDGES,
    edge("R-0001", "HAS_CRITERION", "AC-0001"),
    edge("J-0001", "LOGS", "WL-0001"),
    edge("WL-0001", "SUBMITS", "EV-0001"),
    edge("WL-0001", "SUBMITS", "EV-0002"),
    edge("WL-0001", "SUBMITS", "EV-0003"),
    edge("EV-0001", "CLAIMS", "AC-0001"),
    edge("EV-0002", "CLAIMS", "AC-0001"),
    edge("EV-0003", "CLAIMS", "AC-0001"),
  ];
  /** Everything approved — the whole list read, so the criterion is asked about. */
  const SETTLED: Books = {
    green: [...SPINE, criterion, journal, workLog, first, second, third],
  };
  /** The same graph with EV-0002 unread and EV-0003 refused: not asked about. */
  const UNREAD: Books = {
    green: [...SPINE, criterion, journal, workLog, first, third],
    rejected: [third],
  };
  /** A criterion left open over a list, as the daemon writes it. */
  function leftOpen(
    ac: SpecNode,
    evidence: readonly SpecNode[],
    edges: readonly SpecEdge[],
  ): [string, RejectionRecord] {
    return [
      ac.id,
      {
        rejectedHash: hashOf(ac, edges),
        evidence: new Map(
          evidence.map((held) => [held.id, hashOf(held, edges)] as const),
        ),
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

  test("asks about a yellow criterion too — but not one whose own wording is refused", () => {
    // The criterion is yellow here: it is in a spec bundle AND, because
    // approved evidence claims it and nobody has spoken, in a closure bundle too.
    const queue = queueOf(NODES, EDGES, {
      green: [...SPINE, journal, workLog, first, second, third],
    });
    assert.deepEqual(bundleIds(queue), ["closure:AC-0001", "spec:AC-0001"]);
    // Refuse the criterion's wording, and the closure question waits: words a
    // person said are wrong are not words anything can be met against. Nothing
    // yellow reaches the red criterion here, so it is the agent's turn and out
    // of the queue altogether.
    const refused = queueOf(NODES, EDGES, {
      green: [...SPINE, journal, workLog, first, second, third],
      rejected: [criterion],
    });
    assert.deepEqual(bundleIds(refused), []);
  });

  test("stays away when nothing claims the criterion yet", () => {
    const queue = queueOf(
      NODES.filter((held) => held.type !== "Evidence"),
      EDGES.filter((held) => held.type !== "SUBMITS" && held.type !== "CLAIMS"),
      { green: [...SPINE, criterion, journal, workLog] },
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

describe("the order of the queue", () => {
  test("closures first, then approvals, then reports", () => {
    const criterion = node("AcceptanceCriterion", "AC-0001");
    const journal = node("Journal", "J-0001");
    const workLog = node("WorkLog", "WL-0001");
    const evidence = node("Evidence", "EV-0001");
    const term = node("Term", "T-0001");
    const nodes = [...SPINE, criterion, journal, workLog, evidence, term];
    const edges = [
      ...SPINE_EDGES,
      edge("R-0001", "HAS_CRITERION", "AC-0001"),
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "SUBMITS", "EV-0001"),
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
