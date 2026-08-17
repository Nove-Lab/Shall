import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { before, describe, test } from "node:test";
import type { ReviewStatus } from "@shall/core/arith";
import { bandFolderOf, formatEdgeId } from "@shall/core/graph";
import {
  emitAcceptanceLedger,
  emitApprovalLedger,
  emitRejectionLedger,
  type ApprovalRecord,
} from "@shall/core/serialize";
import { isRefusal, type Refusal } from "./errors.js";
import { createProject } from "./projects.js";
import {
  createSpecEdge,
  createSpecNode,
  removeSpecEdge,
  updateSpecNode,
} from "./spec-graph.js";
import {
  acceptSpecClosure,
  approveSpecNodes,
  leaveSpecOpen,
  rejectSpecNode,
  reviewQueue,
  withdrawSpecRejection,
} from "./spec-queue.js";
import { approveSpecNode, commitSpec, reviewSpec } from "./spec-review.js";
import type { RegistryProject } from "../types.js";

const run = promisify(execFile);

/**
 * The review queue end to end: real folders, three real books beside the spec,
 * and real git.
 *
 * THE SENTENCES ARE GOLDENS, written out in full like the rest of this
 * package's, because they are what a person reads when their rejection, their
 * approve-all or their closing is refused.
 *
 * THE BYTES ARE GOLDENS TOO, and that is the sharper half. Every door here
 * writes ONE file and the tests say which — a reject that touched the node's
 * own file, or an accept that wrote into the approvals, would be the whole
 * design broken and nothing on a screen would say so.
 */

let home = "";
let workspace = "";

before(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "shall-queue-"));
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
 * somebody has to draw, and a queue over a folder of orphans would test the
 * anchor guard and nothing else.
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

/** The execution side: a journal, the work under it, and the evidence it submitted. */
const RECORD: readonly (readonly [string, string])[] = [
  ["Journal", "J-0001"],
  ["WorkLog", "WL-0001"],
  ["Evidence", "EV-0001"],
];

const RECORD_EDGES: readonly (readonly [string, string, string])[] = [
  ["LOGS", "J-0001", "WL-0001"],
  ["SUBMITS", "WL-0001", "EV-0001"],
  ["CLAIMS", "EV-0001", "AC-0001"],
];

const EVERY_ID = [...CHAIN, ...RECORD].map(([, id]) => id);

async function chain(project: RegistryProject): Promise<void> {
  for (const [type, id] of CHAIN) {
    await node(project, type, id);
  }
  for (const [type, fromId, toId] of CHAIN_EDGES) {
    await edge(project, type, fromId, toId);
  }
}

async function record(project: RegistryProject): Promise<void> {
  for (const [type, id] of RECORD) {
    await node(project, type, id);
  }
  for (const [type, fromId, toId] of RECORD_EDGES) {
    await edge(project, type, fromId, toId);
  }
}

/** Both halves, which is the graph most of these tests want. */
async function project7(): Promise<RegistryProject> {
  const project = await newProject();
  await chain(project);
  await record(project);
  return project;
}

/* ------------------------------------------------------------------ *
 * Paths, colours, refusals
 * ------------------------------------------------------------------ */

function specFile(
  project: RegistryProject,
  type: string,
  id: string,
): string {
  return path.join(
    project.path,
    ".shall",
    "spec",
    bandFolderOf(type) ?? "?",
    type,
    `${id}.md`,
  );
}

function bookAt(project: RegistryProject, name: string): string {
  return path.join(project.path, ".shall", "ledger", name);
}

const approvalsAt = (project: RegistryProject): string =>
  bookAt(project, "approvals.yaml");
const rejectionsAt = (project: RegistryProject): string =>
  bookAt(project, "rejections.yaml");
const acceptancesAt = (project: RegistryProject): string =>
  bookAt(project, "acceptances.yaml");

/** A book written by hand into a state no reader can make sense of. */
async function breakBook(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, "utf8");
}

async function statusFor(
  project: RegistryProject,
  id: string,
): Promise<ReviewStatus> {
  const found = (await reviewSpec(project.id)).statuses.find(
    (entry) => entry.id === id,
  );
  assert.ok(found, `The review served no status for ${id}.`);
  return found;
}

/** The bytes of a node's file, and the two numbers that say it was not rewritten. */
async function fileState(
  file: string,
): Promise<{ bytes: string; mtimeMs: number; ino: number }> {
  const details = await stat(file);
  return {
    bytes: await readFile(file, "utf8"),
    mtimeMs: details.mtimeMs,
    ino: details.ino,
  };
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

const REJECTED_G_0001 =
  "G-0001 carries a standing rejection, so approving it would record a green nobody would ever see — a rejection is asked about before an approval, and the node would stay red. Withdraw the rejection first, or leave it to lapse when the node is fixed.";

/* ------------------------------------------------------------------ *
 * Reject
 * ------------------------------------------------------------------ */

describe("the reject door", () => {
  test("writes one book and nothing else, and the node turns red", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001");
    const file = specFile(project, "Goal", "G-0001");
    const before = await fileState(file);

    const written = await rejectSpecNode({
      projectId: project.id,
      id: "G-0001",
      rationale: "The goal promises more than the daemon does.",
    });
    assert.ok(written.rejectedHash.startsWith("sha256:"), written.rejectedHash);
    assert.equal(written.by, os.userInfo().username);
    assert.ok(Date.now() - Date.parse(written.at) < 60_000, written.at);
    assert.equal(
      written.rationale,
      "The goal promises more than the daemon does.",
    );

    // The node file: not a byte, not a stamp. A refusal is the person's word
    // about the file and never a word IN it.
    assert.deepEqual(await fileState(file), before);

    // One book made, folder and all, in canonical bytes — and only one.
    assert.equal(
      await readFile(rejectionsAt(project), "utf8"),
      emitRejectionLedger(new Map([["G-0001", written]])),
    );
    await assert.rejects(stat(approvalsAt(project)));
    await assert.rejects(stat(acceptancesAt(project)));

    const status = await statusFor(project, "G-0001");
    assert.equal(status.color, "red");
    assert.equal(status.reason, "rejected");
    assert.deepEqual(status.rejection, {
      by: written.by,
      at: written.at,
      rationale: written.rationale,
    });
    assert.equal(status.approval, null);
  });

  test("a rationale of nothing but blank lines is refused", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001");
    await says(
      rejectSpecNode({ projectId: project.id, id: "G-0001", rationale: "  \n\n " }),
      "invalid",
      "A rationale is required — what is wrong, and what should it be instead.",
    );
    await assert.rejects(stat(rejectionsAt(project)));
  });

  test("a multi-line rationale round-trips through the book", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001");
    const rationale = [
      "Two things are wrong.",
      "",
      "The scope is a product and not a goal.",
      "The wording names a file, which is a plan.",
    ].join("\n");
    // The edges are trimmed and the line endings normalised by the same
    // judgement a body meets, so what goes in with a CRLF and a trailing blank
    // line comes back as the four lines above.
    const written = await rejectSpecNode({
      projectId: project.id,
      id: "G-0001",
      rationale: `\n${rationale.replace(/\n/g, "\r\n")}\n\n`,
    });
    assert.equal(written.rationale, rationale);
    assert.equal(
      (await statusFor(project, "G-0001")).rejection?.rationale,
      rationale,
    );
  });

  test("refuses an id nothing answers to", async () => {
    const project = await newProject();
    await says(
      rejectSpecNode({
        projectId: project.id,
        id: "G-9999",
        rationale: "Never mind.",
      }),
      "missing",
      "Unknown node: G-9999",
    );
  });

  test("a file the loader refused is a fix and not a judgement", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001");
    await writeFile(
      specFile(project, "Goal", "G-0002"),
      "just some notes\n",
      "utf8",
    );
    await says(
      rejectSpecNode({
        projectId: project.id,
        id: "G-0002",
        rationale: "Unreadable.",
      }),
      "conflict",
      'intent/Goal/G-0002.md is in a state Shall cannot read — G-0002.md does not begin with a "---" frontmatter block, so it cannot be read as a spec node. Nothing was rejected, so that edit is still there to fix.',
    );
  });

  test("a node nothing reaches is anchored before it is judged", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001");
    await says(
      rejectSpecNode({
        projectId: project.id,
        id: "R-0001",
        rationale: "Not this.",
      }),
      "invalid",
      "R-0001 is a Requirement with no live anchor — it is held to the graph by a REQUIRES relation into it, and none stands — fix that first; a rejection is a judgement on a node the graph holds.",
    );
  });

  test("a green node is refusable, and the refusal outranks the approval", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001");
    const approved = await approveSpecNode({
      projectId: project.id,
      id: "G-0001",
    });
    assert.equal((await statusFor(project, "G-0001")).color, "green");

    const written = await rejectSpecNode({
      projectId: project.id,
      id: "G-0001",
      rationale: "Read it again: it is two goals.",
    });
    let status = await statusFor(project, "G-0001");
    assert.equal(status.color, "red");
    assert.equal(status.reason, "rejected");
    // Neither book erased the other. The approval is still there to come back.
    assert.deepEqual(status.approval, { by: approved.by, at: approved.at });
    assert.equal(
      await readFile(approvalsAt(project), "utf8"),
      emitApprovalLedger(new Map([["G-0001", approved]])),
    );

    // An agent fixes the node: the hashes stop agreeing, the rejection stops
    // standing, and the record stays behind as the history of the hearing.
    const file = specFile(project, "Goal", "G-0001");
    const text = await readFile(file, "utf8");
    await writeFile(file, text.replace("What G-0001 says.", "One goal."), "utf8");
    status = await statusFor(project, "G-0001");
    assert.equal(status.color, "yellow");
    assert.equal(status.reason, "changed");
    assert.deepEqual(status.rejection, {
      by: written.by,
      at: written.at,
      rationale: written.rationale,
    });
  });

  test("re-rejecting a fixed node replaces the record", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001");
    const first = await rejectSpecNode({
      projectId: project.id,
      id: "G-0001",
      rationale: "Too broad.",
    });
    const file = specFile(project, "Goal", "G-0001");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace("What G-0001 says.", "Still broad."),
      "utf8",
    );
    const second = await rejectSpecNode({
      projectId: project.id,
      id: "G-0001",
      rationale: "Still too broad.",
    });
    assert.notEqual(second.rejectedHash, first.rejectedHash);
    assert.equal(
      await readFile(rejectionsAt(project), "utf8"),
      emitRejectionLedger(new Map([["G-0001", second]])),
    );
  });
});

describe("the withdraw door", () => {
  test("removes the key, empties the book to nothing, and the node is yellow again", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001");
    await rejectSpecNode({
      projectId: project.id,
      id: "G-0001",
      rationale: "On reflection, no.",
    });
    assert.deepEqual(
      await withdrawSpecRejection({ projectId: project.id, id: "G-0001" }),
      { ok: true },
    );
    // An empty ledger is no bytes at all — not a deleted file, and not a
    // document saying it holds nothing.
    assert.equal(await readFile(rejectionsAt(project), "utf8"), "");
    assert.equal((await stat(rejectionsAt(project))).size, 0);

    const status = await statusFor(project, "G-0001");
    assert.equal(status.color, "yellow");
    assert.equal(status.reason, "unapproved");
    assert.equal(status.rejection, null);
  });

  test("withdrawing what nobody recorded says so", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001");
    await says(
      withdrawSpecRejection({ projectId: project.id, id: "G-0001" }),
      "invalid",
      "G-0001 carries no rejection, so there is nothing to withdraw.",
    );
  });
});

/* ------------------------------------------------------------------ *
 * Approve
 * ------------------------------------------------------------------ */

describe("the aim rule at the doors", () => {
  test("a log or evidence outside its task's aim can be neither approved nor rejected — fix the seam first", async () => {
    // project7 wires EV-0001 → AC-0001 and WL-0001 under J-0001 only. Add a
    // task WL-0001 addresses that targets some OTHER criterion: the log and
    // the evidence are red by grammar, and both doors say the sentence.
    const project = await project7();
    await node(project, "AcceptanceCriterion", "AC-0002");
    await edge(project, "HAS_CRITERION", "R-0001", "AC-0002");
    await node(project, "ImplementationTask", "IT-0001");
    await edge(project, "TARGETS", "IT-0001", "AC-0002");
    await edge(project, "ADDRESSES", "WL-0001", "IT-0001");
    const status = await statusFor(project, "WL-0001");
    assert.equal(status.reason, "off-target");
    const sentence =
      "WL-0001 addresses IT-0001, which targets AC-0002, but submits EV-0001, which claims AC-0001 — a work log's evidence claims only the criteria its task targets.";
    assert.equal(status.problem, sentence);
    await says(
      approveSpecNode({ projectId: project.id, id: "WL-0001" }),
      "invalid",
      `${sentence} Fix that first — there is nothing yet to approve.`,
    );
    await says(
      rejectSpecNode({ projectId: project.id, id: "EV-0001", rationale: "No." }),
      "invalid",
      "EV-0001 claims AC-0001, but the work log that submitted it, WL-0001, addresses IT-0001, which targets AC-0002 — a work log's evidence claims only the criteria its task targets. Fix that first; a rejection is a judgement on a node the graph holds together.",
    );
    // Retarget the task at the criterion the evidence claims, and both are
    // ordinary yellow again — nothing was stored, nothing to clear.
    await removeSpecEdge({
      projectId: project.id,
      id: formatEdgeId("IT-0001", "TARGETS", "AC-0002"),
    });
    await edge(project, "TARGETS", "IT-0001", "AC-0001");
    assert.equal((await statusFor(project, "WL-0001")).reason, "unapproved");
    assert.equal((await statusFor(project, "EV-0001")).reason, "unapproved");
  });
});

describe("approving over a rejection", () => {
  test("the single door refuses a node somebody has refused", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001");
    await rejectSpecNode({
      projectId: project.id,
      id: "G-0001",
      rationale: "Not yet.",
    });
    await says(
      approveSpecNode({ projectId: project.id, id: "G-0001" }),
      "invalid",
      REJECTED_G_0001,
    );
    await assert.rejects(stat(approvalsAt(project)));

    // Withdrawn, the very same call goes through.
    await withdrawSpecRejection({ projectId: project.id, id: "G-0001" });
    const approved = await approveSpecNode({
      projectId: project.id,
      id: "G-0001",
    });
    assert.equal((await statusFor(project, "G-0001")).color, "green");
    assert.equal(
      await readFile(approvalsAt(project), "utf8"),
      emitApprovalLedger(new Map([["G-0001", approved]])),
    );
  });
});

describe("the approve-all door", () => {
  test("writes every record in one rewrite, at one instant", async () => {
    const project = await project7();
    const records = await approveSpecNodes({
      projectId: project.id,
      ids: EVERY_ID,
    });
    assert.equal(records.length, EVERY_ID.length);
    // In the order the caller asked, whatever order the file sorts them into.
    assert.deepEqual(
      records.map((entry) => entry.by),
      EVERY_ID.map(() => os.userInfo().username),
    );
    const instants = new Set(records.map((entry) => entry.at));
    assert.equal(instants.size, 1, [...instants].join(", "));

    const union = new Map<string, ApprovalRecord>();
    EVERY_ID.forEach((id, index) => {
      const held = records[index];
      assert.ok(held);
      union.set(id, held);
    });
    assert.equal(
      await readFile(approvalsAt(project), "utf8"),
      emitApprovalLedger(union),
    );

    const review = await reviewSpec(project.id);
    assert.deepEqual(
      review.statuses.filter((entry) => entry.color !== "green"),
      [],
    );
    // The criterion is green and still open: closure is the other axis.
    assert.equal(
      review.statuses.find((entry) => entry.id === "AC-0001")?.closure,
      "open",
    );
  });

  test("one blocked id blocks the bundle, and the refusal names every blocker", async () => {
    const project = await project7();
    await rejectSpecNode({
      projectId: project.id,
      id: "G-0001",
      rationale: "Two goals in one.",
    });
    await says(
      approveSpecNodes({
        projectId: project.id,
        ids: ["R-0001", "G-0001", "G-9999"],
      }),
      "invalid",
      `${REJECTED_G_0001} Unknown node: G-9999 Nothing was approved.`,
    );
    // All or nothing: R-0001 was perfectly approvable and no record was made.
    await assert.rejects(stat(approvalsAt(project)));
  });

  test("a deletion an agent proposed blocks the whole bundle, and the refusal says which", async () => {
    // A proposal sits inside the hashed payload, so the node is yellow and a
    // member of its bundle like any other — and the queue's card drops it from
    // [Approve all] for exactly this reason. Sent anyway, it is one blocker
    // among the ids, the sentence names it, and nothing at all is written.
    const project = await project7();
    const file = specFile(project, "Goal", "G-0001");
    const text = await readFile(file, "utf8");
    await writeFile(
      file,
      text.replace(
        "---\n\n",
        "deletionProposed:\n  by: agent\n  rationale: Folded into G-0002.\n---\n\n",
      ),
      "utf8",
    );
    await says(
      approveSpecNodes({ projectId: project.id, ids: EVERY_ID }),
      "conflict",
      "G-0001 carries a deletion an agent proposed, so approving it would record a node that is asking to be removed — approve the deletion or reject it first. Nothing was approved.",
    );
    await assert.rejects(stat(approvalsAt(project)));
  });

  test("an empty list is nothing to do, said before anything is read", async () => {
    const project = await newProject();
    await says(
      approveSpecNodes({ projectId: project.id, ids: [] }),
      "invalid",
      "Nothing to approve.",
    );
  });

  test("the same id twice is one node judged once", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001");
    const records = await approveSpecNodes({
      projectId: project.id,
      ids: ["G-0001", "G-0001"],
    });
    assert.equal(records.length, 1);
  });
});

/* ------------------------------------------------------------------ *
 * Accept
 * ------------------------------------------------------------------ */

/** The whole fixture, approved — the state every closure test starts from. */
async function greenProject(): Promise<RegistryProject> {
  const project = await project7();
  await approveSpecNodes({ projectId: project.id, ids: EVERY_ID });
  return project;
}

describe("the accept door", () => {
  test("closes the criterion over everything that claims it, and writes one book", async () => {
    const project = await greenProject();
    const acFile = specFile(project, "AcceptanceCriterion", "AC-0001");
    const before = await fileState(acFile);

    const closed = await acceptSpecClosure({ projectId: project.id, id: "AC-0001" });
    assert.ok(closed.subjectHash.startsWith("sha256:"), closed.subjectHash);
    assert.equal(closed.by, os.userInfo().username);
    assert.ok(Date.now() - Date.parse(closed.at) < 60_000, closed.at);
    assert.deepEqual(
      closed.claimants.map((entry: { id: string; hash: string }) => entry.id),
      ["EV-0001"],
    );
    assert.ok(closed.claimants[0]?.hash.startsWith("sha256:"));

    // Neither file moved: a closing is a record about a criterion and a list,
    // and a word in none of their files.
    assert.deepEqual(await fileState(acFile), before);
    assert.equal(
      await readFile(acceptancesAt(project), "utf8"),
      emitAcceptanceLedger(
        new Map([
          [
            "AC-0001",
            {
              kind: "criterion" as const,
              subjectHash: closed.subjectHash,
              claimants: new Map(
                closed.claimants.map((entry: { id: string; hash: string }) => [entry.id, entry.hash]),
              ),
              by: closed.by,
              at: closed.at,
            },
          ],
        ]),
      ),
    );

    const status = await statusFor(project, "AC-0001");
    assert.equal(status.color, "green");
    assert.equal(status.closure, "closed");
    assert.equal(status.leftOpen, null);
    // Only a criterion has the mark at all.
    assert.equal((await statusFor(project, "EV-0001")).closure, null);
  });

  test("every claimant has to be approved first, and the refusal names the ones that are not", async () => {
    // A claim nobody has read is not yet a claim a person can judge on: the
    // door waits, as the queue does, and says which claimants it is waiting for.
    const project = await greenProject();
    await node(project, "Evidence", "EV-0002");
    await edge(project, "CLAIMS", "EV-0002", "AC-0001");
    await says(
      acceptSpecClosure({ projectId: project.id, id: "AC-0001" }),
      "invalid",
      "EV-0002 claims AC-0001 and is not approved yet — a criterion is closed, or left open, only over evidence a person has read. Approve it first (or reject it and have it fixed), and the criterion comes back to the queue.",
    );
    await node(project, "Evidence", "EV-0003");
    await edge(project, "CLAIMS", "EV-0003", "AC-0001");
    await approveSpecNodes({ projectId: project.id, ids: ["EV-0003"] });
    await rejectSpecNode({
      projectId: project.id,
      id: "EV-0003",
      rationale: "Wrong screen.",
    });
    // Two of them now — one unread, one refused — and the sentence is for two.
    await says(
      leaveSpecOpen({ projectId: project.id, id: "AC-0001", rationale: "Not yet." }),
      "invalid",
      "EV-0002, EV-0003 claim AC-0001 and are not approved yet — a criterion is closed, or left open, only over evidence a person has read. Approve them first (or reject them and have them fixed), and the criterion comes back to the queue.",
    );
    // Not in the queue while it waits, and open.
    const queue = await reviewQueue(project.id);
    assert.equal(queue.bundles.some((bundle) => bundle.id === "closure:AC-0001"), false);
    assert.equal((await statusFor(project, "AC-0001")).closure, "open");
    // Approve one, withdraw the other's refusal and approve it: the whole list
    // is green, and the closing is over all three.
    await approveSpecNodes({ projectId: project.id, ids: ["EV-0002"] });
    await withdrawSpecRejection({ projectId: project.id, id: "EV-0003" });
    const closed = await acceptSpecClosure({ projectId: project.id, id: "AC-0001" });
    assert.deepEqual(
      closed.claimants.map((entry: { id: string; hash: string }) => entry.id),
      ["EV-0001", "EV-0002", "EV-0003"],
    );
    assert.equal((await statusFor(project, "AC-0001")).closure, "closed");
  });

  test("refuses a criterion nobody has approved yet — both sides have to be green", async () => {
    // EVERY CLAIMANT READ IS NOT ENOUGH. "Met" is a statement about words
    // somebody agreed to, and a criterion still being edited has nothing
    // settled for the evidence to be met against. Reported from a screen as
    // the other subject: a green, closed task was edited, went yellow, and
    // could still be closed — leaving a yellow node wearing a green Done.
    const project = await project7();
    await approveSpecNodes({ projectId: project.id, ids: ["EV-0001"] });
    const sentence =
      "AC-0001 is not approved yet — a criterion is closed, or left open, only once a person has agreed to what it demands, and there is nothing settled for the evidence to be met against until then. Approve it, and the question comes back with it.";
    await says(
      acceptSpecClosure({ projectId: project.id, id: "AC-0001" }),
      "invalid",
      sentence,
    );
    await says(
      leaveSpecOpen({ projectId: project.id, id: "AC-0001", rationale: "No." }),
      "invalid",
      sentence,
    );
    await assert.rejects(stat(acceptancesAt(project)));
    assert.equal((await statusFor(project, "AC-0001")).closure, "open");

    // Approving it is the whole of what was missing.
    await approveSpecNodes({ projectId: project.id, ids: ["AC-0001"] });
    await acceptSpecClosure({ projectId: project.id, id: "AC-0001" });
    assert.equal((await statusFor(project, "AC-0001")).closure, "closed");
  });

  test("refuses a task whose own words moved after it was closed", async () => {
    // The reported sequence, walked end to end: close it green, edit it, and
    // the closing lapses by arithmetic — the mark is open again — while the
    // door refuses to write a new one until it is read.
    const project = await project7();
    await node(project, "ModuleDesign", "MD-0001");
    await edge(project, "IS_REALIZED_BY", "SR-0001", "MD-0001");
    await node(project, "ImplementationTask", "IT-0001");
    await edge(project, "ALLOCATES", "MD-0001", "IT-0001");
    await edge(project, "TARGETS", "IT-0001", "AC-0001");
    await edge(project, "ADDRESSES", "WL-0001", "IT-0001");
    await approveSpecNodes({
      projectId: project.id,
      ids: [...EVERY_ID, "MD-0001", "IT-0001"],
    });
    await acceptSpecClosure({ projectId: project.id, id: "IT-0001" });
    assert.equal((await statusFor(project, "IT-0001")).closure, "closed");

    await updateSpecNode({
      projectId: project.id,
      id: "IT-0001",
      shortName: "it-0001",
      name: "The node called IT-0001",
      body: "A wider scope than the one that was signed off.",
    });
    const moved = await statusFor(project, "IT-0001");
    assert.equal(moved.color, "yellow");
    assert.equal(moved.closure, "open");
    assert.equal(moved.taskState, "blocked");

    await says(
      acceptSpecClosure({ projectId: project.id, id: "IT-0001" }),
      "invalid",
      "IT-0001 is not approved yet — a task is closed, or left open, only once a person has agreed to what it asks for, and until then there is nothing settled for the work to be done against. Approve it, and the question comes back with it.",
    );
    // And the queue asks the approval question alone until it is answered.
    assert.deepEqual(
      (await reviewQueue(project.id)).bundles
        .map((bundle) => bundle.id)
        .filter((id) => id.endsWith("IT-0001")),
      ["spec:IT-0001"],
    );
  });

  test("a node that is neither a criterion nor a task is refused by type", async () => {
    const project = await greenProject();
    await says(
      acceptSpecClosure({ projectId: project.id, id: "R-0001" }),
      "invalid",
      "R-0001 is a Requirement, and only an AcceptanceCriterion or an ImplementationTask is a thing that can be closed or left open — evidence is shown against a criterion, work against a task, and against nothing else.",
    );
    await says(
      acceptSpecClosure({ projectId: project.id, id: "AC-9999" }),
      "missing",
      "Unknown node: AC-9999",
    );
  });

  test("a criterion nothing claims is nothing to close, and nothing to leave open", async () => {
    const project = await newProject();
    await chain(project);
    // Approved, so the refusal below is about the empty list and not about the
    // criterion's own words.
    await approveSpecNodes({
      projectId: project.id,
      ids: CHAIN.map(([, id]) => id),
    });
    const sentence =
      "Nothing claims AC-0001 yet — a criterion is closed, or left open, over the evidence attached to it, and there is none. An Evidence node draws a CLAIMS relation at the criterion in its own file.";
    await says(
      acceptSpecClosure({ projectId: project.id, id: "AC-0001" }),
      "invalid",
      sentence,
    );
    await says(
      leaveSpecOpen({ projectId: project.id, id: "AC-0001", rationale: "No." }),
      "invalid",
      sentence,
    );
    await assert.rejects(stat(acceptancesAt(project)));
    await assert.rejects(stat(rejectionsAt(project)));
  });

  test("editing the criterion reopens it, with nobody told and nothing swept", async () => {
    const project = await greenProject();
    await acceptSpecClosure({ projectId: project.id, id: "AC-0001" });
    assert.equal((await statusFor(project, "AC-0001")).closure, "closed");

    const file = specFile(project, "AcceptanceCriterion", "AC-0001");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace(
        "What AC-0001 says.",
        "What AC-0001 says, more exactly.",
      ),
      "utf8",
    );
    const status = await statusFor(project, "AC-0001");
    assert.equal(status.closure, "open");
    assert.equal(status.color, "yellow");
    assert.equal(status.reason, "changed");
    // The record is still in the book — it lapsed, it was not deleted.
    assert.ok(
      (await readFile(acceptancesAt(project), "utf8")).includes("AC-0001:"),
    );
  });

  test("a new claimant reopens it at once — and the queue asks only once it is approved", async () => {
    const project = await greenProject();
    await acceptSpecClosure({ projectId: project.id, id: "AC-0001" });
    await node(project, "Evidence", "EV-0002");
    await edge(project, "CLAIMS", "EV-0002", "AC-0001");
    // Open at once: the list moved. Not asked about yet: nobody has read the
    // new claim, so the criterion simply waits, open and off the queue.
    assert.equal((await statusFor(project, "AC-0001")).closure, "open");
    let queue = await reviewQueue(project.id);
    assert.equal(queue.bundles.some((bundle) => bundle.id === "closure:AC-0001"), false);
    // Approving the claimant is what brings the criterion to the queue.
    await approveSpecNodes({ projectId: project.id, ids: ["EV-0002"] });
    queue = await reviewQueue(project.id);
    assert.ok(queue.bundles.some((bundle) => bundle.id === "closure:AC-0001"));
  });
});

describe("the leave-open door", () => {
  test("writes the word into the rejection ledger with the list, and colours nothing", async () => {
    const project = await greenProject();
    const word = await leaveSpecOpen({
      projectId: project.id,
      id: "AC-0001",
      rationale: "The log shows the request and not the response.",
    });
    assert.deepEqual(
      word.claimants.map((entry) => entry.id),
      ["EV-0001"],
    );
    assert.equal(word.rationale, "The log shows the request and not the response.");
    assert.equal(
      await readFile(rejectionsAt(project), "utf8"),
      emitRejectionLedger(
        new Map([
          [
            "AC-0001",
            {
              rejectedHash: word.subjectHash,
              leftOpen: {
                kind: "criterion" as const,
                claimants: new Map(
                  word.claimants.map((entry) => [entry.id, entry.hash]),
                ),
              },
              by: word.by,
              at: word.at,
              rationale: word.rationale,
            },
          ],
        ]),
      ),
    );
    const status = await statusFor(project, "AC-0001");
    assert.equal(status.color, "green");
    assert.equal(status.reason, "approved");
    assert.equal(status.rejection, null);
    assert.equal(status.closure, "open");
    assert.deepEqual(status.leftOpen, {
      by: word.by,
      at: word.at,
      rationale: word.rationale,
    });
    // Out of the queue: a word was said about this list.
    const queue = await reviewQueue(project.id);
    assert.equal(queue.bundles.some((bundle) => bundle.id === "closure:AC-0001"), false);
  });

  test("a rationale is required, and judged as a body", async () => {
    const project = await greenProject();
    await says(
      leaveSpecOpen({ projectId: project.id, id: "AC-0001", rationale: "  \n " }),
      "invalid",
      "A rationale is required — what the evidence does not show, and what would.",
    );
    await assert.rejects(stat(rejectionsAt(project)));
  });

  test("closing after leaving open removes the word; leaving open after closing removes the acceptance", async () => {
    const project = await greenProject();
    await leaveSpecOpen({ projectId: project.id, id: "AC-0001", rationale: "Not yet." });
    await acceptSpecClosure({ projectId: project.id, id: "AC-0001" });
    // One book or the other, never both.
    assert.equal(await readFile(rejectionsAt(project), "utf8"), "");
    assert.ok((await readFile(acceptancesAt(project), "utf8")).includes("AC-0001:"));
    let status = await statusFor(project, "AC-0001");
    assert.equal(status.closure, "closed");
    assert.equal(status.leftOpen, null);

    await leaveSpecOpen({ projectId: project.id, id: "AC-0001", rationale: "Regressed." });
    assert.equal(await readFile(acceptancesAt(project), "utf8"), "");
    assert.ok((await readFile(rejectionsAt(project), "utf8")).includes("AC-0001:"));
    status = await statusFor(project, "AC-0001");
    assert.equal(status.closure, "open");
    assert.equal(status.leftOpen?.rationale, "Regressed.");
  });

  test("a criterion whose own wording is refused is judged by neither door, and asked about by neither", async () => {
    // The one place the axes touch: words a person said are wrong are not
    // words anything can be met against — and the leave-open record would
    // share the refusal's key, so writing it would un-refuse the wording.
    const project = await greenProject();
    await rejectSpecNode({
      projectId: project.id,
      id: "AC-0001",
      rationale: "The wording is wrong.",
    });
    const sentence =
      "AC-0001 carries a standing rejection of its own wording, and a criterion is closed or left open only once its wording stands — withdraw that rejection first, or leave it to lapse when the criterion is fixed.";
    await says(
      acceptSpecClosure({ projectId: project.id, id: "AC-0001" }),
      "invalid",
      sentence,
    );
    await says(
      leaveSpecOpen({ projectId: project.id, id: "AC-0001", rationale: "Not met." }),
      "invalid",
      sentence,
    );
    const status = await statusFor(project, "AC-0001");
    assert.equal(status.reason, "rejected");
    assert.equal(status.rejection?.rationale, "The wording is wrong.");
    assert.equal(status.closure, "open");
    const queue = await reviewQueue(project.id);
    assert.equal(queue.bundles.some((bundle) => bundle.kind === "ac-closure"), false);
  });

  test("the word lapses when the list moves, and the queue asks again once the list is read", async () => {
    const project = await greenProject();
    await leaveSpecOpen({ projectId: project.id, id: "AC-0001", rationale: "Not yet." });
    await node(project, "Evidence", "EV-0002");
    await edge(project, "CLAIMS", "EV-0002", "AC-0001");
    const status = await statusFor(project, "AC-0001");
    assert.equal(status.leftOpen, null);
    assert.equal(status.closure, "open");
    await approveSpecNodes({ projectId: project.id, ids: ["EV-0002"] });
    const queue = await reviewQueue(project.id);
    assert.ok(queue.bundles.some((bundle) => bundle.id === "closure:AC-0001"));
    // Withdrawing the lapsed word by hand is the same undo as any rejection.
    await withdrawSpecRejection({ projectId: project.id, id: "AC-0001" });
    assert.equal(await readFile(rejectionsAt(project), "utf8"), "");
  });
});

/* ------------------------------------------------------------------ *
 * The queue
 * ------------------------------------------------------------------ */

describe("the review queue", () => {
  test("cuts a graph into the bundles a person decides one at a time", async () => {
    const project = await greenProject();
    // Everything approved and nothing closed: the only thing left to decide is
    // whether the criterion is met on the evidence claiming it.
    let queue = await reviewQueue(project.id);
    assert.deepEqual(
      queue.bundles.map((bundle) => [bundle.kind, bundle.id]),
      [["ac-closure", "closure:AC-0001"]],
    );

    // An agent edits a requirement and a work log: a spec approval under the
    // requirement, and a work report titled by the journal above the log.
    for (const [type, id] of [
      ["Requirement", "R-0001"],
      ["WorkLog", "WL-0001"],
    ] as const) {
      const file = specFile(project, type, id);
      await writeFile(
        file,
        (await readFile(file, "utf8")).replace(
          `What ${id} says.`,
          `What ${id} says now.`,
        ),
        "utf8",
      );
    }
    queue = await reviewQueue(project.id);
    assert.deepEqual(
      queue.bundles.map((bundle) => [bundle.kind, bundle.id]),
      [
        ["ac-closure", "closure:AC-0001"],
        ["spec-approval", "spec:R-0001"],
        ["work-report", "report:J-0001"],
      ],
    );

    const spec = queue.bundles.find((bundle) => bundle.id === "spec:R-0001");
    assert.ok(spec && spec.kind === "spec-approval");
    assert.equal(spec.rootId, "R-0001");
    assert.equal(spec.title, "R-0001 The node called R-0001");
    assert.deepEqual(
      spec.members.map((member) => [member.id, member.color, member.reason]),
      [["R-0001", "yellow", "changed"]],
    );
    // The criterion under it is green and listed anyway: approving the parent
    // is also a statement that the child still says the right thing.
    assert.deepEqual(
      spec.unchanged.map((entry) => entry.id),
      ["AC-0001"],
    );
    assert.deepEqual(spec.counts, [
      { type: "Requirement", count: 1 },
      { type: "AcceptanceCriterion", count: 1 },
    ]);

    const report = queue.bundles.find((bundle) => bundle.id === "report:J-0001");
    assert.ok(report && report.kind === "work-report");
    assert.equal(report.rootId, "J-0001");
    assert.deepEqual(
      report.members.map((member) => member.id),
      ["WL-0001"],
    );
    // Scan order and not id order: the journal is the container, the evidence
    // hangs below the log inside it.
    assert.deepEqual(
      report.unchanged.map((entry) => entry.id),
      ["J-0001", "EV-0001"],
    );

    // Judged, the bundles leave the queue — nothing was stored, so nothing has
    // to be cleared.
    await approveSpecNodes({
      projectId: project.id,
      ids: ["R-0001", "WL-0001"],
    });
    await acceptSpecClosure({ projectId: project.id, id: "AC-0001" });
    assert.deepEqual((await reviewQueue(project.id)).bundles, []);
  });

  test("a rejected node rides along in a bundle another root reaches", async () => {
    const project = await greenProject();
    // The criterion is refused, so it is red — and the requirement above it is
    // yellow, so the card for the requirement still shows the refusal.
    for (const [type, id] of [["Requirement", "R-0001"]] as const) {
      const file = specFile(project, type, id);
      await writeFile(
        file,
        (await readFile(file, "utf8")).replace(
          `What ${id} says.`,
          `What ${id} says now.`,
        ),
        "utf8",
      );
    }
    await rejectSpecNode({
      projectId: project.id,
      id: "AC-0001",
      rationale: "The evaluation process is not a process.",
    });

    const queue = await reviewQueue(project.id);
    const spec = queue.bundles.find((bundle) => bundle.id === "spec:R-0001");
    assert.ok(spec && spec.kind === "spec-approval");
    assert.deepEqual(
      spec.members.map((member) => [member.id, member.color, member.reason]),
      [
        ["R-0001", "yellow", "changed"],
        ["AC-0001", "red", "rejected"],
      ],
    );
    assert.equal(
      spec.members.find((member) => member.id === "AC-0001")?.rejection
        ?.rationale,
      "The evaluation process is not a process.",
    );
    // Words a person refused are not judged for closure, so that bundle is gone.
    assert.deepEqual(
      queue.bundles.filter((bundle) => bundle.kind === "ac-closure"),
      [],
    );
  });
});

/* ------------------------------------------------------------------ *
 * Books nobody can read
 * ------------------------------------------------------------------ */

describe("a book nobody can read", () => {
  test("names itself, whichever of the three it is", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001");
    await breakBook(rejectionsAt(project), "- G-0001\n");
    await says(
      reviewSpec(project.id),
      "conflict",
      `Shall could not read the rejection ledger at ${rejectionsAt(project)} — The rejection ledger is a list, not a map from node id to rejection record. Nothing here is green until it reads: the ledger is Shall's own file, so restore it from git or move it aside.`,
    );
    await says(
      reviewQueue(project.id),
      "conflict",
      `Shall could not read the rejection ledger at ${rejectionsAt(project)} — The rejection ledger is a list, not a map from node id to rejection record. Nothing here is green until it reads: the ledger is Shall's own file, so restore it from git or move it aside.`,
    );
    await says(
      rejectSpecNode({
        projectId: project.id,
        id: "G-0001",
        rationale: "No.",
      }),
      "conflict",
      `Shall could not read the rejection ledger at ${rejectionsAt(project)} — The rejection ledger is a list, not a map from node id to rejection record. Nothing was rejected, because writing into a ledger nobody can read would bury what it holds; restore it from git or move it aside, and reject again.`,
    );
    // Byte for byte as it was: a refusal writes nothing over the file.
    assert.equal(await readFile(rejectionsAt(project), "utf8"), "- G-0001\n");

    await rm(rejectionsAt(project));
    await breakBook(acceptancesAt(project), "- AC-0001\n");
    await says(
      acceptSpecClosure({ projectId: project.id, id: "AC-0001" }),
      "conflict",
      `Shall could not read the acceptance ledger at ${acceptancesAt(project)} — The acceptance ledger is a list, not a map from node id to acceptance record. Nothing was accepted, because writing into a ledger nobody can read would bury what it holds; restore it from git or move it aside, and accept again.`,
    );
    await says(
      approveSpecNodes({ projectId: project.id, ids: ["G-0001"] }),
      "conflict",
      `Shall could not read the acceptance ledger at ${acceptancesAt(project)} — The acceptance ledger is a list, not a map from node id to acceptance record. Nothing was approved, because writing into a ledger nobody can read would bury what it holds; restore it from git or move it aside, and approve again.`,
    );
    await assert.rejects(stat(approvalsAt(project)));
  });

  test("a withdrawal over a broken book says a withdrawal did not happen", async () => {
    // The withdraw door has its own casualty: a person told "nothing was
    // rejected" after pressing Undo would read that as the rejection standing.
    const project = await newProject();
    await node(project, "Goal", "G-0001");
    await breakBook(rejectionsAt(project), "- G-0001\n");
    await says(
      withdrawSpecRejection({ projectId: project.id, id: "G-0001" }),
      "conflict",
      `Shall could not read the rejection ledger at ${rejectionsAt(project)} — The rejection ledger is a list, not a map from node id to rejection record. Nothing was withdrawn, because writing into a ledger nobody can read would bury what it holds; restore it from git or move it aside, and withdraw again.`,
    );
    assert.equal(await readFile(rejectionsAt(project), "utf8"), "- G-0001\n");
  });

  test("the approvals answer first, because they are read first", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001");
    await breakBook(approvalsAt(project), "- G-0001\n");
    await breakBook(rejectionsAt(project), "- G-0001\n");
    await says(
      reviewSpec(project.id),
      "conflict",
      `Shall could not read the approval ledger at ${approvalsAt(project)} — The approval ledger is a list, not a map from node id to approval record. Nothing here is green until it reads: the ledger is Shall's own file, so restore it from git or move it aside.`,
    );
  });
});

/* ------------------------------------------------------------------ *
 * One commit
 * ------------------------------------------------------------------ */

describe("the commit button", () => {
  test("one commit holds the spec folder and all three books", async () => {
    const project = await greenProject();
    await acceptSpecClosure({ projectId: project.id, id: "AC-0001" });
    await rejectSpecNode({
      projectId: project.id,
      id: "G-0001",
      rationale: "Two goals in one sentence.",
    });

    await commitSpec({ projectId: project.id, message: "Commit the judgements" });

    const written = await run("git", ["show", "--stat", "--format=%s", "HEAD"], {
      cwd: project.path,
    });
    assert.ok(written.stdout.startsWith("Commit the judgements\n"), written.stdout);
    for (const book of ["approvals.yaml", "rejections.yaml", "acceptances.yaml"]) {
      assert.ok(written.stdout.includes(book), `${book} missing:\n${written.stdout}`);
    }
    // Both halves are in the history; what the button never named — the
    // project's own metadata beside them — is still where it was.
    const porcelain = await run("git", ["status", "--porcelain"], {
      cwd: project.path,
    });
    assert.ok(!porcelain.stdout.includes(".shall/spec"), porcelain.stdout);
    assert.ok(!porcelain.stdout.includes(".shall/ledger"), porcelain.stdout);
  });
});

/**
 * THE OTHER CLOSURE SUBJECT, over the same folders and the same doors.
 *
 * A task is closed on the WORK that addressed it, exactly as a criterion is
 * closed on the evidence claiming it, and everything below is the criterion's
 * own block asked about a task: one book written, the other emptied, the
 * unread claimant named, the wording refusal respected.
 */
describe("closing a task", () => {
  /** The plan side: a module, the task under it, and a log addressing it. */
  async function planned(): Promise<RegistryProject> {
    const project = await project7();
    await node(project, "ModuleDesign", "MD-0001");
    await edge(project, "IS_REALIZED_BY", "SR-0001", "MD-0001");
    await node(project, "ImplementationTask", "IT-0001");
    await edge(project, "ALLOCATES", "MD-0001", "IT-0001");
    await edge(project, "TARGETS", "IT-0001", "AC-0001");
    await edge(project, "ADDRESSES", "WL-0001", "IT-0001");
    await approveSpecNodes({
      projectId: project.id,
      ids: [...EVERY_ID, "MD-0001", "IT-0001"],
    });
    return project;
  }

  test("writes the task's own two key names, and nothing else moves", async () => {
    const project = await planned();
    const taskFile = specFile(project, "ImplementationTask", "IT-0001");
    const before = await fileState(taskFile);

    const closed = await acceptSpecClosure({ projectId: project.id, id: "IT-0001" });
    assert.equal(closed.kind, "task");
    assert.deepEqual(
      closed.claimants.map((entry) => entry.id),
      ["WL-0001"],
    );
    assert.deepEqual(await fileState(taskFile), before);
    const book = await readFile(acceptancesAt(project), "utf8");
    assert.ok(book.includes("IT-0001:\n  taskHash: "), book);
    assert.ok(book.includes("  workLogs:\n    WL-0001: "), book);
    assert.equal(await statusFor(project, "IT-0001").then((s) => s.closure), "closed");
    assert.equal(
      await statusFor(project, "IT-0001").then((s) => s.taskState),
      "done",
    );
  });

  test("the queue asks about it, and stops once a word is written", async () => {
    const project = await planned();
    // The criterion is asked about too — EV-0001 claims it — and the two
    // closures sit side by side, the criterion first.
    const before = await reviewQueue(project.id);
    assert.deepEqual(
      before.bundles.map((bundle) => bundle.id),
      ["closure:AC-0001", "completion:IT-0001"],
    );
    await acceptSpecClosure({ projectId: project.id, id: "IT-0001" });
    assert.deepEqual(
      (await reviewQueue(project.id)).bundles.map((bundle) => bundle.id),
      ["closure:AC-0001"],
    );
  });

  test("leaving it open writes the other book and empties this one", async () => {
    const project = await planned();
    await acceptSpecClosure({ projectId: project.id, id: "IT-0001" });
    const word = await leaveSpecOpen({
      projectId: project.id,
      id: "IT-0001",
      rationale: "WL-0001 stops at the happy path; the retry is not shown.",
    });
    assert.equal(word.kind, "task");
    assert.equal(await readFile(acceptancesAt(project), "utf8"), "");
    const book = await readFile(rejectionsAt(project), "utf8");
    assert.ok(book.includes("IT-0001:\n  rejectedHash: "), book);
    assert.ok(book.includes("  workLogs:\n    WL-0001: "), book);
    // The left-open word is not a rejection of the task's own wording: the
    // colour is untouched and only the closure axis heard it.
    const status = await statusFor(project, "IT-0001");
    assert.equal(status.color, "green");
    assert.equal(status.closure, "open");
    assert.equal(status.leftOpen?.rationale, word.rationale);
    assert.equal(status.rejection, null);
    assert.equal(status.taskState, "ready");
  });

  test("refuses while a work log addressing it is unread", async () => {
    const project = await planned();
    await node(project, "WorkLog", "WL-0002");
    await edge(project, "LOGS", "J-0001", "WL-0002");
    await edge(project, "ADDRESSES", "WL-0002", "IT-0001");
    await says(
      acceptSpecClosure({ projectId: project.id, id: "IT-0001" }),
      "invalid",
      "WL-0002 addresses IT-0001 and is not approved yet — a task is closed, or left open, only over work a person has read. Approve it first (or reject it and have it fixed), and the task comes back to the queue.",
    );
  });

  test("refuses a task nothing addresses, and one whose wording is refused", async () => {
    const project = await planned();
    await removeSpecEdge({
      projectId: project.id,
      id: formatEdgeId("WL-0001", "ADDRESSES", "IT-0001"),
    });
    await says(
      acceptSpecClosure({ projectId: project.id, id: "IT-0001" }),
      "invalid",
      "Nothing addresses IT-0001 yet — a task is closed, or left open, over the work attached to it, and there is none. A WorkLog draws an ADDRESSES relation at the task in its own file.",
    );

    const second = await planned();
    await rejectSpecNode({
      projectId: second.id,
      id: "IT-0001",
      rationale: "The scope is two tasks in one.",
    });
    await says(
      acceptSpecClosure({ projectId: second.id, id: "IT-0001" }),
      "invalid",
      "IT-0001 carries a standing rejection of its own wording, and a task is closed or left open only once its wording stands — withdraw that rejection first, or leave it to lapse when the task is fixed.",
    );
  });

  test("asks again when another log addresses it", async () => {
    const project = await planned();
    await acceptSpecClosure({ projectId: project.id, id: "IT-0001" });
    await node(project, "WorkLog", "WL-0002");
    await edge(project, "LOGS", "J-0001", "WL-0002");
    await edge(project, "ADDRESSES", "WL-0002", "IT-0001");
    // A different list, so the record lapses: open again, and off the queue
    // only until the new log is read.
    assert.equal(await statusFor(project, "IT-0001").then((s) => s.closure), "open");
    await approveSpecNodes({ projectId: project.id, ids: ["WL-0002"] });
    assert.equal(
      (await reviewQueue(project.id)).bundles.some(
        (bundle) => bundle.id === "completion:IT-0001",
      ),
      true,
    );
  });
});
