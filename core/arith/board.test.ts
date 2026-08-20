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
import { taskBoardOf, type TaskBoard } from "./board.js";
import { colorContextOf, type Ledgers, type PayloadHash } from "./color.js";
import { reviewBundles } from "./bundles.js";
import { reviewGraph } from "./review.js";
import {
  chainGreen,
  depthOf,
  isCompleted,
  prerequisitesMet,
  taskStateOf,
  upwardChainOf,
  type ColorAt,
} from "./task-state.js";

/**
 * The Task Board, over graphs built by hand and the identity hash.
 *
 * THE TWO HALVES ARE TESTED AS THE TWO QUESTIONS THEY ARE. Fix Spec is about
 * what a person is told and in what order — the rationale WHOLE, one row per
 * broken file, one row per hole. Implement is about a gate: which tasks pass
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
 * ONE SPINE, GREEN FROM THE GOAL DOWN, with a task at the bottom. Every test
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
const module = node("ModuleDesign", "MD-0001");
const task = node("ImplementationTask", "IT-0001");
const other = node("ImplementationTask", "IT-0002");
const iface = node("Interface", "IF-0001");
const schema = node("DataSchema", "DS-0001");
const assumption = node("Assumption", "AS-0001");
const term = node("Term", "T-0001");
const journal = node("Journal", "J-0001");
const workLog = node("WorkLog", "WL-0001");
/** The task's claimant since #24— : a report, submitted by the log, claiming one task. */
const report = node("TaskCompletionReport", "TCR-0001");

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
  task,
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
  edge("SR-0001", "IS_REALIZED_BY", "MD-0001"),
  edge("MD-0001", "ALLOCATES", "IT-0001"),
  edge("IT-0001", "TARGETS", "AC-0001"),
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
): TaskBoard {
  return taskBoardOf(graphOf(nodes, edges, extra), ledgers);
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

describe("the chain a task hangs from", () => {
  test("runs up the spine and includes the task itself", () => {
    const context = colorContextOf(graphOf(SPINE_NODES, SPINE), settled());
    // Byte order, so `A-0001` precedes `AC-0001`: `-` is 0x2D and `C` is 0x43.
    assert.deepEqual(upwardChainOf(task, context), [
      "A-0001",
      "AC-0001",
      "C-0001",
      "G-0000",
      "G-0001",
      "IT-0001",
      "MD-0001",
      "R-0001",
      "SC-0001",
      "SR-0001",
      "UC-0001",
    ]);
  });

  test("leaves out everything hanging beside it", () => {
    // The local gate, stated as membership: an interface, a schema, a
    // satellite, a term, a work log and the module's OTHER task are all one
    // relation away and none of them is above this task.
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
      edge("MD-0001", "EXPOSES", "IF-0001"),
      edge("IF-0001", "CARRIES", "DS-0001"),
      edge("MD-0001", "ASSUMES", "AS-0001"),
      edge("R-0001", "MENTIONS", "T-0001"),
      edge("MD-0001", "ALLOCATES", "IT-0002"),
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "IT-0001"),
    ];
    const chain = upwardChainOf(task, colorContextOf(graphOf(nodes, edges), settled()));
    for (const absent of [
      "IF-0001",
      "DS-0001",
      "AS-0001",
      "T-0001",
      "J-0001",
      "WL-0001",
      "IT-0002",
    ]) {
      assert.equal(chain.includes(absent), false, absent);
    }
  });

  test("reaches a goal's parents and not its children", () => {
    // REFINES is written parent → child, so the parent is the SOURCE of the
    // incoming edge. A sub-goal in another branch is not above this task, and a
    // yellow one there must not hide it.
    const sub = node("Goal", "G-0009");
    const nodes = [...SPINE_NODES, sub];
    const edges = [...SPINE, edge("G-0001", "REFINES", "G-0009")];
    const context = colorContextOf(graphOf(nodes, edges), settled());
    const chain = upwardChainOf(task, context);
    assert.equal(chain.includes("G-0000"), true);
    assert.equal(chain.includes("G-0009"), false);

    const ledgers = settled(SPINE_NODES, edges);
    assert.equal(chainGreen(task, context, colorsOf(nodes, edges, ledgers)), true);
  });

  test("terminates on a REFINES cycle", () => {
    const edges = [...SPINE, edge("G-0001", "REFINES", "G-0000")];
    const context = colorContextOf(graphOf(SPINE_NODES, edges), settled());
    const chain = upwardChainOf(task, context);
    assert.equal(chain.filter((id) => id === "G-0000").length, 1);
    assert.equal(chain.filter((id) => id === "G-0001").length, 1);
  });

  test("takes every parent when a criterion hangs off two carriers", () => {
    // A DAG, not a tree: the criterion this task targets is also a scenario's,
    // so both spines are above the task and either one can hide it.
    const second = node("Scenario", "SC-0002");
    const nodes = [...SPINE_NODES, second];
    const edges = [...SPINE, edge("SC-0002", "HAS_CRITERION", "AC-0001")];
    const context = colorContextOf(graphOf(nodes, edges), settled());
    assert.equal(upwardChainOf(task, context).includes("SC-0002"), true);
  });

  test("counts a dangling far end and does not walk through it", () => {
    // Two reasons the chain is not green here, and the assertion means both:
    // AC-0404 is a hole, and a second TARGETS line is the aim rule's own red.
    const edges = [...SPINE, edge("IT-0001", "TARGETS", "AC-0404")];
    const context = colorContextOf(graphOf(SPINE_NODES, edges), settled());
    const chain = upwardChainOf(task, context);
    assert.equal(chain.includes("AC-0404"), true);
    assert.equal(
      chainGreen(task, context, colorsOf(SPINE_NODES, edges, settled(SPINE_NODES, edges))),
      false,
    );
  });
});

describe("whether a task can be picked up", () => {
  test("is ready when the chain is green and nothing is owed", () => {
    const ledgers = settled();
    const context = colorContextOf(graphOf(SPINE_NODES, SPINE), ledgers);
    assert.equal(
      taskStateOf(task, context, colorsOf(SPINE_NODES, SPINE, ledgers)),
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
        taskStateOf(task, context, colorsOf(SPINE_NODES, SPINE, ledgers)),
        "blocked",
        held.id,
      );
    }
  });

  test("is blocked while a prerequisite is unfinished, and ready once it closes", () => {
    const nodes = [...SPINE_NODES, other, journal, workLog, report];
    const edges = [
      ...SPINE,
      edge("MD-0001", "ALLOCATES", "IT-0002"),
      edge("IT-0001", "DEPENDS_ON", "IT-0002"),
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "IT-0002"),
      edge("WL-0001", "SUBMITS", "TCR-0001"),
      edge("TCR-0001", "CLAIMS", "IT-0002"),
    ];
    const green = settled(nodes, edges);
    const waiting = colorContextOf(graphOf(nodes, edges), green);
    assert.equal(
      taskStateOf(task, waiting, colorsOf(nodes, edges, green)),
      "blocked",
    );

    const closed = booksOf({
      approvals: nodes.map((held) => approve(held, edges)),
      acceptances: [accept(other, [report], edges)],
    });
    const context = colorContextOf(graphOf(nodes, edges), closed);
    assert.equal(isCompleted(other, context), true);
    assert.equal(prerequisitesMet(task, context), true);
    assert.equal(
      taskStateOf(task, context, colorsOf(nodes, edges, closed)),
      "ready",
    );
  });

  test("is blocked by a prerequisite no file answers to", () => {
    const edges = [...SPINE, edge("IT-0001", "DEPENDS_ON", "IT-0404")];
    const ledgers = settled(SPINE_NODES, edges);
    const context = colorContextOf(graphOf(SPINE_NODES, edges), ledgers);
    assert.equal(prerequisitesMet(task, context), false);
    assert.equal(
      taskStateOf(task, context, colorsOf(SPINE_NODES, edges, ledgers)),
      "blocked",
    );
  });

  test("is done once a person closes it on the report that verified it", () => {
    const nodes = [...SPINE_NODES, journal, workLog, report];
    const edges = [
      ...SPINE,
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "IT-0001"),
      edge("WL-0001", "SUBMITS", "TCR-0001"),
      edge("TCR-0001", "CLAIMS", "IT-0001"),
    ];
    const ledgers = booksOf({
      approvals: nodes.map((held) => approve(held, edges)),
      acceptances: [accept(task, [report], edges)],
    });
    const context = colorContextOf(graphOf(nodes, edges), ledgers);
    assert.equal(
      taskStateOf(task, context, colorsOf(nodes, edges, ledgers)),
      "done",
    );
  });

  test("comes back to ready when the closing is withdrawn as a leaving-open", () => {
    const nodes = [...SPINE_NODES, journal, workLog, report];
    const edges = [
      ...SPINE,
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "IT-0001"),
      edge("WL-0001", "SUBMITS", "TCR-0001"),
      edge("TCR-0001", "CLAIMS", "IT-0001"),
    ];
    const ledgers = booksOf({
      approvals: nodes.map((held) => approve(held, edges)),
      rejections: [leaveOpen(task, [workLog], edges)],
    });
    const context = colorContextOf(graphOf(nodes, edges), ledgers);
    assert.equal(
      taskStateOf(task, context, colorsOf(nodes, edges, ledgers)),
      "ready",
    );
  });

  test("does not hide a task because an unrelated chain is unread", () => {
    // THE LOCAL GATE. A second spine, entirely yellow, and the first task is
    // still ready — the two are neighbours on a board and nothing else.
    const strangers = [
      node("Goal", "G-0100"),
      node("Actor", "A-0100"),
      node("UseCase", "UC-0100"),
      node("Scenario", "SC-0100"),
      node("SystemResponsibility", "SR-0100"),
      node("ModuleDesign", "MD-0100"),
      node("ImplementationTask", "IT-0100"),
    ];
    const edges = [
      ...SPINE,
      edge("G-0100", "PURSUED_BY", "A-0100"),
      edge("A-0100", "PERFORMS", "UC-0100"),
      edge("UC-0100", "DETAILS", "SC-0100"),
      edge("SC-0100", "DERIVES_RESPONSIBILITY", "SR-0100"),
      edge("SR-0100", "IS_REALIZED_BY", "MD-0100"),
      edge("MD-0100", "ALLOCATES", "IT-0100"),
    ];
    const nodes = [...SPINE_NODES, ...strangers];
    const ledgers = settled(SPINE_NODES, edges);
    const board = boardOf(nodes, edges, ledgers);
    assert.deepEqual(
      board.implement.map((row) => row.id),
      ["IT-0001"],
    );
  });
});

describe("how deep a task sits", () => {
  const a = node("ImplementationTask", "IT-000A");
  const b = node("ImplementationTask", "IT-000B");
  const c = node("ImplementationTask", "IT-000C");

  test("counts the longest chain under it", () => {
    const edges = [
      edge("IT-000C", "DEPENDS_ON", "IT-000B"),
      edge("IT-000B", "DEPENDS_ON", "IT-000A"),
    ];
    const context = colorContextOf(graphOf([a, b, c], edges), booksOf({}));
    assert.equal(depthOf("IT-000A", context), 0);
    assert.equal(depthOf("IT-000B", context), 1);
    assert.equal(depthOf("IT-000C", context), 2);
  });

  test("takes the deeper side of a diamond", () => {
    const d = node("ImplementationTask", "IT-000D");
    const edges = [
      edge("IT-000D", "DEPENDS_ON", "IT-000C"),
      edge("IT-000D", "DEPENDS_ON", "IT-000A"),
      edge("IT-000C", "DEPENDS_ON", "IT-000B"),
      edge("IT-000B", "DEPENDS_ON", "IT-000A"),
    ];
    const context = colorContextOf(graphOf([a, b, c, d], edges), booksOf({}));
    assert.equal(depthOf("IT-000D", context), 3);
  });

  test("counts a hole as nothing, and a cycle terminates on the path it came by", () => {
    const holed = colorContextOf(
      graphOf([a], [edge("IT-000A", "DEPENDS_ON", "IT-0404")]),
      booksOf({}),
    );
    assert.equal(depthOf("IT-000A", holed), 0);

    const looped = colorContextOf(
      graphOf(
        [a, b],
        [
          edge("IT-000A", "DEPENDS_ON", "IT-000B"),
          edge("IT-000B", "DEPENDS_ON", "IT-000A"),
        ],
      ),
      booksOf({}),
    );
    // Neither is deeper than the other and neither hangs: the walk drops an id
    // already on its own path, so the pair simply stops counting each other.
    assert.equal(depthOf("IT-000A", looped), 1);
    assert.equal(depthOf("IT-000B", looped), 1);
  });
});

describe("the Implement column", () => {
  const nodes = [...SPINE_NODES, journal, workLog];
  const edges = [
    ...SPINE,
    edge("J-0001", "LOGS", "WL-0001"),
    edge("WL-0001", "ADDRESSES", "IT-0001"),
  ];

  test("names what the task belongs to, aims at and already has work on", () => {
    const ledgers = settled(nodes, edges);
    const [row] = boardOf(nodes, edges, ledgers).implement;
    assert.ok(row !== undefined);
    assert.equal(row.id, "IT-0001");
    assert.deepEqual(
      row.modules.map((ref) => ref.id),
      ["MD-0001"],
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

  test("carries a task that targets no criterion at all", () => {
    // Foundation work: nothing to close, and still work somebody can start.
    const foundation = node("ImplementationTask", "IT-0003");
    const board = boardOf(
      [...SPINE_NODES, foundation],
      [...SPINE, edge("MD-0001", "ALLOCATES", "IT-0003")],
      settled(
        [...SPINE_NODES, foundation],
        [...SPINE, edge("MD-0001", "ALLOCATES", "IT-0003")],
      ),
    );
    const row = board.implement.find((held) => held.id === "IT-0003");
    assert.ok(row !== undefined);
    assert.deepEqual(row.targets, []);
    assert.deepEqual(row.requirements, []);
  });

  test("is exactly the tasks the review calls ready", () => {
    // THE CROSS-CHECK THE BADGE OWES THE BOARD. One predicate, two readers, and
    // this is what makes them the same answer rather than two that agree today.
    const ledgers = settled(nodes, edges);
    const graph = graphOf(nodes, edges);
    const ready = reviewGraph(graph, ledgers)
      .statuses.filter((row) => row.taskState === "ready")
      .map((row) => row.id);
    assert.deepEqual(
      taskBoardOf(graph, ledgers).implement.map((row) => row.id),
      ready,
    );
    // And every task wears exactly one of the three words.
    const words = reviewGraph(graph, ledgers)
      .statuses.filter((row) => row.id.startsWith("IT-"))
      .map((row) => row.taskState);
    assert.deepEqual(words, ["ready"]);
  });

  test("orders by depth, then by age, then by id", () => {
    const first = node("ImplementationTask", "IT-0010", { updatedAt: 5 });
    const second = node("ImplementationTask", "IT-0011", { updatedAt: 3 });
    const later = node("ImplementationTask", "IT-0012", { updatedAt: 1 });
    const all = [...SPINE_NODES, first, second, later];
    const wired = [
      ...SPINE,
      edge("MD-0001", "ALLOCATES", "IT-0010"),
      edge("MD-0001", "ALLOCATES", "IT-0011"),
      edge("MD-0001", "ALLOCATES", "IT-0012"),
      edge("IT-0012", "DEPENDS_ON", "IT-0011"),
    ];
    const board = boardOf(all, wired, settled(all, wired));
    // IT-0012 waits on IT-0011, which is not closed — so it is not here at all,
    // and the two that are sort by age.
    assert.deepEqual(
      board.implement.map((row) => row.id),
      ["IT-0001", "IT-0011", "IT-0010"],
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

  test("says what a task with two aims has to do about it", () => {
    const second = node("AcceptanceCriterion", "AC-0002");
    const nodes = [...SPINE_NODES, second];
    const edges = [
      ...SPINE,
      edge("R-0001", "HAS_CRITERION", "AC-0002"),
      edge("IT-0001", "TARGETS", "AC-0002"),
    ];
    const board = boardOf(nodes, edges, settled(nodes, edges));
    const row = board.fixSpec.find((held) => held.id === "IT-0001");
    assert.ok(row !== undefined);
    assert.equal(row.kind, "grammar");
    assert.equal(row.reason, "off-target");
    assert.equal(
      row.detail,
      "IT-0001 targets AC-0001 and AC-0002 — a task aims at one criterion at most, because a task with two aims closes neither on its own. Split the task, or remove the TARGETS line this work is not for.",
    );
    // And it is off the Implement half while it is on this one: a task the
    // board cannot say is aimed at anything is not a task to hand anybody.
    assert.equal(
      board.implement.some((held) => held.id === "IT-0001"),
      false,
    );
  });

  test("names every referrer of a hole in one row", () => {
    const edges = [
      ...SPINE,
      edge("R-0001", "DEPENDS_ON", "R-0404"),
      edge("MD-0001", "ASSUMES", "AS-0404"),
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

  test("says which line to cut when two tasks wait on each other", () => {
    const second = node("ImplementationTask", "IT-0002");
    const nodes = [...SPINE_NODES, second];
    const edges = [
      ...SPINE,
      edge("MD-0001", "ALLOCATES", "IT-0002"),
      edge("IT-0001", "DEPENDS_ON", "IT-0002"),
      edge("IT-0002", "DEPENDS_ON", "IT-0001"),
    ];
    const board = boardOf(nodes, edges, settled(nodes, edges));
    const row = board.fixSpec.find((held) => held.id === "IT-0002");
    assert.ok(row !== undefined);
    assert.equal(row.kind, "grammar");
    assert.equal(row.reason, "cyclic");
    assert.equal(
      row.detail,
      "IT-0002 waits on IT-0001, which waits on IT-0002 — a task cannot wait on itself through others, and no task on this loop can ever be called ready. Remove one DEPENDS_ON line, or split the task both halves need.",
    );
    // Both ends get a row: either DEPENDS_ON line closes the loop, and the
    // person is standing on whichever one they opened.
    assert.deepEqual(
      board.fixSpec.filter((held) => held.reason === "cyclic").map((held) => held.id),
      ["IT-0001", "IT-0002"],
    );
    assert.deepEqual(board.implement, []);
  });

  test("puts a person's refusal before the grammar's, and the holes after both", () => {
    const lone = node("Requirement", "R-0002");
    const second = node("ImplementationTask", "IT-0002");
    const edges = [
      ...SPINE,
      edge("R-0001", "DEPENDS_ON", "R-0404"),
      edge("MD-0001", "ALLOCATES", "IT-0002"),
      edge("IT-0001", "DEPENDS_ON", "IT-0002"),
      edge("IT-0002", "DEPENDS_ON", "IT-0001"),
    ];
    const nodes = [...SPINE_NODES, lone, second];
    const ledgers = booksOf({
      approvals: nodes.map((held) => approve(held, edges)),
      rejections: [reject(requirement, edges)],
    });
    const board = boardOf(nodes, edges, ledgers);
    // The four seams the grammar found share one rank, so between them it is
    // the tiebreak that decides — here the ids, every row being of an age.
    assert.deepEqual(
      board.fixSpec.map((row) => row.reason),
      ["rejected", "cyclic", "cyclic", "orphan", "missing"],
    );
  });

  test("names every row so a URL can point at it, and the two halves never collide", () => {
    // A task can be red today and ready tomorrow, and both rows would be
    // `IT-0001` without the prefix.
    const nodes = [...SPINE_NODES, journal, workLog];
    const edges = [
      ...SPINE,
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "IT-0001"),
    ];
    const board = boardOf(nodes, edges, settled(nodes, edges));
    assert.deepEqual(
      board.implement.map((row) => row.key),
      ["task:IT-0001"],
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

describe("the board and the queue", () => {
  test("a task waiting on a person is on the board and in the queue at once", () => {
    // The two surfaces answer two questions: the queue asks whether the work
    // shown is enough, the board says the task is not closed yet. Until a
    // person says one of the two words, both are true.
    const nodes = [...SPINE_NODES, journal, workLog, report];
    const edges = [
      ...SPINE,
      edge("J-0001", "LOGS", "WL-0001"),
      edge("WL-0001", "ADDRESSES", "IT-0001"),
      edge("WL-0001", "SUBMITS", "TCR-0001"),
      edge("TCR-0001", "CLAIMS", "IT-0001"),
    ];
    const ledgers = settled(nodes, edges);
    const graph = graphOf(nodes, edges);
    assert.deepEqual(
      reviewBundles(graph, ledgers).bundles.map((bundle) => bundle.id),
      ["completion:IT-0001"],
    );
    assert.deepEqual(
      taskBoardOf(graph, ledgers).implement.map((row) => row.id),
      ["IT-0001"],
    );
  });
});
