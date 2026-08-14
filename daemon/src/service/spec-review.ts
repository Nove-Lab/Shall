import os from "node:os";
import path from "node:path";
import { reviewGraph, type GraphReview } from "@shall/core/arith";
import {
  anchorPhrase,
  bandFolderOf,
  isColored,
  type SpecNode,
} from "@shall/core/graph";
import {
  approvalPayload,
  blocksOf,
  parseNodeFile,
} from "@shall/core/serialize";
import {
  approveNodeFile,
  clearDeletionProposal,
  describeFileFailure,
  loadGraph,
  restoreNodeFile,
  revertNodeFile,
  type SpecGraph,
} from "@shall/core/store";
import { conflict, invalid, missing } from "./errors.js";
import { projectSpecFor, served } from "./spec-graph.js";
import {
  ensureApprovalKey,
  getApprovalKeyPath,
  makeSeal,
} from "../host/approval-key.js";
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
import { readSpecNodeFile } from "../host/project-files.js";

/**
 * The review surface: the colours computed over a project's graph, and the
 * doors that resolve them — approve, reject a proposed deletion, restore a
 * missing file, and the person's own commit button.
 *
 * NOTHING HERE IS STORED. Every answer is computed from the files and the key
 * at the moment of the ask, which is the whole of the storage principle: the
 * spec folder is the truth, git is the history, and a colour is arithmetic.
 *
 * GREEN HAS ONE MANUFACTURER. The approve door below is the only place a
 * valid approval block is ever minted, and it is reached from the web UI
 * alone. There is no caller context on this router, so nothing MECHANICAL
 * stops a local process from calling it — the agents' contract is file-only
 * by architecture, the deny rule keeps the key out of their reach, and a
 * local token belongs here the day the daemon has any caller it does not
 * trust.
 */

/** Repo-root-relative, `/`-separated — the one spelling git-cli accepts. */
function toPosix(relative: string): string {
  return relative.split(path.sep).join("/");
}

/**
 * The seal, or the refusal that says why there is none. The two callers speak
 * of different casualties — an approve that could not happen, a review that
 * cannot call anything green — so the sentence is theirs to choose; a corrupt
 * key file already arrives as a whole sentence of its own and is forwarded
 * rather than wrapped.
 */
async function requireSeal(
  casualty: "approve" | "review",
): Promise<ReturnType<typeof makeSeal>> {
  try {
    return makeSeal(await ensureApprovalKey());
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("The approval key at")
    ) {
      throw conflict(error.message);
    }
    const keyPath = getApprovalKeyPath();
    const why = describeFileFailure(error);
    throw conflict(
      casualty === "approve"
        ? `Shall could not open its approval key at ${keyPath} (${why}), so nothing was approved — an approval nobody can verify is not one.`
        : `Shall could not open its approval key at ${keyPath} (${why}), so no approval on this machine can be checked and nothing here is green until it can.`,
    );
  }
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
 * The version of this node git still holds whose bytes the STANDING approval
 * hash fits — the approved version, found by arithmetic rather than by
 * bookkeeping: no commit is marked, no sha is stored, the signature itself
 * says which version it signs. Hashing needs no key, so this works on a
 * machine that could never verify the tag.
 *
 * The walk is capped at git-cli's fifty commits of the one file. Past that,
 * the honest answer is "git no longer holds it", and the panel falls back to
 * showing the whole file.
 */
async function approvedVersionFor(
  projectPath: string,
  specDir: string,
  node: SpecNode,
): Promise<{
  text: string;
  values: { shortName: string; name: string; body: string };
  edges: readonly { type: string; toId: string }[];
  blocks: ReturnType<typeof blocksOf>;
} | null> {
  const approval = node.approval;
  if (approval === undefined) {
    return null;
  }
  const root = await repositoryRoot(projectPath);
  if (root === null) {
    return null;
  }
  const relative = toPosix(
    path.relative(root, path.join(specDir, fileOf(node))),
  );
  const seal = makeSeal(null);
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
    if (seal.hash(payload) === approval.hash) {
      return {
        text,
        values: {
          shortName: reading.node.shortName,
          name: reading.node.name,
          body: reading.node.body,
        },
        edges: reading.edges,
        blocks: blocksOf(reading.node),
      };
    }
  }
  return null;
}

/**
 * The colours, computed per request. Nothing is cached because nothing is
 * stored: a few hundred hashes over a few KiB each is microseconds, and a
 * cache would be a second home for a fact whose first home is the files.
 *
 * A KEY THAT CANNOT BE READ IS A REFUSAL, NOT A QUIET ANSWER: a review served
 * on a keyless seal would paint every approved node yellow, and a screenful
 * of yellow that is really "the key would not open" is a lie with a colour.
 */
export async function reviewSpec(projectId: string): Promise<GraphReview> {
  const { specDir } = await projectSpecFor(projectId);
  const seal = await requireSeal("review");
  return reviewGraph(await loadGraph(specDir), seal);
}

/**
 * A person turns a node green — the one manufacturer.
 *
 * The refusals run in the order a person can act on: the project, the key,
 * the file's own state, the node's existence, the band, the standing deletion
 * proposal, and last the anchor — because "fix the file" comes before "this
 * band has no approvals" and both come before "nothing reaches it yet".
 */
export async function approveSpecNode(input: {
  projectId: string;
  id: string;
}): Promise<SpecNode> {
  const { specDir } = await projectSpecFor(input.projectId);
  const seal = await requireSeal("approve");
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
  if (!isColored(node.type)) {
    throw invalid(
      `${input.id} is a ${node.type}, and the execution band records what happened rather than stating what shall be, so there is nothing here to approve.`,
    );
  }
  if (node.deletionProposed !== undefined) {
    throw conflict(
      `${input.id} carries a deletion an agent proposed, so approving it would sign a node that is asking to be removed — approve the deletion or reject it first.`,
    );
  }
  const review = reviewGraph(graph, seal);
  const status = review.statuses.find((entry) => entry.id === input.id);
  if (status !== undefined && status.reason === "orphan") {
    throw invalid(
      `${input.id} is a ${node.type} with no live anchor — it is held to the graph by ${anchorPhrase(node.type) ?? "nothing the canon names"}, and none stands — so there is nothing yet to approve.`,
    );
  }

  return served(
    approveNodeFile(specDir, input.id, {
      hash: seal.hash,
      sign: seal.sign,
      by: userName(),
      at: new Date().toISOString(),
    }),
  );
}

/**
 * A proposed deletion, turned down. When git still holds the version the
 * standing approval signs, that version comes back whole — the proposal and
 * whatever else the agent touched are both undone, and the old signature fits
 * again. When it does not — no repository, no commit, no approval — stripping
 * the block IS the rejection, and any other edit stays where the agent left
 * it, honestly yellow.
 */
export async function rejectSpecDeletion(input: {
  projectId: string;
  id: string;
}): Promise<SpecNode> {
  const { projectPath, specDir } = await projectSpecFor(input.projectId);
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

  const approved = await approvedVersionFor(projectPath, specDir, node);
  if (approved !== null) {
    return served(
      revertNodeFile(
        specDir,
        input.id,
        approved.values,
        approved.edges,
        approved.blocks,
      ),
    );
  }
  return served(clearDeletionProposal(specDir, input.id));
}

/**
 * The two texts the changed-since-approval diff is drawn from: the file as it
 * stands, and the version the signature still fits. `approved` is null when
 * git cannot answer — never a refusal, because the panel's fallback (the
 * whole file, with a sentence saying why) is a better answer than an error.
 */
export async function readApprovedVersion(input: {
  projectId: string;
  id: string;
}): Promise<{ approved: string | null; current: string }> {
  const { projectPath, specDir } = await projectSpecFor(input.projectId);
  const graph = await loadGraph(specDir);
  const node = graph.nodes.find((entry) => entry.id === input.id);
  if (node === undefined) {
    throw missing(`Unknown node: ${input.id}`);
  }
  const current = await readSpecNodeFile(specDir, node.type, node.id);
  if (current === null) {
    throw missing(`Unknown node: ${input.id}`);
  }
  const approved = await approvedVersionFor(projectPath, specDir, node);
  return { approved: approved === null ? null : approved.text, current };
}

/**
 * A file somebody removed the way no door sanctions, put back from history.
 * Git lends the bytes; the store writes them through its own doors, so what
 * lands is queued, judged and canonical like any other write.
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
      },
      reading.edges,
      blocksOf(reading.node),
    ),
  );
  return { file };
}

/**
 * Whether the Commit Spec button has anything to do. No repository and no git
 * are ordinary states here, not refusals — the button simply is not shown.
 */
export async function readSpecGitStatus(
  projectId: string,
): Promise<{ repo: boolean; dirty: boolean }> {
  const { projectPath, specDir } = await projectSpecFor(projectId);
  const root = await repositoryRoot(projectPath);
  if (root === null) {
    return { repo: false, dirty: false };
  }
  return {
    repo: true,
    dirty: await isDirtyUnder(root, toPosix(path.relative(root, specDir))),
  };
}

/**
 * The person's own commit — the daemon never makes one on its own. One
 * commit, scoped to the spec folder, so whatever else they have staged stays
 * exactly as staged.
 */
export async function commitSpec(input: {
  projectId: string;
  message: string;
}): Promise<{ ok: true }> {
  const message = input.message.trim();
  if (message === "") {
    throw invalid("A commit message is required.");
  }
  const { projectPath, specDir } = await projectSpecFor(input.projectId);
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
  const relSpec = toPosix(path.relative(root, specDir));
  if (!(await isDirtyUnder(root, relSpec))) {
    throw conflict("The spec folder holds no change to commit, so nothing was committed.");
  }
  const answer = await commitPaths(root, relSpec, message);
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
