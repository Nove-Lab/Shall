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
  type ApprovalRecord,
} from "../serialize/index.js";
import type { RefusedFile, SpecGraph } from "../store/file-store.js";
import type { Approvals, PayloadHash } from "./color.js";
import { reviewGraph, type GraphReview, type ReviewStatus } from "./review.js";

/**
 * The colour chain, read through `reviewGraph` — the door every screen and
 * `shall check` come in by.
 *
 * THE GRAPHS BELOW ARE BUILT BY HAND AND NOT LOADED. No filesystem, no
 * temporary folders: `core/arith` is pure, and a test that had to write files to
 * ask what colour a node is would be testing the loader as well. What is asserted
 * is arithmetic over a graph and a ledger, which is exactly what the module
 * claims to be.
 *
 * THE HASH IS FAKE AND IT IS THE IDENTITY, on purpose. A real sha256 would make
 * every record a black box; with `sha256:<payload>` a fixture can say what a
 * record is taken over — a body, a relation, a deletion proposal, the node's own
 * address — and be wrong out loud when the payload changes shape. What is under
 * test is the ORDER the five questions are asked in and the arithmetic of two
 * files, never the cryptography, which core does not do at all.
 */

const hash: PayloadHash = (payload: string) => `sha256:${payload}`;

const APPROVED_AT = "2026-08-15T00:00:00Z";

/** Who the fixtures approve as, and when — the `{by, at}` every record carries. */
const APPROVER = { by: "t", at: APPROVED_AT };

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

/** The ledger these entries amount to, with the fake hash beside it. */
function ledgerOf(...entries: [string, ApprovalRecord][]): Approvals {
  return { records: new Map(entries), hash };
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

/**
 * One row of `statuses`, whole. Every assertion below compares a whole one, so
 * that a field quietly added or dropped is a failure rather than a silent pass.
 */
function status(
  id: string,
  color: ReviewStatus["color"],
  reason: ReviewStatus["reason"],
  approval: ReviewStatus["approval"] = null,
): ReviewStatus {
  return { id, color, reason, approval };
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
    approvals: Approvals = unapproved,
  ): GraphReview {
    return reviewGraph(
      graphOf({ nodes: [responsibility, requirement], edges: anchoring }),
      approvals,
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
    const approvals = ledgerOf(record);
    const proposed = {
      ...approved,
      deletionProposed: { by: "agent", rationale: "Superseded by R-0002." },
    };
    const rejected = { ...proposed, deletionProposed: undefined };
    assert.deepEqual(
      statusOf(reviewOf(rejected, approvals), "R-0001"),
      status("R-0001", "green", "approved", APPROVER),
    );
    // The chain reads the book and writes nothing in it, so what stands at the
    // end is the record from before the proposal was ever written.
    assert.deepEqual([...approvals.records], [record]);
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
