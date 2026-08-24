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
import type { SpecGraph } from "../store/file-store.js";
import { reviewBundles } from "./bundles.js";
import { colorContextOf, type Ledgers, type PayloadHash } from "./color.js";
import { reviewGraph } from "./review.js";
import { criteriaOf, satisfactionOf } from "./satisfaction.js";
import { vitalsOf, type HealthRuleId, type Vitals } from "./vitals.js";

/**
 * The Vitals, over graphs built by hand and the identity hash.
 *
 * THREE THINGS ARE HELD TO. The roll-up says sat, unsat or nothing, and says it
 * once — the badge's word and the ratio's count are read off one field. The
 * denominators follow the specification's two rules — unspecified carriers out
 * of the ratio and said beside it, every work item in. And the seven rows are
 * always seven, read from the graph's lines alone: two graphs that differ only
 * in their bodies have the same vitals.
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
 * ONE SPINE, GREEN FROM THE GOAL DOWN — the board's fixture, which is already
 * the coverage chain with a plan tail: a parent goal refining a goal, pursued
 * by an actor, performing a use case, detailed by a scenario, deriving a
 * responsibility, requiring a requirement that carries one criterion, realized
 * by a module that allocates one work item aiming at that criterion. Every
 * test below starts from this and changes exactly one thing.
 */
const parentGoal = node("Goal", "G-0000");
const goal = node("Goal", "G-0001");
const actor = node("Actor", "A-0001");
const useCase = node("UseCase", "UC-0001");
const scenario = node("Scenario", "SC-0001");
const responsibility = node("SystemResponsibility", "SR-0001");
const requirement = node("Requirement", "R-0001");
const criterion = node("AcceptanceCriterion", "AC-0001");
const constraint = node("Constraint", "C-0001");
const module = node("Module", "M-0001");
const workItem = node("WorkItem", "WI-0001");
const journal = node("Journal", "J-0001");
const workLog = node("WorkLog", "WL-0001");
const evidence = node("Evidence", "EV-0001");
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

/** The work under the spine: a journal logging a log that addresses the work item and submits one evidence and one report. */
const WORK_NODES = [journal, workLog, evidence, report];
const WORK: SpecEdge[] = [
  edge("J-0001", "LOGS", "WL-0001"),
  edge("WL-0001", "ADDRESSES", "WI-0001"),
  edge("WL-0001", "SUBMITS", "EV-0001"),
  edge("WL-0001", "SUBMITS", "CR-0001"),
  edge("EV-0001", "CLAIMS", "AC-0001"),
  edge("CR-0001", "CLAIMS", "WI-0001"),
];

function settled(
  nodes: readonly SpecNode[] = SPINE_NODES,
  edges: readonly SpecEdge[] = SPINE,
): [string, ApprovalRecord][] {
  return nodes.map((held) => approve(held, edges));
}

function vitalsFor(
  nodes: readonly SpecNode[],
  edges: readonly SpecEdge[],
  ledgers: Ledgers,
  extra: Partial<SpecGraph> = {},
): Vitals {
  return vitalsOf(graphOf(nodes, edges, extra), ledgers);
}

function ruleOf(vitals: Vitals, id: HealthRuleId) {
  const rule = vitals.health.find((held) => held.id === id);
  assert.ok(rule, `rule ${id} is always a row`);
  return rule;
}

function ids(refs: readonly { id: string }[]): string[] {
  return refs.map((ref) => ref.id);
}

describe("the roll-up on a carrier", () => {
  test("sat when every criterion it demands is closed", () => {
    const nodes = [...SPINE_NODES, ...WORK_NODES];
    const edges = [...SPINE, ...WORK];
    const ledgers = booksOf({
      approvals: settled(nodes, edges),
      acceptances: [accept(criterion, [evidence], edges)],
    });
    const review = reviewGraph(graphOf(nodes, edges), ledgers);
    assert.equal(
      review.statuses.find((held) => held.id === "R-0001")?.satisfaction,
      "sat",
    );
    const vitals = vitalsFor(nodes, edges, ledgers);
    assert.deepEqual(
      { ...vitals.progress.requirements, unsat: ids(vitals.progress.requirements.unsat) },
      {
        kind: "requirement-satisfaction",
        type: "Requirement",
        numerator: 1,
        denominator: 1,
        unspecified: 0,
        unsat: [],
      },
    );
  });

  test("unsat when one criterion it demands is open, and the row names it", () => {
    const ledgers = booksOf({ approvals: settled() });
    const review = reviewGraph(graphOf(SPINE_NODES, SPINE), ledgers);
    assert.equal(
      review.statuses.find((held) => held.id === "R-0001")?.satisfaction,
      "unsat",
    );
    const vitals = vitalsFor(SPINE_NODES, SPINE, ledgers);
    assert.equal(vitals.progress.requirements.numerator, 0);
    assert.equal(vitals.progress.requirements.denominator, 1);
    assert.deepEqual(vitals.progress.requirements.unsat, [
      {
        id: "R-0001",
        shortName: "R-0001",
        name: "Requirement R-0001",
        criteria: 1,
        openCriteria: 1,
      },
    ]);
  });

  test("no word for a carrier that demands nothing, and it is counted unspecified", () => {
    const bare = node("Requirement", "R-0002");
    const nodes = [...SPINE_NODES, bare];
    const edges = [...SPINE, edge("SR-0001", "REQUIRES", "R-0002")];
    const ledgers = booksOf({ approvals: settled(nodes, edges) });
    const review = reviewGraph(graphOf(nodes, edges), ledgers);
    assert.equal(
      review.statuses.find((held) => held.id === "R-0002")?.satisfaction,
      null,
    );
    const vitals = vitalsFor(nodes, edges, ledgers);
    assert.equal(vitals.progress.requirements.denominator, 1);
    assert.equal(vitals.progress.requirements.unspecified, 1);
    assert.deepEqual(ids(vitals.progress.requirements.unsat), ["R-0001"]);
  });

  test("null for every type that is no carrier", () => {
    const ledgers = booksOf({ approvals: settled() });
    const review = reviewGraph(graphOf(SPINE_NODES, SPINE), ledgers);
    for (const held of review.statuses) {
      if (held.id !== "R-0001") {
        assert.equal(held.satisfaction, null, held.id);
      }
    }
  });

  test("a scenario carrying a criterion is judged like a requirement", () => {
    const integration = node("AcceptanceCriterion", "AC-0002");
    const evidenceTwo = node("Evidence", "EV-0002");
    const nodes = [...SPINE_NODES, ...WORK_NODES, integration, evidenceTwo];
    const edges = [
      ...SPINE,
      ...WORK,
      edge("SC-0001", "HAS_CRITERION", "AC-0002"),
      edge("WI-0001", "TARGETS", "AC-0002"),
      edge("WL-0001", "SUBMITS", "EV-0002"),
      edge("EV-0002", "CLAIMS", "AC-0002"),
    ];
    const ledgers = booksOf({
      approvals: settled(nodes, edges),
      acceptances: [accept(integration, [evidenceTwo], edges)],
    });
    const vitals = vitalsFor(nodes, edges, ledgers);
    assert.equal(vitals.progress.scenarios.numerator, 1);
    assert.equal(vitals.progress.scenarios.denominator, 1);
    assert.equal(vitals.progress.scenarios.unspecified, 0);
    // The requirement's criterion is still open, so that row stays 0 of 1.
    assert.equal(vitals.progress.requirements.numerator, 0);
  });

  test("one criterion under two carriers rolls into both and is counted once", () => {
    const nodes = [...SPINE_NODES, ...WORK_NODES];
    const edges = [...SPINE, ...WORK, edge("SC-0001", "HAS_CRITERION", "AC-0001")];
    const ledgers = booksOf({
      approvals: settled(nodes, edges),
      acceptances: [accept(criterion, [evidence], edges)],
    });
    const vitals = vitalsFor(nodes, edges, ledgers);
    assert.equal(vitals.progress.requirements.numerator, 1);
    assert.equal(vitals.progress.scenarios.numerator, 1);
    assert.deepEqual(
      [vitals.progress.criteria.numerator, vitals.progress.criteria.denominator],
      [1, 1],
    );
  });

  test("a criterion no file answers to makes the carrier unsat, not unspecified", () => {
    const nodes = [...SPINE_NODES, ...WORK_NODES];
    const edges = [...SPINE, ...WORK, edge("R-0001", "HAS_CRITERION", "AC-9999")];
    const ledgers = booksOf({
      approvals: settled(nodes, edges),
      acceptances: [accept(criterion, [evidence], edges)],
    });
    const vitals = vitalsFor(nodes, edges, ledgers);
    assert.equal(vitals.progress.requirements.unspecified, 0);
    assert.deepEqual(vitals.progress.requirements.unsat, [
      {
        id: "R-0001",
        shortName: "R-0001",
        name: "Requirement R-0001",
        criteria: 2,
        openCriteria: 1,
      },
    ]);
    // The hole is the Fix Spec board's row; rule 1 does not say it again.
    assert.deepEqual(ruleOf(vitals, "requirement-without-criterion").nodes, []);
  });

  test("a closed criterion a person later refused the wording of still closes", () => {
    const nodes = [...SPINE_NODES, ...WORK_NODES];
    const edges = [...SPINE, ...WORK];
    const ledgers = booksOf({
      approvals: settled(nodes, edges),
      acceptances: [accept(criterion, [evidence], edges)],
      rejections: [reject(criterion, edges)],
    });
    const review = reviewGraph(graphOf(nodes, edges), ledgers);
    const ac = review.statuses.find((held) => held.id === "AC-0001");
    assert.equal(ac?.color, "red");
    assert.equal(ac?.closure, "closed");
    assert.equal(
      review.statuses.find((held) => held.id === "R-0001")?.satisfaction,
      "sat",
    );
  });

  test("the predicate alone: demanded ids in order, and a wrapped closure answers it", () => {
    const context = colorContextOf(
      graphOf(SPINE_NODES, [...SPINE, edge("R-0001", "HAS_CRITERION", "AC-0000")]),
      booksOf({}),
    );
    assert.deepEqual(criteriaOf(requirement, context), ["AC-0000", "AC-0001"]);
    assert.equal(
      satisfactionOf(requirement, context, () => "closed"),
      "sat",
    );
    assert.equal(
      satisfactionOf(requirement, context, (id) => (id === "AC-0001" ? "closed" : null)),
      "unsat",
    );
    assert.equal(satisfactionOf(scenario, context, () => "closed"), null);
    assert.equal(satisfactionOf(goal, context, () => "closed"), null);
  });
});

describe("the criteria row", () => {
  test("counts every living criterion, closed over all, whatever colour", () => {
    const second = node("AcceptanceCriterion", "AC-0002");
    const third = node("AcceptanceCriterion", "AC-0003");
    const nodes = [...SPINE_NODES, ...WORK_NODES, second, third];
    const edges = [
      ...SPINE,
      ...WORK,
      edge("R-0001", "HAS_CRITERION", "AC-0002"),
      edge("R-0001", "HAS_CRITERION", "AC-0003"),
    ];
    // The third criterion is never approved: yellow, and still in the count.
    const ledgers = booksOf({
      approvals: settled(
        nodes.filter((held) => held.id !== "AC-0003"),
        edges,
      ),
      acceptances: [accept(criterion, [evidence], edges)],
    });
    const vitals = vitalsFor(nodes, edges, ledgers);
    assert.equal(vitals.progress.criteria.numerator, 1);
    assert.equal(vitals.progress.criteria.denominator, 3);
    assert.deepEqual(ids(vitals.progress.criteria.open), ["AC-0002", "AC-0003"]);
  });

  test("a criterion nothing claims is open for want of evidence", () => {
    const vitals = vitalsFor(SPINE_NODES, SPINE, booksOf({ approvals: settled() }));
    assert.deepEqual(vitals.progress.criteria.open, [
      {
        id: "AC-0001",
        shortName: "AC-0001",
        name: "AcceptanceCriterion AC-0001",
        reason: "no-evidence",
        evidence: 0,
        bundleId: null,
        leftOpen: null,
      },
    ]);
  });

  test("a claimed criterion awaits review, and names its card when the queue holds one", () => {
    const nodes = [...SPINE_NODES, ...WORK_NODES];
    const edges = [...SPINE, ...WORK];
    const ledgers = booksOf({ approvals: settled(nodes, edges) });
    const vitals = vitalsFor(nodes, edges, ledgers);
    assert.deepEqual(vitals.progress.criteria.open, [
      {
        id: "AC-0001",
        shortName: "AC-0001",
        name: "AcceptanceCriterion AC-0001",
        reason: "awaiting-review",
        evidence: 1,
        bundleId: "closure:AC-0001",
        leftOpen: null,
      },
    ]);
    // The same spelling the queue cuts the card under.
    const queue = reviewBundles(graphOf(nodes, edges), ledgers);
    assert.ok(queue.bundles.some((bundle) => bundle.id === "closure:AC-0001"));
  });

  test("a claimed criterion whose evidence is unread awaits review with no card yet", () => {
    const nodes = [...SPINE_NODES, ...WORK_NODES];
    const edges = [...SPINE, ...WORK];
    const ledgers = booksOf({
      approvals: settled(
        nodes.filter((held) => held.id !== "EV-0001"),
        edges,
      ),
    });
    const vitals = vitalsFor(nodes, edges, ledgers);
    const [open] = vitals.progress.criteria.open;
    assert.equal(open?.reason, "awaiting-review");
    assert.equal(open?.evidence, 1);
    assert.equal(open?.bundleId, null);
  });

  test("a claimed criterion that is itself unread awaits review with no card yet", () => {
    const nodes = [...SPINE_NODES, ...WORK_NODES];
    const edges = [...SPINE, ...WORK];
    const ledgers = booksOf({
      approvals: settled(
        nodes.filter((held) => held.id !== "AC-0001"),
        edges,
      ),
    });
    const vitals = vitalsFor(nodes, edges, ledgers);
    const [open] = vitals.progress.criteria.open;
    assert.equal(open?.reason, "awaiting-review");
    assert.equal(open?.bundleId, null);
  });

  test("a criterion left open after it was closed is open by a person's word, said whole", () => {
    const nodes = [...SPINE_NODES, ...WORK_NODES];
    const edges = [...SPINE, ...WORK];
    const ledgers = booksOf({
      approvals: settled(nodes, edges),
      acceptances: [accept(criterion, [evidence], edges)],
      rejections: [leaveOpen(criterion, [evidence], edges)],
    });
    const vitals = vitalsFor(nodes, edges, ledgers);
    assert.deepEqual(vitals.progress.criteria.open, [
      {
        id: "AC-0001",
        shortName: "AC-0001",
        name: "AcceptanceCriterion AC-0001",
        reason: "left-open",
        evidence: 1,
        bundleId: null,
        leftOpen: { by: REFUSAL.by, at: REFUSAL.at, rationale: REFUSAL.rationale },
      },
    ]);
    assert.equal(vitals.progress.requirements.numerator, 0);
  });

  test("the three reasons are disjoint and cover every open criterion", () => {
    const second = node("AcceptanceCriterion", "AC-0002");
    const third = node("AcceptanceCriterion", "AC-0003");
    const evidenceTwo = node("Evidence", "EV-0002");
    const nodes = [...SPINE_NODES, ...WORK_NODES, second, third, evidenceTwo];
    const edges = [
      ...SPINE,
      ...WORK,
      edge("R-0001", "HAS_CRITERION", "AC-0002"),
      edge("R-0001", "HAS_CRITERION", "AC-0003"),
      edge("WI-0001", "TARGETS", "AC-0002"),
      edge("WL-0001", "SUBMITS", "EV-0002"),
      edge("EV-0002", "CLAIMS", "AC-0002"),
    ];
    const ledgers = booksOf({
      approvals: settled(nodes, edges),
      rejections: [leaveOpen(criterion, [evidence], edges)],
    });
    const vitals = vitalsFor(nodes, edges, ledgers);
    assert.deepEqual(
      vitals.progress.criteria.open.map((open) => [open.id, open.reason]),
      [
        ["AC-0001", "left-open"],
        ["AC-0002", "awaiting-review"],
        ["AC-0003", "no-evidence"],
      ],
    );
    assert.equal(
      vitals.progress.criteria.open.length,
      vitals.progress.criteria.denominator - vitals.progress.criteria.numerator,
    );
  });
});

describe("the work items row", () => {
  const other = node("WorkItem", "WI-0002");
  const third = node("WorkItem", "WI-0003");

  test("counts every work item, blocked ones included, and lists the rest with their words", () => {
    const nodes = [...SPINE_NODES, ...WORK_NODES, other, third];
    const edges = [
      ...SPINE,
      ...WORK,
      edge("M-0001", "ALLOCATES", "WI-0002"),
      edge("M-0001", "ALLOCATES", "WI-0003"),
      edge("WI-0002", "DEPENDS_ON", "WI-0003"),
    ];
    const ledgers = booksOf({
      approvals: settled(nodes, edges),
      acceptances: [accept(workItem, [report], edges)],
    });
    const vitals = vitalsFor(nodes, edges, ledgers);
    assert.equal(vitals.progress.workItems.numerator, 1);
    assert.equal(vitals.progress.workItems.denominator, 3);
    // The done one is absent; the rest are one flat list, id order, each with
    // the review's own word — WI-0002 waits on WI-0003, which is startable.
    assert.deepEqual(vitals.progress.workItems.open, [
      {
        id: "WI-0002",
        shortName: "WI-0002",
        name: "WorkItem WI-0002",
        workItemState: "blocked",
      },
      {
        id: "WI-0003",
        shortName: "WI-0003",
        name: "WorkItem WI-0003",
        workItemState: "ready",
      },
    ]);
  });

  test("a work item aiming at nothing counts, and can be done", () => {
    const reportTwo = node("CompletionReport", "CR-0002");
    const logTwo = node("WorkLog", "WL-0002");
    const nodes = [...SPINE_NODES, ...WORK_NODES, third, logTwo, reportTwo];
    const edges = [
      ...SPINE,
      ...WORK,
      edge("M-0001", "ALLOCATES", "WI-0003"),
      edge("J-0001", "LOGS", "WL-0002"),
      edge("WL-0002", "ADDRESSES", "WI-0003"),
      edge("WL-0002", "SUBMITS", "CR-0002"),
      edge("CR-0002", "CLAIMS", "WI-0003"),
    ];
    const ledgers = booksOf({
      approvals: settled(nodes, edges),
      acceptances: [accept(third, [reportTwo], edges)],
    });
    const vitals = vitalsFor(nodes, edges, ledgers);
    assert.equal(vitals.progress.workItems.numerator, 1);
    assert.equal(vitals.progress.workItems.denominator, 2);
  });

  test("done stays done when the module above it is red", () => {
    const nodes = [...SPINE_NODES, ...WORK_NODES];
    const edges = [...SPINE, ...WORK].filter(
      (line) => line.id !== formatEdgeId("SR-0001", "IS_REALIZED_BY", "M-0001"),
    );
    const ledgers = booksOf({
      approvals: settled(nodes, edges),
      acceptances: [accept(workItem, [report], edges)],
    });
    const review = reviewGraph(graphOf(nodes, edges), ledgers);
    assert.equal(review.statuses.find((held) => held.id === "M-0001")?.color, "red");
    const vitals = vitalsFor(nodes, edges, ledgers);
    assert.equal(vitals.progress.workItems.numerator, 1);
    assert.deepEqual(vitals.progress.workItems.open, []);
  });

  test("a work item waiting on another, or under an unread chain, is open with the word blocked", () => {
    const nodes = [...SPINE_NODES, other];
    const edges = [
      ...SPINE,
      edge("M-0001", "ALLOCATES", "WI-0002"),
      edge("WI-0002", "DEPENDS_ON", "WI-0001"),
      edge("WI-0002", "DEPENDS_ON", "WI-9999"),
    ];
    const vitals = vitalsFor(nodes, edges, booksOf({ approvals: settled(nodes, edges) }));
    assert.deepEqual(
      vitals.progress.workItems.open.map((held) => [held.id, held.workItemState]),
      [
        ["WI-0001", "ready"],
        ["WI-0002", "blocked"],
      ],
    );
    const unreadGoal = booksOf({
      approvals: settled(SPINE_NODES.filter((held) => held.id !== "G-0001")),
    });
    const byGoal = vitalsFor(SPINE_NODES, SPINE, unreadGoal);
    assert.deepEqual(
      byGoal.progress.workItems.open.map((held) => [held.id, held.workItemState]),
      [["WI-0001", "blocked"]],
    );
  });
});

describe("one field, read twice", () => {
  test("the ratios agree with the review's own words", () => {
    const other = node("WorkItem", "WI-0002");
    const bare = node("Requirement", "R-0002");
    const nodes = [...SPINE_NODES, ...WORK_NODES, other, bare];
    const edges = [
      ...SPINE,
      ...WORK,
      edge("M-0001", "ALLOCATES", "WI-0002"),
      edge("WI-0002", "DEPENDS_ON", "WI-0001"),
      edge("SR-0001", "REQUIRES", "R-0002"),
    ];
    const ledgers = booksOf({
      approvals: settled(nodes, edges),
      acceptances: [accept(criterion, [evidence], edges)],
    });
    const review = reviewGraph(graphOf(nodes, edges), ledgers);
    const vitals = vitalsFor(nodes, edges, ledgers);
    const count = (pick: (held: (typeof review.statuses)[number]) => boolean) =>
      review.statuses.filter(pick).length;
    assert.equal(vitals.progress.criteria.numerator, count((held) => held.closure === "closed"));
    assert.equal(vitals.progress.workItems.numerator, count((held) => held.workItemState === "done"));
    assert.equal(vitals.progress.requirements.numerator, count((held) => held.satisfaction === "sat"));
    assert.deepEqual(
      vitals.progress.workItems.open
        .filter((held) => held.workItemState === "blocked")
        .map((held) => held.id),
      review.statuses.filter((held) => held.workItemState === "blocked").map((held) => held.id),
    );
    assert.deepEqual(
      ids(ruleOf(vitals, "requirement-without-criterion").nodes),
      review.statuses
        .filter((held) => held.id.startsWith("R-") && held.satisfaction === null)
        .map((held) => held.id),
    );
  });
});

describe("spec health", () => {
  test("a requirement and a scenario demanding no criterion, whatever colour they wear", () => {
    const bare = node("Requirement", "R-0002");
    const nodes = [...SPINE_NODES, bare];
    const edges = [...SPINE, edge("SR-0001", "REQUIRES", "R-0002")];
    // R-0002 is never approved and SC-0001 is: both are listed all the same.
    const vitals = vitalsFor(nodes, edges, booksOf({ approvals: settled() }));
    assert.deepEqual(ids(ruleOf(vitals, "requirement-without-criterion").nodes), ["R-0002"]);
    assert.deepEqual(ids(ruleOf(vitals, "scenario-without-criterion").nodes), ["SC-0001"]);
    assert.equal(ruleOf(vitals, "requirement-without-criterion").examined, 2);
  });

  test("an actor performing no use case", () => {
    const idle = node("Actor", "A-0002");
    const nodes = [...SPINE_NODES, idle];
    const edges = [...SPINE, edge("G-0001", "PURSUED_BY", "A-0002")];
    const vitals = vitalsFor(nodes, edges, booksOf({ approvals: settled(nodes, edges) }));
    assert.deepEqual(ids(ruleOf(vitals, "actor-without-use-case").nodes), ["A-0002"]);
  });

  test("a use case detailed by no scenario", () => {
    const bare = node("UseCase", "UC-0002");
    const nodes = [...SPINE_NODES, bare];
    const edges = [...SPINE, edge("A-0001", "PERFORMS", "UC-0002")];
    const vitals = vitalsFor(nodes, edges, booksOf({ approvals: settled(nodes, edges) }));
    assert.deepEqual(ids(ruleOf(vitals, "use-case-without-scenario").nodes), ["UC-0002"]);
  });

  test("a goal reaches a responsibility along the chain, and through a refinement", () => {
    const idle = node("Actor", "A-0002");
    const viaIdle = node("Goal", "G-0002");
    const bare = node("Goal", "G-0003");
    const nodes = [...SPINE_NODES, idle, viaIdle, bare];
    const edges = [...SPINE, edge("G-0002", "PURSUED_BY", "A-0002")];
    const vitals = vitalsFor(nodes, edges, booksOf({ approvals: settled(nodes, edges) }));
    // G-0000 reaches through G-0001; G-0001 reaches directly; the other two do not.
    assert.deepEqual(ids(ruleOf(vitals, "goal-without-responsibility").nodes), ["G-0002", "G-0003"]);
    assert.equal(ruleOf(vitals, "goal-without-responsibility").examined, 4);
  });

  test("a hole in the chain leaves the goal above it unreached, and a refinement loop ends", () => {
    const holed = node("Goal", "G-0004");
    const loopA = node("Goal", "G-0005");
    const loopB = node("Goal", "G-0006");
    const nodes = [...SPINE_NODES, holed, loopA, loopB];
    const edges = [
      ...SPINE,
      edge("G-0004", "PURSUED_BY", "A-9999"),
      edge("G-0005", "REFINES", "G-0006"),
      edge("G-0006", "REFINES", "G-0005"),
    ];
    const vitals = vitalsFor(nodes, edges, booksOf({ approvals: settled(nodes, edges) }));
    assert.deepEqual(ids(ruleOf(vitals, "goal-without-responsibility").nodes), [
      "G-0004",
      "G-0005",
      "G-0006",
    ]);
  });

  test("a module allocating no work item", () => {
    const idle = node("Module", "M-0002");
    const nodes = [...SPINE_NODES, idle];
    const edges = [...SPINE, edge("SR-0001", "IS_REALIZED_BY", "M-0002")];
    const vitals = vitalsFor(nodes, edges, booksOf({ approvals: settled(nodes, edges) }));
    assert.deepEqual(ids(ruleOf(vitals, "module-without-work-item").nodes), ["M-0002"]);
  });

  test("a criterion no work item aims at — and an orphan work item's aim still counts", () => {
    const second = node("AcceptanceCriterion", "AC-0002");
    const nodes = [...SPINE_NODES, second];
    const edges = [...SPINE, edge("R-0001", "HAS_CRITERION", "AC-0002")].filter(
      (line) => line.id !== formatEdgeId("M-0001", "ALLOCATES", "WI-0001"),
    );
    const ledgers = booksOf({ approvals: settled(nodes, edges) });
    const review = reviewGraph(graphOf(nodes, edges), ledgers);
    assert.equal(review.statuses.find((held) => held.id === "WI-0001")?.reason, "orphan");
    const vitals = vitalsFor(nodes, edges, ledgers);
    assert.deepEqual(ids(ruleOf(vitals, "criterion-without-work-item").nodes), ["AC-0002"]);
  });

  test("every rule is always a row, the violated ones first and the rest in the table's order", () => {
    const clean = vitalsFor(
      SPINE_NODES,
      [...SPINE, edge("SC-0001", "HAS_CRITERION", "AC-0001")],
      booksOf({ approvals: settled() }),
    );
    assert.deepEqual(
      clean.health.map((rule) => [rule.ordinal, rule.nodes.length]),
      [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0]],
    );
    const idleActor = node("Actor", "A-0002");
    const idleModule = node("Module", "M-0002");
    const nodes = [...SPINE_NODES, idleActor, idleModule];
    const edges = [
      ...SPINE,
      edge("SC-0001", "HAS_CRITERION", "AC-0001"),
      edge("G-0001", "PURSUED_BY", "A-0002"),
      edge("SR-0001", "IS_REALIZED_BY", "M-0002"),
    ];
    const some = vitalsFor(nodes, edges, booksOf({ approvals: settled(nodes, edges) }));
    assert.deepEqual(
      some.health.map((rule) => rule.ordinal),
      [3, 6, 1, 2, 4, 5, 7],
    );
    assert.deepEqual(
      some.health.map((rule) => rule.id),
      [
        "actor-without-use-case",
        "module-without-work-item",
        "requirement-without-criterion",
        "scenario-without-criterion",
        "use-case-without-scenario",
        "goal-without-responsibility",
        "criterion-without-work-item",
      ],
    );
  });
});

describe("what the vitals are made of", () => {
  test("the body is opaque — two graphs that differ only in their bodies have the same vitals", () => {
    const ledgers = booksOf({ approvals: settled() });
    const plain = vitalsFor(SPINE_NODES, SPINE, ledgers);
    const reworded = vitalsOf(
      graphOf(
        SPINE_NODES.map((held) =>
          held.type === "Scenario"
            ? { ...held, body: "## Scenario Type\n\nMain\n" }
            : { ...held, body: `${held.body} And then some.` },
        ),
        SPINE,
      ),
      // The approvals name the original bodies, so every node is yellow now —
      // and the counts that depend on no colour do not move.
      ledgers,
    );
    assert.deepEqual(
      reworded.health.map((rule) => [rule.id, ids(rule.nodes)]),
      plain.health.map((rule) => [rule.id, ids(rule.nodes)]),
    );
    assert.deepEqual(reworded.progress.requirements, plain.progress.requirements);
    assert.deepEqual(reworded.progress.scenarios, plain.progress.scenarios);
    assert.deepEqual(
      [reworded.progress.criteria.numerator, reworded.progress.criteria.denominator],
      [plain.progress.criteria.numerator, plain.progress.criteria.denominator],
    );
  });

  test("an empty folder is empty, with every row at nought and every rule clean", () => {
    const vitals = vitalsOf(graphOf([], []), booksOf({}));
    assert.equal(vitals.empty, true);
    assert.deepEqual(
      [
        vitals.progress.scenarios,
        vitals.progress.requirements,
        vitals.progress.criteria,
        vitals.progress.workItems,
      ],
      [
        { kind: "scenario-satisfaction", type: "Scenario", numerator: 0, denominator: 0, unspecified: 0, unsat: [] },
        { kind: "requirement-satisfaction", type: "Requirement", numerator: 0, denominator: 0, unspecified: 0, unsat: [] },
        { kind: "ac-closure", numerator: 0, denominator: 0, open: [] },
        { kind: "work-item-completion", numerator: 0, denominator: 0, open: [] },
      ],
    );
    assert.equal(vitals.health.length, 7);
    for (const rule of vitals.health) {
      assert.deepEqual([rule.examined, rule.nodes], [0, []]);
    }
  });

  test("a folder holding only files that would not read is not empty", () => {
    const vitals = vitalsOf(
      graphOf([], [], {
        refused: [
          {
            file: "intent/Requirement/R-0001.md",
            type: "Requirement",
            id: "R-0001",
            problems: ["The frontmatter would not parse."],
          },
        ],
      }),
      booksOf({}),
    );
    assert.equal(vitals.empty, false);
    assert.equal(vitals.progress.requirements.denominator, 0);
  });

  test("the same graph gives the same vitals twice, and every list is in id order", () => {
    const bare = node("Requirement", "R-0002");
    const bareToo = node("Requirement", "R-0003");
    const nodes = [...SPINE_NODES, bareToo, bare].reverse();
    const edges = [
      ...SPINE,
      edge("SR-0001", "REQUIRES", "R-0002"),
      edge("SR-0001", "REQUIRES", "R-0003"),
    ];
    const ledgers = booksOf({ approvals: settled(nodes, edges) });
    const once = vitalsFor(nodes, edges, ledgers);
    const twice = vitalsFor(nodes, edges, ledgers);
    assert.deepEqual(twice, once);
    assert.deepEqual(ids(ruleOf(once, "requirement-without-criterion").nodes), ["R-0002", "R-0003"]);
  });
});
