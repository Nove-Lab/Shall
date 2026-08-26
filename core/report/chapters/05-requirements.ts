import type { ReviewStatus } from "../../arith/index.js";
import type { SpecNode } from "../../graph/index.js";
import { compare } from "../../graph/order.js";
import type { Badge, Block, Cell, Fact, Inline, ReportInput } from "../model.js";
import { carrierOf, criterionOf, registrationOf } from "../vocabulary.js";
import type { AssembledChapter, ChapterPage, ChapterRule } from "./rule.js";

/**
 * CHAPTER 5 — WHAT THE SYSTEM MUST DO, AND HOW ANYONE WOULD KNOW.
 *
 * ONE TABLE AND A PAGE PER NODE. The chapter page is the register of
 * requirements: one row per Requirement, carrying only what every node of the
 * type HAS — its identity, the ends of its edges, the words `vocabulary.ts`
 * computes for it. Nothing is read out of a body and nothing of the type that
 * lives in the graph is left off, so the table can be read as the count of what
 * exists rather than as a selection somebody made.
 *
 * THE CRITERIA TABLE IS GONE, AND ITS PAGES ARE NOT. Every criterion was
 * already reached twice from here — the "Criteria" column counts the ones a
 * requirement hangs, and the requirement's own page rows them by id — so a
 * second full table under its own heading walked the same edges again and
 * offered the reader a third door to the same page. The chapter still ASSEMBLES
 * every criterion's page exactly as it did; what it stopped doing is listing
 * them. And with one table left there is no heading either: a "Requirements"
 * heading over the only table of a chapter called Requirements said nothing the
 * page had not already said twice.
 *
 * THE CONSTRAINTS TABLE IS GONE, AND ITS PAGES ARE NOT. A constraint hangs off
 * a Goal, an Actor, a use case, a scenario, a responsibility, a requirement, a
 * criterion or a module, so tabling it under Requirements said it belonged to
 * this chapter, which was never true. The chapter still ASSEMBLES every
 * constraint's page — the atlas gives it no other home — but the page's back
 * link goes to the overview rather than to a chapter that no longer lists it,
 * and the way IN to a constraint is now the "Constraints" line on whatever
 * writes it.
 *
 * WHICH IS THE SAME MOVE THE THREE CROSS-CUTTING TYPES ALL MADE. Constraint,
 * Assumption and Decision are tabled in no chapter now, so every page here
 * ends with the lines its type may write: "Constraints" and "Assumptions" off
 * its own outgoing edges, "Decisions" off the INCOMING `AFFECTS`. Only the
 * lines `EDGE_GRAMMAR` permits are added — a Constraint may assume and may be
 * revised but may not constrain a constraint — and a permitted line stands
 * even when empty, which is how a reader learns nothing constrains, assumes,
 * or revised the node.
 *
 * THE BODIES MOVED OUT, AND THAT IS WHAT THE THREE TYPES WERE ALWAYS ASKING
 * FOR. A criterion hangs under a Requirement and under a Scenario at once, and
 * a constraint under any intent type at all, so neither could be drawn inline
 * without being drawn twice or arbitrarily under one parent. Now every node of
 * all three types has ONE page — `nodes/<id>.html`, the atlas's arithmetic —
 * and the dual parentage is a fact ON that page ("Criterion of: R-0001,
 * SC-0001") rather than a duplication chapter 3 and this one would both claim.
 *
 * NOTHING HERE JUDGES. Every word beside a node is `vocabulary.ts`'s, every
 * list is an edge walk, every number is a count of edges. What the chapter
 * decides is only which edges to follow and in what order to lay them down.
 */

const REQUIREMENT = "Requirement";
const ACCEPTANCE_CRITERION = "AcceptanceCriterion";
const CONSTRAINT = "Constraint";

const REQUIRES = "REQUIRES";
const DEPENDS_ON = "DEPENDS_ON";
const CONFLICTS_WITH = "CONFLICTS_WITH";
const HAS_CONSTRAINT = "HAS_CONSTRAINT";
const HAS_CRITERION = "HAS_CRITERION";
const TARGETS = "TARGETS";
const CLAIMS = "CLAIMS";
const ASSUMES = "ASSUMES";
const AFFECTS = "AFFECTS";

/**
 * THE EMPTY CELL SAYS SO. A blank one reads as an oversight in the generator;
 * the dash is the table's way of saying the walk ran and found nothing.
 */
const NONE: Cell = [{ kind: "text", text: "—" }];

/** The second badge a type wears beside its registration, or none at all. */
type Axis = (status: ReviewStatus) => Badge | null;

/** A Constraint is no closure subject and no carrier: registration is all it has. */
const NO_AXIS: Axis = () => null;

/** Every living node of one type, in id order. */
function nodesOf(input: ReportInput, type: string): SpecNode[] {
  return input.graph.nodes
    .filter((node) => node.type === type)
    .sort((a, b) => compare(a.id, b.id));
}

/** The far ends of one kind of outgoing relation, deduplicated, in id order. */
function targetsOf(input: ReportInput, id: string, type: string): string[] {
  const ids = new Set<string>();
  for (const edge of input.context.outgoing.get(id) ?? []) {
    if (edge.type === type) {
      ids.add(edge.toId);
    }
  }
  return [...ids].sort(compare);
}

/** The near ends of one kind of incoming relation, deduplicated, in id order. */
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
 * A conflict is one fact written from one side or the other, and the two
 * requirements are equally in it — so both directions are one list, and a pair
 * that wrote it down twice is still one entry.
 */
function conflictsOf(input: ReportInput, id: string): string[] {
  return [
    ...new Set([
      ...targetsOf(input, id, CONFLICTS_WITH),
      ...sourcesOf(input, id, CONFLICTS_WITH),
    ]),
  ].sort(compare);
}

/**
 * One id as a PAGE meets it: the node's full name, linked to wherever the atlas
 * shows it. An id no file answers to is said as the bare id and nothing else —
 * the relation is still written down, and a link at a hole would be the worse
 * of the two lies.
 */
function refOf(input: ReportInput, id: string): Inline {
  const node = input.context.nodes.get(id);
  return node === undefined
    ? { kind: "text", text: id }
    : { kind: "link", to: { node: id }, text: node.name };
}

function factOf(label: string, input: ReportInput, ids: readonly string[]): Fact {
  const inlines: Inline[] = [];
  for (const id of ids) {
    if (inlines.length > 0) {
      inlines.push({ kind: "text", text: ", " });
    }
    inlines.push(refOf(input, id));
  }
  return { label, inlines };
}

/**
 * One id as a TABLE meets it: the short name, because a relation column holds
 * several of them and a column of full names is a column nobody can scan.
 */
function briefRefOf(input: ReportInput, id: string): Inline {
  const node = input.context.nodes.get(id);
  return node === undefined
    ? { kind: "text", text: id }
    : { kind: "link", to: { node: id }, text: node.shortName };
}

/** A relation column's cell: the far ends, comma-separated, or the dash. */
function relationCell(input: ReportInput, ids: readonly string[]): Cell {
  if (ids.length === 0) {
    return NONE;
  }
  const cell: Cell = [];
  for (const id of ids) {
    if (cell.length > 0) {
      cell.push({ kind: "text", text: ", " });
    }
    cell.push(briefRefOf(input, id));
  }
  return cell;
}

/** The badges a node wears: registration, then its type's second axis. */
function badgesOf(node: SpecNode, status: ReviewStatus | undefined, axis: Axis): Badge[] {
  const badges: Badge[] = [];
  // A node whose file would not read has no status at all; it keeps its
  // identity and its relations here, and wears no word it has not earned.
  if (status !== undefined) {
    badges.push(registrationOf(status));
    const second = axis(status);
    if (second !== null) {
      badges.push(second);
    }
  }
  if (node.deletionProposed !== undefined) {
    badges.push({ label: "Deletion proposed", tone: "neutral" });
  }
  return badges;
}

/** The status column's cell: the same badges the node's page wears. */
function statusCell(input: ReportInput, node: SpecNode, axis: Axis): Cell {
  const badges = badgesOf(node, input.statuses.get(node.id), axis);
  if (badges.length === 0) {
    return NONE;
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

/** The ID column's cell: the id itself, and the way to the node's page. */
function idCell(id: string): Cell {
  return [{ kind: "link", to: { node: id }, text: id }];
}

/**
 * A row of a table whose rows come from an EDGE WALK rather than from a type —
 * the criteria a requirement demands, the evidence a criterion has. The far end
 * may be a hole, and a hole keeps its row: the edge is what says somebody still
 * expects that node.
 */
function walkedRow(input: ReportInput, id: string, axis: Axis): Cell[] {
  const node = input.context.nodes.get(id);
  if (node === undefined) {
    return [[{ kind: "text", text: id }], NONE, NONE];
  }
  return [idCell(id), [{ kind: "text", text: node.name }], statusCell(input, node, axis)];
}

/** ID, name and word — the small table a page carries under a node block. */
function walkedRowsOf(
  input: ReportInput,
  caption: string,
  ids: readonly string[],
  axis: Axis,
): Block {
  return {
    kind: "rows",
    caption,
    header: ["ID", "Name", "Status"],
    rows: ids.map((id) => walkedRow(input, id, axis)),
  };
}

/**
 * How much of what a requirement demands has been met — a count of criteria
 * whose closure came back closed, over the criteria it hangs. A hole counts in
 * the denominator, because the requirement is still asking for it.
 */
function criteriaCell(input: ReportInput, id: string): Cell {
  const held = targetsOf(input, id, HAS_CRITERION);
  if (held.length === 0) {
    return NONE;
  }
  const met = held.filter(
    (criterion) => input.statuses.get(criterion)?.closure === "closed",
  ).length;
  return [{ kind: "text", text: `${met} of ${held.length} met` }];
}

function requirementRowsOf(input: ReportInput, requirements: readonly SpecNode[]): Block {
  return {
    kind: "rows",
    caption: null,
    header: ["ID", "Short name", "Name", "From responsibility", "Criteria", "Status"],
    rows: requirements.map((node) => [
      idCell(node.id),
      [{ kind: "text", text: node.shortName }],
      [{ kind: "text", text: node.name }],
      relationCell(input, sourcesOf(input, node.id, REQUIRES)),
      criteriaCell(input, node.id),
      statusCell(input, node, carrierOf),
    ]),
  };
}

/**
 * THE LINES EVERY PAGE ENDS WITH, ADDED ONLY WHERE THE CANON ALLOWS THEM.
 * `EDGE_GRAMMAR` writes `HAS_CONSTRAINT` and `ASSUMES` out of a Requirement and
 * out of an AcceptanceCriterion, but out of a Constraint it writes `ASSUMES`
 * alone — a constraint constraining a constraint anchors nothing — while
 * `AFFECTS` reaches all three from a Decision. `writesConstraints` is that one
 * difference and the only one; the rest is the same three-line ending
 * everywhere, empty lines included, so an absence is something the page SAYS
 * rather than something it omits.
 */
function crossCuttingFacts(
  input: ReportInput,
  id: string,
  writesConstraints: boolean,
): Fact[] {
  const facts: Fact[] = [];
  if (writesConstraints) {
    facts.push(factOf("Constraints", input, targetsOf(input, id, HAS_CONSTRAINT)));
  }
  facts.push(factOf("Assumptions", input, targetsOf(input, id, ASSUMES)));
  // Incoming: a decision names what it revises in its own file, so the node
  // learns of it only by looking back down the edge.
  facts.push(factOf("Decisions", input, sourcesOf(input, id, AFFECTS)));
  return facts;
}

function nodeBlockOf(
  input: ReportInput,
  node: SpecNode,
  axis: Axis,
  facts: Fact[],
): Block {
  return {
    kind: "node",
    id: node.id,
    type: node.type,
    name: node.name,
    shortName: node.shortName,
    depth: 0,
    badges: badgesOf(node, input.statuses.get(node.id), axis),
    facts,
    body: node.body,
  };
}

function pageOfRequirement(input: ReportInput, requirement: SpecNode): ChapterPage {
  return {
    id: requirement.id,
    title: requirement.name,
    blocks: [
      nodeBlockOf(input, requirement, carrierOf, [
        factOf("From responsibility", input, sourcesOf(input, requirement.id, REQUIRES)),
        factOf("Depends on", input, targetsOf(input, requirement.id, DEPENDS_ON)),
        factOf("Conflicts with", input, conflictsOf(input, requirement.id)),
        ...crossCuttingFacts(input, requirement.id, true),
      ]),
      walkedRowsOf(
        input,
        "Acceptance criteria",
        targetsOf(input, requirement.id, HAS_CRITERION),
        criterionOf,
      ),
    ],
  };
}

function pageOfCriterion(input: ReportInput, criterion: SpecNode): ChapterPage {
  const blocks: Block[] = [
    nodeBlockOf(input, criterion, criterionOf, [
      factOf("Criterion of", input, sourcesOf(input, criterion.id, HAS_CRITERION)),
      factOf("Targeted by", input, sourcesOf(input, criterion.id, TARGETS)),
      ...crossCuttingFacts(input, criterion.id, true),
    ]),
    // A piece of evidence is neither a carrier nor a closure subject: its
    // registration is the whole of what the ledger says about it.
    walkedRowsOf(input, "Evidence", sourcesOf(input, criterion.id, CLAIMS), NO_AXIS),
  ];
  const leftOpen = input.statuses.get(criterion.id)?.leftOpen ?? null;
  if (leftOpen !== null) {
    blocks.push({
      kind: "line",
      inlines: [
        {
          kind: "text",
          text: `Left open by ${leftOpen.by} at ${leftOpen.at} — ${leftOpen.rationale}`,
        },
      ],
    });
  }
  return { id: criterion.id, title: criterion.name, blocks };
}

/**
 * A constraint's page, and the one page here that goes back to the OVERVIEW: a
 * constraint is written by eight types across four chapters, so no chapter is
 * the way back to it, and this chapter — which merely owns the file — would be
 * the most misleading of the eight to return a reader to.
 */
function pageOfConstraint(input: ReportInput, constraint: SpecNode): ChapterPage {
  return {
    id: constraint.id,
    title: constraint.name,
    blocks: [
      nodeBlockOf(input, constraint, NO_AXIS, [
        factOf("Constrains", input, sourcesOf(input, constraint.id, HAS_CONSTRAINT)),
        ...crossCuttingFacts(input, constraint.id, false),
      ]),
    ],
    back: "index",
  };
}

function summaryOf(
  input: ReportInput,
  requirements: readonly SpecNode[],
  criteria: readonly SpecNode[],
): string {
  const satisfied = requirements.filter(
    (node) => input.statuses.get(node.id)?.satisfaction === "sat",
  ).length;
  const met = criteria.filter(
    (node) => input.statuses.get(node.id)?.closure === "closed",
  ).length;
  const carriers = requirements.length === 1 ? "requirement" : "requirements";
  const demands = criteria.length === 1 ? "criterion" : "criteria";
  return `${requirements.length} ${carriers}, ${satisfied} satisfied; ${criteria.length} ${demands}, ${met} met.`;
}

function assemble(input: ReportInput): AssembledChapter {
  const requirements = nodesOf(input, REQUIREMENT);
  const criteria = nodesOf(input, ACCEPTANCE_CRITERION);
  const constraints = nodesOf(input, CONSTRAINT);

  return {
    summary: summaryOf(input, requirements, criteria),
    blocks: [requirementRowsOf(input, requirements)],
    pages: [
      ...requirements.map((requirement) => pageOfRequirement(input, requirement)),
      ...criteria.map((criterion) => pageOfCriterion(input, criterion)),
      ...constraints.map((constraint) => pageOfConstraint(input, constraint)),
    ],
  };
}

export const requirementsChapter: ChapterRule = {
  ordinal: 5,
  slug: "05-requirements",
  title: "Requirements",
  assemble,
};
