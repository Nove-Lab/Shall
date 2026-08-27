import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import { isRefusal, type Refusal } from "./errors.js";
import { createProject } from "./projects.js";
import { logActivity } from "./spec-activity.js";
import { contextAt } from "./spec-context.js";
import { createSpecEdge, createSpecNode } from "./spec-graph.js";
import type { RegistryProject } from "../types.js";

/**
 * The look back over a real folder and a real feed.
 *
 * `core/arith/context.test.ts` pins the walk; what is pinned here is the two
 * things only the daemon can answer — that the paths are the store's own
 * spelling, and that the recent turns come in the FEED'S order, which is the
 * daemon's clock and not the id's — and the refusals a wrong id earns.
 */

let home = "";
let workspace = "";

before(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "shall-context-"));
  home = path.join(workspace, "home");
  await mkdir(home, { recursive: true });
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = path.join(home, ".config");
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});

async function newProject(): Promise<RegistryProject> {
  return createProject(await mkdtemp(path.join(workspace, "project-")));
}

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
  ["WorkItem", "WI-0002"],
  ["Journal", "J-0001"],
  ["Journal", "J-0002"],
  ["WorkLog", "WL-0001"],
  ["WorkLog", "WL-0002"],
  ["Decision", "D-0001"],
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
  ["ALLOCATES", "M-0001", "WI-0002"],
  ["TARGETS", "WI-0001", "AC-0001"],
  ["LOGS", "J-0001", "WL-0001"],
  ["LOGS", "J-0002", "WL-0002"],
  ["ADDRESSES", "WL-0001", "WI-0002"],
  ["ADDRESSES", "WL-0002", "WI-0002"],
  ["AFFECTS", "D-0001", "M-0001"],
];

async function project(): Promise<RegistryProject> {
  const held = await newProject();
  for (const [type, id] of NODES) {
    await createSpecNode({
      projectId: held.id,
      type,
      id,
      shortName: id.toLowerCase(),
      name: `The node called ${id}`,
      body: `What ${id} says.`,
    });
  }
  for (const [type, fromId, toId] of EDGES) {
    await createSpecEdge({ projectId: held.id, type, fromId, toId });
  }
  return held;
}

async function refusalOf(work: Promise<unknown>): Promise<Refusal> {
  try {
    await work;
  } catch (error) {
    if (isRefusal(error)) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a refusal");
}

describe("shall context", () => {
  test("names the files in the store's spelling, and the turns in the feed's order", async () => {
    const held = await project();
    // The older id is logged LAST, so the feed and the id disagree about which
    // turn is newest — and the feed is the clock.
    await logActivity({ path: held.path, kind: "work_done", summary: "two", refs: ["J-0002", "WL-0002"] });
    await logActivity({ path: held.path, kind: "work_done", summary: "one", refs: ["J-0001", "WL-0001"] });

    const found = await contextAt(path.join(held.path, ".shall", "spec"), "WI-0001");
    assert.equal(found.root, held.path);
    assert.equal(found.item.file, "plan/WorkItem/WI-0001.md");
    assert.deepEqual(found.modules.map((row) => row.file), ["plan/Module/M-0001.md"]);
    assert.deepEqual(found.siblings.map((row) => row.id), ["WI-0002"]);
    assert.deepEqual(
      found.logs.map((row) => [row.log.id, row.journal?.id]),
      [["WL-0002", "J-0002"], ["WL-0001", "J-0001"]],
    );
    assert.deepEqual(
      found.decisions.map((row) => [row.decision.id, row.affects]),
      [["D-0001", ["M-0001"]]],
    );
    assert.equal(found.recentBy, "feed");
    assert.deepEqual(
      found.recentTurns.map((row) => row.journal.id),
      ["J-0001", "J-0002"],
    );
    assert.ok(found.recentTurns.every((row) => row.at !== null));
  });

  test("a project that has logged nothing orders the turns by id, and says so", async () => {
    const held = await project();
    const found = await contextAt(held.path, "WI-0001", 1);
    assert.equal(found.recentBy, "id");
    assert.deepEqual(found.recentTurns.map((row) => [row.journal.id, row.at]), [["J-0002", null]]);
  });

  test("refuses an id that is no work item, naming the ones there are", async () => {
    const held = await project();
    const unknown = await refusalOf(contextAt(held.path, "WI-0404"));
    assert.equal(unknown.kind, "missing");
    assert.match(unknown.message, /WI-0001, WI-0002/);
    const wrongType = await refusalOf(contextAt(held.path, "M-0001"));
    assert.equal(wrongType.kind, "invalid");
    const blank = await refusalOf(contextAt(held.path, "  "));
    assert.equal(blank.kind, "invalid");
  });
});
