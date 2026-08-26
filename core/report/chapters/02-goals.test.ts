import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  colorContextOf,
  reviewGraph,
  vitalsOf,
  type Ledgers,
  type PayloadHash,
} from "../../arith/index.js";
import { formatEdgeId, type SpecEdge, type SpecNode } from "../../graph/index.js";
import type { SpecGraph } from "../../store/index.js";
import type { Block, Cell, Inline, ReportInput } from "../model.js";
import type { ChapterPage } from "./rule.js";
import { goalsChapter } from "./02-goals.js";

/**
 * Chapter 2 over graphs built by hand: the tree the REFINES lines make read as
 * the ORDER OF THE ROWS, the goals no tree reaches, the two hops to a use case
 * on a goal's own page — asserted as structure, because the words are the
 * nodes' own and the vocabulary's.
 */

const hash: PayloadHash = (payload: string) => `sha256:${payload}`;

function books(): Ledgers {
  return {
    approvals: new Map(),
    rejections: new Map(),
    acceptances: new Map(),
    hash,
  };
}

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

function inputOf(
  nodes: readonly SpecNode[],
  edges: readonly SpecEdge[],
  statuses?: ReportInput["statuses"],
): ReportInput {
  const graph: SpecGraph = {
    nodes: [...nodes],
    edges: [...edges],
    problems: [],
    refused: [],
  };
  const ledgers = books();
  const context = colorContextOf(graph, ledgers);
  const review = reviewGraph(graph, ledgers, context);
  return {
    graph,
    statuses: statuses ?? new Map(review.statuses.map((held) => [held.id, held])),
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
 * One tree two ranks past the indent cap (G-0001 → G-0002 → G-0004 → G-0008 →
 * G-0009), a sub-goal two parents refine into (G-0004), a second root nothing
 * touches (G-0005), a refinement loop no root reaches (G-0006 ⇄ G-0007), and
 * an actor no file answers to (A-9999).
 *
 * Three nodes carry a short name that is NOT their id, so a table cell naming
 * the short one and a fact naming the full one cannot be confused.
 */
const NODES: SpecNode[] = [
  node("Goal", "G-0001"),
  node("Goal", "G-0002"),
  node("Goal", "G-0003"),
  node("Goal", "G-0004", { shortName: "shared" }),
  node("Goal", "G-0005"),
  node("Goal", "G-0006"),
  node("Goal", "G-0007"),
  node("Goal", "G-0008"),
  node("Goal", "G-0009"),
  node("Actor", "A-0001", { shortName: "reader" }),
  node("Actor", "A-0002", { shortName: "writer" }),
  node("UseCase", "UC-0001"),
  node("UseCase", "UC-0002"),
  node("UseCase", "UC-0003"),
  node("Constraint", "C-0001"),
  node("Assumption", "AS-0001"),
  // Tabled in no chapter: G-0001's page is the only way anyone reaches it.
  node("Decision", "D-0001"),
];

const EDGES: SpecEdge[] = [
  edge("G-0001", "REFINES", "G-0002"),
  edge("G-0001", "REFINES", "G-0003"),
  edge("G-0002", "REFINES", "G-0004"),
  edge("G-0003", "REFINES", "G-0004"),
  edge("G-0004", "REFINES", "G-0008"),
  edge("G-0008", "REFINES", "G-0009"),
  edge("G-0006", "REFINES", "G-0007"),
  edge("G-0007", "REFINES", "G-0006"),
  edge("G-0001", "PURSUED_BY", "A-0001"),
  edge("G-0001", "PURSUED_BY", "A-0002"),
  edge("G-0001", "PURSUED_BY", "A-9999"),
  edge("G-0001", "HAS_CONSTRAINT", "C-0001"),
  edge("G-0001", "ASSUMES", "AS-0001"),
  // Written at the decision, read backwards on the goal it revised.
  edge("D-0001", "AFFECTS", "G-0001"),
  edge("A-0001", "PERFORMS", "UC-0001"),
  edge("A-0001", "PERFORMS", "UC-0002"),
  edge("A-0002", "PERFORMS", "UC-0002"),
  edge("A-0002", "PERFORMS", "UC-0003"),
];

const HEADER = ["ID", "Goal", "Refines", "Pursued by", "Status"];

function outline(blocks: readonly Block[]): unknown[] {
  return blocks.map((block) =>
    block.kind === "heading"
      ? ["heading", block.text, block.anchor, block.inToc]
      : block.kind === "rows"
        ? ["rows", block.rows.length]
        : [block.kind],
  );
}

function tablesOf(blocks: readonly Block[]): Extract<Block, { kind: "rows" }>[] {
  return blocks.filter(
    (block): block is Extract<Block, { kind: "rows" }> => block.kind === "rows",
  );
}

function tableOf(blocks: readonly Block[], which: number): Extract<Block, { kind: "rows" }> {
  const found = tablesOf(blocks)[which];
  assert.ok(found !== undefined, `table ${which} is on the page`);
  return found;
}

/** The row whose ID cell links at this id — the table read by node. */
function rowOf(table: Extract<Block, { kind: "rows" }>, id: string): Cell[] {
  const found = table.rows.filter((row) => {
    const first = row[0]?.[0];
    return first !== undefined && first.kind === "link" && first.text === id;
  });
  assert.equal(found.length, 1, `${id} has exactly one row`);
  return found[0]!;
}

function idsOf(table: Extract<Block, { kind: "rows" }>): string[] {
  return table.rows.map((row) => {
    const first = row[0]?.[0];
    return first !== undefined && first.kind === "link" ? first.text : "";
  });
}

/** Everything one cell says, in order — text, link text or badge label. */
function said(cell: Cell | undefined): string[] {
  return (cell ?? []).map((held) => (held.kind === "badge" ? held.badge.label : held.text));
}

function pageFor(pages: readonly ChapterPage[], id: string): ChapterPage {
  const found = pages.filter((page) => page.id === id);
  assert.equal(found.length, 1, `${id} has exactly one page`);
  return found[0]!;
}

function nodeBlockOf(page: ChapterPage): Extract<Block, { kind: "node" }> {
  const first = page.blocks[0];
  assert.ok(first !== undefined && first.kind === "node", `${page.id} opens with its node block`);
  return first;
}

function factsOf(pages: readonly ChapterPage[], id: string) {
  return nodeBlockOf(pageFor(pages, id)).facts;
}

/** Every string the chapter put anywhere, whatever block carries it. */
function textsOf(blocks: readonly Block[]): string[] {
  const spoken: string[] = [];
  const inline = (held: Inline): void => {
    spoken.push(held.kind === "badge" ? held.badge.label : held.text);
  };
  for (const block of blocks) {
    switch (block.kind) {
      case "heading":
        spoken.push(block.text);
        break;
      case "node":
        spoken.push(block.name, block.shortName, block.id, block.type, block.body ?? "");
        for (const badge of block.badges) spoken.push(badge.label);
        for (const fact of block.facts) {
          spoken.push(fact.label);
          fact.inlines.forEach(inline);
        }
        break;
      case "rows":
        spoken.push(...(block.header ?? []), block.caption ?? "");
        block.rows.flat().forEach((cell) => cell.forEach(inline));
        break;
      case "line":
        block.inlines.forEach(inline);
        break;
      case "ratio":
        spoken.push(block.label, block.note ?? "");
        break;
    }
  }
  return spoken;
}

describe("the goal tree, as a table", () => {
  const assembled = goalsChapter.assemble(inputOf(NODES, EDGES));

  test("is headings and tables, and stacks no node on the chapter page", () => {
    assert.deepEqual(outline(assembled.blocks), [
      ["heading", "The goal tree", "goal-tree", true],
      ["rows", 7],
      ["heading", "Goals outside the tree", null, false],
      ["rows", 2],
    ]);
    assert.ok(
      assembled.blocks.every((block) => block.kind !== "node"),
      "a body never stands on the chapter page",
    );
  });

  test("names the same five columns over both tables", () => {
    for (const table of tablesOf(assembled.blocks)) {
      assert.deepEqual(table.header, HEADER);
    }
  });

  test("orders the rows depth-first from the roots, indenting a rank at a time", () => {
    assert.deepEqual(
      tableOf(assembled.blocks, 0).rows.map((row) => [said(row[0])[0], ...said(row[1])]),
      [
        ["G-0001", "", "Goal G-0001"],
        ["G-0002", "· ", "Goal G-0002"],
        ["G-0004", "· · ", "Goal G-0004"],
        ["G-0008", "· · · ", "Goal G-0008"],
        // One rank deeper than the cap, and still three dots.
        ["G-0009", "· · · ", "Goal G-0009"],
        ["G-0003", "· ", "Goal G-0003"],
        ["G-0005", "", "Goal G-0005"],
      ],
    );
  });

  test("links every id at the node's own page", () => {
    assert.deepEqual(rowOf(tableOf(assembled.blocks, 0), "G-0002")[0], [
      { kind: "link", to: { node: "G-0002" }, text: "G-0002" },
    ]);
  });

  test("rows a sub-goal two parents refine into once, under the first, and names both", () => {
    const table = tableOf(assembled.blocks, 0);
    const ids = idsOf(table);
    assert.deepEqual(ids.filter((id) => id === "G-0004"), ["G-0004"]);
    assert.ok(ids.indexOf("G-0004") < ids.indexOf("G-0003"));
    assert.deepEqual(rowOf(table, "G-0004")[2], [
      { kind: "link", to: { node: "G-0002" }, text: "G-0002" },
      { kind: "text", text: ", " },
      { kind: "link", to: { node: "G-0003" }, text: "G-0003" },
    ]);
  });

  test("says a parent by its short name, not its full one", () => {
    assert.deepEqual(rowOf(tableOf(assembled.blocks, 0), "G-0008")[2], [
      { kind: "link", to: { node: "G-0004" }, text: "shared" },
    ]);
  });

  test("links the actors a goal is pursued by, and says a dangling one as plain text", () => {
    assert.deepEqual(rowOf(tableOf(assembled.blocks, 0), "G-0001")[3], [
      { kind: "link", to: { node: "A-0001" }, text: "reader" },
      { kind: "text", text: ", " },
      { kind: "link", to: { node: "A-0002" }, text: "writer" },
      { kind: "text", text: ", " },
      { kind: "text", text: "A-9999" },
    ]);
    const links = tablesOf(assembled.blocks).flatMap((table) => table.rows.flat().flat());
    assert.ok(
      !links.some(
        (held) => held.kind === "link" && "node" in held.to && held.to.node === "A-9999",
      ),
      "nothing links at an id no file answers to",
    );
  });

  test("dashes a root's parent cell and a goal nobody pursues", () => {
    const row = rowOf(tableOf(assembled.blocks, 0), "G-0005");
    assert.deepEqual(row[2], [{ kind: "text", text: "—" }]);
    assert.deepEqual(row[3], [{ kind: "text", text: "—" }]);
  });

  test("ends with the goals no root reaches, each naming the other in the loop", () => {
    const outside = tableOf(assembled.blocks, 1);
    assert.deepEqual(idsOf(outside), ["G-0006", "G-0007"]);
    assert.deepEqual(said(rowOf(outside, "G-0006")[1]), ["", "Goal G-0006"]);
    assert.deepEqual(rowOf(outside, "G-0006")[2], [
      { kind: "link", to: { node: "G-0007" }, text: "G-0007" },
    ]);
    assert.deepEqual(rowOf(outside, "G-0007")[2], [
      { kind: "link", to: { node: "G-0006" }, text: "G-0006" },
    ]);
  });

  test("counts the goals and the roots, and pages every one of them", () => {
    assert.equal(assembled.summary, "9 goals, 2 of them root goals.");
    assert.deepEqual(
      assembled.pages.map((page) => page.id),
      [
        "G-0001",
        "G-0002",
        "G-0003",
        "G-0004",
        "G-0005",
        "G-0006",
        "G-0007",
        "G-0008",
        "G-0009",
      ],
    );
  });

  test("says one goal and one root in the singular", () => {
    const alone = goalsChapter.assemble(inputOf([node("Goal", "G-0001")], []));
    assert.equal(alone.summary, "1 goal, 1 of them root goal.");
  });

  test("names the ordinal, the slug and the title", () => {
    assert.deepEqual(
      [goalsChapter.ordinal, goalsChapter.slug, goalsChapter.title],
      [2, "02-goals", "Goals"],
    );
  });
});

describe("the status column", () => {
  const proposed = node("Goal", "G-0002", {
    deletionProposed: { by: "t", rationale: "Superseded." },
  });
  const pair = [node("Goal", "G-0001"), proposed];
  const lines = [edge("G-0001", "REFINES", "G-0002")];

  test("wears the registration word alone, and the proposal beside it", () => {
    const assembled = goalsChapter.assemble(inputOf(pair, lines));
    const table = tableOf(assembled.blocks, 0);
    assert.deepEqual(rowOf(table, "G-0001")[4], [
      { kind: "badge", badge: { label: "Awaiting review", tone: "pending" } },
    ]);
    assert.deepEqual(rowOf(table, "G-0002")[4], [
      { kind: "badge", badge: { label: "Awaiting review", tone: "pending" } },
      { kind: "text", text: " " },
      { kind: "badge", badge: { label: "Deletion proposed", tone: "neutral" } },
    ]);
    assert.deepEqual(nodeBlockOf(pageFor(assembled.pages, "G-0002")).badges, [
      { label: "Awaiting review", tone: "pending" },
      { label: "Deletion proposed", tone: "neutral" },
    ]);
  });

  test("says a dash for a node the review has no status for", () => {
    const assembled = goalsChapter.assemble(inputOf(NODES, EDGES, new Map()));
    for (const table of tablesOf(assembled.blocks)) {
      for (const row of table.rows) {
        assert.deepEqual(row[4], [{ kind: "text", text: "—" }]);
      }
    }
    for (const page of assembled.pages) {
      assert.deepEqual(nodeBlockOf(page).badges, [], page.id);
    }
  });
});

describe("a goal's own page", () => {
  const assembled = goalsChapter.assemble(inputOf(NODES, EDGES));

  test("is titled with the node's name and opens with its node block, body verbatim", () => {
    const page = pageFor(assembled.pages, "G-0002");
    assert.equal(page.title, "Goal G-0002");
    assert.equal(page.blocks.length, 1);
    const block = nodeBlockOf(page);
    assert.deepEqual(
      [block.type, block.id, block.name, block.shortName, block.depth, block.body],
      ["Goal", "G-0002", "Goal G-0002", "G-0002", 0, "What G-0002 says."],
    );
  });

  test("carries the seven facts, in order, the cross-cutting three last", () => {
    assert.deepEqual(
      factsOf(assembled.pages, "G-0001").map((fact) => fact.label),
      [
        "Refines",
        "Refined by",
        "Pursued by",
        "Use cases, through its actors",
        "Constraints",
        "Assumptions",
        "Decisions",
      ],
    );
  });

  test("names the goal above and the goals below in full", () => {
    const facts = factsOf(assembled.pages, "G-0004");
    assert.deepEqual(facts[0]?.inlines, [
      { kind: "link", to: { node: "G-0002" }, text: "Goal G-0002" },
      { kind: "text", text: ", " },
      { kind: "link", to: { node: "G-0003" }, text: "Goal G-0003" },
    ]);
    assert.deepEqual(facts[1]?.inlines, [
      { kind: "link", to: { node: "G-0008" }, text: "Goal G-0008" },
    ]);
    // A root refines into nothing above it: no inlines, and the renderer says so.
    assert.deepEqual(factsOf(assembled.pages, "G-0001")[0]?.inlines, []);
  });

  test("links the actors it is pursued by, and says a dangling one as plain text", () => {
    assert.deepEqual(factsOf(assembled.pages, "G-0001")[2]?.inlines, [
      { kind: "link", to: { node: "A-0001" }, text: "Actor A-0001" },
      { kind: "text", text: ", " },
      { kind: "link", to: { node: "A-0002" }, text: "Actor A-0002" },
      { kind: "text", text: ", " },
      { kind: "text", text: "A-9999" },
    ]);
  });

  test("reaches the use cases through its actors, deduplicated, each via the first actor", () => {
    assert.deepEqual(factsOf(assembled.pages, "G-0001")[3]?.inlines, [
      { kind: "link", to: { node: "UC-0001" }, text: "UseCase UC-0001" },
      { kind: "text", text: " (via Actor A-0001)" },
      { kind: "text", text: ", " },
      { kind: "link", to: { node: "UC-0002" }, text: "UseCase UC-0002" },
      { kind: "text", text: " (via Actor A-0001)" },
      { kind: "text", text: ", " },
      { kind: "link", to: { node: "UC-0003" }, text: "UseCase UC-0003" },
      { kind: "text", text: " (via Actor A-0002)" },
    ]);
  });

  test("links its constraints, its assumptions and the decisions taken about it", () => {
    const facts = factsOf(assembled.pages, "G-0001");
    assert.deepEqual(facts[4]?.inlines, [
      { kind: "link", to: { node: "C-0001" }, text: "Constraint C-0001" },
    ]);
    assert.deepEqual(facts[5]?.inlines, [
      { kind: "link", to: { node: "AS-0001" }, text: "Assumption AS-0001" },
    ]);
    // AFFECTS is written at the decision; the goal reads it backwards.
    assert.deepEqual(facts[6]?.inlines, [
      { kind: "link", to: { node: "D-0001" }, text: "Decision D-0001" },
    ]);
  });

  test("a goal nothing was written about keeps all seven lines, empty", () => {
    assert.deepEqual(
      factsOf(assembled.pages, "G-0005").map((fact) => [fact.label, fact.inlines]),
      [
        ["Refines", []],
        ["Refined by", []],
        ["Pursued by", []],
        ["Use cases, through its actors", []],
        ["Constraints", []],
        ["Assumptions", []],
        ["Decisions", []],
      ],
    );
  });

  test("pages a goal the tree never reached, all the same", () => {
    const block = nodeBlockOf(pageFor(assembled.pages, "G-0006"));
    assert.equal(block.body, "What G-0006 says.");
    assert.deepEqual(block.facts[0]?.inlines, [
      { kind: "link", to: { node: "G-0007" }, text: "Goal G-0007" },
    ]);
  });
});

describe("the report's own vocabulary", () => {
  test("nothing on the chapter page or its pages says a word the internals use", () => {
    const assembled = goalsChapter.assemble(inputOf(NODES, EDGES));
    const spoken = [
      ...textsOf(assembled.blocks),
      ...assembled.pages.flatMap((page) => [page.title, ...textsOf(page.blocks)]),
      assembled.summary,
    ];
    for (const line of spoken) {
      assert.ok(
        !/\b(red|yellow|green|sat|unsat)\b/i.test(line),
        `the report says "${line}"`,
      );
    }
  });
});
