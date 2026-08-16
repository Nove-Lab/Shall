import { mkdir } from "node:fs/promises";
import path from "node:path";
import { describeFailure, readText, withQueue, writeBytes } from "./files.js";
import { conflict, invalid, type StoreRefusal } from "./refusal.js";

/**
 * The door all three ledgers are read and written through — `approvals.yaml`,
 * `rejections.yaml`, `acceptances.yaml` under `.shall/ledger`.
 *
 * ONE DOOR AND THREE BOOKS, because the five rules below are about the FILE and
 * not about the records inside it. What a record is belongs to `core/serialize`;
 * what a codec hands this module is the two functions that turn one into the
 * other and the noun a refusal calls the book by.
 *
 * READS ANSWER WITH A VALUE AND WRITES REFUSE. `readLedger` never throws: a
 * ledger nobody can read is a `problem` sentence and no records, so a review can
 * turn that into its own refusal and `shall check` can print it as a row, both
 * out of one reader. A write is the other way round, because a write has
 * somewhere to put the answer and a caller who must not carry on.
 *
 * IT NEVER WRITES A FILE IT CANNOT READ BACK — the store's own invariant, kept
 * here as `writeNodeFile` keeps it: the bytes are emitted, parsed by the very
 * reader above, and compared with what was asked for before anything reaches the
 * disk. THE COMPARISON IS THE TEXT AND NOT THE RECORDS: what is emitted from
 * what was read back must be the same bytes. That is stronger than looking one
 * id up — it catches a record the reader dropped, a field it changed and a key
 * the emitter wrote twice — and it is the only form that survives a DELETION,
 * where the id the caller was working on is deliberately not there afterwards.
 * Its other half is that a ledger that would not read is never written OVER: an
 * unreadable file is somebody's judgements in a state this door cannot see, and
 * rewriting it from the records it managed to load would be burying them.
 *
 * THE WHOLE FILE IS REWRITTEN ON EVERY WRITE. A hand-added comment, another
 * quoting style, ids in the order somebody typed them — all of it goes, exactly
 * as a node file's frontmatter loses them on the next save. A ledger is Shall's
 * own file and its bytes are canonical, so the same records are always the same
 * diff. A book emptied down to its last key becomes a file of NO BYTES rather
 * than a file that is gone: an empty ledger and an absent one read the same, and
 * leaving the file there keeps git's history of it in one place.
 *
 * THE QUEUE IS PER PROCESS, so two daemons on one project can lose an update:
 * both read, both write, and the second one's bytes stand with the first one's
 * record gone. That is the same exposure the spec files have always had and it
 * has the same answer — one daemon per project. The key is the RESOLVED PATH, so
 * two spellings of one ledger are one queue and three different ledgers never
 * wait on each other.
 *
 * A RECORD FOR AN ID NO FILE CLAIMS IS KEPT. It is the history of a node that
 * went, it is what makes a restore green again the moment the content matches,
 * and nothing here prunes: a ledger's past is git's to hold, not this door's to
 * tidy.
 *
 * NO HASH IS COMPUTED HERE. The daemon hashes the node it just loaded and hands
 * the record in, which is why `core` stays free of a crypto import and why a
 * record means what it says — it points at content, not at a moment.
 */

/**
 * One book, as this door needs to know it: what to call it in a sentence, and
 * the two pure functions that are its format.
 *
 * The parse is typed loosely on purpose — every ledger's own reading type
 * satisfies it — so a book can name its reading whatever its callers want to
 * import.
 */
export interface LedgerCodec<R> {
  /** `approval ledger`, `rejection ledger`, `acceptance ledger`. */
  readonly noun: string;
  parse(text: string): {
    readonly records: ReadonlyMap<string, R>;
    readonly problem: string | null;
  };
  emit(records: ReadonlyMap<string, R>): string;
}

/** What one ledger amounted to: the records, or the sentence saying why not. */
export interface LedgerReading<R> {
  readonly records: ReadonlyMap<string, R>;
  readonly problem: string | null;
}

/**
 * "approval ledger" → "an approval ledger". The three nouns are English words
 * whose first letter tells the truth about their first sound, so the vowel test
 * is exact for all three; a fourth book named after a word like `hour` would
 * need the article spelled out in the codec instead of guessed here.
 */
function withArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}

/** The emitter and the reader disagreeing is a defect, not somebody's mistake. */
function unreadable(codec: LedgerCodec<unknown>, problem: string): StoreRefusal {
  return invalid(
    `Shall emitted ${withArticle(codec.noun)} it could not read back — ${problem}`,
  );
}

/**
 * The ledger as it stands, or the one sentence saying why it cannot be known.
 *
 * A file that is not there is an empty ledger and not a problem: nobody has
 * written into this book yet, and the first record writes the first bytes. So is
 * a `ledger` that is somehow a file rather than a folder (`ENOTDIR`) — the same
 * rule the spec folder keeps, where checking first and reading second is a race
 * that answers worse than reading and taking what comes.
 */
export async function readLedger<R>(
  file: string,
  codec: LedgerCodec<R>,
): Promise<LedgerReading<R>> {
  const reading = await readText(file);
  if (reading.kind === "absent") {
    return { records: new Map(), problem: null };
  }
  if (reading.kind === "unreadable") {
    return {
      records: new Map(),
      problem: `The ${codec.noun} could not be read: ${reading.because}.`,
    };
  }
  return codec.parse(reading.text);
}

/**
 * A ledger read, changed and written back, handed to the caller as the file now
 * says it.
 *
 * `mutate` is SYNCHRONOUS AND PURE, which is what keeps this safe: it runs
 * inside the turn, between the read and the write, so it sees the records
 * nobody can have changed underneath it and it cannot await something that
 * would reach back in on this same key. It may throw a refusal of its own — a
 * withdrawal with nothing to withdraw is the one that does — and that refusal
 * leaves the file untouched, which is exactly right, because the turn had not
 * written anything yet.
 *
 * What comes back is what the bytes on disk parse to, not the records that were
 * handed in. They agree — a disagreement is refused above rather than written —
 * and a caller putting a record into a response is then quoting the file.
 */
export async function updateLedger<R>(
  file: string,
  codec: LedgerCodec<R>,
  mutate: (records: ReadonlyMap<string, R>) => ReadonlyMap<string, R>,
): Promise<ReadonlyMap<string, R>> {
  return withQueue(path.resolve(file), async () => {
    const reading = await readLedger(file, codec);
    if (reading.problem !== null) {
      throw conflict(
        `${reading.problem} Nothing was written over it — the ledger is Shall's own file, so restore it from git or move it aside.`,
      );
    }

    const next = mutate(reading.records);
    const text = codec.emit(next);

    const back = codec.parse(text);
    if (back.problem !== null) {
      throw unreadable(codec, back.problem);
    }
    if (codec.emit(back.records) !== text) {
      throw unreadable(codec, "What it read back is not what it wrote.");
    }

    try {
      // On demand, because the ledger folder is not part of a fresh project:
      // `shall init` does not make it and git does not carry an empty one, so
      // the first judgement of a project is what puts it there.
      await mkdir(path.dirname(file), { recursive: true });
      await writeBytes(file, text);
    } catch (error) {
      // `conflict` and not a fault: the record is fine and it is the path that
      // is in the way — a folder where the file belongs, a permission bit, a
      // `ledger` that is a file. The panel has a slot for that sentence.
      throw conflict(
        `The ${codec.noun} at ${file} could not be written: ${describeFailure(error)}.`,
      );
    }
    return back.records;
  });
}

/**
 * One id's record out of what the file now says, for the doors that write one
 * record and answer with it.
 *
 * The absence is unreachable — the text fixpoint above has already compared
 * every byte of what was written against what reads back, so an id that went in
 * is an id that is there — and it is still said out loud rather than asserted
 * away, in the same words the fixpoint would have used, because a `!` here
 * would be a claim about another function that nothing checks.
 */
export function readBack<R>(
  records: ReadonlyMap<string, R>,
  id: string,
  codec: LedgerCodec<R>,
): R {
  const record = records.get(id);
  if (record === undefined) {
    throw unreadable(codec, "What it read back is not what it wrote.");
  }
  return record;
}
