import type { SpecNode } from "../graph/index.js";
import type { AcceptanceRecord, RejectionRecord } from "../serialize/index.js";
import {
  colorOf,
  contentHashOf,
  livingSubject,
  writtenEdgesOf,
  type ColorContext,
} from "./color.js";

/**
 * Whether an acceptance criterion is SATISFIED — closed on the evidence that
 * claims it — or still open, and whether anybody has yet said which.
 *
 * COLOUR AND CLOSURE ARE TWO AXES AND NEITHER IMPLIES THE OTHER. A colour says
 * whether a person has READ this node and agreed that it says the right thing;
 * a closure says whether the thing it demands has been DONE and shown. A
 * criterion can be green and open — everybody agrees on what has to be true, and
 * nothing yet proves it is. Registration and satisfaction, kept apart, so that
 * neither one is quietly read off the other; nothing on this axis looks at a
 * colour, and nothing on the colour axis looks at this.
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
 * living node whose file draws a `CLAIMS` line at the criterion is on the list,
 * approved or not, and a record stands or lapses on the list alone — an agent's
 * new claim reopens a closed criterion the moment it is written. But nobody is
 * ASKED to close or leave open until every claimant is green: a claim nobody
 * has read is not yet a claim a person can judge the criterion on, so the
 * criterion simply stays open, off the queue, and the toggle stays off, until
 * the last claimant is approved. `closureAsks` and `unapprovedClaimantsOf`
 * below are that gate.
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

/** The one relation an evidence node claims a criterion by — canon edge #24. */
const CLAIMS = "CLAIMS";

/**
 * Every living node whose own file draws a `CLAIMS` line at this criterion, in
 * id order.
 *
 * READ OFF THE INCOMING EDGES, because since edge #24 was turned around the
 * claim is the evidence's line and never the criterion's: a claimant announces
 * itself, and the criterion's file does not move when one turns up. The far end
 * has to be living for the same reason an anchor's does — a line from a file
 * that would not parse is a line nobody can read.
 */
export function claimantsOf(
  acId: string,
  context: ColorContext,
): SpecNode[] {
  const claimants: SpecNode[] = [];
  for (const edge of context.incoming.get(acId) ?? []) {
    if (edge.type !== CLAIMS || !context.living.has(edge.fromId)) {
      continue;
    }
    const node = context.nodes.get(edge.fromId);
    if (node !== undefined) {
      claimants.push(node);
    }
  }
  claimants.sort((a, b) => (a.id === b.id ? 0 : a.id < b.id ? -1 : 1));
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
  acId: string,
  context: ColorContext,
): ReadonlyMap<string, string> {
  const hashes = new Map<string, string>();
  for (const claimant of claimantsOf(acId, context)) {
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
 * Whether a record still closes the criterion it was written for — the two
 * clauses of this module's doc comment.
 *
 * The record is passed in rather than looked up, so that a caller holding one —
 * the daemon's accept door, checking what it is about to replace — can ask about
 * it without putting it in a ledger first.
 */
export function isAcceptanceStanding(
  record: AcceptanceRecord,
  ac: SpecNode,
  context: ColorContext,
): boolean {
  return (
    record.acHash === hashNow(ac, context) &&
    sameList(record.evidence, claimantHashesOf(ac.id, context))
  );
}

/**
 * Whether a record in the rejection ledger is a criterion LEFT OPEN — one that
 * carries an evidence map — and still describes the criterion and the list.
 * A rejection record without a map is the refusal of the node's own content,
 * which is the colour chain's business and not this module's; it answers
 * false here whatever its hash.
 */
export function isLeftOpenStanding(
  record: RejectionRecord,
  ac: SpecNode,
  context: ColorContext,
): boolean {
  return (
    record.evidence !== undefined &&
    record.rejectedHash === hashNow(ac, context) &&
    sameList(record.evidence, claimantHashesOf(ac.id, context))
  );
}

/**
 * The person's standing word on a criterion's list, if there is one.
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
  ac: SpecNode,
  context: ColorContext,
): ClosureVerdict | null {
  const accepted = context.ledgers.acceptances.get(ac.id);
  const refused = context.ledgers.rejections.get(ac.id);
  const closed =
    accepted !== undefined && isAcceptanceStanding(accepted, ac, context)
      ? { kind: "closed" as const, by: accepted.by, at: accepted.at }
      : null;
  const leftOpen =
    refused !== undefined && isLeftOpenStanding(refused, ac, context)
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
 * The criterion's mark: closed when an acceptance stands for it, open
 * otherwise.
 *
 * OPEN IS THE ANSWER FOR EVERYTHING ELSE — no record at all, a lapsed one, a
 * criterion left open with a reason, a criterion nobody has looked at. There is
 * no third word on the mark, because there is no third state of the world:
 * either this criterion is met on the evidence attached to it, or it is not.
 * Whether somebody has SAID it is not is `closureVerdictOf`'s answer, and the
 * queue's question.
 */
export function closureOf(
  ac: SpecNode,
  context: ColorContext,
): "open" | "closed" {
  return closureVerdictOf(ac, context)?.kind === "closed" ? "closed" : "open";
}

/**
 * The claimants nobody has approved yet — anything but green — in id order.
 * Empty is what lets a criterion be asked about, closed or left open.
 */
export function unapprovedClaimantsOf(
  acId: string,
  context: ColorContext,
): SpecNode[] {
  return claimantsOf(acId, context).filter(
    (claimant) => colorOf(livingSubject(claimant), context)?.color !== "green",
  );
}

/**
 * Whether the queue still has to ask a person about this criterion: something
 * claims it, every claimant is approved, and nobody has said "closed" or "left
 * open" about THIS list — the exit from the queue being exactly one of those
 * two words. A criterion with an unapproved claimant is not asked: it is open,
 * and it waits, and the approval of that claimant is what brings it here.
 */
export function closureAsks(ac: SpecNode, context: ColorContext): boolean {
  const claimants = claimantsOf(ac.id, context);
  return (
    claimants.length > 0 &&
    unapprovedClaimantsOf(ac.id, context).length === 0 &&
    closureVerdictOf(ac, context) === null
  );
}
