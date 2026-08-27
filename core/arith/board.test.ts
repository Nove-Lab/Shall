import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
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
import type { RefusedFile, SpecGraph } from "../store/file-store.js";
import { workBoardOf, type WorkBoard } from "./board.js";
import { colorContextOf, type Ledgers, type PayloadHash } from "./color.js";
import { reviewBundles } from "./bundles.js";
import { reviewGraph } from "./review.js";
import {
  chainGreen,
  depthOf,
  isCompleted,
  prerequisitesMet,
  workItemStateOf,
  upwardChainOf,
  type ColorAt,
} from "./work-item-state.js";

/**
 * The Work Board, over graphs built by hand and the identity hash.
 *
 * THE TWO HALVES ARE TESTED AS THE TWO QUESTIONS THEY ARE. Fix Spec is about
 * what a person is told and in what order — the rationale WHOLE, one row per
 * broken file, one row per hole. Implement is about a gate: which work items pass
 * all three conditions, and — the property the whole design turns on — that the
 * gate is LOCAL, so a yellow node in an unrelated part of the graph hides
 * nothing here.
 */

const hash: PayloadHash = (payload: string) => `sha256:${payload}`;

const APPROVER = { by: "t", at: "2026-08-15T00:00:00Z" };
const ACCEPTOR = { by: "t", at: "2026-08-16T00:00:00Z" };
const REFUSAL = {
  by: "t",
  at: "2026-08-16T12:00:00Z",
  rationale: "It says nothing about the empty case.\nSay what happens then.",
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

function graphOf(
  nodes: readonly SpecNode[],
  edges: readonly SpecEdge[],
  extra: Partial<SpecGraph> = {},
): SpecGraph {
  return {
    nodes: [...nodes],
    edges: [...edges],
    problems: [],
    refused: [],
    ...extra,
  };
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

function leaveOpen(
  subject: SpecNode,
  claimants: readonly SpecNode[],
  edges: readonly SpecEdge[],
  kind = closureKindOf(subject.type)?.kind ?? "criterion",
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
 * ONE SPINE, GREEN FROM THE GOAL DOWN, with a work item at the bottom. Every test
 * below starts from this and breaks exactly one thing.
 */
const goal = node("Goal", "G-0001");
const parentGoal = node("Goal", "G-0000");
const actor = node("Actor", "A-0001");
const useCase = node("UseCase", "UC-0001");
const scenario = node("Scenario", "SC-0001");
const responsibility = node("SystemResponsibility", "SR-0001");
const requirement = node("Requirement", "R-0001");
const criterion = node("AcceptanceCriterion", "AC-0001");
const constraint = node("Constraint", "C-0001");
const module = node("Module", "M-0001");
const workItem = node("WorkItem", "WI-0001");
const other = node("WorkItem", "WI-0002");
const iface = node("Interface", "IF-0001");
const schema = node("DataSchema", "DS-0001");
const assumption = node("Assumption", "AS-0001");
const term = node("Term", "T-0001");
const journal = node("Journal", "J-0001");
const workLog = node("WorkLog", "WL-0001");
/** The work item's claimant since #24— : a report, submitted by the log, claiming one work item. */
const report = node("CompletionReport", "CR-0001");

const SPINE_NODES = [
  parentGoal,
  goal,
  actor,
  useCase,
  scenario,
  responsibility,
  requirement,
  criterion,
  constraint,
  module,
  workItem,
];

const SPINE: SpecEdge[] = [
  edge("G-0000", "REFINES", "G-0001"),
  edge("G-0001", "PURSUED_BY", "A-0001"),
  edge("A-0001", "PERFORMS", "UC-0001"),
  edge("UC-0001", "DETAILS", "SC-0001"),
  edge("SC-0001", "DERIVES_RESPONSIBILITY", "SR-0001"),
  edge("SR-0001", "REQUIRES", "R-0001"),
  edge("R-0001", "HAS_CRITERION", "AC-0001"),
  edge("R-0001", "HAS_CONSTRAINT", "C-0001"),
  edge("SR-0001", "IS_REALIZED_BY", "M-0001"),
  edge("M-0001", "ALLOCATES", "WI-0001"),
  edge("WI-0001", "TARGETS", "AC-0001"),
];

/** The whole spine, approved — every node green and nothing else said. */
function settled(
  nodes: readonly SpecNode[] = SPINE_NODES,
  edges: readonly SpecEdge[] = SPINE,
): Ledgers {
  return booksOf({ approvals: nodes.map((held) => approve(held, edges)) });
}

function boardOf(
  nodes: readonly SpecNode[],
  edges: readonly SpecEdge[],
  ledgers: Ledgers,
  extra: Partial<SpecGraph> = {},
): WorkBoard {
  return workBoardOf(graphOf(nodes, edges, extra), ledgers);
}

function colorsOf(
  nodes: readonly SpecNode[],
  edges: readonly SpecEdge[],
  ledgers: Ledgers,
): ColorAt {
  const review = reviewGraph(graphOf(nodes, edges), ledgers);
  const held = new Map(review.statuses.map((row) => [row.id, row.color]));
  return (id) => held.get(id) ?? null;
}

describe("the chain a work item hangs from", () => {
  test("runs up the spine and includes the work item itself", () => {
    const context = colorContextOf(graphOf(SPINE_NODES, SPINE), settled());
    // Byte order, so `A-0001` precedes `AC-0001`: `-` is 0x2D and `C` is 0x43.
    assert.deepEqual(upwardChainOf(workItem, context), [
      "A-0001",
      "AC-0001",
      "C-0001",
      "G-0000",
      "G-0001",
      "M-0001",
      "R-0001",
      "SC-0001",
      "SR-0001",
      "UC-0001",
      "WI-0001",
    ]);
  });

  test("leaves out everything hanging beside it", () => {
    // The local gate, stated as membership: an interface, a schema, a
    // satellite, a term, a work log and the module's OTHER work item are all one
    // relation away and none of them is above this work item.
    const nodes = [
      ...SPINE_NODES,
      iface,
      schema,
      assumption,
      term,
      journal,
      workLog,
      other,
    ];
    const edges = [
      ...SPINE,
      edge("M-0001", "EXPOSES", "IF-0001"),
      edge("IF-0001", "CARRIES", "DS-0001"),
      edge("M-0001", "ASSUMES", "AS-0001"),
      edge("R-0001", "MENTIONS", "T-0001"),
      edge("M-0001", "ALLOCATES", "WI-0002"),
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "WI-0001"),
    ];
    const chain = upwardChainOf(workItem, colorContextOf(graphOf(nodes, edges), settled()));
    for (const absent of [
      "IF-0001",
      "DS-0001",
      "AS-0001",
      "T-0001",
      "J-0001",
      "WL-0001",
      "WI-0002",
    ]) {
      assert.equal(chain.includes(absent), false, absent);
    }
  });

  test("reaches a goal's parents and not its children", () => {
    // REFINES is written parent → child, so the parent is the SOURCE of the
    // incoming edge. A sub-goal in another branch is not above this work item, and a
    // yellow one there must not hide it.
    const sub = node("Goal", "G-0009");
    const nodes = [...SPINE_NODES, sub];
    const edges = [...SPINE, edge("G-0001", "REFINES", "G-0009")];
    const context = colorContextOf(graphOf(nodes, edges), settled());
    const chain = upwardChainOf(workItem, context);
    assert.equal(chain.includes("G-0000"), true);
    assert.equal(chain.includes("G-0009"), false);

    const ledgers = settled(SPINE_NODES, edges);
    assert.equal(chainGreen(workItem, context, colorsOf(nodes, edges, ledgers)), true);
  });

  test("terminates on a REFINES cycle", () => {
    const edges = [...SPINE, edge("G-0001", "REFINES", "G-0000")];
    const context = colorContextOf(graphOf(SPINE_NODES, edges), settled());
    const chain = upwardChainOf(workItem, context);
    assert.equal(chain.filter((id) => id === "G-0000").length, 1);
    assert.equal(chain.filter((id) => id === "G-0001").length, 1);
  });

  test("takes every parent when a criterion hangs off two carriers", () => {
    // A DAG, not a tree: the criterion this work item targets is also a scenario's,
    // so both spines are above the work item and either one can hide it.
    const second = node("Scenario", "SC-0002");
    const nodes = [...SPINE_NODES, second];
    const edges = [...SPINE, edge("SC-0002", "HAS_CRITERION", "AC-0001")];
    const context = colorContextOf(graphOf(nodes, edges), settled());
    assert.equal(upwardChainOf(workItem, context).includes("SC-0002"), true);
  });

  test("counts a dangling far end and does not walk through it", () => {
    // Two reasons the chain is not green here, and the assertion means both:
    // AC-0404 is a hole, and a second TARGETS line is the aim rule's own red.
    const edges = [...SPINE, edge("WI-0001", "TARGETS", "AC-0404")];
    const context = colorContextOf(graphOf(SPINE_NODES, edges), settled());
    const chain = upwardChainOf(workItem, context);
    assert.equal(chain.includes("AC-0404"), true);
    assert.equal(
      chainGreen(workItem, context, colorsOf(SPINE_NODES, edges, settled(SPINE_NODES, edges))),
      false,
    );
  });
});

describe("whether a work item can be picked up", () => {
  test("is ready when the chain is green and nothing is owed", () => {
    const ledgers = settled();
    const context = colorContextOf(graphOf(SPINE_NODES, SPINE), ledgers);
    assert.equal(
      workItemStateOf(workItem, context, colorsOf(SPINE_NODES, SPINE, ledgers)),
      "ready",
    );
  });

  test("is blocked by one unread node anywhere above it", () => {
    for (const held of SPINE_NODES) {
      const ledgers = booksOf({
        approvals: SPINE_NODES.filter((row) => row.id !== held.id).map((row) =>
          approve(row, SPINE),
        ),
      });
      const context = colorContextOf(graphOf(SPINE_NODES, SPINE), ledgers);
      assert.equal(
        workItemStateOf(workItem, context, colorsOf(SPINE_NODES, SPINE, ledgers)),
        "blocked",
        held.id,
      );
    }
  });

  test("is blocked while a prerequisite is unfinished, and ready once it closes", () => {
    const nodes = [...SPINE_NODES, other, journal, workLog, report];
    const edges = [
      ...SPINE,
      edge("M-0001", "ALLOCATES", "WI-0002"),
      edge("WI-0001", "DEPENDS_ON", "WI-0002"),
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "WI-0002"),
      edge("WL-0001", "SUBMITS", "CR-0001"),
      edge("CR-0001", "CLAIMS", "WI-0002"),
    ];
    const green = settled(nodes, edges);
    const waiting = colorContextOf(graphOf(nodes, edges), green);
    assert.equal(
      workItemStateOf(workItem, waiting, colorsOf(nodes, edges, green)),
      "blocked",
    );

    const closed = booksOf({
      approvals: nodes.map((held) => approve(held, edges)),
      acceptances: [accept(other, [report], edges)],
    });
    const context = colorContextOf(graphOf(nodes, edges), closed);
    assert.equal(isCompleted(other, context), true);
    assert.equal(prerequisitesMet(workItem, context), true);
    assert.equal(
      workItemStateOf(workItem, context, colorsOf(nodes, edges, closed)),
      "ready",
    );
  });

  test("is blocked by a prerequisite no file answers to", () => {
    const edges = [...SPINE, edge("WI-0001", "DEPENDS_ON", "WI-0404")];
    const ledgers = settled(SPINE_NODES, edges);
    const context = colorContextOf(graphOf(SPINE_NODES, edges), ledgers);
    assert.equal(prerequisitesMet(workItem, context), false);
    assert.equal(
      workItemStateOf(workItem, context, colorsOf(SPINE_NODES, edges, ledgers)),
      "blocked",
    );
  });

  test("is done once a person closes it on the report that verified it", () => {
    const nodes = [...SPINE_NODES, journal, workLog, report];
    const edges = [
      ...SPINE,
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "WI-0001"),
      edge("WL-0001", "SUBMITS", "CR-0001"),
      edge("CR-0001", "CLAIMS", "WI-0001"),
    ];
    const ledgers = booksOf({
      approvals: nodes.map((held) => approve(held, edges)),
      acceptances: [accept(workItem, [report], edges)],
    });
    const context = colorContextOf(graphOf(nodes, edges), ledgers);
    assert.equal(
      workItemStateOf(workItem, context, colorsOf(nodes, edges, ledgers)),
      "done",
    );
  });

  test("comes back to ready when the closing is withdrawn as a leaving-open", () => {
    const nodes = [...SPINE_NODES, journal, workLog, report];
    const edges = [
      ...SPINE,
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "WI-0001"),
      edge("WL-0001", "SUBMITS", "CR-0001"),
      edge("CR-0001", "CLAIMS", "WI-0001"),
    ];
    const ledgers = booksOf({
      approvals: nodes.map((held) => approve(held, edges)),
      rejections: [leaveOpen(workItem, [report], edges)],
    });
    const context = colorContextOf(graphOf(nodes, edges), ledgers);
    assert.equal(
      workItemStateOf(workItem, context, colorsOf(nodes, edges, ledgers)),
      "ready",
    );
  });

  test("is in review from the report's claim until a person answers it", () => {
    // A second turn picking this up would build the same thing twice, so the
    // word keeps it off the board — approved report or not, until it is closed.
    const nodes = [...SPINE_NODES, journal, workLog, report];
    const edges = [
      ...SPINE,
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "WI-0001"),
      edge("WL-0001", "SUBMITS", "CR-0001"),
      edge("CR-0001", "CLAIMS", "WI-0001"),
    ];
    const unread = settled(SPINE_NODES, edges);
    assert.equal(
      workItemStateOf(
        workItem,
        colorContextOf(graphOf(nodes, edges), unread),
        colorsOf(nodes, edges, unread),
      ),
      "in_review",
    );
    const approved = settled(nodes, edges);
    assert.equal(
      workItemStateOf(
        workItem,
        colorContextOf(graphOf(nodes, edges), approved),
        colorsOf(nodes, edges, approved),
      ),
      "in_review",
    );
  });

  test("comes back to ready when the report itself is refused", () => {
    const nodes = [...SPINE_NODES, journal, workLog, report];
    const edges = [
      ...SPINE,
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "WI-0001"),
      edge("WL-0001", "SUBMITS", "CR-0001"),
      edge("CR-0001", "CLAIMS", "WI-0001"),
    ];
    const ledgers = booksOf({
      approvals: [...SPINE_NODES, journal, workLog].map((held) =>
        approve(held, edges),
      ),
      rejections: [reject(report, edges)],
    });
    const context = colorContextOf(graphOf(nodes, edges), ledgers);
    assert.equal(
      workItemStateOf(workItem, context, colorsOf(nodes, edges, ledgers)),
      "ready",
    );
  });

  test("stays ready under a log that claims nothing — a turn that stopped part-way", () => {
    const nodes = [...SPINE_NODES, journal, workLog];
    const edges = [
      ...SPINE,
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "WI-0001"),
    ];
    const ledgers = settled(SPINE_NODES, edges);
    const context = colorContextOf(graphOf(nodes, edges), ledgers);
    assert.equal(
      workItemStateOf(workItem, context, colorsOf(nodes, edges, ledgers)),
      "ready",
    );
  });

  test("does not hide a work item because an unrelated chain is unread", () => {
    // THE LOCAL GATE. A second spine, entirely yellow, and the first work item is
    // still ready — the two are neighbours on a board and nothing else.
    const strangers = [
      node("Goal", "G-0100"),
      node("Actor", "A-0100"),
      node("UseCase", "UC-0100"),
      node("Scenario", "SC-0100"),
      node("SystemResponsibility", "SR-0100"),
      node("Module", "M-0100"),
      node("WorkItem", "WI-0100"),
    ];
    const edges = [
      ...SPINE,
      edge("G-0100", "PURSUED_BY", "A-0100"),
      edge("A-0100", "PERFORMS", "UC-0100"),
      edge("UC-0100", "DETAILS", "SC-0100"),
      edge("SC-0100", "DERIVES_RESPONSIBILITY", "SR-0100"),
      edge("SR-0100", "IS_REALIZED_BY", "M-0100"),
      edge("M-0100", "ALLOCATES", "WI-0100"),
    ];
    const nodes = [...SPINE_NODES, ...strangers];
    const ledgers = settled(SPINE_NODES, edges);
    const board = boardOf(nodes, edges, ledgers);
    assert.deepEqual(
      board.implement.map((row) => row.id),
      ["WI-0001"],
    );
  });
});

describe("how deep a work item sits", () => {
  const a = node("WorkItem", "WI-000A");
  const b = node("WorkItem", "WI-000B");
  const c = node("WorkItem", "WI-000C");

  test("counts the longest chain under it", () => {
    const edges = [
      edge("WI-000C", "DEPENDS_ON", "WI-000B"),
      edge("WI-000B", "DEPENDS_ON", "WI-000A"),
    ];
    const context = colorContextOf(graphOf([a, b, c], edges), booksOf({}));
    assert.equal(depthOf("WI-000A", context), 0);
    assert.equal(depthOf("WI-000B", context), 1);
    assert.equal(depthOf("WI-000C", context), 2);
  });

  test("takes the deeper side of a diamond", () => {
    const d = node("WorkItem", "WI-000D");
    const edges = [
      edge("WI-000D", "DEPENDS_ON", "WI-000C"),
      edge("WI-000D", "DEPENDS_ON", "WI-000A"),
      edge("WI-000C", "DEPENDS_ON", "WI-000B"),
      edge("WI-000B", "DEPENDS_ON", "WI-000A"),
    ];
    const context = colorContextOf(graphOf([a, b, c, d], edges), booksOf({}));
    assert.equal(depthOf("WI-000D", context), 3);
  });

  test("counts a hole as nothing, and a cycle terminates on the path it came by", () => {
    const holed = colorContextOf(
      graphOf([a], [edge("WI-000A", "DEPENDS_ON", "WI-0404")]),
      booksOf({}),
    );
    assert.equal(depthOf("WI-000A", holed), 0);

    const looped = colorContextOf(
      graphOf(
        [a, b],
        [
          edge("WI-000A", "DEPENDS_ON", "WI-000B"),
          edge("WI-000B", "DEPENDS_ON", "WI-000A"),
        ],
      ),
      booksOf({}),
    );
    // Neither is deeper than the other and neither hangs: the walk drops an id
    // already on its own path, so the pair simply stops counting each other.
    assert.equal(depthOf("WI-000A", looped), 1);
    assert.equal(depthOf("WI-000B", looped), 1);
  });
});

describe("the Implement column", () => {
  const nodes = [...SPINE_NODES, journal, workLog];
  const edges = [
    ...SPINE,
    edge("J-0001", "LOGS", "WL-0001"),
    edge("WL-0001", "ADDRESSES", "WI-0001"),
  ];

  test("names what the work item belongs to, aims at and already has work on", () => {
    const ledgers = settled(nodes, edges);
    const [row] = boardOf(nodes, edges, ledgers).implement;
    assert.ok(row !== undefined);
    assert.equal(row.id, "WI-0001");
    assert.deepEqual(
      row.modules.map((ref) => ref.id),
      ["M-0001"],
    );
    assert.deepEqual(
      row.requirements.map((ref) => ref.id),
      ["R-0001"],
    );
    assert.deepEqual(row.targets, [
      { id: "AC-0001", name: "AcceptanceCriterion AC-0001", closure: "open" },
    ]);
    assert.deepEqual(row.addressedBy, [
      { id: "WL-0001", name: "WorkLog WL-0001", color: "green" },
    ]);
    assert.equal(row.depth, 0);
  });

  test("carries a work item that targets no criterion at all", () => {
    // Foundation work: nothing to close, and still work somebody can start.
    const foundation = node("WorkItem", "WI-0003");
    const board = boardOf(
      [...SPINE_NODES, foundation],
      [...SPINE, edge("M-0001", "ALLOCATES", "WI-0003")],
      settled(
        [...SPINE_NODES, foundation],
        [...SPINE, edge("M-0001", "ALLOCATES", "WI-0003")],
      ),
    );
    const row = board.implement.find((held) => held.id === "WI-0003");
    assert.ok(row !== undefined);
    assert.deepEqual(row.targets, []);
    assert.deepEqual(row.requirements, []);
  });

  test("names every carrier of the criteria it aims at, in id order", () => {
    // A work item may aim at a requirement's criterion and a scenario's at
    // once, which is why the field is not called `requirementsOnly` — and the
    // list reads in id order however the aims themselves sort.
    const integration = node("AcceptanceCriterion", "AC-0000");
    const all = [...SPINE_NODES, integration];
    const wired = [
      ...SPINE,
      edge("SC-0001", "HAS_CRITERION", "AC-0000"),
      edge("WI-0001", "TARGETS", "AC-0000"),
    ];
    const board = boardOf(all, wired, settled(all, wired));
    const row = board.implement.find((held) => held.id === "WI-0001");
    assert.ok(row !== undefined);
    assert.deepEqual(
      row.targets.map((target) => target.id),
      ["AC-0000", "AC-0001"],
    );
    assert.deepEqual(
      row.requirements.map((ref) => ref.id),
      ["R-0001", "SC-0001"],
    );
  });

  test("is exactly the work items the review calls ready", () => {
    // THE CROSS-CHECK THE BADGE OWES THE BOARD. One predicate, two readers, and
    // this is what makes them the same answer rather than two that agree today.
    const ledgers = settled(nodes, edges);
    const graph = graphOf(nodes, edges);
    const ready = reviewGraph(graph, ledgers)
      .statuses.filter((row) => row.workItemState === "ready")
      .map((row) => row.id);
    assert.deepEqual(
      workBoardOf(graph, ledgers).implement.map((row) => row.id),
      ready,
    );
    // And every work item wears exactly one of the three words.
    const words = reviewGraph(graph, ledgers)
      .statuses.filter((row) => row.id.startsWith("WI-"))
      .map((row) => row.workItemState);
    assert.deepEqual(words, ["ready"]);
  });

  test("orders by id, whatever the depths and the ages say", () => {
    const first = node("WorkItem", "WI-0010", { updatedAt: 5 });
    const second = node("WorkItem", "WI-0011", { updatedAt: 3 });
    const later = node("WorkItem", "WI-0012", { updatedAt: 1 });
    const all = [...SPINE_NODES, first, second, later];
    const wired = [
      ...SPINE,
      edge("M-0001", "ALLOCATES", "WI-0010"),
      edge("M-0001", "ALLOCATES", "WI-0011"),
      edge("M-0001", "ALLOCATES", "WI-0012"),
      edge("WI-0012", "DEPENDS_ON", "WI-0011"),
    ];
    const board = boardOf(all, wired, settled(all, wired));
    // WI-0012 waits on WI-0011, which is not closed — so it is not here at
    // all; the rest read in id order, however old or shallow they are.
    assert.deepEqual(
      board.implement.map((row) => row.id),
      ["WI-0001", "WI-0010", "WI-0011"],
    );
  });
});

describe("the Fix Spec column", () => {
  test("carries a rejection's rationale whole, with who said it and when", () => {
    const ledgers = booksOf({
      approvals: SPINE_NODES.map((held) => approve(held, SPINE)),
      rejections: [reject(requirement, SPINE)],
    });
    const [row] = boardOf(SPINE_NODES, SPINE, ledgers).fixSpec;
    assert.ok(row !== undefined);
    assert.deepEqual(row, {
      key: "fix:R-0001",
      id: "R-0001",
      type: "Requirement",
      shortName: "R-0001",
      name: "Requirement R-0001",
      kind: "rejected",
      reason: "rejected",
      detail: REFUSAL.rationale,
      file: null,
      by: REFUSAL.by,
      at: REFUSAL.at,
      updatedAt: 1,
    });
    // The whole thing, line breaks and all — never a first line.
    assert.equal(row.detail.includes("\n"), true);
  });

  test("says the same words about an orphan that `shall check` does", () => {
    const lone = node("Requirement", "R-0002");
    const board = boardOf([...SPINE_NODES, lone], SPINE, settled());
    const row = board.fixSpec.find((held) => held.id === "R-0002");
    assert.ok(row !== undefined);
    assert.equal(
      row.detail,
      "R-0002 is a Requirement with no live anchor — it is held to the graph by a REQUIRES relation into it, and none stands. Draw the relation, or remove the node.",
    );
    assert.equal(row.kind, "grammar");
  });

  test("says the aim rule's sentence under both ends of a breach", () => {
    // The work was done under WI-0001, which aims at AC-0001; the evidence
    // submitted for it claims some other criterion, so the log's file and the
    // evidence's file are both places the seam can be closed.
    const evidence = node("Evidence", "EV-0001");
    const aside = node("AcceptanceCriterion", "AC-0002");
    const nodes = [...SPINE_NODES, journal, workLog, evidence, aside];
    const edges = [
      ...SPINE,
      edge("R-0001", "HAS_CRITERION", "AC-0002"),
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "WI-0001"),
      edge("WL-0001", "SUBMITS", "EV-0001"),
      edge("EV-0001", "CLAIMS", "AC-0002"),
    ];
    const board = boardOf(nodes, edges, settled(nodes, edges));
    const rows = board.fixSpec.filter((held) => held.reason === "off-target");
    assert.deepEqual(
      rows.map((held) => held.id),
      ["EV-0001", "WL-0001"],
    );
    assert.deepEqual(
      rows.map((held) => held.kind),
      ["grammar", "grammar"],
    );
    assert.deepEqual(
      rows.map((held) => held.detail),
      [
        "EV-0001 claims AC-0002, but the work log that submitted it, WL-0001, addresses WI-0001, which target AC-0001 — a work log's evidence claims only the criteria its work items target.",
        "WL-0001 addresses WI-0001, which target AC-0001, but submits EV-0001, which claims AC-0002 — a work log's evidence claims only the criteria its work items target.",
      ],
    );
    // A rule of the graph wrote these, so no person is named against them.
    assert.deepEqual(
      rows.map((held) => [held.by, held.at]),
      [
        [null, null],
        [null, null],
      ],
    );
  });

  test("lists a work item with two aims on Implement, naming both targets — two aims are no fault", () => {
    // Until 2026-08-23 this row was Fix Spec's, with a sentence about splitting
    // the work item. A work item now targets as many criteria as it closes, so
    // the second aim changes nothing about its standing: it is ready, and the
    // row names both criteria in the order their ids sort.
    const second = node("AcceptanceCriterion", "AC-0002");
    const nodes = [...SPINE_NODES, second];
    const edges = [
      ...SPINE,
      edge("R-0001", "HAS_CRITERION", "AC-0002"),
      edge("WI-0001", "TARGETS", "AC-0002"),
    ];
    const board = boardOf(nodes, edges, settled(nodes, edges));
    assert.equal(
      board.fixSpec.some((held) => held.id === "WI-0001"),
      false,
    );
    const row = board.implement.find((held) => held.id === "WI-0001");
    assert.ok(row !== undefined);
    assert.deepEqual(
      row.targets.map((target) => target.id),
      ["AC-0001", "AC-0002"],
    );
  });

  test("names every referrer of a hole in one row", () => {
    const edges = [
      ...SPINE,
      edge("R-0001", "DEPENDS_ON", "R-0404"),
      edge("M-0001", "ASSUMES", "AS-0404"),
    ];
    const board = boardOf(SPINE_NODES, edges, settled(SPINE_NODES, edges));
    const row = board.fixSpec.find((held) => held.id === "R-0404");
    assert.ok(row !== undefined);
    assert.equal(
      row.detail,
      "R-0001 has a DEPENDS_ON relation to R-0404, and no file names R-0404. The relation is kept as written, so writing or restoring R-0404 attaches it again.",
    );
    assert.equal(row.reason, "missing");
    assert.equal(row.file, null);
  });

  test("says a file that would not read once, with its id and every sentence", () => {
    const refusal: RefusedFile = {
      file: "intent/Requirement/R-0003.md",
      type: "Requirement",
      id: "R-0003",
      problems: [
        "A spec file does not carry id — the filename is the id.",
        "A short_name is required.",
      ],
    };
    const board = boardOf(SPINE_NODES, SPINE, settled(), {
      refused: [refusal],
      // The loader copies a refused file's sentences here too; one row is owed.
      problems: refusal.problems.map((message) => ({
        file: refusal.file,
        message,
      })),
    });
    const rows = board.fixSpec.filter((held) => held.reason === "malformed");
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      key: "fix:R-0003",
      id: "R-0003",
      type: "Requirement",
      shortName: null,
      name: null,
      kind: "grammar",
      reason: "malformed",
      detail:
        "A spec file does not carry id — the filename is the id. A short_name is required.",
      file: "intent/Requirement/R-0003.md",
      by: null,
      at: null,
      updatedAt: null,
    });
  });

  test("gives a stray file a row with no id and no type", () => {
    const board = boardOf(SPINE_NODES, SPINE, settled(), {
      problems: [
        { file: "notes.md", message: "A spec folder holds no loose files." },
      ],
    });
    const row = board.fixSpec.find((held) => held.file === "notes.md");
    assert.ok(row !== undefined);
    assert.equal(row.id, null);
    assert.equal(row.type, null);
  });

  test("orders two stray files by the path each is named by", () => {
    // Neither row has an id, so the last tiebreak falls through to the file —
    // the only identity a file that would not read far enough has.
    const board = boardOf(SPINE_NODES, SPINE, settled(), {
      problems: [
        { file: "notes.md", message: "A spec folder holds no loose files." },
        {
          file: "drafts/aside.md",
          message: "A spec folder holds no loose files.",
        },
      ],
    });
    assert.deepEqual(
      board.fixSpec
        .filter((held) => held.reason === "malformed")
        .map((held) => [held.id, held.key]),
      [
        [null, "fix:drafts/aside.md"],
        [null, "fix:notes.md"],
      ],
    );
  });

  test("says which line to cut when two work items wait on each other", () => {
    const second = node("WorkItem", "WI-0002");
    const nodes = [...SPINE_NODES, second];
    const edges = [
      ...SPINE,
      edge("M-0001", "ALLOCATES", "WI-0002"),
      edge("WI-0001", "DEPENDS_ON", "WI-0002"),
      edge("WI-0002", "DEPENDS_ON", "WI-0001"),
    ];
    const board = boardOf(nodes, edges, settled(nodes, edges));
    const row = board.fixSpec.find((held) => held.id === "WI-0002");
    assert.ok(row !== undefined);
    assert.equal(row.kind, "grammar");
    assert.equal(row.reason, "cyclic");
    assert.equal(
      row.detail,
      "WI-0002 waits on WI-0001, which waits on WI-0002 — a work item cannot wait on itself through others, and no work item on this loop can ever be called ready. Remove one DEPENDS_ON line, or split the work item both halves need.",
    );
    // Both ends get a row: either DEPENDS_ON line closes the loop, and the
    // person is standing on whichever one they opened.
    assert.deepEqual(
      board.fixSpec.filter((held) => held.reason === "cyclic").map((held) => held.id),
      ["WI-0001", "WI-0002"],
    );
    assert.deepEqual(board.implement, []);
  });

  test("puts a person's refusal before the grammar's, and the holes after both", () => {
    const lone = node("Requirement", "R-0002");
    const second = node("WorkItem", "WI-0002");
    const edges = [
      ...SPINE,
      edge("R-0001", "DEPENDS_ON", "R-0404"),
      edge("M-0001", "ALLOCATES", "WI-0002"),
      edge("WI-0001", "DEPENDS_ON", "WI-0002"),
      edge("WI-0002", "DEPENDS_ON", "WI-0001"),
    ];
    const nodes = [...SPINE_NODES, lone, second];
    const ledgers = booksOf({
      approvals: nodes.map((held) => approve(held, edges)),
      rejections: [reject(requirement, edges)],
    });
    const board = boardOf(nodes, edges, ledgers);
    // The four seams the grammar found share one rank, so between them it is
    // the tiebreak that decides — here the ids, every row being of an age:
    // R-0002 sorts before WI-0001 and WI-0002.
    assert.deepEqual(
      board.fixSpec.map((row) => row.reason),
      ["rejected", "orphan", "cyclic", "cyclic", "missing"],
    );
  });

  test("names every row so a URL can point at it, and the two halves never collide", () => {
    // A work item can be red today and ready tomorrow, and both rows would be
    // `WI-0001` without the prefix.
    const nodes = [...SPINE_NODES, journal, workLog];
    const edges = [
      ...SPINE,
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "WI-0001"),
    ];
    const board = boardOf(nodes, edges, settled(nodes, edges));
    assert.deepEqual(
      board.implement.map((row) => row.key),
      ["work-item:WI-0001"],
    );
    const keys = [
      ...board.fixSpec.map((row) => row.key),
      ...board.implement.map((row) => row.key),
    ];
    assert.equal(new Set(keys).size, keys.length);
  });

  test("stores nothing, and the same graph gives the same board twice", () => {
    const ledgers = settled();
    assert.deepEqual(
      boardOf(SPINE_NODES, SPINE, ledgers),
      boardOf(SPINE_NODES, SPINE, ledgers),
    );
  });
});

describe("work logged before its turn", () => {
  test("puts the log on Fix Spec, naming the work item whose turn has not come", () => {
    const second = node("WorkItem", "WI-0002");
    const nodes = [...SPINE_NODES, second, journal, workLog];
    const edges = [
      ...SPINE,
      edge("M-0001", "ALLOCATES", "WI-0002"),
      edge("WI-0002", "DEPENDS_ON", "WI-0001"),
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "WI-0002"),
    ];
    const board = boardOf(nodes, edges, settled(nodes, edges));
    const row = board.fixSpec.find((held) => held.id === "WL-0001");
    assert.ok(row !== undefined);
    assert.deepEqual(row, {
      key: "fix:WL-0001",
      id: "WL-0001",
      type: "WorkLog",
      shortName: "WL-0001",
      name: "WorkLog WL-0001",
      kind: "grammar",
      reason: "premature",
      detail:
        "WL-0001 addresses WI-0002, and WI-0002 is blocked — work is logged only under a work item whose turn has come: its chain read and agreed, and everything it waits on finished.",
      file: null,
      by: null,
      at: null,
      updatedAt: 1,
    });
    // WI-0002 waits on WI-0001, which nobody has closed, so only the one work
    // item whose turn HAS come is on the other half.
    assert.deepEqual(
      board.implement.map((held) => held.id),
      ["WI-0001"],
    );
  });

  test("says nothing about a log that addresses no work item at all", () => {
    // Foundation work under a journal: the log is held by the journal that
    // logs it, addresses nothing, and breaks no rule by it.
    const nodes = [...SPINE_NODES, journal, workLog];
    const edges = [...SPINE, edge("J-0001", "LOGS", "WL-0001")];
    const ledgers = settled(nodes, edges);
    assert.equal(colorsOf(nodes, edges, ledgers)("WL-0001"), "green");
    assert.equal(
      boardOf(nodes, edges, ledgers).fixSpec.some(
        (held) => held.id === "WL-0001",
      ),
      false,
    );
  });

  test("leaves a log addressing an id no file names to the missing rule", () => {
    // The hole is one row, said once, and the log itself is not accused of
    // starting early on a work item nobody can show the state of.
    const nodes = [...SPINE_NODES, journal, workLog];
    const edges = [
      ...SPINE,
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "WI-0404"),
    ];
    const board = boardOf(nodes, edges, settled(nodes, edges));
    assert.deepEqual(
      board.fixSpec.filter((held) => held.reason === "missing").map((held) => held.id),
      ["WI-0404"],
    );
    assert.equal(
      board.fixSpec.some((held) => held.id === "WL-0001"),
      false,
    );
  });
});

describe("the board and the queue", () => {
  test("a work item waiting on a person is in the queue and off the board", () => {
    // The queue asks whether the work shown is enough; the board, which offers
    // work to start, must not offer this one again while that is being asked —
    // a second turn would build the same thing twice. Its word is `in_review`.
    const nodes = [...SPINE_NODES, journal, workLog, report];
    const edges = [
      ...SPINE,
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "WI-0001"),
      edge("WL-0001", "SUBMITS", "CR-0001"),
      edge("CR-0001", "CLAIMS", "WI-0001"),
    ];
    const ledgers = settled(nodes, edges);
    const graph = graphOf(nodes, edges);
    assert.deepEqual(
      reviewBundles(graph, ledgers).bundles.map((bundle) => bundle.id),
      ["completion:WI-0001"],
    );
    assert.deepEqual(workBoardOf(graph, ledgers).implement, []);
    assert.equal(
      reviewGraph(graph, ledgers).statuses.find((row) => row.id === "WI-0001")
        ?.workItemState,
      "in_review",
    );
  });
});
