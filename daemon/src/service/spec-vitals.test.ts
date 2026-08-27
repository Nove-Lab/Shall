import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import { isRefusal, type Refusal } from "./errors.js";
import { createProject } from "./projects.js";
import { createSpecEdge, createSpecNode } from "./spec-graph.js";
import {
  acceptSpecClosure,
  approveSpecNodes,
  leaveSpecOpen,
} from "./spec-queue.js";
import { reviewSpec } from "./spec-review.js";
import { vitals } from "./spec-vitals.js";
import type { RegistryProject } from "../types.js";

/**
 * The Vitals over real folders and real books.
 *
 * WHAT IS ASSERTED IS THE SHAPE ARRIVING WHOLE AND THE FOLDER STAYING STILL.
 * `core/arith/vitals.test.ts` holds the arithmetic to account; this file
 * holds the door — that the daemon hands core's answer over unaltered, that
 * every judgement reaching it was made through its own door, that asking
 * writes nothing, and that an unreadable book refuses the whole page.
 */

let home = "";
let workspace = "";

before(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "shall-vitals-"));
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

/** Goal down to a work item, with a log that submits evidence for the criterion and a report for the work item. */
const NODES: readonly (readonly [string, string])[] = [
  ["Goal", "G-0001"],
  ["Actor", "A-0001"],
  ["UseCase", "UC-0001"],
  ["Scenario", "SC-0001"],
  ["SystemResponsibility", "SR-0001"],
  ["Requirement", "R-0001"],
  ["AcceptanceCriterion", "AC-0001"],
  ["Module", "M-0001"],
  ["WorkItem", "WI-0001"],
  ["Journal", "J-0001"],
  ["WorkLog", "WL-0001"],
  ["Evidence", "EV-0001"],
  ["CompletionReport", "CR-0001"],
];

const EDGES: readonly (readonly [string, string, string])[] = [
  ["PURSUED_BY", "G-0001", "A-0001"],
  ["PERFORMS", "A-0001", "UC-0001"],
  ["DETAILS", "UC-0001", "SC-0001"],
  ["DERIVES_RESPONSIBILITY", "SC-0001", "SR-0001"],
  ["REQUIRES", "SR-0001", "R-0001"],
  ["HAS_CRITERION", "R-0001", "AC-0001"],
  ["IS_REALIZED_BY", "SR-0001", "M-0001"],
  ["ALLOCATES", "M-0001", "WI-0001"],
  ["TARGETS", "WI-0001", "AC-0001"],
  ["LOGS", "J-0001", "WL-0001"],
  ["ADDRESSES", "WL-0001", "WI-0001"],
  ["SUBMITS", "WL-0001", "EV-0001"],
  ["CLAIMS", "EV-0001", "AC-0001"],
  ["SUBMITS", "WL-0001", "CR-0001"],
  ["CLAIMS", "CR-0001", "WI-0001"],
];

const EVERY_ID = NODES.map(([, id]) => id);

/** The whole graph written and nothing approved: yellow from the goal down. */
async function draftedProject(): Promise<RegistryProject> {
  const project = await newProject();
  for (const [type, id] of NODES) {
    await node(project, type, id);
  }
  for (const [type, fromId, toId] of EDGES) {
    await edge(project, type, fromId, toId);
  }
  return project;
}

/** The whole graph, every node approved — the chain first, the log second, as the board's test explains. */
async function greenProject(): Promise<RegistryProject> {
  const project = await draftedProject();
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

/** The three books as bytes, null where a book has not been written yet. */
async function books(project: RegistryProject): Promise<(string | null)[]> {
  return Promise.all(
    ["approvals.yaml", "rejections.yaml", "acceptances.yaml"].map((file) =>
      readFile(bookAt(project, file), "utf8").then(
        (text) => text,
        () => null,
      ),
    ),
  );
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

describe("what the vitals say", () => {
  test("a fresh project is empty, and says so rather than refusing", async () => {
    const project = await newProject();
    const answer = await vitals(project.id);
    assert.equal(answer.empty, true);
    assert.equal(answer.progress.criteria.denominator, 0);
    assert.equal(answer.health.length, 7);
    assert.ok(answer.health.every((rule) => rule.nodes.length === 0));
  });

  test("a drafted project counts every row whatever colour, and the work item is blocked by what is unread", async () => {
    const project = await draftedProject();
    const answer = await vitals(project.id);
    assert.equal(answer.empty, false);
    assert.deepEqual(
      [answer.progress.requirements.numerator, answer.progress.requirements.denominator],
      [0, 1],
    );
    assert.deepEqual(
      [answer.progress.criteria.numerator, answer.progress.criteria.denominator],
      [0, 1],
    );
    // Evidence claims the criterion but nothing is approved: awaiting, and no card yet.
    assert.deepEqual(
      answer.progress.criteria.open.map((open) => [open.id, open.reason, open.bundleId]),
      [["AC-0001", "awaiting-review", null]],
    );
    assert.deepEqual(
      [answer.progress.workItems.numerator, answer.progress.workItems.denominator],
      [0, 1],
    );
    assert.deepEqual(
      answer.progress.workItems.open.map((held) => [held.id, held.workItemState]),
      [["WI-0001", "blocked"]],
    );
    // The scenario carries no criterion: the one violated row, and it sorts first.
    assert.deepEqual(
      answer.health.map((rule) => [rule.id, rule.nodes.length]),
      [
        ["scenario-without-criterion", 1],
        ["requirement-without-criterion", 0],
        ["actor-without-use-case", 0],
        ["use-case-without-scenario", 0],
        ["goal-without-responsibility", 0],
        ["module-without-work-item", 0],
        ["criterion-without-work-item", 0],
      ],
    );
  });

  test("a green project names the queue card, and closing the criterion satisfies the requirement", async () => {
    const project = await greenProject();
    const before = await vitals(project.id);
    assert.deepEqual(
      before.progress.criteria.open.map((open) => [open.reason, open.bundleId]),
      [["awaiting-review", "closure:AC-0001"]],
    );
    assert.equal(before.progress.requirements.numerator, 0);
    assert.deepEqual(
      before.progress.workItems.open.map((held) => [held.id, held.workItemState]),
      [["WI-0001", "in_review"]],
    );

    await acceptSpecClosure({ projectId: project.id, id: "AC-0001" });
    const after = await vitals(project.id);
    assert.deepEqual(
      [after.progress.criteria.numerator, after.progress.criteria.denominator],
      [1, 1],
    );
    assert.deepEqual(
      [after.progress.requirements.numerator, after.progress.requirements.denominator],
      [1, 1],
    );
    // The badge reads the same field the ratio counted.
    const review = await reviewSpec(project.id);
    assert.equal(
      review.statuses.find((status) => status.id === "R-0001")?.satisfaction,
      "sat",
    );
    assert.equal(
      review.statuses.find((status) => status.id === "SC-0001")?.satisfaction,
      null,
    );
  });

  test("a criterion left open arrives with the person's words whole", async () => {
    const project = await greenProject();
    await leaveSpecOpen({
      projectId: project.id,
      id: "AC-0001",
      rationale: "The evidence shows the happy path.\nShow the timeout.",
    });
    const answer = await vitals(project.id);
    const [open] = answer.progress.criteria.open;
    assert.equal(open?.reason, "left-open");
    assert.equal(open?.bundleId, null);
    assert.equal(
      open?.leftOpen?.rationale,
      "The evidence shows the happy path.\nShow the timeout.",
    );
    assert.equal(answer.progress.requirements.numerator, 0);
  });

  test("closing the work item finishes it", async () => {
    const project = await greenProject();
    await acceptSpecClosure({ projectId: project.id, id: "WI-0001" });
    const answer = await vitals(project.id);
    assert.deepEqual(
      [answer.progress.workItems.numerator, answer.progress.workItems.denominator],
      [1, 1],
    );
  });
});

describe("what asking does to the folder", () => {
  test("stores nothing — the folder is untouched by reading the vitals", async () => {
    const project = await greenProject();
    await acceptSpecClosure({ projectId: project.id, id: "AC-0001" });
    await leaveSpecOpen({
      projectId: project.id,
      id: "WI-0001",
      rationale: "The report claims more than the log shows.",
    });
    const listing = await readdir(path.join(project.path, ".shall"));
    const before = await books(project);
    await vitals(project.id);
    await vitals(project.id);
    assert.deepEqual(await readdir(path.join(project.path, ".shall")), listing);
    assert.deepEqual(await books(project), before);
  });
});

describe("a book that will not read", () => {
  test("refuses the whole page and says which book", async () => {
    const project = await greenProject();
    await writeFile(bookAt(project, "acceptances.yaml"), "- not a map\n", "utf8");
    const refusal = await refused(vitals(project.id));
    assert.equal(refusal.kind, "conflict");
    assert.ok(refusal.message.includes("acceptance ledger"), refusal.message);
    assert.ok(
      refusal.message.includes("Nothing here can be counted until it reads"),
      refusal.message,
    );
  });
});
