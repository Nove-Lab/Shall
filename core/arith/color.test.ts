import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatEdgeId,
  type SpecEdge,
  type SpecNode,
} from "../graph/index.js";
import { approvalPayload, blocksOf } from "../serialize/index.js";
import type { RefusedFile, SpecGraph } from "../store/file-store.js";
import type { Seal } from "./color.js";
import { reviewGraph, type GraphReview, type ReviewStatus } from "./review.js";

/**
 * The colour chain, read through `reviewGraph` — the door every screen and
 * `shall check` come in by.
 *
 * THE GRAPHS BELOW ARE BUILT BY HAND AND NOT LOADED. No filesystem, no
 * temporary folders: `core/arith` is pure, and a test that had to write files to
 * ask what colour a node is would be testing the loader as well. What is asserted
 * is arithmetic over a graph, which is exactly what the module claims to be.
 *
 * THE SEAL IS FAKE AND ITS HASH IS THE IDENTITY, on purpose. A real sha256 would
 * make every hash assertion a black box; with `sha256:<payload>` the tests can
 * say what the signature signs — a body, a relation, a deletion proposal — and
 * be wrong out loud when the payload changes shape. Verification is a string
 * comparison for the same reason: what is under test is the ORDER the six
 * questions are asked in, never the cryptography, which core does not do.
 */

const seal: Seal = {
  hash: (payload: string) => `sha256:${payload}`,
  verifies: (hash: string, tag: string) => tag === `hmac:${hash}`,
};

const APPROVED_AT = "2026-08-15T00:00:00Z";

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
 * The hash a node's approval would carry — the bytes of its own file with the
 * signature left out, over the relations that leave it.
 *
 * A DELETION PROPOSAL IS INSIDE THESE BYTES and the approval is not, which is
 * `approvalPayload`'s rule and the whole reason proposing a deletion turns a
 * node yellow without a branch anywhere in the chain.
 */
function hashOf(node: SpecNode, edges: readonly SpecEdge[]): string {
  return seal.hash(
    approvalPayload(
      node.type,
      node.id,
      node,
      edges.filter((held) => held.fromId === node.id),
      blocksOf(node),
    ),
  );
}

/** A node as the daemon would leave it after somebody pressed approve. */
function approve(node: SpecNode, edges: readonly SpecEdge[] = []): SpecNode {
  const hash = hashOf(node, edges);
  return {
    ...node,
    approval: { hash, tag: `hmac:${hash}`, by: "t", at: APPROVED_AT },
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
      seal,
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
      seal,
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
      seal,
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
      seal,
    );
    assert.deepEqual(review.missing, []);
    assert.deepEqual(review.broken, []);
    assert.deepEqual(review.statuses.map((status) => status.id), [
      "D-0001",
      "SR-0001",
    ]);
  });

  test("a node no live anchor reaches is red, even when it is approved", () => {
    // The signature is real and the person meant it. It does not answer the
    // question the anchor asks, which is whether this Requirement is part of
    // the specification at all.
    const requirement = approve(node("Requirement", "R-0001"));
    const review = reviewGraph(graphOf({ nodes: [requirement] }), seal);
    assert.deepEqual(review.statuses, [
      { id: "R-0001", color: "red", reason: "orphan" },
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
      seal,
    );
    assert.deepEqual(review.statuses, [
      { id: "D-0001", color: "red", reason: "orphan" },
      { id: "Q-0002", color: "red", reason: "orphan" },
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
      seal,
    );
    assert.deepEqual(statusOf(review, "R-0001"), {
      id: "R-0001",
      color: "red",
      reason: "orphan",
    });
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
      seal,
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
        seal,
      );
      assert.deepEqual(statusOf(review, "IF-0001"), {
        id: "IF-0001",
        color: "yellow",
        reason: "unapproved",
      });
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
      seal,
    );
    assert.deepEqual(statusOf(held, "D-0001"), {
      id: "D-0001",
      color: "yellow",
      reason: "unapproved",
    });

    const loose = reviewGraph(
      graphOf({
        nodes: [node("Decision", "D-0001"), node("Term", "T-0001")],
        edges: [edge("D-0001", "MENTIONS", "T-0001")],
      }),
      seal,
    );
    assert.deepEqual(statusOf(loose, "D-0001"), {
      id: "D-0001",
      color: "red",
      reason: "orphan",
    });
  });

  test("a rootless type is never an orphan", () => {
    // A Goal is where a specification starts. Requiring something to point at
    // it would make an empty project's first node wrong the moment it was
    // written, so a Goal alone is unapproved and not broken.
    const review = reviewGraph(
      graphOf({ nodes: [node("Goal", "G-0001")] }),
      seal,
    );
    assert.deepEqual(review.statuses, [
      { id: "G-0001", color: "yellow", reason: "unapproved" },
    ]);
  });
});

describe("yellow and green", () => {
  // The anchor every node in this block hangs off, so that what is under test
  // is the approval half and never the anchor half.
  const responsibility = node("SystemResponsibility", "SR-0001");
  const anchoring = [edge("SR-0001", "REQUIRES", "R-0001")];

  function reviewOf(requirement: SpecNode): GraphReview {
    return reviewGraph(
      graphOf({ nodes: [responsibility, requirement], edges: anchoring }),
      seal,
    );
  }

  test("a node with no approval block is yellow", () => {
    assert.deepEqual(statusOf(reviewOf(node("Requirement", "R-0001")), "R-0001"), {
      id: "R-0001",
      color: "yellow",
      reason: "unapproved",
    });
  });

  test("a tag this machine's key did not make is yellow", () => {
    // The hash is perfectly correct — an agent can compute one from the file.
    // What it cannot make is the tag, and that is the whole of what makes green
    // a state only a person can put a node into.
    const base = node("Requirement", "R-0001");
    const forged = {
      ...base,
      approval: {
        hash: hashOf(base, anchoring),
        tag: "hmac:another-machine",
        by: "t",
        at: APPROVED_AT,
      },
    };
    assert.deepEqual(statusOf(reviewOf(forged), "R-0001"), {
      id: "R-0001",
      color: "yellow",
      reason: "forged",
    });
  });

  test("a body edited after approval is yellow", () => {
    const signed = approve(node("Requirement", "R-0001"), anchoring);
    const edited = { ...signed, body: "Something else entirely." };
    assert.deepEqual(statusOf(reviewOf(edited), "R-0001"), {
      id: "R-0001",
      color: "yellow",
      reason: "changed",
    });
  });

  test("a relation added after approval is yellow", () => {
    // The relations are lines in this node's file, so they are inside what the
    // signature signs. Adding one is an edit like any other.
    const signed = approve(node("Requirement", "R-0001"), anchoring);
    const review = reviewGraph(
      graphOf({
        nodes: [responsibility, node("Term", "T-0001"), signed],
        edges: [...anchoring, edge("R-0001", "MENTIONS", "T-0001")],
      }),
      seal,
    );
    assert.deepEqual(statusOf(review, "R-0001"), {
      id: "R-0001",
      color: "yellow",
      reason: "changed",
    });
  });

  test("a deletion proposal is a change like any other, and the node turns yellow", () => {
    // There is no branch in the chain for a proposal, and there does not need
    // to be one: the block sits inside the payload, so an agent writing it
    // un-matches the hash by itself.
    const signed = approve(node("Requirement", "R-0001"), anchoring);
    const proposed = {
      ...signed,
      deletionProposed: { by: "agent", rationale: "Superseded by R-0002." },
    };
    assert.deepEqual(statusOf(reviewOf(proposed), "R-0001"), {
      id: "R-0001",
      color: "yellow",
      reason: "changed",
    });
  });

  test("stripping the proposal makes the hash fit again, with nothing else undone", () => {
    // Rejecting a proposed deletion is one block removed and no state repaired,
    // because no state was ever stored: the same bytes hash to the same string,
    // and the person's signature was never touched.
    const signed = approve(node("Requirement", "R-0001"), anchoring);
    const proposed = {
      ...signed,
      deletionProposed: { by: "agent", rationale: "Superseded by R-0002." },
    };
    const rejected = { ...proposed, deletionProposed: undefined };
    assert.deepEqual(statusOf(reviewOf(rejected), "R-0001"), {
      id: "R-0001",
      color: "green",
      reason: "approved",
    });
    assert.deepEqual(rejected.approval, signed.approval);
  });

  test("an approved, anchored node comes back green and says only that", () => {
    const signed = approve(node("Requirement", "R-0001"), anchoring);
    const review = reviewOf(signed);
    assert.deepEqual(statusOf(review, "R-0001"), {
      id: "R-0001",
      color: "green",
      reason: "approved",
    });
    assert.deepEqual(review.missing, []);
    assert.deepEqual(review.broken, []);
  });
});

describe("outside colour", () => {
  test("an execution node has no colour at all", () => {
    // A work log is the record of work done. It is not approved and cannot go
    // stale — a log from March is exactly as true in June — so it is dropped
    // rather than filed as some fourth kind of thing.
    const review = reviewGraph(
      graphOf({
        nodes: [node("WorkLog", "WL-0001"), node("Goal", "G-0001")],
      }),
      seal,
    );
    assert.equal(statusOf(review, "WL-0001"), undefined);
    assert.deepEqual(review.statuses.map((status) => status.id), ["G-0001"]);
  });
});
