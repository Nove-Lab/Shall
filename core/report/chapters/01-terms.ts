import { compare } from "../../graph/order.js";
import type { SpecNode } from "../../graph/index.js";
import type { Badge, Block, Cell, Fact, Inline, ReportInput } from "../model.js";
import { registrationOf } from "../vocabulary.js";
import type { AssembledChapter, ChapterPage, ChapterRule } from "./rule.js";

/**
 * CHAPTER 1 — the words the other six chapters are written in.
 *
 * TWO TABLES AND NO LEFTOVERS. The domain band holds exactly two types and this
 * chapter tables both of them whole, in id order, so no walk can drop a node: a
 * term nothing mentions and an entity nothing denotes stand in their table like
 * the rest, with an em dash where their edges would be. That is why the chapter
 * has no trailing "nodes nothing reached" table the way the walked chapters do.
 *
 * THE TABLES CARRY NO PROSE. A row is identity, the edges the type has, and the
 * computed status — the fields every node of the type HAS. What a term MEANS is
 * its own body, and a body is never stacked down this page: every Term and every
 * DomainEntity gets a page of its own under `nodes/`, which this chapter owns
 * and assembles, and the row's id cell is the way in.
 *
 * A DECISION IS REACHED FROM WHAT IT REVISED. Decisions are tabled nowhere, so
 * the only way to one is the node it lands on: every page here carries a
 * "Decisions" line, read off the INCOMING `AFFECTS`. The grammar lets a decision
 * affect a Term and a DomainEntity and lets neither of them write a constraint
 * or an assumption, so this chapter's pages gain that one line and no other —
 * and it stands even when empty, which is how a reader learns nothing revised
 * the word.
 */

const TERM = "Term";
const DOMAIN_ENTITY = "DomainEntity";
const DENOTES = "DENOTES";
const MENTIONS = "MENTIONS";
const RELATES_TO = "RELATES_TO";
const AFFECTS = "AFFECTS";

/** What an empty relation or a statusless node prints — a held column, not a blank. */
const NOTHING: Cell = [{ kind: "text", text: "—" }];

function nodesOf(input: ReportInput, type: string): SpecNode[] {
  return input.graph.nodes
    .filter((node) => node.type === type)
    .sort((left, right) => compare(left.id, right.id));
}

function outgoingIds(input: ReportInput, id: string, type: string): string[] {
  return (input.context.outgoing.get(id) ?? [])
    .filter((edge) => edge.type === type)
    .map((edge) => edge.toId);
}

function incomingIds(input: ReportInput, id: string, type: string): string[] {
  return (input.context.incoming.get(id) ?? [])
    .filter((edge) => edge.type === type)
    .map((edge) => edge.fromId);
}

/**
 * The far ends of one relation, deduplicated and in id order — the dedup is what
 * "Related to" needs, since `RELATES_TO` is read in both directions and a pair
 * that wrote the line at both ends is still one neighbour.
 */
function neighbours(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort(compare);
}

/**
 * A node at the far end, as a link — or, for an id no file answers to, the raw
 * id said as text. A dangling edge is a hole somebody still expects to be
 * filled, and a link at nothing would hide it behind a name this report would
 * have to invent.
 *
 * `full` picks which of the two names the far node offers: a page has room for
 * the whole name, a table column has room for the short one.
 */
function referenceOf(input: ReportInput, id: string, full: boolean): Inline {
  const node = input.context.nodes.get(id);
  if (node === undefined) {
    return { kind: "text", text: id };
  }
  return { kind: "link", to: { node: id }, text: full ? node.name : node.shortName };
}

/**
 * The renderer concatenates inlines with nothing between them, so the comma is
 * this chapter's to emit.
 */
function joined(references: readonly Inline[]): Inline[] {
  const inlines: Inline[] = [];
  for (const reference of references) {
    if (inlines.length > 0) {
      inlines.push({ kind: "text", text: ", " });
    }
    inlines.push(reference);
  }
  return inlines;
}

/** One fact line on a page: the far ends by their full names, or nothing at all. */
function factOf(input: ReportInput, label: string, ids: readonly string[]): Fact {
  return {
    label,
    inlines: joined(neighbours(ids).map((id) => referenceOf(input, id, true))),
  };
}

/**
 * The decisions that landed on this node — the sources of the incoming
 * `AFFECTS`, which is the only road to a decision now that none is tabled. Both
 * of this chapter's types may be affected, so both get the line, empty or not.
 */
function decisionsFact(input: ReportInput, id: string): Fact {
  return factOf(input, "Decisions", incomingIds(input, id, AFFECTS));
}

/** One relation column: the far ends by their short names, or an em dash. */
function relationCell(input: ReportInput, ids: readonly string[]): Cell {
  const inlines = joined(neighbours(ids).map((id) => referenceOf(input, id, false)));
  return inlines.length === 0 ? NOTHING : inlines;
}

/**
 * Neither type carries a second axis — no closure, no satisfaction, no work — so
 * registration is the whole of a badge here. A node whose file would not read
 * has no status at all; a proposed deletion is said either way, being a fact of
 * the node's own frontmatter rather than of the review.
 */
function badgesOf(input: ReportInput, node: SpecNode): Badge[] {
  const badges: Badge[] = [];
  const status = input.statuses.get(node.id);
  if (status !== undefined) {
    badges.push(registrationOf(status));
  }
  if (node.deletionProposed !== undefined) {
    badges.push({ label: "Deletion proposed", tone: "neutral" });
  }
  return badges;
}

function statusCell(input: ReportInput, node: SpecNode): Cell {
  const inlines: Inline[] = [];
  for (const badge of badgesOf(input, node)) {
    if (inlines.length > 0) {
      inlines.push({ kind: "text", text: " " });
    }
    inlines.push({ kind: "badge", badge });
  }
  return inlines.length === 0 ? NOTHING : inlines;
}

/** The three columns every row of this chapter opens with. */
function identityCells(node: SpecNode): Cell[] {
  return [
    [{ kind: "link", to: { node: node.id }, text: node.id }],
    [{ kind: "text", text: node.shortName }],
    [{ kind: "text", text: node.name }],
  ];
}

function termRow(input: ReportInput, term: SpecNode): Cell[] {
  return [
    ...identityCells(term),
    relationCell(input, outgoingIds(input, term.id, DENOTES)),
    statusCell(input, term),
  ];
}

function entityRow(input: ReportInput, entity: SpecNode): Cell[] {
  return [
    ...identityCells(entity),
    relationCell(input, incomingIds(input, entity.id, DENOTES)),
    relationCell(input, [
      ...outgoingIds(input, entity.id, RELATES_TO),
      ...incomingIds(input, entity.id, RELATES_TO),
    ]),
    statusCell(input, entity),
  ];
}

/** A node's own page: its block whole, facts laid out and body verbatim. */
function pageOf(input: ReportInput, node: SpecNode, facts: Fact[]): ChapterPage {
  return {
    id: node.id,
    title: node.name,
    blocks: [
      {
        kind: "node",
        id: node.id,
        type: node.type,
        name: node.name,
        shortName: node.shortName,
        depth: 0,
        badges: badgesOf(input, node),
        facts,
        body: node.body,
      },
    ],
  };
}

function summaryOf(terms: number, entities: number): string {
  const term = terms === 1 ? "term" : "terms";
  const entity = entities === 1 ? "domain entity" : "domain entities";
  return `${terms} ${term}, ${entities} ${entity}.`;
}

function assemble(input: ReportInput): AssembledChapter {
  const terms = nodesOf(input, TERM);
  const entities = nodesOf(input, DOMAIN_ENTITY);

  const blocks: Block[] = [
    { kind: "heading", level: 2, text: "Terms", anchor: "terms", inToc: true },
    {
      kind: "rows",
      caption: null,
      header: ["ID", "Short name", "Name", "Denotes", "Status"],
      rows: terms.map((term) => termRow(input, term)),
    },
    {
      kind: "heading",
      level: 2,
      text: "Domain entities",
      anchor: "domain-entities",
      inToc: true,
    },
    {
      kind: "rows",
      caption: null,
      header: ["ID", "Short name", "Name", "Denoted by", "Related to", "Status"],
      rows: entities.map((entity) => entityRow(input, entity)),
    },
  ];

  const pages: ChapterPage[] = [
    ...terms.map((term) =>
      pageOf(input, term, [
        factOf(input, "Denotes", outgoingIds(input, term.id, DENOTES)),
        factOf(input, "Mentioned in", incomingIds(input, term.id, MENTIONS)),
        decisionsFact(input, term.id),
      ]),
    ),
    ...entities.map((entity) =>
      pageOf(input, entity, [
        factOf(input, "Denoted by", incomingIds(input, entity.id, DENOTES)),
        factOf(input, "Related to", [
          ...outgoingIds(input, entity.id, RELATES_TO),
          ...incomingIds(input, entity.id, RELATES_TO),
        ]),
        decisionsFact(input, entity.id),
      ]),
    ),
  ];

  return { summary: summaryOf(terms.length, entities.length), blocks, pages };
}

export const termsChapter: ChapterRule = {
  ordinal: 1,
  slug: "01-terms",
  title: "Terms & Domain Entities",
  assemble,
};
