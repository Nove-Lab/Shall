import { compare, type ClosureSubject } from "../graph/index.js";
import {
  CLAIMANT_WORDS,
  judgeClaimantList,
  lowerFirst,
  readLedgerRoot,
  type LedgerGrammar,
} from "./ledger-common.js";
import { emitScalar } from "./scalar.js";
import { isMap, judgeIdentity } from "./yaml.js";

/**
 * The acceptance ledger — `.shall/ledger/acceptances.yaml` — as bytes, and
 * bytes back into records.
 *
 * AN ACCEPTANCE IS A CRITERION CLOSED ON NAMED EVIDENCE. A person read an
 * acceptance criterion, read the evidence claiming to satisfy it, and said: on
 * these, at these versions, this criterion is met. So the record is not a flag
 * — it is the criterion's own hash plus a map from evidence id to the hash of
 * the evidence as it stood. Closure is then arithmetic and never a stored
 * opinion: edit the criterion and the hashes stop matching; edit a piece of the
 * evidence and its hash stops matching; approve a NEW piece of evidence that
 * claims the criterion and it is not in the map at all. Any of the three
 * reopens the criterion on the next load, with nothing to sweep.
 *
 * THAT IS WHY THE EVIDENCE IS A MAP AND NOT A LIST. A list of ids would say
 * which files were looked at and not which VERSIONS, and a criterion that stayed
 * closed while its evidence was rewritten under it is exactly the lie this whole
 * design exists to make impossible.
 *
 * AN ACCEPTANCE NAMES AT LEAST ONE PIECE OF EVIDENCE. A criterion closed on
 * nothing is a criterion nobody checked, so an empty map is refused here rather
 * than tolerated — the daemon's own door guarantees one already, which means
 * only a hand-edited file can reach this refusal.
 *
 * ONE RECORD PER CRITERION, THE LATEST ONLY, like the other two books — the
 * map's own grammar says so, and closing again replaces the value. Read
 * leniently, written canonically, refused for the whole file in one sentence:
 * that part is `ledger-common.ts`, shared with them.
 */

/** Where the ledger lives, under a project's `.shall` folder. */
export const ACCEPTANCES_FILE = "ledger/acceptances.yaml";

/**
 * One person's closing of one criterion — or of one work item, which is the same act
 * over a different list.
 *
 * ONE SHAPE WITH A TAG, AND TWO SPELLINGS ON DISK. In memory a record is the
 * subject's hash and the map of what closed it, whatever the subject was; on
 * disk the two keys are named for what they hold — `acHash`/`evidence` for a
 * criterion, `taskHash`/`reports` for a work item — because a person reading the
 * file should see which of the two they are looking at without decoding an id
 * prefix. `KEYS` below is the only place those four names live, and a record
 * carrying both pairs is refused rather than guessed at.
 */
export interface AcceptanceRecord {
  /** Which thing was closed — the tag the disk keys are chosen from. */
  readonly kind: ClosureSubject;
  /** `sha256:<hex>` over the subject's approval payload at the moment of closing. */
  readonly subjectHash: string;
  /**
   * Claimant id to the `sha256:<hex>` of that node when it was accepted. A map
   * and not a list, because closure is checked against the versions and not
   * against the names.
   */
  readonly claimants: ReadonlyMap<string, string>;
  /** The username of whoever closed it. */
  readonly by: string;
  /** ISO 8601, the daemon's clock at the moment of the write. */
  readonly at: string;
}

/** The whole ledger: criterion id to its latest record. */
export type AcceptanceLedger = ReadonlyMap<string, AcceptanceRecord>;

/**
 * What one ledger amounted to. `problem` is null exactly when the file read;
 * a file with a problem contributes NO records — half a ledger is a worse
 * answer than none, for the same reason half a node is.
 */
export interface AcceptanceLedgerReading {
  readonly records: AcceptanceLedger;
  readonly problem: string | null;
}

/**
 * The subject-hash key each kind of record is written under — this book's own
 * half of the pair. The claimant map's key and nouns are `CLAIMANT_WORDS` in
 * `ledger-common.ts`, shared with the rejection ledger, which writes the same
 * list under the same name. The order the emitter writes a record in is the
 * order it is read here: the subject's hash, its list, `by`, `at`.
 */
const SUBJECT_KEY: Readonly<Record<ClosureSubject, string>> = {
  criterion: "acHash",
  // `taskHash` is the key the book has carried since 2026-08-17 and is frozen
  // bytes (the frozen-bytes invariant): the tag renamed to `workItem` on
  // 2026-08-23, the key did not, and no book on disk moved.
  workItem: "taskHash",
};

/** How many keys a record has, whichever kind it is. */
const RECORD_KEY_COUNT = 4;

/**
 * Refused wholesale rather than per-key: it is one rule about one shape, and
 * the nested map is part of the shape rather than a second rule about it.
 */
const RECORD_SHAPE =
  "Every record in the acceptance ledger is a map of exactly by, at and one closed thing — acHash with an evidence map for a criterion, or taskHash with a reports map for a work item — the map holding at least one entry, and never both";

/** The three words the shared root reader makes this book's sentences out of. */
const GRAMMAR: LedgerGrammar = {
  noun: "acceptance ledger",
  recordNoun: "acceptance record",
  latest: "an acceptance has one latest record",
};

/**
 * The ledger as Shall writes it: ids in byte order, each record's four keys in
 * one order, the evidence ids in byte order under them, every key and value
 * through `emitScalar` — the KEYS too, the nested ones as much as the outer
 * ones, because an id that reads as a number (`1234`) or a word YAML knows
 * (`true`) would come back as something other than the string it is, and the
 * fixpoint would not hold. An empty ledger is no bytes at all, which reads back
 * as no records.
 *
 * A record whose evidence map is empty is written as an `evidence:` with
 * nothing under it, which is NOT valid and is not meant to be: the emitter
 * writes what it was handed and the reader refuses it, so the store's own
 * read-back check catches an empty acceptance as the defect it is instead of
 * this function silently inventing a shape.
 */
export function emitAcceptanceLedger(records: AcceptanceLedger): string {
  const ids = [...records.keys()].sort(compare);
  const lines: string[] = [];
  for (const id of ids) {
    const record = records.get(id);
    if (record === undefined) {
      continue;
    }
    lines.push(`${emitScalar(id)}:`);
    lines.push(`  ${SUBJECT_KEY[record.kind]}: ${emitScalar(record.subjectHash)}`);
    lines.push(`  ${CLAIMANT_WORDS[record.kind].key}:`);
    for (const claimantId of [...record.claimants.keys()].sort(compare)) {
      const hash = record.claimants.get(claimantId);
      if (hash === undefined) {
        continue;
      }
      lines.push(`    ${emitScalar(claimantId)}: ${emitScalar(hash)}`);
    }
    lines.push(`  by: ${emitScalar(record.by)}`);
    lines.push(`  at: ${emitScalar(record.at)}`);
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

function refused(problem: string): AcceptanceLedgerReading {
  return { records: new Map(), problem };
}

/**
 * The record's shape, or null: exactly four keys — `by`, `at`, one subject hash
 * and its matching map — and the map is a map of text to text with something in
 * it.
 *
 * THE KIND IS READ OFF THE KEYS AND NEVER OFF THE ID. An id's prefix is a
 * suggestion (`ids.ts` says so in as many words), so a record that says
 * `taskHash` is a work item's record wherever it is filed, and whether that record
 * then STANDS over the node at that id is `core/arith/closure.ts`'s question,
 * asked with the subject in hand.
 *
 * A RECORD CARRYING BOTH PAIRS, OR ONE OF EACH, IS REFUSED. Guessing which half
 * a hand-edit meant would close something on a list nobody chose.
 *
 * Written here rather than reached for from `readStringMap` because that helper
 * asks for a tuple of strings and this record is not one — the nested map is
 * what makes an acceptance an acceptance.
 */
function readRecordShape(value: unknown): {
  readonly kind: ClosureSubject;
  readonly subjectHash: string;
  readonly claimants: ReadonlyMap<string, string>;
  readonly by: string;
  readonly at: string;
} | null {
  if (!isMap(value) || Object.keys(value).length !== RECORD_KEY_COUNT) {
    return null;
  }
  const kinds = (Object.keys(SUBJECT_KEY) as ClosureSubject[]).filter(
    (kind) => value[SUBJECT_KEY[kind]] !== undefined,
  );
  const [kind] = kinds;
  if (kind === undefined || kinds.length !== 1) {
    return null;
  }
  const subjectHash = value[SUBJECT_KEY[kind]];
  const by = value["by"];
  const at = value["at"];
  const claimants = value[CLAIMANT_WORDS[kind].key];
  if (
    typeof subjectHash !== "string" ||
    typeof by !== "string" ||
    typeof at !== "string" ||
    !isMap(claimants)
  ) {
    return null;
  }
  const entries = Object.entries(claimants);
  if (entries.length === 0) {
    return null;
  }
  const held = new Map<string, string>();
  for (const [claimantId, hash] of entries) {
    if (typeof hash !== "string") {
      return null;
    }
    held.set(claimantId, hash);
  }
  return { kind, subjectHash, claimants: held, by, at };
}

/**
 * The bytes of a ledger, read.
 *
 * The claimant map's own defence — the twin-key check over the settled bytes,
 * the ids judged as node ids — is `judgeClaimantList` in `ledger-common.ts`,
 * shared word for word with the rejection ledger's left-open records. The
 * hashes beside the ids are judged here as identities, with the rest of the
 * record.
 */
export function parseAcceptanceLedger(text: string): AcceptanceLedgerReading {
  const root = readLedgerRoot(text, GRAMMAR);
  if (root.problem !== null) {
    return refused(root.problem);
  }

  const records = new Map<string, AcceptanceRecord>();
  for (const [id, value] of root.entries) {
    const held = readRecordShape(value);
    if (held === null) {
      return refused(`${RECORD_SHAPE} — the record under ${id} is not.`);
    }
    const words = CLAIMANT_WORDS[held.kind];
    const listProblem = judgeClaimantList(
      root.source,
      id,
      GRAMMAR,
      words,
      `an acceptance names one hash for ${words.each}`,
      held.claimants.keys(),
    );
    if (listProblem !== null) {
      return refused(listProblem);
    }

    const subjectHash = judgeIdentity("An accepted hash", held.subjectHash);
    const by = judgeIdentity("An acceptor", held.by);
    const at = judgeIdentity("An acceptance instant", held.at);
    const problems: string[] = [
      ...subjectHash.problems,
      ...by.problems,
      ...at.problems,
    ];
    const claimants = new Map<string, string>();
    for (const [claimantId, hash] of held.claimants) {
      const judgedHash = judgeIdentity(words.hash, hash);
      problems.push(...judgedHash.problems);
      claimants.set(claimantId, judgedHash.value);
    }

    const [problem] = problems;
    if (problem !== undefined) {
      return refused(`Under ${id}, ${lowerFirst(problem)}`);
    }
    records.set(id, {
      kind: held.kind,
      subjectHash: subjectHash.value,
      claimants,
      by: by.value,
      at: at.value,
    });
  }
  return { records, problem: null };
}
