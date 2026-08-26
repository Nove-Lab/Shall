import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatEdgeId, type SpecEdge, type SpecNode } from "../../graph/index.js";
import {
  colorContextOf,
  reviewGraph,
  vitalsOf,
  type Ledgers,
  type PayloadHash,
  type ReviewStatus,
} from "../../arith/index.js";
import type { SpecGraph } from "../../store/file-store.js";
import type { Block, Cell, Fact, Inline, ReportInput } from "../model.js";
import type { ChapterPage } from "./rule.js";
import { termsChapter } from "./01-terms.js";

/**
 * Chapter 1's shape: a page of two tables and no bodies, a row for every node of
 * the domain band, the four edge directions read into columns and again into
 * facts, a dangling target said as its bare id, a neighbour written at both ends
 * counted once — and a page under `nodes/` for every one of them.
 */

const hash: PayloadHash = (payload: string) => `sha256:${payload}`;

const STAMP = {
  projectName: "Test",
  generatedAt: "2026-01-01T00:00:00.000Z",
  gitHead: null,
};

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

function booksOf(): Ledgers {
  return {
    approvals: new Map(),
    rejections: new Map(),
    acceptances: new Map(),
    hash,
  };
}

function inputOf(
  nodes: readonly SpecNode[],
  edges: readonly SpecEdge[],
  unread: readonly string[] = [],
): ReportInput {
  const graph = graphOf(nodes, edges);
  const ledgers = booksOf();
  const context = colorContextOf(graph, ledgers);
  const statuses = new Map<string, ReviewStatus>(
    reviewGraph(graph, ledgers, context).statuses.map((status) => [status.id, status]),
  );
  // A file that would not read leaves its id with no status at all.
  for (const id of unread) {
    statuses.delete(id);
  }
  return { graph, statuses, context, vitals: vitalsOf(graph, ledgers), stamp: STAMP };
}

// The short names differ from the names on purpose: a table column is written
// with the short one, a page's fact line with the full one, and only a fixture
// that tells them apart can hold either to it.
const payment = node("Term", "T-0001", {
  name: "Payment",
  shortName: "Pay",
  body: "## Definition\n\nMoney moving from one party to another.\n",
});
/** Denoting nothing and mentioned by nobody — still a row and still a page. */
const ledgerTerm = node("Term", "T-0002", { name: "Ledger", shortName: "Ledger" });
const account = node("DomainEntity", "DE-0001", { name: "Account", shortName: "Acct" });
const invoice = node("DomainEntity", "DE-0002", {
  name: "Invoice",
  shortName: "Inv",
  deletionProposed: { by: "t", rationale: "Folded into Account." },
});
const requirement = node("Requirement", "R-0001", { name: "Payments settle" });
const scenario = node("Scenario", "SC-0001", { name: "A payment is made" });
/**
 * A decision hangs off one term and one entity. It is tabled in no chapter at
 * all, so the "Decisions" line on their pages is the only way anyone reaches
 * it — which is what the fixture is here to hold.
 */
const decision = node("Decision", "D-0001", {
  name: "Payment means the transfer, not the promise",
  shortName: "Payment is the transfer",
});

const NODES = [payment, ledgerTerm, account, invoice, requirement, scenario, decision];
const EDGES = [
  edge("T-0001", "DENOTES", "DE-0001"),
  // Nothing answers to DE-9999: the hole is said, never linked.
  edge("T-0001", "DENOTES", "DE-9999"),
  edge("SC-0001", "MENTIONS", "T-0001"),
  edge("R-0001", "MENTIONS", "T-0001"),
  // The same neighbouring written at both ends.
  edge("DE-0001", "RELATES_TO", "DE-0002"),
  edge("DE-0002", "RELATES_TO", "DE-0001"),
  // Written at the decision, read backwards on the pages it lands on.
  edge("D-0001", "AFFECTS", "T-0001"),
  edge("D-0001", "AFFECTS", "DE-0001"),
];

/** Each inline as its kind and what it points at — enough to hold a cell to. */
function shapeOf(inlines: readonly Inline[]): string[][] {
  return inlines.map((inline) => {
    switch (inline.kind) {
      case "text":
        return ["text", inline.text];
      case "badge":
        return ["badge", inline.badge.label];
      case "link":
        return ["link", "node" in inline.to ? inline.to.node : inline.to.file, inline.text];
    }
  });
}

function tablesOf(blocks: readonly Block[]): Extract<Block, { kind: "rows" }>[] {
  return blocks.filter((block): block is Extract<Block, { kind: "rows" }> => block.kind === "rows");
}

/** The terms table, then the domain entities table. */
function tableOf(blocks: readonly Block[], which: 0 | 1): Extract<Block, { kind: "rows" }> {
  const table = tablesOf(blocks)[which];
  assert.ok(table !== undefined, `table ${which} stands`);
  return table;
}

function rowOf(table: Extract<Block, { kind: "rows" }>, id: string): Cell[] {
  const held = table.rows.find((row) => shapeOf(row[0] ?? [])[0]?.[1] === id);
  assert.ok(held !== undefined, `${id} has a row`);
  return held;
}

function pageOf(pages: readonly ChapterPage[], id: string): ChapterPage {
  const held = pages.find((page) => page.id === id);
  assert.ok(held !== undefined, `${id} has a page`);
  return held;
}

function nodeBlockOf(page: ChapterPage): Extract<Block, { kind: "node" }> {
  const first = page.blocks[0];
  assert.ok(first !== undefined && first.kind === "node", `${page.id} opens with its node block`);
  return first;
}

function factNamed(block: Extract<Block, { kind: "node" }>, label: string): Fact {
  const held = block.facts.find((fact) => fact.label === label);
  assert.ok(held !== undefined, `${block.id} carries a "${label}" line`);
  return held;
}

describe("the chapter page is two tables", () => {
  test("headings and tables, and not one node block", () => {
    const chapter = termsChapter.assemble(inputOf(NODES, EDGES));
    assert.deepEqual(
      chapter.blocks.map((block) => (block.kind === "heading" ? block.text : block.kind)),
      ["Terms", "rows", "Domain entities", "rows"],
    );
    assert.equal(
      chapter.blocks.some((block) => block.kind === "node"),
      false,
    );
    assert.deepEqual(
      chapter.blocks
        .filter((block) => block.kind === "heading")
        .map((block) => [block.level, block.anchor, block.inToc]),
      [
        [2, "terms", true],
        [2, "domain-entities", true],
      ],
    );
  });

  test("the columns are identity, edges and status — nothing read out of a body", () => {
    const chapter = termsChapter.assemble(inputOf(NODES, EDGES));
    assert.deepEqual(tableOf(chapter.blocks, 0).header, [
      "ID",
      "Short name",
      "Name",
      "Denotes",
      "Status",
    ]);
    assert.deepEqual(tableOf(chapter.blocks, 1).header, [
      "ID",
      "Short name",
      "Name",
      "Denoted by",
      "Related to",
      "Status",
    ]);
  });

  test("every term then every domain entity, in id order", () => {
    const chapter = termsChapter.assemble(inputOf(NODES, EDGES));
    assert.deepEqual(
      tableOf(chapter.blocks, 0).rows.map((row) => shapeOf(row[0] ?? [])),
      [
        [["link", "T-0001", "T-0001"]],
        [["link", "T-0002", "T-0002"]],
      ],
    );
    assert.deepEqual(
      tableOf(chapter.blocks, 1).rows.map((row) => shapeOf(row[0] ?? [])),
      [
        [["link", "DE-0001", "DE-0001"]],
        [["link", "DE-0002", "DE-0002"]],
      ],
    );
  });

  test("it counts what it listed", () => {
    const chapter = termsChapter.assemble(inputOf(NODES, EDGES));
    assert.equal(chapter.summary, "2 terms, 2 domain entities.");
    assert.equal(termsChapter.ordinal, 1);
    assert.equal(termsChapter.slug, "01-terms");
  });

  test("one of each is said in the singular", () => {
    const chapter = termsChapter.assemble(
      inputOf([payment, account], [edge("T-0001", "DENOTES", "DE-0001")]),
    );
    assert.equal(chapter.summary, "1 term, 1 domain entity.");
  });

  test("an empty project is two headings over two empty tables, and no pages", () => {
    const chapter = termsChapter.assemble(inputOf([], []));
    assert.equal(chapter.blocks.length, 4);
    assert.deepEqual(
      tablesOf(chapter.blocks).map((table) => table.rows.length),
      [0, 0],
    );
    assert.deepEqual(chapter.pages, []);
    assert.equal(chapter.summary, "0 terms, 0 domain entities.");
  });
});

describe("what a row says", () => {
  test("a term's row: identity, what it denotes by short name, the id nothing answers to", () => {
    const table = tableOf(termsChapter.assemble(inputOf(NODES, EDGES)).blocks, 0);
    assert.deepEqual(rowOf(table, "T-0001").map(shapeOf), [
      [["link", "T-0001", "T-0001"]],
      [["text", "Pay"]],
      [["text", "Payment"]],
      [
        ["link", "DE-0001", "Acct"],
        ["text", ", "],
        ["text", "DE-9999"],
      ],
      [["badge", "Awaiting review"]],
    ]);
  });

  test("a term nothing reaches keeps its row, with an em dash where the edges would be", () => {
    const table = tableOf(termsChapter.assemble(inputOf(NODES, EDGES)).blocks, 0);
    assert.deepEqual(rowOf(table, "T-0002").map(shapeOf), [
      [["link", "T-0002", "T-0002"]],
      [["text", "Ledger"]],
      [["text", "Ledger"]],
      [["text", "—"]],
      [["badge", "Awaiting review"]],
    ]);
  });

  test("an entity is denoted by its terms, and a neighbour written at both ends counts once", () => {
    const table = tableOf(termsChapter.assemble(inputOf(NODES, EDGES)).blocks, 1);
    assert.deepEqual(rowOf(table, "DE-0001").map(shapeOf), [
      [["link", "DE-0001", "DE-0001"]],
      [["text", "Acct"]],
      [["text", "Account"]],
      [["link", "T-0001", "Pay"]],
      [["link", "DE-0002", "Inv"]],
      [["badge", "Awaiting review"]],
    ]);
    assert.deepEqual(rowOf(table, "DE-0002").map(shapeOf), [
      [["link", "DE-0002", "DE-0002"]],
      [["text", "Inv"]],
      [["text", "Invoice"]],
      [["text", "—"]],
      [["link", "DE-0001", "Acct"]],
      [
        ["badge", "Awaiting review"],
        ["text", " "],
        ["badge", "Deletion proposed"],
      ],
    ]);
  });

  test("a node the review has no status for shows an em dash, its own frontmatter still said", () => {
    const chapter = termsChapter.assemble(inputOf(NODES, EDGES, ["T-0001", "DE-0002"]));
    assert.deepEqual(shapeOf(rowOf(tableOf(chapter.blocks, 0), "T-0001")[4] ?? []), [
      ["text", "—"],
    ]);
    assert.deepEqual(shapeOf(rowOf(tableOf(chapter.blocks, 1), "DE-0002")[5] ?? []), [
      ["badge", "Deletion proposed"],
    ]);
  });
});

describe("the page every node gets", () => {
  test("one page per living term and entity, in id order, titled by its name", () => {
    const chapter = termsChapter.assemble(inputOf(NODES, EDGES));
    assert.deepEqual(
      chapter.pages.map((page) => [page.id, page.title]),
      [
        ["T-0001", "Payment"],
        ["T-0002", "Ledger"],
        ["DE-0001", "Account"],
        ["DE-0002", "Invoice"],
      ],
    );
  });

  test("the page is the node block: identity, the body verbatim, the registration badge", () => {
    const chapter = termsChapter.assemble(inputOf(NODES, EDGES));
    const page = pageOf(chapter.pages, "T-0001");
    assert.equal(page.blocks.length, 1);
    const block = nodeBlockOf(page);
    assert.equal(block.depth, 0);
    assert.equal(block.type, "Term");
    assert.equal(block.name, "Payment");
    assert.equal(block.shortName, "Pay");
    assert.equal(block.body, payment.body);
    assert.deepEqual(block.badges, [{ label: "Awaiting review", tone: "pending" }]);
  });

  test("a proposed deletion is said beside the registration", () => {
    const chapter = termsChapter.assemble(inputOf(NODES, EDGES));
    assert.deepEqual(
      nodeBlockOf(pageOf(chapter.pages, "DE-0002")).badges.map((badge) => badge.label),
      ["Awaiting review", "Deletion proposed"],
    );
    const unread = termsChapter.assemble(inputOf(NODES, EDGES, ["T-0001", "DE-0002"]));
    assert.deepEqual(nodeBlockOf(pageOf(unread.pages, "T-0001")).badges, []);
    assert.deepEqual(
      nodeBlockOf(pageOf(unread.pages, "DE-0002")).badges.map((badge) => badge.label),
      ["Deletion proposed"],
    );
  });

  test("a term's facts name its entities in full, and the id nothing answers to", () => {
    const chapter = termsChapter.assemble(inputOf(NODES, EDGES));
    const block = nodeBlockOf(pageOf(chapter.pages, "T-0001"));
    assert.deepEqual(shapeOf(factNamed(block, "Denotes").inlines), [
      ["link", "DE-0001", "Account"],
      ["text", ", "],
      ["text", "DE-9999"],
    ]);
    assert.deepEqual(shapeOf(factNamed(block, "Mentioned in").inlines), [
      ["link", "R-0001", "Payments settle"],
      ["text", ", "],
      ["link", "SC-0001", "A payment is made"],
    ]);
  });

  test("a term nothing reaches keeps all three lines, empty", () => {
    const chapter = termsChapter.assemble(inputOf(NODES, EDGES));
    assert.deepEqual(
      nodeBlockOf(pageOf(chapter.pages, "T-0002")).facts.map((fact) => [
        fact.label,
        fact.inlines.length,
      ]),
      [
        ["Denotes", 0],
        ["Mentioned in", 0],
        ["Decisions", 0],
      ],
    );
  });

  test("an entity's facts read both directions, the both-ended neighbour once", () => {
    const chapter = termsChapter.assemble(inputOf(NODES, EDGES));
    const first = nodeBlockOf(pageOf(chapter.pages, "DE-0001"));
    assert.deepEqual(shapeOf(factNamed(first, "Denoted by").inlines), [
      ["link", "T-0001", "Payment"],
    ]);
    assert.deepEqual(shapeOf(factNamed(first, "Related to").inlines), [
      ["link", "DE-0002", "Invoice"],
    ]);
    const second = nodeBlockOf(pageOf(chapter.pages, "DE-0002"));
    assert.deepEqual(shapeOf(factNamed(second, "Denoted by").inlines), []);
    assert.deepEqual(shapeOf(factNamed(second, "Related to").inlines), [
      ["link", "DE-0001", "Account"],
    ]);
  });

  test("a decision is reached from the term and the entity it landed on", () => {
    const chapter = termsChapter.assemble(inputOf(NODES, EDGES));
    // The decision is tabled in no chapter: this line is the road to it, and it
    // links the way every fact does — the far end's own full name.
    for (const id of ["T-0001", "DE-0001"]) {
      assert.deepEqual(
        shapeOf(factNamed(nodeBlockOf(pageOf(chapter.pages, id)), "Decisions").inlines),
        [["link", "D-0001", "Payment means the transfer, not the promise"]],
        id,
      );
    }
  });

  test("the line the grammar permits stands empty where no decision was taken", () => {
    const chapter = termsChapter.assemble(inputOf(NODES, EDGES));
    for (const id of ["T-0002", "DE-0002"]) {
      assert.deepEqual(
        factNamed(nodeBlockOf(pageOf(chapter.pages, id)), "Decisions").inlines,
        [],
        id,
      );
    }
  });

  test("an entity's page closes with the decisions, after the two lines it had", () => {
    const chapter = termsChapter.assemble(inputOf(NODES, EDGES));
    assert.deepEqual(
      nodeBlockOf(pageOf(chapter.pages, "DE-0001")).facts.map((fact) => fact.label),
      ["Denoted by", "Related to", "Decisions"],
    );
    // Neither type may write a constraint or an assumption, so neither line is
    // invented here — the grammar decides which facts a page carries.
    assert.deepEqual(
      nodeBlockOf(pageOf(chapter.pages, "T-0001")).facts.map((fact) => fact.label),
      ["Denotes", "Mentioned in", "Decisions"],
    );
  });
});

describe("the words the chapter is allowed", () => {
  test("no internal colour reaches the page or the pages it owns", () => {
    const chapter = termsChapter.assemble(inputOf(NODES, EDGES));
    // The body is the author's, quoted whole; everything else here is the
    // chapter's own choice of words, and that is what this holds.
    const said: string[] = [chapter.summary, termsChapter.title];
    const collect = (blocks: readonly Block[]): void => {
      for (const block of blocks) {
        switch (block.kind) {
          case "heading":
            said.push(block.text);
            break;
          case "rows":
            said.push(...(block.header ?? []));
            for (const row of block.rows) {
              for (const cell of row) {
                said.push(...shapeOf(cell).flat());
              }
            }
            break;
          case "node":
            said.push(block.name, block.shortName, block.id, block.type);
            for (const badge of block.badges) {
              said.push(badge.label);
            }
            for (const fact of block.facts) {
              said.push(fact.label, ...shapeOf(fact.inlines).flat());
            }
            break;
          case "line":
            said.push(...shapeOf(block.inlines).flat());
            break;
          case "ratio":
            said.push(block.label, block.note ?? "");
            break;
        }
      }
    };
    collect(chapter.blocks);
    for (const page of chapter.pages) {
      said.push(page.title);
      collect(page.blocks);
    }
    for (const text of said) {
      assert.doesNotMatch(text, /\b(red|yellow|green|unsat)\b/i, text);
    }
  });
});
