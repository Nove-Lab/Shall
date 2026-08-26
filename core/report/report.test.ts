import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  colorContextOf,
  reviewGraph,
  vitalsOf,
  type Ledgers,
  type PayloadHash,
  type ReviewStatus,
} from "../arith/index.js";
import {
  closureKindOf,
  formatEdgeId,
  type SpecEdge,
  type SpecNode,
} from "../graph/index.js";
import { compare } from "../graph/order.js";
import {
  approvalPayload,
  blocksOf,
  type AcceptanceRecord,
  type ApprovalRecord,
} from "../serialize/index.js";
import type { SpecGraph } from "../store/file-store.js";
import type { ReportInput } from "./model.js";
import { reportFilesOf } from "./report.js";

/**
 * THE WHOLE REPORT, HELD TO THE INVARIANTS NO SINGLE CHAPTER CAN KEEP: every
 * living node has a page of its own, every chapter is tables and nothing else,
 * every href lands on a file and an anchor this run also emitted, no internal
 * colour word survives the crossing into HTML, and two runs over one input are
 * the same bytes. A chapter test speaks for its own blocks; a link between two
 * chapters is nobody's until here.
 *
 * THERE IS NO PRINT COPY ANY MORE, and its absence is an invariant of its own.
 * `full.html` concatenated every page into one file, which meant every node was
 * drawn twice and every anchor was ambiguous between the two drawings; the file
 * set below is asserted WHOLE, so a returning `full.html` fails the first test
 * in this file, and a separate check holds every emitted byte to naming it
 * nowhere.
 *
 * THE FOUR CROSS-CUTTING TYPES ARE TABLED IN NO CHAPTER, so the last suite
 * walks in from the other end: a Constraint, an Assumption, a Decision and a
 * Finding must each be REACHABLE from the page of whatever writes it, since
 * that page is now the only way to them.
 *
 * The fixture is one graph reaching every band, one dangling relation included,
 * because a hole in the spec must read as a hole and never as a door.
 */

const hash: PayloadHash = (payload: string) => `sha256:${payload}`;
const APPROVER = { by: "t", at: "2026-01-01T00:00:00Z" };
const ACCEPTOR = { by: "t", at: "2026-01-02T00:00:00Z" };

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

const criterion = node("AcceptanceCriterion", "AC-0001");
const evidence = node("Evidence", "EV-0001");

const NODES: SpecNode[] = [
  node("Term", "T-0001"),
  node("DomainEntity", "DE-0001"),
  node("Goal", "G-0000"),
  node("Goal", "G-0001"),
  node("Actor", "A-0001"),
  node("UseCase", "UC-0001"),
  node("Scenario", "SC-0001", { body: "## Scenario Type\n\nMain\n" }),
  node("SystemResponsibility", "SR-0001"),
  node("Requirement", "R-0001"),
  criterion,
  node("Constraint", "C-0001"),
  node("Module", "M-0001"),
  node("Decision", "D-0001"),
  node("Finding", "F-0001", { blocking: true, relatedNodes: ["M-0001"] }),
  node("Assumption", "AS-0001"),
  node("WorkItem", "WI-0001"),
  node("Journal", "J-0001", {
    createdAt: Date.UTC(2026, 0, 3),
    body: "## User Prompt\n\nDraw the report.\n\n## Work Summary\n\nWrote the chapters.\n",
  }),
  node("WorkLog", "WL-0001", { commits: ["abc1234"] }),
  evidence,
  node("CompletionReport", "CR-0001"),
];

const EDGES: SpecEdge[] = [
  edge("T-0001", "DENOTES", "DE-0001"),
  edge("G-0000", "REFINES", "G-0001"),
  edge("G-0001", "PURSUED_BY", "A-0001"),
  edge("A-0001", "PERFORMS", "UC-0001"),
  edge("UC-0001", "DETAILS", "SC-0001"),
  edge("SC-0001", "DERIVES_RESPONSIBILITY", "SR-0001"),
  // One criterion under two carriers — chapter 5's page is where that stops
  // being two drawings, and chapters 3 and 7 must both link at that one page.
  edge("SC-0001", "HAS_CRITERION", "AC-0001"),
  edge("R-0001", "HAS_CRITERION", "AC-0001"),
  edge("SR-0001", "REQUIRES", "R-0001"),
  edge("SR-0001", "IS_REALIZED_BY", "M-0001"),
  edge("R-0001", "HAS_CONSTRAINT", "C-0001"),
  // The hole: a requirement depending on a file nothing answers to.
  edge("R-0001", "DEPENDS_ON", "R-9999"),
  edge("M-0001", "ALLOCATES", "WI-0001"),
  edge("M-0001", "ASSUMES", "AS-0001"),
  edge("D-0001", "AFFECTS", "M-0001"),
  edge("WI-0001", "TARGETS", "AC-0001"),
  edge("J-0001", "LOGS", "WL-0001"),
  edge("WL-0001", "ADDRESSES", "WI-0001"),
  edge("WL-0001", "RECORDS", "F-0001"),
  edge("WL-0001", "SUBMITS", "EV-0001"),
  edge("WL-0001", "SUBMITS", "CR-0001"),
  edge("EV-0001", "CLAIMS", "AC-0001"),
  edge("CR-0001", "CLAIMS", "WI-0001"),
];

const GRAPH: SpecGraph = { nodes: NODES, edges: EDGES, problems: [], refused: [] };
// The finding is left unapproved so a pending word reaches the page, and the
// criterion is closed so a met one does — both are checked for below.
const LEDGERS: Ledgers = {
  approvals: new Map(
    NODES.filter((held) => held.id !== "F-0001").map((held) => approve(held, EDGES)),
  ),
  rejections: new Map(),
  acceptances: new Map([accept(criterion, [evidence], EDGES)]),
  hash,
};
const CONTEXT = colorContextOf(GRAPH, LEDGERS);
const VITALS = vitalsOf(GRAPH, LEDGERS);
const INPUT: ReportInput = {
  graph: GRAPH,
  statuses: new Map<string, ReviewStatus>(
    reviewGraph(GRAPH, LEDGERS, CONTEXT).statuses.map((held) => [held.id, held]),
  ),
  context: CONTEXT,
  vitals: VITALS,
  stamp: { projectName: "Test", generatedAt: "2026-01-01T00:00:00.000Z", gitHead: null },
};

const FILES = reportFilesOf(INPUT);
const BY_PATH = new Map(FILES.map((file) => [file.path, file.content]));
const PAGES = FILES.filter((file) => file.path.endsWith(".html"));
const CHAPTER_PAGES = PAGES.filter((file) => file.path.startsWith("chapters/"));
const NODE_PAGES = PAGES.filter((file) => file.path.startsWith("nodes/"));

const INDEX_FILE = "index.html";

/** Chapter 7's four bars, each beside the listing page its label opens. */
const LISTINGS = [
  ["scenarios", "progress/scenarios.html"],
  ["requirements", "progress/requirements.html"],
  ["criteria", "progress/criteria.html"],
  ["workItems", "progress/work-items.html"],
] as const;

function hrefsOf(content: string): string[] {
  return [...content.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? "");
}

/** Every "n of m" a ratio bar drew on one page, in the order the page drew them. */
function ratioFiguresOf(content: string): number[][] {
  return [...content.matchAll(/<span class="ratio-value">(\d+) of (\d+)<\/span>/g)].map((match) => [
    Number(match[1]),
    Number(match[2]),
  ]);
}

/** One href resolved against the file that wrote it — the browser's arithmetic. */
function resolve(from: string, href: string): { file: string; anchor: string | null } {
  const hashAt = href.indexOf("#");
  const anchor = hashAt === -1 ? null : href.slice(hashAt + 1);
  const path = hashAt === -1 ? href : href.slice(0, hashAt);
  if (path === "") {
    return { file: from, anchor };
  }
  const segments = from.split("/").slice(0, -1);
  for (const step of path.split("/")) {
    if (step === "..") {
      segments.pop();
    } else if (step !== ".") {
      segments.push(step);
    }
  }
  return { file: segments.join("/"), anchor };
}

function contentOf(path: string): string {
  const held = BY_PATH.get(path);
  assert.ok(held !== undefined, `${path} is emitted`);
  return held;
}

describe("the file set", () => {
  test("is the index, the stylesheet, seven chapters, four listings and a page per living node", () => {
    assert.deepEqual([...BY_PATH.keys()].sort(compare), [
      "assets/report.css",
      "chapters/01-terms.html",
      "chapters/02-goals.html",
      "chapters/03-actors.html",
      "chapters/04-responsibilities.html",
      "chapters/05-requirements.html",
      "chapters/06-design.html",
      "chapters/07-progress.html",
      "index.html",
      "nodes/A-0001.html",
      "nodes/AC-0001.html",
      "nodes/AS-0001.html",
      "nodes/C-0001.html",
      "nodes/CR-0001.html",
      "nodes/D-0001.html",
      "nodes/DE-0001.html",
      "nodes/EV-0001.html",
      "nodes/F-0001.html",
      "nodes/G-0000.html",
      "nodes/G-0001.html",
      "nodes/J-0001.html",
      "nodes/M-0001.html",
      "nodes/R-0001.html",
      "nodes/SC-0001.html",
      "nodes/SR-0001.html",
      "nodes/T-0001.html",
      "nodes/UC-0001.html",
      "nodes/WI-0001.html",
      "nodes/WL-0001.html",
      "progress/criteria.html",
      "progress/requirements.html",
      "progress/scenarios.html",
      "progress/work-items.html",
    ]);
    assert.equal(FILES.length, BY_PATH.size);
    // The same list said as the rules that produced it, so a reader of a
    // failure learns which rule broke rather than which line of the array did.
    assert.ok(!BY_PATH.has("full.html"), "the print copy is gone and stays gone");
    for (const [, file] of LISTINGS) {
      assert.ok(BY_PATH.has(file), `${file} is emitted`);
    }
    assert.deepEqual(
      NODE_PAGES.map((file) => file.path).sort(compare),
      NODES.map((held) => `nodes/${held.id}.html`).sort(compare),
    );
  });

  test("gives every living node its own page, drawn there exactly once", () => {
    for (const held of NODES) {
      const page = contentOf(`nodes/${held.id}.html`);
      assert.ok(page.includes(`id="${held.id}"`), `${held.id} is not anchored on its own page`);
      assert.equal(
        [...page.matchAll(/<section class="node"/g)].length,
        1,
        `nodes/${held.id}.html draws its node exactly once`,
      );
    }
    // And nowhere else: with the print copy gone, the count over the WHOLE
    // emitted set is the count of nodes, so no page has quietly become a
    // second drawing of somebody.
    assert.equal(
      PAGES.reduce(
        (total, file) => total + [...file.content.matchAll(/<section class="node"/g)].length,
        0,
      ),
      NODES.length,
      "every node block in the report is its own page's",
    );
  });
});

describe("the chapters", () => {
  test("are tables — not one node block stands on a chapter page", () => {
    for (const file of CHAPTER_PAGES) {
      assert.ok(
        !file.content.includes('<section class="node"'),
        `${file.path} stacks a node block instead of tabling its rows`,
      );
    }
  });

  test("no longer table the four cross-cutting types anywhere", () => {
    // Chapter 5 dropped its Constraints table and chapter 6 its Decisions,
    // Findings and Assumptions sections; the pages are still assembled, and
    // the suite below holds the ways IN to them.
    const requirements = contentOf("chapters/05-requirements.html");
    assert.ok(!requirements.includes("Constraints"), "chapter 5 still tables constraints");
    const design = contentOf("chapters/06-design.html");
    for (const heading of ["Decisions", "Findings", "Assumptions"]) {
      assert.ok(!design.includes(heading), `chapter 6 still heads a ${heading} section`);
    }
  });

  test("name the print copy nowhere, and link at it nowhere", () => {
    for (const file of FILES) {
      assert.ok(!file.content.includes("full.html"), `${file.path} still names the print copy`);
    }
    for (const file of PAGES) {
      for (const href of hrefsOf(file.content)) {
        assert.notEqual(resolve(file.path, href).file, "full.html", `${file.path} → ${href}`);
      }
    }
  });
});

describe("every link", () => {
  test("lands on a file this run emitted, and on an anchor that file carries", () => {
    let checked = 0;
    for (const file of PAGES) {
      for (const href of hrefsOf(file.content)) {
        // Nothing in the report leaves it: no scheme, no absolute path.
        assert.doesNotMatch(href, /^([a-z][a-z0-9+.-]*:|\/)/i, `${file.path} → ${href}`);
        const { file: target, anchor } = resolve(file.path, href);
        assert.ok(BY_PATH.has(target), `${file.path} → ${href} is no emitted file`);
        if (anchor !== null) {
          assert.ok(
            contentOf(target).includes(`id="${anchor}"`),
            `${file.path} → ${href} lands on no anchor`,
          );
        }
        checked += 1;
      }
    }
    assert.ok(checked > 100, "the report is linked at all");
  });

  test("carries the four ratio labels down to the four listings, and the listings back up", () => {
    // The one crossing the check above would pass vacuously if the bars had
    // stopped linking at all: name it, so the coverage is not an accident.
    const chapter = "chapters/07-progress.html";
    const down = new Set(
      hrefsOf(contentOf(chapter)).map((href) => resolve(chapter, href).file),
    );
    for (const [, file] of LISTINGS) {
      assert.ok(down.has(file), `chapter 7's bar does not open ${file}`);
      assert.ok(
        hrefsOf(contentOf(file)).some((href) => resolve(file, href).file === chapter),
        `${file} has no way back to chapter 7`,
      );
    }
  });

  test("draws the twice-carried criterion once, and sends every mention of it there", () => {
    // Wherever it is named — from a chapter table, from a listing, from a
    // carrier's page — the href resolves to the one drawing of it.
    const targets = new Set<string>();
    for (const file of PAGES) {
      for (const href of hrefsOf(file.content)) {
        if (!href.includes("AC-0001")) {
          continue;
        }
        const { file: target, anchor } = resolve(file.path, href);
        targets.add(anchor === null ? target : `${target}#${anchor}`);
      }
    }
    assert.deepEqual([...targets], ["nodes/AC-0001.html"]);
    // Both carriers and both claims on it reach it, from the pages beside it
    // and from the chapter tables that list them.
    for (const id of ["SC-0001", "R-0001", "WI-0001", "EV-0001"]) {
      assert.ok(hrefsOf(contentOf(`nodes/${id}.html`)).includes("AC-0001.html"), id);
    }
    // The chapter page itself no longer tables criteria — the way in is the
    // requirement's own page, held by the loop above.
    assert.match(
      contentOf("progress/criteria.html"),
      /href="\.\.\/nodes\/AC-0001\.html"/,
      "the criteria listing",
    );
  });

  test("says a dangling relation where the relation is drawn, and never points at it", () => {
    // The hole is a fact under the node that writes it, so it reads on that
    // node's page — and, being nobody's file, is never a link anywhere.
    assert.ok(contentOf("nodes/R-0001.html").includes("R-9999"));
    for (const file of PAGES) {
      for (const href of hrefsOf(file.content)) {
        assert.ok(!href.includes("R-9999"), `${file.path} links at a hole`);
      }
    }
  });
});

describe("the emitted words", () => {
  test("never carry the internal vocabulary across", () => {
    for (const file of PAGES) {
      assert.doesNotMatch(file.content, /\b(red|yellow|green|unsat)\b/i, file.path);
    }
  });

  test("carry the plain ones instead, so the check above is not vacuous", () => {
    assert.ok(
      contentOf("nodes/F-0001.html").includes("Awaiting review"),
      "the unapproved finding says so",
    );
    assert.ok(contentOf("chapters/06-design.html").includes("Approved"), "the module says so");
    assert.ok(contentOf("nodes/AC-0001.html").includes("Met"), "the closed criterion says so");
    assert.ok(
      contentOf("chapters/05-requirements.html").includes("Satisfied"),
      "the satisfied carrier says so",
    );
  });
});

describe("two runs", () => {
  test("over one input are the same bytes, file for file", () => {
    assert.deepEqual(reportFilesOf(INPUT), FILES);
  });

  test("differing only in the stamp differ only in the index's stamp line", () => {
    // The stamp is the one thing outside the graph the report prints, and
    // since the print copy went it is printed on ONE page. Every other file
    // is a pure function of the graph, and a diff of the two runs proves it.
    const restamped = reportFilesOf({
      ...INPUT,
      stamp: {
        ...INPUT.stamp,
        generatedAt: "2027-06-30T12:34:56.000Z",
        gitHead: "0123456789abcdef",
      },
    });
    assert.deepEqual(
      restamped.map((file) => file.path),
      FILES.map((file) => file.path),
    );
    for (const file of restamped) {
      if (file.path !== INDEX_FILE) {
        assert.equal(file.content, contentOf(file.path), `${file.path} moved with the clock`);
      }
    }
    const before = contentOf(INDEX_FILE).split("\n");
    const after = (restamped.find((file) => file.path === INDEX_FILE)?.content ?? "").split("\n");
    assert.equal(before.length, after.length, "the index changed shape, not just its stamp");
    const moved = before.filter((line, at) => line !== after[at]);
    assert.equal(moved.length, 1, "more than the stamp line moved");
    assert.match(moved[0] ?? "", /Generated 2026-01-01 00:00 UTC/);
    assert.match(
      after[before.indexOf(moved[0] ?? "")] ?? "",
      /Generated 2027-06-30 12:34 UTC · commit 0123456/,
    );
  });
});

describe("chapter 7's ratios", () => {
  test("are the vitals' own figures, in the vitals' own order", () => {
    const { scenarios, requirements, criteria, workItems } = VITALS.progress;
    const expected = [
      [scenarios.numerator, scenarios.denominator],
      [requirements.numerator, requirements.denominator],
      [criteria.numerator, criteria.denominator],
      [workItems.numerator, workItems.denominator],
    ];
    assert.deepEqual(ratioFiguresOf(contentOf("chapters/07-progress.html")), expected);
    // And the fixture is not four zeroes pretending to agree.
    assert.deepEqual(expected, [[1, 1], [1, 1], [1, 1], [0, 1]]);
  });

  test("are said again at the head of each listing, and say the same thing", () => {
    for (const [key, file] of LISTINGS) {
      const row = VITALS.progress[key];
      assert.deepEqual(
        ratioFiguresOf(contentOf(file)),
        [[row.numerator, row.denominator]],
        `${file} heads with its own axis, once`,
      );
    }
  });
});

describe("the four cross-cutting types", () => {
  test("are tabled in no chapter, and so are reached from what writes them", () => {
    // Each pair is: the node the fixture hangs it off, and the id that must be
    // a LINK on that node's page. Nothing else in the report leads to them.
    const ways: [string, string][] = [
      // R-0001 HAS_CONSTRAINT C-0001 — the constraint, off what it constrains.
      ["nodes/R-0001.html", "C-0001"],
      // M-0001 ASSUMES AS-0001 — the assumption, off what takes it as given.
      ["nodes/M-0001.html", "AS-0001"],
      // D-0001 AFFECTS M-0001 — the decision, off the node it reached.
      ["nodes/M-0001.html", "D-0001"],
      // WL-0001 RECORDS F-0001 — the finding, off the work log that wrote it.
      ["nodes/WL-0001.html", "F-0001"],
    ];
    for (const [from, id] of ways) {
      assert.ok(
        hrefsOf(contentOf(from)).some((href) => resolve(from, href).file === `nodes/${id}.html`),
        `${from} is no way to ${id}`,
      );
      assert.ok(BY_PATH.has(`nodes/${id}.html`), `${id} has no page to be reached at`);
    }
  });
});
