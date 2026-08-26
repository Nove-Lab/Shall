import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { colorContextOf, reviewGraph, vitalsOf, type Ledgers, type PayloadHash } from "../../arith/index.js";
import { formatEdgeId, type SpecEdge, type SpecNode } from "../../graph/index.js";
import {
  approvalPayload,
  blocksOf,
  type ApprovalRecord,
} from "../../serialize/index.js";
import type { SpecGraph } from "../../store/file-store.js";
import type { Block, Cell, Fact, Inline, ReportInput } from "../model.js";
import type { ChapterPage } from "./rule.js";
import { responsibilitiesChapter } from "./04-responsibilities.js";

/**
 * Chapter 4 over graphs built by hand — the table's columns and the pages
 * behind them, the walks and their order, never the words: what the reader is
 * told about a status comes from `vocabulary.ts`, and the last test holds the
 * whole chapter to that.
 */

const hash: PayloadHash = (payload: string) => `sha256:${payload}`;

function node(type: string, id: string, extra: Partial<SpecNode> = {}): SpecNode {
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

function approve(held: SpecNode, edges: readonly SpecEdge[]): [string, ApprovalRecord] {
  return [
    held.id,
    {
      approvedHash: hash(
        approvalPayload(
          held.type,
          held.id,
          held,
          edges.filter((line) => line.fromId === held.id),
          blocksOf(held),
        ),
      ),
      by: "t",
      at: "2026-08-15T00:00:00Z",
    },
  ];
}

function booksOf(approvals: [string, ApprovalRecord][]): Ledgers {
  return {
    approvals: new Map(approvals),
    rejections: new Map(),
    acceptances: new Map(),
    hash,
  };
}

function inputOf(nodes: readonly SpecNode[], edges: readonly SpecEdge[]): ReportInput {
  const graph = graphOf(nodes, edges);
  const ledgers = booksOf(nodes.map((held) => approve(held, edges)));
  const context = colorContextOf(graph, ledgers);
  const review = reviewGraph(graph, ledgers, context);
  return {
    graph,
    statuses: new Map(review.statuses.map((status) => [status.id, status])),
    context,
    vitals: vitalsOf(graph, ledgers),
    stamp: {
      projectName: "Test",
      generatedAt: "2026-01-01T00:00:00.000Z",
      gitHead: null,
    },
  };
}

/**
 * THREE RESPONSIBILITIES, ONE OF EACH SHAPE: SR-0001 derived from a scenario
 * two use cases detail, realized and requiring; SR-0002 realized only by a
 * module no file answers to and requiring nothing; SR-0003 derived from
 * nothing at all. The node list is out of order on purpose, and the four
 * targets of SR-0001 wear short names of their own so the table can be caught
 * printing the long ones.
 */
const NODES: SpecNode[] = [
  node("SystemResponsibility", "SR-0003"),
  node("Module", "M-0002"),
  node("SystemResponsibility", "SR-0001", { shortName: "Answers" }),
  node("UseCase", "UC-0002"),
  node("Scenario", "SC-0001", { shortName: "Signs in" }),
  node("Requirement", "R-0001", { shortName: "Holds a session" }),
  node("SystemResponsibility", "SR-0002"),
  node("UseCase", "UC-0001"),
  node("Scenario", "SC-0002"),
  node("Module", "M-0001", { shortName: "Doorway" }),
  // The cross-cutting three, tabled in no chapter at all: SR-0001's page is
  // the way to each of them, and SR-0002's says none was ever written.
  node("Constraint", "C-0001", { shortName: "Within the hour" }),
  node("Assumption", "AS-0001", { shortName: "One clock" }),
  node("Decision", "D-0001", { shortName: "Sessions expire" }),
];

const EDGES: SpecEdge[] = [
  edge("UC-0001", "DETAILS", "SC-0001"),
  edge("UC-0002", "DETAILS", "SC-0001"),
  edge("UC-0002", "DETAILS", "SC-0002"),
  edge("SC-0001", "DERIVES_RESPONSIBILITY", "SR-0001"),
  edge("SC-0002", "DERIVES_RESPONSIBILITY", "SR-0002"),
  edge("SR-0001", "IS_REALIZED_BY", "M-0001"),
  edge("SR-0001", "REQUIRES", "R-0001"),
  edge("SR-0002", "IS_REALIZED_BY", "M-9999"),
  edge("SR-0003", "IS_REALIZED_BY", "M-0002"),
  edge("SR-0003", "REQUIRES", "R-0001"),
  // Two written by the responsibility, one written at it.
  edge("SR-0001", "HAS_CONSTRAINT", "C-0001"),
  edge("SR-0001", "ASSUMES", "AS-0001"),
  edge("D-0001", "AFFECTS", "SR-0001"),
];

type NodeBlock = Extract<Block, { kind: "node" }>;
type RowsBlock = Extract<Block, { kind: "rows" }>;

const HEADER = [
  "ID",
  "Short name",
  "Name",
  "Derived from",
  "Realized by",
  "Requires",
  "Status",
];

const COLUMN = new Map(HEADER.map((name, at) => [name, at]));

function tableOf(blocks: readonly Block[]): RowsBlock {
  const tables = blocks.filter((block): block is RowsBlock => block.kind === "rows");
  assert.equal(tables.length, 1, "the chapter is one table");
  return tables[0]!;
}

function rowOf(blocks: readonly Block[], id: string): Cell[] {
  const held = tableOf(blocks).rows.find((row) => {
    const first = row[0]?.[0];
    return first !== undefined && first.kind === "link" && first.text === id;
  });
  assert.ok(held, `${id} has a row`);
  return held;
}

function cellOf(row: readonly Cell[], column: string): Cell {
  const at = COLUMN.get(column);
  assert.ok(at !== undefined, `${column} is a column`);
  const held = row[at];
  assert.ok(held, `the row reaches ${column}`);
  return held;
}

function pageOf(pages: readonly ChapterPage[], id: string): ChapterPage {
  const held = pages.find((page) => page.id === id);
  assert.ok(held, `${id} has a page of its own`);
  return held;
}

/** A page opens with its node's own block — identity, badges, facts, body. */
function nodeBlockOf(pages: readonly ChapterPage[], id: string): NodeBlock {
  const first = pageOf(pages, id).blocks[0];
  assert.ok(first !== undefined && first.kind === "node", `${id}'s page opens with its block`);
  assert.equal(first.id, id);
  return first;
}

function factOf(block: NodeBlock, label: string): Fact {
  const held = block.facts.find((fact) => fact.label === label);
  assert.ok(held, `${block.id} has a "${label}" line`);
  return held;
}

function saidBy(inlines: readonly Inline[]): string[] {
  return inlines.map((inline) => (inline.kind === "badge" ? inline.badge.label : inline.text));
}

describe("the responsibilities chapter", () => {
  test("is one table over every responsibility in id order, and carries no node block", () => {
    const chapter = responsibilitiesChapter.assemble(inputOf(NODES, EDGES));
    assert.deepEqual(
      chapter.blocks.map((block) => block.kind),
      ["rows"],
    );
    for (const block of chapter.blocks) {
      assert.notEqual(block.kind, "node");
    }
    const table = tableOf(chapter.blocks);
    assert.equal(table.caption, null);
    assert.deepEqual(table.header, HEADER);
    assert.deepEqual(
      table.rows.map((row) => saidBy(row[0]!)),
      [["SR-0001"], ["SR-0002"], ["SR-0003"]],
    );
    for (const row of table.rows) {
      assert.equal(row.length, HEADER.length);
    }
  });

  test("a row is identity, the three walks by short name, and the status word", () => {
    const chapter = responsibilitiesChapter.assemble(inputOf(NODES, EDGES));
    assert.deepEqual(rowOf(chapter.blocks, "SR-0001"), [
      [{ kind: "link", to: { node: "SR-0001" }, text: "SR-0001" }],
      [{ kind: "text", text: "Answers" }],
      [{ kind: "text", text: "SystemResponsibility SR-0001" }],
      [{ kind: "link", to: { node: "SC-0001" }, text: "Signs in" }],
      [{ kind: "link", to: { node: "M-0001" }, text: "Doorway" }],
      [{ kind: "link", to: { node: "R-0001" }, text: "Holds a session" }],
      [{ kind: "badge", badge: { label: "Approved", tone: "good" } }],
    ]);
  });

  test("two targets of one relation are one cell, comma separated", () => {
    const twice = [...EDGES, edge("SR-0001", "IS_REALIZED_BY", "M-0002")];
    const chapter = responsibilitiesChapter.assemble(inputOf(NODES, twice));
    assert.deepEqual(cellOf(rowOf(chapter.blocks, "SR-0001"), "Realized by"), [
      { kind: "link", to: { node: "M-0001" }, text: "Doorway" },
      { kind: "text", text: ", " },
      { kind: "link", to: { node: "M-0002" }, text: "M-0002" },
    ]);
  });

  test("an id no file answers to is text and not a link, and realizes nothing", () => {
    const chapter = responsibilitiesChapter.assemble(inputOf(NODES, EDGES));
    assert.deepEqual(cellOf(rowOf(chapter.blocks, "SR-0002"), "Realized by"), [
      { kind: "text", text: "M-9999" },
    ]);
    // Two of the three are realized: SR-0002's only module is the hole above.
    assert.equal(chapter.summary, "3 responsibilities, 2 realized by a module.");
  });

  test("a relation with nothing in it is a dash, and a responsibility nothing derives still has a row", () => {
    const chapter = responsibilitiesChapter.assemble(inputOf(NODES, EDGES));
    assert.deepEqual(cellOf(rowOf(chapter.blocks, "SR-0002"), "Requires"), [
      { kind: "text", text: "—" },
    ]);
    const stray = rowOf(chapter.blocks, "SR-0003");
    assert.deepEqual(cellOf(stray, "Derived from"), [{ kind: "text", text: "—" }]);
    assert.deepEqual(cellOf(stray, "Realized by"), [
      { kind: "link", to: { node: "M-0002" }, text: "M-0002" },
    ]);
  });

  test("the status cell says the registration word first, a proposed deletion after it, and a dash without a status", () => {
    const plain = responsibilitiesChapter.assemble(inputOf(NODES, EDGES));
    // Nothing holds SR-0003, which the review answers for; the chapter prints
    // whatever word came back and invents none.
    assert.deepEqual(cellOf(rowOf(plain.blocks, "SR-0003"), "Status"), [
      { kind: "badge", badge: { label: "Needs attention", tone: "attention" } },
    ]);

    const proposed = NODES.map((held) =>
      held.id === "SR-0001"
        ? { ...held, deletionProposed: { by: "agent", rationale: "Folded into SR-0002." } }
        : held,
    );
    const marked = responsibilitiesChapter.assemble(inputOf(proposed, EDGES));
    assert.deepEqual(saidBy(cellOf(rowOf(marked.blocks, "SR-0001"), "Status")), [
      "Approved",
      " ",
      "Deletion proposed",
    ]);
    assert.deepEqual(nodeBlockOf(marked.pages, "SR-0001").badges, [
      { label: "Approved", tone: "good" },
      { label: "Deletion proposed", tone: "neutral" },
    ]);

    const unread = responsibilitiesChapter.assemble({
      ...inputOf(NODES, EDGES),
      statuses: new Map(),
    });
    for (const row of tableOf(unread.blocks).rows) {
      assert.deepEqual(cellOf(row, "Status"), [{ kind: "text", text: "—" }]);
    }
    for (const page of unread.pages) {
      assert.deepEqual(nodeBlockOf(unread.pages, page.id).badges, []);
    }
  });

  test("every responsibility has a page of its own, titled by its name and carrying its body", () => {
    const chapter = responsibilitiesChapter.assemble(inputOf(NODES, EDGES));
    assert.deepEqual(
      chapter.pages.map((page) => page.id),
      ["SR-0001", "SR-0002", "SR-0003"],
    );
    const page = pageOf(chapter.pages, "SR-0001");
    assert.equal(page.title, "SystemResponsibility SR-0001");
    assert.deepEqual(
      page.blocks.map((block) => block.kind),
      ["node"],
    );
    const block = nodeBlockOf(chapter.pages, "SR-0001");
    assert.equal(block.type, "SystemResponsibility");
    assert.equal(block.name, "SystemResponsibility SR-0001");
    assert.equal(block.shortName, "Answers");
    assert.equal(block.depth, 0);
    assert.equal(block.body, "What SR-0001 says.");
  });

  test("a page names the use cases that detail the scenario, both of them, by their full names", () => {
    const chapter = responsibilitiesChapter.assemble(inputOf(NODES, EDGES));
    assert.deepEqual(factOf(nodeBlockOf(chapter.pages, "SR-0001"), "Derived from").inlines, [
      { kind: "link", to: { node: "SC-0001" }, text: "Scenario SC-0001" },
      { kind: "text", text: " (in " },
      { kind: "link", to: { node: "UC-0001" }, text: "UseCase UC-0001" },
      { kind: "text", text: ", " },
      { kind: "link", to: { node: "UC-0002" }, text: "UseCase UC-0002" },
      { kind: "text", text: ")" },
    ]);
  });

  test("the two downward lines link by name, and an empty one is no inlines at all", () => {
    const chapter = responsibilitiesChapter.assemble(inputOf(NODES, EDGES));
    const block = nodeBlockOf(chapter.pages, "SR-0001");
    assert.deepEqual(factOf(block, "Realized by").inlines, [
      { kind: "link", to: { node: "M-0001" }, text: "Module M-0001" },
    ]);
    assert.deepEqual(factOf(block, "Requires").inlines, [
      { kind: "link", to: { node: "R-0001" }, text: "Requirement R-0001" },
    ]);

    const held = nodeBlockOf(chapter.pages, "SR-0002");
    assert.deepEqual(factOf(held, "Requires").inlines, []);
    assert.deepEqual(factOf(held, "Realized by").inlines, [{ kind: "text", text: "M-9999" }]);
    assert.deepEqual(factOf(nodeBlockOf(chapter.pages, "SR-0003"), "Derived from").inlines, []);
  });

  test("the page closes with the cross-cutting three, each link by full name", () => {
    const chapter = responsibilitiesChapter.assemble(inputOf(NODES, EDGES));
    const block = nodeBlockOf(chapter.pages, "SR-0001");
    assert.deepEqual(
      block.facts.map((fact) => fact.label),
      ["Derived from", "Realized by", "Requires", "Constraints", "Assumptions", "Decisions"],
    );
    // None of the three is tabled in any chapter, so these lines are the way to
    // them — and they name the far end in full, as every fact on a page does.
    assert.deepEqual(factOf(block, "Constraints").inlines, [
      { kind: "link", to: { node: "C-0001" }, text: "Constraint C-0001" },
    ]);
    assert.deepEqual(factOf(block, "Assumptions").inlines, [
      { kind: "link", to: { node: "AS-0001" }, text: "Assumption AS-0001" },
    ]);
    // AFFECTS is written at the decision; the page reads it backwards.
    assert.deepEqual(factOf(block, "Decisions").inlines, [
      { kind: "link", to: { node: "D-0001" }, text: "Decision D-0001" },
    ]);
  });

  test("all three lines stand where nothing was written, so the absence is read", () => {
    const chapter = responsibilitiesChapter.assemble(inputOf(NODES, EDGES));
    for (const id of ["SR-0002", "SR-0003"]) {
      const block = nodeBlockOf(chapter.pages, id);
      assert.deepEqual(
        block.facts.slice(3).map((fact) => [fact.label, fact.inlines]),
        [
          ["Constraints", []],
          ["Assumptions", []],
          ["Decisions", []],
        ],
        id,
      );
    }
  });

  test("the summary counts, and says one responsibility singly", () => {
    const lone = responsibilitiesChapter.assemble(
      inputOf([node("SystemResponsibility", "SR-0001")], []),
    );
    assert.equal(lone.summary, "1 responsibility, 0 realized by a module.");
    assert.equal(lone.pages.length, 1);
    const empty = responsibilitiesChapter.assemble(inputOf([], []));
    assert.equal(empty.summary, "0 responsibilities, 0 realized by a module.");
    assert.deepEqual(empty.pages, []);
    assert.deepEqual(tableOf(empty.blocks).rows, []);
  });

  test("no internal colour word reaches the page", () => {
    const chapter = responsibilitiesChapter.assemble(inputOf(NODES, EDGES));
    const said: string[] = [chapter.summary, ...HEADER];
    const table = tableOf(chapter.blocks);
    said.push(...(table.header ?? []));
    for (const row of table.rows) {
      for (const cell of row) {
        said.push(...saidBy(cell));
      }
    }
    for (const page of chapter.pages) {
      said.push(page.title, page.id);
      const block = nodeBlockOf(chapter.pages, page.id);
      said.push(block.name, block.shortName, block.id, block.type, block.body ?? "");
      for (const badge of block.badges) {
        said.push(badge.label);
      }
      for (const fact of block.facts) {
        said.push(fact.label, ...saidBy(fact.inlines));
      }
    }
    for (const line of said) {
      assert.doesNotMatch(line, /\b(red|yellow|green|unsat)\b/i, line);
    }
  });
});
