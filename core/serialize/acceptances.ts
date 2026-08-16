import { judgeNodeId } from "../graph/index.js";
import {
  compare,
  lowerFirst,
  readLedgerRoot,
  type LedgerGrammar,
} from "./ledger-common.js";
import { emitScalar } from "./scalar.js";
import { isMap, judgeIdentity, mapKeysAt } from "./yaml.js";

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

/** One person's closing of one acceptance criterion, as the ledger remembers it. */
export interface AcceptanceRecord {
  /** `sha256:<hex>` over the criterion's approval payload at the moment of closing. */
  readonly acHash: string;
  /**
   * Evidence id to the `sha256:<hex>` of that evidence node when it was
   * accepted. A map and not a list, because closure is checked against the
   * versions and not against the names.
   */
  readonly evidence: ReadonlyMap<string, string>;
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

/** The record's keys, in the order the emitter writes them. */
const RECORD_KEYS = ["acHash", "evidence", "by", "at"] as const;

/**
 * Refused wholesale rather than per-key: it is one rule about one shape, and
 * the nested map is part of the shape rather than a second rule about it.
 */
const RECORD_SHAPE =
  "Every record in the acceptance ledger is a map of exactly acHash, evidence, by and at — evidence a map from evidence id to hash with at least one entry";

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
    lines.push(`  acHash: ${emitScalar(record.acHash)}`);
    lines.push("  evidence:");
    for (const evidenceId of [...record.evidence.keys()].sort(compare)) {
      const hash = record.evidence.get(evidenceId);
      if (hash === undefined) {
        continue;
      }
      lines.push(`    ${emitScalar(evidenceId)}: ${emitScalar(hash)}`);
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
 * The record's shape, or null: exactly the four keys, three of them text, and
 * `evidence` a map of text to text with something in it.
 *
 * Written here rather than reached for from `readStringMap` because that helper
 * asks for a tuple of strings and this record is not one — the nested map is
 * what makes an acceptance an acceptance.
 */
function readRecordShape(value: unknown): {
  readonly acHash: string;
  readonly evidence: ReadonlyMap<string, string>;
  readonly by: string;
  readonly at: string;
} | null {
  if (!isMap(value) || Object.keys(value).length !== RECORD_KEYS.length) {
    return null;
  }
  const acHash = value["acHash"];
  const by = value["by"];
  const at = value["at"];
  const evidence = value["evidence"];
  if (
    typeof acHash !== "string" ||
    typeof by !== "string" ||
    typeof at !== "string" ||
    !isMap(evidence)
  ) {
    return null;
  }
  const entries = Object.entries(evidence);
  if (entries.length === 0) {
    return null;
  }
  const held = new Map<string, string>();
  for (const [evidenceId, hash] of entries) {
    if (typeof hash !== "string") {
      return null;
    }
    held.set(evidenceId, hash);
  }
  return { acHash, evidence: held, by, at };
}

/**
 * The bytes of a ledger, read.
 *
 * THE NESTED MAP IS DEFENDED THE WAY THE ROOT IS. `toJS()` collapses a key
 * written once bare and once quoted into one property, at any depth, so the
 * evidence map is asked about the document's own keys through `mapKeysAt` —
 * over the very bytes the root reader settled, so both questions are about one
 * source. Two spellings of one evidence id would be two hashes for one node,
 * and the last one written would silently win.
 *
 * The evidence ids are judged as node ids, because that is what they are, and
 * the hashes as identities beside them.
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

    const seen = new Set<string>();
    for (const key of mapKeysAt(root.source, [id, "evidence"]) ?? []) {
      if (key !== "" && seen.has(key)) {
        return refused(
          `${key} is written twice under ${id} in the acceptance ledger, once bare and once quoted — YAML reads two keys and Shall one id, and an acceptance names one hash for each piece of evidence.`,
        );
      }
      seen.add(key);
    }

    // The ids first and the values after, which is the order the root reader
    // keeps and the order a person can act on: an evidence entry that names no
    // node is a worse thing to be told second.
    for (const evidenceId of held.evidence.keys()) {
      if (evidenceId === "") {
        return refused(`Under ${id}, an evidence entry names no node id.`);
      }
      const judged = judgeNodeId(evidenceId);
      if (judged !== null) {
        return refused(
          `Under ${id}, ${JSON.stringify(evidenceId)} is not a node id. ${judged}`,
        );
      }
    }

    const acHash = judgeIdentity("An accepted hash", held.acHash);
    const by = judgeIdentity("An acceptor", held.by);
    const at = judgeIdentity("An acceptance instant", held.at);
    const problems: string[] = [
      ...acHash.problems,
      ...by.problems,
      ...at.problems,
    ];
    const evidence = new Map<string, string>();
    for (const [evidenceId, hash] of held.evidence) {
      const judgedHash = judgeIdentity("An evidence hash", hash);
      problems.push(...judgedHash.problems);
      evidence.set(evidenceId, judgedHash.value);
    }

    const [problem] = problems;
    if (problem !== undefined) {
      return refused(`Under ${id}, ${lowerFirst(problem)}`);
    }
    records.set(id, {
      acHash: acHash.value,
      evidence,
      by: by.value,
      at: at.value,
    });
  }
  return { records, problem: null };
}
