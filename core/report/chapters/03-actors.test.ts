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
import { approvalPayload, blocksOf, type AcceptanceRecord } from "../../serialize/index.js";
import type { SpecGraph } from "../../store/index.js";
import type { Block, Cell, Inline, ReportInput } from "../model.js";
import { actorsChapter } from "./03-actors.js";

/**
 * Chapter 3, over a graph built by hand: three tables and a page per node.
 *
 * WHAT IS HELD TO. The chapter page is tables and headings and nothing else —
 * no body ever stacks on it. Every actor, use case and scenario the graph holds
 * has a row, whatever its edges did, and a page of its own carrying its body
 * verbatim. The edge walks the old layout proved are proved here in table form:
 * both directions, the ids no file answers to, the use case two actors perform,
 * and the scenario grouping read off the author's own word.
 */

const hash: PayloadHash = (payload: string) => `sha256:${payload}`;

const ACCEPTOR = { by: "t", at: "2026-08-16T00:00:00Z" };

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

function scenario(id: string, said: string | null): SpecNode {
  return node("Scenario", id, {
    body:
      said === null
        ? `What ${id} says.`
        : `## Scenario Type\n\n${said}\n\n## Steps\n\nWhat ${id} says.`,
  });
}

function edge(fromId: string, type: string, toId: string): SpecEdge {
  return { id: formatEdgeId(fromId, type, toId), type, fromId, toId };
}

function graphOf(nodes: readonly SpecNode[], edges: readonly SpecEdge[]): SpecGraph {
  return { nodes: [...nodes], edges: [...edges], problems: [], refused: [] };
}

/**
 * A-0001 performs UC-0001, UC-0002 and an id nothing answers to; A-0002
 * performs UC-0001 as well; A-0003 performs nothing and stands proposed for
 * deletion. UC-0001 is detailed by one scenario of each named kind, out of id
 * order, UC-0002 by one whose word is none of the three plus a dangling id, and
 * UC-0003 by none. SC-0001 carries one criterion that is met and one id no file
 * answers to, and derives a responsibility; SC-0005 is detailed by nothing and
 * says no kind.
 *
 * G-0001 pursues the first two actors so that the status column reads two ways:
 * a node nothing holds is the one wearing the other word.
 */
const NODES: SpecNode[] = [
  node("Goal", "G-0001"),
  node("Actor", "A-0001"),
  node("Actor", "A-0002"),
  node("Actor", "A-0003", {
    deletionProposed: { by: "t", rationale: "Nobody plays this part." },
  }),
  node("UseCase", "UC-0001"),
  node("UseCase", "UC-0002"),
  node("UseCase", "UC-0003"),
  scenario("SC-0001", "Main"),
  scenario("SC-0002", "Exception"),
  scenario("SC-0003", "alternative"),
  scenario("SC-0004", "Special"),
  scenario("SC-0005", null),
  node("AcceptanceCriterion", "AC-0001"),
  node("SystemResponsibility", "SR-0001"),
  // The cross-cutting three, tabled in no chapter: one hangs off each of the
  // chapter's types, so each type's page is caught being the road to them.
  node("Constraint", "C-0001"),
  node("Assumption", "AS-0001"),
  node("Decision", "D-0001"),
];

const EDGES: SpecEdge[] = [
  edge("G-0001", "PURSUED_BY", "A-0001"),
  edge("G-0001", "PURSUED_BY", "A-0002"),
  edge("A-0001", "PERFORMS", "UC-0001"),
  edge("A-0001", "PERFORMS", "UC-0002"),
  edge("A-0001", "PERFORMS", "UC-9999"),
  edge("A-0002", "PERFORMS", "UC-0001"),
  edge("UC-0001", "DETAILS", "SC-0001"),
  edge("UC-0001", "DETAILS", "SC-0002"),
  edge("UC-0001", "DETAILS", "SC-0003"),
  edge("UC-0002", "DETAILS", "SC-0004"),
  edge("UC-0002", "DETAILS", "SC-9999"),
  edge("SC-0001", "HAS_CRITERION", "AC-0001"),
  edge("SC-0001", "HAS_CRITERION", "AC-9999"),
  edge("SC-0001", "DERIVES_RESPONSIBILITY", "SR-0001"),
  // One of the cross-cutting three per type, and all three on the scenario.
  edge("A-0001", "HAS_CONSTRAINT", "C-0001"),
  edge("UC-0001", "ASSUMES", "AS-0001"),
  edge("SC-0001", "HAS_CONSTRAINT", "C-0001"),
  edge("SC-0001", "ASSUMES", "AS-0001"),
  edge("D-0001", "AFFECTS", "SC-0001"),
];

/** The criterion's own hash, so the acceptance below stands and it reads met. */
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

function acceptanceOf(subject: SpecNode): [string, AcceptanceRecord] {
  return [
    subject.id,
    {
      kind: "criterion",
      subjectHash: hashOf(subject, EDGES),
      claimants: new Map<string, string>(),
      ...ACCEPTOR,
    },
  ];
}

const LEDGERS: Ledgers = {
  approvals: new Map(),
  rejections: new Map(),
  acceptances: new Map([acceptanceOf(node("AcceptanceCriterion", "AC-0001"))]),
  hash,
};

function inputOf(nodes: readonly SpecNode[], edges: readonly SpecEdge[]): ReportInput {
  const graph = graphOf(nodes, edges);
  const context = colorContextOf(graph, LEDGERS);
  const review = reviewGraph(graph, LEDGERS, context);
  return {
    graph,
    statuses: new Map(review.statuses.map((status) => [status.id, status])),
    context,
    vitals: vitalsOf(graph, LEDGERS),
    stamp: {
      projectName: "Test",
      generatedAt: "2026-01-01T00:00:00.000Z",
      gitHead: null,
    },
  };
}

const CHAPTER = actorsChapter.assemble(inputOf(NODES, EDGES));

/** One block as the one line a structural assertion needs. */
function shape(block: Block): string {
  switch (block.kind) {
    case "heading":
      return `h${block.level} ${block.text}`;
    case "node":
      return `node ${block.id}@${block.depth}`;
    case "rows":
      return `rows ${block.header === null ? "-" : block.header.join("/")} ${block.rows.length}`;
    default:
      return block.kind;
  }
}

/** One cell as a line: links carry their target, badges their label. */
function say(cell: Cell): string {
  return cell
    .map((inline) => {
      switch (inline.kind) {
        case "text":
          return inline.text;
        case "link":
          return `${inline.text}→${"node" in inline.to ? inline.to.node : inline.to.file}`;
        case "badge":
          return `<${inline.badge.label}>`;
      }
    })
    .join("");
}

function rowsAt(index: number): Cell[][] {
  const block = CHAPTER.blocks[index];
  assert.ok(block, `block ${index} is there`);
  assert.equal(block.kind, "rows");
  return block.kind === "rows" ? block.rows : [];
}

function said(rows: Cell[][]): string[][] {
  return rows.map((row) => row.map(say));
}

function pageOf(id: string): { id: string; title: string; blocks: Block[] } {
  const page = CHAPTER.pages.find((held) => held.id === id);
  assert.ok(page, `${id} has a page`);
  return page;
}

function nodeBlockOf(id: string): Extract<Block, { kind: "node" }> {
  const first = pageOf(id).blocks[0];
  assert.ok(first, `${id}'s page opens with a block`);
  assert.equal(first.kind, "node");
  if (first.kind !== "node") {
    throw new Error("unreachable");
  }
  return first;
}

function factsOf(id: string): { label: string; inlines: Inline[] }[] {
  return nodeBlockOf(id).facts;
}

/**
 * The three lines the grammar permits of all three types here, in the order
 * every page closes with them.
 */
const CROSS_CUTTING = ["Constraints", "Assumptions", "Decisions"];

/** A page's own lines — what is left when the cross-cutting three are taken off. */
function ownFactsOf(id: string): { label: string; inlines: Inline[] }[] {
  const facts = factsOf(id);
  assert.deepEqual(
    facts.slice(-CROSS_CUTTING.length).map((fact) => fact.label),
    CROSS_CUTTING,
    `${id} closes with the cross-cutting three`,
  );
  return facts.slice(0, -CROSS_CUTTING.length);
}

/** Those same three lines, by label and by what each links at. */
function crossCuttingOf(id: string): [string, Inline[]][] {
  return factsOf(id)
    .slice(-CROSS_CUTTING.length)
    .map((fact) => [fact.label, fact.inlines]);
}

describe("chapter 3 — actors and use cases", () => {
  test("the chapter is three tables, the scenarios grouped, and not one body", () => {
    assert.deepEqual(CHAPTER.blocks.map(shape), [
      "h2 Actors",
      "rows ID/Short name/Name/Performs/Status 3",
      "h2 Use cases",
      "rows ID/Short name/Name/Performed by/Scenarios/Status 3",
      "h2 Scenarios",
      "h3 Main scenarios",
      "rows ID/Name/Details of/Criteria/Status 1",
      "h3 Alternative scenarios",
      "rows ID/Name/Details of/Criteria/Status 1",
      "h3 Exception scenarios",
      "rows ID/Name/Details of/Criteria/Status 1",
      "h3 Other scenarios",
      "rows ID/Name/Details of/Criteria/Status 2",
    ]);
    assert.equal(
      CHAPTER.blocks.filter((block) => block.kind === "node").length,
      0,
    );
    assert.equal(CHAPTER.summary, "3 actors, 3 use cases, 5 scenarios.");
  });

  test("the TOC entries are the three tables", () => {
    assert.deepEqual(
      CHAPTER.blocks
        .filter(
          (block): block is Extract<Block, { kind: "heading" }> =>
            block.kind === "heading" && block.inToc,
        )
        .map((block) => [block.text, block.anchor]),
      [
        ["Actors", "actors"],
        ["Use cases", "use-cases"],
        ["Scenarios", "scenarios"],
      ],
    );
  });

  test("every actor is a row: what it performs, dangling ids as themselves", () => {
    assert.deepEqual(said(rowsAt(1)), [
      [
        "A-0001→A-0001",
        "A-0001",
        "Actor A-0001",
        "UC-0001→UC-0001, UC-0002→UC-0002, UC-9999",
        "<Awaiting review>",
      ],
      ["A-0002→A-0002", "A-0002", "Actor A-0002", "UC-0001→UC-0001", "<Awaiting review>"],
      [
        "A-0003→A-0003",
        "A-0003",
        "Actor A-0003",
        "—",
        "<Needs attention> <Deletion proposed>",
      ],
    ]);
    // The ID cell is the way to the node's own page, and the relation cell
    // holds several inlines with plain commas between them.
    assert.deepEqual(rowsAt(1)[0]?.[0], [
      { kind: "link", to: { node: "A-0001" }, text: "A-0001" },
    ]);
    assert.deepEqual(rowsAt(1)[0]?.[3], [
      { kind: "link", to: { node: "UC-0001" }, text: "UC-0001" },
      { kind: "text", text: ", " },
      { kind: "link", to: { node: "UC-0002" }, text: "UC-0002" },
      { kind: "text", text: ", " },
      { kind: "text", text: "UC-9999" },
    ]);
    assert.deepEqual(rowsAt(1)[2]?.[3], [{ kind: "text", text: "—" }]);
  });

  test("a use case says who performs it and how many scenarios detail it", () => {
    assert.deepEqual(said(rowsAt(3)), [
      [
        "UC-0001→UC-0001",
        "UC-0001",
        "UseCase UC-0001",
        "A-0001→A-0001, A-0002→A-0002",
        "3",
        "<Awaiting review>",
      ],
      [
        "UC-0002→UC-0002",
        "UC-0002",
        "UseCase UC-0002",
        "A-0001→A-0001",
        "2",
        "<Awaiting review>",
      ],
      ["UC-0003→UC-0003", "UC-0003", "UseCase UC-0003", "—", "0", "<Needs attention>"],
    ]);
  });

  test("the scenarios are grouped by the author's own word, and every one is in a group", () => {
    assert.deepEqual(said(rowsAt(6)), [
      [
        "SC-0001→SC-0001",
        "Scenario SC-0001",
        "UC-0001→UC-0001",
        "1 of 2 met",
        "<Awaiting review> <Not yet satisfied>",
      ],
    ]);
    assert.deepEqual(said(rowsAt(8))[0]?.[0], "SC-0003→SC-0003");
    assert.deepEqual(said(rowsAt(10))[0]?.[0], "SC-0002→SC-0002");
    assert.deepEqual(said(rowsAt(12)), [
      [
        "SC-0004→SC-0004",
        "Scenario SC-0004",
        "UC-0002→UC-0002",
        "—",
        "<Awaiting review> <No criteria yet>",
      ],
      [
        "SC-0005→SC-0005",
        "Scenario SC-0005",
        "—",
        "—",
        "<Needs attention> <No criteria yet>",
      ],
    ]);
  });

  test("a node the review has no status for wears a dash, not a guess", () => {
    const bare = actorsChapter.assemble({
      ...inputOf(NODES, EDGES),
      statuses: new Map(),
    });
    const rows = bare.blocks[1];
    assert.equal(rows?.kind, "rows");
    if (rows?.kind === "rows") {
      assert.deepEqual(rows.rows[0]?.[4], [{ kind: "text", text: "—" }]);
      // The proposal is the node's own field, so it is said either way.
      assert.deepEqual(rows.rows[2]?.[4], [
        { kind: "badge", badge: { label: "Deletion proposed", tone: "neutral" } },
      ]);
    }
  });

  test("every node of the three types has a page, and its body is on it", () => {
    assert.deepEqual(
      CHAPTER.pages.map((page) => page.id),
      [
        "A-0001",
        "A-0002",
        "A-0003",
        "UC-0001",
        "UC-0002",
        "UC-0003",
        "SC-0001",
        "SC-0002",
        "SC-0003",
        "SC-0004",
        "SC-0005",
      ],
    );
    for (const held of NODES) {
      if (held.type !== "Actor" && held.type !== "UseCase" && held.type !== "Scenario") {
        continue;
      }
      const block = nodeBlockOf(held.id);
      assert.equal(pageOf(held.id).title, held.name);
      assert.equal(block.depth, 0);
      assert.equal(block.type, held.type);
      assert.equal(block.body, held.body);
    }
    assert.equal(
      nodeBlockOf("SC-0001").body,
      "## Scenario Type\n\nMain\n\n## Steps\n\nWhat SC-0001 says.",
    );
  });

  test("a page's facts name the far end in full, and say nothing where there is nothing", () => {
    assert.deepEqual(ownFactsOf("A-0001"), [
      {
        label: "Performs",
        inlines: [
          { kind: "link", to: { node: "UC-0001" }, text: "UseCase UC-0001" },
          { kind: "text", text: ", " },
          { kind: "link", to: { node: "UC-0002" }, text: "UseCase UC-0002" },
          { kind: "text", text: ", " },
          { kind: "text", text: "UC-9999" },
        ],
      },
    ]);
    assert.deepEqual(ownFactsOf("A-0003"), [{ label: "Performs", inlines: [] }]);
    assert.deepEqual(ownFactsOf("UC-0002"), [
      {
        label: "Performed by",
        inlines: [{ kind: "link", to: { node: "A-0001" }, text: "Actor A-0001" }],
      },
      {
        label: "Details",
        inlines: [
          { kind: "link", to: { node: "SC-0004" }, text: "Scenario SC-0004" },
          { kind: "text", text: ", " },
          { kind: "text", text: "SC-9999" },
        ],
      },
    ]);
    assert.deepEqual(ownFactsOf("UC-0003"), [
      { label: "Performed by", inlines: [] },
      { label: "Details", inlines: [] },
    ]);
    assert.deepEqual(ownFactsOf("SC-0001"), [
      {
        label: "Details of",
        inlines: [{ kind: "link", to: { node: "UC-0001" }, text: "UseCase UC-0001" }],
      },
      {
        label: "Derives",
        inlines: [
          {
            kind: "link",
            to: { node: "SR-0001" },
            text: "SystemResponsibility SR-0001",
          },
        ],
      },
    ]);
  });

  test("a constraint, an assumption and a decision are reached from what they hang off", () => {
    // The scenario writes two of the three and the decision is written at it —
    // three lines, three links, and none of the three tabled in any chapter.
    assert.deepEqual(crossCuttingOf("SC-0001"), [
      [
        "Constraints",
        [{ kind: "link", to: { node: "C-0001" }, text: "Constraint C-0001" }],
      ],
      [
        "Assumptions",
        [{ kind: "link", to: { node: "AS-0001" }, text: "Assumption AS-0001" }],
      ],
      ["Decisions", [{ kind: "link", to: { node: "D-0001" }, text: "Decision D-0001" }]],
    ]);
    assert.deepEqual(crossCuttingOf("A-0001")[0], [
      "Constraints",
      [{ kind: "link", to: { node: "C-0001" }, text: "Constraint C-0001" }],
    ]);
    assert.deepEqual(crossCuttingOf("UC-0001")[1], [
      "Assumptions",
      [{ kind: "link", to: { node: "AS-0001" }, text: "Assumption AS-0001" }],
    ]);
  });

  test("all three lines stand on every page, empty where nothing was written", () => {
    // The grammar permits all three of an Actor, a UseCase and a Scenario, so
    // the page says so even with no edge to show — the absence IS the answer.
    for (const id of ["A-0002", "A-0003", "UC-0002", "UC-0003", "SC-0004", "SC-0005"]) {
      assert.deepEqual(
        crossCuttingOf(id),
        [
          ["Constraints", []],
          ["Assumptions", []],
          ["Decisions", []],
        ],
        id,
      );
    }
    // And the lines close the page, after whatever the type's own lines are.
    assert.deepEqual(
      factsOf("UC-0001").map((fact) => fact.label),
      ["Performed by", "Details", "Constraints", "Assumptions", "Decisions"],
    );
  });

  test("a scenario's page tables its criteria, and a dangling one keeps its row", () => {
    const table = pageOf("SC-0001").blocks[1];
    assert.ok(table);
    assert.equal(table.kind, "rows");
    if (table.kind === "rows") {
      assert.equal(table.caption, "Acceptance criteria");
      assert.deepEqual(table.header, ["ID", "Name", "Status"]);
      assert.deepEqual(said(table.rows), [
        ["AC-0001→AC-0001", "AcceptanceCriterion AC-0001", "<Met>"],
        ["AC-9999", "—", "—"],
      ]);
      assert.deepEqual(table.rows[1], [
        [{ kind: "text", text: "AC-9999" }],
        [{ kind: "text", text: "—" }],
        [{ kind: "text", text: "—" }],
      ]);
    }
    // A scenario that writes no criterion still asks the question.
    const empty = pageOf("SC-0005").blocks[1];
    assert.equal(empty?.kind, "rows");
    if (empty?.kind === "rows") {
      assert.equal(empty.caption, "Acceptance criteria");
      assert.deepEqual(empty.rows, []);
    }
  });

  test("a scenario wears both its axes, an actor only its registration", () => {
    assert.deepEqual(
      nodeBlockOf("SC-0001").badges.map((badge) => badge.label),
      ["Awaiting review", "Not yet satisfied"],
    );
    assert.deepEqual(
      nodeBlockOf("A-0003").badges.map((badge) => badge.label),
      ["Needs attention", "Deletion proposed"],
    );
    assert.deepEqual(
      nodeBlockOf("UC-0001").badges.map((badge) => badge.label),
      ["Awaiting review"],
    );
  });

  test("one actor, one use case, one scenario are said in the singular", () => {
    const small = actorsChapter.assemble(
      inputOf(
        [node("Actor", "A-0001"), node("UseCase", "UC-0001"), scenario("SC-0001", "Main")],
        [edge("A-0001", "PERFORMS", "UC-0001"), edge("UC-0001", "DETAILS", "SC-0001")],
      ),
    );
    assert.equal(small.summary, "1 actor, 1 use case, 1 scenario.");
    assert.deepEqual(small.blocks.map(shape), [
      "h2 Actors",
      "rows ID/Short name/Name/Performs/Status 1",
      "h2 Use cases",
      "rows ID/Short name/Name/Performed by/Scenarios/Status 1",
      "h2 Scenarios",
      "h3 Main scenarios",
      "rows ID/Name/Details of/Criteria/Status 1",
    ]);
  });

  test("the internal vocabulary reaches no word on the page", () => {
    const spoken: string[] = [CHAPTER.summary];
    const eat = (blocks: readonly Block[]): void => {
      for (const block of blocks) {
        const inlines: Inline[] = [];
        if (block.kind === "heading") {
          spoken.push(block.text);
        }
        if (block.kind === "line") {
          inlines.push(...block.inlines);
        }
        if (block.kind === "node") {
          spoken.push(block.name, block.shortName, block.type, block.body ?? "");
          spoken.push(...block.badges.map((badge) => badge.label));
          for (const fact of block.facts) {
            spoken.push(fact.label);
            inlines.push(...fact.inlines);
          }
        }
        if (block.kind === "rows") {
          spoken.push(block.caption ?? "", ...(block.header ?? []));
          inlines.push(...block.rows.flat().flat());
        }
        for (const inline of inlines) {
          spoken.push(inline.kind === "badge" ? inline.badge.label : inline.text);
        }
      }
    };
    eat(CHAPTER.blocks);
    for (const page of CHAPTER.pages) {
      spoken.push(page.title);
      eat(page.blocks);
    }
    for (const line of spoken) {
      assert.doesNotMatch(line, /\b(red|yellow|green|unsat)\b/i, line);
    }
  });

  test("the same graph assembles the same chapter twice", () => {
    assert.deepEqual(actorsChapter.assemble(inputOf(NODES, EDGES)), CHAPTER);
  });
});
