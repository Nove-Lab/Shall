import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { before, describe, test } from "node:test";
import {
  activityMonthOf,
  emitActivity,
  type ActivityRecord,
} from "@shall/core/serialize";
import { appendActivity } from "@shall/core/store";
import { isRefusal, type Refusal } from "./errors.js";
import { createProject } from "./projects.js";
import { activityFeed, logActivity } from "./spec-activity.js";
import { workBoard } from "./spec-board.js";
import { createSpecEdge, createSpecNode } from "./spec-graph.js";
import { approveSpecNodes, reviewQueue } from "./spec-queue.js";
import { approveSpecNode, commitSpec, reviewSpec } from "./spec-review.js";
import { boardAt, statusSpec } from "./spec-status.js";
import type { RegistryProject } from "../types.js";

const run = promisify(execFile);

/**
 * The activity feed end to end: real folders, the three real books beside the
 * spec, the feed's month files under them, and real git.
 *
 * WHAT IS PINNED HERE IS WHO HOLDS THE PEN AND WHAT THE PEN CANNOT DO. The
 * agent's door writes its four kinds, names nobody, and refuses any other word
 * in a sentence that lists the four; nothing else in the daemon writes a line.
 * And the two things the design stands on: a month file that will not read
 * stops `shall log` and is left exactly as it was, and deleting the feed folder
 * whole changes no colour, no board row and no queue card — the feed is an
 * input to nothing, and this is the test that says so.
 *
 * THE ENTRIES ARE READ BACK THROUGH `activityFeed`, the web's reader, so every
 * writer test exercises the reader too; the bytes are checked once against the
 * emitter, the way the books' tests check theirs.
 *
 * THE SENTENCES ARE GOLDENS, written out in full like the rest of this
 * package's, because they are what an agent reads on stderr when its log line
 * was refused.
 */

let home = "";
let workspace = "";

before(async () => {
  // Resolved through `realpath` because the commit test below hands git a
  // path relative to the repository root git reports — and git reports the
  // real path, while `os.tmpdir()` on macOS is a symlink into it. A project
  // made under the symlink would ask git about a path "outside" its own
  // repository, and the commit button would refuse for a reason nobody meant.
  workspace = await mkdtemp(
    path.join(await realpath(os.tmpdir()), "shall-activity-"),
  );
  home = path.join(workspace, "home");
  await mkdir(home, { recursive: true });
  // `getShallHome` reads `os.homedir()` on every call, which is `$HOME` on
  // POSIX — so this redirects the registry and the config without a seam that
  // exists only for tests. Git's own config is fenced the same way.
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = path.join(home, ".config");
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});

async function newProject(): Promise<RegistryProject> {
  return createProject(await mkdtemp(path.join(workspace, "project-")));
}

/* ------------------------------------------------------------------ *
 * The fixture graph
 * ------------------------------------------------------------------ */

async function node(
  project: RegistryProject,
  type: string,
  id: string,
  body = `What ${id} says.`,
): Promise<void> {
  await createSpecNode({
    projectId: project.id,
    type,
    id,
    shortName: id.toLowerCase(),
    name: `The node called ${id}`,
    body,
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

/**
 * The intent chain, Goal down to criterion, so that nothing in these tests is
 * an orphan by accident — every anchor in the canon's table is a relation
 * somebody has to draw.
 */
const CHAIN: readonly (readonly [string, string])[] = [
  ["Goal", "G-0001"],
  ["Actor", "A-0001"],
  ["UseCase", "UC-0001"],
  ["Scenario", "SC-0001"],
  ["SystemResponsibility", "SR-0001"],
  ["Requirement", "R-0001"],
  ["AcceptanceCriterion", "AC-0001"],
];

const CHAIN_EDGES: readonly (readonly [string, string, string])[] = [
  ["PURSUED_BY", "G-0001", "A-0001"],
  ["PERFORMS", "A-0001", "UC-0001"],
  ["DETAILS", "UC-0001", "SC-0001"],
  ["DERIVES_RESPONSIBILITY", "SC-0001", "SR-0001"],
  ["REQUIRES", "SR-0001", "R-0001"],
  ["HAS_CRITERION", "R-0001", "AC-0001"],
];

/**
 * The plan and execution sides: the module that holds the work item, a journal,
 * the work under it, and the evidence it submitted — with the aim chain,
 * because a submitted claim answers to the aim rule, and with the module,
 * because its ALLOCATES line is what holds a work item at all.
 */
const RECORD: readonly (readonly [string, string])[] = [
  ["Module", "M-0001"],
  ["WorkItem", "WI-0001"],
  ["Journal", "J-0001"],
  ["WorkLog", "WL-0001"],
  ["Evidence", "EV-0001"],
  ["CompletionReport", "CR-0001"],
];

const RECORD_EDGES: readonly (readonly [string, string, string])[] = [
  ["IS_REALIZED_BY", "SR-0001", "M-0001"],
  ["ALLOCATES", "M-0001", "WI-0001"],
  ["TARGETS", "WI-0001", "AC-0001"],
  ["LOGS", "J-0001", "WL-0001"],
  ["ADDRESSES", "WL-0001", "WI-0001"],
  ["SUBMITS", "WL-0001", "EV-0001"],
  ["SUBMITS", "WL-0001", "CR-0001"],
  ["CLAIMS", "EV-0001", "AC-0001"],
  ["CLAIMS", "CR-0001", "WI-0001"],
];

const EVERY_ID = [...CHAIN, ...RECORD].map(([, id]) => id);

/**
 * Both halves, with the chain approved and the work log left waiting — a graph
 * with a green, a yellow, a board row and a queue card, which is what the test
 * that deletes the feed wants to see stay put.
 */
async function project7(): Promise<RegistryProject> {
  const project = await newProject();
  for (const [type, id] of CHAIN) {
    await node(project, type, id);
  }
  for (const [type, fromId, toId] of CHAIN_EDGES) {
    await edge(project, type, fromId, toId);
  }
  for (const [type, id] of RECORD) {
    await node(project, type, id);
  }
  for (const [type, fromId, toId] of RECORD_EDGES) {
    await edge(project, type, fromId, toId);
  }
  await approveSpecNodes({
    projectId: project.id,
    ids: EVERY_ID.filter((id) => id !== "WL-0001"),
  });
  return project;
}

/* ------------------------------------------------------------------ *
 * Paths, refusals
 * ------------------------------------------------------------------ */

function feedDir(project: RegistryProject): string {
  return path.join(project.path, ".shall", "ledger", "feed");
}

/** The month file the daemon is writing into right now, at its own clock. */
function currentMonthFile(project: RegistryProject): string {
  return path.join(
    feedDir(project),
    `${activityMonthOf(new Date().toISOString())}.yaml`,
  );
}

/** A file written by hand into a state no reader can make sense of. */
async function breakBook(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

/** The newest month's entries, newest first — what the panel shows on open. */
async function entriesOf(project: RegistryProject): Promise<ActivityRecord[]> {
  return (await activityFeed({ projectId: project.id })).entries;
}

async function refused(work: Promise<unknown>): Promise<Refusal> {
  const outcome = await work.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!isRefusal(outcome)) {
    assert.fail(
      `Expected a refusal, received ${outcome === null ? "a resolved promise" : String(outcome)}.`,
    );
  }
  return outcome;
}

async function says(
  work: Promise<unknown>,
  kind: Refusal["kind"],
  message: string,
): Promise<void> {
  const refusal = await refused(work);
  assert.equal(refusal.message, message);
  assert.equal(refusal.kind, kind);
}

const LOG_TAKES =
  "shall log takes specify_done, plan_done, work_done or raise_landed.";

/* ------------------------------------------------------------------ *
 * The agent's door
 * ------------------------------------------------------------------ */

describe("the log door", () => {
  test("writes a kind with its summary and refs, naming nobody, at the daemon's clock", async () => {
    const project = await newProject();
    // Asked from inside the project rather than at its root: the door is in
    // the path family, and an agent stands wherever its shell is.
    const inside = path.join(project.path, ".shall", "spec");

    await logActivity({
      path: inside,
      kind: "work_done",
      summary: "Turn finished — WorkLog 1, Evidence 2",
      // Trimmed and deduplicated, in the order given.
      refs: ["WL-0001", " WL-0001 ", "J-0001"],
    });

    const entries = await entriesOf(project);
    assert.equal(entries.length, 1);
    const [entry] = entries;
    assert.ok(entry);
    assert.equal(entry.kind, "work_done");
    assert.equal(entry.summary, "Turn finished — WorkLog 1, Evidence 2");
    assert.deepEqual(entry.refs, ["WL-0001", "J-0001"]);
    // The four keys and no author — not a `by` holding undefined, no key at
    // all, on the wire as on the disk.
    assert.deepEqual(Object.keys(entry).sort(), ["at", "kind", "refs", "summary"]);
    assert.ok(Date.now() - Date.parse(entry.at) < 60_000, entry.at);
    // The bytes are the emitter's, and the file is the month of the line.
    assert.equal(
      await readFile(currentMonthFile(project), "utf8"),
      emitActivity([entry]),
    );
    // One month file, named by the UTC month of the line it holds, and it is
    // the month the panel opens on.
    const feed = await activityFeed({ projectId: project.id });
    assert.deepEqual(feed.months, [activityMonthOf(entry.at)]);
    assert.equal(feed.month, activityMonthOf(entry.at));
  });

  test("refuses an unknown kind, a blank kind, a blank summary, a ref that is no node id, and a folder outside a project", async () => {
    const project = await newProject();
    const log = (
      kind: string,
      summary = "Something finished.",
      refs: readonly string[] = [],
    ): Promise<void> =>
      logActivity({ path: project.path, kind, summary, refs });

    // A judgment is not a kind the feed has: what a person judged lives in the
    // books, and the word is merely unknown here.
    for (const kind of ["approved", "rejected", "bogus"]) {
      await says(log(kind), "invalid", `Unknown kind: ${kind}. ${LOG_TAKES}`);
    }
    await says(log("  "), "invalid", `A kind is required. ${LOG_TAKES}`);
    await says(log("work_done", "   "), "invalid", "A summary is required.");
    await says(
      log("work_done", "one line\nand another"),
      "invalid",
      "A summary cannot contain a control character.",
    );
    await says(
      log("work_done", "Fine.", ["WL-0001", " "]),
      "invalid",
      "A ref names no node id — --refs takes node ids, separated by commas.",
    );
    await says(
      log("work_done", "Fine.", ["not an id"]),
      "invalid",
      '"not an id" is not a node id. An id uses letters, digits, dots, hyphens and underscores, starts with a letter or digit, and holds at most 64 characters.',
    );

    const outside = await mkdtemp(path.join(workspace, "outside-"));
    await says(
      logActivity({ path: outside, kind: "work_done", summary: "Fine." }),
      "missing",
      `Not a Shall project: ${outside} — no folder here or above it holds a .shall/project.json.`,
    );

    // Every refusal came before the write: there is no feed folder at all.
    await assert.rejects(stat(feedDir(project)));
    assert.deepEqual(await activityFeed({ projectId: project.id }), {
      months: [],
      month: null,
      entries: [],
    });
  });
});

/* ------------------------------------------------------------------ *
 * The reader
 * ------------------------------------------------------------------ */

describe("the activity reader", () => {
  test("lists months newest first and defaults to the newest", async () => {
    const project = await newProject();
    const line = (at: string, summary: string): ActivityRecord => ({
      at,
      kind: "work_done",
      refs: [],
      summary,
    });
    // Seeded by hand through the store's own door, so the months are not the
    // daemon's clock's: two files, the older one written last.
    await appendActivity(
      path.join(feedDir(project), "2026-08.yaml"),
      line("2026-08-01T09:00:00.000Z", "August, first"),
    );
    await appendActivity(
      path.join(feedDir(project), "2026-08.yaml"),
      line("2026-08-02T09:00:00.000Z", "August, second"),
    );
    await appendActivity(
      path.join(feedDir(project), "2026-07.yaml"),
      line("2026-07-15T09:00:00.000Z", "July"),
    );
    // Neighbours that are not months are not months.
    await writeFile(path.join(feedDir(project), "notes.txt"), "hi\n", "utf8");
    await writeFile(path.join(feedDir(project), "2026-08.yaml.bak"), "", "utf8");

    const newest = await activityFeed({ projectId: project.id });
    assert.deepEqual(newest.months, ["2026-08", "2026-07"]);
    assert.equal(newest.month, "2026-08");
    // Newest first, which is the file read from the bottom.
    assert.deepEqual(
      newest.entries.map((entry) => entry.summary),
      ["August, second", "August, first"],
    );

    const july = await activityFeed({ projectId: project.id, month: "2026-07" });
    assert.deepEqual(july.months, ["2026-08", "2026-07"]);
    assert.equal(july.month, "2026-07");
    assert.deepEqual(
      july.entries.map((entry) => entry.summary),
      ["July"],
    );

    await says(
      activityFeed({ projectId: project.id, month: "2026-06" }),
      "missing",
      "The activity feed has no month 2026-06.",
    );
    await says(
      activityFeed({ projectId: project.id, month: "2026-7" }),
      "invalid",
      "A month is written YYYY-MM, like 2026-08.",
    );
    await says(
      activityFeed({ projectId: project.id, month: "August" }),
      "invalid",
      "A month is written YYYY-MM, like 2026-08.",
    );
  });

  test("a project with no feed is no months, no month and no entries", async () => {
    const project = await newProject();
    assert.deepEqual(await activityFeed({ projectId: project.id }), {
      months: [],
      month: null,
      entries: [],
    });
  });
});

/* ------------------------------------------------------------------ *
 * What the feed cannot do
 * ------------------------------------------------------------------ */

describe("the feed's place", () => {
  test("a month nobody can read makes shall log refuse, and is left exactly as it was", async () => {
    const project = await newProject();
    const file = currentMonthFile(project);
    await breakBook(file, "oops: 1\n");

    // The line was the whole request, so the agent hears why it did not land.
    await says(
      logActivity({
        path: project.path,
        kind: "work_done",
        summary: "Fine.",
      }),
      "conflict",
      "The activity feed is a map, not a list of records. Nothing was written over it — the ledger is Shall's own file, so restore it from git or move it aside.",
    );
    assert.equal(await readFile(file, "utf8"), "oops: 1\n");

    // And the panel hears the file's own sentence, with the repair.
    await says(
      activityFeed({ projectId: project.id }),
      "conflict",
      `Shall could not read the activity feed at ${file} — The activity feed is a map, not a list of records. Nothing is lost but this panel: the ledger is Shall's own file, so restore it from git or move it aside.`,
    );
  });

  test("deleting the feed folder changes no colour, board or queue", async () => {
    const project = await project7();
    await logActivity({
      path: project.path,
      kind: "specify_done",
      summary: "Specification drawn out — Goal 1, UC 1, REQ 1, AC 1",
    });
    await logActivity({
      path: project.path,
      kind: "work_done",
      summary: "A turn.",
      refs: ["WL-0001"],
    });
    assert.equal((await entriesOf(project)).length, 2);

    const before = {
      review: await reviewSpec(project.id),
      queue: await reviewQueue(project.id),
      board: await workBoard(project.id),
      status: await statusSpec(project.path),
      boardAt: await boardAt(project.path),
    };

    await rm(feedDir(project), { recursive: true, force: true });

    // The feed is an input to nothing: every answer is byte for byte what it
    // was, and the panel simply has no month to show.
    assert.deepEqual(await reviewSpec(project.id), before.review);
    assert.deepEqual(await reviewQueue(project.id), before.queue);
    assert.deepEqual(await workBoard(project.id), before.board);
    assert.deepEqual(await statusSpec(project.path), before.status);
    assert.deepEqual(await boardAt(project.path), before.boardAt);
    assert.deepEqual(await activityFeed({ projectId: project.id }), {
      months: [],
      month: null,
      entries: [],
    });
  });

  test("the feed joins the spec commit", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001");
    await approveSpecNode({ projectId: project.id, id: "G-0001" });
    await logActivity({
      path: project.path,
      kind: "specify_done",
      summary: "Specification drawn out — Goal 1",
      refs: ["G-0001"],
    });

    await commitSpec({ projectId: project.id, message: "Commit the spec" });

    const written = await run("git", ["show", "--stat", "--format=%s", "HEAD"], {
      cwd: project.path,
    });
    assert.ok(written.stdout.startsWith("Commit the spec\n"), written.stdout);
    assert.ok(written.stdout.includes("ledger/approvals.yaml"), written.stdout);
    assert.ok(written.stdout.includes("ledger/feed/"), written.stdout);
    // Nothing under the ledger folder is left behind — the feed travelled
    // with the books it sits beside.
    const porcelain = await run("git", ["status", "--porcelain"], {
      cwd: project.path,
    });
    assert.ok(!porcelain.stdout.includes(".shall/ledger"), porcelain.stdout);
  });
});
