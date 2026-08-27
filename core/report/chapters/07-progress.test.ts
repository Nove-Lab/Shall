import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  closureKindOf,
  formatEdgeId,
  type SpecEdge,
  type SpecNode,
} from "../../graph/index.js";
import {
  approvalPayload,
  blocksOf,
  type AcceptanceRecord,
  type ApprovalRecord,
  type RejectionRecord,
} from "../../serialize/index.js";
import {
  colorContextOf,
  reviewGraph,
  vitalsOf,
  type Ledgers,
  type PayloadHash,
  type ReviewStatus,
} from "../../arith/index.js";
import type { SpecGraph } from "../../store/file-store.js";
import type { Block, Cell, ReportInput } from "../model.js";
import { progressChapter } from "./07-progress.js";

/**
 * Chapter 7 over a graph built by hand: the chapter page is four bars and
 * nothing else, each bar links the listing that shows its axis whole, each
 * listing carries the vitals' own ratio and every living node of its type, a
 * target no file answers to is said and not linked, the journal listing and
 * the coverage checks are gone from the chapter altogether, and no internal
 * colour word reaches a block.
 */

const hash: PayloadHash = (payload: string) => `sha256:${payload}`;
const APPROVER = { by: "t", at: "2026-01-01T00:00:00Z" };
const ACCEPTOR = { by: "t", at: "2026-01-02T00:00:00Z" };
const REFUSAL = { by: "reviewer", at: "2026-01-03T00:00:00Z", rationale: "Waiting on the pilot." };

/** The short name is not the name, so a column that swapped them would show. */
function node(type: string, id: string, extra: Partial<SpecNode> = {}): SpecNode {
  return {
    id,
    type,
    shortName: `Short ${id}`,
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

function hashOf(held: SpecNode, edges: readonly SpecEdge[]): string {
  return hash(
    approvalPayload(
      held.type,
      held.id,
      held,
      edges.filter((line) => line.fromId === held.id),
      blocksOf(held),
    ),
  );
}

function approve(held: SpecNode, edges: readonly SpecEdge[]): [string, ApprovalRecord] {
  return [held.id, { approvedHash: hashOf(held, edges), ...APPROVER }];
}

function accept(
  subject: SpecNode,
  claimants: readonly SpecNode[],
  edges: readonly SpecEdge[],
): [string, AcceptanceRecord] {
  return [
    subject.id,
    {
      kind: closureKindOf(subject.type)?.kind ?? "criterion",
      subjectHash: hashOf(subject, edges),
      claimants: new Map(claimants.map((held) => [held.id, hashOf(held, edges)] as const)),
      ...ACCEPTOR,
    },
  ];
}

/** A person's standing word that a criterion stays open, nothing claiming it. */
function leaveOpen(subject: SpecNode, edges: readonly SpecEdge[]): [string, RejectionRecord] {
  return [
    subject.id,
    {
      rejectedHash: hashOf(subject, edges),
      leftOpen: {
        kind: closureKindOf(subject.type)?.kind ?? "criterion",
        claimants: new Map(),
      },
      ...REFUSAL,
    },
  ];
}

/**
 * One spine with a plan tail: a requirement whose criterion is met, a scenario
 * whose criterion waits on evidence, a second whose criterion a person left
 * open, a third that demands none at all, a done work item, one that aims at a
 * criterion no file answers to and carries a standing deletion proposal, one
 * nothing allocates and nothing targets, and a decision that revised the first.
 */
const criterion = node("AcceptanceCriterion", "AC-0001");
const leftOpenCriterion = node("AcceptanceCriterion", "AC-0003");
const workItem = node("WorkItem", "WI-0001");
const evidence = node("Evidence", "EV-0001");
const report = node("CompletionReport", "CR-0001");
const journalOne = node("Journal", "J-0001", {
  createdAt: Date.UTC(2026, 0, 2),
  body: "## User Prompt\n\nAdd the closure ledger.\n\n## Work Summary\n\nWrote the ledger and the door.\n",
});
const journalTwo = node("Journal", "J-0002", {
  createdAt: Date.UTC(2026, 0, 5),
  body: "Nothing under a heading.",
});

const NODES: SpecNode[] = [
  node("Goal", "G-0001"),
  node("Actor", "A-0001"),
  node("UseCase", "UC-0001"),
  node("Scenario", "SC-0001"),
  node("Scenario", "SC-0002"),
  node("Scenario", "SC-0003"),
  node("SystemResponsibility", "SR-0001"),
  node("Requirement", "R-0001"),
  criterion,
  node("AcceptanceCriterion", "AC-0002"),
  leftOpenCriterion,
  node("Module", "M-0001"),
  node("Decision", "D-0001"),
  workItem,
  node("WorkItem", "WI-0002", {
    deletionProposed: { by: "agent", rationale: "Superseded by WI-0001." },
  }),
  node("WorkItem", "WI-0003"),
  journalOne,
  journalTwo,
  node("WorkLog", "WL-0001", { commits: ["abc1234", "def5678"] }),
  node("WorkLog", "WL-0002"),
  node("WorkLog", "WL-0003"),
  evidence,
  report,
];

const EDGES: SpecEdge[] = [
  edge("G-0001", "PURSUED_BY", "A-0001"),
  edge("A-0001", "PERFORMS", "UC-0001"),
  edge("UC-0001", "DETAILS", "SC-0001"),
  edge("UC-0001", "DETAILS", "SC-0002"),
  edge("UC-0001", "DETAILS", "SC-0003"),
  edge("SC-0001", "DERIVES_RESPONSIBILITY", "SR-0001"),
  edge("SC-0001", "HAS_CRITERION", "AC-0002"),
  edge("SC-0002", "HAS_CRITERION", "AC-0003"),
  edge("SR-0001", "REQUIRES", "R-0001"),
  edge("R-0001", "HAS_CRITERION", "AC-0001"),
  edge("SR-0001", "IS_REALIZED_BY", "M-0001"),
  edge("M-0001", "ALLOCATES", "WI-0001"),
  edge("M-0001", "ALLOCATES", "WI-0002"),
  edge("D-0001", "AFFECTS", "WI-0001"),
  edge("WI-0001", "TARGETS", "AC-0001"),
  // One criterion under two work items, and one target nothing answers to.
  edge("WI-0002", "TARGETS", "AC-0001"),
  edge("WI-0002", "TARGETS", "AC-0002"),
  edge("WI-0002", "TARGETS", "AC-9999"),
  edge("WI-0002", "DEPENDS_ON", "WI-0001"),
  edge("J-0001", "LOGS", "WL-0001"),
  edge("J-0001", "LOGS", "WL-0003"),
  edge("J-0002", "LOGS", "WL-0002"),
  edge("WL-0001", "ADDRESSES", "WI-0001"),
  edge("WL-0001", "SUBMITS", "EV-0001"),
  edge("WL-0001", "SUBMITS", "CR-0001"),
  edge("WL-0002", "ADDRESSES", "WI-0002"),
  edge("WL-0002", "RECORDS", "F-9999"),
  edge("EV-0001", "CLAIMS", "AC-0001"),
  edge("CR-0001", "CLAIMS", "WI-0001"),
];

const GRAPH: SpecGraph = { nodes: NODES, edges: EDGES, problems: [], refused: [] };
const LEDGERS: Ledgers = {
  approvals: new Map(NODES.map((held) => approve(held, EDGES))),
  rejections: new Map([leaveOpen(leftOpenCriterion, EDGES)]),
  acceptances: new Map([
    accept(criterion, [evidence], EDGES),
    accept(workItem, [report], EDGES),
  ]),
  hash,
};
const CONTEXT = colorContextOf(GRAPH, LEDGERS);
const VITALS = vitalsOf(GRAPH, LEDGERS);
const STATUSES = new Map<string, ReviewStatus>(
  reviewGraph(GRAPH, LEDGERS, CONTEXT).statuses.map((held) => [held.id, held]),
);
const INPUT: ReportInput = {
  graph: GRAPH,
  statuses: STATUSES,
  context: CONTEXT,
  vitals: VITALS,
  stamp: { projectName: "Test", generatedAt: "2026-01-01T00:00:00.000Z", gitHead: null },
};
const CHAPTER = progressChapter.assemble(INPUT);

/** The five types whose node pages this chapter owns. */
const OWNED = ["WorkItem", "Journal", "WorkLog", "Evidence", "CompletionReport"];

const LISTING_FILES = [
  "progress/scenarios.html",
  "progress/requirements.html",
  "progress/criteria.html",
  "progress/work-items.html",
];

type Rows = Extract<Block, { kind: "rows" }>;
type NodeBlock = Extract<Block, { kind: "node" }>;
type Ratio = Extract<Block, { kind: "ratio" }>;

function tablesOf(blocks: readonly Block[]): Rows[] {
  return blocks.filter((block): block is Rows => block.kind === "rows");
}

function nodeBlocksOf(blocks: readonly Block[]): NodeBlock[] {
  return blocks.filter((block): block is NodeBlock => block.kind === "node");
}

function cellOf(row: readonly Cell[], at: number): Cell {
  const held = row[at];
  assert.ok(held, `the row has a cell ${at}`);
  return held;
}

/** A cell drawn out as the reader meets it — a badge speaks with its label. */
function textOf(cell: Cell): string {
  return cell.map((inline) => (inline.kind === "badge" ? inline.badge.label : inline.text)).join("");
}

function rowText(row: readonly Cell[]): string[] {
  return row.map(textOf);
}

function cellText(row: readonly Cell[], at: number): string {
  return textOf(cellOf(row, at));
}

function rowOf(table: Rows, at: number): Cell[] {
  const held = table.rows[at];
  assert.ok(held, `the table has a row ${at}`);
  return held;
}

/** One listing page by its id, and the two blocks it is made of. */
function listing(id: string): { ratio: Ratio; table: Rows; page: (typeof CHAPTER.pages)[number] } {
  const page = CHAPTER.pages.find((held) => held.id === id);
  assert.ok(page, `a page called ${id}`);
  const [first, second] = page.blocks;
  assert.ok(first && first.kind === "ratio", `${id} opens with its ratio`);
  assert.ok(second && second.kind === "rows", `${id} carries one table`);
  assert.equal(page.blocks.length, 2, `${id} is a ratio and a table and nothing else`);
  return { ratio: first, table: second, page };
}

/** Every living node of one type, id order — what a listing has to cover. */
function idsOfType(type: string): string[] {
  return NODES.filter((held) => held.type === type).map((held) => held.id).sort();
}

function idsIn(table: Rows): string[] {
  return table.rows.map((row) => cellText(row, 0));
}

describe("the chapter page", () => {
  test("is four ratio bars and nothing else at all", () => {
    assert.deepEqual(CHAPTER.blocks.map((block) => block.kind), [
      "ratio",
      "ratio",
      "ratio",
      "ratio",
    ]);
    assert.deepEqual(nodeBlocksOf(CHAPTER.blocks), []);
    assert.deepEqual(tablesOf(CHAPTER.blocks), []);
  });

  test("the four bars are the vitals' own numbers, in the spine's order", () => {
    const { scenarios, requirements, criteria, workItems } = VITALS.progress;
    assert.deepEqual(
      CHAPTER.blocks
        .filter((block): block is Ratio => block.kind === "ratio")
        .map((block) => [block.label, block.numerator, block.denominator, block.note]),
      [
        ["Scenario satisfaction", scenarios.numerator, scenarios.denominator, "1 without criteria"],
        ["Requirement satisfaction", requirements.numerator, requirements.denominator, null],
        ["Criteria met", criteria.numerator, criteria.denominator, null],
        ["Work items done", workItems.numerator, workItems.denominator, null],
      ],
    );
  });

  test("every bar's label leads to the listing that shows its axis whole", () => {
    assert.deepEqual(
      CHAPTER.blocks.filter((block): block is Ratio => block.kind === "ratio").map((block) => block.to),
      LISTING_FILES.map((file) => ({ file, anchor: null })),
    );
  });

  test("the summary counts work items and journals", () => {
    assert.equal(CHAPTER.summary, "3 work items, 1 done; 2 journal entries.");
  });
});

describe("the four listing pages", () => {
  test("each has its own file, its own back link, and repeats its bar unlinked", () => {
    const ids = ["progress-scenarios", "progress-requirements", "progress-criteria", "progress-work-items"];
    assert.deepEqual(
      ids.map((id) => {
        const { page } = listing(id);
        return [page.title, page.file, page.back];
      }),
      [
        ["Scenario satisfaction", "progress/scenarios.html", "chapter"],
        ["Requirement satisfaction", "progress/requirements.html", "chapter"],
        ["Criteria met", "progress/criteria.html", "chapter"],
        ["Work items done", "progress/work-items.html", "chapter"],
      ],
    );
    // The bar at the head of a listing is the chapter's, minus the link to the
    // page it already stands on.
    const rows = [
      VITALS.progress.scenarios,
      VITALS.progress.requirements,
      VITALS.progress.criteria,
      VITALS.progress.workItems,
    ];
    ids.forEach((id, at) => {
      const { ratio } = listing(id);
      const row = rows[at]!;
      assert.deepEqual(
        [ratio.numerator, ratio.denominator, ratio.to],
        [row.numerator, row.denominator, null],
        id,
      );
    });
  });

  test("the scenario listing holds every scenario, met and unmet alike", () => {
    const { table } = listing("progress-scenarios");
    assert.deepEqual(table.header, ["ID", "Name", "Criteria", "Status"]);
    assert.deepEqual(idsIn(table).sort(), idsOfType("Scenario"));
    assert.deepEqual(table.rows.map(rowText), [
      ["SC-0001", "Scenario SC-0001", "0 of 1 met", "Approved Not yet satisfied"],
      ["SC-0002", "Scenario SC-0002", "0 of 1 met", "Approved Not yet satisfied"],
      // A scenario that demands no criterion writes the dash, and the ratio
      // above it already said one carrier stands outside the count.
      ["SC-0003", "Scenario SC-0003", "—", "Approved No criteria yet"],
    ]);
    assert.deepEqual(cellOf(rowOf(table, 0), 0), [
      { kind: "link", to: { node: "SC-0001" }, text: "SC-0001" },
    ]);
  });

  test("the requirement listing holds every requirement", () => {
    const { table } = listing("progress-requirements");
    assert.deepEqual(table.header, ["ID", "Name", "Criteria", "Status"]);
    assert.deepEqual(idsIn(table).sort(), idsOfType("Requirement"));
    assert.deepEqual(table.rows.map(rowText), [
      ["R-0001", "Requirement R-0001", "1 of 1 met", "Approved Satisfied"],
    ]);
  });

  test("the criteria listing says why each open one is open, in the vitals' words", () => {
    const { table } = listing("progress-criteria");
    assert.deepEqual(table.header, ["ID", "Name", "Why open", "Status"]);
    assert.deepEqual(idsIn(table).sort(), idsOfType("AcceptanceCriterion"));
    assert.deepEqual(table.rows.map(rowText), [
      // A met criterion is not on the vitals' open list, so the column is a dash.
      ["AC-0001", "AcceptanceCriterion AC-0001", "—", "Approved Met"],
      ["AC-0002", "AcceptanceCriterion AC-0002", "No evidence yet", "Approved Open"],
      [
        "AC-0003",
        "AcceptanceCriterion AC-0003",
        "Left open — left open by reviewer — no work item aims at it",
        "Approved Open",
      ],
    ]);
    // The reason, the person and what is still aimed at it are three inlines:
    // the second only where a person's word is what holds it open, the third
    // only where nothing is coming — AC-0003 has no work item aiming at it,
    // while AC-0002's WI-0002 is not done yet and so says nothing.
    assert.deepEqual(cellOf(rowOf(table, 2), 2), [
      { kind: "text", text: "Left open" },
      { kind: "text", text: " — left open by reviewer" },
      { kind: "text", text: " — no work item aims at it" },
    ]);
    assert.equal(
      VITALS.progress.criteria.open.find((held) => held.id === "AC-0003")?.reason,
      "left-open",
    );
  });

  test("the work item listing holds every work item, its edges and its two words", () => {
    const { table } = listing("progress-work-items");
    assert.deepEqual(table.header, [
      "ID",
      "Short name",
      "Name",
      "Allocated by",
      "Targets",
      "State",
      "Status",
    ]);
    assert.deepEqual(idsIn(table).sort(), idsOfType("WorkItem"));
    assert.deepEqual(table.rows.map(rowText), [
      ["WI-0001", "Short WI-0001", "WorkItem WI-0001", "Short M-0001", "1 of 1 met", "Done", "Approved"],
      [
        "WI-0002",
        "Short WI-0002",
        "WorkItem WI-0002",
        "Short M-0001",
        // One criterion stands under two work items, and one target answers to
        // no file — it counts against the total and is not met.
        "1 of 3 met",
        "Blocked",
        "Approved Deletion proposed",
      ],
      ["WI-0003", "Short WI-0003", "WorkItem WI-0003", "—", "—", "Blocked", "Needs attention"],
    ]);
    // The module that allocates it, linked by its SHORT name so the column stays narrow.
    assert.deepEqual(cellOf(rowOf(table, 0), 3), [
      { kind: "link", to: { node: "M-0001" }, text: "Short M-0001" },
    ]);
    assert.deepEqual(cellOf(rowOf(table, 1), 6).map((inline) => inline.kind), [
      "badge",
      "text",
      "badge",
    ]);
  });
});

describe("the node pages this chapter owns", () => {
  const nodePages = CHAPTER.pages.filter((page) => page.file === undefined);

  test("one for every work item, journal, work log, evidence and completion report", () => {
    assert.deepEqual(
      nodePages.map((page) => [page.id, page.title]),
      [
        ["WI-0001", "WorkItem WI-0001"],
        ["WI-0002", "WorkItem WI-0002"],
        ["WI-0003", "WorkItem WI-0003"],
        ["J-0001", "Journal J-0001"],
        ["J-0002", "Journal J-0002"],
        ["WL-0001", "WorkLog WL-0001"],
        ["WL-0002", "WorkLog WL-0002"],
        ["WL-0003", "WorkLog WL-0003"],
        ["EV-0001", "Evidence EV-0001"],
        ["CR-0001", "CompletionReport CR-0001"],
      ],
    );
    // Not one of the chapter's nodes is left without a page of its own.
    assert.deepEqual(
      [...nodePages.map((page) => page.id)].sort(),
      NODES.filter((held) => OWNED.includes(held.type)).map((held) => held.id).sort(),
    );
    // A node page takes the reader back to the chapter, the atlas's default.
    assert.deepEqual([...new Set(nodePages.map((page) => page.back))], [undefined]);
  });

  test("every page opens with the node's own block, body and all", () => {
    const byId = new Map(NODES.map((held) => [held.id, held] as const));
    for (const page of nodePages) {
      const own = page.blocks[0];
      assert.ok(own && own.kind === "node", page.id);
      const held = byId.get(page.id);
      assert.ok(held, page.id);
      assert.deepEqual(
        [own.id, own.type, own.name, own.shortName, own.depth, own.body],
        [held.id, held.type, held.name, held.shortName, 0, held.body],
      );
    }
  });

  test("a work item's page names its five facts and the criteria it targets", () => {
    const page = nodePages[0]!;
    const first = nodeBlocksOf(page.blocks)[0]!;
    assert.deepEqual(first.badges.map((badge) => badge.label), ["Approved", "Done"]);
    assert.deepEqual(first.facts.map((fact) => fact.label), [
      "Allocated by",
      "Depends on",
      "Addressed by",
      "Completion reports",
      "Decisions",
    ]);
    // A fact carries the FULL name, where the table's cell carried the short one.
    assert.deepEqual(first.facts[0]?.inlines, [
      { kind: "link", to: { node: "M-0001" }, text: "Module M-0001" },
    ]);
    // Nothing depends on WI-0001, so the fact carries no inline at all.
    assert.deepEqual(first.facts[1]?.inlines, []);
    assert.deepEqual(first.facts[2]?.inlines, [
      { kind: "link", to: { node: "WL-0001" }, text: "WorkLog WL-0001" },
    ]);
    assert.deepEqual(first.facts[3]?.inlines, [
      { kind: "link", to: { node: "CR-0001" }, text: "CompletionReport CR-0001" },
    ]);
    // The cross-cutting fact: the decision is reached from the thing it revised.
    assert.deepEqual(first.facts[4]?.inlines, [
      { kind: "link", to: { node: "D-0001" }, text: "Decision D-0001" },
    ]);
    assert.equal(first.body, "What WI-0001 says.");
    const targets = tablesOf(page.blocks)[0]!;
    assert.deepEqual([targets.caption, targets.header], ["Targets", ["ID", "Name", "Status"]]);
    assert.deepEqual(targets.rows.map(rowText), [
      ["AC-0001", "AcceptanceCriterion AC-0001", "Approved Met"],
    ]);
  });

  test("the decisions fact stands even where no decision has revised the work item", () => {
    const facts = nodeBlocksOf(nodePages[2]!.blocks)[0]!.facts;
    const decisions = facts.find((fact) => fact.label === "Decisions");
    assert.ok(decisions);
    assert.deepEqual(decisions.inlines, []);
  });

  test("a dangling target is said and not linked, and the proposal rides on the badges", () => {
    const second = nodeBlocksOf(nodePages[1]!.blocks)[0]!;
    assert.deepEqual(second.badges.map((badge) => badge.label), [
      "Approved",
      "Blocked",
      "Deletion proposed",
    ]);
    const targets = tablesOf(nodePages[1]!.blocks)[0]!;
    assert.deepEqual(targets.rows.map(rowText), [
      ["AC-0001", "AcceptanceCriterion AC-0001", "Approved Met"],
      ["AC-0002", "AcceptanceCriterion AC-0002", "Approved Open"],
      // No file answers to AC-9999: plain text, no name, no word.
      ["AC-9999", "—", "—"],
    ]);
    assert.deepEqual(cellOf(rowOf(targets, 2), 0), [{ kind: "text", text: "AC-9999" }]);
    assert.deepEqual(cellOf(rowOf(targets, 0), 0), [
      { kind: "link", to: { node: "AC-0001" }, text: "AC-0001" },
    ]);
    // WI-0003 targets nothing, so its page holds no table at all.
    assert.deepEqual(tablesOf(nodePages[2]!.blocks), []);
  });

  test("a journal's page carries the logs it wrote", () => {
    const logs = tablesOf(nodePages[3]!.blocks)[0];
    assert.ok(logs);
    assert.deepEqual([logs.caption, logs.header], ["Work logs", ["ID", "Name", "Status"]]);
    assert.deepEqual(logs.rows.map(rowText), [
      ["WL-0001", "WorkLog WL-0001", "Approved"],
      ["WL-0003", "WorkLog WL-0003", "Approved"],
    ]);
  });

  test("a log names its five facts and a claimant its two, dangling ids included", () => {
    const one = nodeBlocksOf(nodePages[5]!.blocks)[0]!;
    assert.deepEqual(one.facts.map((fact) => fact.label), [
      "Logged by",
      "Addresses",
      "Submits",
      "Records",
      "Commits",
    ]);
    // The journal has no listing of its own any more; this fact is the way to it.
    assert.deepEqual(one.facts[0]?.inlines, [
      { kind: "link", to: { node: "J-0001" }, text: "Journal J-0001" },
    ]);
    assert.deepEqual(one.facts[2]?.inlines, [
      { kind: "link", to: { node: "CR-0001" }, text: "CompletionReport CR-0001" },
      { kind: "text", text: ", " },
      { kind: "link", to: { node: "EV-0001" }, text: "Evidence EV-0001" },
    ]);
    assert.deepEqual(one.facts[4]?.inlines, [
      { kind: "text", text: "abc1234" },
      { kind: "text", text: ", " },
      { kind: "text", text: "def5678" },
    ]);
    // A finding no file answers to, and a log that produced no commit.
    const two = nodeBlocksOf(nodePages[6]!.blocks)[0]!;
    assert.deepEqual(two.facts[3]?.inlines, [{ kind: "text", text: "F-9999" }]);
    assert.deepEqual(two.facts[4]?.inlines, []);
    const claimant = nodeBlocksOf(nodePages[8]!.blocks)[0]!;
    assert.deepEqual(claimant.facts.map((fact) => fact.label), ["Claims", "Submitted by"]);
    assert.deepEqual(claimant.facts[0]?.inlines, [
      { kind: "link", to: { node: "AC-0001" }, text: "AcceptanceCriterion AC-0001" },
    ]);
    assert.deepEqual(claimant.facts[1]?.inlines, [
      { kind: "link", to: { node: "WL-0001" }, text: "WorkLog WL-0001" },
    ]);
  });
});

describe("what the chapter may not say", () => {
  const said = JSON.stringify([CHAPTER.summary, CHAPTER.blocks, CHAPTER.pages]);

  test("no internal colour word reaches a block", () => {
    assert.doesNotMatch(said, /\b(red|yellow|green|unsat)\b/i);
  });

  test("the journal listing is gone: no table names a journal or reads a body", () => {
    assert.doesNotMatch(said, /recent activity/i);
    const tables = [
      ...tablesOf(CHAPTER.blocks),
      ...CHAPTER.pages.flatMap((page) => tablesOf(page.blocks)),
    ];
    // The columns the old activity table wrote are nowhere now.
    for (const table of tables) {
      assert.deepEqual(
        (table.header ?? []).filter((column) => ["When", "Prompt", "Summary"].includes(column)),
        [],
        JSON.stringify(table.header),
      );
    }
    // And no cell anywhere quotes a body: the journal's own page hands its
    // markdown over verbatim, which is the ONLY place a body may be read.
    const cells = tables.flatMap((table) => table.rows.flatMap((row) => row.map(textOf))).join("|");
    assert.doesNotMatch(cells, /Add the closure ledger|Wrote the ledger and the door/);
    // Nothing links a journal but the work log it wrote.
    assert.deepEqual(
      tables.flatMap((table) => table.rows.flatMap((row) => row.flat())).filter(
        (inline) => inline.kind === "link" && "node" in inline.to && inline.to.node.startsWith("J-"),
      ),
      [],
    );
  });

  test("the coverage checks are gone: no rule label and no pass line", () => {
    assert.doesNotMatch(said, /coverage/i);
    assert.doesNotMatch(said, /without acceptance criteria|without a use case|without a scenario|no responsibility answers to|without a work item|no work item targets/i);
    assert.doesNotMatch(said, /Pass \(\d+ examined\)/);
    for (const table of tablesOf(CHAPTER.blocks)) {
      assert.notDeepEqual(table.header, ["Check", "Result"]);
    }
  });

  test("a node the review has no word for wears no badge and says the dash", () => {
    const blind = new Map(STATUSES);
    blind.delete("WI-0003");
    const chapter = progressChapter.assemble({ ...INPUT, statuses: blind });
    const page = chapter.pages.find((held) => held.id === "progress-work-items");
    assert.ok(page);
    const table = page.blocks[1];
    assert.ok(table && table.kind === "rows");
    const row = table.rows[2]!;
    assert.deepEqual([cellText(row, 0), cellText(row, 5), cellText(row, 6)], ["WI-0003", "—", "—"]);
    const held = nodeBlocksOf(chapter.pages.find((one) => one.id === "WI-0003")!.blocks)[0]!;
    assert.deepEqual([held.id, held.badges], ["WI-0003", []]);
  });
});
