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
import type { SpecGraph } from "../../store/file-store.js";
import type { AssembledChapter, ChapterPage } from "./rule.js";
import type { Block, Cell, Fact, Inline, ReportInput } from "../model.js";
import { designChapter } from "./06-design.js";

/**
 * Chapter 6 over a design band built by hand.
 *
 * WHAT IS HELD TO IS THE MODULE-CENTRIC READING, AND WHERE EACH HALF OF IT
 * LIVES. The chapter page is one table of modules and nothing else about any of
 * them; each module's own page takes it from there — what it produces, what it
 * consumes, and the schemas that traffic is made of, said once even where both
 * sides carry the same one. A table with nothing in it is not drawn at all, and
 * a module with no interfaces says so in a line. Because those tables say the
 * two interface edges fuller than a fact line can, the module's block no longer
 * says them at all. What the walk cannot reach — an interface no module is on
 * either side of, a schema no interface carries — closes the chapter page, and
 * only when there is something to close it with.
 *
 * AND WHAT IS HELD TO IS THE ABSENCE. Constraints, assumptions, decisions and
 * findings are not tabled here any more: they are lines on the pages of what
 * they hang off, drawn wherever the canon permits the edge and drawn empty
 * where there is nothing, and their own pages go back to the overview rather
 * than to a chapter that no longer lists them. None of the internal colour
 * words reaches any emitted string, on either side of the split.
 */

const hash: PayloadHash = (payload: string) => `sha256:${payload}`;

const LEDGERS: Ledgers = {
  approvals: new Map(),
  rejections: new Map(),
  acceptances: new Map(),
  hash,
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

function inputOf(nodes: readonly SpecNode[], edges: readonly SpecEdge[]): ReportInput {
  const graph: SpecGraph = {
    nodes: [...nodes],
    edges: [...edges],
    problems: [],
    refused: [],
  };
  const context = colorContextOf(graph, LEDGERS);
  const { statuses } = reviewGraph(graph, LEDGERS, context);
  return {
    graph,
    statuses: new Map(statuses.map((status) => [status.id, status])),
    context,
    vitals: vitalsOf(graph, LEDGERS),
    stamp: {
      projectName: "Test",
      generatedAt: "2026-01-01T00:00:00.000Z",
      gitHead: null,
    },
  };
}

/**
 * Three modules, so all three shapes of a module's stretch are on the page:
 *
 * M-0001 exposes one interface and consumes another, and both carry DS-0001 —
 * the deduplication case — while the produced one also carries a schema no file
 * answers to. M-0002 exposes the interface M-0001 consumes and consumes
 * nothing, so it has no Consumes table. M-0003 has no interfaces at all.
 *
 * I-0003 is on neither side of any module and carries DS-0002, so the schema is
 * carried and the interface is a leftover; DS-0003 is carried by nothing and is
 * the other. One decision reaches a module, an interface, a schema and an
 * assumption, so the Decisions line can be read on each of the four kinds of
 * page the canon permits it on.
 */
const NODES: SpecNode[] = [
  node("SystemResponsibility", "SR-0001"),
  node("Module", "M-0001", { shortName: "core" }),
  node("Module", "M-0002", {
    shortName: "shim",
    deletionProposed: { by: "t", rationale: "It was folded into M-0001." },
  }),
  node("Module", "M-0003", { shortName: "husk" }),
  node("Interface", "I-0001"),
  node("Interface", "I-0002"),
  node("Interface", "I-0003"),
  node("DataSchema", "DS-0001"),
  node("DataSchema", "DS-0002"),
  node("DataSchema", "DS-0003"),
  node("DomainEntity", "DE-0001"),
  node("Decision", "D-0001"),
  node("Finding", "F-0001", { blocking: true, relatedNodes: ["M-0002", "Z-9999"] }),
  node("Finding", "F-0002"),
  node("Assumption", "AS-0001"),
  node("Assumption", "AS-0002"),
  node("WorkLog", "WL-0001"),
  node("WorkItem", "WI-0001"),
  node("Constraint", "C-0001"),
];

const EDGES: SpecEdge[] = [
  edge("SR-0001", "IS_REALIZED_BY", "M-0001"),
  edge("M-0001", "EXPOSES", "I-0001"),
  edge("M-0001", "CONSUMES", "I-0002"),
  edge("M-0001", "ALLOCATES", "WI-0001"),
  edge("M-0001", "HAS_CONSTRAINT", "C-0001"),
  edge("M-0001", "ASSUMES", "AS-0001"),
  edge("M-0002", "EXPOSES", "I-0002"),
  edge("I-0001", "CARRIES", "DS-0001"),
  // A schema no file answers to — the dangling case.
  edge("I-0001", "CARRIES", "DS-9999"),
  edge("I-0002", "CARRIES", "DS-0001"),
  edge("I-0003", "CARRIES", "DS-0002"),
  edge("DS-0001", "REPRESENTS", "DE-0001"),
  edge("D-0001", "RESOLVES", "F-0001"),
  edge("D-0001", "AFFECTS", "M-0001"),
  edge("D-0001", "AFFECTS", "I-0001"),
  edge("D-0001", "AFFECTS", "DS-0001"),
  edge("D-0001", "AFFECTS", "AS-0001"),
  edge("WL-0001", "RECORDS", "F-0001"),
];

const chapter = designChapter.assemble(inputOf(NODES, EDGES));

type NodeBlock = Extract<Block, { kind: "node" }>;
type RowsBlock = Extract<Block, { kind: "rows" }>;
type HeadingBlock = Extract<Block, { kind: "heading" }>;

function inlineTexts(inlines: readonly Inline[]): string[] {
  return inlines.map((inline) => (inline.kind === "badge" ? inline.badge.label : inline.text));
}

/** The page's outline: every block as one line, in the order it is drawn. */
function outlineOf(blocks: readonly Block[]): string[] {
  return blocks.map((block) => {
    switch (block.kind) {
      case "heading":
        return `h${block.level} ${block.text}`;
      case "rows":
        return `table ${block.caption ?? "-"}`;
      case "line":
        return `line ${inlineTexts(block.inlines).join("")}`;
      default:
        return block.kind;
    }
  });
}

function headingsOf(blocks: readonly Block[]): HeadingBlock[] {
  return blocks.filter((block): block is HeadingBlock => block.kind === "heading");
}

/** The table a heading introduces — the overview's, and each leftover's. */
function tableUnder(blocks: readonly Block[], heading: string): RowsBlock {
  const index = blocks.findIndex((block) => block.kind === "heading" && block.text === heading);
  assert.notEqual(index, -1, `the chapter has a ${heading} heading`);
  const next = blocks[index + 1];
  assert.ok(next !== undefined && next.kind === "rows", `${heading} is followed by its table`);
  return next;
}

function hasHeading(blocks: readonly Block[], heading: string): boolean {
  return headingsOf(blocks).some((block) => block.text === heading);
}

/** A node page's detail: everything the page draws after its own node block. */
function detailOf(assembled: AssembledChapter, id: string): Block[] {
  const blocks = pageFor(assembled, id).blocks;
  const first = blocks[0];
  assert.ok(first !== undefined && first.kind === "node", `${id}'s page opens with its block`);
  return blocks.slice(1);
}

function captionsIn(blocks: readonly Block[]): (string | null)[] {
  return blocks.filter((block): block is RowsBlock => block.kind === "rows").map((b) => b.caption);
}

function tableCaptioned(blocks: readonly Block[], caption: string): RowsBlock {
  const found = blocks.find(
    (block): block is RowsBlock => block.kind === "rows" && block.caption === caption,
  );
  assert.ok(found, `a ${caption} table is drawn`);
  return found;
}

/** The first cell of every row as the id it says — linked or not. */
function idsOf(rows: RowsBlock): string[] {
  return rows.rows.map((row) => {
    const first = row[0]?.[0];
    assert.ok(first !== undefined && first.kind !== "badge", "an id cell says an id");
    return first.text;
  });
}

function rowOf(rows: RowsBlock, id: string): Cell[] {
  const index = idsOf(rows).indexOf(id);
  assert.notEqual(index, -1, `${id} has a row`);
  const row = rows.rows[index];
  assert.ok(row, `${id} has a row`);
  return row;
}

/** One cell as [linked id or null, text], separators dropped, badges by label. */
function refsOfCell(cell: Cell): [string | null, string][] {
  const refs: [string | null, string][] = [];
  for (const inline of cell) {
    if (inline.kind === "text") {
      if (inline.text !== ", " && inline.text !== " ") {
        refs.push([null, inline.text]);
      }
      continue;
    }
    if (inline.kind === "badge") {
      refs.push([null, inline.badge.label]);
      continue;
    }
    assert.ok("node" in inline.to, "a cell links at nodes and never at a file");
    if ("node" in inline.to) {
      refs.push([inline.to.node, inline.text]);
    }
  }
  return refs;
}

function badgesOfCell(cell: Cell): string[] {
  return cell.flatMap((inline) => (inline.kind === "badge" ? [inline.badge.label] : []));
}

/** The named column of one row, by the table's own header. */
function cellNamed(rows: RowsBlock, id: string, column: string): Cell {
  const index = (rows.header ?? []).indexOf(column);
  assert.notEqual(index, -1, `the table has a ${column} column`);
  const cell = rowOf(rows, id)[index];
  assert.ok(cell, `${id} has a ${column} cell`);
  return cell;
}

function refsAt(rows: RowsBlock, id: string, column: string): [string | null, string][] {
  return refsOfCell(cellNamed(rows, id, column));
}

function pageFor(assembled: AssembledChapter, id: string): ChapterPage {
  const found = assembled.pages.find((page) => page.id === id);
  assert.ok(found, `${id} has a page of its own`);
  return found;
}

/** A page's node block — which the layout says is the page's first block. */
function nodeBlockOf(assembled: AssembledChapter, id: string): NodeBlock {
  const first = pageFor(assembled, id).blocks[0];
  assert.ok(first !== undefined && first.kind === "node", `${id}'s page opens with its node block`);
  return first;
}

function factLabelsOf(block: NodeBlock): string[] {
  return block.facts.map((fact) => fact.label);
}

function factNamed(block: NodeBlock, label: string): Fact {
  const found = block.facts.find((fact) => fact.label === label);
  assert.ok(found, `${block.id} carries a ${label} line`);
  return found;
}

/** Each reference of a fact as [linked id or null, text], separators dropped. */
function refsOf(block: NodeBlock, label: string): [string | null, string][] {
  return refsOfCell(factNamed(block, label).inlines);
}

/** Every string the renderer would draw out of these blocks. */
function textsOf(blocks: readonly Block[]): string[] {
  const texts: string[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case "heading":
        texts.push(block.text);
        break;
      case "line":
        texts.push(...inlineTexts(block.inlines));
        break;
      case "ratio":
        texts.push(block.label, block.note ?? "");
        break;
      case "rows":
        texts.push(block.caption ?? "", ...(block.header ?? []));
        texts.push(...block.rows.flatMap((row) => row.flatMap(inlineTexts)));
        break;
      case "node":
        texts.push(block.name, block.shortName, block.body ?? "");
        texts.push(...block.badges.map((badge) => badge.label));
        for (const fact of block.facts) {
          texts.push(fact.label, ...inlineTexts(fact.inlines));
        }
        break;
    }
  }
  return texts;
}

describe("the shape of chapter 6", () => {
  test("one overview, and then only what the per-module walk could not reach", () => {
    assert.deepEqual(outlineOf(chapter.blocks), [
      "h2 Modules",
      "table -",
      "h2 Interfaces no module exposes or consumes",
      "table -",
      "h2 Data schemas no interface carries",
      "table -",
    ]);
    assert.deepEqual(
      chapter.blocks.filter((block) => block.kind === "node"),
      [],
      "bodies live on the node pages, never on the chapter page",
    );
  });

  test("no module has a section of its own on the chapter page any more", () => {
    assert.deepEqual(
      headingsOf(chapter.blocks).filter((block) => block.level === 3),
      [],
      "the per-module detail moved to the module pages, headings and all",
    );
    for (const name of ["Module M-0001", "Module M-0002", "Module M-0003"]) {
      assert.equal(hasHeading(chapter.blocks, name), false, name);
    }
    // Every table left on the page is a section's, so none of them is captioned.
    assert.deepEqual(captionsIn(chapter.blocks), [null, null, null]);
  });

  test("the sections a reader can reach from the contents", () => {
    assert.deepEqual(
      headingsOf(chapter.blocks).map((block) => [block.level, block.anchor, block.inToc]),
      [
        [2, "modules", true],
        [2, "stray-interfaces", true],
        [2, "stray-data-schemas", true],
      ],
    );
  });

  test("nothing of the decisions, findings or assumptions is left on the chapter page", () => {
    for (const heading of headingsOf(chapter.blocks)) {
      assert.doesNotMatch(heading.text, /decision|finding|assumption/i, heading.text);
    }
    for (const block of chapter.blocks) {
      if (block.kind === "rows" && block.caption !== null) {
        assert.doesNotMatch(block.caption, /decision|finding|assumption/i, block.caption);
      }
    }
    // Their pages are still this chapter's to assemble — only the tables went.
    for (const id of ["D-0001", "F-0001", "AS-0001"]) {
      assert.ok(pageFor(chapter, id));
    }
  });

  test("the overview is every module, in id order, with its identity and its two edges", () => {
    const modules = tableUnder(chapter.blocks, "Modules");
    assert.deepEqual(modules.header, [
      "ID",
      "Short name",
      "Name",
      "Realizes",
      "Allocates",
      "Status",
    ]);
    assert.deepEqual(idsOf(modules), ["M-0001", "M-0002", "M-0003"]);
    assert.deepEqual(refsAt(modules, "M-0001", "ID"), [["M-0001", "M-0001"]]);
    assert.deepEqual(refsAt(modules, "M-0001", "Short name"), [[null, "core"]]);
    assert.deepEqual(refsAt(modules, "M-0001", "Name"), [[null, "Module M-0001"]]);
    // The short name, not the name: a relation column may hold several links.
    assert.deepEqual(refsAt(modules, "M-0001", "Realizes"), [["SR-0001", "SR-0001"]]);
    assert.deepEqual(refsAt(modules, "M-0001", "Allocates"), [["WI-0001", "WI-0001"]]);
    assert.deepEqual(badgesOfCell(cellNamed(modules, "M-0001", "Status")), ["Awaiting review"]);
    // A module nothing realizes keeps its row, with a dash where the edge is not.
    assert.deepEqual(refsAt(modules, "M-0002", "Realizes"), [[null, "—"]]);
    assert.deepEqual(refsAt(modules, "M-0002", "Allocates"), [[null, "—"]]);
    assert.deepEqual(badgesOfCell(cellNamed(modules, "M-0002", "Status")), [
      "Needs attention",
      "Deletion proposed",
    ]);
  });

  test("no row is ragged, on the chapter page or on any page it owns", () => {
    for (const block of [...chapter.blocks, ...chapter.pages.flatMap((page) => page.blocks)]) {
      if (block.kind !== "rows") {
        continue;
      }
      const width = (block.header ?? []).length;
      assert.notEqual(width, 0, "every table on this page names its columns");
      for (const row of block.rows) {
        assert.equal(row.length, width, `a ${block.caption ?? "leftover"} row has one cell per column`);
      }
    }
  });

  test("the counts are the three populations the chapter is made of", () => {
    assert.equal(chapter.summary, "3 modules, 3 interfaces, 3 data schemas.");
    const lone = designChapter.assemble(
      inputOf(
        [node("Module", "M-0001"), node("Interface", "I-0001"), node("DataSchema", "DS-0001")],
        [edge("M-0001", "EXPOSES", "I-0001"), edge("I-0001", "CARRIES", "DS-0001")],
      ),
    );
    assert.equal(lone.summary, "1 module, 1 interface, 1 data schema.");
  });
});

describe("what a module's own page says under its block", () => {
  test("a module on both sides of its traffic draws all three tables", () => {
    const detail = detailOf(chapter, "M-0001");
    assert.deepEqual(outlineOf(detail), [
      "table Produces",
      "table Consumes",
      "table Data schemas",
    ]);

    const produces = tableCaptioned(detail, "Produces");
    assert.deepEqual(produces.header, ["ID", "Name", "Carries", "Status"]);
    assert.deepEqual(idsOf(produces), ["I-0001"]);
    assert.deepEqual(refsAt(produces, "I-0001", "Name"), [[null, "Interface I-0001"]]);

    const consumes = tableCaptioned(detail, "Consumes");
    assert.deepEqual(consumes.header, ["ID", "Name", "Carries", "Status"]);
    assert.deepEqual(idsOf(consumes), ["I-0002"]);
  });

  test("a schema both sides carry is one row, not two", () => {
    const schemas = tableCaptioned(detailOf(chapter, "M-0001"), "Data schemas");
    assert.deepEqual(schemas.header, ["ID", "Name", "Represents", "Status"]);
    // I-0001 and I-0002 both carry DS-0001; the union says it once, in id order,
    // and the dangling id the produced interface also carries comes after it.
    assert.deepEqual(idsOf(schemas), ["DS-0001", "DS-9999"]);
    assert.deepEqual(schemas.rows.length, 2, "the union is deduplicated, not concatenated");
    assert.deepEqual(refsAt(schemas, "DS-0001", "Represents"), [["DE-0001", "DE-0001"]]);
  });

  test("a schema no file answers to is its bare id, and every other cell a dash", () => {
    const schemas = tableCaptioned(detailOf(chapter, "M-0001"), "Data schemas");
    assert.deepEqual(refsOfCell(cellNamed(schemas, "DS-9999", "ID")), [[null, "DS-9999"]]);
    assert.deepEqual(refsAt(schemas, "DS-9999", "Name"), [[null, "—"]]);
    assert.deepEqual(refsAt(schemas, "DS-9999", "Represents"), [[null, "—"]]);
    assert.deepEqual(refsAt(schemas, "DS-9999", "Status"), [[null, "—"]]);
    // The same id in a relation cell is plain text there too.
    const produces = tableCaptioned(detailOf(chapter, "M-0001"), "Produces");
    assert.deepEqual(refsAt(produces, "I-0001", "Carries"), [
      ["DS-0001", "DS-0001"],
      [null, "DS-9999"],
    ]);
  });

  test("a module that consumes nothing is not given an empty Consumes table", () => {
    const detail = detailOf(chapter, "M-0002");
    assert.deepEqual(captionsIn(detail), ["Produces", "Data schemas"]);
    assert.deepEqual(idsOf(tableCaptioned(detail, "Produces")), ["I-0002"]);
    assert.deepEqual(idsOf(tableCaptioned(detail, "Data schemas")), ["DS-0001"]);
  });

  test("a module with no interfaces says so, and is given no table at all", () => {
    const detail = detailOf(chapter, "M-0003");
    assert.deepEqual(captionsIn(detail), []);
    assert.deepEqual(outlineOf(detail), ["line No interfaces."]);
  });

  test("a module whose interfaces carry nothing gets no schema table and no line either", () => {
    const bare = designChapter.assemble(
      inputOf(
        [node("Module", "M-0001"), node("Interface", "I-0001")],
        [edge("M-0001", "EXPOSES", "I-0001")],
      ),
    );
    assert.deepEqual(outlineOf(detailOf(bare, "M-0001")), ["table Produces"]);
  });

  test("no page but a module's grows a table under its block", () => {
    for (const id of ["I-0001", "DS-0001", "D-0001", "F-0001", "AS-0001"]) {
      assert.deepEqual(detailOf(chapter, id), [], `${id}'s page is its block and no more`);
    }
  });
});

describe("what the per-module walk could not reach", () => {
  test("an interface no module is on either side of closes the chapter", () => {
    const strays = tableUnder(chapter.blocks, "Interfaces no module exposes or consumes");
    assert.deepEqual(strays.header, ["ID", "Name", "Carries", "Status"]);
    assert.deepEqual(idsOf(strays), ["I-0003"]);
    assert.deepEqual(refsAt(strays, "I-0003", "Carries"), [["DS-0002", "DS-0002"]]);
  });

  test("a schema nothing carries closes it too, and one a stray interface carries does not", () => {
    const strays = tableUnder(chapter.blocks, "Data schemas no interface carries");
    assert.deepEqual(strays.header, ["ID", "Name", "Represents", "Status"]);
    // DS-0002 is carried — by an interface no module touches, which is the
    // other section's business — so this one is the schema with no carrier.
    assert.deepEqual(idsOf(strays), ["DS-0003"]);
    assert.deepEqual(refsAt(strays, "DS-0003", "Represents"), [[null, "—"]]);
  });

  test("neither section is drawn where the walk reached everything", () => {
    const whole = designChapter.assemble(
      inputOf(
        [node("Module", "M-0001"), node("Interface", "I-0001"), node("DataSchema", "DS-0001")],
        [edge("M-0001", "EXPOSES", "I-0001"), edge("I-0001", "CARRIES", "DS-0001")],
      ),
    );
    assert.equal(hasHeading(whole.blocks, "Interfaces no module exposes or consumes"), false);
    assert.equal(hasHeading(whole.blocks, "Data schemas no interface carries"), false);
    assert.deepEqual(outlineOf(whole.blocks), ["h2 Modules", "table -"]);
    // The interface and the schema are still read, on the page of the module
    // whose traffic they are — which is what makes them not leftovers.
    assert.deepEqual(outlineOf(detailOf(whole, "M-0001")), ["table Produces", "table Data schemas"]);
  });
});

describe("the page every node of the chapter's types gets", () => {
  test("one page per living node of the six types, each opening with its own node block", () => {
    assert.deepEqual(
      chapter.pages.map((page) => page.id),
      [
        "M-0001",
        "M-0002",
        "M-0003",
        "I-0001",
        "I-0002",
        "I-0003",
        "DS-0001",
        "DS-0002",
        "DS-0003",
        "D-0001",
        "F-0001",
        "F-0002",
        "AS-0001",
        "AS-0002",
      ],
    );
    for (const page of chapter.pages) {
      const block = nodeBlockOf(chapter, page.id);
      assert.equal(page.title, block.name, "the page is titled with the node's own name");
      assert.equal(block.depth, 0);
      assert.equal(block.body, `What ${page.id} says.`, "the body is the author's, verbatim");
    }
  });

  test("the types this chapter tables go back to it; the ones it no longer tables go to the overview", () => {
    for (const id of ["M-0001", "I-0001", "DS-0001"]) {
      assert.equal(pageFor(chapter, id).back, undefined, `${id} is on the chapter page`);
    }
    for (const id of ["D-0001", "F-0001", "F-0002", "AS-0001", "AS-0002"]) {
      assert.equal(pageFor(chapter, id).back, "index", `${id} is on no chapter's page`);
    }
  });

  test("a module's page carries its own two lines and then the three the canon permits it", () => {
    const module = nodeBlockOf(chapter, "M-0001");
    // No Exposes and no Consumes: the tables under the block say those two
    // edges with the cargo and the status beside each id, which a line cannot.
    assert.deepEqual(factLabelsOf(module), [
      "Realizes",
      "Allocates",
      "Constraints",
      "Assumptions",
      "Decisions",
    ]);
    // A fact names the fuller name, where the table's cell named the short one.
    assert.deepEqual(refsOf(module, "Realizes"), [["SR-0001", "SystemResponsibility SR-0001"]]);
    assert.deepEqual(refsOf(module, "Allocates"), [["WI-0001", "WorkItem WI-0001"]]);
    assert.deepEqual(refsOf(module, "Constraints"), [["C-0001", "Constraint C-0001"]]);
    assert.deepEqual(refsOf(module, "Assumptions"), [["AS-0001", "Assumption AS-0001"]]);
    assert.deepEqual(refsOf(module, "Decisions"), [["D-0001", "Decision D-0001"]]);
    assert.deepEqual(module.badges.map((badge) => badge.label), ["Awaiting review"]);
  });

  test("a permitted line is drawn even where there is nothing on the end of it", () => {
    const bare = nodeBlockOf(chapter, "M-0003");
    assert.deepEqual(
      bare.facts.map((fact) => [fact.label, fact.inlines]),
      [
        ["Realizes", []],
        ["Allocates", []],
        ["Constraints", []],
        ["Assumptions", []],
        ["Decisions", []],
      ],
    );
  });

  test("no module page says an interface edge twice, in a line and in a table both", () => {
    for (const id of ["M-0001", "M-0002", "M-0003"]) {
      const labels = factLabelsOf(nodeBlockOf(chapter, id));
      assert.equal(labels.includes("Exposes"), false, `${id} has no Exposes line`);
      assert.equal(labels.includes("Consumes"), false, `${id} has no Consumes line`);
    }
    // An interface still says both of its own sides — it is the module's two
    // lines that went, not the relation.
    assert.deepEqual(refsOf(nodeBlockOf(chapter, "I-0002"), "Exposed by"), [
      ["M-0002", "Module M-0002"],
    ]);
  });

  test("an interface and a schema say both ends of what they hold, and who decided about them", () => {
    const held = nodeBlockOf(chapter, "I-0002");
    // No constraint and no assumption may hang off an interface, so no line does.
    assert.deepEqual(factLabelsOf(held), ["Exposed by", "Consumed by", "Carries", "Decisions"]);
    assert.deepEqual(refsOf(held, "Exposed by"), [["M-0002", "Module M-0002"]]);
    assert.deepEqual(refsOf(held, "Consumed by"), [["M-0001", "Module M-0001"]]);
    assert.deepEqual(refsOf(held, "Decisions"), []);
    assert.deepEqual(refsOf(nodeBlockOf(chapter, "I-0001"), "Carries"), [
      ["DS-0001", "DataSchema DS-0001"],
      [null, "DS-9999"],
    ]);
    assert.deepEqual(refsOf(nodeBlockOf(chapter, "I-0001"), "Decisions"), [
      ["D-0001", "Decision D-0001"],
    ]);

    const schema = nodeBlockOf(chapter, "DS-0001");
    assert.deepEqual(factLabelsOf(schema), ["Carried by", "Represents", "Decisions"]);
    assert.deepEqual(refsOf(schema, "Carried by"), [
      ["I-0001", "Interface I-0001"],
      ["I-0002", "Interface I-0002"],
    ]);
    assert.deepEqual(refsOf(schema, "Represents"), [["DE-0001", "DomainEntity DE-0001"]]);
    assert.deepEqual(refsOf(schema, "Decisions"), [["D-0001", "Decision D-0001"]]);
  });

  test("a decision reaches whatever its edges name, and nothing reaches back at it", () => {
    const decision = nodeBlockOf(chapter, "D-0001");
    // No decision affects a decision, and none of the two other lines is
    // permitted from one either, so its page is its own two facts and no more.
    assert.deepEqual(factLabelsOf(decision), ["Resolves", "Affects"]);
    assert.deepEqual(refsOf(decision, "Resolves"), [["F-0001", "Finding F-0001"]]);
    assert.deepEqual(refsOf(decision, "Affects"), [
      ["AS-0001", "Assumption AS-0001"],
      ["DS-0001", "DataSchema DS-0001"],
      ["I-0001", "Interface I-0001"],
      ["M-0001", "Module M-0001"],
    ]);
  });

  test("a finding wears the blocking word, and what it concerns is linked only where the graph holds it", () => {
    const finding = nodeBlockOf(chapter, "F-0001");
    assert.deepEqual(factLabelsOf(finding), ["Recorded by", "Resolved by", "Concerns"]);
    assert.deepEqual(finding.badges.map((badge) => badge.label), ["Awaiting review", "Blocking"]);
    assert.deepEqual(refsOf(finding, "Recorded by"), [["WL-0001", "WorkLog WL-0001"]]);
    assert.deepEqual(refsOf(finding, "Resolved by"), [["D-0001", "Decision D-0001"]]);
    // The author's own order, and the id that answers to nothing said plainly.
    assert.deepEqual(refsOf(finding, "Concerns"), [
      ["M-0002", "Module M-0002"],
      [null, "Z-9999"],
    ]);
    assert.deepEqual(
      nodeBlockOf(chapter, "F-0002").facts.map((fact) => [fact.label, fact.inlines]),
      [
        ["Recorded by", []],
        ["Resolved by", []],
        ["Concerns", []],
      ],
    );
  });

  test("an assumption says what assumes it and which decisions reached it", () => {
    const assumed = nodeBlockOf(chapter, "AS-0001");
    assert.deepEqual(factLabelsOf(assumed), ["Assumed by", "Decisions"]);
    assert.deepEqual(refsOf(assumed, "Assumed by"), [["M-0001", "Module M-0001"]]);
    assert.deepEqual(refsOf(assumed, "Decisions"), [["D-0001", "Decision D-0001"]]);
    assert.deepEqual(nodeBlockOf(chapter, "AS-0002").facts, [
      { label: "Assumed by", inlines: [] },
      { label: "Decisions", inlines: [] },
    ]);
  });

  test("a node the review said nothing about draws an em dash where its status would be", () => {
    const bare = designChapter.assemble({ ...inputOf(NODES, EDGES), statuses: new Map() });
    const modules = tableUnder(bare.blocks, "Modules");
    assert.deepEqual(refsAt(modules, "M-0001", "Status"), [[null, "—"]]);
    // The proposal is the node's own key, not the review's word, so it stands.
    assert.deepEqual(badgesOfCell(cellNamed(modules, "M-0002", "Status")), ["Deletion proposed"]);
    assert.deepEqual(nodeBlockOf(bare, "M-0001").badges, []);
    assert.deepEqual(nodeBlockOf(bare, "F-0001").badges, [{ label: "Blocking", tone: "attention" }]);
  });
});

describe("the words the report may not say", () => {
  test("no internal colour word reaches any emitted string, on either side of the split", () => {
    const texts = [
      ...textsOf(chapter.blocks),
      ...chapter.pages.flatMap((page) => [page.title, ...textsOf(page.blocks)]),
    ];
    for (const text of texts) {
      assert.doesNotMatch(text, /\b(red|yellow|green|unsat)\b/i, text);
    }
    assert.doesNotMatch(chapter.summary, /\b(red|yellow|green|unsat)\b/i);
  });
});
