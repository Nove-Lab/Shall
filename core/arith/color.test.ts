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
import type { RefusedFile, SpecGraph } from "../store/file-store.js";
import type { Ledgers, PayloadHash } from "./color.js";
import { reviewGraph, type GraphReview, type ReviewStatus } from "./review.js";

/**
 * The colour chain, read through `reviewGraph` — the door every screen and
 * `shall check` come in by.
 *
 * THE GRAPHS BELOW ARE BUILT BY HAND AND NOT LOADED. No filesystem, no
 * temporary folders: `core/arith` is pure, and a test that had to write files to
 * ask what colour a node is would be testing the loader as well. What is asserted
 * is arithmetic over a graph and three ledgers, which is exactly what the module
 * claims to be.
 *
 * THE HASH IS FAKE AND IT IS THE IDENTITY, on purpose. A real sha256 would make
 * every record a black box; with `sha256:<payload>` a fixture can say what a
 * record is taken over — a body, a relation, a deletion proposal, the node's own
 * address — and be wrong out loud when the payload changes shape. What is under
 * test is the ORDER the seven questions are asked in and the arithmetic of two
 * files, never the cryptography, which core does not do at all.
 */

const hash: PayloadHash = (payload: string) => `sha256:${payload}`;

const APPROVED_AT = "2026-08-15T00:00:00Z";

/** Who the fixtures approve as, and when — the `{by, at}` every record carries. */
const APPROVER = { by: "t", at: APPROVED_AT };

const REJECTED_AT = "2026-08-16T00:00:00Z";

/** What a refusal says, as a status carries it back. */
const REFUSAL = {
  by: "t",
  at: REJECTED_AT,
  rationale: "It says nothing about the empty case.",
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
    // A stamp is the file's mtime and nothing in this module reads one, so any
    // number will do — but it has to be there, because a node has two.
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

function edge(fromId: string, type: string, toId: string): SpecEdge {
  return { id: formatEdgeId(fromId, type, toId), type, fromId, toId };
}

function graphOf(parts: Partial<SpecGraph>): SpecGraph {
  return { nodes: [], edges: [], problems: [], refused: [], ...parts };
}

function refusal(file: string, type: string, id: string): RefusedFile {
  return { file, type, id, problems: ["A short name is required."] };
}

/**
 * The three books, with whatever a test cares about filled in and the fake hash
 * beside them. Every book is present even when it is empty, because `Ledgers` is
 * what the daemon builds and an absent book is not a shape it can produce.
 */
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

/** The books these approvals amount to, with the other two empty. */
function ledgerOf(...entries: [string, ApprovalRecord][]): Ledgers {
  return booksOf({ approvals: entries });
}

/** A project nobody has approved anything in — the ledger that is not there yet. */
const unapproved = ledgerOf();

/**
 * The hash a record has to name for this node: the bytes of its own file, under
 * its own address, over the relations that leave it.
 *
 * A DELETION PROPOSAL IS INSIDE THESE BYTES, which is `approvalPayload`'s rule
 * and the whole reason proposing a deletion turns a node yellow without a branch
 * anywhere in the chain.
 *
 * Taken from `approvalPayload` rather than through `contentHashOf`, so that the
 * chain and its fixture cannot drift together: a payload that changed shape has
 * to be written into this file by hand before the greens come back.
 */
function hashOf(node: SpecNode, edges: readonly SpecEdge[]): string {
  return hash(
    approvalPayload(
      node.type,
      node.id,
      node,
      edges.filter((held) => held.fromId === node.id),
      blocksOf(node),
    ),
  );
}

/** One line of the ledger, as the daemon leaves it after somebody pressed approve. */
function approve(
  node: SpecNode,
  edges: readonly SpecEdge[] = [],
): [string, ApprovalRecord] {
  return [node.id, { approvedHash: hashOf(node, edges), ...APPROVER }];
}

/** One line of the rejection ledger, taken over the node as it stands here. */
function reject(
  node: SpecNode,
  edges: readonly SpecEdge[] = [],
): [string, RejectionRecord] {
  return [node.id, { rejectedHash: hashOf(node, edges), ...REFUSAL }];
}

/**
 * One row of `statuses`, whole. Every assertion below compares a whole one, so
 * that a field quietly added or dropped is a failure rather than a silent pass.
 */
function status(
  id: string,
  color: ReviewStatus["color"],
  reason: ReviewStatus["reason"],
  approval: ReviewStatus["approval"] = null,
  rejection: ReviewStatus["rejection"] = null,
  closure: ReviewStatus["closure"] = null,
  leftOpen: ReviewStatus["leftOpen"] = null,
  problem: ReviewStatus["problem"] = null,
  taskState: ReviewStatus["taskState"] = null,
): ReviewStatus {
  return {
    id,
    color,
    reason,
    approval,
    rejection,
    closure,
    leftOpen,
    taskState,
    problem,
  };
}

function statusOf(review: GraphReview, id: string): ReviewStatus | undefined {
  return review.statuses.find((status) => status.id === id);
}

describe("red", () => {
  test("a file the loader refused is red, whatever else is wrong with it", () => {
    // It never reaches the chain at all. A file that will not read is work to
    // fix wherever it sits, and the colour vocabulary belongs to nodes the
    // graph has — this one is not a node yet.
    const review = reviewGraph(
      graphOf({
        refused: [refusal("intent/Requirement/R-0002.md", "Requirement", "R-0002")],
      }),
      unapproved,
    );
    assert.deepEqual(review.broken, [
      {
        file: "intent/Requirement/R-0002.md",
        problems: ["A short name is required."],
      },
    ]);
    assert.deepEqual(review.statuses, []);
    assert.deepEqual(review.missing, []);
  });

  test("a refused execution file is broken too, because a band is not an excuse", () => {
    // The colour chain would have dropped it on the band guard. It is routed
    // around the chain precisely so that it does not vanish from the screen.
    const review = reviewGraph(
      graphOf({
        refused: [refusal("execution/WorkLog/WL-0001.md", "WorkLog", "WL-0001")],
      }),
      unapproved,
    );
    assert.deepEqual(review.broken.map((file) => file.file), [
      "execution/WorkLog/WL-0001.md",
    ]);
  });

  test("an id nothing on disk answers to is red while something still names it", () => {
    // The loader keeps a relation whose target no file answers to, and that
    // relation is the whole reason the hole is visible: it is what says
    // somebody still expects R-0404 to be there.
    const review = reviewGraph(
      graphOf({
        nodes: [node("SystemResponsibility", "SR-0001"), node("Decision", "D-0001")],
        edges: [
          edge("SR-0001", "REQUIRES", "R-0404"),
          edge("D-0001", "AFFECTS", "R-0404"),
        ],
      }),
      unapproved,
    );
    // One entry for the id, its referrers in a fixed order however the edges
    // arrived — a review that reordered itself between two reads would show a
    // diff nobody made.
    assert.deepEqual(review.missing, [
      {
        id: "R-0404",
        referencedBy: [
          { fromId: "D-0001", type: "AFFECTS" },
          { fromId: "SR-0001", type: "REQUIRES" },
        ],
      },
    ]);
  });

  test("an id nothing names and no file holds is nothing at all", () => {
    // The same graph with the two relations taken out. R-0404 is not a hole, it
    // is a node that was deleted and cleaned up after — and the review invents
    // no row for it anywhere.
    const review = reviewGraph(
      graphOf({
        nodes: [node("SystemResponsibility", "SR-0001"), node("Decision", "D-0001")],
      }),
      unapproved,
    );
    assert.deepEqual(review.missing, []);
    assert.deepEqual(review.broken, []);
    assert.deepEqual(review.statuses.map((status) => status.id), [
      "D-0001",
      "SR-0001",
    ]);
  });

  test("a node no live anchor reaches is red, even when it is approved", () => {
    // The record is real and the person meant it. It does not answer the
    // question the anchor asks, which is whether this Requirement is part of
    // the specification at all — and the row still carries their name, because
    // who approved a node is a fact about it whatever colour it came back.
    const requirement = node("Requirement", "R-0001");
    const review = reviewGraph(
      graphOf({ nodes: [requirement] }),
      ledgerOf(approve(requirement)),
    );
    assert.deepEqual(review.statuses, [
      status("R-0001", "red", "orphan", APPROVER),
    ]);
  });

  test("an anchor whose far end did not parse is not a live one", () => {
    // Seen from both directions, because the two arrive differently. The
    // Decision's own file parsed, so its RESOLVES line is in the graph and
    // points at a Question whose file would not read — a line at a node the
    // graph does not have. The Question's own anchor is written in by hand:
    // the loader drops a refused file's edges, so it could not produce this
    // arrangement, and the check is against the living set rather than against
    // the edge list precisely so that no other assembly of a graph can make a
    // dead referrer anchor something.
    const review = reviewGraph(
      graphOf({
        nodes: [node("Decision", "D-0001"), node("Question", "Q-0002")],
        edges: [
          edge("D-0001", "RESOLVES", "Q-0001"),
          edge("G-0001", "RAISES", "Q-0002"),
        ],
        refused: [
          refusal("intent/Question/Q-0001.md", "Question", "Q-0001"),
          refusal("intent/Goal/G-0001.md", "Goal", "G-0001"),
        ],
      }),
      unapproved,
    );
    assert.deepEqual(review.statuses, [
      status("D-0001", "red", "orphan"),
      status("Q-0002", "red", "orphan"),
    ]);
    // And neither far end is missing: there is a file at both paths, so the
    // answer about them is `broken` and not a hole.
    assert.deepEqual(review.missing, []);
    assert.deepEqual(review.broken.map((file) => file.file), [
      "intent/Goal/G-0001.md",
      "intent/Question/Q-0001.md",
    ]);
  });

  test("the chain answers the first thing that is wrong and stops", () => {
    // Unanchored AND unapproved. It is told about the anchor, because approving
    // a node that hangs off nothing is work thrown away.
    const review = reviewGraph(
      graphOf({ nodes: [node("Requirement", "R-0001")] }),
      unapproved,
    );
    assert.deepEqual(
      statusOf(review, "R-0001"),
      status("R-0001", "red", "orphan"),
    );
  });

  test("a folder that would not open is red on the screen with no node behind it", () => {
    // A shut folder, a stray `.md`, a type folder in the wrong band: nothing to
    // colour, and still work somebody has to do. Grouped by file, and a file
    // that is already a refusal is not said twice.
    const review = reviewGraph(
      graphOf({
        problems: [
          { file: "intent/Requirement", message: "It could not be listed." },
          { file: "intent/Requirement", message: "Every node file inside it is left out." },
          { file: "intent/Requirement/R-0002.md", message: "A short name is required." },
        ],
        refused: [refusal("intent/Requirement/R-0002.md", "Requirement", "R-0002")],
      }),
      unapproved,
    );
    assert.deepEqual(review.broken, [
      {
        file: "intent/Requirement",
        problems: [
          "It could not be listed.",
          "Every node file inside it is left out.",
        ],
      },
      {
        file: "intent/Requirement/R-0002.md",
        problems: ["A short name is required."],
      },
    ]);
  });
});

describe("anchors", () => {
  for (const relation of ["EXPOSES", "CONSUMES"]) {
    test(`one live ${relation} out of two is enough to anchor an Interface`, () => {
      // The anchors of a type are alternatives and never requirements together:
      // a module that only calls a contract has anchored it just as well as the
      // module that publishes it.
      const review = reviewGraph(
        graphOf({
          nodes: [node("ModuleDesign", "MD-0001"), node("Interface", "IF-0001")],
          edges: [edge("MD-0001", relation, "IF-0001")],
        }),
        unapproved,
      );
      assert.deepEqual(
        statusOf(review, "IF-0001"),
        status("IF-0001", "yellow", "unapproved"),
      );
    });
  }

  test("a Decision is anchored by what it resolves, not by what reaches it", () => {
    // The one row of the table that points outward. A Decision with a RESOLVES
    // to a living Question is held; the same Decision with only a MENTIONS out
    // of it is not, because MENTIONS is not what holds a Decision.
    const question = node("Question", "Q-0001");
    const held = reviewGraph(
      graphOf({
        nodes: [node("Decision", "D-0001"), question],
        edges: [edge("D-0001", "RESOLVES", "Q-0001")],
      }),
      unapproved,
    );
    assert.deepEqual(
      statusOf(held, "D-0001"),
      status("D-0001", "yellow", "unapproved"),
    );

    const loose = reviewGraph(
      graphOf({
        nodes: [node("Decision", "D-0001"), node("Term", "T-0001")],
        edges: [edge("D-0001", "MENTIONS", "T-0001")],
      }),
      unapproved,
    );
    assert.deepEqual(
      statusOf(loose, "D-0001"),
      status("D-0001", "red", "orphan"),
    );
  });

  test("a rootless type is never an orphan", () => {
    // A Goal is where a specification starts. Requiring something to point at
    // it would make an empty project's first node wrong the moment it was
    // written, so a Goal alone is unapproved and not broken.
    const review = reviewGraph(
      graphOf({ nodes: [node("Goal", "G-0001")] }),
      unapproved,
    );
    assert.deepEqual(review.statuses, [
      status("G-0001", "yellow", "unapproved"),
    ]);
  });
});

describe("yellow and green", () => {
  // The anchor every node in this block hangs off, so that what is under test
  // is the approval half and never the anchor half.
  const responsibility = node("SystemResponsibility", "SR-0001");
  const anchoring = [edge("SR-0001", "REQUIRES", "R-0001")];

  function reviewOf(
    requirement: SpecNode,
    ledgers: Ledgers = unapproved,
  ): GraphReview {
    return reviewGraph(
      graphOf({ nodes: [responsibility, requirement], edges: anchoring }),
      ledgers,
    );
  }

  test("a node the ledger has no record for is yellow", () => {
    assert.deepEqual(
      statusOf(reviewOf(node("Requirement", "R-0001")), "R-0001"),
      status("R-0001", "yellow", "unapproved"),
    );
  });

  test("a body edited after approval is yellow", () => {
    const approved = node("Requirement", "R-0001");
    const edited = { ...approved, body: "Something else entirely." };
    assert.deepEqual(
      statusOf(reviewOf(edited, ledgerOf(approve(approved, anchoring))), "R-0001"),
      status("R-0001", "yellow", "changed", APPROVER),
    );
  });

  test("a relation added after approval is yellow", () => {
    // The relations are lines in this node's file, so they are inside what the
    // record's hash is taken over. Adding one is an edit like any other.
    const approved = node("Requirement", "R-0001");
    const review = reviewGraph(
      graphOf({
        nodes: [responsibility, node("Term", "T-0001"), approved],
        edges: [...anchoring, edge("R-0001", "MENTIONS", "T-0001")],
      }),
      ledgerOf(approve(approved, anchoring)),
    );
    assert.deepEqual(
      statusOf(review, "R-0001"),
      status("R-0001", "yellow", "changed", APPROVER),
    );
  });

  test("a deletion proposal is a change like any other, and the node turns yellow", () => {
    // There is no branch in the chain for a proposal, and there does not need
    // to be one: the block sits inside the payload, so an agent writing it
    // un-matches the hash by itself.
    const approved = node("Requirement", "R-0001");
    const proposed = {
      ...approved,
      deletionProposed: { by: "agent", rationale: "Superseded by R-0002." },
    };
    assert.deepEqual(
      statusOf(reviewOf(proposed, ledgerOf(approve(approved, anchoring))), "R-0001"),
      status("R-0001", "yellow", "changed", APPROVER),
    );
  });

  test("stripping the proposal makes the hash fit again, with nothing else undone", () => {
    // Rejecting a proposed deletion is one block removed and no state repaired,
    // because no state was ever stored: the same bytes hash to the same string,
    // and the ledger was never touched.
    const approved = node("Requirement", "R-0001");
    const record = approve(approved, anchoring);
    const ledgers = ledgerOf(record);
    const proposed = {
      ...approved,
      deletionProposed: { by: "agent", rationale: "Superseded by R-0002." },
    };
    const stripped = { ...proposed, deletionProposed: undefined };
    assert.deepEqual(
      statusOf(reviewOf(stripped, ledgers), "R-0001"),
      status("R-0001", "green", "approved", APPROVER),
    );
    // The chain reads the book and writes nothing in it, so what stands at the
    // end is the record from before the proposal was ever written.
    assert.deepEqual([...ledgers.approvals], [record]);
  });

  test("an approved, anchored node comes back green and says who approved it and when", () => {
    const approved = node("Requirement", "R-0001");
    const review = reviewOf(approved, ledgerOf(approve(approved, anchoring)));
    assert.deepEqual(
      statusOf(review, "R-0001"),
      status("R-0001", "green", "approved", APPROVER),
    );
    assert.deepEqual(review.missing, []);
    assert.deepEqual(review.broken, []);
  });

  test("a green status carries the approver and the instant; a yellow one carries the record it no longer fits; an unapproved one carries none", () => {
    // Three rows the panel writes three different lines under, and the
    // difference between the middle one and the last is the whole reason the
    // record is carried whatever the colour: "changed" has somebody to ask.
    const green = node("Requirement", "R-0001");
    const edited = node("Requirement", "R-0002");
    const never = node("Requirement", "R-0003");
    const edges = [
      edge("SR-0001", "REQUIRES", "R-0001"),
      edge("SR-0001", "REQUIRES", "R-0002"),
      edge("SR-0001", "REQUIRES", "R-0003"),
    ];
    const review = reviewGraph(
      graphOf({
        nodes: [
          responsibility,
          green,
          { ...edited, body: "Something else entirely." },
          never,
        ],
        edges,
      }),
      ledgerOf(approve(green, edges), approve(edited, edges)),
    );
    assert.deepEqual(
      statusOf(review, "R-0001"),
      status("R-0001", "green", "approved", APPROVER),
    );
    assert.deepEqual(
      statusOf(review, "R-0002"),
      status("R-0002", "yellow", "changed", APPROVER),
    );
    assert.deepEqual(
      statusOf(review, "R-0003"),
      status("R-0003", "yellow", "unapproved"),
    );
  });
});

describe("the ledger", () => {
  test("a record for an id that is not in the graph colours nothing and is not an error", () => {
    // A node somebody deleted, or approved in another checkout of the same
    // repository. The ledger is never pruned — a record outlives the node it
    // names — so the review leaves it where it is rather than inventing a row
    // for an id nothing on disk and nothing in any file claims.
    const goal = node("Goal", "G-0001");
    const review = reviewGraph(
      graphOf({ nodes: [goal] }),
      ledgerOf(approve(goal), approve(node("Requirement", "R-0404"))),
    );
    assert.deepEqual(review.statuses, [
      status("G-0001", "green", "approved", APPROVER),
    ]);
    assert.deepEqual(review.missing, []);
    assert.deepEqual(review.broken, []);
  });

  test("a record whose hash fits a different node's bytes colours nothing", () => {
    // The same content at two addresses, and a record filed under the second
    // that names the first's hash. The payload opens with `type/id`, so the two
    // never hash alike and an approval cannot be moved from one node to another
    // — which is what stops an approved node arriving green under a new name.
    const responsibility = node("SystemResponsibility", "SR-0001");
    const first = node("Requirement", "R-0001");
    const twin = { ...first, id: "R-0002" };
    const edges = [
      edge("SR-0001", "REQUIRES", "R-0001"),
      edge("SR-0001", "REQUIRES", "R-0002"),
    ];
    const review = reviewGraph(
      graphOf({ nodes: [responsibility, first, twin], edges }),
      ledgerOf([twin.id, { approvedHash: hashOf(first, edges), ...APPROVER }]),
    );
    assert.deepEqual(
      statusOf(review, "R-0001"),
      status("R-0001", "yellow", "unapproved"),
    );
    assert.deepEqual(
      statusOf(review, "R-0002"),
      status("R-0002", "yellow", "changed", APPROVER),
    );
    assert.equal(
      review.statuses.some((held) => held.color === "green"),
      false,
    );
  });

  test("a record standing over a file that would not read never reaches the chain", () => {
    // The record was taken when the file still read, and it is not wrong now —
    // it will fit again the moment somebody repairs the frontmatter. Until
    // then there is no node to say a colour about, so the file is broken and
    // the review says nothing else about it.
    const review = reviewGraph(
      graphOf({
        refused: [refusal("intent/Requirement/R-0002.md", "Requirement", "R-0002")],
      }),
      ledgerOf(approve(node("Requirement", "R-0002"))),
    );
    assert.deepEqual(review.statuses, []);
    assert.deepEqual(review.missing, []);
    assert.deepEqual(review.broken, [
      {
        file: "intent/Requirement/R-0002.md",
        problems: ["A short name is required."],
      },
    ]);
  });
});

describe("the execution band", () => {
  test("a work log is coloured like any other node, and held by the journal that logs it", () => {
    // The record is written by an agent and read by a person, so the same
    // three questions apply: does it read, does anything reach it, has a person
    // signed off. A journal is the root of the record and stands on its own; a
    // work log nothing logs and no task addresses is an orphan.
    const journal = node("Journal", "J-0001");
    const logged = node("WorkLog", "WL-0001");
    const stray = node("WorkLog", "WL-0002");
    const review = reviewGraph(
      graphOf({
        nodes: [journal, logged, stray],
        edges: [edge("J-0001", "LOGS", "WL-0001")],
      }),
      unapproved,
    );
    assert.deepEqual(
      statusOf(review, "J-0001"),
      status("J-0001", "yellow", "unapproved"),
    );
    assert.deepEqual(
      statusOf(review, "WL-0001"),
      status("WL-0001", "yellow", "unapproved"),
    );
    assert.deepEqual(
      statusOf(review, "WL-0002"),
      status("WL-0002", "red", "orphan"),
    );
  });

  test("an approved work log is green", () => {
    const journal = node("Journal", "J-0001");
    const logs = [edge("J-0001", "LOGS", "WL-0001")];
    const log = node("WorkLog", "WL-0001");
    const review = reviewGraph(
      graphOf({ nodes: [journal, log], edges: logs }),
      ledgerOf(approve(log)),
    );
    assert.deepEqual(
      statusOf(review, "WL-0001"),
      status("WL-0001", "green", "approved", APPROVER),
    );
  });
});

describe("the aim rule", () => {
  // A criterion, a task that targets it, a work log that addresses the task,
  // and the evidence the log submits — the four files the rule reads.
  // The whole intent chain, Goal down — so every node above the task is
  // anchored and the chain can actually be green when it is read.
  const goal = node("Goal", "G-0001");
  const actor = node("Actor", "A-0001");
  const useCase = node("UseCase", "UC-0001");
  const scenario = node("Scenario", "SC-0001");
  const criterion = node("AcceptanceCriterion", "AC-0001");
  const other = node("AcceptanceCriterion", "AC-0002");
  const requirement = node("Requirement", "R-0001");
  const responsibility = node("SystemResponsibility", "SR-0001");
  const task = node("ImplementationTask", "IT-0001");
  const journal = node("Journal", "J-0001");
  const log = node("WorkLog", "WL-0001");
  const evidence = node("Evidence", "EV-0001");
  const SPINE = [
    edge("G-0001", "PURSUED_BY", "A-0001"),
    edge("A-0001", "PERFORMS", "UC-0001"),
    edge("UC-0001", "DETAILS", "SC-0001"),
    edge("SC-0001", "DERIVES_RESPONSIBILITY", "SR-0001"),
    edge("SR-0001", "REQUIRES", "R-0001"),
    edge("R-0001", "HAS_CRITERION", "AC-0001"),
    edge("R-0001", "HAS_CRITERION", "AC-0002"),
    edge("IT-0001", "TARGETS", "AC-0001"),
    edge("J-0001", "LOGS", "WL-0001"),
    edge("WL-0001", "ADDRESSES", "IT-0001"),
    edge("WL-0001", "SUBMITS", "EV-0001"),
  ];
  const NODES = [
    goal,
    actor,
    useCase,
    scenario,
    responsibility,
    requirement,
    criterion,
    other,
    task,
    journal,
    log,
    evidence,
  ];
  /**
   * The chain above the task, read — so IT-0001 is `ready`, and the
   * blocked-address rule (a different red, tested in its own describe) never
   * fires on the log while the aim is what is under test.
   */
  const CHAIN_READ = ledgerOf(
    approve(goal, SPINE),
    approve(actor, SPINE),
    approve(useCase, SPINE),
    approve(scenario, SPINE),
    approve(responsibility, SPINE),
    approve(requirement, SPINE),
    approve(criterion, SPINE),
    approve(other, SPINE),
    approve(task, SPINE),
  );

  function reviewWith(...claims: SpecEdge[]): GraphReview {
    return reviewGraph(
      graphOf({ nodes: NODES, edges: [...SPINE, ...claims] }),
      CHAIN_READ,
    );
  }

  test("evidence that claims what the task targets is inside the aim, and nothing is red", () => {
    const review = reviewWith(edge("EV-0001", "CLAIMS", "AC-0001"));
    assert.deepEqual(statusOf(review, "WL-0001"), status("WL-0001", "yellow", "unapproved"));
    assert.deepEqual(statusOf(review, "EV-0001"), status("EV-0001", "yellow", "unapproved"));
  });

  test("evidence that claims another criterion turns both the log and the evidence red, with the same fact said from each end", () => {
    const review = reviewWith(edge("EV-0001", "CLAIMS", "AC-0002"));
    assert.deepEqual(
      statusOf(review, "WL-0001"),
      status(
        "WL-0001",
        "red",
        "off-target",
        null,
        null,
        null,
        null,
        "WL-0001 addresses IT-0001, which targets AC-0001, but submits EV-0001, which claims AC-0002 — a work log's evidence claims only the criteria its task targets.",
      ),
    );
    assert.deepEqual(
      statusOf(review, "EV-0001"),
      status(
        "EV-0001",
        "red",
        "off-target",
        null,
        null,
        null,
        null,
        "EV-0001 claims AC-0002, but the work log that submitted it, WL-0001, addresses IT-0001, which targets AC-0001 — a work log's evidence claims only the criteria its task targets.",
      ),
    );
    // The criteria and the task themselves are not touched by it.
    assert.equal(statusOf(review, "AC-0002")?.color, "green");
    assert.equal(statusOf(review, "IT-0001")?.color, "green");
  });

  test("evidence that claims nothing is red at both ends — the log for the aim, the evidence for its anchor", () => {
    const review = reviewWith();
    assert.equal(statusOf(review, "WL-0001")?.reason, "off-target");
    assert.equal(
      statusOf(review, "WL-0001")?.problem,
      "WL-0001 addresses IT-0001, which targets AC-0001, but submits EV-0001, which claims no criterion — a work log's evidence claims only the criteria its task targets.",
    );
    // The evidence's own diagnosis is the anchor rule's: a claimless evidence
    // is an orphan — the claim is what makes it evidence at all — and the
    // orphan sentence is the one that says what to draw.
    assert.equal(statusOf(review, "EV-0001")?.reason, "orphan");
  });

  test("a claim partly outside the aim is outside it — every claim has to be a target", () => {
    const review = reviewWith(
      edge("EV-0001", "CLAIMS", "AC-0001"),
      edge("EV-0001", "CLAIMS", "AC-0002"),
    );
    assert.equal(statusOf(review, "EV-0001")?.reason, "off-target");
    assert.ok(statusOf(review, "EV-0001")?.problem?.includes("claims AC-0001 and AC-0002"));
  });

  test("a work log under no task has an empty aim — a claim under it is a breach at both ends", () => {
    // IT USED TO BE AN EXEMPTION ("under no aim, never red"), and the gap
    // showed on a screen: evidence under an aimless log could claim any
    // criterion in the project. An empty aim is an empty allowance.
    const review = reviewGraph(
      graphOf({
        nodes: NODES,
        edges: [
          ...SPINE.filter((line) => line.type !== "ADDRESSES"),
          edge("EV-0001", "CLAIMS", "AC-0002"),
        ],
      }),
      CHAIN_READ,
    );
    assert.equal(statusOf(review, "WL-0001")?.reason, "off-target");
    assert.equal(
      statusOf(review, "WL-0001")?.problem,
      "WL-0001 addresses no task the graph holds, but submits EV-0001, which claims AC-0002 — a work log's evidence claims only the criteria its task targets, and this log addresses no task the graph holds.",
    );
    assert.equal(
      statusOf(review, "EV-0001")?.problem,
      "EV-0001 claims AC-0002, but the work log that submitted it, WL-0001, addresses no task the graph holds — a work log's evidence claims only the criteria its task targets, and this log addresses no task the graph holds.",
    );
  });

  test("a work log whose only ADDRESSES line reaches a task no file names is in the empty-aim arm, said truthfully", () => {
    // The colour is the same as addressing nothing — an unverifiable task
    // justifies no claim — but the sentence must not deny the line the file
    // visibly writes, so it says "no task the graph holds". The hole itself is
    // the missing rule's row, filed under this same log.
    const review = reviewGraph(
      graphOf({
        nodes: NODES,
        edges: [
          ...SPINE.filter((line) => line.type !== "ADDRESSES"),
          edge("WL-0001", "ADDRESSES", "IT-9999"),
          edge("EV-0001", "CLAIMS", "AC-0002"),
        ],
      }),
      CHAIN_READ,
    );
    assert.equal(statusOf(review, "WL-0001")?.reason, "off-target");
    assert.ok(
      statusOf(review, "WL-0001")?.problem?.startsWith(
        "WL-0001 addresses no task the graph holds,",
      ),
    );
    // Claimless under the same dead address: the log is clean — the hole is
    // the missing rule's sentence, and the claim that is not there is the
    // evidence's own orphanhood.
    const clean = reviewGraph(
      graphOf({
        nodes: NODES,
        edges: [
          ...SPINE.filter((line) => line.type !== "ADDRESSES"),
          edge("WL-0001", "ADDRESSES", "IT-9999"),
        ],
      }),
      CHAIN_READ,
    );
    assert.equal(statusOf(clean, "WL-0001")?.reason, "unapproved");
    assert.equal(statusOf(clean, "EV-0001")?.reason, "orphan");
  });

  test("a work log under no task whose evidence claims nothing is clean — the missing claim is the evidence's own orphanhood", () => {
    const review = reviewGraph(
      graphOf({
        nodes: NODES,
        edges: SPINE.filter((line) => line.type !== "ADDRESSES"),
      }),
      CHAIN_READ,
    );
    assert.equal(statusOf(review, "WL-0001")?.reason, "unapproved");
    assert.equal(statusOf(review, "EV-0001")?.reason, "orphan");
  });

  test("a rule of grammar comes before the books: an approved breach is still red", () => {
    const edges = [...SPINE, edge("EV-0001", "CLAIMS", "AC-0002")];
    const review = reviewGraph(
      graphOf({ nodes: NODES, edges }),
      ledgerOf(approve(log, edges), approve(evidence, edges)),
    );
    assert.equal(statusOf(review, "WL-0001")?.reason, "off-target");
    assert.equal(statusOf(review, "EV-0001")?.reason, "off-target");
    // The approval is still carried, as it is for an orphan.
    assert.deepEqual(statusOf(review, "WL-0001")?.approval, APPROVER);
  });

  test("a claim at a criterion no file names anchors nothing, and is still the log's breach", () => {
    const review = reviewWith(edge("EV-0001", "CLAIMS", "AC-9999"));
    // A dangling claim is no live anchor, so the evidence is an orphan — and
    // the missing rule files its own sentence under the id the claim names.
    assert.equal(statusOf(review, "EV-0001")?.reason, "orphan");
    assert.equal(statusOf(review, "WL-0001")?.reason, "off-target");
    assert.ok(statusOf(review, "WL-0001")?.problem?.includes("claims AC-9999"));
  });
});

describe("a task's aim", () => {
  // The rule's third clause, one hop earlier than the other two: it reads the
  // task's own file and needs no work log at all. The module is here so the
  // task is anchored by ALLOCATES and the TARGETS lines are what is on trial,
  // rather than the thing holding the task to the graph.
  const responsibility = node("SystemResponsibility", "SR-0001");
  const module_ = node("ModuleDesign", "MD-0001");
  const task = node("ImplementationTask", "IT-0001");
  const requirement = node("Requirement", "R-0001");
  const first = node("AcceptanceCriterion", "AC-0001");
  const second = node("AcceptanceCriterion", "AC-0002");
  const NODES = [responsibility, module_, task, requirement, first, second];
  const HELD = [
    edge("SR-0001", "IS_REALIZED_BY", "MD-0001"),
    edge("SR-0001", "REQUIRES", "R-0001"),
    edge("R-0001", "HAS_CRITERION", "AC-0001"),
    edge("R-0001", "HAS_CRITERION", "AC-0002"),
    edge("MD-0001", "ALLOCATES", "IT-0001"),
  ];

  function reviewWith(
    aims: readonly SpecEdge[],
    ledgers: Ledgers = unapproved,
  ): GraphReview {
    return reviewGraph(
      graphOf({ nodes: NODES, edges: [...HELD, ...aims] }),
      ledgers,
    );
  }

  test("a task that targets two criteria is red, and the sentence names both", () => {
    const review = reviewWith([
      edge("IT-0001", "TARGETS", "AC-0001"),
      edge("IT-0001", "TARGETS", "AC-0002"),
    ]);
    assert.deepEqual(
      statusOf(review, "IT-0001"),
      status(
        "IT-0001",
        "red",
        "off-target",
        null,
        null,
        "open",
        null,
        "IT-0001 targets AC-0001 and AC-0002 — a task aims at one criterion at most, because a task with two aims closes neither on its own. Split the task, or remove the TARGETS line this work is not for.",
        "blocked",
      ),
    );
  });

  test("one aim is the rule kept, and no aim at all is a task the rule says nothing about", () => {
    assert.equal(
      statusOf(reviewWith([edge("IT-0001", "TARGETS", "AC-0001")]), "IT-0001")
        ?.reason,
      "unapproved",
    );
    assert.equal(statusOf(reviewWith([]), "IT-0001")?.reason, "unapproved");
  });

  test("a second aim at an id no file names counts, and the hole is still reported", () => {
    // Read off the written lines, like the rest of the rule: an aim at a
    // criterion nobody has written is still an aim the plan wrote down, and
    // the missing rule says its own sentence about the id underneath.
    const review = reviewWith([
      edge("IT-0001", "TARGETS", "AC-0001"),
      edge("IT-0001", "TARGETS", "AC-9999"),
    ]);
    assert.equal(statusOf(review, "IT-0001")?.reason, "off-target");
    assert.ok(statusOf(review, "IT-0001")?.problem?.includes("AC-9999"));
    assert.deepEqual(
      review.missing.map((entry) => entry.id),
      ["AC-9999"],
    );
  });

  test("a task with two aims stays red after somebody approves it", () => {
    const aims = [
      edge("IT-0001", "TARGETS", "AC-0001"),
      edge("IT-0001", "TARGETS", "AC-0002"),
    ];
    const review = reviewWith(aims, ledgerOf(approve(task, [...HELD, ...aims])));
    assert.equal(statusOf(review, "IT-0001")?.reason, "off-target");
    // The approval is carried on the row, as it is for an orphan: the book
    // still says somebody agreed, and the seam is what is on the screen.
    assert.deepEqual(statusOf(review, "IT-0001")?.approval, APPROVER);
  });

  test("a task nothing anchors is told about the anchor before its aims", () => {
    // The order is the product: the chain answers the first thing that is
    // wrong. Here the ALLOCATES line is gone, so both TARGETS lines are the
    // only anchor the task has — and an orphan it is not, because TARGETS
    // anchors a task too. So this is the aim rule again, from a task the
    // module dropped.
    const review = reviewGraph(
      graphOf({
        nodes: NODES,
        edges: [
          ...HELD.filter((held) => held.type !== "ALLOCATES"),
          edge("IT-0001", "TARGETS", "AC-0001"),
          edge("IT-0001", "TARGETS", "AC-0002"),
        ],
      }),
      unapproved,
    );
    assert.equal(statusOf(review, "IT-0001")?.reason, "off-target");
  });
});

describe("a loop in the plan", () => {
  // One responsibility, one module, and as many tasks as a test needs. The
  // module ALLOCATES every task, so nothing here is red for want of an anchor
  // and the loop is the only thing on trial.
  const responsibility = node("SystemResponsibility", "SR-0001");
  const module_ = node("ModuleDesign", "MD-0001");
  const HELD = [edge("SR-0001", "IS_REALIZED_BY", "MD-0001")];

  function tasksOf(...ids: string[]): {
    nodes: SpecNode[];
    edges: SpecEdge[];
  } {
    return {
      nodes: [
        responsibility,
        module_,
        ...ids.map((id) => node("ImplementationTask", id)),
      ],
      edges: [...HELD, ...ids.map((id) => edge("MD-0001", "ALLOCATES", id))],
    };
  }

  function reviewOf(
    parts: { nodes: SpecNode[]; edges: SpecEdge[] },
    ...extra: SpecEdge[]
  ): GraphReview {
    return reviewGraph(
      graphOf({ nodes: parts.nodes, edges: [...parts.edges, ...extra] }),
      unapproved,
    );
  }

  test("two tasks waiting on each other are both red, each told from where it stands", () => {
    const review = reviewOf(
      tasksOf("IT-0001", "IT-0002"),
      edge("IT-0001", "DEPENDS_ON", "IT-0002"),
      edge("IT-0002", "DEPENDS_ON", "IT-0001"),
    );
    assert.equal(statusOf(review, "IT-0001")?.reason, "cyclic");
    assert.equal(
      statusOf(review, "IT-0001")?.problem,
      "IT-0001 waits on IT-0002, which waits on IT-0001 — a task cannot wait on itself through others, and no task on this loop can ever be called ready. Remove one DEPENDS_ON line, or split the task both halves need.",
    );
    assert.equal(
      statusOf(review, "IT-0002")?.problem,
      "IT-0002 waits on IT-0001, which waits on IT-0002 — a task cannot wait on itself through others, and no task on this loop can ever be called ready. Remove one DEPENDS_ON line, or split the task both halves need.",
    );
  });

  test("a loop of three recites the way round, starting from the node it is under", () => {
    const review = reviewOf(
      tasksOf("IT-0001", "IT-0002", "IT-0003"),
      edge("IT-0001", "DEPENDS_ON", "IT-0002"),
      edge("IT-0002", "DEPENDS_ON", "IT-0003"),
      edge("IT-0003", "DEPENDS_ON", "IT-0001"),
    );
    assert.ok(
      statusOf(review, "IT-0002")?.problem?.startsWith(
        "IT-0002 waits on IT-0003, which waits on IT-0001, which waits on IT-0002 —",
      ),
    );
  });

  test("a task waiting on the loop from outside it is not on the loop", () => {
    // Standing on a loop is being able to get back to yourself, not being able
    // to reach one. IT-0003 waits on the pair and nothing waits on it.
    const review = reviewOf(
      tasksOf("IT-0001", "IT-0002", "IT-0003"),
      edge("IT-0001", "DEPENDS_ON", "IT-0002"),
      edge("IT-0002", "DEPENDS_ON", "IT-0001"),
      edge("IT-0003", "DEPENDS_ON", "IT-0001"),
    );
    assert.equal(statusOf(review, "IT-0003")?.reason, "unapproved");
    assert.equal(statusOf(review, "IT-0001")?.reason, "cyclic");
  });

  test("a shortcut across a loop does not hide the node the shortcut skipped", () => {
    // The case a walk that marks its own path gets wrong. With IT-0001 also
    // waiting on IT-0003 directly, a path-marking walk can close the short
    // loop first and then meet IT-0002 already finished — leaving a task on a
    // loop with nothing said about it.
    const review = reviewOf(
      tasksOf("IT-0001", "IT-0002", "IT-0003"),
      edge("IT-0001", "DEPENDS_ON", "IT-0002"),
      edge("IT-0002", "DEPENDS_ON", "IT-0003"),
      edge("IT-0003", "DEPENDS_ON", "IT-0001"),
      edge("IT-0001", "DEPENDS_ON", "IT-0003"),
    );
    for (const id of ["IT-0001", "IT-0002", "IT-0003"]) {
      assert.equal(statusOf(review, id)?.reason, "cyclic");
    }
    // And the sentence takes the short way round, because a person reads it.
    assert.ok(
      statusOf(review, "IT-0001")?.problem?.startsWith(
        "IT-0001 waits on IT-0003, which waits on IT-0001 —",
      ),
    );
  });

  test("an orphan is told about its anchor before it is told about the loop", () => {
    const parts = tasksOf("IT-0001", "IT-0002");
    const review = reviewGraph(
      graphOf({
        nodes: parts.nodes,
        // The module allocates only the first, so the second hangs off nothing
        // — and a DEPENDS_ON is no anchor for a task.
        edges: [
          ...HELD,
          edge("MD-0001", "ALLOCATES", "IT-0001"),
          edge("IT-0001", "DEPENDS_ON", "IT-0002"),
          edge("IT-0002", "DEPENDS_ON", "IT-0001"),
        ],
      }),
      unapproved,
    );
    assert.equal(statusOf(review, "IT-0002")?.reason, "orphan");
    assert.equal(statusOf(review, "IT-0001")?.reason, "cyclic");
  });

  test("a task with two aims is told about its aims before the loop it is on", () => {
    const criterion = node("AcceptanceCriterion", "AC-0001");
    const other = node("AcceptanceCriterion", "AC-0002");
    const requirement = node("Requirement", "R-0001");
    const parts = tasksOf("IT-0001", "IT-0002");
    const review = reviewGraph(
      graphOf({
        nodes: [...parts.nodes, requirement, criterion, other],
        edges: [
          ...parts.edges,
          edge("SR-0001", "REQUIRES", "R-0001"),
          edge("R-0001", "HAS_CRITERION", "AC-0001"),
          edge("R-0001", "HAS_CRITERION", "AC-0002"),
          edge("IT-0001", "TARGETS", "AC-0001"),
          edge("IT-0001", "TARGETS", "AC-0002"),
          edge("IT-0001", "DEPENDS_ON", "IT-0002"),
          edge("IT-0002", "DEPENDS_ON", "IT-0001"),
        ],
      }),
      unapproved,
    );
    assert.equal(statusOf(review, "IT-0001")?.reason, "off-target");
    assert.equal(statusOf(review, "IT-0002")?.reason, "cyclic");
  });

  test("waiting on a task no file names is a hole, and not a loop", () => {
    const review = reviewOf(
      tasksOf("IT-0001"),
      edge("IT-0001", "DEPENDS_ON", "IT-9999"),
    );
    assert.equal(statusOf(review, "IT-0001")?.reason, "unapproved");
    assert.deepEqual(
      review.missing.map((entry) => entry.id),
      ["IT-9999"],
    );
  });

  test("two requirements waiting on each other are told it in the specification's words", () => {
    const first = node("Requirement", "R-0001");
    const second = node("Requirement", "R-0002");
    const review = reviewGraph(
      graphOf({
        nodes: [responsibility, first, second],
        edges: [
          edge("SR-0001", "REQUIRES", "R-0001"),
          edge("SR-0001", "REQUIRES", "R-0002"),
          edge("R-0001", "DEPENDS_ON", "R-0002"),
          edge("R-0002", "DEPENDS_ON", "R-0001"),
        ],
      }),
      unapproved,
    );
    assert.equal(
      statusOf(review, "R-0001")?.problem,
      "R-0001 waits on R-0002, which waits on R-0001 — nothing in a specification waits on itself through others, so neither of these can be the one that comes first. Remove one DEPENDS_ON line, or write the shared part as a third node both depend on.",
    );
  });

  test("two requirements that disagree with each other are not on a loop", () => {
    // CONFLICTS_WITH runs both ways by design: it says they disagree, which is
    // not an order and cannot be circular. The rule must never touch it.
    const first = node("Requirement", "R-0001");
    const second = node("Requirement", "R-0002");
    const review = reviewGraph(
      graphOf({
        nodes: [responsibility, first, second],
        edges: [
          edge("SR-0001", "REQUIRES", "R-0001"),
          edge("SR-0001", "REQUIRES", "R-0002"),
          edge("R-0001", "CONFLICTS_WITH", "R-0002"),
          edge("R-0002", "CONFLICTS_WITH", "R-0001"),
        ],
      }),
      unapproved,
    );
    assert.equal(statusOf(review, "R-0001")?.reason, "unapproved");
    assert.equal(statusOf(review, "R-0002")?.reason, "unapproved");
  });

  test("two modules that consume each other's contracts are red, and the contracts are not", () => {
    const second = node("ModuleDesign", "MD-0002");
    const first = node("Interface", "IF-0001");
    const other = node("Interface", "IF-0002");
    const review = reviewGraph(
      graphOf({
        nodes: [responsibility, module_, second, first, other],
        edges: [
          ...HELD,
          edge("SR-0001", "IS_REALIZED_BY", "MD-0002"),
          edge("MD-0001", "EXPOSES", "IF-0001"),
          edge("MD-0002", "EXPOSES", "IF-0002"),
          edge("MD-0001", "CONSUMES", "IF-0002"),
          edge("MD-0002", "CONSUMES", "IF-0001"),
        ],
      }),
      unapproved,
    );
    assert.equal(
      statusOf(review, "MD-0001")?.problem,
      "MD-0001 consumes IF-0002, which MD-0002 exposes, and MD-0002 consumes IF-0001, which MD-0001 exposes — a module's dependencies run one way, and a loop means neither module can be built, read or replaced without the other. Remove one CONSUMES line, or move what both need into a module of its own.",
    );
    assert.equal(statusOf(review, "MD-0002")?.reason, "cyclic");
    // A contract is not on the loop. It is what the loop runs through, and
    // there is nothing in either interface file to remove.
    assert.equal(statusOf(review, "IF-0001")?.reason, "unapproved");
    assert.equal(statusOf(review, "IF-0002")?.reason, "unapproved");
  });

  test("a module that calls the contract it publishes is talking to itself, not looping", () => {
    const contract = node("Interface", "IF-0001");
    const review = reviewGraph(
      graphOf({
        nodes: [responsibility, module_, contract],
        edges: [
          ...HELD,
          edge("MD-0001", "EXPOSES", "IF-0001"),
          edge("MD-0001", "CONSUMES", "IF-0001"),
        ],
      }),
      unapproved,
    );
    assert.equal(statusOf(review, "MD-0001")?.reason, "unapproved");
  });

  test("a loop stays red after somebody approves both ends of it", () => {
    const parts = tasksOf("IT-0001", "IT-0002");
    const edges = [
      ...parts.edges,
      edge("IT-0001", "DEPENDS_ON", "IT-0002"),
      edge("IT-0002", "DEPENDS_ON", "IT-0001"),
    ];
    const first = parts.nodes.find((held) => held.id === "IT-0001");
    const second = parts.nodes.find((held) => held.id === "IT-0002");
    assert.ok(first !== undefined && second !== undefined);
    const review = reviewGraph(
      graphOf({ nodes: parts.nodes, edges }),
      ledgerOf(approve(first, edges), approve(second, edges)),
    );
    assert.equal(statusOf(review, "IT-0001")?.reason, "cyclic");
    assert.equal(statusOf(review, "IT-0002")?.reason, "cyclic");
  });
});

describe("the aim rule for verification reports", () => {
  // The report's own half of the rule: exactly one claim, and that one among
  // the tasks the submitting log addresses. The chain is read so that the log
  // is never `premature` here — what is under test is the claim.
  const goal = node("Goal", "G-0001");
  const actor = node("Actor", "A-0001");
  const useCase = node("UseCase", "UC-0001");
  const scenario = node("Scenario", "SC-0001");
  const responsibility = node("SystemResponsibility", "SR-0001");
  const requirement = node("Requirement", "R-0001");
  const criterion = node("AcceptanceCriterion", "AC-0001");
  const other = node("AcceptanceCriterion", "AC-0002");
  const task = node("ImplementationTask", "IT-0001");
  const second = node("ImplementationTask", "IT-0002");
  const journal = node("Journal", "J-0001");
  const log = node("WorkLog", "WL-0001");
  const report = node("VerificationReport", "VR-0001");
  const SPINE = [
    edge("G-0001", "PURSUED_BY", "A-0001"),
    edge("A-0001", "PERFORMS", "UC-0001"),
    edge("UC-0001", "DETAILS", "SC-0001"),
    edge("SC-0001", "DERIVES_RESPONSIBILITY", "SR-0001"),
    edge("SR-0001", "REQUIRES", "R-0001"),
    edge("R-0001", "HAS_CRITERION", "AC-0001"),
    edge("R-0001", "HAS_CRITERION", "AC-0002"),
    edge("IT-0001", "TARGETS", "AC-0001"),
    edge("IT-0002", "TARGETS", "AC-0002"),
    edge("J-0001", "LOGS", "WL-0001"),
    edge("WL-0001", "ADDRESSES", "IT-0001"),
    edge("WL-0001", "SUBMITS", "VR-0001"),
  ];
  const NODES = [
    goal,
    actor,
    useCase,
    scenario,
    responsibility,
    requirement,
    criterion,
    other,
    task,
    second,
    journal,
    log,
    report,
  ];
  const CHAIN_READ = ledgerOf(
    approve(goal, SPINE),
    approve(actor, SPINE),
    approve(useCase, SPINE),
    approve(scenario, SPINE),
    approve(responsibility, SPINE),
    approve(requirement, SPINE),
    approve(criterion, SPINE),
    approve(other, SPINE),
    approve(task, SPINE),
    approve(second, SPINE),
  );
  const RULE =
    "a verification report claims exactly one task its work log addresses.";

  function reviewWith(edits: {
    drop?: (line: SpecEdge) => boolean;
    add?: SpecEdge[];
  }): GraphReview {
    const edges = [
      ...SPINE.filter((line) => !(edits.drop?.(line) ?? false)),
      ...(edits.add ?? []),
    ];
    return reviewGraph(graphOf({ nodes: NODES, edges }), CHAIN_READ);
  }

  test("one claim at the addressed task is inside the rule, and nothing is red", () => {
    const review = reviewWith({ add: [edge("VR-0001", "CLAIMS", "IT-0001")] });
    assert.equal(statusOf(review, "VR-0001")?.reason, "unapproved");
    assert.equal(statusOf(review, "WL-0001")?.reason, "unapproved");
  });

  test("a claim at a task the log does not address turns both ends red, said from each", () => {
    const review = reviewWith({ add: [edge("VR-0001", "CLAIMS", "IT-0002")] });
    assert.equal(
      statusOf(review, "WL-0001")?.problem,
      `WL-0001 addresses IT-0001, but submits VR-0001, which claims IT-0002 — ${RULE}`,
    );
    assert.equal(
      statusOf(review, "VR-0001")?.problem,
      `VR-0001 claims IT-0002, but the work log that submitted it, WL-0001, addresses IT-0001 — ${RULE}`,
    );
  });

  test("two claims are a breach with a submitter — and without one", () => {
    const review = reviewWith({
      add: [
        edge("VR-0001", "CLAIMS", "IT-0001"),
        edge("VR-0001", "CLAIMS", "IT-0002"),
      ],
    });
    assert.equal(
      statusOf(review, "VR-0001")?.problem,
      `VR-0001 claims IT-0001 and IT-0002 — ${RULE}`,
    );
    assert.equal(
      statusOf(review, "WL-0001")?.problem,
      `WL-0001 submits VR-0001, which claims IT-0001 and IT-0002 — ${RULE}`,
    );

    // Submitted by nobody, the cardinality still holds — it is the report's
    // own clause, not the submitter's — and there is no log to red.
    const free = reviewWith({
      drop: (line) => line.type === "SUBMITS",
      add: [
        edge("VR-0001", "CLAIMS", "IT-0001"),
        edge("VR-0001", "CLAIMS", "IT-0002"),
      ],
    });
    assert.equal(
      statusOf(free, "VR-0001")?.problem,
      `VR-0001 claims IT-0001 and IT-0002 — ${RULE}`,
    );
    assert.equal(statusOf(free, "WL-0001")?.reason, "unapproved");
  });

  test("a log that addresses no task has none to verify — any claim under it is a breach", () => {
    const aimless = `${RULE.slice(0, -1)}, and this log addresses no task at all.`;
    const review = reviewWith({
      drop: (line) => line.type === "ADDRESSES",
      add: [edge("VR-0001", "CLAIMS", "IT-0001")],
    });
    assert.equal(
      statusOf(review, "WL-0001")?.problem,
      `WL-0001 addresses no task, but submits VR-0001, which claims IT-0001 — ${aimless}`,
    );
    assert.equal(
      statusOf(review, "VR-0001")?.problem,
      `VR-0001 claims IT-0001, but the work log that submitted it, WL-0001, addresses no task — ${aimless}`,
    );
  });

  test("a claimless report is an orphan, and a dangling claim anchors nothing and is still the log's breach", () => {
    const claimless = reviewWith({});
    assert.equal(statusOf(claimless, "VR-0001")?.reason, "orphan");
    assert.equal(statusOf(claimless, "WL-0001")?.reason, "unapproved");

    const dangling = reviewWith({ add: [edge("VR-0001", "CLAIMS", "IT-9999")] });
    assert.equal(statusOf(dangling, "VR-0001")?.reason, "orphan");
    assert.equal(statusOf(dangling, "WL-0001")?.reason, "off-target");
    assert.ok(statusOf(dangling, "WL-0001")?.problem?.includes("claims IT-9999"));
  });
});

describe("the blocked-address rule", () => {
  // The same spine the aim rule uses, plus a second task that waits on the
  // first — the two ways a task is blocked: an unread chain, and an open
  // prerequisite.
  const goal = node("Goal", "G-0001");
  const actor = node("Actor", "A-0001");
  const useCase = node("UseCase", "UC-0001");
  const scenario = node("Scenario", "SC-0001");
  const criterion = node("AcceptanceCriterion", "AC-0001");
  const requirement = node("Requirement", "R-0001");
  const responsibility = node("SystemResponsibility", "SR-0001");
  const task = node("ImplementationTask", "IT-0001");
  const waiting = node("ImplementationTask", "IT-0002");
  const journal = node("Journal", "J-0001");
  const log = node("WorkLog", "WL-0001");
  const SPINE = [
    edge("G-0001", "PURSUED_BY", "A-0001"),
    edge("A-0001", "PERFORMS", "UC-0001"),
    edge("UC-0001", "DETAILS", "SC-0001"),
    edge("SC-0001", "DERIVES_RESPONSIBILITY", "SR-0001"),
    edge("SR-0001", "REQUIRES", "R-0001"),
    edge("R-0001", "HAS_CRITERION", "AC-0001"),
    edge("IT-0001", "TARGETS", "AC-0001"),
    edge("IT-0002", "TARGETS", "AC-0001"),
    edge("IT-0002", "DEPENDS_ON", "IT-0001"),
    edge("J-0001", "LOGS", "WL-0001"),
  ];
  const NODES = [
    goal,
    actor,
    useCase,
    scenario,
    responsibility,
    requirement,
    criterion,
    task,
    waiting,
    journal,
    log,
  ];
  const CHAIN_READ = ledgerOf(
    approve(goal, SPINE),
    approve(actor, SPINE),
    approve(useCase, SPINE),
    approve(scenario, SPINE),
    approve(responsibility, SPINE),
    approve(requirement, SPINE),
    approve(criterion, SPINE),
    approve(task, SPINE),
    approve(waiting, SPINE),
  );

  function reviewWith(ledgers: Ledgers, ...extra: SpecEdge[]): GraphReview {
    return reviewGraph(
      graphOf({ nodes: NODES, edges: [...SPINE, ...extra] }),
      ledgers,
    );
  }

  test("work logged under a task whose chain is unread is red, with the sentence naming the task", () => {
    const review = reviewWith(unapproved, edge("WL-0001", "ADDRESSES", "IT-0001"));
    assert.equal(statusOf(review, "WL-0001")?.reason, "premature");
    assert.equal(
      statusOf(review, "WL-0001")?.problem,
      "WL-0001 addresses IT-0001, and IT-0001 is blocked — work is logged only under a task whose turn has come: its chain read and agreed, and everything it waits on finished.",
    );
    // The task itself is untouched by it: blocked is its state, not a defect.
    assert.equal(statusOf(review, "IT-0001")?.color, "yellow");
  });

  test("the same log under the same task, chain read, is ordinary yellow — the red clears itself", () => {
    const review = reviewWith(CHAIN_READ, edge("WL-0001", "ADDRESSES", "IT-0001"));
    assert.deepEqual(
      statusOf(review, "WL-0001"),
      status("WL-0001", "yellow", "unapproved"),
    );
  });

  test("an open prerequisite blocks the task, so work under it is red even with the whole chain read", () => {
    const review = reviewWith(CHAIN_READ, edge("WL-0001", "ADDRESSES", "IT-0002"));
    assert.equal(statusOf(review, "WL-0001")?.reason, "premature");
    assert.ok(statusOf(review, "WL-0001")?.problem?.includes("IT-0002 is blocked"));
  });

  test("a rule of the graph comes before the books here too: an approved log under a blocked task is red", () => {
    const edges = [...SPINE, edge("WL-0001", "ADDRESSES", "IT-0002")];
    const review = reviewGraph(
      graphOf({ nodes: NODES, edges }),
      ledgerOf(
        approve(goal, SPINE),
        approve(actor, SPINE),
        approve(useCase, SPINE),
        approve(scenario, SPINE),
        approve(responsibility, SPINE),
        approve(requirement, SPINE),
        approve(criterion, SPINE),
        approve(task, SPINE),
        approve(waiting, SPINE),
        approve(log, edges),
      ),
    );
    assert.equal(statusOf(review, "WL-0001")?.reason, "premature");
    assert.deepEqual(statusOf(review, "WL-0001")?.approval, APPROVER);
  });

  test("a deeper red keeps its own sentence — an aim breach is told about the aim, not the timing", () => {
    const evidence = node("Evidence", "EV-0001");
    const review = reviewGraph(
      graphOf({
        nodes: [...NODES, evidence],
        edges: [
          ...SPINE,
          edge("WL-0001", "ADDRESSES", "IT-0001"),
          edge("WL-0001", "SUBMITS", "EV-0001"),
          edge("EV-0001", "CLAIMS", "AC-9999"),
        ],
      }),
      unapproved,
    );
    assert.equal(statusOf(review, "WL-0001")?.reason, "off-target");
  });

  test("a dangling ADDRESSES is not asked about — the missing rule owns the hole", () => {
    const review = reviewWith(unapproved, edge("WL-0001", "ADDRESSES", "IT-9999"));
    assert.equal(statusOf(review, "WL-0001")?.reason, "unapproved");
    assert.deepEqual(
      review.missing.map((hole) => hole.id),
      ["IT-9999"],
    );
  });
});

describe("evidence stands on its claim", () => {
  // Rule 1's motivating regression, pinned: an APPROVED evidence that claims
  // nothing is still red — the approval is carried as history, never as a
  // colour over an unanchored node.
  const journal = node("Journal", "J-0001");
  const log = node("WorkLog", "WL-0001");
  const evidence = node("Evidence", "EV-0001");
  const NODES = [journal, log, evidence];
  const EDGES = [
    edge("J-0001", "LOGS", "WL-0001"),
    edge("WL-0001", "SUBMITS", "EV-0001"),
  ];

  test("an approved evidence that claims nothing is an orphan, approval and all", () => {
    const review = reviewGraph(
      graphOf({ nodes: NODES, edges: EDGES }),
      ledgerOf(approve(journal, EDGES), approve(log, EDGES), approve(evidence, EDGES)),
    );
    assert.equal(statusOf(review, "EV-0001")?.reason, "orphan");
    assert.equal(statusOf(review, "EV-0001")?.color, "red");
    assert.deepEqual(statusOf(review, "EV-0001")?.approval, APPROVER);
  });
});

describe("rejection", () => {
  // The same anchor every test in this block hangs off, so that what is under
  // test is the refusal and never the anchor.
  const responsibility = node("SystemResponsibility", "SR-0001");
  const anchoring = [edge("SR-0001", "REQUIRES", "R-0001")];

  function reviewOf(requirement: SpecNode, ledgers: Ledgers): GraphReview {
    return reviewGraph(
      graphOf({ nodes: [responsibility, requirement], edges: anchoring }),
      ledgers,
    );
  }

  test("a refusal taken over the bytes a node still has is red, and says what was said", () => {
    const requirement = node("Requirement", "R-0001");
    assert.deepEqual(
      statusOf(
        reviewOf(
          requirement,
          booksOf({ rejections: [reject(requirement, anchoring)] }),
        ),
        "R-0001",
      ),
      status("R-0001", "red", "rejected", null, REFUSAL),
    );
  });

  test("an edit lapses the refusal by arithmetic, and the record stays as history", () => {
    // Nobody withdrew anything and nothing swept the file. The agent fixed the
    // node, the hashes stopped matching, and the node is back in the queue —
    // still carrying what was said about the version before, because that is
    // the first thing a reviewer wants to read.
    const refused = node("Requirement", "R-0001");
    const fixed = { ...refused, body: "Now it says something about the empty case." };
    assert.deepEqual(
      statusOf(
        reviewOf(fixed, booksOf({ rejections: [reject(refused, anchoring)] })),
        "R-0001",
      ),
      status("R-0001", "yellow", "unapproved", null, REFUSAL),
    );
  });

  test("a refusal over an approval wins, and neither book erased the other", () => {
    // Approved on Friday, refused on Saturday at the very same bytes. The later
    // word is the one on the screen, the approval is still there to be shown,
    // and withdrawing the refusal puts the green straight back.
    const requirement = node("Requirement", "R-0001");
    const books = booksOf({
      approvals: [approve(requirement, anchoring)],
      rejections: [reject(requirement, anchoring)],
    });
    assert.deepEqual(
      statusOf(reviewOf(requirement, books), "R-0001"),
      status("R-0001", "red", "rejected", APPROVER, REFUSAL),
    );
    assert.deepEqual(
      statusOf(
        reviewOf(requirement, booksOf({ approvals: [approve(requirement, anchoring)] })),
        "R-0001",
      ),
      status("R-0001", "green", "approved", APPROVER),
    );
  });

  test("a file that will not read is told about the file, not about the refusal", () => {
    // The three structural reds are asked first on purpose: a node nothing
    // holds has a fix that comes before anybody's opinion of what it says.
    const stray = node("Requirement", "R-0001");
    const review = reviewGraph(
      graphOf({ nodes: [stray] }),
      booksOf({ rejections: [reject(stray)] }),
    );
    assert.deepEqual(review.statuses, [
      status("R-0001", "red", "orphan", null, REFUSAL),
    ]);
  });

  test("a rejection record for a node the graph does not have colours nothing", () => {
    // The books are never pruned, in either direction.
    const goal = node("Goal", "G-0001");
    const review = reviewGraph(
      graphOf({ nodes: [goal] }),
      booksOf({ rejections: [reject(node("Requirement", "R-0404"))] }),
    );
    assert.deepEqual(review.statuses, [
      status("G-0001", "yellow", "unapproved"),
    ]);
  });
});
