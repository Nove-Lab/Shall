import os from "node:os";
import path from "node:path";
import {
  colorContextOf,
  contentHashOf,
  reviewGraph,
  writtenEdgesOf,
  type ColorContext,
  type GraphReview,
  type Ledgers,
  type ReviewStatus,
} from "@shall/core/arith";
import {
  orphanStem,
  type SpecNode,
  type SpecNodeValues,
} from "@shall/core/graph";
import {
  approvalPayload,
  blocksOf,
  emitNodeFile,
  parseNodeFile,
  valuesOf,
  type ApprovalRecord,
} from "@shall/core/serialize";
import {
  clearDeletionProposal,
  loadGraph,
  readAcceptanceLedger,
  readApprovalLedger,
  readRejectionLedger,
  recordApproval,
  RESTORE_THE_BOOK,
  restoreNodeFile,
  revertNodeFile,
  type SpecGraph,
} from "@shall/core/store";
import { Refusal, conflict, invalid, missing } from "./errors.js";
import { fileOf, ledgersOf, projectSpecFor, served } from "./spec-graph.js";
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
 * NOTHING HERE IS STORED. Every answer is computed at the moment of the ask
 * from the spec folder, which says what each node is, and the three books
 * beside it, which remember what a person approved, refused and closed — and
 * that is the whole of the storage principle: the spec is the truth, the
 * ledgers are the record, a colour is arithmetic over them, and git is the
 * history the version, restore and commit doors reach into.
 *
 * GREEN HAS ONE MANUFACTURER, AND SO DO RED-BY-REJECTION AND CLOSED. The
 * approve door below and the queue's five doors in `spec-queue.ts`
 * (`approveNodes`, `reject`, `withdrawRejection`, `acceptClosure`, `leaveOpen`
 * — the last one writes the rejection ledger's left-open record) are the only
 * places a ledger record is ever written, and every one of them is reached from
 * the web UI alone. A node file says nothing about its own judgement — that
 * claim moved out of the frontmatter so that the spec folder is pure authorship
 * — and the ledger folder is kept out of an agent's hands by a settings rule,
 * which is convention and not a sandbox: the agents' contract is file-only by
 * architecture, and a local token belongs here the day the daemon has any
 * caller it does not trust.
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

/** Where a project's three books sit — `projectSpecFor`'s answer, narrowed. */
export interface LedgerPaths {
  readonly ledgerFile: string;
  readonly rejectionsFile: string;
  readonly acceptancesFile: string;
}

/**
 * How the reader gets the book back — the tail the three READING casualties
 * end in.
 *
 * They differ in what cannot be told apart while the book is unreadable and
 * agree word for word on the repair, because the repair is a fact about the
 * FILE and not about who was asking — so the repair comes from core, where the
 * door that refuses a write already ends its own sentence with it, and the day
 * it changes it cannot change in one place and not the other.
 */
/** What a casualty says after the book's own problem sentence. */
const CASUALTY: Record<
  | "approve"
  | "review"
  | "reject"
  | "withdraw"
  | "accept"
  | "board"
  | "status"
  | "vitals",
  string
> = {
  approve:
    "Nothing was approved, because writing into a ledger nobody can read would bury what it holds; restore it from git or move it aside, and approve again.",
  review: `Nothing here is green until it reads: ${RESTORE_THE_BOOK}`,
  reject:
    "Nothing was rejected, because writing into a ledger nobody can read would bury what it holds; restore it from git or move it aside, and reject again.",
  withdraw:
    "Nothing was withdrawn, because writing into a ledger nobody can read would bury what it holds; restore it from git or move it aside, and withdraw again.",
  accept:
    "Nothing was accepted, because writing into a ledger nobody can read would bury what it holds; restore it from git or move it aside, and accept again.",
  board: `Nothing on the board can be trusted until it reads — what needs fixing, what is finished and what is ready to work on are all counted out of the ledgers; ${RESTORE_THE_BOOK}`,
  status: `Nothing here can be told apart until it reads — every colour, every rejection and every closure is counted out of the ledgers; ${RESTORE_THE_BOOK}`,
  vitals: `Nothing here can be counted until it reads — every ratio, every open criterion's reason and every blocked work item's cause is counted out of the ledgers; ${RESTORE_THE_BOOK}`,
};

/** The first book that would not read, said as a refusal — or nothing at all. */
function requireBook(
  book: string,
  file: string,
  problem: string | null,
  casualty: keyof typeof CASUALTY,
): void {
  if (problem === null) {
    return;
  }
  throw conflict(
    `Shall could not read the ${book} at ${file} — ${problem} ${CASUALTY[casualty]}`,
  );
}

/**
 * The three books, or the refusal that says why they cannot be trusted. A
 * LEDGER THAT WILL NOT READ IS A REFUSAL, NOT A QUIET ANSWER: a review served
 * over an empty map would paint every approved node yellow, and a screenful of
 * yellow that is really "the ledger would not read" is a lie with a colour. It
 * is truer of the other two books than it was of the first — a rejection
 * nobody can read is a red node showing green, which is the worst lie of the
 * three — so all of them are asked and the FIRST one with a problem answers.
 *
 * The callers speak of different casualties — an approve that did not happen, a
 * review that cannot call anything green, a rejection or an acceptance that was
 * not written — so the tail sentence is theirs to choose; the book's own name
 * and its own problem sentence are carried inside every one of them, because a
 * person told "a ledger would not read" and not which one has to open three
 * files to find out.
 */
export async function requireLedgers(
  paths: LedgerPaths,
  casualty: keyof typeof CASUALTY,
): Promise<Ledgers> {
  const approvals = await readApprovalLedger(paths.ledgerFile);
  requireBook("approval ledger", paths.ledgerFile, approvals.problem, casualty);
  const rejections = await readRejectionLedger(paths.rejectionsFile);
  requireBook(
    "rejection ledger",
    paths.rejectionsFile,
    rejections.problem,
    casualty,
  );
  const acceptances = await readAcceptanceLedger(paths.acceptancesFile);
  requireBook(
    "acceptance ledger",
    paths.acceptancesFile,
    acceptances.problem,
    casualty,
  );
  return ledgersOf({
    approvals: approvals.records,
    rejections: rejections.records,
    acceptances: acceptances.records,
  });
}

/** Everything a judgement door needs of the project, read once at the top of a call. */
export interface Loaded {
  readonly spec: Awaited<ReturnType<typeof projectSpecFor>>;
  readonly graph: SpecGraph;
  readonly ledgers: Ledgers;
  readonly context: ColorContext;
  readonly statuses: ReadonlyMap<string, ReviewStatus>;
}

/**
 * The project, its three books and its graph, in the order the refusals belong
 * in: an id nobody can resolve, then a book nobody can read, then the folder.
 *
 * ONE LOAD PER CALL AND ONE INDEX OVER IT. The colour context and the statuses
 * are both built here because every door below asks both — what colour is this
 * node, and which edges does its own file draw — and two loads would be two
 * moments a save could land between. The context is handed into `reviewGraph`
 * so the index really is built once, which is the sentence above kept honest.
 */
export async function loaded(
  projectId: string,
  casualty: "approve" | "reject" | "accept",
): Promise<Loaded> {
  const spec = await projectSpecFor(projectId);
  const ledgers = await requireLedgers(spec, casualty);
  const graph = await loadGraph(spec.specDir);
  const context = colorContextOf(graph, ledgers);
  const statuses = new Map<string, ReviewStatus>();
  for (const status of reviewGraph(graph, ledgers, context).statuses) {
    statuses.set(status.id, status);
  }
  return { spec, graph, ledgers, context, statuses };
}

/**
 * Whoever pressed the button. The daemon is a single person's local process,
 * so the OS user is the honest name for them; a container without a passwd
 * entry throws, and the environment still knows.
 */
export function userName(): string {
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

/**
 * A git-held version of a node file, with the block an older Shall wrote taken
 * out — and ONLY a git-held one.
 *
 * Before the ledger, an approval was an `approval:` block inside the file, and
 * git still holds every version written that way. The reader now refuses that
 * key by name in the working tree, which is right there: the format has no
 * such block, and a file that grows one is a file to fix. But a commit is not
 * a file anybody can fix, and the block was never inside the payload a record's
 * hash is taken over — so a history read drops it and reads the rest, and the
 * version that was approved is still there to be found, restored and diffed
 * against. Nothing here touches the reader; the tolerance is exactly as wide
 * as the history that needs it.
 *
 * The block is a column-0 `approval:` key inside the frontmatter and the
 * indented lines under it — the one place Shall ever wrote it. Anything else
 * in the file is left as it stands, and the reader judges it as it would any
 * committed version.
 */
function withoutRetiredApproval(text: string): string {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  if (lines[0] !== "---") {
    return text;
  }
  const closing = lines.indexOf("---", 1);
  if (closing === -1) {
    return text;
  }
  const start = lines.findIndex(
    (line, index) => index > 0 && index < closing && line.startsWith("approval:"),
  );
  if (start === -1) {
    return text;
  }
  let end = start + 1;
  while (end < closing && /^\s/.test(lines[end] ?? "")) {
    end += 1;
  }
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n");
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
  values: SpecNodeValues;
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
    const reading = parseNodeFile(
      node.type,
      `${node.id}.md`,
      withoutRetiredApproval(text),
    );
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
        values: valuesOf(reading.node),
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
  const { specDir, ...paths } = await projectSpecFor(projectId);
  const ledgers = await requireLedgers(paths, "review");
  return reviewGraph(await loadGraph(specDir), ledgers);
}

/**
 * Why a standing rejection is not a node to approve — said here once, because
 * the single door and the queue's "approve all" both refuse with it.
 *
 * IT IS AN ORDER AND NOT A PROHIBITION. The colour chain asks about the
 * rejection before it asks about the approval, so a record written now would be
 * a green nobody would ever see: the node would stay red, the person would
 * press again, and the ledger would fill with approvals of a refused node. The
 * two ways out are both named, because they belong to two different people —
 * the reviewer withdraws, or the agent fixes and the refusal lapses by itself.
 */
export function rejectedSentence(id: string): string {
  return `${id} carries a standing rejection, so approving it would record a green nobody would ever see — a rejection is asked about before an approval, and the node would stay red. Withdraw the rejection first, or leave it to lapse when the node is fixed.`;
}

/**
 * Why this one id cannot be approved, or null — asked by BOTH approve doors,
 * the single one below and the queue's [Approve all], so that a person pressing
 * [Approve] on a row and [Approve all] on the bundle above it can never be told
 * two different things about the same node. It used to be two copies of the
 * same five gates in two files, holding that promise by hand.
 *
 * The refusals run in the order a person can act on: the file's own state, the
 * node's existence, the standing deletion proposal, the anchor, the aim rule,
 * and last the standing rejection — because "fix the file" comes before "decide
 * the proposal", both come before "nothing reaches it yet", and all of them
 * come before "somebody has already refused this".
 */
export function blockerFor(
  project: Loaded,
  id: string,
): { kind: Refusal["kind"]; message: string } | null {
  const { graph, context, statuses } = project;
  const refused = graph.refused.find((entry) => entry.id === id);
  if (refused !== undefined) {
    return {
      kind: "conflict",
      message: `${refused.file} is in a state Shall cannot read — ${refused.problems[0] ?? ""} Nothing was approved, so that edit is still there to fix.`,
    };
  }
  const node = context.nodes.get(id);
  if (node === undefined) {
    return { kind: "missing", message: `Unknown node: ${id}` };
  }
  if (node.deletionProposed !== undefined) {
    return {
      kind: "conflict",
      message: `${id} carries a deletion an agent proposed, so approving it would record a node that is asking to be removed — approve the deletion or reject it first.`,
    };
  }
  const status = statuses.get(id);
  if (status !== undefined && status.reason === "orphan") {
    return {
      kind: "invalid",
      message: `${orphanStem(id, node.type)} — so there is nothing yet to approve.`,
    };
  }
  if (status !== undefined && status.reason === "off-target") {
    // The aim rule is grammar, and it names the seam itself; a person cannot
    // approve over it any more than over a missing anchor.
    return {
      kind: "invalid",
      message: `${status.problem ?? `${id} is outside its work item's aim`} Fix that first — there is nothing yet to approve.`,
    };
  }
  if (status !== undefined && status.reason === "cyclic") {
    // A loop in the plan, and the same family again: agreeing to one node of a
    // loop is agreeing to an order that has no beginning.
    return {
      kind: "invalid",
      message: `${status.problem ?? `${id} stands on a loop`} Fix that first — there is nothing yet to approve.`,
    };
  }
  if (status !== undefined && status.reason === "premature") {
    // Work under a work item whose turn has not come — the same family of red: a
    // rule of the graph, named before any book is opened.
    return {
      kind: "invalid",
      message: `${status.problem ?? `${id} addresses a blocked work item`} Fix that first — there is nothing yet to approve.`,
    };
  }
  if (status !== undefined && status.reason === "rejected") {
    return { kind: "invalid", message: rejectedSentence(id) };
  }
  return null;
}

/**
 * A person turns a node green — the one manufacturer, and it writes one line
 * in the ledger and not a byte of the node's file.
 *
 * The gates are `blockerFor`'s, in its order, behind the project and ledger
 * refusals `loaded` makes first. The execution band is approved like any
 * other: a record is read by a person too.
 *
 * WHAT IS HASHED IS THE NODE AS LOADED, through the same two functions the
 * colour chain uses — `writtenEdgesOf` for the edges, `contentHashOf` over
 * them — so the record written here is the record `isHashMatched` will find
 * fitting a moment later: same payload, same edges, same hash.
 */
export async function approveSpecNode(input: {
  projectId: string;
  id: string;
}): Promise<ApprovalRecord> {
  const project = await loaded(input.projectId, "approve");
  const blocker = blockerFor(project, input.id);
  if (blocker !== null) {
    throw new Refusal(blocker.kind, blocker.message);
  }
  // A node `blockerFor` passed is a node it found; this narrows for the
  // compiler and is never taken.
  const node = project.context.nodes.get(input.id);
  if (node === undefined) {
    throw missing(`Unknown node: ${input.id}`);
  }
  return served(
    recordApproval(project.spec.ledgerFile, input.id, {
      approvedHash: contentHashOf(
        node,
        writtenEdgesOf(node, project.context),
        project.ledgers.hash,
      ),
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
  const { projectPath, specDir, ...paths } = await projectSpecFor(
    input.projectId,
  );
  const { approvals } = await requireLedgers(paths, "review");
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
    approvals.get(input.id),
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
  const { projectPath, specDir, ...paths } = await projectSpecFor(
    input.projectId,
  );
  const { approvals } = await requireLedgers(paths, "review");
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
    approvals.get(input.id),
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
  const reading = parseNodeFile(
    type,
    `${input.id}.md`,
    withoutRetiredApproval(text),
  );
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
      valuesOf(reading.node),
      reading.edges,
      blocksOf(reading.node),
    ),
  );
  return { file };
}

/**
 * The two paths one commit covers: the spec folder, and the FOLDER the ledgers
 * sit in rather than any ledger file itself.
 *
 * THE FOLDER HOLDS THREE BOOKS NOW — approvals, rejections and acceptances —
 * and naming it is what makes them one path instead of three. A person's
 * judgements are one act of judging whichever book they landed in, and a
 * commit that carried two of the three would be a spec travelling with half of
 * what was decided about it.
 *
 * THE FOLDER ALSO MEANS A LEDGER SOMEBODY DELETED BY HAND IS COMMITTED AS THE
 * DELETION IT IS. Naming a file would name a pathspec matching nothing in the
 * worktree the moment it is gone, and the removal would sit outside every
 * commit this button makes — the spec would travel without the record of what
 * was judged in it. Naming the folder keeps the deletion inside the commit,
 * where the history can say when the records went.
 *
 * A project nobody has judged anything in has no such folder at all, which
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
 * folder or under the ledger folder beside it, because one approval and no edit
 * is a commit worth offering. No repository and no git are ordinary states here, not
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
 * scoped to the spec folder and the ledger folder beside it, so whatever else
 * they have staged stays exactly as staged.
 *
 * They travel together because they are read together: a spec whose ledgers
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
      "The spec folder and the ledgers hold no change to commit, so nothing was committed.",
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
