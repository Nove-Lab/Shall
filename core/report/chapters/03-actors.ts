import type { ReviewStatus } from "../../arith/index.js";
import type { SpecNode } from "../../graph/index.js";
import { compare } from "../../graph/order.js";
import type { Badge, Block, Cell, Fact, Inline, ReportInput } from "../model.js";
import { firstLineOf } from "../sections.js";
import { carrierOf, criterionOf, registrationOf } from "../vocabulary.js";
import type { AssembledChapter, ChapterPage, ChapterRule } from "./rule.js";

/**
 * Chapter 3 — who uses the system, and what they do with it.
 *
 * THREE TABLES, AND EVERY NODE IN ONE OF THEM. Actors, use cases and scenarios
 * each get a table of the fields their type HAS — identity, the edges either
 * way, the computed status — so the chapter is read down a column ("which use
 * case has no scenario", "which actor performs nothing") rather than by
 * scrolling past bodies. Nothing is left out and nothing is written twice: a
 * use case two actors perform is one row naming both of them, which is what
 * made the old "described under" pointer and the two leftover sections
 * unnecessary.
 *
 * THE BODIES LEFT. Each node's own page — `nodes/<id>.html`, assembled here —
 * carries its identity, its badges, its edge facts spelled out with the far
 * end's full name, and the author's body verbatim. The table's ID cell is the
 * way in, and the far end's SHORT name is what a relation cell prints, because
 * a column of full names is a column nobody can scan.
 *
 * AND THE CROSS-CUTTING THREE CLOSE EVERY PAGE. Constraints, assumptions and
 * decisions are tabled in no chapter, so the page of whatever they hang off is
 * the way to them: each of the three types here writes `HAS_CONSTRAINT` and
 * `ASSUMES` and can be the target of `AFFECTS`, so each page ends with those
 * three lines — standing even when empty, an absence being an answer.
 *
 * THE SCENARIO GROUPS ARE THE AUTHOR'S OWN WORD, read off the body's
 * "## Scenario Type" heading — the one look inside a body this chapter takes,
 * and a GROUPING rather than a column, so a body that says nothing costs the
 * table no cell. That heading is an authoring convention and not a schema, so a
 * word outside the three, and a body that never said, fall together into the
 * last group rather than being guessed at.
 *
 * A DANGLING ID IS SAID AS ITSELF. An edge naming a node no file answers to
 * gets the raw id as plain text — never a link, because a link at a page
 * nobody emits is a dead end the reader cannot tell from a live one.
 */

const ACTOR = "Actor";
const USE_CASE = "UseCase";
const SCENARIO = "Scenario";
const PERFORMS = "PERFORMS";
const DETAILS = "DETAILS";
const HAS_CRITERION = "HAS_CRITERION";
const DERIVES_RESPONSIBILITY = "DERIVES_RESPONSIBILITY";
const HAS_CONSTRAINT = "HAS_CONSTRAINT";
const ASSUMES = "ASSUMES";
const AFFECTS = "AFFECTS";

/** What an empty cell says — one dash, so a column never reads as missing. */
const NONE = "—";

const ACTOR_HEADER = ["ID", "Short name", "Name", "Performs", "Status"];
const USE_CASE_HEADER = [
  "ID",
  "Short name",
  "Name",
  "Performed by",
  "Scenarios",
  "Status",
];
const SCENARIO_HEADER = ["ID", "Name", "Details of", "Criteria", "Status"];
const CRITERION_HEADER = ["ID", "Name", "Status"];

/** The scenario groups, in the order they are printed. */
const SCENARIO_GROUPS = [
  { word: "main", heading: "Main scenarios" },
  { word: "alternative", heading: "Alternative scenarios" },
  { word: "exception", heading: "Exception scenarios" },
  { word: "other", heading: "Other scenarios" },
] as const;

function text(value: string): Inline {
  return { kind: "text", text: value };
}

function nodesOf(input: ReportInput, type: string): SpecNode[] {
  return input.graph.nodes
    .filter((node) => node.type === type)
    .sort((left, right) => compare(left.id, right.id));
}

/**
 * The far ends of this node's outgoing relations of one type, in id order.
 *
 * Deduplicated because a use case named twice by one actor is one use case, and
 * a column that printed it twice would be counting the file rather than the
 * relation.
 */
function targetsOf(input: ReportInput, id: string, type: string): string[] {
  const ids = new Set<string>();
  for (const edge of input.context.outgoing.get(id) ?? []) {
    if (edge.type === type) {
      ids.add(edge.toId);
    }
  }
  return [...ids].sort(compare);
}

/** The near ends of this node's incoming relations of one type, in id order. */
function sourcesOf(input: ReportInput, id: string, type: string): string[] {
  const ids = new Set<string>();
  for (const edge of input.context.incoming.get(id) ?? []) {
    if (edge.type === type) {
      ids.add(edge.fromId);
    }
  }
  return [...ids].sort(compare);
}

/**
 * One relation as a table cell: links at the nodes the graph holds, ids the
 * graph does not as plain text, and a dash where the relation is empty. The
 * links say the far end's SHORT name, which is what keeps a column of them
 * narrow enough to scan.
 */
function relationCell(input: ReportInput, ids: readonly string[]): Cell {
  const inlines = relationInlines(input, ids, shortNameOf);
  return inlines.length === 0 ? [text(NONE)] : inlines;
}

/**
 * The same links for a fact on a page: the far end's FULL name, there being
 * room for it, and no dash — the renderer prints "none" for an empty fact.
 */
function relationInlines(
  input: ReportInput,
  ids: readonly string[],
  naming: (node: SpecNode) => string,
): Inline[] {
  const inlines: Inline[] = [];
  for (const id of ids) {
    if (inlines.length > 0) {
      inlines.push(text(", "));
    }
    const node = input.context.nodes.get(id);
    inlines.push(
      node === undefined
        ? text(id)
        : { kind: "link", to: { node: id }, text: naming(node) },
    );
  }
  return inlines;
}

function shortNameOf(node: SpecNode): string {
  return node.shortName;
}

function fullNameOf(node: SpecNode): string {
  return node.name;
}

/**
 * Registration first, then the type's second axis where it has one, then the
 * proposal to delete if one stands. A node the review has no status for is a
 * file that would not read, and then it wears no badge rather than a guessed
 * one — but a standing deletion proposal is the node's own field and is said
 * either way.
 */
function badgesOf(
  node: SpecNode,
  status: ReviewStatus | undefined,
  axisOf: ((status: ReviewStatus) => Badge | null) | null,
): Badge[] {
  const badges: Badge[] = [];
  if (status !== undefined) {
    badges.push(registrationOf(status));
    const axis = axisOf === null ? null : axisOf(status);
    if (axis !== null) {
      badges.push(axis);
    }
  }
  if (node.deletionProposed !== undefined) {
    badges.push({ label: "Deletion proposed", tone: "neutral" });
  }
  return badges;
}

/** Badges spaced apart, or a dash where the node wears none. */
function badgeCell(badges: readonly Badge[]): Cell {
  if (badges.length === 0) {
    return [text(NONE)];
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

/** The status of a row's own node: registration, its axis, any proposal. */
function statusCell(
  input: ReportInput,
  node: SpecNode,
  axisOf: ((status: ReviewStatus) => Badge | null) | null,
): Cell {
  return badgeCell(badgesOf(node, input.statuses.get(node.id), axisOf));
}

/**
 * The status of a criterion in a scenario's own table — its satisfaction and
 * nothing else. Whether the criterion has been APPROVED is a question about the
 * criterion, and it is asked and answered where the criterion lives; here the
 * scenario is asking one thing only, whether the criterion is met.
 */
function criterionStatusCell(input: ReportInput, node: SpecNode): Cell {
  const status = input.statuses.get(node.id);
  const badges: Badge[] = [];
  const met = status === undefined ? null : criterionOf(status);
  if (met !== null) {
    badges.push(met);
  }
  if (node.deletionProposed !== undefined) {
    badges.push({ label: "Deletion proposed", tone: "neutral" });
  }
  return badgeCell(badges);
}

/** The cell that opens every row: the id, linking at the node's own page. */
function idCell(id: string): Cell {
  return [{ kind: "link", to: { node: id }, text: id }];
}

function rowsBlock(header: string[], rows: Cell[][], caption: string | null): Block {
  return { kind: "rows", caption, header, rows };
}

function nodeBlock(
  input: ReportInput,
  node: SpecNode,
  facts: Fact[],
  axisOf: ((status: ReviewStatus) => Badge | null) | null,
): Block {
  return {
    kind: "node",
    id: node.id,
    type: node.type,
    name: node.name,
    shortName: node.shortName,
    depth: 0,
    badges: badgesOf(node, input.statuses.get(node.id), axisOf),
    facts,
    body: node.body,
  };
}

function factOf(
  input: ReportInput,
  label: string,
  ids: readonly string[],
): Fact {
  return { label, inlines: relationInlines(input, ids, fullNameOf) };
}

/**
 * The three lines every page in this chapter closes with, in one order.
 *
 * A CONSTRAINT, AN ASSUMPTION AND A DECISION ARE TABLED NOWHERE. They are read
 * from the node they hang off, which makes these lines the only road to them —
 * so they stand on every page, empty or not, and an empty one is the answer
 * that nobody wrote one. The grammar permits all three of an Actor, a UseCase
 * and a Scenario alike (`HAS_CONSTRAINT` and `ASSUMES` out of each, `AFFECTS`
 * into each), which is why one helper serves all three types here.
 */
function crossCuttingFacts(input: ReportInput, id: string): Fact[] {
  return [
    factOf(input, "Constraints", targetsOf(input, id, HAS_CONSTRAINT)),
    factOf(input, "Assumptions", targetsOf(input, id, ASSUMES)),
    factOf(input, "Decisions", sourcesOf(input, id, AFFECTS)),
  ];
}

/**
 * The author's own word for what kind of scenario this is. Absent, or outside
 * the three the specification names, is the last group: the heading is a
 * convention, so it degrades and never guesses.
 */
function groupOf(node: SpecNode): string {
  const said = firstLineOf(node.body, "Scenario Type");
  const word = said === null ? "" : said.toLowerCase();
  return word === "main" || word === "alternative" || word === "exception"
    ? word
    : "other";
}

/**
 * How many of a scenario's criteria are met, out of how many it writes — the
 * closure word counted, never recomputed here. A scenario that writes none says
 * so with a dash rather than "0 of 0", which reads as a failure it is not.
 */
function criteriaCell(input: ReportInput, scenarioId: string): Cell {
  const criteria = targetsOf(input, scenarioId, HAS_CRITERION);
  if (criteria.length === 0) {
    return [text(NONE)];
  }
  const met = criteria.filter(
    (id) => input.statuses.get(id)?.closure === "closed",
  ).length;
  return [text(`${met} of ${criteria.length} met`)];
}

function actorRow(input: ReportInput, node: SpecNode): Cell[] {
  return [
    idCell(node.id),
    [text(node.shortName)],
    [text(node.name)],
    relationCell(input, targetsOf(input, node.id, PERFORMS)),
    statusCell(input, node, null),
  ];
}

function useCaseRow(input: ReportInput, node: SpecNode): Cell[] {
  return [
    idCell(node.id),
    [text(node.shortName)],
    [text(node.name)],
    relationCell(input, sourcesOf(input, node.id, PERFORMS)),
    [text(String(targetsOf(input, node.id, DETAILS).length))],
    statusCell(input, node, null),
  ];
}

function scenarioRow(input: ReportInput, node: SpecNode): Cell[] {
  return [
    idCell(node.id),
    [text(node.name)],
    relationCell(input, sourcesOf(input, node.id, DETAILS)),
    criteriaCell(input, node.id),
    statusCell(input, node, carrierOf),
  ];
}

/**
 * One scenario's acceptance criteria, on its own page. The criteria themselves
 * are chapter 5's pages — here they are rows of links, their satisfaction axis,
 * and nothing else. A dangling id keeps its row so the count of edges and the
 * count of rows agree.
 */
function criteriaRows(input: ReportInput, scenarioId: string): Cell[][] {
  return targetsOf(input, scenarioId, HAS_CRITERION).map((id): Cell[] => {
    const node = input.context.nodes.get(id);
    if (node === undefined) {
      return [[text(id)], [text(NONE)], [text(NONE)]];
    }
    return [idCell(id), [text(node.name)], criterionStatusCell(input, node)];
  });
}

function pagesOf(
  input: ReportInput,
  actors: readonly SpecNode[],
  useCases: readonly SpecNode[],
  scenarios: readonly SpecNode[],
): ChapterPage[] {
  const pages: ChapterPage[] = [];
  for (const actor of actors) {
    pages.push({
      id: actor.id,
      title: actor.name,
      blocks: [
        nodeBlock(
          input,
          actor,
          [
            factOf(input, "Performs", targetsOf(input, actor.id, PERFORMS)),
            ...crossCuttingFacts(input, actor.id),
          ],
          null,
        ),
      ],
    });
  }
  for (const useCase of useCases) {
    pages.push({
      id: useCase.id,
      title: useCase.name,
      blocks: [
        nodeBlock(
          input,
          useCase,
          [
            factOf(input, "Performed by", sourcesOf(input, useCase.id, PERFORMS)),
            factOf(input, "Details", targetsOf(input, useCase.id, DETAILS)),
            ...crossCuttingFacts(input, useCase.id),
          ],
          null,
        ),
      ],
    });
  }
  for (const scenario of scenarios) {
    pages.push({
      id: scenario.id,
      title: scenario.name,
      blocks: [
        nodeBlock(
          input,
          scenario,
          [
            factOf(input, "Details of", sourcesOf(input, scenario.id, DETAILS)),
            factOf(
              input,
              "Derives",
              targetsOf(input, scenario.id, DERIVES_RESPONSIBILITY),
            ),
            ...crossCuttingFacts(input, scenario.id),
          ],
          carrierOf,
        ),
        // The table stands whether or not the scenario wrote a criterion: an
        // empty one says "none written" where a missing one would leave the
        // reader wondering whether the question was asked.
        rowsBlock(
          CRITERION_HEADER,
          criteriaRows(input, scenario.id),
          "Acceptance criteria",
        ),
      ],
    });
  }
  return pages;
}

function summaryOf(actors: number, useCases: number, scenarios: number): string {
  return [
    `${actors} ${actors === 1 ? "actor" : "actors"}`,
    `${useCases} ${useCases === 1 ? "use case" : "use cases"}`,
    `${scenarios} ${scenarios === 1 ? "scenario" : "scenarios"}.`,
  ].join(", ");
}

function assemble(input: ReportInput): AssembledChapter {
  const actors = nodesOf(input, ACTOR);
  const useCases = nodesOf(input, USE_CASE);
  const scenarios = nodesOf(input, SCENARIO);

  const blocks: Block[] = [
    { kind: "heading", level: 2, text: "Actors", anchor: "actors", inToc: true },
    rowsBlock(ACTOR_HEADER, actors.map((node) => actorRow(input, node)), null),
    { kind: "heading", level: 2, text: "Use cases", anchor: "use-cases", inToc: true },
    rowsBlock(USE_CASE_HEADER, useCases.map((node) => useCaseRow(input, node)), null),
    { kind: "heading", level: 2, text: "Scenarios", anchor: "scenarios", inToc: true },
  ];
  for (const group of SCENARIO_GROUPS) {
    const held = scenarios.filter((node) => groupOf(node) === group.word);
    if (held.length === 0) {
      continue;
    }
    blocks.push({
      kind: "heading",
      level: 3,
      text: group.heading,
      anchor: null,
      inToc: false,
    });
    blocks.push(
      rowsBlock(SCENARIO_HEADER, held.map((node) => scenarioRow(input, node)), null),
    );
  }

  return {
    summary: summaryOf(actors.length, useCases.length, scenarios.length),
    blocks,
    pages: pagesOf(input, actors, useCases, scenarios),
  };
}

export const actorsChapter: ChapterRule = {
  ordinal: 3,
  slug: "03-actors",
  title: "Actors & Use Cases",
  assemble,
};
