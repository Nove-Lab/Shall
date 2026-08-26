import type { SpecNode } from "../../graph/index.js";
import { compare } from "../../graph/order.js";
import type { Badge, Block, Cell, Fact, Inline, ReportInput } from "../model.js";
import { registrationOf } from "../vocabulary.js";
import type { AssembledChapter, ChapterPage, ChapterRule } from "./rule.js";

/**
 * CHAPTER 2 — the ends the project is for, drawn as the decomposition the
 * authors wrote.
 *
 * REFINES IS WRITTEN PARENT → CHILD, and the walk here is only correct because
 * of it: the canon's row is `Goal —REFINES→ Goal` (§3-1 #1), the authoring
 * skill names the target "the sub-goal", `work-item-state.ts` climbs to a
 * parent by an INCOMING REFINES, and `board.test.ts` says it outright. So an
 * outgoing REFINES points DOWN, a root is a goal nothing refines into, and
 * anything else here would silently invert the tree.
 *
 * THE CHAPTER IS ONE TABLE, THE TREE IS ITS ORDER. Rows are goals, columns are
 * what every goal HAS — id, name, the goal above it, the actors pursuing it,
 * its computed status — and the shape of the decomposition survives as the
 * order of the rows plus a mechanical indent in the Goal cell. Nothing a goal
 * SAYS is on this page: a body is its own page's, one link away.
 *
 * THE CROSS-CUTTING THREE HANG OFF THE GOAL. A constraint, an assumption and a
 * decision are tabled in no chapter at all, so a goal's page is one of the ways
 * to them: the two it writes (`HAS_CONSTRAINT`, `ASSUMES`) and the one written
 * at it (`AFFECTS`, read backwards). The grammar permits all three of a Goal, so
 * all three lines stand — an empty one saying nobody wrote it, which is a thing
 * worth reading.
 *
 * NOTHING DISAPPEARS. A refinement loop has no root, so neither of its goals is
 * reached from one — and a goal reached from nowhere is still a goal the
 * project wrote. Whatever the depth-first walk did not visit follows in a
 * second table with the same columns, and every living goal gets a page
 * whether the tree found it or not.
 */

const GOAL = "Goal";
const REFINES = "REFINES";
const PURSUED_BY = "PURSUED_BY";
const PERFORMS = "PERFORMS";
const HAS_CONSTRAINT = "HAS_CONSTRAINT";
const ASSUMES = "ASSUMES";
const AFFECTS = "AFFECTS";

/** The indent is a hint, not a ruler: past three ranks it stops growing. */
const MAX_INDENT = 3;

/** One rank of the tree, spelled in the Goal cell. */
const RANK = "· ";

/** What an empty relation cell says, so no column is ever blank. */
const NOTHING = "—";

const HEADER = ["ID", "Goal", "Refines", "Pursued by", "Status"];

/** The ids at the far end of one relation out of this node, in id order. */
function targetsOf(input: ReportInput, id: string, edgeType: string): string[] {
  return (input.context.outgoing.get(id) ?? [])
    .filter((edge) => edge.type === edgeType)
    .map((edge) => edge.toId)
    .sort(compare);
}

/**
 * The goals this one refines into — the sub-goals, in id order. A REFINES line
 * at something that is not a living goal is not a branch of the tree, so the
 * walk does not descend it; the page's "Refined by" fact still says it.
 */
function childrenOf(input: ReportInput, id: string): SpecNode[] {
  const children: SpecNode[] = [];
  for (const childId of targetsOf(input, id, REFINES)) {
    const child = input.context.nodes.get(childId);
    if (child !== undefined && child.type === GOAL) {
      children.push(child);
    }
  }
  return children;
}

/**
 * The goals refining INTO this one, in id order — the incoming direction, and
 * the whole reason the header comment above exists. A goal two parents refine
 * into names both: the tree can only draw it under one of them, and a column
 * that said only that one would hide the second line the authors wrote.
 */
function parentsOf(input: ReportInput, id: string): SpecNode[] {
  return (input.context.incoming.get(id) ?? [])
    .filter((edge) => edge.type === REFINES)
    .map((edge) => input.context.nodes.get(edge.fromId))
    .filter((node): node is SpecNode => node !== undefined && node.type === GOAL)
    .sort((a, b) => compare(a.id, b.id));
}

/** A goal no other goal decomposes into — the top of a tree. */
function isRoot(input: ReportInput, node: SpecNode): boolean {
  return parentsOf(input, node.id).length === 0;
}

/**
 * A link when the graph holds the target, the raw id said plainly when it does
 * not — a dangling relation is a hole to read, never a door to walk through.
 * The page says a target's NAME; a table cell says its SHORT name, because a
 * column has to stay narrow enough to scan.
 */
function referenceTo(input: ReportInput, id: string, short: boolean): Inline {
  const node = input.context.nodes.get(id);
  return node === undefined
    ? { kind: "text", text: id }
    : { kind: "link", to: { node: id }, text: short ? node.shortName : node.name };
}

/** Several references in one cell, or the dash that says there are none. */
function cellOf(input: ReportInput, ids: readonly string[]): Cell {
  if (ids.length === 0) {
    return [{ kind: "text", text: NOTHING }];
  }
  const inlines: Inline[] = [];
  for (const id of ids) {
    if (inlines.length > 0) {
      inlines.push({ kind: "text", text: ", " });
    }
    inlines.push(referenceTo(input, id, true));
  }
  return inlines;
}

/**
 * A Goal wears the registration axis alone — it is no criteria carrier, no
 * work item and no criterion, so there is no second word to say about it. A
 * node the review has no status for (its file would not read) gets no
 * registration badge; the deletion proposal is the node's own line and stands
 * whatever the review says.
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
  const badges = badgesOf(input, node);
  if (badges.length === 0) {
    return [{ kind: "text", text: NOTHING }];
  }
  const inlines: Inline[] = [];
  for (const badge of badges) {
    if (inlines.length > 0) {
      inlines.push({ kind: "text", text: " " });
    }
    inlines.push({ kind: "badge", badge });
  }
  return inlines;
}

/** One row: identity, the tree's indent, the two relations, the status. */
function rowOf(input: ReportInput, node: SpecNode, depth: number): Cell[] {
  return [
    [{ kind: "link", to: { node: node.id }, text: node.id }],
    [
      { kind: "text", text: RANK.repeat(Math.min(depth, MAX_INDENT)) },
      { kind: "text", text: node.name },
    ],
    cellOf(input, parentsOf(input, node.id).map((parent) => parent.id)),
    cellOf(input, targetsOf(input, node.id, PURSUED_BY)),
    statusCell(input, node),
  ];
}

function tableOf(rows: Cell[][]): Block {
  return { kind: "rows", caption: null, header: [...HEADER], rows };
}

function factOf(input: ReportInput, id: string, label: string, edgeType: string): Fact {
  const inlines: Inline[] = [];
  for (const target of targetsOf(input, id, edgeType)) {
    if (inlines.length > 0) {
      inlines.push({ kind: "text", text: ", " });
    }
    inlines.push(referenceTo(input, target, false));
  }
  return { label, inlines };
}

/**
 * The decisions that revised this goal — the far ends of the INCOMING
 * `AFFECTS`, a decision being written at the decision and never at the goal. It
 * is the only way to a decision, none of them being tabled in any chapter, so
 * the line stands whether or not one was ever taken.
 */
function decisionsFact(input: ReportInput, id: string): Fact {
  const inlines: Inline[] = [];
  const sources = (input.context.incoming.get(id) ?? [])
    .filter((edge) => edge.type === AFFECTS)
    .map((edge) => edge.fromId)
    .sort(compare);
  for (const source of sources) {
    if (inlines.length > 0) {
      inlines.push({ kind: "text", text: ", " });
    }
    inlines.push(referenceTo(input, source, false));
  }
  return { label: "Decisions", inlines };
}

/** The goal above this one, said in full on its own page. */
function parentFact(input: ReportInput, id: string): Fact {
  const inlines: Inline[] = [];
  for (const parent of parentsOf(input, id)) {
    if (inlines.length > 0) {
      inlines.push({ kind: "text", text: ", " });
    }
    inlines.push({ kind: "link", to: { node: parent.id }, text: parent.name });
  }
  return { label: "Refines", inlines };
}

/**
 * The use cases this goal reaches through the actors pursuing it — two hops,
 * deduplicated, each said with the actor it was reached through so a reader
 * meeting the same use case under two goals knows which way it came.
 *
 * The first actor in id order is the one named: two actors performing one use
 * case is one line, not two.
 */
function useCasesFact(input: ReportInput, id: string): Fact {
  const inlines: Inline[] = [];
  const seen = new Set<string>();
  for (const actorId of targetsOf(input, id, PURSUED_BY)) {
    const actor = input.context.nodes.get(actorId);
    // An actor no file answers to performs nothing the graph can name.
    if (actor === undefined) {
      continue;
    }
    for (const useCaseId of targetsOf(input, actorId, PERFORMS)) {
      if (seen.has(useCaseId)) {
        continue;
      }
      seen.add(useCaseId);
      if (inlines.length > 0) {
        inlines.push({ kind: "text", text: ", " });
      }
      inlines.push(referenceTo(input, useCaseId, false));
      inlines.push({ kind: "text", text: ` (via ${actor.name})` });
    }
  }
  return { label: "Use cases, through its actors", inlines };
}

/** One goal's own page: its identity, its lines out, and its body verbatim. */
function pageOf(input: ReportInput, node: SpecNode): ChapterPage {
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
        facts: [
          parentFact(input, node.id),
          factOf(input, node.id, "Refined by", REFINES),
          factOf(input, node.id, "Pursued by", PURSUED_BY),
          useCasesFact(input, node.id),
          factOf(input, node.id, "Constraints", HAS_CONSTRAINT),
          factOf(input, node.id, "Assumptions", ASSUMES),
          decisionsFact(input, node.id),
        ],
        body: node.body,
      },
    ],
  };
}

function goalsOf(input: ReportInput): SpecNode[] {
  return input.graph.nodes
    .filter((node) => node.type === GOAL)
    .sort((a, b) => compare(a.id, b.id));
}

/**
 * The visited set is the cycle guard AND the answer to a goal with two
 * parents: it is placed once, under the first parent that reaches it, because
 * a row repeated is a row a reader has to notice is the same one.
 */
function walk(
  input: ReportInput,
  node: SpecNode,
  depth: number,
  visited: Set<string>,
  rows: Cell[][],
): void {
  if (visited.has(node.id)) {
    return;
  }
  visited.add(node.id);
  rows.push(rowOf(input, node, depth));
  for (const child of childrenOf(input, node.id)) {
    walk(input, child, depth + 1, visited, rows);
  }
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function assemble(input: ReportInput): AssembledChapter {
  const goals = goalsOf(input);
  const roots = goals.filter((node) => isRoot(input, node));
  const visited = new Set<string>();
  const rows: Cell[][] = [];
  for (const root of roots) {
    walk(input, root, 0, visited, rows);
  }

  const blocks: Block[] = [
    { kind: "heading", level: 2, text: "The goal tree", anchor: "goal-tree", inToc: true },
    tableOf(rows),
  ];

  const outside = goals.filter((node) => !visited.has(node.id));
  if (outside.length > 0) {
    blocks.push({
      kind: "heading",
      level: 2,
      text: "Goals outside the tree",
      anchor: null,
      inToc: false,
    });
    blocks.push(tableOf(outside.map((node) => rowOf(input, node, 0))));
  }

  return {
    summary: `${plural(goals.length, "goal")}, ${roots.length} of them root ${
      roots.length === 1 ? "goal" : "goals"
    }.`,
    blocks,
    pages: goals.map((node) => pageOf(input, node)),
  };
}

export const goalsChapter: ChapterRule = {
  ordinal: 2,
  slug: "02-goals",
  title: "Goals",
  assemble,
};
