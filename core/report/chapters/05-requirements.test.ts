import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  colorContextOf,
  reviewGraph,
  vitalsOf,
  type Ledgers,
  type PayloadHash,
  type ReviewStatus,
} from "../../arith/index.js";
import { formatEdgeId, type SpecEdge, type SpecNode } from "../../graph/index.js";
import type { SpecGraph } from "../../store/index.js";
import type { Block, Cell, Inline, ReportInput } from "../model.js";
import { carrierOf, criterionOf, registrationOf } from "../vocabulary.js";
import type { ChapterPage } from "./rule.js";
import { requirementsChapter } from "./05-requirements.js";

/**
 * Chapter 5 over a graph built by hand: the one table it registers every
 * requirement in, the page it hands every node of its three types, and the
 * fence the last test holds the whole assembly to. Nothing here asserts a
 * colour — the chapter never reads one — and nothing here expects a body on the
 * chapter page, because a body only ever appears on the node's own page now.
 *
 * CRITERIA AND CONSTRAINTS ARE THE ABSENCES THESE TESTS WATCH. Both have pages
 * and no table, so the assertions come in pairs: the chapter page is one rows
 * block with neither heading beside it, and every criterion and every
 * constraint still has its page — the constraint's back link the overview,
 * because eight types across four chapters write a constraint and none of them
 * is its way home. The way IN to a criterion is the requirement's "Criteria"
 * count and the criteria table on the requirement's own page, and those two are
 * asserted where they live rather than here.
 */

const hash: PayloadHash = (payload: string) => `sha256:${payload}`;

const LEDGERS: Ledgers = {
  approvals: new Map(),
  rejections: new Map(),
  acceptances: new Map(),
  hash,
};

/** The short name is deliberately NOT the id: the tables must prefer it. */
function node(type: string, id: string, extra: Partial<SpecNode> = {}): SpecNode {
  return {
    id,
    type,
    shortName: `sn-${id}`,
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

/**
 * ONE RESPONSIBILITY, TWO REQUIREMENTS, AND EVERY SHAPE THE CHAPTER WALKS: a
 * criterion under a requirement AND a scenario, a criterion no file answers
 * to, a conflict written from both ends, a criterion and a constraint nothing
 * attaches to, and — for the three cross-cutting lines every page now ends
 * with — one constraint written from two places, one assumption three types
 * lean on, and one decision that revises all three.
 */
const NODES: SpecNode[] = [
  node("SystemResponsibility", "SR-0001"),
  node("Scenario", "SC-0001"),
  node("Requirement", "R-0001"),
  node("Requirement", "R-0002"),
  node("AcceptanceCriterion", "AC-0001"),
  node("AcceptanceCriterion", "AC-0002"),
  node("AcceptanceCriterion", "AC-0003"),
  node("Constraint", "C-0001"),
  node("Constraint", "C-0002"),
  node("Assumption", "AS-0001"),
  node("Decision", "D-0001"),
  node("WorkItem", "WI-0001"),
  node("Evidence", "EV-0001"),
];

const EDGES: SpecEdge[] = [
  edge("SR-0001", "REQUIRES", "R-0001"),
  edge("SR-0001", "REQUIRES", "R-0002"),
  edge("R-0001", "DEPENDS_ON", "R-0002"),
  edge("R-0001", "CONFLICTS_WITH", "R-0002"),
  edge("R-0002", "CONFLICTS_WITH", "R-0001"),
  edge("R-0001", "HAS_CONSTRAINT", "C-0001"),
  edge("R-0001", "HAS_CRITERION", "AC-0001"),
  edge("R-0001", "HAS_CRITERION", "AC-9999"),
  edge("SC-0001", "HAS_CRITERION", "AC-0001"),
  edge("R-0002", "HAS_CRITERION", "AC-0002"),
  edge("WI-0001", "TARGETS", "AC-0001"),
  edge("EV-0001", "CLAIMS", "AC-0001"),
  // The cross-cutting three. A criterion fences itself with the constraint the
  // requirement above it already wrote, so C-0001 is held from two ends.
  edge("AC-0001", "HAS_CONSTRAINT", "C-0001"),
  edge("R-0001", "ASSUMES", "AS-0001"),
  edge("AC-0001", "ASSUMES", "AS-0001"),
  edge("C-0001", "ASSUMES", "AS-0001"),
  edge("D-0001", "AFFECTS", "R-0001"),
  edge("D-0001", "AFFECTS", "AC-0001"),
  edge("D-0001", "AFFECTS", "C-0001"),
];

function inputOf(
  nodes: readonly SpecNode[] = NODES,
  edges: readonly SpecEdge[] = EDGES,
): ReportInput {
  const graph: SpecGraph = {
    nodes: [...nodes],
    edges: [...edges],
    problems: [],
    refused: [],
  };
  const context = colorContextOf(graph, LEDGERS);
  const review = reviewGraph(graph, LEDGERS, context);
  return {
    graph,
    statuses: new Map(review.statuses.map((held) => [held.id, held])),
    context,
    vitals: vitalsOf(graph, LEDGERS),
    stamp: {
      projectName: "Test",
      generatedAt: "2026-01-01T00:00:00.000Z",
      gitHead: null,
    },
  };
}

function blockAt<K extends Block["kind"]>(
  blocks: readonly Block[],
  index: number,
  kind: K,
): Extract<Block, { kind: K }> {
  const block = blocks[index];
  if (block === undefined || block.kind !== kind) {
    throw new Error(`block ${index} is ${block?.kind ?? "missing"}, not ${kind}`);
  }
  return block as Extract<Block, { kind: K }>;
}

function statusOf(input: ReportInput, id: string): ReviewStatus {
  const status = input.statuses.get(id);
  assert.ok(status, `${id} has a status`);
  return status;
}

function pageOf(pages: readonly ChapterPage[], id: string): ChapterPage {
  const page = pages.find((held) => held.id === id);
  assert.ok(page, `${id} has a page`);
  return page;
}

/** The row of one table whose ID cell names the wanted node. */
function rowOf(block: Extract<Block, { kind: "rows" }>, id: string): Cell[] {
  const row = block.rows.find((held) => {
    const cell = held[0]?.[0];
    return cell !== undefined && cell.kind === "link" && cell.text === id;
  });
  assert.ok(row, `${id} has a row`);
  return row;
}

const NONE: Cell = [{ kind: "text", text: "—" }];

/** Every string the chapter emitted, from every corner of every block. */
function textsOf(blocks: readonly Block[]): string[] {
  const said: string[] = [];
  const fromInlines = (inlines: readonly Inline[]): void => {
    for (const inline of inlines) {
      said.push(inline.kind === "badge" ? inline.badge.label : inline.text);
    }
  };
  for (const block of blocks) {
    switch (block.kind) {
      case "heading":
        said.push(block.text);
        break;
      case "line":
        fromInlines(block.inlines);
        break;
      case "ratio":
        said.push(block.label, block.note ?? "");
        break;
      case "rows":
        said.push(block.caption ?? "", ...(block.header ?? []));
        for (const row of block.rows) {
          for (const cell of row) {
            fromInlines(cell);
          }
        }
        break;
      case "node":
        said.push(block.name, block.shortName, block.id, block.type, block.body ?? "");
        for (const badge of block.badges) {
          said.push(badge.label);
        }
        for (const fact of block.facts) {
          said.push(fact.label);
          fromInlines(fact.inlines);
        }
        break;
    }
  }
  return said;
}

describe("the chapter page", () => {
  test("one table, no heading over it, and no node block anywhere", () => {
    const { blocks } = requirementsChapter.assemble(inputOf());
    assert.deepEqual(
      blocks.map((block) => block.kind),
      ["rows"],
      "the requirements table alone is the chapter page",
    );
    assert.equal(
      blocks.filter((block) => block.kind === "node").length,
      0,
      "a body belongs on the node's own page",
    );
  });

  test("the criteria table is gone, heading and rows and all", () => {
    const { blocks } = requirementsChapter.assemble(inputOf());
    const said = textsOf(blocks);
    assert.ok(
      !said.includes("Acceptance criteria"),
      "no heading and no caption says it here",
    );
    // Not merely unheaded: no criterion is named on this page now. The way in
    // is the "Criteria" count beside a requirement and that requirement's page.
    for (const id of ["AC-0001", "AC-0002", "AC-0003"]) {
      assert.ok(!said.includes(id), `no criterion id reaches the chapter page (${id})`);
    }
    assert.ok(!said.includes("AcceptanceCriterion AC-0001"), "and no criterion name");
  });

  test("the constraints table is gone too, and was before", () => {
    const { blocks } = requirementsChapter.assemble(inputOf());
    for (const block of blocks) {
      if (block.kind === "heading") {
        assert.notEqual(block.text, "Constraints");
        assert.notEqual(block.anchor, "constraints");
      }
    }
    // Not merely untabled: a constraint is not named on this page at all now,
    // and the way to one is the "Constraints" line of whatever wrote it.
    const said = textsOf(blocks);
    assert.ok(!said.includes("C-0001"), "no constraint id reaches the chapter page");
    assert.ok(!said.includes("Constraint C-0001"), "and no constraint name either");
  });

  test("every requirement is a row: identity, responsibility, criteria, words", () => {
    const input = inputOf();
    const table = blockAt(requirementsChapter.assemble(input).blocks, 0, "rows");
    assert.deepEqual(table.header, [
      "ID",
      "Short name",
      "Name",
      "From responsibility",
      "Criteria",
      "Status",
    ]);
    assert.equal(table.rows.length, 2);
    const status = statusOf(input, "R-0001");
    assert.deepEqual(rowOf(table, "R-0001"), [
      [{ kind: "link", to: { node: "R-0001" }, text: "R-0001" }],
      [{ kind: "text", text: "sn-R-0001" }],
      [{ kind: "text", text: "Requirement R-0001" }],
      // The short name, not the name: a relation column has to stay narrow.
      [{ kind: "link", to: { node: "SR-0001" }, text: "sn-SR-0001" }],
      // The hole counts in the denominator — the requirement still asks for it.
      [{ kind: "text", text: "0 of 2 met" }],
      [
        { kind: "badge", badge: registrationOf(status) },
        { kind: "text", text: " " },
        { kind: "badge", badge: carrierOf(status) },
      ],
    ]);
    assert.deepEqual(rowOf(table, "R-0002")[4], [{ kind: "text", text: "0 of 1 met" }]);
  });

  test("a met criterion moves the count and nothing else", () => {
    const input = inputOf();
    const statuses = new Map(input.statuses);
    const held = statusOf(input, "AC-0001");
    statuses.set("AC-0001", { ...held, closure: "closed" });
    const table = blockAt(
      requirementsChapter.assemble({ ...input, statuses }).blocks,
      0,
      "rows",
    );
    assert.deepEqual(rowOf(table, "R-0001")[4], [{ kind: "text", text: "1 of 2 met" }]);
  });

  test("a requirement nothing requires and nothing verifies gets the dash", () => {
    const input = inputOf([node("Requirement", "R-0009")], []);
    const table = blockAt(requirementsChapter.assemble(input).blocks, 0, "rows");
    assert.deepEqual(rowOf(table, "R-0009")[3], NONE);
    assert.deepEqual(rowOf(table, "R-0009")[4], NONE);
  });

  test("a node whose status never arrived keeps its row and wears the dash", () => {
    const input = inputOf();
    const statuses = new Map(input.statuses);
    statuses.delete("R-0002");
    const table = blockAt(
      requirementsChapter.assemble({ ...input, statuses }).blocks,
      0,
      "rows",
    );
    const row = rowOf(table, "R-0002");
    assert.deepEqual(row[5], NONE);
    assert.deepEqual(row[2], [{ kind: "text", text: "Requirement R-0002" }]);
  });

  test("a node proposed for deletion says so where its words are", () => {
    const input = inputOf(
      [
        node("Requirement", "R-0001", {
          deletionProposed: { by: "t", rationale: "Superseded." },
        }),
      ],
      [],
    );
    const table = blockAt(requirementsChapter.assemble(input).blocks, 0, "rows");
    assert.deepEqual(rowOf(table, "R-0001")[5], [
      { kind: "badge", badge: registrationOf(statusOf(input, "R-0001")) },
      { kind: "text", text: " " },
      { kind: "badge", badge: carrierOf(statusOf(input, "R-0001")) },
      { kind: "text", text: " " },
      { kind: "badge", badge: { label: "Deletion proposed", tone: "neutral" } },
    ]);
  });

  test("counts and nothing else", () => {
    assert.equal(
      requirementsChapter.assemble(inputOf()).summary,
      "2 requirements, 0 satisfied; 3 criteria, 0 met.",
    );
    assert.equal(
      requirementsChapter.assemble(
        inputOf(
          [node("Requirement", "R-0001"), node("AcceptanceCriterion", "AC-0001")],
          [edge("R-0001", "HAS_CRITERION", "AC-0001")],
        ),
      ).summary,
      "1 requirement, 0 satisfied; 1 criterion, 0 met.",
    );
  });
});

describe("the pages the chapter owns", () => {
  test("every requirement, every criterion and every constraint, in id order", () => {
    const { pages } = requirementsChapter.assemble(inputOf());
    assert.deepEqual(pages.map((page) => page.id), [
      "R-0001",
      "R-0002",
      "AC-0001",
      "AC-0002",
      "AC-0003",
      "C-0001",
      "C-0002",
    ]);
    assert.equal(pageOf(pages, "AC-0001").title, "AcceptanceCriterion AC-0001");
    assert.equal(pageOf(pages, "R-0001").title, "Requirement R-0001");
  });

  test("a requirement's page: its six facts, its body, then its criteria", () => {
    const input = inputOf();
    const { pages } = requirementsChapter.assemble(input);
    const blocks = pageOf(pages, "R-0001").blocks;
    assert.deepEqual(blocks.map((block) => block.kind), ["node", "rows"]);

    const requirement = blockAt(blocks, 0, "node");
    assert.deepEqual(
      {
        id: requirement.id,
        type: requirement.type,
        name: requirement.name,
        shortName: requirement.shortName,
        depth: requirement.depth,
        body: requirement.body,
      },
      {
        id: "R-0001",
        type: "Requirement",
        name: "Requirement R-0001",
        shortName: "sn-R-0001",
        depth: 0,
        body: "What R-0001 says.",
      },
    );
    assert.deepEqual(requirement.badges, [
      registrationOf(statusOf(input, "R-0001")),
      carrierOf(statusOf(input, "R-0001")),
    ]);
    // The type's own three, then the cross-cutting three in their fixed order.
    assert.deepEqual(requirement.facts.map((fact) => fact.label), [
      "From responsibility",
      "Depends on",
      "Conflicts with",
      "Constraints",
      "Assumptions",
      "Decisions",
    ]);
    // A page says the fuller name; the table said the short one.
    assert.deepEqual(requirement.facts[0]?.inlines, [
      { kind: "link", to: { node: "SR-0001" }, text: "SystemResponsibility SR-0001" },
    ]);
    assert.deepEqual(requirement.facts[1]?.inlines, [
      { kind: "link", to: { node: "R-0002" }, text: "Requirement R-0002" },
    ]);
    assert.deepEqual(requirement.facts[3]?.inlines, [
      { kind: "link", to: { node: "C-0001" }, text: "Constraint C-0001" },
    ]);
    assert.deepEqual(requirement.facts[4]?.inlines, [
      { kind: "link", to: { node: "AS-0001" }, text: "Assumption AS-0001" },
    ]);
    // A decision names what it revises in its own file: the requirement is
    // reached from the INCOMING edge, and this line is the only way back.
    assert.deepEqual(requirement.facts[5]?.inlines, [
      { kind: "link", to: { node: "D-0001" }, text: "Decision D-0001" },
    ]);
  });

  test("a requirement nothing hangs off still carries the three empty lines", () => {
    const input = inputOf([node("Requirement", "R-0009")], []);
    const { pages } = requirementsChapter.assemble(input);
    const facts = blockAt(pageOf(pages, "R-0009").blocks, 0, "node").facts;
    assert.deepEqual(facts.slice(3), [
      { label: "Constraints", inlines: [] },
      { label: "Assumptions", inlines: [] },
      { label: "Decisions", inlines: [] },
    ]);
  });

  test("a conflict written from both ends is one entry, on either page", () => {
    const { pages } = requirementsChapter.assemble(inputOf());
    assert.deepEqual(blockAt(pageOf(pages, "R-0001").blocks, 0, "node").facts[2]?.inlines, [
      { kind: "link", to: { node: "R-0002" }, text: "Requirement R-0002" },
    ]);
    assert.deepEqual(blockAt(pageOf(pages, "R-0002").blocks, 0, "node").facts[2]?.inlines, [
      { kind: "link", to: { node: "R-0001" }, text: "Requirement R-0001" },
    ]);
  });

  test("a criterion no file answers to is said, not linked", () => {
    const input = inputOf();
    const { pages } = requirementsChapter.assemble(input);
    const table = blockAt(pageOf(pages, "R-0001").blocks, 1, "rows");
    assert.equal(table.caption, "Acceptance criteria");
    assert.deepEqual(table.header, ["ID", "Name", "Status"]);
    assert.deepEqual(table.rows, [
      [
        [{ kind: "link", to: { node: "AC-0001" }, text: "AC-0001" }],
        [{ kind: "text", text: "AcceptanceCriterion AC-0001" }],
        [
          { kind: "badge", badge: registrationOf(statusOf(input, "AC-0001")) },
          { kind: "text", text: " " },
          { kind: "badge", badge: criterionOf(statusOf(input, "AC-0001")) },
        ],
      ],
      [[{ kind: "text", text: "AC-9999" }], NONE, NONE],
    ]);
  });

  test("one page resolves a criterion's two parents", () => {
    const input = inputOf();
    const { pages } = requirementsChapter.assemble(input);
    const blocks = pageOf(pages, "AC-0001").blocks;
    assert.deepEqual(blocks.map((block) => block.kind), ["node", "rows"]);
    const criterion = blockAt(blocks, 0, "node");
    assert.equal(criterion.body, "What AC-0001 says.");
    assert.deepEqual(criterion.badges, [
      registrationOf(statusOf(input, "AC-0001")),
      criterionOf(statusOf(input, "AC-0001")),
    ]);
    assert.deepEqual(criterion.facts.map((fact) => fact.label), [
      "Criterion of",
      "Targeted by",
      "Constraints",
      "Assumptions",
      "Decisions",
    ]);
    assert.deepEqual(criterion.facts[0]?.inlines, [
      { kind: "link", to: { node: "R-0001" }, text: "Requirement R-0001" },
      { kind: "text", text: ", " },
      { kind: "link", to: { node: "SC-0001" }, text: "Scenario SC-0001" },
    ]);
    assert.deepEqual(criterion.facts[1]?.inlines, [
      { kind: "link", to: { node: "WI-0001" }, text: "WorkItem WI-0001" },
    ]);
    // The canon lets a criterion fence itself and lean on something, and lets
    // a decision revise it: all three lines are its own to write.
    assert.deepEqual(criterion.facts[2]?.inlines, [
      { kind: "link", to: { node: "C-0001" }, text: "Constraint C-0001" },
    ]);
    assert.deepEqual(criterion.facts[3]?.inlines, [
      { kind: "link", to: { node: "AS-0001" }, text: "Assumption AS-0001" },
    ]);
    assert.deepEqual(criterion.facts[4]?.inlines, [
      { kind: "link", to: { node: "D-0001" }, text: "Decision D-0001" },
    ]);
    const evidence = blockAt(blocks, 1, "rows");
    assert.equal(evidence.caption, "Evidence");
    assert.deepEqual(evidence.rows, [
      [
        [{ kind: "link", to: { node: "EV-0001" }, text: "EV-0001" }],
        [{ kind: "text", text: "Evidence EV-0001" }],
        [{ kind: "badge", badge: registrationOf(statusOf(input, "EV-0001")) }],
      ],
    ]);
  });

  test("a criterion nothing reaches says so with empty lists", () => {
    const { pages } = requirementsChapter.assemble(inputOf());
    const blocks = pageOf(pages, "AC-0003").blocks;
    const criterion = blockAt(blocks, 0, "node");
    assert.deepEqual(criterion.facts.map((fact) => fact.inlines), [[], [], [], [], []]);
    assert.deepEqual(blockAt(blocks, 1, "rows").rows, []);
  });

  test("a person's word that a criterion is not met yet is said whole", () => {
    // The chapter reads the field; that the ledger fills it is `arith`'s test.
    const input = inputOf();
    const statuses = new Map(input.statuses);
    const held = statusOf(input, "AC-0002");
    statuses.set("AC-0002", {
      ...held,
      leftOpen: { by: "t", at: "2026-01-02T00:00:00Z", rationale: "The empty case." },
    });
    const { pages } = requirementsChapter.assemble({ ...input, statuses });
    const blocks = pageOf(pages, "AC-0002").blocks;
    assert.deepEqual(blocks.map((block) => block.kind), ["node", "rows", "line"]);
    assert.deepEqual(blockAt(blocks, 2, "line").inlines, [
      {
        kind: "text",
        text: "Left open by t at 2026-01-02T00:00:00Z — The empty case.",
      },
    ]);
  });

  test("a constraint's page names everything that holds it", () => {
    const input = inputOf();
    const { pages } = requirementsChapter.assemble(input);
    const held = blockAt(pageOf(pages, "C-0001").blocks, 0, "node");
    assert.equal(held.body, "What C-0001 says.");
    // Registration is all a constraint wears: no closure, no carrier.
    assert.deepEqual(held.badges, [registrationOf(statusOf(input, "C-0001"))]);
    assert.deepEqual(held.facts, [
      {
        label: "Constrains",
        inlines: [
          { kind: "link", to: { node: "AC-0001" }, text: "AcceptanceCriterion AC-0001" },
          { kind: "text", text: ", " },
          { kind: "link", to: { node: "R-0001" }, text: "Requirement R-0001" },
        ],
      },
      // No "Constraints" line: the canon writes no HAS_CONSTRAINT out of a
      // Constraint, so the page must not invent one to keep the shape tidy.
      {
        label: "Assumptions",
        inlines: [{ kind: "link", to: { node: "AS-0001" }, text: "Assumption AS-0001" }],
      },
      {
        label: "Decisions",
        inlines: [{ kind: "link", to: { node: "D-0001" }, text: "Decision D-0001" }],
      },
    ]);
    assert.deepEqual(pageOf(pages, "C-0002").blocks.length, 1);
    assert.deepEqual(
      blockAt(pageOf(pages, "C-0002").blocks, 0, "node").facts,
      [
        { label: "Constrains", inlines: [] },
        { label: "Assumptions", inlines: [] },
        { label: "Decisions", inlines: [] },
      ],
      "an absence is said, not omitted",
    );
  });

  test("a constraint goes back to the overview; everything else to the chapter", () => {
    const { pages } = requirementsChapter.assemble(inputOf());
    assert.equal(pageOf(pages, "C-0001").back, "index");
    assert.equal(pageOf(pages, "C-0002").back, "index");
    // The two tabled types keep the chapter as their way back, which is what
    // an absent `back` means.
    assert.equal(pageOf(pages, "R-0001").back, undefined);
    assert.equal(pageOf(pages, "AC-0001").back, undefined);
  });
});

describe("the fence around the words", () => {
  test("the internal vocabulary never reaches the page", () => {
    const assembled = requirementsChapter.assemble(inputOf());
    const said = [
      assembled.summary,
      ...textsOf(assembled.blocks),
      ...assembled.pages.flatMap((page) => [page.title, ...textsOf(page.blocks)]),
    ];
    for (const text of said) {
      assert.doesNotMatch(text, /\b(red|yellow|green|unsat)\b/i, text);
    }
  });
});
