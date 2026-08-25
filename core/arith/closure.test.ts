import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
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
import { colorContextOf, type Ledgers, type PayloadHash } from "./color.js";
import {
  claimantHashesOf,
  claimantsOf,
  closureAsks,
  closureOf,
  isAcceptanceStanding,
  isLeftOpenStanding,
  unapprovedClaimantsOf,
} from "./closure.js";
import { reviewGraph, type ReviewStatus } from "./review.js";

/**
 * Closure — whether an acceptance criterion is MET — over graphs built by hand,
 * with the identity hash the colour tests use for the same reason: a record can
 * then say what it is taken over, and be wrong out loud rather than opaque.
 *
 * WHAT IS UNDER TEST IS THE THREE CLAUSES AND THE GREEN-ONLY RULE. The
 * arithmetic itself — that a content hash moves when a body moves — is the
 * colour chain's, and it is not proven again here.
 */

const hash: PayloadHash = (payload: string) => `sha256:${payload}`;

const APPROVER = { by: "t", at: "2026-08-15T00:00:00Z" };
const ACCEPTOR = { by: "t", at: "2026-08-16T00:00:00Z" };
const REFUSAL = {
  by: "t",
  at: "2026-08-16T12:00:00Z",
  rationale: "The run it shows is not the run the criterion asks for.",
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

function graphOf(nodes: SpecNode[], edges: SpecEdge[]): SpecGraph {
  return { nodes, edges, problems: [], refused: [] };
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

/** One closing, over the subject and its claimants exactly as they stand here. */
function accept(
  subject: SpecNode,
  claimants: readonly SpecNode[],
  edges: readonly SpecEdge[],
  kind: "criterion" | "workItem" = "criterion",
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

function booksOf(parts: {
  approvals?: [string, ApprovalRecord][];
  rejections?: [string, RejectionRecord][];
  acceptances?: [string, AcceptanceRecord][];
}): Ledgers {
  return {
    approvals: new Map(parts.approvals ?? []),
    rejections: new Map(parts.rejections ?? []),
    acceptances: new Map(parts.acceptances ?? []),
    hash,
  };
}

/**
 * The one fixture: a requirement with a criterion, a journal with a work log,
 * and whatever evidence a test hands it — every piece of it anchored, so that
 * nothing in this file is red for a reason closure has no opinion about.
 */
const responsibility = node("SystemResponsibility", "SR-0001");
const requirement = node("Requirement", "R-0001");
const criterion = node("AcceptanceCriterion", "AC-0001");
const journal = node("Journal", "J-0001");
const workLog = node("WorkLog", "WL-0001");

const SPINE: SpecEdge[] = [
  edge("SR-0001", "REQUIRES", "R-0001"),
  edge("R-0001", "HAS_CRITERION", "AC-0001"),
  edge("J-0001", "LOGS", "WL-0001"),
];

/**
 * The fixture with these claimants wired in, claiming the AC — and SUBMITTED BY
 * NOBODY, deliberately: a submitted claim answers to the aim rule (it may claim
 * only what its log's addressed work items target), and this file is about closure,
 * not aim. The claim alone anchors an Evidence.
 */
function world(...claimants: SpecNode[]): {
  graph: SpecGraph;
  edges: SpecEdge[];
} {
  const edges = [...SPINE];
  for (const claimant of claimants) {
    edges.push(edge(claimant.id, "CLAIMS", "AC-0001"));
  }
  return {
    graph: graphOf(
      [responsibility, requirement, criterion, journal, workLog, ...claimants],
      edges,
    ),
    edges,
  };
}

function markOf(graph: SpecGraph, ledgers: Ledgers, id: string): ReviewStatus["closure"] {
  return (
    reviewGraph(graph, ledgers).statuses.find((held) => held.id === id)
      ?.closure ?? null
  );
}

const evidence = node("Evidence", "EV-0001");
const second = node("Evidence", "EV-0002");

describe("a standing acceptance", () => {
  test("closes the criterion when both clauses hold", () => {
    const { graph, edges } = world(evidence);
    const ledgers = booksOf({
      approvals: [approve(criterion, edges), approve(evidence, edges)],
      acceptances: [accept(criterion, [evidence], edges)],
    });
    assert.equal(markOf(graph, ledgers, "AC-0001"), "closed");
    // And the same answer through the function itself, not only the review.
    assert.equal(closureOf(criterion, colorContextOf(graph, ledgers)), "closed");
  });

  test("reopens when the criterion itself was reworded", () => {
    // The closing was about the old sentence. Nobody has judged the new one.
    const { graph, edges } = world(evidence);
    const record = accept(criterion, [evidence], edges);
    const reworded = { ...criterion, body: "Something rather stricter." };
    const moved = graphOf(
      [responsibility, requirement, reworded, journal, workLog, evidence],
      edges,
    );
    const ledgers = booksOf({
      approvals: [approve(evidence, edges)],
      acceptances: [record],
    });
    assert.equal(markOf(moved, ledgers, "AC-0001"), "open");
    assert.equal(
      isAcceptanceStanding(record[1], reworded, colorContextOf(moved, ledgers)),
      false,
    );
  });

  test("reopens when a piece of the evidence it names is gone", () => {
    // The record outlives the file, and a criterion closed on a file nobody has
    // any more is a criterion closed on nothing.
    const { graph, edges } = world(evidence);
    const ledgers = booksOf({
      approvals: [approve(criterion, edges), approve(evidence, edges)],
      acceptances: [
        [
          criterion.id,
          {
            kind: "criterion" as const,
            subjectHash: hashOf(criterion, edges),
            claimants: new Map([["EV-0404", "sha256:whatever"]]),
            ...ACCEPTOR,
          },
        ],
      ],
    });
    assert.equal(markOf(graph, ledgers, "AC-0001"), "open");
  });

  test("reopens when a piece of the evidence it names was rewritten under it", () => {
    // The whole reason the record is a map of hashes and not a list of ids.
    const { edges } = world(evidence);
    const record = accept(criterion, [evidence], edges);
    const rewritten = { ...evidence, body: "A different run entirely." };
    const moved = graphOf(
      [responsibility, requirement, criterion, journal, workLog, rewritten],
      edges,
    );
    const ledgers = booksOf({
      approvals: [approve(criterion, edges)],
      acceptances: [record],
    });
    assert.equal(markOf(moved, ledgers, "AC-0001"), "open");
  });
});

/** One leaving-open, over the subject and its claimants exactly as they stand here. */
function leaveOpen(
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

function statusOf(graph: SpecGraph, ledgers: Ledgers, id: string): ReviewStatus {
  const held = reviewGraph(graph, ledgers).statuses.find((row) => row.id === id);
  assert.ok(held !== undefined, `no status for ${id}`);
  return held;
}

describe("the list is what was judged", () => {
  test("a claimant the record does not name reopens the criterion, whatever its colour", () => {
    // New evidence turned up under a closed criterion. Whoever closed it never
    // saw this, and the colour of the newcomer is not the point — an agent's
    // fresh claim is exactly what must put the question back to a person.
    const { graph, edges } = world(evidence, second);
    const yellowNewcomer = booksOf({
      approvals: [approve(criterion, edges), approve(evidence, edges)],
      acceptances: [accept(criterion, [evidence], edges)],
    });
    assert.equal(markOf(graph, yellowNewcomer, "AC-0001"), "open");
    const greenNewcomer = booksOf({
      approvals: [
        approve(criterion, edges),
        approve(evidence, edges),
        approve(second, edges),
      ],
      acceptances: [accept(criterion, [evidence], edges)],
    });
    assert.equal(markOf(graph, greenNewcomer, "AC-0001"), "open");
  });

  test("a claimant a person refused is still on the list, and a record naming it stands", () => {
    // Colour is no clause: the refused claimant is attached, so a record that
    // names it stands, and one that does not is a different list.
    const { graph, edges } = world(evidence, second);
    const named = booksOf({
      approvals: [approve(criterion, edges), approve(evidence, edges)],
      rejections: [reject(second, edges)],
      acceptances: [accept(criterion, [evidence, second], edges)],
    });
    assert.equal(markOf(graph, named, "AC-0001"), "closed");
    const unnamed = booksOf({
      approvals: [approve(criterion, edges), approve(evidence, edges)],
      rejections: [reject(second, edges)],
      acceptances: [accept(criterion, [evidence], edges)],
    });
    assert.equal(markOf(graph, unnamed, "AC-0001"), "open");
  });

  test("closes over an unapproved criterion and unapproved evidence alike — the axes do not meet", () => {
    const { graph, edges } = world(evidence);
    const ledgers = booksOf({ acceptances: [accept(criterion, [evidence], edges)] });
    const held = statusOf(graph, ledgers, "AC-0001");
    assert.equal(held.color, "yellow");
    assert.equal(held.closure, "closed");
  });
});

describe("a criterion left open", () => {
  test("is open, says who left it and why, and colours nothing", () => {
    // The word lives in the rejection ledger under the criterion's id, with the
    // list beside it — and it is NOT a rejection of the criterion: the node stays
    // whatever colour its own books make it, and `rejection` is null.
    const { graph, edges } = world(evidence);
    const ledgers = booksOf({
      approvals: [approve(criterion, edges), approve(evidence, edges)],
      rejections: [leaveOpen(criterion, [evidence], edges)],
    });
    const held = statusOf(graph, ledgers, "AC-0001");
    assert.equal(held.color, "green");
    assert.equal(held.reason, "approved");
    assert.equal(held.rejection, null);
    assert.equal(held.closure, "open");
    assert.deepEqual(held.leftOpen, {
      by: REFUSAL.by,
      at: REFUSAL.at,
      rationale: REFUSAL.rationale,
    });
  });

  test("lapses when the criterion or the list moves, exactly as an acceptance does", () => {
    const { graph, edges } = world(evidence, second);
    // Judged over one claimant; two now claim → the word no longer describes
    // the list, so it lapses and the queue asks again.
    const stale = booksOf({
      approvals: [approve(criterion, edges), approve(evidence, edges)],
      rejections: [leaveOpen(criterion, [evidence], edges)],
    });
    assert.equal(statusOf(graph, stale, "AC-0001").leftOpen, null);
    // Judged over both → stands.
    const fresh = booksOf({
      approvals: [approve(criterion, edges), approve(evidence, edges)],
      rejections: [leaveOpen(criterion, [evidence, second], edges)],
    });
    assert.notEqual(statusOf(graph, fresh, "AC-0001").leftOpen, null);
    // Reworded criterion → lapses.
    const reworded = node("AcceptanceCriterion", "AC-0001", { body: "Something else." });
    const other = graphOf(
      [responsibility, requirement, reworded, journal, workLog, evidence, second],
      edges,
    );
    assert.equal(statusOf(other, fresh, "AC-0001").leftOpen, null);
  });

  test("a rejection of the criterion's own words is a different record and turns it red", () => {
    const { graph, edges } = world(evidence);
    const ledgers = booksOf({
      approvals: [approve(criterion, edges)],
      rejections: [reject(criterion, edges)],
    });
    const held = statusOf(graph, ledgers, "AC-0001");
    assert.equal(held.color, "red");
    assert.equal(held.reason, "rejected");
    assert.notEqual(held.rejection, null);
    assert.equal(held.leftOpen, null);
  });

  test("when a half-finished write leaves both words standing, the later one is read", () => {
    const { graph, edges } = world(evidence);
    const [id, closed] = accept(criterion, [evidence], edges);
    const [, opened] = leaveOpen(criterion, [evidence], edges);
    const later = { ...opened, at: "2026-08-17T00:00:00Z" };
    const ledgers = booksOf({
      acceptances: [[id, closed]],
      rejections: [[id, later]],
    });
    assert.equal(markOf(graph, ledgers, "AC-0001"), "open");
    const earlier = { ...opened, at: "2026-08-15T00:00:00Z" };
    const reversed = booksOf({
      acceptances: [[id, closed]],
      rejections: [[id, earlier]],
    });
    assert.equal(markOf(graph, reversed, "AC-0001"), "closed");
  });
});

describe("what the queue asks about", () => {
  test("asks while something claims the criterion, every claimant is approved, and nobody has spoken", () => {
    const { graph, edges } = world(evidence);
    const context = colorContextOf(
      graph,
      booksOf({ approvals: [approve(criterion, edges), approve(evidence, edges)] }),
    );
    assert.equal(closureAsks(criterion, context), true);
  });

  test("does not ask while the criterion's own words are unread", () => {
    // BOTH SIDES HAVE TO BE GREEN. "Met" is a statement about words somebody
    // agreed to; a criterion still being edited has nothing settled to be met
    // against, and closing over one is what produced a yellow node wearing a
    // green Done.
    const { graph, edges } = world(evidence);
    const yellowCriterion = colorContextOf(
      graph,
      booksOf({ approvals: [approve(evidence, edges)] }),
    );
    assert.equal(closureAsks(criterion, yellowCriterion), false);
    assert.equal(closureOf(criterion, yellowCriterion), "open");

    // Approving it is what brings the question — nothing else moved.
    const settled = colorContextOf(
      graph,
      booksOf({ approvals: [approve(criterion, edges), approve(evidence, edges)] }),
    );
    assert.equal(closureAsks(criterion, settled), true);
  });

  test("a record made while everything was green keeps standing", () => {
    // THE GATE IS ON ASKING AND NOT ON STANDING. Nothing sweeps a closed
    // criterion when the graph moves around it — and editing the criterion
    // itself moves its hash, which reopens it by arithmetic, so the forbidden
    // state cannot be reached the long way round either.
    const { graph, edges } = world(evidence);
    const ledgers = booksOf({
      approvals: [approve(criterion, edges), approve(evidence, edges)],
      acceptances: [accept(criterion, [evidence], edges)],
    });
    assert.equal(markOf(graph, ledgers, "AC-0001"), "closed");
    const reworded = { ...criterion, body: "Something else entirely." };
    const moved = graphOf(
      [responsibility, requirement, reworded, journal, workLog, evidence],
      edges,
    );
    assert.equal(markOf(moved, ledgers, "AC-0001"), "open");
  });

  test("does not ask while a claimant is unapproved — the criterion is simply open", () => {
    // A claim nobody has read is not yet a claim a person can judge on. The
    // criterion stays open and off the queue; approving the claimant is what
    // brings it there. A red (refused) claimant holds it off the same way.
    const { graph, edges } = world(evidence, second);
    const oneYellow = colorContextOf(
      graph,
      booksOf({ approvals: [approve(criterion, edges), approve(evidence, edges)] }),
    );
    assert.equal(closureAsks(criterion, oneYellow), false);
    assert.equal(closureOf(criterion, oneYellow), "open");
    const oneRed = colorContextOf(
      graph,
      booksOf({
        approvals: [
          approve(criterion, edges),
          approve(evidence, edges),
          approve(second, edges),
        ],
        rejections: [reject(second, edges)],
      }),
    );
    assert.equal(closureAsks(criterion, oneRed), false);
    const allGreen = colorContextOf(
      graph,
      booksOf({
        approvals: [
          approve(criterion, edges),
          approve(evidence, edges),
          approve(second, edges),
        ],
      }),
    );
    assert.equal(closureAsks(criterion, allGreen), true);
  });

  test("stops asking on either word, and asks again when the list moves and is approved", () => {
    const { graph, edges } = world(evidence);
    const green = [approve(criterion, edges), approve(evidence, edges)];
    const closed = colorContextOf(
      graph,
      booksOf({ approvals: green, acceptances: [accept(criterion, [evidence], edges)] }),
    );
    assert.equal(closureAsks(criterion, closed), false);
    const left = colorContextOf(
      graph,
      booksOf({ approvals: green, rejections: [leaveOpen(criterion, [evidence], edges)] }),
    );
    assert.equal(closureAsks(criterion, left), false);
    // A new claimant lapses the word — but the criterion is not asked about
    // until that claimant is approved too.
    const grown = world(evidence, second);
    const staleUnread = colorContextOf(
      grown.graph,
      booksOf({ approvals: green, acceptances: [accept(criterion, [evidence], edges)] }),
    );
    assert.equal(closureOf(criterion, staleUnread), "open");
    assert.equal(closureAsks(criterion, staleUnread), false);
    // Approved as it stands in the grown graph — its CLAIMS line is part of
    // its own payload, so the hash is taken over the edges it has there.
    const staleRead = colorContextOf(
      grown.graph,
      booksOf({
        approvals: [...green, approve(second, grown.edges)],
        acceptances: [accept(criterion, [evidence], edges)],
      }),
    );
    assert.equal(closureAsks(criterion, staleRead), true);
  });

  test("does not ask about a criterion nothing claims", () => {
    const { graph } = world();
    const context = colorContextOf(graph, booksOf({}));
    assert.equal(closureAsks(criterion, context), false);
  });
});

describe("the list itself", () => {
  test("an id nothing living answers to has no list, and neither has a type that closes nothing", () => {
    // The relation that makes the list is read off the node at the id, so an id
    // with no node has no kind to read and a Requirement has none either.
    // Neither is an error and neither is a guess: both are the empty list.
    const { graph, edges } = world(evidence);
    const context = colorContextOf(
      graph,
      booksOf({ approvals: [approve(criterion, edges)] }),
    );
    assert.deepEqual(claimantsOf("AC-0404", context), []);
    assert.deepEqual(claimantsOf("R-0001", context), []);
  });

  test("a criterion nothing points at at all has an empty list rather than none", () => {
    // Not one edge names AC-0002 — not even the HAS_CRITERION that would
    // anchor it — so the index holds no entry under its id at all.
    const loose = node("AcceptanceCriterion", "AC-0002");
    const { graph, edges } = world(evidence);
    const context = colorContextOf(
      graphOf([...graph.nodes, loose], edges),
      booksOf({}),
    );
    assert.deepEqual(claimantsOf("AC-0002", context), []);
    assert.deepEqual([...claimantHashesOf("AC-0002", context)], []);
  });

  test("the claimants nobody has approved are named, in id order", () => {
    // The gate on asking, read as a list rather than as a yes or no: this is
    // what a panel shows a person who wonders why a criterion is not on the
    // queue yet.
    const { graph, edges } = world(evidence, second);
    const oneUnread = colorContextOf(
      graph,
      booksOf({ approvals: [approve(criterion, edges), approve(evidence, edges)] }),
    );
    assert.deepEqual(
      unapprovedClaimantsOf("AC-0001", oneUnread).map((held) => held.id),
      ["EV-0002"],
    );
    const allRead = colorContextOf(
      graph,
      booksOf({
        approvals: [
          approve(criterion, edges),
          approve(evidence, edges),
          approve(second, edges),
        ],
      }),
    );
    assert.deepEqual(unapprovedClaimantsOf("AC-0001", allRead), []);
  });
});

describe("a record a caller holds, asked about before it is filed", () => {
  test("a left-open record stands on the same clauses an acceptance does", () => {
    // The daemon's door checks what it is about to replace, so the record is
    // passed in rather than looked up — and the three clauses are the ones the
    // ledger's own reader applies.
    const { graph, edges } = world(evidence);
    const [, record] = leaveOpen(criterion, [evidence], edges);
    const books = booksOf({});
    assert.equal(
      isLeftOpenStanding(record, criterion, colorContextOf(graph, books)),
      true,
    );
    // Reworded, it is a word about a sentence nobody has now.
    const reworded = { ...criterion, body: "Something rather stricter." };
    const moved = graphOf(
      [responsibility, requirement, reworded, journal, workLog, evidence],
      edges,
    );
    assert.equal(
      isLeftOpenStanding(record, reworded, colorContextOf(moved, books)),
      false,
    );
  });

  test("a rejection of the criterion's own words is no left-open word at all", () => {
    // A rejection record without a claimant map is the colour chain's business:
    // it refuses the node's content, and says nothing about the list.
    const { graph, edges } = world(evidence);
    const [, refusal] = reject(criterion, edges);
    assert.equal(
      isLeftOpenStanding(refusal, criterion, colorContextOf(graph, booksOf({}))),
      false,
    );
  });
});

describe("the mark on a status row", () => {
  test("is open for a criterion nobody has closed", () => {
    const { graph, edges } = world(evidence);
    const ledgers = booksOf({ approvals: [approve(criterion, edges)] });
    assert.equal(markOf(graph, ledgers, "AC-0001"), "open");
  });

  test("is null for every type that is not a criterion", () => {
    // Not "open by default" — the question does not apply to a requirement, and
    // the null is that fact rather than an absence of information.
    const { graph, edges } = world(evidence);
    const ledgers = booksOf({ approvals: [approve(criterion, edges)] });
    const review = reviewGraph(graph, ledgers);
    for (const held of review.statuses) {
      assert.equal(
        held.closure,
        held.id === "AC-0001" ? "open" : null,
        `closure of ${held.id}`,
      );
    }
  });
});
