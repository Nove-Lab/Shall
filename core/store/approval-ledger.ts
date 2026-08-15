import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  emitApprovalLedger,
  parseApprovalLedger,
  type ApprovalLedger,
  type ApprovalLedgerReading,
  type ApprovalRecord,
} from "../serialize/index.js";
import { describeFailure, readText, withQueue, writeBytes } from "./files.js";
import { conflict, invalid, type StoreRefusal } from "./refusal.js";

/**
 * The approval ledger's door — `.shall/ledger/approvals.yaml`, read and written.
 *
 * READS ANSWER WITH A VALUE AND WRITES REFUSE. `readApprovalLedger` never
 * throws: a ledger nobody can read is a `problem` sentence and no records, so a
 * review can turn that into its own refusal and `shall check` can print it as a
 * row, both out of one reader. A write is the other way round, because a write
 * has somewhere to put the answer and a caller who must not carry on.
 *
 * IT NEVER WRITES A FILE IT CANNOT READ BACK — the store's own invariant, kept
 * here as `writeNodeFile` keeps it: the bytes are emitted, parsed by the very
 * reader above, and compared with what was asked for before anything reaches the
 * disk. Its other half is that a ledger that would not read is never written
 * OVER: an unreadable file is somebody's approvals in a state this door cannot
 * see, and rewriting it from the records it managed to load would be burying
 * them.
 *
 * THE WHOLE FILE IS REWRITTEN ON EVERY APPROVAL. A hand-added comment, another
 * quoting style, ids in the order somebody typed them — all of it goes, exactly
 * as a node file's frontmatter loses them on the next save. The ledger is
 * Shall's own file and its bytes are canonical, so the same approvals are always
 * the same diff.
 *
 * THE QUEUE IS PER PROCESS, so two daemons on one project can lose an update:
 * both read, both write, and the second one's bytes stand with the first one's
 * record gone. That is the same exposure the spec files have always had and it
 * has the same answer — one daemon per project.
 *
 * A record for an id no file claims is KEPT. It is the history of a node that
 * went, it is what makes a restore green again the moment the content matches,
 * and nothing here prunes: the ledger's past is git's to hold, not this door's
 * to tidy.
 *
 * NO HASH IS COMPUTED HERE. The daemon hashes the node it just loaded and hands
 * the record in, which is why `core` stays free of a crypto import and why the
 * record means what it says — it points at content, not at a moment.
 */

/**
 * The ledger as it stands, or the one sentence saying why it cannot be known.
 *
 * A file that is not there is an empty ledger and not a problem: nobody has
 * approved anything yet, and the first approval writes the first bytes. So is a
 * `ledger` that is somehow a file rather than a folder (`ENOTDIR`) — the same
 * rule the spec folder keeps, where checking first and reading second is a race
 * that answers worse than reading and taking what comes.
 */
export async function readApprovalLedger(
  file: string,
): Promise<ApprovalLedgerReading> {
  const reading = await readText(file);
  if (reading.kind === "absent") {
    return { records: new Map(), problem: null };
  }
  if (reading.kind === "unreadable") {
    return {
      records: new Map(),
      problem: `The approval ledger could not be read: ${reading.because}.`,
    };
  }
  return parseApprovalLedger(reading.text);
}

/** The emitter and the reader disagreeing is a defect, not somebody's mistake. */
function unreadable(problem: string): StoreRefusal {
  return invalid(
    `Shall emitted an approval ledger it could not read back — ${problem}`,
  );
}

/** Every id, and every field of every record, or it is not the same ledger. */
function sameLedger(written: ApprovalLedger, read: ApprovalLedger): boolean {
  if (written.size !== read.size) {
    return false;
  }
  for (const [id, record] of written) {
    const other = read.get(id);
    if (
      other === undefined ||
      other.approvedHash !== record.approvedHash ||
      other.by !== record.by ||
      other.at !== record.at
    ) {
      return false;
    }
  }
  return true;
}

/**
 * One id's latest approval, written into the ledger and handed back as the file
 * now says it.
 *
 * Read-modify-write over one file, so it takes a turn on that file's own key —
 * the resolved path, so that two spellings of one ledger are one queue. An id
 * already in the book is REPLACED rather than added beside: a node has one
 * latest approval, and the map's grammar is what says so.
 *
 * What comes back is what the bytes on disk parse to, not the record that was
 * handed in. They agree — a disagreement is refused above rather than written —
 * and a caller putting the record into a response is then quoting the file.
 */
export async function recordApproval(
  file: string,
  id: string,
  record: ApprovalRecord,
): Promise<ApprovalRecord> {
  return withQueue(path.resolve(file), async () => {
    const reading = await readApprovalLedger(file);
    if (reading.problem !== null) {
      throw conflict(
        `${reading.problem} Nothing was written over it — the ledger is Shall's own file, so restore it from git or move it aside.`,
      );
    }

    const records = new Map(reading.records);
    records.set(id, record);
    const text = emitApprovalLedger(records);

    const back = parseApprovalLedger(text);
    if (back.problem !== null) {
      throw unreadable(back.problem);
    }
    const written = back.records.get(id);
    if (written === undefined || !sameLedger(records, back.records)) {
      throw unreadable("What it read back is not what it wrote.");
    }

    try {
      // On demand, because the ledger folder is not part of a fresh project:
      // `shall init` does not make it and git does not carry an empty one, so
      // the first approval of a project is what puts it there.
      await mkdir(path.dirname(file), { recursive: true });
      await writeBytes(file, text);
    } catch (error) {
      // `conflict` and not a fault: the record is fine and it is the path that
      // is in the way — a folder where the file belongs, a permission bit, a
      // `ledger` that is a file. The panel has a slot for that sentence.
      throw conflict(
        `The approval ledger at ${file} could not be written: ${describeFailure(error)}.`,
      );
    }
    return written;
  });
}
