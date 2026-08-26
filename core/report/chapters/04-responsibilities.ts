import type { ReviewStatus } from "../../arith/index.js";
import type { SpecNode } from "../../graph/index.js";
import { compare } from "../../graph/order.js";
import type { Badge, Block, Cell, Fact, Inline, ReportInput } from "../model.js";
import { registrationOf } from "../vocabulary.js";
import type { AssembledChapter, ChapterPage, ChapterRule } from "./rule.js";

/**
 * Chapter 4 — what the system is answerable for.
 *
 * ONE TABLE AND NO LEFTOVERS. Every SystemResponsibility the graph holds is a
 * row, so no walk can leave one behind and there is nothing for a closing
 * section to catch. The columns are the fields a responsibility HAS: its
 * identity, the scenarios above it, the modules and requirements below it, and
 * what the review made of it — never a value read out of a body.
 *
 * THE BODIES LIVE ONE LINK AWAY. Each responsibility's page carries its own
 * block — the same three edge lines in full, its body verbatim — so the
 * chapter stays a page a reader can scan and the prose is where they went
 * looking for it. The table's ID cell is the door.
 *
 * THE PAGE IS ALSO THE WAY TO THE CROSS-CUTTING THREE. A constraint, an
 * assumption and a decision are tabled in no chapter, so they are reached from
 * what they hang off: the two a responsibility writes (`HAS_CONSTRAINT`,
 * `ASSUMES`) and the one written at it (`AFFECTS`, read backwards) close every
 * page here. They stay off the table for the same reason the parenthesis below
 * does, and they stand even when empty.
 *
 * THE PAGE STILL SHOWS BOTH SIDES. The use case in the parenthesis after a
 * scenario is what lets a reader who met the responsibility here place it in
 * chapter 3 without following a link — and it is why a scenario detailed by
 * two use cases names both. It stays on the page and out of the table, where
 * a column has to stay narrow enough to read across.
 */

const RESPONSIBILITY = "SystemResponsibility";
const DERIVES_RESPONSIBILITY = "DERIVES_RESPONSIBILITY";
const DETAILS = "DETAILS";
const IS_REALIZED_BY = "IS_REALIZED_BY";
const REQUIRES = "REQUIRES";
const HAS_CONSTRAINT = "HAS_CONSTRAINT";
const ASSUMES = "ASSUMES";
const AFFECTS = "AFFECTS";

/** What a cell says when the walk found nothing — a dash, never a blank. */
const NOTHING = "—";

const HEADER = [
  "ID",
  "Short name",
  "Name",
  "Derived from",
  "Realized by",
  "Requires",
  "Status",
];

function text(value: string): Inline {
  return { kind: "text", text: value };
}

function sourcesOf(input: ReportInput, id: string, type: string): string[] {
  return (input.context.incoming.get(id) ?? [])
    .filter((edge) => edge.type === type)
    .map((edge) => edge.fromId)
    .sort(compare);
}

function targetsOf(input: ReportInput, id: string, type: string): string[] {
  return (input.context.outgoing.get(id) ?? [])
    .filter((edge) => edge.type === type)
    .map((edge) => edge.toId)
    .sort(compare);
}

/**
 * A node the graph holds is a link; an id no file answers to is the id as
 * plain text, because a link to a page nobody emits is a dead end the reader
 * cannot tell from a live one.
 *
 * `named` picks which of the node's two names the link wears: a page has room
 * for the full one, a column has room for the short one.
 */
function refOf(input: ReportInput, id: string, named: (node: SpecNode) => string): Inline {
  const node = input.context.nodes.get(id);
  return node === undefined ? text(id) : { kind: "link", to: { node: id }, text: named(node) };
}

function joined(
  input: ReportInput,
  ids: readonly string[],
  named: (node: SpecNode) => string,
): Inline[] {
  const inlines: Inline[] = [];
  for (const id of ids) {
    if (inlines.length > 0) {
      inlines.push(text(", "));
    }
    inlines.push(refOf(input, id, named));
  }
  return inlines;
}

const fullName = (node: SpecNode): string => node.name;
const shortName = (node: SpecNode): string => node.shortName;

/** A relation column: short names, comma separated, a dash where there are none. */
function relationCell(input: ReportInput, ids: readonly string[]): Cell {
  const inlines = joined(input, ids, shortName);
  return inlines.length === 0 ? [text(NOTHING)] : inlines;
}

/**
 * No status is a broken file, and a badge would be a word nobody computed. A
 * responsibility carries no second axis — nothing satisfies it and nothing
 * closes it — so the registration word is the whole of its state.
 */
function badgesOf(node: SpecNode, status: ReviewStatus | undefined): Badge[] {
  const badges: Badge[] = [];
  if (status !== undefined) {
    badges.push(registrationOf(status));
  }
  if (node.deletionProposed !== undefined) {
    badges.push({ label: "Deletion proposed", tone: "neutral" });
  }
  return badges;
}

function statusCell(badges: readonly Badge[]): Cell {
  if (badges.length === 0) {
    return [text(NOTHING)];
  }
  const inlines: Inline[] = [];
  for (const badge of badges) {
    if (inlines.length > 0) {
      inlines.push(text(" "));
    }
    inlines.push({ kind: "badge", badge });
  }
  return inlines;
}

/**
 * The scenarios deriving this responsibility, each with the use cases that
 * detail it. The walk is by id rather than by node, so a scenario the graph
 * has lost still carries whatever use cases still point at it.
 */
function derivedFrom(input: ReportInput, id: string): Fact {
  const inlines: Inline[] = [];
  for (const scenarioId of sourcesOf(input, id, DERIVES_RESPONSIBILITY)) {
    if (inlines.length > 0) {
      inlines.push(text(", "));
    }
    inlines.push(refOf(input, scenarioId, fullName));
    const useCases = sourcesOf(input, scenarioId, DETAILS);
    if (useCases.length > 0) {
      inlines.push(text(" (in "), ...joined(input, useCases, fullName), text(")"));
    }
  }
  return { label: "Derived from", inlines };
}

/**
 * The three lines the page closes with — what the responsibility is bounded by,
 * what it takes for granted, and what has been decided about it.
 *
 * NONE OF THE THREE IS TABLED ANYWHERE, so this page is the way to them: the
 * grammar lets a SystemResponsibility write `HAS_CONSTRAINT` and `ASSUMES` and
 * lets a decision `AFFECTS` it, so all three lines stand — and stand empty
 * where nothing was written, which is how a reader learns the absence rather
 * than wondering whether the question was asked.
 */
function crossCuttingFacts(input: ReportInput, id: string): Fact[] {
  return [
    { label: "Constraints", inlines: joined(input, targetsOf(input, id, HAS_CONSTRAINT), fullName) },
    { label: "Assumptions", inlines: joined(input, targetsOf(input, id, ASSUMES), fullName) },
    { label: "Decisions", inlines: joined(input, sourcesOf(input, id, AFFECTS), fullName) },
  ];
}

function summaryOf(count: number, realized: number): string {
  return `${count} ${count === 1 ? "responsibility" : "responsibilities"}, ${realized} realized by a module.`;
}

function assemble(input: ReportInput): AssembledChapter {
  const responsibilities = input.graph.nodes
    .filter((node) => node.type === RESPONSIBILITY)
    .sort((a, b) => compare(a.id, b.id));

  const rows: Cell[][] = [];
  const pages: ChapterPage[] = [];
  let realized = 0;

  for (const node of responsibilities) {
    const scenarios = sourcesOf(input, node.id, DERIVES_RESPONSIBILITY);
    const modules = targetsOf(input, node.id, IS_REALIZED_BY);
    const requirements = targetsOf(input, node.id, REQUIRES);
    // A line at a module no file answers to realizes nothing, so the count
    // asks the graph and not the edge list.
    if (modules.some((moduleId) => input.context.nodes.has(moduleId))) {
      realized += 1;
    }

    const badges = badgesOf(node, input.statuses.get(node.id));
    rows.push([
      [{ kind: "link", to: { node: node.id }, text: node.id }],
      [text(node.shortName)],
      [text(node.name)],
      relationCell(input, scenarios),
      relationCell(input, modules),
      relationCell(input, requirements),
      statusCell(badges),
    ]);

    pages.push({
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
          badges,
          facts: [
            derivedFrom(input, node.id),
            { label: "Realized by", inlines: joined(input, modules, fullName) },
            { label: "Requires", inlines: joined(input, requirements, fullName) },
            ...crossCuttingFacts(input, node.id),
          ],
          body: node.body,
        },
      ],
    });
  }

  const blocks: Block[] = [{ kind: "rows", caption: null, header: HEADER, rows }];

  return { summary: summaryOf(responsibilities.length, realized), blocks, pages };
}

export const responsibilitiesChapter: ChapterRule = {
  ordinal: 4,
  slug: "04-responsibilities",
  title: "System Responsibilities",
  assemble,
};
