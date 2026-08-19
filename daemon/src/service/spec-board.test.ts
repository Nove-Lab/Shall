import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import { bandFolderOf } from "@shall/core/graph";
import { isRefusal, type Refusal } from "./errors.js";
import { createProject } from "./projects.js";
import { taskBoard } from "./spec-board.js";
import { createSpecEdge, createSpecNode, updateSpecNode } from "./spec-graph.js";
import {
  acceptSpecClosure,
  approveSpecNodes,
  leaveSpecOpen,
  rejectSpecNode,
  reviewQueue,
} from "./spec-queue.js";
import { reviewSpec } from "./spec-review.js";
import type { RegistryProject } from "../types.js";

/**
 * The Task Board over real folders and real books.
 *
 * WHAT IS ASSERTED IS THE GATE AND THE WORDS. Which tasks appear, what makes
 * one appear and disappear, and that a rejection's rationale arrives WHOLE —
 * the board is a work order, and a summarised one is a different instruction.
 */

let home = "";
let workspace = "";

before(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "shall-board-"));
  home = path.join(workspace, "home");
  await mkdir(home, { recursive: true });
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

/** Goal down to a task, with a journal and one log addressing the task. */
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
  ["SUBMITS", "WL-0001", "VR-0001"],
  ["CLAIMS", "VR-0001", "IT-0001"],
];

const EVERY_ID = NODES.map(([, id]) => id);

/** The whole graph, every node approved: one task, ready to work on. */
async function greenProject(): Promise<RegistryProject> {
  const project = await newProject();
  for (const [type, id] of NODES) {
    await node(project, type, id);
  }
  for (const [type, fromId, toId] of EDGES) {
    await edge(project, type, fromId, toId);
  }
  // The chain first, the log second: until the chain is green the task is
  // blocked, and a log under a blocked task is red (`premature`) — the door
  // refuses it in the same batch as the chain it waits on.
  await approveSpecNodes({
    projectId: project.id,
    ids: EVERY_ID.filter((id) => id !== "WL-0001"),
  });
  await approveSpecNodes({ projectId: project.id, ids: ["WL-0001"] });
  return project;
}

function bookAt(project: RegistryProject, name: string): string {
  return path.join(project.path, ".shall", "ledger", name);
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

describe("the Implement half", () => {
  test("offers the task once its whole chain is read", async () => {
    const project = await greenProject();
    const board = await taskBoard(project.id);
    assert.deepEqual(
      board.implement.map((row) => row.id),
      ["IT-0001"],
    );
    const [row] = board.implement;
    assert.ok(row !== undefined);
    assert.deepEqual(
      row.modules.map((ref) => ref.id),
      ["MD-0001"],
    );
    assert.deepEqual(
      row.requirements.map((ref) => ref.id),
      ["R-0001"],
    );
    assert.deepEqual(row.targets, [
      { id: "AC-0001", name: "The node called AC-0001", closure: "open" },
    ]);
    assert.deepEqual(
      row.addressedBy.map((held) => held.id),
      ["WL-0001"],
    );
    assert.deepEqual(board.fixSpec, []);
  });

  test("hides it while one node above it is refused, and offers it again once fixed", async () => {
    const project = await greenProject();
    await rejectSpecNode({
      projectId: project.id,
      id: "R-0001",
      rationale: "It says nothing about the empty case.",
    });
    assert.deepEqual((await taskBoard(project.id)).implement, []);

    // Fixing the requirement lapses the rejection; approving it again puts the
    // chain back together and the task returns of its own accord.
    await updateSpecNode({
      projectId: project.id,
      id: "R-0001",
      shortName: "r-0001",
      name: "The node called R-0001",
      body: "What R-0001 says, and what happens when there is nothing.",
    });
    await approveSpecNodes({ projectId: project.id, ids: ["R-0001"] });
    assert.deepEqual(
      (await taskBoard(project.id)).implement.map((row) => row.id),
      ["IT-0001"],
    );
  });

  test("drops it once a person calls it done, and brings it back on a leaving-open", async () => {
    const project = await greenProject();
    await acceptSpecClosure({ projectId: project.id, id: "IT-0001" });
    assert.deepEqual((await taskBoard(project.id)).implement, []);

    await leaveSpecOpen({
      projectId: project.id,
      id: "IT-0001",
      rationale: "WL-0001 stops at the happy path; the retry is not shown.",
    });
    assert.deepEqual(
      (await taskBoard(project.id)).implement.map((row) => row.id),
      ["IT-0001"],
    );
  });

  test("waits on a prerequisite and is offered the moment it closes", async () => {
    const project = await greenProject();
    await node(project, "ImplementationTask", "IT-0002");
    await edge(project, "ALLOCATES", "MD-0001", "IT-0002");
    await edge(project, "TARGETS", "IT-0002", "AC-0001");
    await edge(project, "DEPENDS_ON", "IT-0001", "IT-0002");
    await node(project, "WorkLog", "WL-0002");
    await edge(project, "LOGS", "J-0001", "WL-0002");
    await edge(project, "ADDRESSES", "WL-0002", "IT-0002");
    await node(project, "VerificationReport", "VR-0002");
    await edge(project, "SUBMITS", "WL-0002", "VR-0002");
    await edge(project, "CLAIMS", "VR-0002", "IT-0002");
    // Wiring the new task moved the module's own file (ALLOCATES is written
    // there) and the task's (DEPENDS_ON is written in its own), so everything
    // is read again — the board is about what is settled, not about what was.
    // The logs go in their own second wave: until the chain is green again
    // their tasks are blocked, and a log under a blocked task is red.
    await approveSpecNodes({
      projectId: project.id,
      ids: [
        ...EVERY_ID.filter((id) => id !== "WL-0001"),
        "IT-0002",
        "VR-0002",
      ],
    });
    await approveSpecNodes({
      projectId: project.id,
      ids: ["WL-0002"],
    });
    // WL-0001 is left alone on purpose: adding the dependency put IT-0001
    // behind IT-0002, so the work already logged under it is `premature` red —
    // the demo's own situation — and it comes back green by itself the moment
    // the prerequisite closes, because its approval never lapsed.

    // IT-0001 waits on IT-0002, so only the second is on the board.
    assert.deepEqual(
      (await taskBoard(project.id)).implement.map((row) => row.id),
      ["IT-0002"],
    );
    await acceptSpecClosure({ projectId: project.id, id: "IT-0002" });
    const board = await taskBoard(project.id);
    assert.deepEqual(
      board.implement.map((row) => row.id),
      ["IT-0001"],
    );
    assert.deepEqual(
      board.implement.map((row) => row.depth),
      [1],
    );
  });

  test("offers neither task when the two of them wait on each other", async () => {
    // The Implement half's whole promise is that everything on it can be
    // started. Two tasks waiting on each other can never satisfy that, so both
    // leave this half — and turn up on the other one, with the line to cut.
    const project = await greenProject();
    await node(project, "ImplementationTask", "IT-0002");
    await edge(project, "ALLOCATES", "MD-0001", "IT-0002");
    await edge(project, "TARGETS", "IT-0002", "AC-0001");
    await edge(project, "DEPENDS_ON", "IT-0001", "IT-0002");
    await edge(project, "DEPENDS_ON", "IT-0002", "IT-0001");
    const board = await taskBoard(project.id);
    assert.deepEqual(board.implement, []);
    assert.deepEqual(
      board.fixSpec
        .filter((row) => row.reason === "cyclic")
        .map((row) => row.id),
      ["IT-0001", "IT-0002"],
    );
  });

  test("is exactly the tasks the review badges as ready", async () => {
    const project = await greenProject();
    const ready = (await reviewSpec(project.id)).statuses
      .filter((status) => status.taskState === "ready")
      .map((status) => status.id);
    assert.deepEqual(
      (await taskBoard(project.id)).implement.map((row) => row.id),
      ready,
    );
  });

  test("shows a task the queue is also asking about", async () => {
    // The two surfaces answer two questions and both are true at once: the
    // queue asks whether the work shown is enough, the board says the task is
    // not closed yet.
    const project = await greenProject();
    assert.equal(
      (await reviewQueue(project.id)).bundles.some(
        (bundle) => bundle.id === "completion:IT-0001",
      ),
      true,
    );
    assert.deepEqual(
      (await taskBoard(project.id)).implement.map((row) => row.id),
      ["IT-0001"],
    );
  });
});

describe("the Fix Spec half", () => {
  test("carries a rejection's rationale whole, and puts it first", async () => {
    const project = await greenProject();
    await node(project, "Requirement", "R-0002");
    const rationale =
      "It says nothing about the empty case.\nSay what happens when the list is empty.";
    await rejectSpecNode({ projectId: project.id, id: "AC-0001", rationale });

    const board = await taskBoard(project.id);
    // The refusal CASCADES, and the board says so: with AC-0001 refused the
    // chain over IT-0001 is no longer green, the task is blocked, and the work
    // logged under it is early — a rule row beside the orphan, oldest first.
    assert.deepEqual(
      board.fixSpec.map((row) => [row.id, row.reason]),
      [
        ["AC-0001", "rejected"],
        ["WL-0001", "premature"],
        ["R-0002", "orphan"],
      ],
    );
    const [refusal] = board.fixSpec;
    assert.ok(refusal !== undefined);
    assert.equal(refusal.detail, rationale);
    assert.equal(refusal.by, os.userInfo().username);
    assert.equal(refusal.kind, "rejected");
    // The orphan reads as `shall check` reads it.
    assert.equal(
      board.fixSpec[2]?.detail,
      "R-0002 is a Requirement with no live anchor — it is held to the graph by a REQUIRES relation into it, and none stands. Draw the relation, or remove the node.",
    );
  });

  test("says a file that would not read once, with its id", async () => {
    const project = await greenProject();
    const file = path.join(
      project.path,
      ".shall",
      "spec",
      bandFolderOf("Requirement") ?? "?",
      "Requirement",
      "R-0003.md",
    );
    await writeFile(file, "just some notes\n", "utf8");

    const rows = (await taskBoard(project.id)).fixSpec.filter(
      (row) => row.reason === "malformed",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, "R-0003");
    assert.equal(rows[0]?.type, "Requirement");
    assert.ok((rows[0]?.detail ?? "").length > 0);
  });

  test("names every referrer of a hole in one row", async () => {
    const project = await greenProject();
    // A relation to an id nothing answers to, written by hand: the door would
    // refuse it, and a `git checkout` would not.
    const file = path.join(
      project.path,
      ".shall",
      "spec",
      bandFolderOf("Requirement") ?? "?",
      "Requirement",
      "R-0001.md",
    );
    await writeFile(
      file,
      [
        "---",
        "short_name: r-0001",
        "name: The node called R-0001",
        "edges:",
        "  - type: DEPENDS_ON",
        "    to: R-0404",
        "---",
        "",
        "What R-0001 says.",
        "",
      ].join("\n"),
      "utf8",
    );

    const row = (await taskBoard(project.id)).fixSpec.find(
      (held) => held.id === "R-0404",
    );
    assert.ok(row !== undefined);
    assert.equal(
      row.detail,
      "R-0001 has a DEPENDS_ON relation to R-0404, and no file names R-0404. The relation is kept as written, so writing or restoring R-0404 attaches it again.",
    );
  });

  test("stores nothing — the folder is untouched by reading the board", async () => {
    const project = await greenProject();
    const before = await readdir(path.join(project.path, ".shall"));
    await taskBoard(project.id);
    assert.deepEqual(await readdir(path.join(project.path, ".shall")), before);
  });
});

describe("a book that will not read", () => {
  test("refuses the whole board and says which book", async () => {
    const project = await greenProject();
    await writeFile(bookAt(project, "rejections.yaml"), "- not a map\n", "utf8");
    const refusal = await refused(taskBoard(project.id));
    assert.equal(refusal.kind, "conflict");
    assert.ok(
      refusal.message.includes("rejection ledger"),
      refusal.message,
    );
    assert.ok(
      refusal.message.includes(
        "Nothing on the board can be trusted until it reads",
      ),
      refusal.message,
    );
  });
});
