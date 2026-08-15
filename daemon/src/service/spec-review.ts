import os from "node:os";
import path from "node:path";
import {
  contentHashOf,
  reviewGraph,
  type Approvals,
  type GraphReview,
} from "@shall/core/arith";
import {
  anchorPhrase,
  bandFolderOf,
  type SpecNode,
} from "@shall/core/graph";
import {
  approvalPayload,
  blocksOf,
  emitNodeFile,
  parseNodeFile,
  type ApprovalLedger,
  type ApprovalRecord,
} from "@shall/core/serialize";
import {
  clearDeletionProposal,
  loadGraph,
  readApprovalLedger,
  recordApproval,
  restoreNodeFile,
  revertNodeFile,
  type SpecGraph,
} from "@shall/core/store";
import { conflict, invalid, missing } from "./errors.js";
import { projectSpecFor, served } from "./spec-graph.js";
import {
  commitPaths,
  fileAt,
  fileHistory,
  isDirtyUnder,
  lastCommitTouching,
  pathForId,
  repositoryRoot,
  runGit,
} from "../host/git-cli.js";
import { payloadHash } from "../host/hash.js";
import { readSpecNodeFile } from "../host/project-files.js";

/**
 * The review surface: the colours computed over a project's graph, and the
 * doors that resolve them — approve, reject a proposed deletion, restore a
 * missing file, and the person's own commit button.
 *
 * NOTHING HERE IS STORED. Every answer is computed from two files at the
 * moment of the ask — the spec folder, which says what each node is, and the
 * approval ledger, which remembers what a person approved — and that is the
 * whole of the storage principle: the spec is the truth, git is the history,
 * the ledger is the record, and a colour is arithmetic over the three.
 *
 * GREEN HAS ONE MANUFACTURER. The approve door below is the only place a
 * ledger record is ever written, and it is reached from the web UI alone. A
 * node file says nothing about its own approval — that claim moved out of the
 * frontmatter so that the spec folder is pure authorship — and the ledger is
 * kept out of an agent's hands by a settings rule, which is convention and not
 * a sandbox: the agents' contract is file-only by architecture, and a local
 * token belongs here the day the daemon has any caller it does not trust.
 *
 * THE APPROVE DOOR HASHES OUTSIDE ANY QUEUE, AND THAT IS FINE. It hashes the
 * graph it just loaded and writes only the ledger, never the node file. A save
 * that lands between the read and the record leaves a record naming bytes that
 * are no longer on disk, and the node reads yellow "changed" until the person
 * approves again — never a false green, because a record names content and
 * not a moment.
 */

/** Repo-root-relative, `/`-separated — the one spelling git-cli accepts. */
function toPosix(relative: string): string {
  return relative.split(path.sep).join("/");
}

/** The ledger's records and the daemon's hash, as the colour chain takes them. */
function approvalsOf(records: ApprovalLedger): Approvals {
  return { records, hash: payloadHash };
}

/**
 * The ledger, or the refusal that says why it cannot be trusted. A LEDGER THAT
 * WILL NOT READ IS A REFUSAL, NOT A QUIET ANSWER: a review served over an
 * empty map would paint every approved node yellow, and a screenful of yellow
 * that is really "the ledger would not read" is a lie with a colour. The two
 * callers speak of different casualties — an approve that did not happen, a
 * review that cannot call anything green — so the sentence is theirs to
 * choose; the ledger's own problem sentence is carried inside either.
 */
async function requireLedger(
  ledgerFile: string,
  casualty: "approve" | "review",
): Promise<ApprovalLedger> {
  const ledger = await readApprovalLedger(ledgerFile);
  if (ledger.problem === null) {
    return ledger.records;
  }
  throw conflict(
    casualty === "approve"
      ? `Shall could not read the approval ledger at ${ledgerFile} — ${ledger.problem} Nothing was approved, because writing into a ledger nobody can read would bury what it holds; restore it from git or move it aside, and approve again.`
      : `Shall could not read the approval ledger at ${ledgerFile} — ${ledger.problem} Nothing here is green until it reads: the ledger is Shall's own file, so restore it from git or move it aside.`,
  );
}

/**
 * Whoever pressed the button. The daemon is a single person's local process,
 * so the OS user is the honest name for them; a container without a passwd
 * entry throws, and the environment still knows.
 */
function userName(): string {
  try {
    const name = os.userInfo().username;
    if (name !== "") {
      return name;
    }
  } catch {
    // Fall through to the environment.
  }
  return process.env["USER"] ?? process.env["USERNAME"] ?? "someone";
}

async function gitPresent(cwd: string): Promise<boolean> {
  return (await runGit(cwd, ["--version"])).kind !== "absent";
}

/** The node's file, relative to the spec folder — the spelling every sentence uses. */
function fileOf(node: Pick<SpecNode, "type" | "id">): string {
  return `${bandFolderOf(node.type) ?? "?"}/${node.type}/${node.id}.md`;
}

/**
 * The version of this node git still holds whose CONTENT the ledger's record
 * names — found by arithmetic rather than by bookkeeping: no commit is marked,
 * no sha is stored, the hash itself says which bytes it was taken over.
 *
 * WHAT COMES BACK IS CONTENT, AND ONLY CONTENT. The payload is the canonical
 * file with the node's own address on top, so any commit holding those bytes
 * matches, whenever it was made relative to the approval — and with a daemon
 * that never commits on its own, the commit usually predates the approve. That
 * is exactly why the ledger is a separate file: putting the matched version
 * back moves nothing in the ledger, so the approval survives the revert by
 * construction and there is no signature to carry over.
 *
 * The walk is capped at git-cli's fifty commits of the one file. Past that,
 * the honest answer is "git no longer holds it", and the panel falls back to
 * showing the whole file.
 */
async function approvedVersionFor(
  projectPath: string,
  specDir: string,
  node: SpecNode,
  record: ApprovalRecord | undefined,
): Promise<{
  values: {
    shortName: string;
    name: string;
    body: string;
    commits: readonly string[] | undefined;
  };
  edges: readonly { type: string; toId: string }[];
  deletionProposed: SpecNode["deletionProposed"];
} | null> {
  if (record === undefined) {
    return null;
  }
  const root = await repositoryRoot(projectPath);
  if (root === null) {
    return null;
  }
  const relative = toPosix(
    path.relative(root, path.join(specDir, fileOf(node))),
  );
  for (const sha of await fileHistory(root, relative)) {
    const text = await fileAt(root, sha, relative);
    if (text === null) {
      continue;
    }
    const reading = parseNodeFile(node.type, `${node.id}.md`, text);
    if (reading.node === undefined) {
      continue;
    }
    const payload = approvalPayload(
      node.type,
      node.id,
      reading.node,
      reading.edges,
      blocksOf(reading.node),
    );
    if (payloadHash(payload) === record.approvedHash) {
      return {
        values: {
          shortName: reading.node.shortName,
          name: reading.node.name,
          body: reading.node.body,
          commits: reading.node.commits,
        },
        edges: reading.edges,
        // Inside the payload, so a match carries it faithfully — in practice
        // always undefined, because the approve door refuses to record over one.
        deletionProposed: reading.node.deletionProposed,
      };
    }
  }
  return null;
}

/**
 * The approved content as Shall would write it: the canonical bytes the
 * record's hash names. This is what the panel diffs against and what a
 * rejection puts back — a file that says nothing about its own approval,
 * because no file does any more.
 */
function approvedFileOf(
  node: SpecNode,
  approved: NonNullable<Awaited<ReturnType<typeof approvedVersionFor>>>,
): string {
  return emitNodeFile(node.type, approved.values, approved.edges, {
    deletionProposed: approved.deletionProposed,
  });
}

/**
 * The colours, computed per request. Nothing is cached because nothing is
 * stored: a few hundred hashes over a few KiB each is microseconds, and a
 * cache would be a second home for a fact whose first home is two files.
 */
export async function reviewSpec(projectId: string): Promise<GraphReview> {
  const { specDir, ledgerFile } = await projectSpecFor(projectId);
  const records = await requireLedger(ledgerFile, "review");
  return reviewGraph(await loadGraph(specDir), approvalsOf(records));
}

/**
 * A person turns a node green — the one manufacturer, and it writes one line
 * in the ledger and not a byte of the node's file.
 *
 * The refusals run in the order a person can act on: the project, the ledger,
 * the file's own state, the node's existence, the standing deletion proposal,
 * and last the anchor — because "fix the file" comes before "decide the
 * proposal" and both come before "nothing reaches it yet". The execution band
 * is approved like any other: a record is read by a person too.
 *
 * WHAT IS HASHED IS THE NODE AS LOADED, through the same function the colour
 * chain uses, so the record written here is the record `isHashMatched` will
 * find fitting a moment later — same payload, same edges, same hash.
 */
export async function approveSpecNode(input: {
  projectId: string;
  id: string;
}): Promise<ApprovalRecord> {
  const { specDir, ledgerFile } = await projectSpecFor(input.projectId);
  const records = await requireLedger(ledgerFile, "approve");
  const graph = await loadGraph(specDir);

  const refused = graph.refused.find((entry) => entry.id === input.id);
  if (refused !== undefined) {
    throw conflict(
      `${refused.file} is in a state Shall cannot read — ${refused.problems[0] ?? ""} Nothing was approved, so that edit is still there to fix.`,
    );
  }
  const node = graph.nodes.find((entry) => entry.id === input.id);
  if (node === undefined) {
    throw missing(`Unknown node: ${input.id}`);
  }
  if (node.deletionProposed !== undefined) {
    throw conflict(
      `${input.id} carries a deletion an agent proposed, so approving it would sign a node that is asking to be removed — approve the deletion or reject it first.`,
    );
  }
  const review = reviewGraph(graph, approvalsOf(records));
  const status = review.statuses.find((entry) => entry.id === input.id);
  if (status !== undefined && status.reason === "orphan") {
    throw invalid(
      `${input.id} is a ${node.type} with no live anchor — it is held to the graph by ${anchorPhrase(node.type) ?? "nothing the canon names"}, and none stands — so there is nothing yet to approve.`,
    );
  }

  const edges = graph.edges
    .filter((edge) => edge.fromId === node.id)
    .map((edge) => ({ type: edge.type, toId: edge.toId }));
  return served(
    recordApproval(ledgerFile, input.id, {
      approvedHash: contentHashOf(node, edges, payloadHash),
      by: userName(),
      at: new Date().toISOString(),
    }),
  );
}

/**
 * A proposed deletion, turned down. When git still holds the version the
 * ledger's record names, that version comes back whole — the proposal and
 * whatever else the agent touched are both undone, and the record fits again
 * without the ledger moving. When it does not — no repository, no commit, no
 * record — stripping the block IS the rejection, and any other edit stays
 * where the agent left it, honestly yellow.
 */
export async function rejectSpecDeletion(input: {
  projectId: string;
  id: string;
}): Promise<SpecNode> {
  const { projectPath, specDir, ledgerFile } = await projectSpecFor(
    input.projectId,
  );
  const records = await requireLedger(ledgerFile, "review");
  const graph = await loadGraph(specDir);

  const node = graph.nodes.find((entry) => entry.id === input.id);
  if (node === undefined) {
    const refused = graph.refused.find((entry) => entry.id === input.id);
    if (refused !== undefined) {
      throw conflict(
        `${refused.file} has been edited into a state Shall cannot read — ${refused.problems[0] ?? ""} Nothing was written, so that edit is still there to fix.`,
      );
    }
    throw missing(`Unknown node: ${input.id}`);
  }
  if (node.deletionProposed === undefined) {
    throw invalid(
      `${input.id} carries no proposed deletion, so there is nothing to reject.`,
    );
  }

  const approved = await approvedVersionFor(
    projectPath,
    specDir,
    node,
    records.get(input.id),
  );
  if (approved !== null) {
    return served(
      revertNodeFile(specDir, input.id, approved.values, approved.edges, {
        deletionProposed: approved.deletionProposed,
      }),
    );
  }
  return served(clearDeletionProposal(specDir, input.id));
}

/**
 * The two texts the changed-since-approval diff is drawn from: the file as it
 * stands, and the version the ledger's record names. `approved` is null when
 * git cannot answer — never a refusal, because the panel's fallback (the
 * whole file, with a sentence saying why) is a better answer than an error.
 */
export async function readApprovedVersion(input: {
  projectId: string;
  id: string;
}): Promise<{ approved: string | null; current: string }> {
  const { projectPath, specDir, ledgerFile } = await projectSpecFor(
    input.projectId,
  );
  const records = await requireLedger(ledgerFile, "review");
  const graph = await loadGraph(specDir);
  const node = graph.nodes.find((entry) => entry.id === input.id);
  if (node === undefined) {
    throw missing(`Unknown node: ${input.id}`);
  }
  const current = await readSpecNodeFile(specDir, node.type, node.id);
  if (current === null) {
    throw missing(`Unknown node: ${input.id}`);
  }
  const approved = await approvedVersionFor(
    projectPath,
    specDir,
    node,
    records.get(input.id),
  );
  return {
    approved: approved === null ? null : approvedFileOf(node, approved),
    current,
  };
}

/**
 * A file somebody removed the way no door sanctions, put back from history.
 * Git lends the bytes; the store writes them through its own doors, so what
 * lands is queued, judged and canonical like any other write. The ledger is
 * not consulted and not touched: if it still holds a record for this id and
 * the restored bytes are the bytes it names, the node comes back green by
 * arithmetic alone.
 */
export async function restoreSpecNode(input: {
  projectId: string;
  id: string;
}): Promise<{ file: string }> {
  const { projectPath, specDir } = await projectSpecFor(input.projectId);
  const graph = await loadGraph(specDir);

  const living = graph.nodes.find((entry) => entry.id === input.id);
  if (living !== undefined) {
    throw conflict(
      `${input.id} is already on disk at ${fileOf(living)}, so there is nothing to restore.`,
    );
  }
  const refused = graph.refused.find((entry) => entry.id === input.id);
  if (refused !== undefined) {
    throw conflict(
      `${input.id} is already on disk at ${refused.file}, so there is nothing to restore.`,
    );
  }

  if (!(await gitPresent(projectPath))) {
    throw conflict(
      `Shall could not run git on this machine, so the history ${input.id} needs cannot be read — install git, or restore the file by hand.`,
    );
  }
  const root = await repositoryRoot(projectPath);
  if (root === null) {
    throw conflict(
      `This project is in no git repository, so there is no history to restore ${input.id} from.`,
    );
  }

  const relSpec = toPosix(path.relative(root, specDir));
  const relative = await pathForId(root, relSpec, input.id);
  if (relative === null) {
    throw missing(
      `No commit in this repository holds a file for ${input.id}, so there is nothing to restore it from — only the working tree ever had it.`,
    );
  }

  // At HEAD when the deletion is uncommitted; from the parent of the removing
  // commit when it is. A root commit has no parent, which reads here as the
  // ordinary "nothing before this".
  let source = "HEAD";
  let text = await fileAt(root, "HEAD", relative);
  if (text === null) {
    const last = await lastCommitTouching(root, relative);
    if (last !== null) {
      source = last.slice(0, 7);
      text = await fileAt(root, `${last}^`, relative);
    }
  }
  if (text === null) {
    throw missing(
      `No commit in this repository holds a file for ${input.id}, so there is nothing to restore it from — only the working tree ever had it.`,
    );
  }

  const file = relative.slice(relSpec.length + 1);
  const [, type] = file.split("/");
  if (type === undefined) {
    throw missing(
      `No commit in this repository holds a file for ${input.id}, so there is nothing to restore it from — only the working tree ever had it.`,
    );
  }
  const reading = parseNodeFile(type, `${input.id}.md`, text);
  const first = reading.problems[0];
  if (first !== undefined || reading.node === undefined) {
    throw conflict(
      `The version of ${input.id} held by ${source} is in a state Shall cannot read — ${first ?? ""} Nothing was written, because a restore that lands a file the graph refuses restores nothing.`,
    );
  }

  await served(
    restoreNodeFile(
      specDir,
      type,
      input.id,
      {
        shortName: reading.node.shortName,
        name: reading.node.name,
        body: reading.node.body,
        commits: reading.node.commits,
      },
      reading.edges,
      blocksOf(reading.node),
    ),
  );
  return { file };
}

/**
 * The two paths one commit covers: the spec folder, and the FOLDER the ledger
 * sits in rather than the ledger file itself.
 *
 * THE FOLDER, SO THAT A LEDGER SOMEBODY DELETED BY HAND IS COMMITTED AS THE
 * DELETION IT IS. Naming the file would name a pathspec matching nothing in the
 * worktree the moment it is gone, and the removal would sit outside every
 * commit this button makes — the spec would travel without the record of what
 * was approved in it. Naming the folder keeps the deletion inside the commit,
 * where the history can say when the approvals went.
 *
 * A project nobody has approved anything in has no such folder at all, which
 * `git-cli` is built for: `status` is silent under it and `commitPaths` drops
 * it before git is ever asked to stage it.
 */
function gitPathsFor(
  root: string,
  specDir: string,
  ledgerFile: string,
): readonly string[] {
  return [
    toPosix(path.relative(root, specDir)),
    toPosix(path.relative(root, path.dirname(ledgerFile))),
  ];
}

/**
 * Whether the Commit Spec button has anything to do — a change under the spec
 * folder or under the ledger beside it, because one approval and no edit is a
 * commit worth offering. No repository and no git are ordinary states here, not
 * refusals — the button simply is not shown.
 */
export async function readSpecGitStatus(
  projectId: string,
): Promise<{ repo: boolean; dirty: boolean }> {
  const { projectPath, specDir, ledgerFile } = await projectSpecFor(projectId);
  const root = await repositoryRoot(projectPath);
  if (root === null) {
    return { repo: false, dirty: false };
  }
  return {
    repo: true,
    dirty: await isDirtyUnder(root, gitPathsFor(root, specDir, ledgerFile)),
  };
}

/**
 * The person's own commit — the daemon never makes one on its own. ONE commit,
 * scoped to the spec folder and the approval ledger beside it, so whatever else
 * they have staged stays exactly as staged.
 *
 * The two travel together because they are read together: a spec whose ledger
 * stayed behind clones as a graph nothing is green in, and a ledger whose spec
 * stayed behind names bytes the clone has never seen.
 */
export async function commitSpec(input: {
  projectId: string;
  message: string;
}): Promise<{ ok: true }> {
  const message = input.message.trim();
  if (message === "") {
    throw invalid("A commit message is required.");
  }
  const { projectPath, specDir, ledgerFile } = await projectSpecFor(
    input.projectId,
  );
  if (!(await gitPresent(projectPath))) {
    throw conflict(
      "Shall could not run git on this machine, so the spec could not be committed — install git, or commit by hand.",
    );
  }
  const root = await repositoryRoot(projectPath);
  if (root === null) {
    throw conflict(
      `This project is in no git repository, so there is nothing to commit into — run git init in ${projectPath} first.`,
    );
  }
  const paths = gitPathsFor(root, specDir, ledgerFile);
  if (!(await isDirtyUnder(root, paths))) {
    throw conflict(
      "The spec folder and the approval ledger hold no change to commit, so nothing was committed.",
    );
  }
  const answer = await commitPaths(root, paths, message);
  if (answer.kind !== "ok") {
    const why =
      answer.kind === "failed"
        ? answer.stderr.trim()
        : "git left the machine mid-commit";
    throw conflict(`git refused the commit: ${why}. Nothing was committed.`);
  }
  return { ok: true };
}

/** Referenced so an unused-import rule never bites while SpecGraph stays a doc anchor. */
export type { SpecGraph };
