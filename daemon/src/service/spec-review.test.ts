import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { before, describe, test } from "node:test";
import { emitApprovalLedger, emitNodeFile } from "@shall/core/serialize";
import type { ReviewStatus } from "@shall/core/arith";
import { isRefusal, type Refusal } from "./errors.js";
import { createProject } from "./projects.js";
import { createSpecEdge, createSpecNode, updateSpecNode } from "./spec-graph.js";
import {
  approveSpecNode,
  commitSpec,
  readApprovedVersion,
  readSpecGitStatus,
  rejectSpecDeletion,
  restoreSpecNode,
  reviewSpec,
} from "./spec-review.js";
import type { RegistryProject } from "../types.js";

const run = promisify(execFile);

/**
 * The review surface end to end: real folders, a real ledger beside the spec,
 * and real git — `createProject` inits a repository now, so every project
 * these tests make arrives with one, and the few that need to be without take
 * theirs away by hand.
 *
 * THE SENTENCES ARE GOLDENS, written out in full like the rest of this
 * package's, because they are what a person reads when their approve or their
 * restore is refused.
 */

let home = "";
let workspace = "";

before(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "shall-review-"));
  home = path.join(workspace, "home");
  await mkdir(home, { recursive: true });
  // `getShallHome` reads `os.homedir()` on every call, which is `$HOME` on
  // POSIX — so this redirects the registry and the config without a seam that
  // exists only for tests. Git's own config is fenced the same way, or a
  // machine's real identity would leak into the Shall-identity case.
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = path.join(home, ".config");
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});

async function newProject(): Promise<RegistryProject> {
  return createProject(await mkdtemp(path.join(workspace, "project-")));
}

const GOAL_VALUES = {
  shortName: "travel",
  name: "The spec travels with the repository",
  body: "The spec travels with the repository.",
};

async function goal(project: RegistryProject, id: string): Promise<void> {
  await createSpecNode({
    projectId: project.id,
    type: "Goal",
    id,
    ...GOAL_VALUES,
  });
}

function specFile(project: RegistryProject, tail: string): string {
  return path.join(project.path, ".shall", "spec", tail);
}

function ledgerFile(project: RegistryProject): string {
  return path.join(project.path, ".shall", "ledger", "approvals.yaml");
}

/** A status as the review serves it — every one carries the ledger's answer, null when it has none. */
function status(
  id: string,
  color: ReviewStatus["color"],
  reason: ReviewStatus["reason"],
  approval: ReviewStatus["approval"] = null,
): ReviewStatus {
  return { id, color, reason, approval };
}

/** The `{by, at}` a status carries for a record the approve door returned. */
function stamped(record: { by: string; at: string }): { by: string; at: string } {
  return { by: record.by, at: record.at };
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

describe("the review", () => {
  test("a fresh graph is all yellow, because green has one manufacturer", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await createSpecNode({
      projectId: project.id,
      type: "Term",
      id: "T-0001",
      shortName: "spec",
      name: "The spec",
      body: "## Definition\n\nThe files under .shall/spec.",
    });

    const review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [
      status("G-0001", "yellow", "unapproved"),
      status("T-0001", "yellow", "unapproved"),
    ]);
    assert.deepEqual(review.missing, []);
    assert.deepEqual(review.broken, []);
  });

  test("an execution node is coloured like any other, and held by its journal", async () => {
    const project = await newProject();
    await createSpecNode({
      projectId: project.id,
      type: "Journal",
      id: "J-0001",
      shortName: "week-one",
      name: "The first week",
      body: "## Period\n\nThis week.",
    });
    await createSpecNode({
      projectId: project.id,
      type: "WorkLog",
      id: "WL-0001",
      shortName: "day-one",
      name: "The first day",
      body: "It went fine.",
    });
    let review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [
      status("J-0001", "yellow", "unapproved"),
      status("WL-0001", "red", "orphan"),
    ]);
    await createSpecEdge({
      projectId: project.id,
      type: "LOGS",
      fromId: "J-0001",
      toId: "WL-0001",
    });
    review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [
      status("J-0001", "yellow", "unapproved"),
      status("WL-0001", "yellow", "unapproved"),
    ]);
  });

  test("a node the loader refused is broken and not a status", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await writeFile(
      specFile(project, "intent/Goal/G-0002.md"),
      "just some notes\n",
      "utf8",
    );
    const review = await reviewSpec(project.id);
    assert.deepEqual(
      review.statuses.map((status) => status.id),
      ["G-0001"],
    );
    assert.deepEqual(review.broken, [
      {
        file: "intent/Goal/G-0002.md",
        problems: [
          'G-0002.md does not begin with a "---" frontmatter block, so it cannot be read as a spec node.',
        ],
      },
    ]);
  });

  test("a ledger nobody can read is a refusal, never a screenful of yellow", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await mkdir(path.dirname(ledgerFile(project)), { recursive: true });
    await writeFile(ledgerFile(project), "- G-0001\n", "utf8");
    await says(
      reviewSpec(project.id),
      "conflict",
      `Shall could not read the approval ledger at ${ledgerFile(project)} — The approval ledger is a list, not a map from node id to approval record. Nothing here is green until it reads: the ledger is Shall's own file, so restore it from git or move it aside.`,
    );
    await says(
      approveSpecNode({ projectId: project.id, id: "G-0001" }),
      "conflict",
      `Shall could not read the approval ledger at ${ledgerFile(project)} — The approval ledger is a list, not a map from node id to approval record. Nothing was approved, because writing into a ledger nobody can read would bury what it holds; restore it from git or move it aside, and approve again.`,
    );
    // Byte for byte as it was: a refusal writes nothing over the file.
    assert.equal(await readFile(ledgerFile(project), "utf8"), "- G-0001\n");
  });

  test("a project that has approved nothing has no ledger, and that is no problem", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    const review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [status("G-0001", "yellow", "unapproved")]);
    await assert.rejects(stat(ledgerFile(project)));
  });
});

describe("the approve door", () => {
  test("writes one line in the ledger, leaves the file untouched, and the node turns green", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    const file = specFile(project, "intent/Goal/G-0001.md");
    const before = await stat(file);
    const bytes = await readFile(file, "utf8");

    const approved = await approveSpecNode({ projectId: project.id, id: "G-0001" });
    assert.ok(approved.approvedHash.startsWith("sha256:"), approved.approvedHash);
    assert.equal(approved.by, os.userInfo().username);
    assert.ok(Date.now() - Date.parse(approved.at) < 60_000, approved.at);

    // The node file: not a byte, not a stamp. The approval is nowhere in it.
    const after = await stat(file);
    assert.equal(after.mtimeMs, before.mtimeMs);
    assert.equal(after.ino, before.ino);
    assert.equal(await readFile(file, "utf8"), bytes);
    assert.ok(!bytes.includes("approval"), bytes);

    // The ledger: made by this very approve, folder and all, in canonical bytes.
    assert.equal(
      await readFile(ledgerFile(project), "utf8"),
      emitApprovalLedger(new Map([["G-0001", approved]])),
    );

    const review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [
      status("G-0001", "green", "approved", stamped(approved)),
    ]);
  });

  test("a second approval after an edit replaces the record, and the node is green again", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    const first = await approveSpecNode({ projectId: project.id, id: "G-0001" });

    // An agent's hand edit: the body moves, the record stays where it was and
    // no longer fits — and the status still says who approved the version it
    // was taken over.
    const text = await readFile(specFile(project, "intent/Goal/G-0001.md"), "utf8");
    await writeFile(
      specFile(project, "intent/Goal/G-0001.md"),
      text.replace(
        "The spec travels with the repository.\n",
        "The spec travels with the repository, wherever it goes.\n",
      ),
      "utf8",
    );
    let review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [
      status("G-0001", "yellow", "changed", stamped(first)),
    ]);

    const second = await approveSpecNode({ projectId: project.id, id: "G-0001" });
    assert.notEqual(second.approvedHash, first.approvedHash);
    // One record per id: the ledger holds the second and not the first.
    assert.equal(
      await readFile(ledgerFile(project), "utf8"),
      emitApprovalLedger(new Map([["G-0001", second]])),
    );
    review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [
      status("G-0001", "green", "approved", stamped(second)),
    ]);
  });

  test("refuses an id nothing answers to", async () => {
    const project = await newProject();
    await says(
      approveSpecNode({ projectId: project.id, id: "G-9999" }),
      "missing",
      "Unknown node: G-9999",
    );
  });

  test("approves a work log, commits and all, and the list is inside what the record names", async () => {
    // The execution band is judged like the specification, and a WorkLog's
    // commits are inside the payload the record's hash is taken over — so a
    // save that carries them over unchanged still moves the hash by its body.
    const project = await newProject();
    await createSpecNode({
      projectId: project.id,
      type: "Journal",
      id: "J-0001",
      shortName: "week-one",
      name: "The first week",
      body: "## Period\n\nThis week.",
    });
    // Written by hand the way an agent writes one — the type folder made
    // first, because the store makes it only on its own first write.
    const logFile = specFile(project, "execution/WorkLog/WL-0001.md");
    await mkdir(path.dirname(logFile), { recursive: true });
    await writeFile(
      logFile,
      emitNodeFile(
        "WorkLog",
        {
          shortName: "day-one",
          name: "The first day",
          body: "It went fine.",
          commits: ["9f2b1c4"],
        },
        [],
      ),
      "utf8",
    );
    await createSpecEdge({
      projectId: project.id,
      type: "LOGS",
      fromId: "J-0001",
      toId: "WL-0001",
    });

    const approved = await approveSpecNode({ projectId: project.id, id: "WL-0001" });
    let review = await reviewSpec(project.id);
    assert.deepEqual(
      review.statuses.find((entry) => entry.id === "WL-0001"),
      status("WL-0001", "green", "approved", stamped(approved)),
    );

    // An ordinary save touches the body and nothing else in the frontmatter.
    const saved = await updateSpecNode({
      projectId: project.id,
      id: "WL-0001",
      shortName: "day-one",
      name: "The first day",
      body: "It went fine, then better.",
    });
    assert.deepEqual(saved.commits, ["9f2b1c4"]);
    review = await reviewSpec(project.id);
    assert.deepEqual(
      review.statuses.find((entry) => entry.id === "WL-0001"),
      status("WL-0001", "yellow", "changed", stamped(approved)),
    );
  });

  test("refuses a file that will not read, in that file's own sentence", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await writeFile(
      specFile(project, "intent/Goal/G-0001.md"),
      "just some notes\n",
      "utf8",
    );
    await says(
      approveSpecNode({ projectId: project.id, id: "G-0001" }),
      "conflict",
      'intent/Goal/G-0001.md is in a state Shall cannot read — G-0001.md does not begin with a "---" frontmatter block, so it cannot be read as a spec node. Nothing was approved, so that edit is still there to fix.',
    );
  });

  test("refuses a node an agent has asked to remove", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await writeFile(
      specFile(project, "intent/Goal/G-0001.md"),
      emitNodeFile("Goal", GOAL_VALUES, [], {
        deletionProposed: { by: "session-7", rationale: "Superseded." },
      }),
      "utf8",
    );
    await says(
      approveSpecNode({ projectId: project.id, id: "G-0001" }),
      "conflict",
      "G-0001 carries a deletion an agent proposed, so approving it would sign a node that is asking to be removed — approve the deletion or reject it first.",
    );
  });

  test("refuses an orphan, and names what would hold it", async () => {
    const project = await newProject();
    await createSpecNode({
      projectId: project.id,
      type: "Requirement",
      id: "R-0001",
      shortName: "alone",
      name: "A requirement nothing reaches",
      body: "## Statement\n\nThe system shall do the thing.",
    });
    const review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [status("R-0001", "red", "orphan")]);
    await says(
      approveSpecNode({ projectId: project.id, id: "R-0001" }),
      "invalid",
      "R-0001 is a Requirement with no live anchor — it is held to the graph by a REQUIRES relation into it, and none stands — so there is nothing yet to approve.",
    );
  });
});

describe("the deletion doors", () => {
  test("a proposal turns the node yellow without anybody writing to the ledger, and rejecting a clean one strips the block", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    const approved = await approveSpecNode({ projectId: project.id, id: "G-0001" });

    await writeFile(
      specFile(project, "intent/Goal/G-0001.md"),
      emitNodeFile("Goal", GOAL_VALUES, [], {
        deletionProposed: { by: "session-7", rationale: "Superseded." },
      }),
      "utf8",
    );
    let review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [
      status("G-0001", "yellow", "changed", stamped(approved)),
    ]);

    const rejected = await rejectSpecDeletion({ projectId: project.id, id: "G-0001" });
    assert.equal("deletionProposed" in rejected, false);
    review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [
      status("G-0001", "green", "approved", stamped(approved)),
    ]);
  });

  test("rejecting a proposal over an edited body brings the approved bytes back from git", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    const approved = await approveSpecNode({ projectId: project.id, id: "G-0001" });
    const sealed = await readFile(specFile(project, "intent/Goal/G-0001.md"), "utf8");
    await commitSpec({ projectId: project.id, message: "Commit the goal" });

    await writeFile(
      specFile(project, "intent/Goal/G-0001.md"),
      emitNodeFile(
        "Goal",
        { ...GOAL_VALUES, body: "Something else entirely." },
        [],
        { deletionProposed: { by: "session-7", rationale: "Superseded." } },
      ),
      "utf8",
    );

    await rejectSpecDeletion({ projectId: project.id, id: "G-0001" });
    assert.equal(
      await readFile(specFile(project, "intent/Goal/G-0001.md"), "utf8"),
      sealed,
    );
    const review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [
      status("G-0001", "green", "approved", stamped(approved)),
    ]);
  });

  test("rejecting with no history to draw on strips the block and leaves the edit alone", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    const approved = await approveSpecNode({ projectId: project.id, id: "G-0001" });

    // No commit: the approved bytes live nowhere but the file being edited.
    await writeFile(
      specFile(project, "intent/Goal/G-0001.md"),
      emitNodeFile(
        "Goal",
        { ...GOAL_VALUES, body: "Something else entirely." },
        [],
        { deletionProposed: { by: "session-7", rationale: "Superseded." } },
      ),
      "utf8",
    );

    const rejected = await rejectSpecDeletion({ projectId: project.id, id: "G-0001" });
    assert.equal("deletionProposed" in rejected, false);
    assert.equal(rejected.body, "Something else entirely.");
    // Honestly yellow: the agent's edit is still a change a person has not read.
    const review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [
      status("G-0001", "yellow", "changed", stamped(approved)),
    ]);
  });

  test("rejecting over a commit made before the approval brings those bytes back, and the ledger never moves", async () => {
    // The daemon never commits on its own, so commit-then-approve is the
    // ordinary ordering — and the newest commit whose CONTENT the record's
    // hash fits predates the approval. That is fine now, and it is why the
    // ledger is a separate file: putting the matched version back touches no
    // approval, because no file carries one.
    const project = await newProject();
    await goal(project, "G-0001");
    await commitSpec({ projectId: project.id, message: "Commit before approving" });
    const approved = await approveSpecNode({ projectId: project.id, id: "G-0001" });
    const ledger = await readFile(ledgerFile(project), "utf8");

    await writeFile(
      specFile(project, "intent/Goal/G-0001.md"),
      emitNodeFile(
        "Goal",
        { ...GOAL_VALUES, body: "Something else entirely." },
        [],
        { deletionProposed: { by: "session-7", rationale: "Superseded." } },
      ),
      "utf8",
    );

    const rejected = await rejectSpecDeletion({ projectId: project.id, id: "G-0001" });
    assert.equal(rejected.body, GOAL_VALUES.body);
    assert.equal(await readFile(ledgerFile(project), "utf8"), ledger);
    const review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [
      status("G-0001", "green", "approved", stamped(approved)),
    ]);
  });

  test("rejecting where nothing was proposed is refused", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await says(
      rejectSpecDeletion({ projectId: project.id, id: "G-0001" }),
      "invalid",
      "G-0001 carries no proposed deletion, so there is nothing to reject.",
    );
  });

  test("a node deleted by hand reads as missing, and comes back from git at its own path", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await createSpecNode({
      projectId: project.id,
      type: "Question",
      id: "Q-0001",
      shortName: "why",
      name: "Why the thing",
      body: "## Question\n\nWhy?",
    });
    await createSpecEdge({
      projectId: project.id,
      type: "RAISES",
      fromId: "G-0001",
      toId: "Q-0001",
    });
    await commitSpec({ projectId: project.id, message: "Commit the pair" });
    const sealed = await readFile(specFile(project, "intent/Question/Q-0001.md"), "utf8");
    // Approved AFTER the commit, so the ledger names the committed bytes.
    const approved = await approveSpecNode({ projectId: project.id, id: "Q-0001" });

    await rm(specFile(project, "intent/Question/Q-0001.md"));
    const review = await reviewSpec(project.id);
    assert.deepEqual(review.missing, [
      { id: "Q-0001", referencedBy: [{ fromId: "G-0001", type: "RAISES" }] },
    ]);

    const restored = await restoreSpecNode({ projectId: project.id, id: "Q-0001" });
    assert.deepEqual(restored, { file: "intent/Question/Q-0001.md" });
    assert.equal(
      await readFile(specFile(project, "intent/Question/Q-0001.md"), "utf8"),
      sealed,
    );
    // The record outlived the file, and the restored bytes are the bytes it
    // names — so the node comes back green by arithmetic, nobody re-approving.
    const after = await reviewSpec(project.id);
    assert.deepEqual(after.missing, []);
    assert.deepEqual(
      after.statuses.find((entry) => entry.id === "Q-0001"),
      status("Q-0001", "green", "approved", stamped(approved)),
    );
  });

  test("a restore refuses a node already standing", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await says(
      restoreSpecNode({ projectId: project.id, id: "G-0001" }),
      "conflict",
      "G-0001 is already on disk at intent/Goal/G-0001.md, so there is nothing to restore.",
    );
  });

  test("a restore with no repository says so", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await rm(specFile(project, "intent/Goal/G-0001.md"));
    await rm(path.join(project.path, ".git"), { recursive: true, force: true });
    await says(
      restoreSpecNode({ projectId: project.id, id: "G-0001" }),
      "conflict",
      `This project is in no git repository, so there is no history to restore G-0001 from.`,
    );
  });

  test("a restore of a file no commit ever held says only the working tree had it", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await rm(specFile(project, "intent/Goal/G-0001.md"));
    await says(
      restoreSpecNode({ projectId: project.id, id: "G-0001" }),
      "missing",
      "No commit in this repository holds a file for G-0001, so there is nothing to restore it from — only the working tree ever had it.",
    );
  });
});

describe("the git doors", () => {
  test("a project in no repository says so rather than refusing", async () => {
    const project = await newProject();
    await rm(path.join(project.path, ".git"), { recursive: true, force: true });
    assert.deepEqual(await readSpecGitStatus(project.id), {
      repo: false,
      dirty: false,
    });
  });

  test("the status follows the person's own commits", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    assert.deepEqual(await readSpecGitStatus(project.id), {
      repo: true,
      dirty: true,
    });
    await commitSpec({ projectId: project.id, message: "Commit the goal" });
    assert.deepEqual(await readSpecGitStatus(project.id), {
      repo: true,
      dirty: false,
    });
  });

  test("a blank message is refused before git is asked anything", async () => {
    const project = await newProject();
    await says(
      commitSpec({ projectId: project.id, message: "   " }),
      "invalid",
      "A commit message is required.",
    );
  });

  test("a commit with nothing to commit is refused in a sentence", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await commitSpec({ projectId: project.id, message: "Commit the goal" });
    await says(
      commitSpec({ projectId: project.id, message: "Again" }),
      "conflict",
      "The spec folder holds no change to commit, so nothing was committed.",
    );
  });

  test("a commit without a repository names the fix", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await rm(path.join(project.path, ".git"), { recursive: true, force: true });
    await says(
      commitSpec({ projectId: project.id, message: "Commit the goal" }),
      "conflict",
      `This project is in no git repository, so there is nothing to commit into — run git init in ${project.path} first.`,
    );
  });

  test("one commit holds the spec folder and nothing else", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await writeFile(path.join(project.path, "notes.txt"), "not spec\n", "utf8");

    await commitSpec({ projectId: project.id, message: "Commit the goal" });

    const status = await run("git", ["status", "--porcelain"], {
      cwd: project.path,
    });
    // The stray file is still uncommitted; the spec is not.
    assert.ok(status.stdout.includes("notes.txt"), status.stdout);
    assert.ok(!status.stdout.includes(".shall/spec"), status.stdout);
    const subject = await run("git", ["log", "-1", "--format=%s"], {
      cwd: project.path,
    });
    assert.equal(subject.stdout.trim(), "Commit the goal");
  });

  test("the approved version arrives beside the current bytes, and null when git never held it", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await approveSpecNode({ projectId: project.id, id: "G-0001" });
    const sealed = await readFile(specFile(project, "intent/Goal/G-0001.md"), "utf8");

    // Before any commit, there is nothing to compare against — and that is an
    // answer, not an error.
    let version = await readApprovedVersion({ projectId: project.id, id: "G-0001" });
    assert.equal(version.approved, null);
    assert.equal(version.current, sealed);

    await commitSpec({ projectId: project.id, message: "Commit the goal" });
    const edited = sealed.replace(
      "The spec travels with the repository.\n",
      "The spec travels with the repository, always.\n",
    );
    await writeFile(specFile(project, "intent/Goal/G-0001.md"), edited, "utf8");

    version = await readApprovedVersion({ projectId: project.id, id: "G-0001" });
    assert.equal(version.approved, sealed);
    assert.equal(version.current, edited);
  });

  test("the approved version is the canonical file the record's hash names, whenever it was committed", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await commitSpec({ projectId: project.id, message: "Commit before approving" });
    await approveSpecNode({ projectId: project.id, id: "G-0001" });
    const sealed = await readFile(
      specFile(project, "intent/Goal/G-0001.md"),
      "utf8",
    );
    const edited = sealed.replace(
      "The spec travels with the repository.\n",
      "The spec travels with the repository, always.\n",
    );
    await writeFile(specFile(project, "intent/Goal/G-0001.md"), edited, "utf8");

    const version = await readApprovedVersion({ projectId: project.id, id: "G-0001" });
    // The commit predates the approval and matches all the same: the record
    // names content, and the diff base is that content and nothing more.
    assert.equal(version.approved, sealed);
    assert.equal(version.current, edited);
  });

  test("a ledger nobody has written yet leaves the approved version null, not refused", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await commitSpec({ projectId: project.id, message: "Commit the goal" });
    const version = await readApprovedVersion({ projectId: project.id, id: "G-0001" });
    assert.equal(version.approved, null);
  });
});
