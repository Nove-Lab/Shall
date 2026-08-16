import {
  emitRejectionLedger,
  parseRejectionLedger,
  type RejectionLedgerReading,
  type RejectionRecord,
} from "../serialize/index.js";
import {
  readBack,
  readLedger,
  updateLedger,
  type LedgerCodec,
} from "./ledger-door.js";
import { invalid } from "./refusal.js";

/**
 * The rejection ledger's door — `.shall/ledger/rejections.yaml`, read and
 * written.
 *
 * THE MANNERS ARE `ledger-door.ts`'s AND THE FORMAT IS `serialize`'s. What is
 * particular to this book is the third door: a rejection can be TAKEN BACK, and
 * taking it back removes the key rather than writing a record that says it was
 * undone. A withdrawn rejection is one that should not have been recorded, and
 * what the file said before is git's to remember — the same answer this codebase
 * gives every time it is asked to keep a tombstone.
 *
 * NOTHING HERE JUDGES A NODE. The daemon decides that a node may be rejected and
 * hands in the hash it just computed; this door writes what it is given, exactly
 * as the approval door does, so that the two books cannot disagree about what a
 * write is.
 */
const CODEC: LedgerCodec<RejectionRecord> = {
  noun: "rejection ledger",
  parse: parseRejectionLedger,
  emit: emitRejectionLedger,
};

/**
 * The ledger as it stands, or the one sentence saying why it cannot be known.
 * A file that is not there is an empty ledger and not a problem: nobody has
 * rejected anything yet, and the first rejection writes the first bytes.
 */
export async function readRejectionLedger(
  file: string,
): Promise<RejectionLedgerReading> {
  return readLedger(file, CODEC);
}

/**
 * One id's latest rejection, written into the ledger and handed back as the file
 * now says it.
 *
 * An id already in the book is REPLACED rather than added beside: a node has one
 * latest hearing, and the map's grammar is what says so. Rejecting a node that
 * was fixed and rejected again is one record with the new hash and the new
 * rationale, and the one before it is in the history of the file.
 */
export async function recordRejection(
  file: string,
  id: string,
  record: RejectionRecord,
): Promise<RejectionRecord> {
  const records = await updateLedger(file, CODEC, (current) =>
    new Map(current).set(id, record),
  );
  return readBack(records, id, CODEC);
}

/**
 * One id's rejection taken back — the key removed, and the file rewritten
 * without it.
 *
 * THE ABSENCE IS CHECKED INSIDE THE TURN and not before it, because a check
 * before the turn is a check against a file another write may have changed by
 * the time this one reads it. A withdrawal of a rejection nobody recorded is
 * `invalid` and not `missing`: the node is there and the ledger is there, and
 * what is not there is a fact this call assumed — which is the caller's mistake
 * to hear about, usually a second click on a button whose first click already
 * worked.
 *
 * Emptying the book down to its last key writes NO BYTES rather than removing
 * the file, which is what an empty ledger is everywhere else in this design.
 */
export async function withdrawRejection(
  file: string,
  id: string,
): Promise<void> {
  await updateLedger(file, CODEC, (current) => {
    if (!current.has(id)) {
      throw invalid(`${id} carries no rejection, so there is nothing to withdraw.`);
    }
    const next = new Map(current);
    next.delete(id);
    return next;
  });
}
