import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { before, describe, test } from "node:test";
import { emitNodeFile } from "@shall/core/serialize";
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
import { getApprovalKeyPath } from "../host/approval-key.js";
import type { RegistryProject } from "../types.js";

const run = promisify(execFile);

/**
 * The review surface end to end: real folders, a real key under a fake home,
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
  // POSIX — so this redirects the registry, the config and the KEY without a
  // seam that exists only for tests. Git's own config is fenced the same way,
  // or a machine's real identity would leak into the Shall-identity case.
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
      { id: "G-0001", color: "yellow", reason: "unapproved" },
      { id: "T-0001", color: "yellow", reason: "unapproved" },
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
      { id: "J-0001", color: "yellow", reason: "unapproved" },
      { id: "WL-0001", color: "red", reason: "orphan" },
    ]);
    await createSpecEdge({
      projectId: project.id,
      type: "LOGS",
      fromId: "J-0001",
      toId: "WL-0001",
    });
    review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [
      { id: "J-0001", color: "yellow", reason: "unapproved" },
      { id: "WL-0001", color: "yellow", reason: "unapproved" },
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

  test("a key nobody can read is a refusal, never a screenful of yellow", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    const keyPath = getApprovalKeyPath();
    const held = await readFile(keyPath, "utf8");
    try {
      await writeFile(keyPath, "not-a-key\n", "utf8");
      const refusal = await refused(reviewSpec(project.id));
      assert.equal(refusal.kind, "conflict");
      assert.ok(
        refusal.message.startsWith(`The approval key at ${keyPath} is not the 64 hex characters Shall writes`),
        refusal.message,
      );
    } finally {
      await writeFile(keyPath, held, "utf8");
    }
  });
});

describe("the approve door", () => {
  test("writes the block the file did not have, and the node turns green", async () => {
    const project = await newProject();
    await goal(project, "G-0001");

    const approved = await approveSpecNode({ projectId: project.id, id: "G-0001" });
    assert.ok(approved.approval !== undefined);
    assert.ok(approved.approval.hash.startsWith("sha256:"));
    assert.ok(approved.approval.tag.startsWith("hmac:"));

    const text = await readFile(specFile(project, "intent/Goal/G-0001.md"), "utf8");
    assert.ok(text.includes("approval:"), text);

    const review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [
      { id: "G-0001", color: "green", reason: "approved" },
    ]);
  });

  test("a second approval after an edit turns the node green again", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await approveSpecNode({ projectId: project.id, id: "G-0001" });

    // An agent's hand edit: the body moves, the signature stays.
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
      { id: "G-0001", color: "yellow", reason: "changed" },
    ]);

    await approveSpecNode({ projectId: project.id, id: "G-0001" });
    review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [
      { id: "G-0001", color: "green", reason: "approved" },
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

  test("approves a work log, commits and all, and the list survives the signature", async () => {
    // The execution band is judged like the specification, and a WorkLog's
    // commits are inside the payload the approval signs — so they ride through
    // the approve untouched, and a later save carries them over as well.
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
          commits: [{ sha: "9f2b1c4", message: "Keep one key at home" }],
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
    assert.deepEqual(approved.commits, [{ sha: "9f2b1c4", message: "Keep one key at home" }]);
    let review = await reviewSpec(project.id);
    assert.deepEqual(
      review.statuses.find((status) => status.id === "WL-0001"),
      { id: "WL-0001", color: "green", reason: "approved" },
    );

    // An ordinary save touches the body and nothing else in the frontmatter.
    const saved = await updateSpecNode({
      projectId: project.id,
      id: "WL-0001",
      shortName: "day-one",
      name: "The first day",
      body: "It went fine, then better.",
    });
    assert.deepEqual(saved.commits, [{ sha: "9f2b1c4", message: "Keep one key at home" }]);
    assert.deepEqual(saved.approval, approved.approval);
    review = await reviewSpec(project.id);
    assert.deepEqual(
      review.statuses.find((status) => status.id === "WL-0001"),
      { id: "WL-0001", color: "yellow", reason: "changed" },
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
    assert.deepEqual(review.statuses, [
      { id: "R-0001", color: "red", reason: "orphan" },
    ]);
    await says(
      approveSpecNode({ projectId: project.id, id: "R-0001" }),
      "invalid",
      "R-0001 is a Requirement with no live anchor — it is held to the graph by a REQUIRES relation into it, and none stands — so there is nothing yet to approve.",
    );
  });
});

describe("the deletion doors", () => {
  test("a proposal turns the node yellow without anybody writing to it, and rejecting a clean one strips the block", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    const approved = await approveSpecNode({ projectId: project.id, id: "G-0001" });
    assert.ok(approved.approval !== undefined);

    await writeFile(
      specFile(project, "intent/Goal/G-0001.md"),
      emitNodeFile("Goal", GOAL_VALUES, [], {
        approval: approved.approval,
        deletionProposed: { by: "session-7", rationale: "Superseded." },
      }),
      "utf8",
    );
    let review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [
      { id: "G-0001", color: "yellow", reason: "changed" },
    ]);

    const rejected = await rejectSpecDeletion({ projectId: project.id, id: "G-0001" });
    assert.equal("deletionProposed" in rejected, false);
    review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [
      { id: "G-0001", color: "green", reason: "approved" },
    ]);
  });

  test("rejecting a proposal over an edited body brings the approved bytes back from git", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    const approved = await approveSpecNode({ projectId: project.id, id: "G-0001" });
    assert.ok(approved.approval !== undefined);
    const sealed = await readFile(specFile(project, "intent/Goal/G-0001.md"), "utf8");
    await commitSpec({ projectId: project.id, message: "Seal the goal" });

    await writeFile(
      specFile(project, "intent/Goal/G-0001.md"),
      emitNodeFile(
        "Goal",
        { ...GOAL_VALUES, body: "Something else entirely." },
        [],
        {
          approval: approved.approval,
          deletionProposed: { by: "session-7", rationale: "Superseded." },
        },
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
      { id: "G-0001", color: "green", reason: "approved" },
    ]);
  });

  test("rejecting with no history to draw on strips the block and leaves the edit alone", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    const approved = await approveSpecNode({ projectId: project.id, id: "G-0001" });
    assert.ok(approved.approval !== undefined);

    // No commit: the approved bytes live nowhere but the file being edited.
    await writeFile(
      specFile(project, "intent/Goal/G-0001.md"),
      emitNodeFile(
        "Goal",
        { ...GOAL_VALUES, body: "Something else entirely." },
        [],
        {
          approval: approved.approval,
          deletionProposed: { by: "session-7", rationale: "Superseded." },
        },
      ),
      "utf8",
    );

    const rejected = await rejectSpecDeletion({ projectId: project.id, id: "G-0001" });
    assert.equal("deletionProposed" in rejected, false);
    assert.equal(rejected.body, "Something else entirely.");
    // Honestly yellow: the agent's edit is still a change a person has not read.
    const review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [
      { id: "G-0001", color: "yellow", reason: "changed" },
    ]);
  });

  test("rejecting over a commit made before the approval keeps the signature", async () => {
    // The daemon never commits on its own, so commit-then-approve is the
    // ordinary ordering — and the newest commit whose CONTENT the hash fits
    // carries no approval block of its own. The rejection must reattach the
    // STANDING signature rather than take that commit's frontmatter verbatim,
    // or turning a proposal down would destroy the very approval it honours.
    const project = await newProject();
    await goal(project, "G-0001");
    await commitSpec({ projectId: project.id, message: "Seal before approving" });
    const approved = await approveSpecNode({ projectId: project.id, id: "G-0001" });
    assert.ok(approved.approval !== undefined);

    await writeFile(
      specFile(project, "intent/Goal/G-0001.md"),
      emitNodeFile(
        "Goal",
        { ...GOAL_VALUES, body: "Something else entirely." },
        [],
        {
          approval: approved.approval,
          deletionProposed: { by: "session-7", rationale: "Superseded." },
        },
      ),
      "utf8",
    );

    const rejected = await rejectSpecDeletion({ projectId: project.id, id: "G-0001" });
    assert.deepEqual(rejected.approval, approved.approval);
    assert.equal(rejected.body, GOAL_VALUES.body);
    const review = await reviewSpec(project.id);
    assert.deepEqual(review.statuses, [
      { id: "G-0001", color: "green", reason: "approved" },
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
    await commitSpec({ projectId: project.id, message: "Seal the pair" });
    const sealed = await readFile(specFile(project, "intent/Question/Q-0001.md"), "utf8");

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
    const after = await reviewSpec(project.id);
    assert.deepEqual(after.missing, []);
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
    await commitSpec({ projectId: project.id, message: "Seal the goal" });
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
    await commitSpec({ projectId: project.id, message: "Seal the goal" });
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
      commitSpec({ projectId: project.id, message: "Seal the goal" }),
      "conflict",
      `This project is in no git repository, so there is nothing to commit into — run git init in ${project.path} first.`,
    );
  });

  test("one commit holds the spec folder and nothing else", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await writeFile(path.join(project.path, "notes.txt"), "not spec\n", "utf8");

    await commitSpec({ projectId: project.id, message: "Seal the goal" });

    const status = await run("git", ["status", "--porcelain"], {
      cwd: project.path,
    });
    // The stray file is still uncommitted; the spec is not.
    assert.ok(status.stdout.includes("notes.txt"), status.stdout);
    assert.ok(!status.stdout.includes(".shall/spec"), status.stdout);
    const subject = await run("git", ["log", "-1", "--format=%s"], {
      cwd: project.path,
    });
    assert.equal(subject.stdout.trim(), "Seal the goal");
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

    await commitSpec({ projectId: project.id, message: "Seal the goal" });
    const edited = sealed.replace(
      "The spec travels with the repository.\n",
      "The spec travels with the repository, always.\n",
    );
    await writeFile(specFile(project, "intent/Goal/G-0001.md"), edited, "utf8");

    version = await readApprovedVersion({ projectId: project.id, id: "G-0001" });
    assert.equal(version.approved, sealed);
    assert.equal(version.current, edited);
  });

  test("the approved version is the file the approve wrote, even when the matching commit predates it", async () => {
    const project = await newProject();
    await goal(project, "G-0001");
    await commitSpec({ projectId: project.id, message: "Seal before approving" });
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
    // Signature included: a diff against this never shows the approval block
    // itself as a change nobody made.
    assert.equal(version.approved, sealed);
    assert.equal(version.current, edited);
  });
});
