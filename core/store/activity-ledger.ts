import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  emitActivity,
  parseActivity,
  type ActivityReading,
  type ActivityRecord,
} from "../serialize/index.js";
import { describeFailure, readText, withQueue, writeBytes } from "./files.js";
import { RESTORE_THE_BOOK } from "./ledger-door.js";
import { conflict, invalid, type StoreRefusal } from "./refusal.js";

/**
 * The activity feed's door — `.shall/ledger/feed/YYYY-MM.yaml`, read, and
 * appended to.
 *
 * A DOOR OF ITS OWN, WITH THE THREE BOOKS' MANNERS. `ledger-door.ts` is
 * written for a map from node id to record — its codec hands back a map, its
 * mutation is over a map, its read-back looks an id up — and the feed is a
 * list. Teaching that door a second collection type would touch the three
 * frozen books to serve one file that is not a book, so the ~twenty lines of
 * protocol are copied here instead and the pieces worth sharing are shared by
 * import: the queue, the atomic write, the errno prose, the refusal vocabulary
 * and the sentence every refusal ends with. Read this file against
 * `updateLedger` and the differences are the root and the verb.
 *
 * THE VERB IS APPEND AND THERE IS NO OTHER. A record that has been written is
 * not edited, withdrawn or replaced — the feed is the record of what the agents
 * finished, and a run that finished does not un-finish. So the door is
 * write-only in the spec's sense: it answers that the line landed or why it did
 * not, and a caller wanting the feed back reads it through `readActivity`,
 * never off the append.
 *
 * THE WHOLE MONTH IS REWRITTEN ON EVERY APPEND, exactly as a book is on every
 * write, and for the same reasons: the file is Shall's own and its bytes are
 * canonical, a hand-added comment or another spelling goes on the next line
 * that lands, and a rename is how a reader never meets half a file. Appending
 * bytes to the end would be cheaper and would also be the one write in this
 * store a crash could leave half-done. The cost is one file's worth of work
 * per line, over a file that is a month long at most — which is what the
 * monthly split is for.
 *
 * A MONTH IT CANNOT READ IS NEVER WRITTEN OVER, and a feed it cannot read back
 * is never written at all — the store's two invariants, kept here as the books
 * keep them. The first matters more than it might seem for a file nothing
 * computes from: an unreadable month is still the project's record of what
 * was done in it, and rewriting it from the lines this door managed to load
 * would be burying the rest. `shall log`, the one caller, passes the refusal
 * on to the agent, because the line was the whole request.
 *
 * THE QUEUE IS PER RESOLVED PATH, so two appends to one month wait on each
 * other and two months never do — and, as with the books, the queue is per
 * process and the design's answer to two daemons is one daemon.
 */

/**
 * The month as it stands, or the one sentence saying why it cannot be known.
 *
 * A file that is not there is an empty month and not a problem: nobody has
 * logged anything yet, and the first record writes the first bytes. So is a
 * `feed` or a `ledger` that is somehow a file rather than a folder
 * (`ENOTDIR`) — the same rule the spec folder and the books keep, where
 * checking first and reading second is a race that answers worse than reading
 * and taking what comes.
 */
export async function readActivity(file: string): Promise<ActivityReading> {
  const reading = await readText(file);
  if (reading.kind === "absent") {
    return { records: [], problem: null };
  }
  if (reading.kind === "unreadable") {
    return {
      records: [],
      problem: `The activity feed could not be read: ${reading.because}.`,
    };
  }
  return parseActivity(reading.text);
}

/** The emitter and the reader disagreeing is a defect, not somebody's mistake. */
function unreadable(problem: string): StoreRefusal {
  return invalid(
    `Shall emitted an activity feed it could not read back — ${problem}`,
  );
}

/**
 * One record put at the end of its month, and the month written back.
 *
 * Which month is the CALLER'S to say — the daemon joins `activityFileFor(at)`
 * onto the project's `.shall` — because this door, like the books', takes a
 * path and knows nothing about a project. It does not check that the record's
 * instant belongs to the file it is handed; a record filed under the wrong
 * month would still read, and the daemon computes both from one instant.
 *
 * Nothing comes back. The fixpoint below has already compared every byte of
 * what was written against what reads back, so the line is on the disk exactly
 * as handed in, and a caller answering a request says so rather than quoting
 * the feed — the feed is read by the panel, not by the hand that wrote to it.
 */
export async function appendActivity(
  file: string,
  record: ActivityRecord,
): Promise<void> {
  return withQueue(path.resolve(file), async () => {
    const reading = await readActivity(file);
    if (reading.problem !== null) {
      throw conflict(
        `${reading.problem} Nothing was written over it — ${RESTORE_THE_BOOK}`,
      );
    }

    const text = emitActivity([...reading.records, record]);

    const back = parseActivity(text);
    if (back.problem !== null) {
      throw unreadable(back.problem);
    }
    if (emitActivity(back.records) !== text) {
      throw unreadable("What it read back is not what it wrote.");
    }

    try {
      // On demand, because the feed folder is not part of a fresh project:
      // `shall init` does not make it and git does not carry an empty one, so
      // the first line of a project — the first run's end — is what puts
      // `ledger/feed/` there.
      await mkdir(path.dirname(file), { recursive: true });
      await writeBytes(file, text);
    } catch (error) {
      // `conflict` and not a fault: the record is fine and it is the path that
      // is in the way — a file standing where the folder belongs, a permission
      // bit, a `ledger` that is a file. The panel has a slot for that sentence.
      throw conflict(
        `The activity feed at ${file} could not be written: ${describeFailure(error)}.`,
      );
    }
  });
}
