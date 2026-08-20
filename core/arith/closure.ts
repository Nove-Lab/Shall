import {
  closureKindOf,
  compare,
  type ClosureKind,
  type SpecNode,
} from "../graph/index.js";
import type { AcceptanceRecord, RejectionRecord } from "../serialize/index.js";
import {
  colorOf,
  contentHashOf,
  livingSubject,
  writtenEdgesOf,
  type ColorContext,
} from "./color.js";

/**
 * Whether a thing a person can CLOSE is closed — a criterion satisfied by the
 * evidence claiming it, a task done by the reports that claim to verify it —
 * or still open, and whether anybody has yet said which.
 *
 * TWO SUBJECTS, ONE ARITHMETIC. `core/graph/closure-kinds.ts` says which types
 * are closed and by which relation; everything below reads that table off the
 * subject in hand, so the criterion and the task are not two code paths that
 * could drift but one that is asked a different question about its list.
 *
 * COLOUR AND CLOSURE ARE TWO AXES AND NEITHER IMPLIES THE OTHER. A colour says
 * whether a person has READ this node and agreed that it says the right thing;
 * a closure says whether the thing it demands has been DONE and shown. A
 * criterion can be green and open — everybody agrees on what has to be true, and
 * nothing yet proves it is. Registration and satisfaction, kept apart, so that
 * neither one is quietly read off the other: no colour is ever read AS a clause
 * of standing, and nothing on the colour axis reads a closure. Where a colour
 * IS consulted — the gate on asking, two paragraphs down — it gates who gets
 * asked, never what a record means.
 *
 * NOTHING IS STORED HERE EITHER. Two ledgers hold what a person DECIDED about
 * a criterion and the list of evidence claiming it: the acceptance ledger holds
 * "met, on these" and the rejection ledger — under the criterion's own id, with
 * an `evidence` map — holds "not met on these, and here is why". The answers
 * "closed", "left open" and "nobody has said" are recomputed from those records
 * against the graph on every read. There is no `closed: true` in any file to go
 * stale, and no sweep to run when somebody edits a criterion at midnight.
 *
 * A RECORD STANDS ON TWO CLAUSES, both about versions rather than names:
 *
 *  1. The criterion is what was judged. The record's hash is taken over the
 *     criterion's own bytes, so rewording what has to be true asks the question
 *     again — the judgement was about the old sentence.
 *  2. The list is what was judged. The record maps every claimant's id to the
 *     hash of that claimant at the moment, and the record stands only while
 *     THE SAME ids claim the criterion at THE SAME hashes — a claimant added,
 *     a claimant withdrawn, or a claimant rewritten underneath is a different
 *     list, and whoever judged the old one never saw it. A list of ids alone
 *     would say which files were looked at; the map says which VERSIONS.
 *
 * COLOUR IS NOT A CLAUSE OF STANDING, BUT IT IS THE GATE ON ASKING. Every
 * living node whose file draws the claiming line at the subject is on the list,
 * approved or not, and a record stands or lapses on the list alone — an agent's
 * new claim reopens a closed criterion the moment it is written. But nobody is
 * ASKED to close or leave open until BOTH sides are green:
 *
 *  · EVERY CLAIMANT, because a claim nobody has read is not yet a claim a
 *    person can judge the subject on; and
 *  · THE SUBJECT ITSELF, because "met" is a statement about words somebody has
 *    agreed to. A task whose scope nobody has read yet cannot be called done —
 *    done against WHAT? — and a criterion whose demand is still being edited
 *    cannot be shown to be satisfied. Closing over an unapproved subject
 *    produced exactly the state that made this clause necessary: a yellow node
 *    wearing a green Done.
 *
 * Until then the subject simply stays open, off the queue, and the toggle stays
 * off. `closureAsks`, `unapprovedClaimantsOf` and the colour of the subject
 * below are that gate. NOTHING ABOUT STANDING CHANGES: a record made while
 * everything was green keeps standing, and editing the subject moves its hash
 * and reopens it, so the state this gate forbids cannot be reached the long way
 * round either.
 *
 * ONE BOOK OR THE OTHER, NEVER BOTH. The doors that write these records remove
 * the criterion from the other ledger in the same act, so a standing acceptance
 * and a standing left-open record for one criterion is a state this design does
 * not produce. Should a half-finished write ever leave both, the later `at`
 * wins here rather than the reader throwing up its hands.
 *
 * PURE AND BROWSER-SAFE like the rest of `core/arith`: a record, a node, an
 * indexed graph and the injected hash, and the same four always give the same
 * answer.
 */

/**
 * WHICH CLOSURE THE NODE AT THIS ID IS THE SUBJECT OF, or null when nothing
 * living is there or the type has no closure at all.
 *
 * The relation that makes the list is read here rather than named as a
 * constant, because the pairing lives in `core/graph/closure-kinds.ts` —
 * `CLAIMS` into a criterion from Evidence, `CLAIMS` into a task from a
 * TaskCompletionReport.
 */
function kindAt(id: string, context: ColorContext): ClosureKind | null {
  const node = context.nodes.get(id);
  return node === undefined ? null : closureKindOf(node.type);
}

/**
 * Every living node whose own file draws the claiming line at this subject, in
 * id order — the Evidence that CLAIMS a criterion, the TaskCompletionReport that
 * CLAIMS a task.
 *
 * READ OFF THE INCOMING EDGES, because both claims are the CLAIMANT's line and
 * never the subject's — a claimant announces itself, and the subject's file
 * does not move when one turns up. The
 * far end has to be living for the same reason an anchor's does — a line from a
 * file that would not parse is a line nobody can read.
 *
 * NOTHING FILTERS THE CLAIMANT'S TYPE, and that is not an omission: the loader
 * refuses a file whose relation the canon does not allow, so only an Evidence
 * can draw `CLAIMS` at a criterion and only a TaskCompletionReport at a task. A
 * filter here would be a second copy of the grammar.
 */
export function claimantsOf(
  subjectId: string,
  context: ColorContext,
): SpecNode[] {
  const kind = kindAt(subjectId, context);
  if (kind === null) {
    return [];
  }
  const claimants: SpecNode[] = [];
  for (const edge of context.incoming.get(subjectId) ?? []) {
    if (edge.type !== kind.claim || !context.living.has(edge.fromId)) {
      continue;
    }
    const node = context.nodes.get(edge.fromId);
    if (node !== undefined) {
      claimants.push(node);
    }
  }
  claimants.sort((a, b) => compare(a.id, b.id));
  return claimants;
}

/** The hash this node's bytes amount to right now, under the injected function. */
function hashNow(node: SpecNode, context: ColorContext): string {
  return contentHashOf(
    node,
    writtenEdgesOf(node, context),
    context.ledgers.hash,
  );
}

/**
 * The list as it stands: every claimant's id to its hash now — the map a door
 * writes into a record, and the map a standing record has to equal.
 */
export function claimantHashesOf(
  subjectId: string,
  context: ColorContext,
): ReadonlyMap<string, string> {
  const hashes = new Map<string, string>();
  for (const claimant of claimantsOf(subjectId, context)) {
    hashes.set(claimant.id, hashNow(claimant, context));
  }
  return hashes;
}

/**
 * Whether a judgement over a list still describes the list — clause 2 of the
 * doc comment: the same ids, at the same hashes, nothing more and nothing less.
 */
function sameList(
  recorded: ReadonlyMap<string, string>,
  now: ReadonlyMap<string, string>,
): boolean {
  if (recorded.size !== now.size) {
    return false;
  }
  for (const [id, hash] of recorded) {
    if (now.get(id) !== hash) {
      return false;
    }
  }
  return true;
}

/**
 * The subject's side of every standing check, computed once: which kind of
 * closure it is the subject of, its own hash as it stands, and its list as it
 * stands. A verdict asks about two records over one subject, and each record
 * asks all three questions — so the hashing, which is the expensive third of
 * this module, happens here and not per clause.
 */
interface SubjectNow {
  readonly kind: ClosureKind["kind"] | undefined;
  readonly hash: string;
  readonly claimants: ReadonlyMap<string, string>;
}

function subjectNowOf(subject: SpecNode, context: ColorContext): SubjectNow {
  return {
    kind: closureKindOf(subject.type)?.kind,
    hash: hashNow(subject, context),
    claimants: claimantHashesOf(subject.id, context),
  };
}

// THREE CLAUSES, AND THE FIRST IS THE KIND. A record says which thing it
// closed; a task's record filed under a criterion's id closes nothing, so a
// hand-edit that moves a record cannot close the wrong thing by matching a
// hash it was never taken over.
function acceptanceStands(record: AcceptanceRecord, now: SubjectNow): boolean {
  return (
    record.kind === now.kind &&
    record.subjectHash === now.hash &&
    sameList(record.claimants, now.claimants)
  );
}

function leftOpenStands(record: RejectionRecord, now: SubjectNow): boolean {
  const leftOpen = record.leftOpen;
  return (
    leftOpen !== undefined &&
    leftOpen.kind === now.kind &&
    record.rejectedHash === now.hash &&
    sameList(leftOpen.claimants, now.claimants)
  );
}

/**
 * Whether a record still closes the subject it was written for — the two
 * clauses of this module's doc comment, behind the kind clause above.
 *
 * The record is passed in rather than looked up, so that a caller holding one —
 * the daemon's accept door, checking what it is about to replace — can ask about
 * it without putting it in a ledger first.
 */
export function isAcceptanceStanding(
  record: AcceptanceRecord,
  subject: SpecNode,
  context: ColorContext,
): boolean {
  return acceptanceStands(record, subjectNowOf(subject, context));
}

/**
 * Whether a record in the rejection ledger is a subject LEFT OPEN — one that
 * carries a claimant map — and still describes that subject and that list.
 * A rejection record without a map is the refusal of the node's own content,
 * which is the colour chain's business and not this module's; it answers
 * false here whatever its hash. The kind is a clause here for the reason it is
 * one above.
 */
export function isLeftOpenStanding(
  record: RejectionRecord,
  subject: SpecNode,
  context: ColorContext,
): boolean {
  return leftOpenStands(record, subjectNowOf(subject, context));
}

/**
 * The person's standing word on a subject's list, if there is one.
 *
 * `closed` when the acceptance stands, `left-open` when the left-open record
 * stands, `null` when neither does — no record, a lapsed one, or a list nobody
 * has looked at. Should both stand at once (a half-finished write, which the
 * doors do not produce) the later `at` wins.
 */
export type ClosureVerdict =
  | { readonly kind: "closed"; readonly by: string; readonly at: string }
  | {
      readonly kind: "left-open";
      readonly by: string;
      readonly at: string;
      readonly rationale: string;
    };

export function closureVerdictOf(
  subject: SpecNode,
  context: ColorContext,
): ClosureVerdict | null {
  const accepted = context.ledgers.acceptances.get(subject.id);
  const refused = context.ledgers.rejections.get(subject.id);
  // NO RECORD, NO HASHING. Standing is an equality against the subject's and
  // every claimant's hash, and most subjects on most reads have no record in
  // either book — asked here first, so a whole-project pass pays for hashes
  // only where a judgement exists to check them against.
  if (accepted === undefined && refused?.leftOpen === undefined) {
    return null;
  }
  const now = subjectNowOf(subject, context);
  const closed =
    accepted !== undefined && acceptanceStands(accepted, now)
      ? { kind: "closed" as const, by: accepted.by, at: accepted.at }
      : null;
  const leftOpen =
    refused !== undefined && leftOpenStands(refused, now)
      ? {
          kind: "left-open" as const,
          by: refused.by,
          at: refused.at,
          rationale: refused.rationale,
        }
      : null;
  if (closed !== null && leftOpen !== null) {
    return leftOpen.at > closed.at ? leftOpen : closed;
  }
  return closed ?? leftOpen;
}

/**
 * The subject's mark: closed when an acceptance stands for it, open otherwise —
 * a criterion met on its evidence, a task done on the reports that claim it.
 *
 * OPEN IS THE ANSWER FOR EVERYTHING ELSE — no record at all, a lapsed one, a
 * subject left open with a reason, a subject nobody has looked at. There is no
 * third word on the mark, because there is no third state of the world: either
 * the thing is shown to be met, or it is not. Whether somebody has SAID it is
 * not is `closureVerdictOf`'s answer, and the queue's question.
 */
export function closureOf(
  subject: SpecNode,
  context: ColorContext,
): "open" | "closed" {
  return closureVerdictOf(subject, context)?.kind === "closed"
    ? "closed"
    : "open";
}

/** The rule under `unapprovedClaimantsOf`, over a list the caller already has. */
function unapprovedIn(
  claimants: readonly SpecNode[],
  context: ColorContext,
): SpecNode[] {
  return claimants.filter(
    (claimant) => colorOf(livingSubject(claimant), context)?.color !== "green",
  );
}

/**
 * The claimants nobody has approved yet — anything but green — in id order.
 * Empty is what lets a subject be asked about, closed or left open.
 */
export function unapprovedClaimantsOf(
  subjectId: string,
  context: ColorContext,
): SpecNode[] {
  return unapprovedIn(claimantsOf(subjectId, context), context);
}

/**
 * Whether the subject's own words are settled — green, which is to say a person
 * read them and nothing has moved since.
 *
 * IT IS THE COLOUR CHAIN'S ANSWER AND NOT A SECOND OPINION. `colorOf` decides
 * what green means; this only asks. "You cannot call a node done before it is
 * agreed" is STATED here once — `closureAsks` below is its caller — and the
 * daemon's closure doors enforce the same clause by reading the same colour off
 * the review they have already run, which is this answer memoised, not a second
 * one.
 */
export function isSubjectAgreed(
  subject: SpecNode,
  context: ColorContext,
): boolean {
  return colorOf(livingSubject(subject), context)?.color === "green";
}

/**
 * Whether the queue still has to ask a person about this subject: the subject
 * itself is agreed, something claims it, every claimant is approved, and nobody
 * has said "closed" or "left open" about THIS list — the exit from the queue
 * being exactly one of those two words, and the clauses asked in that order,
 * each next one only when the one before held.
 *
 * A SUBJECT THAT IS NOT GREEN IS NOT ASKED ABOUT AT ALL, whichever reason it
 * wears: unapproved, edited since, refused, unanchored. It is open, and it
 * waits, and approving it is what brings it here — the same shape of gate the
 * claimants have, pointed at the other side of the question.
 */
export function closureAsks(subject: SpecNode, context: ColorContext): boolean {
  if (!isSubjectAgreed(subject, context)) {
    return false;
  }
  const claimants = claimantsOf(subject.id, context);
  return (
    claimants.length > 0 &&
    unapprovedIn(claimants, context).length === 0 &&
    closureVerdictOf(subject, context) === null
  );
}
