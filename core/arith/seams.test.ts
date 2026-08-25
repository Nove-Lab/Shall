import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatEdgeId,
  type SpecEdge,
  type SpecNode,
} from "../graph/index.js";
import type { SpecGraph } from "../store/file-store.js";
import type { Ledgers, PayloadHash } from "./color.js";
import { reviewGraph, type ReviewStatus } from "./review.js";

/**
 * THE MODULE LOOP, which is the one of the three that is DERIVED rather than
 * written down: no relation in the canon runs between two modules, so a hop is
 * `A CONSUMES I` met with `B EXPOSES I` and the pass has to see every contract
 * before it can name a single one.
 *
 * WHAT IS UNDER TEST HERE IS THE DERIVATION AND NOT THE COMPONENT WALK. That a
 * loop is red, that every node on one gets the sentence starting from itself,
 * and that a module talking to its own contract is not a loop are all
 * `color.test.ts`'s questions and are not asked again. What this file asks is
 * which hop comes out when one contract has several callers, and which contract
 * the sentence names when two of them run between the same pair.
 */

const hash: PayloadHash = (payload: string) => `sha256:${payload}`;

/** Nobody has approved anything: the colours below are the graph's alone. */
const unapproved: Ledgers = {
  approvals: new Map(),
  rejections: new Map(),
  acceptances: new Map(),
  hash,
};

function node(type: string, id: string): SpecNode {
  return {
    id,
    type,
    shortName: id,
    name: `${type} ${id}`,
    body: `What ${id} says.`,
    createdAt: 1,
    updatedAt: 1,
  };
}

function edge(fromId: string, type: string, toId: string): SpecEdge {
  return { id: formatEdgeId(fromId, type, toId), type, fromId, toId };
}

function graphOf(nodes: readonly SpecNode[], edges: readonly SpecEdge[]): SpecGraph {
  return { nodes: [...nodes], edges: [...edges], problems: [], refused: [] };
}

/**
 * The intent spine down to the responsibility every module below is realized
 * from — so no module in this file is red for an anchor the loop rule has no
 * opinion about.
 */
const SPINE: SpecNode[] = [
  node("Goal", "G-0001"),
  node("Actor", "A-0001"),
  node("UseCase", "UC-0001"),
  node("Scenario", "SC-0001"),
  node("SystemResponsibility", "SR-0001"),
];

const SPINE_EDGES: SpecEdge[] = [
  edge("G-0001", "PURSUED_BY", "A-0001"),
  edge("A-0001", "PERFORMS", "UC-0001"),
  edge("UC-0001", "DETAILS", "SC-0001"),
  edge("SC-0001", "DERIVES_RESPONSIBILITY", "SR-0001"),
];

function statusOf(
  nodes: readonly SpecNode[],
  edges: readonly SpecEdge[],
  id: string,
): ReviewStatus {
  const held = reviewGraph(graphOf(nodes, edges), unapproved).statuses.find(
    (row) => row.id === id,
  );
  assert.ok(held !== undefined, `no status for ${id}`);
  return held;
}

const RULE =
  "a module's dependencies run one way, and a loop means neither module can be built, read or replaced without the other. Remove one CONSUMES line, or move what both need into a module of its own.";

describe("a contract with several callers", () => {
  // M-0001 and M-0002 call each other's contracts; M-0003 calls I-0001 too and
  // publishes nothing, so it reaches M-0002 and never comes back.
  const NODES = [
    ...SPINE,
    node("Module", "M-0001"),
    node("Module", "M-0002"),
    node("Module", "M-0003"),
    node("Interface", "I-0001"),
    node("Interface", "I-0002"),
  ];
  const EDGES = [
    ...SPINE_EDGES,
    edge("SR-0001", "IS_REALIZED_BY", "M-0001"),
    edge("SR-0001", "IS_REALIZED_BY", "M-0002"),
    edge("SR-0001", "IS_REALIZED_BY", "M-0003"),
    edge("M-0002", "EXPOSES", "I-0001"),
    edge("M-0001", "CONSUMES", "I-0001"),
    // The second caller of one contract — indexed beside the first rather than
    // over it, which is what keeps M-0003's own hop in the derived graph.
    edge("M-0003", "CONSUMES", "I-0001"),
    edge("M-0001", "EXPOSES", "I-0002"),
    edge("M-0002", "CONSUMES", "I-0002"),
  ];

  test("every caller gets its own hop, and only the pair that comes back is on a loop", () => {
    assert.equal(statusOf(NODES, EDGES, "M-0001").reason, "cyclic");
    assert.equal(statusOf(NODES, EDGES, "M-0002").reason, "cyclic");
    // M-0003 reaches M-0002 through the same contract and there is no way
    // back, so it waits on the loop without standing on one.
    assert.equal(statusOf(NODES, EDGES, "M-0003").reason, "unapproved");
    // A contract is not on the loop either: it is the line a module draws, and
    // removing one is the fix rather than the fault.
    assert.equal(statusOf(NODES, EDGES, "I-0001").reason, "unapproved");
  });

  test("the sentence names the two lines to look at, from whichever end it is read", () => {
    assert.equal(
      statusOf(NODES, EDGES, "M-0001").problem,
      `M-0001 consumes I-0001, which M-0002 exposes, and M-0002 consumes I-0002, which M-0001 exposes — ${RULE}`,
    );
    assert.equal(
      statusOf(NODES, EDGES, "M-0002").problem,
      `M-0002 consumes I-0002, which M-0001 exposes, and M-0001 consumes I-0001, which M-0002 exposes — ${RULE}`,
    );
    assert.equal(statusOf(NODES, EDGES, "M-0003").problem, null);
  });
});

describe("two contracts between one pair", () => {
  // M-0001 calls both of M-0002's contracts, and M-0002 calls M-0001's. Either
  // of the two would name the loop truthfully; the smallest id is the one
  // named, so the sentence does not change between two reads of one graph.
  const NODES = [
    ...SPINE,
    node("Module", "M-0001"),
    node("Module", "M-0002"),
    node("Interface", "I-0001"),
    node("Interface", "I-0002"),
    node("Interface", "I-0003"),
  ];
  const HELD = [
    ...SPINE_EDGES,
    edge("SR-0001", "IS_REALIZED_BY", "M-0001"),
    edge("SR-0001", "IS_REALIZED_BY", "M-0002"),
    edge("M-0002", "EXPOSES", "I-0001"),
    edge("M-0002", "EXPOSES", "I-0002"),
    edge("M-0001", "EXPOSES", "I-0003"),
    edge("M-0002", "CONSUMES", "I-0003"),
  ];
  const SENTENCE = `M-0001 consumes I-0001, which M-0002 exposes, and M-0002 consumes I-0003, which M-0001 exposes — ${RULE}`;

  test("the smallest contract id names the hop, whichever order the lines arrive in", () => {
    const smallestFirst = [
      ...HELD,
      edge("M-0001", "CONSUMES", "I-0001"),
      edge("M-0001", "CONSUMES", "I-0002"),
    ];
    assert.equal(statusOf(NODES, smallestFirst, "M-0001").problem, SENTENCE);
    const smallestLast = [
      ...HELD,
      edge("M-0001", "CONSUMES", "I-0002"),
      edge("M-0001", "CONSUMES", "I-0001"),
    ];
    assert.equal(statusOf(NODES, smallestLast, "M-0001").problem, SENTENCE);
  });
});
