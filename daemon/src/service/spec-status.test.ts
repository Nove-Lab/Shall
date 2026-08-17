import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import { isRefusal, type Refusal } from "./errors.js";
import { createProject } from "./projects.js";
import { createSpecEdge, createSpecNode } from "./spec-graph.js";
import {
  acceptSpecClosure,
  approveSpecNodes,
  rejectSpecNode,
} from "./spec-queue.js";
import { boardAt, statusSpec } from "./spec-status.js";
import type { RegistryProject } from "../types.js";

/**
 * The status surface over real folders and real books.
 *
 * WHAT IS ASSERTED IS WHAT AN AGENT WOULD READ. A colour, the word for why, the
 * sentence a rule wrote, the rationale a reviewer typed — every one of them is
 * checked whole, because this surface exists so that nobody works the answer
 * out for themselves, and half an answer is worse than none.
 *
 * EVERY JUDGEMENT HERE IS MADE THROUGH ITS OWN DOOR. Not one ledger is written
 * by hand: a green comes from the approve door, a red-by-rejection from the
 * reject door, a closure from the accept door — so what these tests read back
 * is what the daemon really produces.
 */

let home = "";
let workspace = "";

before(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "shall-status-"));
  home = path.join(workspace, "home");
  await mkdir(home, { recursive: true });
  // A fake `~`, which is what licenses moving `$HOME` at all: `getShallHome`
  // reads `os.homedir()` on every call, so this redirects the registry and the
  // config without a seam that exists only for tests, and git's own config is
  // fenced beside it. `spec-review.test.ts` spells the bargain out in full.
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = path.join(home, ".config");
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});

async function newProject(): Promise<RegistryProject> {
  return createProject(await mkdtemp(path.join(workspace, "project-")));
}

async function node(
  project: RegistryProject,
  type: string,
  id: string,
): Promise<void> {
  await createSpecNode({
    projectId: project.id,
    type,
    id,
    shortName: id.toLowerCase(),
    name: `The node called ${id}`,
    body: `What ${id} says.`,
  });
}

async function edge(
  project: RegistryProject,
  type: string,
  fromId: string,
  toId: string,
): Promise<void> {
  await createSpecEdge({ projectId: project.id, type, fromId, toId });
}

function specFile(project: RegistryProject, file: string): string {
  return path.join(project.path, ".shall", "spec", ...file.split("/"));
}

/**
 * The three books as bytes, in the order they were added to the design — null
 * for one no judgement has made yet, which is a state to compare like any
 * other.
 */
async function books(
  project: RegistryProject,
): Promise<(string | null)[]> {
  return Promise.all(
    ["approvals.yaml", "rejections.yaml", "acceptances.yaml"].map((file) =>
      readFile(
        path.join(project.path, ".shall", "ledger", file),
        "utf8",
      ).then(
        (text) => text,
        () => null,
      ),
    ),
  );
}

/** Goal down to a task, with a log that submits evidence for the criterion and a report for the task. */
const NODES: readonly (readonly [string, string])[] = [
  ["Goal", "G-0001"],
  ["Actor", "A-0001"],
  ["UseCase", "UC-0001"],
  ["Scenario", "SC-0001"],
  ["SystemResponsibility", "SR-0001"],
  ["Requirement", "R-0001"],
  ["AcceptanceCriterion", "AC-0001"],
  ["ModuleDesign", "MD-0001"],
  ["ImplementationTask", "IT-0001"],
  ["Journal", "J-0001"],
  ["WorkLog", "WL-0001"],
  ["Evidence", "EV-0001"],
  ["VerificationReport", "VR-0001"],
];

const EDGES: readonly (readonly [string, string, string])[] = [
  ["PURSUED_BY", "G-0001", "A-0001"],
  ["PERFORMS", "A-0001", "UC-0001"],
  ["DETAILS", "UC-0001", "SC-0001"],
  ["DERIVES_RESPONSIBILITY", "SC-0001", "SR-0001"],
  ["REQUIRES", "SR-0001", "R-0001"],
  ["HAS_CRITERION", "R-0001", "AC-0001"],
  ["IS_REALIZED_BY", "SR-0001", "MD-0001"],
  ["ALLOCATES", "MD-0001", "IT-0001"],
  ["TARGETS", "IT-0001", "AC-0001"],
  ["LOGS", "J-0001", "WL-0001"],
  ["ADDRESSES", "WL-0001", "IT-0001"],
  ["SUBMITS", "WL-0001", "EV-0001"],
  ["CLAIMS", "EV-0001", "AC-0001"],
  ["SUBMITS", "WL-0001", "VR-0001"],
  ["CLAIMS", "VR-0001", "IT-0001"],
];

const EVERY_ID = NODES.map(([, id]) => id);

/** The whole graph, every node approved: one task ready, one criterion claimed. */
async function greenProject(): Promise<RegistryProject> {
  const project = await newProject();
  for (const [type, id] of NODES) {
    await node(project, type, id);
  }
  for (const [type, fromId, toId] of EDGES) {
    await edge(project, type, fromId, toId);
  }
  // The chain first, the log second: until the chain is green the task is
  // blocked, and a log under a blocked task is red (`premature`).
  await approveSpecNodes({
    projectId: project.id,
    ids: EVERY_ID.filter((id) => id !== "WL-0001"),
  });
  await approveSpecNodes({ projectId: project.id, ids: ["WL-0001"] });
  return project;
}

async function statusOf(
  project: RegistryProject,
  id: string,
): Promise<Awaited<ReturnType<typeof statusSpec>>["nodes"][number]> {
  const held = (await statusSpec(project.path)).nodes.find(
    (row) => row.id === id,
  );
  assert.ok(held !== undefined, `no row for ${id}`);
  return held;
}

async function refused(work: Promise<unknown>): Promise<Refusal> {
  try {
    await work;
  } catch (error) {
    assert.ok(isRefusal(error), `not a refusal: ${String(error)}`);
    return error;
  }
  throw new Error("The call was expected to refuse and did not.");
}

describe("the folder it answers for", () => {
  test("a project with nothing in it is an empty answer and not a refusal", async () => {
    const project = await newProject();
    const status = await statusSpec(project.path);
    assert.equal(status.root, project.path);
    assert.deepEqual(status.scope, []);
    assert.deepEqual(status.nodes, []);
    assert.deepEqual(status.missing, []);
    assert.deepEqual(status.broken, []);
  });

  test("finds the project by walking up, and needs no registry entry", async () => {
    // Built by hand, so nothing here has ever been opened in the UI — which is
    // the state a fresh clone arrives in.
    const root = await mkdtemp(path.join(workspace, "clone-"));
    await mkdir(path.join(root, ".shall", "spec", "intent", "Requirement"), {
      recursive: true,
    });
    await writeFile(
      path.join(root, ".shall", "project.json"),
      `${JSON.stringify({ id: "cloned", name: "cloned", schemaVersion: 1 }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(root, ".shall", "spec", "intent", "Requirement", "R-0001.md"),
      [
        "---",
        "short_name: r-0001",
        "name: The node called R-0001",
        "---",
        "",
        "What R-0001 says.",
        "",
      ].join("\n"),
      "utf8",
    );

    const deep = path.join(root, "src", "service");
    await mkdir(deep, { recursive: true });
    const status = await statusSpec(deep);
    assert.equal(status.root, root);
    assert.deepEqual(status.nodes, [
      {
        id: "R-0001",
        color: "red",
        reason: "orphan",
        approval: null,
        rejection: null,
        closure: null,
        leftOpen: null,
        taskState: null,
        problem: null,
        type: "Requirement",
        band: "Intent",
        shortName: "r-0001",
        name: "The node called R-0001",
        file: "intent/Requirement/R-0001.md",
        deletionProposed: null,
        edges: [],
      },
    ]);
  });

  test("refuses a folder that is in no project", async () => {
    const outside = await mkdtemp(path.join(workspace, "loose-"));
    const refusal = await refused(statusSpec(outside));
    assert.equal(refusal.kind, "missing");
    assert.equal(
      refusal.message,
      `Not a Shall project: ${outside} — no folder here or above it holds a .shall/project.json.`,
    );
  });

  test("stores nothing — the folder is untouched by reading the status", async () => {
    const project = await greenProject();
    // All three books with something in them, so the comparison below has
    // three sets of bytes to hold still rather than one.
    await acceptSpecClosure({ projectId: project.id, id: "AC-0001" });
    await rejectSpecNode({
      projectId: project.id,
      id: "G-0001",
      rationale: "The goal is two goals.",
    });

    const listing = await readdir(path.join(project.path, ".shall"));
    // THE BYTES AND NOT THE NAMES. A read that rewrote a ledger — dropping a
    // record it could not parse, tidying an order — would leave the folder
    // listing exactly as it found it, and this surface's whole claim is that a
    // question changes nothing.
    const before = await books(project);
    await statusSpec(project.path);
    assert.deepEqual(await readdir(path.join(project.path, ".shall")), listing);
    assert.deepEqual(await books(project), before);
  });
});

describe("what one node's row carries", () => {
  test("the colour and the word for why are the chain's own answer", async () => {
    const project = await greenProject();
    const green = await statusOf(project, "G-0001");
    assert.equal(green.color, "green");
    assert.equal(green.reason, "approved");
    assert.equal(green.approval?.by, os.userInfo().username);

    // A node nobody has read yet, beside it.
    await node(project, "Question", "Q-0001");
    await edge(project, "RAISES", "G-0001", "Q-0001");
    const asked = await statusOf(project, "Q-0001");
    assert.equal(asked.color, "yellow");
    assert.equal(asked.reason, "unapproved");
    assert.equal(asked.approval, null);
  });

  test("a standing rejection arrives with the words the reviewer wrote", async () => {
    const project = await greenProject();
    const rationale =
      "It says nothing about the empty case.\nSay what happens when the list is empty.";
    await rejectSpecNode({ projectId: project.id, id: "AC-0001", rationale });

    const refusedNode = await statusOf(project, "AC-0001");
    assert.equal(refusedNode.color, "red");
    assert.equal(refusedNode.reason, "rejected");
    assert.equal(refusedNode.rejection?.rationale, rationale);
    assert.equal(refusedNode.rejection?.by, os.userInfo().username);
    // The approval is history and is still shown: a red node is one somebody
    // once read, and that is the person a reader would go and ask.
    assert.equal(refusedNode.approval?.by, os.userInfo().username);
  });

  test("the sentence a rule of the graph wrote comes with the node", async () => {
    const project = await greenProject();
    await rejectSpecNode({
      projectId: project.id,
      id: "AC-0001",
      rationale: "It says nothing about the empty case.",
    });

    // The refusal cascades: with the criterion refused the chain over IT-0001
    // is no longer green, the task is blocked, and the work logged under it is
    // early — which is a sentence the panel could not compose from one node.
    const log = await statusOf(project, "WL-0001");
    assert.equal(log.color, "red");
    assert.equal(log.reason, "premature");
    assert.equal(
      log.problem,
      "WL-0001 addresses IT-0001, and IT-0001 is blocked — work is logged only under a task whose turn has come: its chain read and agreed, and everything it waits on finished.",
    );
  });

  test("a criterion's closure and a task's state are the second axis, not a fourth colour", async () => {
    const project = await greenProject();
    const open = await statusOf(project, "AC-0001");
    assert.equal(open.closure, "open");
    assert.equal(open.taskState, null);
    const ready = await statusOf(project, "IT-0001");
    assert.equal(ready.closure, "open");
    assert.equal(ready.taskState, "ready");
    // A type that is no closure subject says so with its own nulls.
    assert.equal((await statusOf(project, "G-0001")).closure, null);

    await acceptSpecClosure({ projectId: project.id, id: "AC-0001" });
    await acceptSpecClosure({ projectId: project.id, id: "IT-0001" });
    const closed = await statusOf(project, "AC-0001");
    assert.equal(closed.closure, "closed");
    // Still green: a subject can be agreed with and met, and the two answers
    // are counted out of two different books.
    assert.equal(closed.color, "green");
    const done = await statusOf(project, "IT-0001");
    assert.equal(done.closure, "closed");
    assert.equal(done.taskState, "done");
  });

  test("a deletion an agent proposed is carried, and turns the node yellow", async () => {
    const project = await greenProject();
    const file = specFile(project, "intent/Goal/G-0001.md");
    const text = await readFile(file, "utf8");
    await writeFile(
      file,
      text.replace(
        "---\n\n",
        "deletionProposed:\n  by: agent\n  rationale: Folded into G-0002.\n---\n\n",
      ),
      "utf8",
    );

    const proposed = await statusOf(project, "G-0001");
    assert.deepEqual(proposed.deletionProposed, {
      by: "agent",
      rationale: "Folded into G-0002.",
    });
    // The block sits inside the hashed content, so the node reads as changed
    // rather than as a colour of its own.
    assert.equal(proposed.color, "yellow");
    assert.equal(proposed.reason, "changed");
  });
});

describe("the relations a file draws", () => {
  test("are the file's own lines, dangling ones included", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001");
    await node(project, "Actor", "A-0001");
    await node(project, "Question", "Q-0001");
    await edge(project, "PURSUED_BY", "G-0001", "A-0001");
    await edge(project, "RAISES", "G-0001", "Q-0001");
    // The target's file goes the way no door sanctions — by hand.
    await rm(specFile(project, "intent/Question/Q-0001.md"));

    const status = await statusSpec(project.path);
    const goal = status.nodes.find((row) => row.id === "G-0001");
    assert.ok(goal !== undefined);
    assert.deepEqual(goal.edges, [
      { type: "PURSUED_BY", toId: "A-0001" },
      { type: "RAISES", toId: "Q-0001" },
    ]);
    // The line is content; the hole it points at is the graph's own answer.
    assert.deepEqual(status.missing, [
      { id: "Q-0001", referencedBy: [{ fromId: "G-0001", type: "RAISES" }] },
    ]);
  });
});

describe("the order the rows arrive in", () => {
  test("is band by band, then the canon's roster, then the id", async () => {
    const project = await newProject();
    // Written in an order that is neither the answer nor id order, so that
    // nothing here can pass by accident.
    for (const [type, id] of [
      ["Journal", "J-0001"],
      ["Term", "T-0002"],
      ["Actor", "A-0001"],
      ["ModuleDesign", "MD-0001"],
      ["Goal", "G-0001"],
      ["Term", "T-0001"],
    ] as const) {
      await node(project, type, id);
    }
    const status = await statusSpec(project.path);
    assert.deepEqual(
      status.nodes.map((row) => row.id),
      ["T-0001", "T-0002", "G-0001", "A-0001", "MD-0001", "J-0001"],
    );
    assert.deepEqual(
      status.nodes.map((row) => row.band),
      ["Domain", "Domain", "Intent", "Intent", "Plan", "Execution"],
    );
  });
});

describe("a scope", () => {
  test("reads the same folder however it is spelled", async () => {
    const project = await greenProject();
    const spec = path.join(project.path, ".shall", "spec");
    for (const [startPath, asked] of [
      // Absolute.
      [project.path, path.join(spec, "intent", "Goal")],
      // Relative to the caller's cwd, which is not the daemon's.
      [path.join(spec, "intent"), "Goal"],
      // Spec-relative, with and without the folder named, and with the
      // trailing slash a shell's completion leaves behind.
      [project.path, "intent/Goal"],
      [path.join(project.path, "src"), ".shall/spec/intent/Goal"],
      [project.path, "intent/Goal/"],
    ] as const) {
      const status = await statusSpec(startPath, [asked]);
      assert.deepEqual(status.scope, ["intent/Goal"], asked);
      assert.deepEqual(
        status.nodes.map((row) => row.id),
        ["G-0001"],
        asked,
      );
    }
  });

  test("takes a whole band as readily as one file", async () => {
    const project = await greenProject();
    assert.deepEqual(
      (await statusSpec(project.path, ["execution"])).nodes.map(
        (row) => row.id,
      ),
      ["J-0001", "WL-0001", "EV-0001", "VR-0001"],
    );
    assert.deepEqual(
      (
        await statusSpec(project.path, [
          "intent/Goal/G-0001.md",
          "plan/ImplementationTask",
        ])
      ).nodes.map((row) => row.id),
      ["G-0001", "IT-0001"],
    );
  });

  test("refuses a path that climbs out of the spec folder", async () => {
    const project = await greenProject();
    const refusal = await refused(statusSpec(project.path, [".."]));
    assert.equal(refusal.kind, "invalid");
    assert.equal(
      refusal.message,
      "--scope names a path outside .shall/spec: ..",
    );
  });

  test("refuses an entry that names nothing rather than answering nothing", async () => {
    const project = await greenProject();
    // A misspelling of `intent`. Served, it would resolve to a prefix no file
    // can match and come back as an empty project.
    const refusal = await refused(statusSpec(project.path, ["intnet"]));
    assert.equal(refusal.kind, "invalid");
    assert.equal(
      refusal.message,
      "--scope names nothing under .shall/spec: intnet",
    );
    // The same run without the typo, so the silence really would have been a
    // lie about a project full of nodes.
    assert.ok((await statusSpec(project.path)).nodes.length > 0);
  });

  test("refuses an entry that reduces to nothing", async () => {
    const project = await greenProject();
    // `/` is the filesystem root: outside the spec folder like any other path
    // above it, and never the shorthand for all of it.
    const refusal = await refused(statusSpec(project.path, ["/"]));
    assert.equal(refusal.kind, "invalid");
    assert.equal(refusal.message, "--scope names a path outside .shall/spec: /");
  });

  test("still names the folder that would not read when the scope is inside it", async () => {
    const project = await greenProject();
    // A type folder filed under the wrong band. Every file in it is left out of
    // the graph, and the sentence saying so is filed under the FOLDER — which
    // is the only row that explains why the file below is nowhere.
    const strayFolder = specFile(project, "plan/Goal");
    await mkdir(strayFolder, { recursive: true });
    await writeFile(
      path.join(strayFolder, "G-0002.md"),
      [
        "---",
        "short_name: g-0002",
        "name: The node called G-0002",
        "---",
        "",
        "What G-0002 says.",
        "",
      ].join("\n"),
      "utf8",
    );

    const status = await statusSpec(project.path, ["plan/Goal/G-0002.md"]);
    assert.deepEqual(status.nodes, []);
    assert.deepEqual(status.broken, [
      {
        file: "plan/Goal",
        problems: [
          "plan/Goal is a Goal folder in the wrong band — a Goal lives in intent/Goal. Every node file inside it is left out until the folder moves.",
        ],
      },
    ]);
  });

  test("names the folder whose name is no type, from a scope two levels under it", async () => {
    const project = await greenProject();
    const notes = specFile(project, "intent/Notes/drafts");
    await mkdir(notes, { recursive: true });
    await writeFile(path.join(notes, "N-0001.md"), "some notes\n", "utf8");

    // The roster is said once, to the folder; the file under it gets the one
    // fact about where a node lives. Both are above or inside the scope.
    const status = await statusSpec(project.path, ["intent/Notes/drafts"]);
    assert.deepEqual(
      status.broken.map((entry) => entry.file),
      ["intent/Notes", "intent/Notes/drafts/N-0001.md"],
    );
    // The roster itself is core's sentence and is not written out again here;
    // what this asserts is that the row survived the scope.
    const roster = status.broken[0]?.problems[0] ?? "";
    assert.ok(
      roster.startsWith("intent/Notes is not one of the canon's node types"),
      roster,
    );
  });

  test("keeps a hole while any file still pointing at it is in scope", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001");
    await node(project, "Question", "Q-0001");
    await edge(project, "RAISES", "G-0001", "Q-0001");
    await rm(specFile(project, "intent/Question/Q-0001.md"));
    // A band with nothing in it, made by hand: the store writes a band folder
    // on the first node into it, and a scope naming a folder that is not there
    // is refused rather than answered.
    await mkdir(specFile(project, "domain"), { recursive: true });

    // The hole has no file of its own — the referrer's is the only address it
    // has, so the scope is read there.
    assert.deepEqual(
      (await statusSpec(project.path, ["intent/Goal"])).missing.map(
        (entry) => entry.id,
      ),
      ["Q-0001"],
    );
    assert.deepEqual(
      (await statusSpec(project.path, ["domain"])).missing,
      [],
    );
  });

  test("names a file that would not read only when it is in scope", async () => {
    const project = await greenProject();
    await writeFile(
      specFile(project, "intent/Requirement/R-0009.md"),
      "just some notes\n",
      "utf8",
    );
    assert.deepEqual(
      (await statusSpec(project.path, ["intent/Requirement"])).broken.map(
        (entry) => entry.file,
      ),
      ["intent/Requirement/R-0009.md"],
    );
    assert.deepEqual(
      (await statusSpec(project.path, ["plan"])).broken,
      [],
    );
  });
});

describe("a book that will not read", () => {
  test("refuses the whole status and says which book", async () => {
    const project = await greenProject();
    await writeFile(
      path.join(project.path, ".shall", "ledger", "rejections.yaml"),
      "- not a map\n",
      "utf8",
    );
    const refusal = await refused(statusSpec(project.path));
    assert.equal(refusal.kind, "conflict");
    assert.ok(refusal.message.includes("rejection ledger"), refusal.message);
    assert.ok(
      refusal.message.includes(
        "Nothing here can be told apart until it reads",
      ),
      refusal.message,
    );
  });
});

describe("the board, reached by path", () => {
  test("is the same board the panel draws, with the folder it came out of", async () => {
    const project = await greenProject();
    const board = await boardAt(project.path);
    assert.equal(board.root, project.path);
    assert.deepEqual(
      board.implement.map((row) => row.id),
      ["IT-0001"],
    );
    assert.deepEqual(board.fixSpec, []);
  });

  test("refuses a folder that is in no project", async () => {
    const outside = await mkdtemp(path.join(workspace, "loose-board-"));
    const refusal = await refused(boardAt(outside));
    assert.equal(refusal.kind, "missing");
    assert.equal(
      refusal.message,
      `Not a Shall project: ${outside} — no folder here or above it holds a .shall/project.json.`,
    );
  });
});
