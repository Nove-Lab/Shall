import {
  claimantHashesOf,
  colorContextOf,
  unapprovedClaimantsOf,
  contentHashOf,
  reviewBundles,
  reviewGraph,
  writtenEdgesOf,
  type ColorContext,
  type Ledgers,
  type ReviewQueue,
  type ReviewStatus,
} from "@shall/core/arith";
import {
  closureKindOf,
  judgeBody,
  orphanStem,
  type ClosureKind,
  type ClosureSubject,
  type SpecNode,
} from "@shall/core/graph";
import type { ApprovalRecord, RejectionRecord } from "@shall/core/serialize";
import {
  loadGraph,
  recordAcceptance,
  recordApprovals,
  recordRejection,
  withdrawAcceptance,
  withdrawRejection,
  type SpecGraph,
} from "@shall/core/store";
import { Refusal, conflict, invalid, missing } from "./errors.js";
import { projectSpecFor, served } from "./spec-graph.js";
import { rejectedSentence, requireLedgers, userName } from "./spec-review.js";

/**
 * The review queue: what a person still has to decide, cut into bundles, and
 * the three doors that write down what they decided.
 *
 * THE QUEUE IS COMPUTED ON EVERY ASK AND STORED NOWHERE. A bundle is not a row
 * in a table somebody has to keep current — it is an arrangement of the graph
 * and the three books at the moment of the question, so an agent's save, a hand
 * edit or a `git checkout` moves the queue with nobody told and no sweep to
 * run. The only thing that is ever written is the RESULT of a judgement: one
 * record in one of `approvals.yaml`, `rejections.yaml` or `acceptances.yaml`.
 *
 * THREE BOOKS AND ONE PERSON. Approve says the wording is right, reject says it
 * is not and what should be there instead, accept says a criterion is met on
 * evidence somebody named. All three are the person's own act — no procedure
 * here is reachable from an agent, whose contract is file-only by architecture,
 * and every one of them refuses outright rather than half-writing when a book
 * will not read: a queue served over an unreadable rejection ledger would show
 * a refused node as work waiting to be approved, which is the one lie this
 * whole design exists to make impossible.
 *
 * ALL OR NOTHING WHEREVER A DOOR TAKES A LIST. `approveSpecNodes` is one
 * person's judgement of one bundle and `acceptSpecClosure` is one person's
 * judgement of one criterion; a half-written answer to either would leave the
 * file saying something nobody decided. The guards therefore run over the whole
 * list first and the write happens once, at the end, or not at all.
 *
 * NOTHING HERE HASHES INSIDE A WRITE TURN, exactly as the approve door does
 * not. Every hash is taken over the graph this call has just loaded, so a save
 * that lands in between leaves a record naming bytes that have moved — and the
 * node reads yellow "changed", or the criterion reads open, until a person
 * judges again. A record names content and not a moment, so the cost of the
 * race is one honest colour and never a false one.
 */

/** Everything a judgement door needs of the project, read once at the top of a call. */
interface Loaded {
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
 * moments a save could land between.
 */
async function loaded(
  projectId: string,
  casualty: "approve" | "reject" | "accept",
): Promise<Loaded> {
  const spec = await projectSpecFor(projectId);
  const ledgers = await requireLedgers(spec, casualty);
  const graph = await loadGraph(spec.specDir);
  const statuses = new Map<string, ReviewStatus>();
  for (const status of reviewGraph(graph, ledgers).statuses) {
    statuses.set(status.id, status);
  }
  return {
    spec,
    graph,
    ledgers,
    context: colorContextOf(graph, ledgers),
    statuses,
  };
}

/**
 * The queue itself — every bundle a person still has to decide, in the order
 * the arithmetic puts them.
 *
 * The shape is `core/arith`'s and travels to the panel unaltered; the daemon
 * adds nothing to it, because a queue the daemon shaped would be a second
 * opinion about what is waiting. It does not go through `loaded` above for the
 * same reason: `reviewBundles` colours the graph itself, and a review computed
 * out here would be the same pass run twice for an answer nothing reads.
 */
export async function reviewQueue(projectId: string): Promise<ReviewQueue> {
  const spec = await projectSpecFor(projectId);
  const ledgers = await requireLedgers(spec, "review");
  return reviewBundles(await loadGraph(spec.specDir), ledgers);
}

/* ------------------------------------------------------------------ *
 * Reject
 * ------------------------------------------------------------------ */

/** The sentence for a node the graph holds by nothing, said the way approve says it. */
function orphanSentence(node: SpecNode): string {
  return `${orphanStem(node.id, node.type)} — fix that first; a rejection is a judgement on a node the graph holds.`;
}

/**
 * A person refuses a node, in writing — the second of the three books, and the
 * signal that turns the queue's work back over to whoever writes the files.
 *
 * IT WRITES THE HASH OF WHAT IT REFUSED, and that one field is the whole of why
 * nothing has to be swept afterwards: the moment an agent edits the node the
 * hashes stop agreeing, the rejection stops standing, and the node is yellow
 * again with nobody told. The record is not deleted when it lapses — it is the
 * history of a hearing, and a card is entitled to show it as one.
 *
 * YELLOW AND GREEN ARE BOTH REFUSABLE. Rejecting an approved node is a person
 * changing their mind, and the colour chain asks about the rejection first, so
 * the later word is the one on the screen; withdrawing it puts the green back
 * untouched, because the approval was never written over. A node the loader
 * REFUSED is another matter — there is no content to hash and no judgement to
 * make about a file that will not read.
 *
 * THE RATIONALE IS REQUIRED, and it is the only prose in any ledger. A refusal
 * with no reason is a red light an agent cannot act on; the queue's whole point
 * is that the person says what should be there instead.
 */
export async function rejectSpecNode(input: {
  projectId: string;
  id: string;
  rationale: string;
}): Promise<RejectionRecord> {
  const { spec, graph, context, statuses } = await loaded(
    input.projectId,
    "reject",
  );

  const refused = graph.refused.find((entry) => entry.id === input.id);
  if (refused !== undefined) {
    throw conflict(
      `${refused.file} is in a state Shall cannot read — ${refused.problems[0] ?? ""} Nothing was rejected, so that edit is still there to fix.`,
    );
  }
  const node = context.nodes.get(input.id);
  if (node === undefined) {
    throw missing(`Unknown node: ${input.id}`);
  }
  // `missing` and `malformed` cannot come back for a node that loaded — the
  // review says so itself — so `orphan` and the aim rule's `off-target` are
  // the grammar reds a living node can be caught by, and each has its sentence.
  const status = statuses.get(input.id);
  if (status !== undefined && status.reason === "orphan") {
    throw invalid(orphanSentence(node));
  }
  if (status !== undefined && status.reason === "off-target") {
    throw invalid(
      `${status.problem ?? `${input.id} is outside its task's aim`} Fix that first; a rejection is a judgement on a node the graph holds together.`,
    );
  }

  const judged = judgeBody(input.rationale);
  const first = judged.problems[0];
  if (first !== undefined) {
    throw invalid(first);
  }
  if (judged.value === "") {
    throw invalid(
      "A rationale is required — what is wrong, and what should it be instead.",
    );
  }

  return served(
    recordRejection(spec.rejectionsFile, input.id, {
      rejectedHash: contentHashOf(
        node,
        writtenEdgesOf(node, context),
        context.ledgers.hash,
      ),
      by: userName(),
      at: new Date().toISOString(),
      rationale: judged.value,
    }),
  );
}

/**
 * A rejection taken back — the key removed, and the node left exactly the
 * colour the rest of the arithmetic makes it.
 *
 * THE GRAPH IS NOT LOADED AND NOT CONSULTED. Withdrawing is a statement about
 * the BOOK and not about the node: a rejection recorded against a file somebody
 * has since deleted is still a rejection somebody may want to take back, and
 * making the withdrawal wait for a node to exist would strand the record with
 * no door that reaches it. Whether there is anything to withdraw is the store's
 * to answer, inside its own write turn, where the answer cannot go stale
 * between the looking and the writing.
 */
export async function withdrawSpecRejection(input: {
  projectId: string;
  id: string;
}): Promise<{ ok: true }> {
  const spec = await projectSpecFor(input.projectId);
  await requireLedgers(spec, "withdraw");
  await served(withdrawRejection(spec.rejectionsFile, input.id));
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Approve a bundle
 * ------------------------------------------------------------------ */

/**
 * Why this one id cannot be approved, or null — the same five questions the
 * single approve door asks, in the same order, so that a person pressing
 * [Approve] on a row and [Approve all] on the bundle above it can never be told
 * two different things about the same node.
 */
function blockerFor(
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
    return {
      kind: "invalid",
      message: `${status.problem ?? `${id} is outside its task's aim`} Fix that first — there is nothing yet to approve.`,
    };
  }
  if (status !== undefined && status.reason === "rejected") {
    return { kind: "invalid", message: rejectedSentence(id) };
  }
  return null;
}

/**
 * A whole bundle approved in one turn — the queue's [Approve all], and the only
 * door that writes more than one record.
 *
 * ALL OR NOTHING, AND THE REFUSAL NAMES EVERY BLOCKER. A person pressed one
 * button about one bundle; approving the four ids that were fine and refusing
 * the fifth would leave them looking at a list they can no longer read as a
 * unit, and they would have to press again to find the next thing wrong. So
 * every id is judged first, every blocking sentence is collected, and one
 * refusal carries all of them — the KIND is the first one's, because a status
 * code has to be a single answer and the first sentence is the one the person
 * reads first.
 *
 * ONE INSTANT FOR ALL OF THEM. The timestamp is taken once and written into
 * every record, because this was one act of judging: records that disagreed by
 * milliseconds would invite a reader to sort a bundle into an order nobody
 * decided.
 *
 * WHAT COMES BACK IS READ OFF THE FILE, in the order the caller asked, so the
 * panel quotes the ledger rather than what it sent.
 */
export async function approveSpecNodes(input: {
  projectId: string;
  ids: readonly string[];
}): Promise<ApprovalRecord[]> {
  // A duplicate is one node judged once — the same id twice in a payload is a
  // click on a row that was already selected, not a second decision.
  const ids = [...new Set(input.ids)];
  if (ids.length === 0) {
    throw invalid("Nothing to approve.");
  }
  const project = await loaded(input.projectId, "approve");

  const blockers: { kind: Refusal["kind"]; message: string }[] = [];
  const targets: SpecNode[] = [];
  for (const id of ids) {
    const blocker = blockerFor(project, id);
    if (blocker !== null) {
      blockers.push(blocker);
      continue;
    }
    // A node `blockerFor` passed is a node it found, so this is never taken —
    // it is how the compiler is told what the guard already settled.
    const node = project.context.nodes.get(id);
    if (node !== undefined) {
      targets.push(node);
    }
  }
  const first = blockers[0];
  if (first !== undefined) {
    throw new Refusal(
      first.kind,
      `${blockers.map((blocker) => blocker.message).join(" ")} Nothing was approved.`,
    );
  }

  const at = new Date().toISOString();
  const by = userName();
  const written = await served(
    recordApprovals(
      project.spec.ledgerFile,
      targets.map((node) => [
        node.id,
        {
          approvedHash: contentHashOf(
            node,
            writtenEdgesOf(node, project.context),
            project.ledgers.hash,
          ),
          by,
          at,
        },
      ]),
    ),
  );
  const records: ApprovalRecord[] = [];
  for (const id of ids) {
    const record = written.get(id);
    if (record !== undefined) {
      records.push(record);
    }
  }
  return records;
}

/* ------------------------------------------------------------------ *
 * Close a criterion, or leave it open
 * ------------------------------------------------------------------ */

/** A closing as it crosses the wire: a list, because a Map is not JSON. */
export interface AcceptedClosure {
  /** Which thing was closed — the same tag the ledger's record carries. */
  kind: ClosureSubject;
  subjectHash: string;
  claimants: { id: string; hash: string }[];
  by: string;
  at: string;
}

/**
 * THE WORDS EACH SUBJECT'S REFUSALS ARE SAID IN, written out per kind rather
 * than assembled from fragments.
 *
 * A refusal is a sentence a person reads at the moment they are stopped, and
 * the two subjects are stopped for the same reasons in different words: one is
 * about evidence shown against a criterion, the other about work done against a
 * task. Two whole sentences side by side are a thing a reader can check against
 * the screen; a sentence built out of nouns picked from a table is not.
 */
const WORDS: Readonly<
  Record<
    ClosureSubject,
    {
      readonly nothingClaims: (id: string) => string;
      readonly unread: (id: string, unread: readonly string[]) => string;
      readonly wordingRefused: (id: string) => string;
      readonly unapproved: (id: string) => string;
      readonly rationaleRequired: string;
    }
  >
> = {
  criterion: {
    nothingClaims: (id) =>
      `Nothing claims ${id} yet — a criterion is closed, or left open, over the evidence attached to it, and there is none. An Evidence node draws a CLAIMS relation at the criterion in its own file.`,
    unread: (id, unread) => {
      const one = unread.length === 1;
      return `${unread.join(", ")} ${one ? "claims" : "claim"} ${id} and ${one ? "is" : "are"} not approved yet — a criterion is closed, or left open, only over evidence a person has read. Approve ${one ? "it" : "them"} first (or reject ${one ? "it" : "them"} and have ${one ? "it" : "them"} fixed), and the criterion comes back to the queue.`;
    },
    wordingRefused: (id) =>
      `${id} carries a standing rejection of its own wording, and a criterion is closed or left open only once its wording stands — withdraw that rejection first, or leave it to lapse when the criterion is fixed.`,
    unapproved: (id) =>
      `${id} is not approved yet — a criterion is closed, or left open, only once a person has agreed to what it demands, and there is nothing settled for the evidence to be met against until then. Approve it, and the question comes back with it.`,
    rationaleRequired:
      "A rationale is required — what the evidence does not show, and what would.",
  },
  task: {
    nothingClaims: (id) =>
      `Nothing addresses ${id} yet — a task is closed, or left open, over the work attached to it, and there is none. A WorkLog draws an ADDRESSES relation at the task in its own file.`,
    unread: (id, unread) => {
      const one = unread.length === 1;
      return `${unread.join(", ")} ${one ? "addresses" : "address"} ${id} and ${one ? "is" : "are"} not approved yet — a task is closed, or left open, only over work a person has read. Approve ${one ? "it" : "them"} first (or reject ${one ? "it" : "them"} and have ${one ? "it" : "them"} fixed), and the task comes back to the queue.`;
    },
    wordingRefused: (id) =>
      `${id} carries a standing rejection of its own wording, and a task is closed or left open only once its wording stands — withdraw that rejection first, or leave it to lapse when the task is fixed.`,
    unapproved: (id) =>
      `${id} is not approved yet — a task is closed, or left open, only once a person has agreed to what it asks for, and until then there is nothing settled for the work to be done against. Approve it, and the question comes back with it.`,
    rationaleRequired:
      "A rationale is required — what the work does not show, and what would.",
  },
};

/**
 * The subject a closure door was pointed at, its kind, and everything claiming
 * it — or the refusal that says why there is nothing to judge. Both doors below
 * ask the same questions in the same order: does the id name a node, is it a
 * thing that can be closed, does anything claim it, has every claimant been
 * approved. The subject's OWN colour is not asked about — a person may close or
 * leave open a task whose wording is still yellow; the mark says "done on what
 * is attached", not "agreed" — but the claimants' colours are: work nobody has
 * read is not yet work a person can judge the task on, so the door waits,
 * exactly as the queue does, until the last claimant is green.
 */
function subjectFor(
  loadedProject: Loaded,
  id: string,
): { subject: SpecNode; kind: ClosureKind; list: ReadonlyMap<string, string> } {
  const subject = loadedProject.context.nodes.get(id);
  if (subject === undefined) {
    throw missing(`Unknown node: ${id}`);
  }
  const kind = closureKindOf(subject.type);
  if (kind === null) {
    throw invalid(
      `${id} is a ${subject.type}, and only an AcceptanceCriterion or an ImplementationTask is a thing that can be closed or left open — evidence is shown against a criterion, work against a task, and against nothing else.`,
    );
  }
  const words = WORDS[kind.kind];
  // THE SUBJECT'S OWN COLOUR IS THE FIRST GATE, and the two sentences it can
  // refuse with are in the order a person needs them: a standing rejection says
  // what to do about itself, and everything else that is not green says the
  // same thing in one word — approve it first.
  //
  // IT USED NOT TO BE ASKED AT ALL, and the gap showed up on a screen: a green,
  // closed task was edited, went yellow, and could still be closed — leaving a
  // yellow node wearing a green Done. "Met" is a statement about words somebody
  // has agreed to, so there has to be an agreement before there can be one.
  const status = loadedProject.statuses.get(id);
  if (status?.reason === "rejected") {
    throw invalid(words.wordingRefused(id));
  }
  if (status?.color !== "green") {
    throw invalid(words.unapproved(id));
  }
  const list = claimantHashesOf(id, loadedProject.context);
  if (list.size === 0) {
    throw invalid(words.nothingClaims(id));
  }
  const unread = unapprovedClaimantsOf(id, loadedProject.context).map(
    (claimant) => claimant.id,
  );
  if (unread.length > 0) {
    throw invalid(words.unread(id, unread));
  }
  return { subject, kind, list };
}

/**
 * The record's word on the wire — the same shape for a closing and, minus the
 * rationale, the list a leaving-open was judged on.
 */
function projected(record: {
  kind: ClosureSubject;
  subjectHash: string;
  claimants: ReadonlyMap<string, string>;
  by: string;
  at: string;
}): AcceptedClosure {
  return {
    kind: record.kind,
    subjectHash: record.subjectHash,
    // A Map is not JSON, so the record's own shape stops at core's edge and
    // what leaves here is a list in id order — the order a panel would have had
    // to impose anyway, imposed once, here.
    claimants: [...record.claimants]
      .map(([id, hash]) => ({ id, hash }))
      .sort((a, b) => (a.id === b.id ? 0 : a.id < b.id ? -1 : 1)),
    by: record.by,
    at: record.at,
  };
}

/**
 * A person closes an acceptance criterion over the evidence attached to it —
 * the third book, and the only judgement in Shall that is about a list of
 * nodes at once.
 *
 * IT RECORDS VERSIONS AND NOT NAMES. The criterion's hash and every claimant's
 * hash go into the record, so rewording what has to be true reopens it, and a
 * claimant added, withdrawn or rewritten underneath a closed criterion reopens
 * it too. A list of ids would only have said which files somebody looked at.
 *
 * THE LIST IS WHAT IS ATTACHED, NOT WHAT WAS TICKED. There is no choosing here:
 * closing says "met, on all of this", and the panel's toggle and the card's
 * button both send only the criterion. A person who thinks one piece of the
 * evidence does not carry the claim has the other door, `leaveSpecOpen`, and
 * the rationale it asks for is where that thought goes — the agent reads it,
 * changes the list, and the question comes back.
 *
 * ONE BOOK OR THE OTHER. A criterion that was left open over an earlier list
 * has that word removed from the rejection ledger in the same act, so nobody
 * ever finds a criterion both closed and left open. The order is remove first
 * and write second: a failure between the two leaves the criterion with no
 * word at all, which is the queue asking again — the safe side of the mistake.
 * A rejection of the criterion's OWN words (a record without an evidence map)
 * is the one thing on the colour axis this door looks at, and it refuses
 * rather than closing over words a person has said are wrong.
 */
export async function acceptSpecClosure(input: {
  projectId: string;
  id: string;
}): Promise<AcceptedClosure> {
  const loadedProject = await loaded(input.projectId, "accept");
  const { spec, context, statuses } = loadedProject;
  const { subject, kind, list } = subjectFor(loadedProject, input.id);

  const standingWord = context.ledgers.rejections.get(input.id);
  if (standingWord !== undefined && standingWord.leftOpen !== undefined) {
    await served(withdrawRejection(spec.rejectionsFile, input.id));
  }
  const record = await served(
    recordAcceptance(spec.acceptancesFile, input.id, {
      kind: kind.kind,
      subjectHash: contentHashOf(
        subject,
        writtenEdgesOf(subject, context),
        context.ledgers.hash,
      ),
      claimants: new Map(list),
      by: userName(),
      at: new Date().toISOString(),
    }),
  );
  return projected(record);
}

/**
 * A person leaves an acceptance criterion open, with a reason — the other exit
 * from the review queue, and the one that hands the agent something to do.
 *
 * IT IS NOT A REJECTION OF THE CRITERION. The record goes into the rejection
 * ledger under the criterion's id, but it carries the evidence map, and that
 * map is what tells it apart from a refusal of the criterion's wording: the
 * colour chain does not read it, the criterion stays whatever colour its own
 * books make it, and only the closure axis — the mark, the queue — hears the
 * word. It stands exactly as long as an acceptance would: same criterion, same
 * list, same hashes. Change either and the question comes back.
 *
 * ONE BOOK OR THE OTHER, mirrored from the accept door: a standing acceptance
 * is removed first, then the word is written. A standing REJECTION OF THE
 * WORDING is refused rather than overwritten, as it is at the accept door.
 */
export async function leaveSpecOpen(input: {
  projectId: string;
  id: string;
  rationale: string;
}): Promise<AcceptedClosure & { rationale: string }> {
  const loadedProject = await loaded(input.projectId, "reject");
  const { spec, context, statuses } = loadedProject;
  const { subject, kind, list } = subjectFor(loadedProject, input.id);
  const rationale = judgeBody(input.rationale);
  const [problem] = rationale.problems;
  if (problem !== undefined) {
    throw invalid(problem);
  }
  if (rationale.value === "") {
    throw invalid(WORDS[kind.kind].rationaleRequired);
  }

  if (context.ledgers.acceptances.has(input.id)) {
    await served(withdrawAcceptance(spec.acceptancesFile, input.id));
  }
  const record = await served(
    recordRejection(spec.rejectionsFile, input.id, {
      rejectedHash: contentHashOf(
        subject,
        writtenEdgesOf(subject, context),
        context.ledgers.hash,
      ),
      leftOpen: { kind: kind.kind, claimants: new Map(list) },
      by: userName(),
      at: new Date().toISOString(),
      rationale: rationale.value,
    }),
  );
  return {
    ...projected({
      kind: kind.kind,
      subjectHash: record.rejectedHash,
      claimants: record.leftOpen?.claimants ?? new Map(),
      by: record.by,
      at: record.at,
    }),
    rationale: record.rationale,
  };
}
