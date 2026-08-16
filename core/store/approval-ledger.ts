import {
  emitApprovalLedger,
  parseApprovalLedger,
  type ApprovalLedgerReading,
  type ApprovalRecord,
} from "../serialize/index.js";
import {
  readBack,
  readLedger,
  updateLedger,
  type LedgerCodec,
} from "./ledger-door.js";

/**
 * The approval ledger's door — `.shall/ledger/approvals.yaml`, read and written.
 *
 * THE MANNERS ARE `ledger-door.ts`'s AND THE FORMAT IS `serialize`'s, so what is
 * left here is the two of them tied together and the shapes the daemon asks
 * for. Every rule this file used to state — that a read answers and a write
 * refuses, that a ledger it cannot read back is a ledger it does not write, that
 * a ledger it cannot read is a ledger it does not write OVER, that the queue is
 * per resolved path, that a record for a node that went is kept — is stated
 * once in the door and kept for all three books.
 */
const CODEC: LedgerCodec<ApprovalRecord> = {
  noun: "approval ledger",
  parse: parseApprovalLedger,
  emit: emitApprovalLedger,
};

/**
 * The ledger as it stands, or the one sentence saying why it cannot be known.
 * A file that is not there is an empty ledger and not a problem: nobody has
 * approved anything yet, and the first approval writes the first bytes.
 */
export async function readApprovalLedger(
  file: string,
): Promise<ApprovalLedgerReading> {
  return readLedger(file, CODEC);
}

/**
 * One id's latest approval, written into the ledger and handed back as the file
 * now says it.
 *
 * An id already in the book is REPLACED rather than added beside: a node has one
 * latest approval, and the map's grammar is what says so.
 */
export async function recordApproval(
  file: string,
  id: string,
  record: ApprovalRecord,
): Promise<ApprovalRecord> {
  const records = await updateLedger(file, CODEC, (current) =>
    new Map(current).set(id, record),
  );
  return readBack(records, id, CODEC);
}

/**
 * Several ids' approvals in ONE TURN, and one write.
 *
 * This is what "approve all" in the review queue is: a person judged a bundle,
 * not a list of nodes one after another, and a run of single writes would leave
 * the file half-approved if the third one hit a permission bit. One turn is one
 * set of bytes — either every id in the bundle is in the file or none of them
 * is — and it is also one fsync's worth of work instead of N.
 *
 * What comes back is only the entries asked for, read back off the file, so a
 * caller answering a request quotes the ledger rather than what it handed in.
 * An id appearing twice in `entries` is the later one, as a second write over
 * the same id would have been.
 */
export async function recordApprovals(
  file: string,
  entries: ReadonlyArray<readonly [string, ApprovalRecord]>,
): Promise<ReadonlyMap<string, ApprovalRecord>> {
  const records = await updateLedger(file, CODEC, (current) => {
    const next = new Map(current);
    for (const [id, record] of entries) {
      next.set(id, record);
    }
    return next;
  });
  const written = new Map<string, ApprovalRecord>();
  for (const [id] of entries) {
    written.set(id, readBack(records, id, CODEC));
  }
  return written;
}
