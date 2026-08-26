import { compare, isPermittedTriple, type SpecNode } from "../../graph/index.js";
import type { Badge, Block, Cell, Fact, Inline, ReportInput } from "../model.js";
import { registrationOf } from "../vocabulary.js";
import type { AssembledChapter, ChapterPage, ChapterRule } from "./rule.js";

/**
 * CHAPTER 6 — THE DESIGN BAND, READ FROM THE MODULE OUT. A module is the thing
 * a reader of a design has a name for, so the chapter page is a list of modules
 * and the detail of each module is on the module's own page: the interfaces it
 * produces, the interfaces it consumes, and the schemas those interfaces carry.
 * An interface is not a population to be scanned on its own — it is something a
 * module publishes or calls, and it is read there.
 *
 * THE DETAIL IS ONE CLICK DOWN, NOT ONE SCROLL DOWN. A chapter that ran two
 * hundred modules' tables end to end was a page nobody could reach the bottom
 * of, and every one of those tables answers a question a reader has about ONE
 * module. So the chapter page is the overview and nothing else, and the three
 * tables sit under the module's own node block, where the reader who asked
 * about that module already is.
 *
 * WHAT A MODULE HAS NONE OF IS NOT DRAWN. A module with nothing to consume gets
 * no empty Consumes table; a module with no interfaces at all says so in one
 * line. An empty table is a heading a reader has to step over to learn nothing.
 *
 * NOTHING FALLS OUT. The per-module walk reaches only what a module exposes or
 * consumes, so the chapter page closes with the two leftovers the walk cannot
 * have reached — the interfaces no module is on either side of, and the schemas
 * no interface carries — and those sections stand only when they have something
 * in them. Between the module pages and the leftovers, every living interface
 * and every living schema is somewhere in the chapter exactly once.
 *
 * CONSTRAINTS, ASSUMPTIONS, DECISIONS AND FINDINGS ARE NOT TABLED HERE. They
 * hang off half the canon, so a table of them in one chapter would be a table
 * the other six chapters' readers never find. They are reached from the pages
 * of what they hang off — a module's page names its constraints, its
 * assumptions, and the decisions that reached it — and their own pages, which
 * this chapter still assembles, take the reader back to the overview rather
 * than to a chapter that no longer lists them.
 *
 * THE BODIES LIVE ONE LINK AWAY. Every row's id cell points at `nodes/<id>.html`:
 * identity, badges, the edge facts in full under each target's longer name, and
 * the author's body verbatim. The chapter page is the map; the node pages are
 * the ground. Columns are edges and status only — nothing here reads a body.
 */

const NOTHING = "—";

/** Every living node of one type, in id order. */
function nodesOfType(input: ReportInput, type: string): SpecNode[] {
  return input.graph.nodes
    .filter((node) => node.type === type)
    .sort((first, second) => compare(first.id, second.id));
}

/** The far end of this node's outgoing edges of one type, in id order. */
function targetsOf(input: ReportInput, id: string, edgeType: string): string[] {
  return (input.context.outgoing.get(id) ?? [])
    .filter((edge) => edge.type === edgeType)
    .map((edge) => edge.toId)
    .sort(compare);
}

/** The near end of this node's incoming edges of one type, in id order. */
function sourcesOf(input: ReportInput, id: string, edgeType: string): string[] {
  return (input.context.incoming.get(id) ?? [])
    .filter((edge) => edge.type === edgeType)
    .map((edge) => edge.fromId)
    .sort(compare);
}

/**
 * An id as a PAGE refers to it: the node's full name as a link where the graph
 * holds that node, the bare id as text where it does not — an edge at a
 * missing file names something no page exists for, and a link to nowhere would
 * be worse than the id itself.
 */
function refOf(input: ReportInput, id: string): Inline {
  const node = input.context.nodes.get(id);
  return node === undefined
    ? { kind: "text", text: id }
    : { kind: "link", to: { node: id }, text: node.name };
}

/**
 * The same id as a TABLE refers to it — the short name, because a relation
 * cell may hold half a dozen of them and a column that grows with the longest
 * sentence in the specification is a column nobody can scan.
 */
function shortRefOf(input: ReportInput, id: string): Inline {
  const node = input.context.nodes.get(id);
  return node === undefined
    ? { kind: "text", text: id }
    : { kind: "link", to: { node: id }, text: node.shortName };
}

/** One labelled line of references; an empty list is left empty for "none". */
function factOf(input: ReportInput, label: string, ids: readonly string[]): Fact {
  const inlines: Inline[] = [];
  for (const id of ids) {
    if (inlines.length > 0) {
      inlines.push({ kind: "text", text: ", " });
    }
    inlines.push(refOf(input, id));
  }
  return { label, inlines };
}

function outFact(input: ReportInput, label: string, id: string, edgeType: string): Fact {
  return factOf(input, label, targetsOf(input, id, edgeType));
}

function inFact(input: ReportInput, label: string, id: string, edgeType: string): Fact {
  return factOf(input, label, sourcesOf(input, id, edgeType));
}

/**
 * THE THREE CROSS-CUTTING LINES, ADDED WHERE AND ONLY WHERE THE CANON ALLOWS
 * THEM. A constraint, an assumption and a decision are no longer tabled in any
 * chapter, so the page of whatever they hang off is the only way to them: what
 * this node fences itself with, what it takes as given, and which decisions
 * reached it. The grammar is asked rather than transcribed, so a canon revision
 * that lets a new type carry a constraint gets the line without this file
 * being edited — and a type the canon forbids it to never grows one.
 *
 * A PERMITTED LINE IS ALWAYS DRAWN, empty where there is nothing, because a
 * module with no constraints on it is a fact a reader should be able to read
 * off the page rather than infer from a missing heading.
 */
function crossCuttingFacts(input: ReportInput, node: SpecNode): Fact[] {
  const facts: Fact[] = [];
  if (isPermittedTriple(node.type, "Constraint", "HAS_CONSTRAINT")) {
    facts.push(outFact(input, "Constraints", node.id, "HAS_CONSTRAINT"));
  }
  if (isPermittedTriple(node.type, "Assumption", "ASSUMES")) {
    facts.push(outFact(input, "Assumptions", node.id, "ASSUMES"));
  }
  if (isPermittedTriple("Decision", node.type, "AFFECTS")) {
    facts.push(inFact(input, "Decisions", node.id, "AFFECTS"));
  }
  return facts;
}

/** The one cell an empty relation draws — a table may not have a hole in it. */
function noneCell(): Cell {
  return [{ kind: "text", text: NOTHING }];
}

/**
 * A table's ID cell: the door to the node's page where the graph holds it, and
 * the bare id where it does not, for the reason `refOf` gives.
 */
function idCell(input: ReportInput, id: string): Cell {
  return input.context.nodes.has(id)
    ? [{ kind: "link", to: { node: id }, text: id }]
    : [{ kind: "text", text: id }];
}

function textCell(text: string): Cell {
  return [{ kind: "text", text }];
}

/** The name column of a row a walk reached by id — a dash where nothing answers. */
function nameCell(input: ReportInput, id: string): Cell {
  const node = input.context.nodes.get(id);
  return node === undefined ? noneCell() : textCell(node.name);
}

/** A relation cell: the far ends under their short names, comma-separated. */
function refsCell(input: ReportInput, ids: readonly string[]): Cell {
  if (ids.length === 0) {
    return noneCell();
  }
  const cell: Cell = [];
  for (const id of ids) {
    if (cell.length > 0) {
      cell.push({ kind: "text", text: ", " });
    }
    cell.push(shortRefOf(input, id));
  }
  return cell;
}

function outCell(input: ReportInput, id: string, edgeType: string): Cell {
  return refsCell(input, targetsOf(input, id, edgeType));
}

function inCell(input: ReportInput, id: string, edgeType: string): Cell {
  return refsCell(input, sourcesOf(input, id, edgeType));
}

/**
 * The registration word first, then whatever second axis the type has, then
 * the proposal. A node whose file would not read has no status and so wears no
 * registration badge; the keys it does have are still its own.
 */
function badgesOf(input: ReportInput, node: SpecNode, second: readonly Badge[]): Badge[] {
  const badges: Badge[] = [];
  const status = input.statuses.get(node.id);
  if (status !== undefined) {
    badges.push(registrationOf(status));
  }
  badges.push(...second);
  if (node.deletionProposed !== undefined) {
    badges.push({ label: "Deletion proposed", tone: "neutral" });
  }
  return badges;
}

function badgeCell(badges: readonly Badge[]): Cell {
  if (badges.length === 0) {
    return noneCell();
  }
  const cell: Cell = [];
  for (const badge of badges) {
    if (cell.length > 0) {
      cell.push({ kind: "text", text: " " });
    }
    cell.push({ kind: "badge", badge });
  }
  return cell;
}

/**
 * The status cell of a row the walk reached by id: the registration word, and
 * the proposal beside it where one stands. None of this chapter's types carries
 * a second review axis, so there is nothing else to put here, and a node the
 * review said nothing about — or that the graph does not hold at all — draws
 * the em dash rather than an empty cell.
 */
function statusCell(input: ReportInput, id: string): Cell {
  const node = input.context.nodes.get(id);
  return node === undefined ? noneCell() : badgeCell(badgesOf(input, node, []));
}

function table(caption: string | null, header: string[], rows: Cell[][]): Block {
  return { kind: "rows", caption, header, rows };
}

function section(text: string, anchor: string): Block {
  return { kind: "heading", level: 2, text, anchor, inToc: true };
}

const MODULE_HEADER = ["ID", "Short name", "Name", "Realizes", "Allocates", "Status"];
const INTERFACE_HEADER = ["ID", "Name", "Carries", "Status"];
const SCHEMA_HEADER = ["ID", "Name", "Represents", "Status"];

function moduleRow(input: ReportInput, node: SpecNode): Cell[] {
  return [
    idCell(input, node.id),
    textCell(node.shortName),
    textCell(node.name),
    inCell(input, node.id, "IS_REALIZED_BY"),
    outCell(input, node.id, "ALLOCATES"),
    statusCell(input, node.id),
  ];
}

function interfaceRow(input: ReportInput, id: string): Cell[] {
  return [
    idCell(input, id),
    nameCell(input, id),
    outCell(input, id, "CARRIES"),
    statusCell(input, id),
  ];
}

function schemaRow(input: ReportInput, id: string): Cell[] {
  return [
    idCell(input, id),
    nameCell(input, id),
    outCell(input, id, "REPRESENTS"),
    statusCell(input, id),
  ];
}

/**
 * The schemas one module's traffic is made of: every schema carried by an
 * interface it produces or consumes, said once. The same schema on both sides
 * of a module is the ordinary case — a module reads what it writes — and it is
 * one row, not two.
 */
function schemasUnder(input: ReportInput, interfaceIds: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const interfaceId of interfaceIds) {
    for (const schemaId of targetsOf(input, interfaceId, "CARRIES")) {
      seen.add(schemaId);
    }
  }
  return [...seen].sort(compare);
}

/**
 * What one module's page says under its node block: up to three tables, and a
 * line in place of all three where the module has no interfaces on either side.
 * These are the same facts the block's own lines used to say, said fuller —
 * each interface with what it carries and where the review left it — which is
 * why the block no longer says them.
 */
function moduleTables(input: ReportInput, node: SpecNode): Block[] {
  const produced = targetsOf(input, node.id, "EXPOSES");
  const consumed = targetsOf(input, node.id, "CONSUMES");
  const schemas = schemasUnder(input, [...produced, ...consumed]);

  const blocks: Block[] = [];
  if (produced.length > 0) {
    blocks.push(
      table(
        "Produces",
        INTERFACE_HEADER,
        produced.map((id) => interfaceRow(input, id)),
      ),
    );
  }
  if (consumed.length > 0) {
    blocks.push(
      table(
        "Consumes",
        INTERFACE_HEADER,
        consumed.map((id) => interfaceRow(input, id)),
      ),
    );
  }
  if (schemas.length > 0) {
    blocks.push(
      table(
        "Data schemas",
        SCHEMA_HEADER,
        schemas.map((id) => schemaRow(input, id)),
      ),
    );
  }
  if (produced.length === 0 && consumed.length === 0) {
    blocks.push({ kind: "line", inlines: [{ kind: "text", text: "No interfaces." }] });
  }
  return blocks;
}

/**
 * What the per-module walk could not have reached. The two conditions are read
 * literally off the edges, so each heading says exactly what its table holds:
 * only a Module may expose or consume, and only an Interface may carry, so an
 * interface with neither edge on it is one no module is on either side of, and
 * a schema with no incoming CARRIES is one no interface carries.
 */
function leftoverBlocks(input: ReportInput): Block[] {
  const strayInterfaces = nodesOfType(input, "Interface").filter(
    (node) =>
      sourcesOf(input, node.id, "EXPOSES").length === 0 &&
      sourcesOf(input, node.id, "CONSUMES").length === 0,
  );
  const straySchemas = nodesOfType(input, "DataSchema").filter(
    (node) => sourcesOf(input, node.id, "CARRIES").length === 0,
  );

  const blocks: Block[] = [];
  if (strayInterfaces.length > 0) {
    blocks.push(
      section("Interfaces no module exposes or consumes", "stray-interfaces"),
      table(
        null,
        INTERFACE_HEADER,
        strayInterfaces.map((node) => interfaceRow(input, node.id)),
      ),
    );
  }
  if (straySchemas.length > 0) {
    blocks.push(
      section("Data schemas no interface carries", "stray-data-schemas"),
      table(
        null,
        SCHEMA_HEADER,
        straySchemas.map((node) => schemaRow(input, node.id)),
      ),
    );
  }
  return blocks;
}

function nodeBlock(
  input: ReportInput,
  node: SpecNode,
  facts: Fact[],
  second: readonly Badge[] = [],
): Block {
  return {
    kind: "node",
    id: node.id,
    type: node.type,
    name: node.name,
    shortName: node.shortName,
    depth: 0,
    badges: badgesOf(input, node, second),
    facts: [...facts, ...crossCuttingFacts(input, node)],
    body: node.body,
  };
}

/** One node's own page: its block, whole, and nothing of its neighbours'. */
function pageOf(node: SpecNode, block: Block, back?: "index"): ChapterPage {
  return back === undefined
    ? { id: node.id, title: node.name, blocks: [block] }
    : { id: node.id, title: node.name, blocks: [block], back };
}

/**
 * A module's page: its block, and then its traffic in full. The two interface
 * lines are NOT among the block's facts — the tables below say the same edges
 * with the name, the cargo and the status beside each id, and a page that said
 * both would ask the reader to check one against the other.
 */
function modulePage(input: ReportInput, node: SpecNode): ChapterPage {
  return {
    id: node.id,
    title: node.name,
    blocks: [
      nodeBlock(input, node, [
        inFact(input, "Realizes", node.id, "IS_REALIZED_BY"),
        outFact(input, "Allocates", node.id, "ALLOCATES"),
      ]),
      ...moduleTables(input, node),
    ],
  };
}

function interfacePage(input: ReportInput, node: SpecNode): ChapterPage {
  return pageOf(
    node,
    nodeBlock(input, node, [
      inFact(input, "Exposed by", node.id, "EXPOSES"),
      inFact(input, "Consumed by", node.id, "CONSUMES"),
      outFact(input, "Carries", node.id, "CARRIES"),
    ]),
  );
}

function schemaPage(input: ReportInput, node: SpecNode): ChapterPage {
  return pageOf(
    node,
    nodeBlock(input, node, [
      inFact(input, "Carried by", node.id, "CARRIES"),
      outFact(input, "Represents", node.id, "REPRESENTS"),
    ]),
  );
}

/**
 * A decision, a finding and an assumption go back to the overview and not to
 * this chapter: the chapter no longer lists them, so its page is not where the
 * reader came from and would not be where they could find this one again.
 */
function decisionPage(input: ReportInput, node: SpecNode): ChapterPage {
  return pageOf(
    node,
    nodeBlock(input, node, [
      outFact(input, "Resolves", node.id, "RESOLVES"),
      // AFFECTS reaches most of the canon, so nothing is filtered by type here:
      // whatever the edges name is what is linked, and a decision's reach is the
      // decision's own business.
      outFact(input, "Affects", node.id, "AFFECTS"),
    ]),
    "index",
  );
}

function findingPage(input: ReportInput, node: SpecNode): ChapterPage {
  return pageOf(
    node,
    nodeBlock(
      input,
      node,
      [
        inFact(input, "Recorded by", node.id, "RECORDS"),
        inFact(input, "Resolved by", node.id, "RESOLVES"),
        // A HINT AND NOT A RELATION: nothing resolves these ids, so they keep the
        // author's own order, and one the graph cannot answer to is not a fault.
        factOf(input, "Concerns", node.relatedNodes ?? []),
      ],
      node.blocking === true ? [{ label: "Blocking", tone: "attention" }] : [],
    ),
    "index",
  );
}

function assumptionPage(input: ReportInput, node: SpecNode): ChapterPage {
  return pageOf(
    node,
    nodeBlock(input, node, [inFact(input, "Assumed by", node.id, "ASSUMES")]),
    "index",
  );
}

function countOf(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function assemble(input: ReportInput): AssembledChapter {
  const modules = nodesOfType(input, "Module");
  const interfaces = nodesOfType(input, "Interface");
  const schemas = nodesOfType(input, "DataSchema");
  const decisions = nodesOfType(input, "Decision");
  const findings = nodesOfType(input, "Finding");
  const assumptions = nodesOfType(input, "Assumption");

  const blocks: Block[] = [
    section("Modules", "modules"),
    table(
      null,
      MODULE_HEADER,
      modules.map((node) => moduleRow(input, node)),
    ),
    ...leftoverBlocks(input),
  ];

  const pages: ChapterPage[] = [
    ...modules.map((node) => modulePage(input, node)),
    ...interfaces.map((node) => interfacePage(input, node)),
    ...schemas.map((node) => schemaPage(input, node)),
    ...decisions.map((node) => decisionPage(input, node)),
    ...findings.map((node) => findingPage(input, node)),
    ...assumptions.map((node) => assumptionPage(input, node)),
  ];

  const counted = [
    countOf(modules.length, "module", "modules"),
    countOf(interfaces.length, "interface", "interfaces"),
    countOf(schemas.length, "data schema", "data schemas"),
  ].join(", ");

  return { summary: `${counted}.`, blocks, pages };
}

export const designChapter: ChapterRule = {
  ordinal: 6,
  slug: "06-design",
  title: "System Designs",
  assemble,
};
