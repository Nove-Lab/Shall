import type { OpenCriterion, ReviewStatus } from "../../arith/index.js";
import type { SpecNode } from "../../graph/index.js";
import { compare } from "../../graph/order.js";
import type {
  Badge,
  Block,
  Cell,
  Fact,
  Inline,
  LinkTarget,
  ReportInput,
} from "../model.js";
import {
  aimsNoteOf,
  carrierOf,
  criterionOf,
  openReasonOf,
  registrationOf,
  workOf,
} from "../vocabulary.js";
import type { AssembledChapter, ChapterPage, ChapterRule } from "./rule.js";

/**
 * CHAPTER 7 — how far the work has come, in four bars and nothing else.
 *
 * THE CHAPTER PAGE IS THE ANSWER; THE LISTINGS ARE THE EVIDENCE. A reader
 * arriving here asks one question — how far along is this? — and the page
 * answers it in four labelled bars, scenarios, requirements, criteria, work
 * items, with no table between them to scroll past. Each bar's LABEL is the
 * way down: it links to a listing page that shows every living node of that
 * axis, the same ratio at its head and one table under it. Nothing is
 * summarised twice, and the reader who only wanted the number never meets a
 * row.
 *
 * THE NUMBERS ARE THE VITALS' OWN, COPIED. Every ratio is read off
 * `input.vitals.progress` and never counted again here: a second count is a
 * second answer, and the page beside the daemon's would be the place they
 * disagreed. What the listings add is per-node detail — how many of a
 * carrier's criteria are met, why one criterion is open — taken from the
 * review's own word in `input.statuses` and from the vitals' own drill-down
 * lists, never re-judged.
 *
 * THE LISTINGS ARE COMPLETE, NOT FILTERED. A listing shows EVERY living node
 * of its type in id order, met and unmet alike, because a reader who follows
 * "Criteria met" wants to see the criteria — all of them — not the complement
 * of the numerator. The status column says which side of the ratio each row
 * falls on.
 *
 * NO COLUMN IS READ OUT OF A BODY, and every node of the chapter's five types
 * still has a page of its own where its facts stand in full and its body is
 * handed over verbatim. Journals are reached from the work log they wrote,
 * which names them under "Logged by".
 */

const WORK_ITEM = "WorkItem";
const JOURNAL = "Journal";
const WORK_LOG = "WorkLog";
const EVIDENCE = "Evidence";
const COMPLETION_REPORT = "CompletionReport";
const SCENARIO = "Scenario";
const REQUIREMENT = "Requirement";
const ACCEPTANCE_CRITERION = "AcceptanceCriterion";

const ALLOCATES = "ALLOCATES";
const DEPENDS_ON = "DEPENDS_ON";
const ADDRESSES = "ADDRESSES";
const CLAIMS = "CLAIMS";
const TARGETS = "TARGETS";
const HAS_CRITERION = "HAS_CRITERION";
const LOGS = "LOGS";
const SUBMITS = "SUBMITS";
const RECORDS = "RECORDS";
/**
 * A decision that revised a node points AT it, so the node's page reads the
 * edge backwards. The grammar permits `Decision → WorkItem` and none of this
 * chapter's other four types, and permits neither HAS_CONSTRAINT nor ASSUMES
 * out of any of them — so the work item's page gains "Decisions" alone.
 */
const AFFECTS = "AFFECTS";

/** A cell with nothing in it says so — an empty `<td>` reads as a mistake. */
const NONE = "—";

const DELETION_PROPOSED: Badge = { label: "Deletion proposed", tone: "neutral" };

/** The second badge a type wears beside its registration, or none at all. */
type Axis = (status: ReviewStatus) => Badge | null;

/** A journal, a log, a piece of evidence, a report: registration is all they have. */
const NO_AXIS: Axis = () => null;

/** Living nodes of one type, id order. */
function nodesOfType(input: ReportInput, type: string): SpecNode[] {
  return input.graph.nodes
    .filter((node) => node.type === type)
    .sort((a, b) => compare(a.id, b.id));
}

/** The far ends of one relation leaving this node, each once, id order. */
function outgoingIds(input: ReportInput, id: string, type: string): string[] {
  const ids: string[] = [];
  for (const edge of input.context.outgoing.get(id) ?? []) {
    if (edge.type === type && !ids.includes(edge.toId)) {
      ids.push(edge.toId);
    }
  }
  return ids.sort(compare);
}

/** The near ends of one relation arriving at this node, each once, id order. */
function incomingIds(input: ReportInput, id: string, type: string): string[] {
  const ids: string[] = [];
  for (const edge of input.context.incoming.get(id) ?? []) {
    if (edge.type === type && !ids.includes(edge.fromId)) {
      ids.push(edge.fromId);
    }
  }
  return ids.sort(compare);
}

function text(value: string): Inline {
  return { kind: "text", text: value };
}

/**
 * An id no file answers to is said and not clicked — there is nothing to open,
 * and a link at a hole would be the worse of the two lies.
 */
function nameInline(input: ReportInput, id: string): Inline {
  const node = input.context.nodes.get(id);
  return node === undefined ? text(id) : { kind: "link", to: { node: id }, text: node.name };
}

/** A fact under a node: the full names, since the page has the room the table has not. */
function factOf(label: string, input: ReportInput, ids: readonly string[]): Fact {
  const inlines: Inline[] = [];
  for (const id of ids) {
    if (inlines.length > 0) {
      inlines.push(text(", "));
    }
    inlines.push(nameInline(input, id));
  }
  return { label, inlines };
}

/** The way in: the id, linked to the node's own page. */
function idCell(input: ReportInput, id: string): Cell {
  return input.context.nodes.has(id) ? [{ kind: "link", to: { node: id }, text: id }] : [text(id)];
}

/** A dangling id has no name and no word; the dash stands in both cells. */
function nameCell(input: ReportInput, id: string): Cell {
  const node = input.context.nodes.get(id);
  return [text(node === undefined ? NONE : node.name)];
}

/**
 * A relation cell: the far ends, SHORT names so the column stays narrow, and
 * the raw id where no file answers to it.
 */
function relationCell(input: ReportInput, ids: readonly string[]): Cell {
  if (ids.length === 0) {
    return [text(NONE)];
  }
  const cell: Cell = [];
  for (const id of ids) {
    if (cell.length > 0) {
      cell.push(text(", "));
    }
    const node = input.context.nodes.get(id);
    cell.push(node === undefined ? text(id) : { kind: "link", to: { node: id }, text: node.shortName });
  }
  return cell;
}

function badgeCell(badges: readonly Badge[]): Cell {
  if (badges.length === 0) {
    return [text(NONE)];
  }
  const cell: Cell = [];
  for (const badge of badges) {
    if (cell.length > 0) {
      cell.push(text(" "));
    }
    cell.push({ kind: "badge", badge });
  }
  return cell;
}

/**
 * What a node wears: the ledger's word first, then its type's own axis, then
 * the standing proposal — the same list on a page's node block and in a
 * table's status cell, so the two cannot drift apart.
 */
function badgesOf(input: ReportInput, id: string, axis: Axis): Badge[] {
  const badges: Badge[] = [];
  const status = input.statuses.get(id);
  if (status !== undefined) {
    badges.push(registrationOf(status));
    const second = axis(status);
    if (second !== null) {
      badges.push(second);
    }
  }
  if (input.context.nodes.get(id)?.deletionProposed !== undefined) {
    badges.push(DELETION_PROPOSED);
  }
  return badges;
}

/** One axis alone — the work column stands BESIDE the registration one, not inside it. */
function axisBadges(input: ReportInput, id: string, axis: Axis): Badge[] {
  const status = input.statuses.get(id);
  const badge = status === undefined ? null : axis(status);
  return badge === null ? [] : [badge];
}

function nodeBlock(node: SpecNode, badges: Badge[], facts: Fact[]): Block {
  return {
    kind: "node",
    id: node.id,
    type: node.type,
    name: node.name,
    shortName: node.shortName,
    depth: 0,
    badges,
    facts,
    body: node.body,
  };
}

/** An empty table under a node page is no table: its fact above already said "none". */
function rowsBlock(caption: string | null, header: string[] | null, rows: Cell[][]): Block[] {
  return rows.length === 0 ? [] : [{ kind: "rows", caption, header, rows }];
}

/**
 * THE FOUR AXES, each a vitals row, a label, and the listing page that shows
 * it whole. One table drives the chapter's four bars and the four pages, so a
 * bar and the page it opens cannot come to disagree about either.
 */
type AxisKey = "scenarios" | "requirements" | "criteria" | "workItems";

interface ProgressAxis {
  key: AxisKey;
  label: string;
  /** The listing's id, its own page's stem in the report's link map. */
  pageId: string;
  file: string;
}

const AXES: readonly ProgressAxis[] = [
  {
    key: "scenarios",
    label: "Scenario satisfaction",
    pageId: "progress-scenarios",
    file: "progress/scenarios.html",
  },
  {
    key: "requirements",
    label: "Requirement satisfaction",
    pageId: "progress-requirements",
    file: "progress/requirements.html",
  },
  {
    key: "criteria",
    label: "Criteria met",
    pageId: "progress-criteria",
    file: "progress/criteria.html",
  },
  {
    key: "workItems",
    label: "Work items done",
    pageId: "progress-work-items",
    file: "progress/work-items.html",
  },
];

/**
 * One bar, the vitals' own numbers and nothing computed here. `to` is the
 * listing on the chapter page and null on the listing itself — a bar that led
 * to the page it already stands on would be a link back to nowhere.
 */
function ratioBlock(input: ReportInput, axis: ProgressAxis, to: LinkTarget | null): Block {
  const row = input.vitals.progress[axis.key];
  return {
    kind: "ratio",
    label: axis.label,
    numerator: row.numerator,
    denominator: row.denominator,
    // The carriers that demand no criterion are out of the ratio, so the
    // count of them rides beside it rather than vanishing.
    note: "unspecified" in row && row.unspecified > 0 ? `${row.unspecified} without criteria` : null,
    to,
  };
}

/**
 * How far one set of criteria has come — a count of the review's own word, not
 * a second judgement of it, and a dash where the node writes none.
 */
function closureCell(input: ReportInput, ids: readonly string[]): Cell {
  if (ids.length === 0) {
    return [text(NONE)];
  }
  const met = ids.filter((id) => input.statuses.get(id)?.closure === "closed").length;
  return [text(`${met} of ${ids.length} met`)];
}

/**
 * A carrier's listing row: what it demands, how much of that is met, and which
 * side of the ratio it falls on. Scenarios and requirements read alike, so one
 * function draws both.
 */
function carrierRows(input: ReportInput, type: string): Cell[][] {
  return nodesOfType(input, type).map((node) => [
    idCell(input, node.id),
    [text(node.name)],
    closureCell(input, outgoingIds(input, node.id, HAS_CRITERION)),
    badgeCell(badgesOf(input, node.id, carrierOf)),
  ]);
}

/**
 * Why a criterion is open, in the vitals' own words — and the dash for one the
 * vitals did not list, which is the same as saying it is met. Where nothing is
 * aimed at it any more, the clause that says so follows; it only ever lands on
 * a row that reads no evidence or left open, since a criterion awaiting review
 * is by definition one a verdict is still ahead of.
 */
function whyOpenCell(open: OpenCriterion | undefined): Cell {
  if (open === undefined) {
    return [text(NONE)];
  }
  const cell: Cell = [text(openReasonOf(open.reason))];
  if (open.leftOpen !== null) {
    cell.push(text(` — left open by ${open.leftOpen.by}`));
  }
  const note = aimsNoteOf(open.aims);
  if (note !== null) {
    cell.push(text(` — ${note}`));
  }
  return cell;
}

function criterionRows(input: ReportInput): Cell[][] {
  const open = new Map(input.vitals.progress.criteria.open.map((held) => [held.id, held] as const));
  return nodesOfType(input, ACCEPTANCE_CRITERION).map((node) => [
    idCell(input, node.id),
    [text(node.name)],
    whyOpenCell(open.get(node.id)),
    badgeCell(badgesOf(input, node.id, criterionOf)),
  ]);
}

/** EVERY work item, one row each, so none of them can go quiet. */
function workItemRows(input: ReportInput): Cell[][] {
  return nodesOfType(input, WORK_ITEM).map((node) => [
    idCell(input, node.id),
    [text(node.shortName)],
    [text(node.name)],
    relationCell(input, incomingIds(input, node.id, ALLOCATES)),
    closureCell(input, outgoingIds(input, node.id, TARGETS)),
    badgeCell(axisBadges(input, node.id, workOf)),
    badgeCell(badgesOf(input, node.id, NO_AXIS)),
  ]);
}

/** A listing: the bar it came from, then every living node of its axis. */
function listingPage(
  input: ReportInput,
  axis: ProgressAxis,
  header: string[],
  rows: Cell[][],
): ChapterPage {
  return {
    id: axis.pageId,
    title: axis.label,
    file: axis.file,
    back: "chapter",
    blocks: [
      ratioBlock(input, axis, null),
      { kind: "rows", caption: null, header, rows },
    ],
  };
}

const CARRIER_HEADER = ["ID", "Name", "Criteria", "Status"];
const CRITERION_HEADER = ["ID", "Name", "Why open", "Status"];
const WORK_ITEM_HEADER = [
  "ID",
  "Short name",
  "Name",
  "Allocated by",
  "Targets",
  "State",
  "Status",
];

function listingPages(input: ReportInput): ChapterPage[] {
  const [scenarios, requirements, criteria, workItems] = AXES as readonly [
    ProgressAxis,
    ProgressAxis,
    ProgressAxis,
    ProgressAxis,
  ];
  return [
    listingPage(input, scenarios, CARRIER_HEADER, carrierRows(input, SCENARIO)),
    listingPage(input, requirements, CARRIER_HEADER, carrierRows(input, REQUIREMENT)),
    listingPage(input, criteria, CRITERION_HEADER, criterionRows(input)),
    listingPage(input, workItems, WORK_ITEM_HEADER, workItemRows(input)),
  ];
}

/** The work item in full: its five edge facts, its body, and what it aims at. */
function workItemPages(input: ReportInput): ChapterPage[] {
  return nodesOfType(input, WORK_ITEM).map((node) => ({
    id: node.id,
    title: node.name,
    blocks: [
      nodeBlock(node, badgesOf(input, node.id, workOf), [
        factOf("Allocated by", input, incomingIds(input, node.id, ALLOCATES)),
        factOf("Depends on", input, outgoingIds(input, node.id, DEPENDS_ON)),
        factOf("Addressed by", input, incomingIds(input, node.id, ADDRESSES)),
        factOf("Completion reports", input, incomingIds(input, node.id, CLAIMS)),
        // The grammar lets a decision revise a work item, so the fact stands
        // whether or not one has: the empty line says "none has" out loud.
        factOf("Decisions", input, incomingIds(input, node.id, AFFECTS)),
      ]),
      ...rowsBlock(
        "Targets",
        ["ID", "Name", "Status"],
        outgoingIds(input, node.id, TARGETS).map((id) => [
          idCell(input, id),
          nameCell(input, id),
          badgeCell(badgesOf(input, id, criterionOf)),
        ]),
      ),
    ],
  }));
}

function journalPages(input: ReportInput): ChapterPage[] {
  return nodesOfType(input, JOURNAL).map((node) => ({
    id: node.id,
    title: node.name,
    blocks: [
      nodeBlock(node, badgesOf(input, node.id, NO_AXIS), []),
      ...rowsBlock(
        "Work logs",
        ["ID", "Name", "Status"],
        outgoingIds(input, node.id, LOGS).map((id) => [
          idCell(input, id),
          nameCell(input, id),
          badgeCell(badgesOf(input, id, NO_AXIS)),
        ]),
      ),
    ],
  }));
}

function workLogPages(input: ReportInput): ChapterPage[] {
  return nodesOfType(input, WORK_LOG).map((node) => {
    const commits: Inline[] = [];
    for (const sha of node.commits ?? []) {
      if (commits.length > 0) {
        commits.push(text(", "));
      }
      commits.push(text(sha));
    }
    return {
      id: node.id,
      title: node.name,
      blocks: [
        nodeBlock(node, badgesOf(input, node.id, NO_AXIS), [
          // The journal that wrote this log is named here, and this is the
          // only way to it: no chapter tables journals any more.
          factOf("Logged by", input, incomingIds(input, node.id, LOGS)),
          factOf("Addresses", input, outgoingIds(input, node.id, ADDRESSES)),
          factOf("Submits", input, outgoingIds(input, node.id, SUBMITS)),
          factOf("Records", input, outgoingIds(input, node.id, RECORDS)),
          { label: "Commits", inlines: commits },
        ]),
      ],
    };
  });
}

/** Evidence and completion reports read alike: what it claims, and who submitted it. */
function claimantPages(input: ReportInput, type: string): ChapterPage[] {
  return nodesOfType(input, type).map((node) => ({
    id: node.id,
    title: node.name,
    blocks: [
      nodeBlock(node, badgesOf(input, node.id, NO_AXIS), [
        factOf("Claims", input, outgoingIds(input, node.id, CLAIMS)),
        factOf("Submitted by", input, incomingIds(input, node.id, SUBMITS)),
      ]),
    ],
  }));
}

function summaryOf(input: ReportInput): string {
  const { numerator, denominator } = input.vitals.progress.workItems;
  const journals = nodesOfType(input, JOURNAL).length;
  return `${denominator} work item${denominator === 1 ? "" : "s"}, ${numerator} done; ${journals} journal ${journals === 1 ? "entry" : "entries"}.`;
}

export const progressChapter: ChapterRule = {
  ordinal: 7,
  slug: "07-progress",
  title: "Work Items & Progress",
  assemble(input: ReportInput): AssembledChapter {
    return {
      summary: summaryOf(input),
      blocks: AXES.map((axis) => ratioBlock(input, axis, { file: axis.file, anchor: null })),
      pages: [
        ...listingPages(input),
        ...workItemPages(input),
        ...journalPages(input),
        ...workLogPages(input),
        ...claimantPages(input, EVIDENCE),
        ...claimantPages(input, COMPLETION_REPORT),
      ],
    };
  },
};
