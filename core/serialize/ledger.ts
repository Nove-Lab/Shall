import {
  compare,
  lowerFirst,
  readLedgerRoot,
  type LedgerGrammar,
} from "./ledger-common.js";
import { emitScalar } from "./scalar.js";
import { judgeIdentity, readStringMap } from "./yaml.js";

/**
 * The approval ledger — `.shall/ledger/approvals.yaml` — as bytes, and bytes
 * back into records.
 *
 * ONE FILE, ONE RECORD PER NODE, THE LATEST ONLY. The ledger is a YAML map from
 * node id to `{approvedHash, by, at}`: the hash of the node's content a person
 * approved, who they were, and when. A node has one latest approval, and the
 * map's own grammar says so — a key appears once, so "the latest" is not a rule
 * a reader has to enforce but a shape the file cannot escape. Re-approving is
 * replacing the value; the record before it is git's to remember, because the
 * ledger is committed beside the spec it judges.
 *
 * IT IS THE ONLY PLACE AN APPROVAL LIVES. A node file says what a node is and
 * nothing about whether anybody has read it — that claim moved out of the
 * frontmatter and into this file on purpose, so that the spec folder is pure
 * authorship and a colour is the arithmetic of two files: what the spec says
 * (its content hash now) against what the ledger remembers (the hash that was
 * approved). Nothing here is signed. Agents are asked not to write this file by
 * a settings rule that is another module's business; the daemon is the only
 * hand that does.
 *
 * IT IS PURE RECORD, SO IT IS YAML AND NOT MARKDOWN. There is no prose to carry
 * — a markdown file with a frontmatter and no body would be a fence around
 * nothing.
 *
 * READ LENIENTLY, WRITTEN CANONICALLY, like a node file: any spelling the one
 * YAML contract accepts is read, and the next write puts it back in byte order
 * with one quoting rule. What is refused is refused for the WHOLE FILE in one
 * sentence — a fact with two homes, an id that is not one, a record that is not
 * the exact tuple — because a ledger half-read is a screen half-green, and the
 * store's own rule is that a file it cannot read back is a file it does not
 * write over.
 *
 * ITS ROOT IS READ BY `ledger-common.ts`, WHICH THIS FILE IS THE ORIGIN OF. The
 * BOM, the line endings, the map check and the twin-key check were written here
 * first and moved out when the second and third books arrived; they are shared
 * by import and the words are handed back in as `GRAMMAR` below. THE BYTES AND
 * THE SENTENCES OF THIS BOOK ARE FROZEN — the golden tests spell them out
 * character by character, because these files are in other people's git history
 * and a byte that moves is a diff on a day nobody approved anything.
 */

/** Where the ledger lives, under a project's `.shall` folder. */
export const LEDGER_FILE = "ledger/approvals.yaml";

/** One person's approval of one node, as the ledger remembers it. */
export interface ApprovalRecord {
  /** `sha256:<hex>` over the node's approval payload at the moment of approval. */
  readonly approvedHash: string;
  /** The username of whoever pressed approve. */
  readonly by: string;
  /** ISO 8601, the daemon's clock at the moment of the write. */
  readonly at: string;
}

/** The whole ledger: node id to its latest record. */
export type ApprovalLedger = ReadonlyMap<string, ApprovalRecord>;

/**
 * What one ledger amounted to. `problem` is null exactly when the file read;
 * a file with a problem contributes NO records — half a ledger is a worse
 * answer than none, for the same reason half a node is.
 */
export interface ApprovalLedgerReading {
  readonly records: ApprovalLedger;
  readonly problem: string | null;
}

/** The record's keys, in the order the emitter writes them. */
const RECORD_KEYS = ["approvedHash", "by", "at"] as const;

/** Refused wholesale rather than per-key: it is one rule about one shape. */
const RECORD_SHAPE =
  "Every record in the approval ledger is a map of exactly approvedHash, by and at, each of them text";

/** The three words the shared root reader makes this book's sentences out of. */
const GRAMMAR: LedgerGrammar = {
  noun: "approval ledger",
  recordNoun: "approval record",
  latest: "an approval has one latest record",
};

/**
 * The ledger as Shall writes it: ids in byte order, each record's three keys
 * in one order, every key and value through `emitScalar` — the KEY too, because
 * an id that reads as a number (`1234`) or a word YAML knows (`true`) would come
 * back as something other than the string it is, and the fixpoint would not
 * hold. An empty ledger is no bytes at all, which reads back as no records.
 */
export function emitApprovalLedger(records: ApprovalLedger): string {
  const ids = [...records.keys()].sort(compare);
  const lines: string[] = [];
  for (const id of ids) {
    const record = records.get(id);
    if (record === undefined) {
      continue;
    }
    lines.push(`${emitScalar(id)}:`);
    lines.push(`  approvedHash: ${emitScalar(record.approvedHash)}`);
    lines.push(`  by: ${emitScalar(record.by)}`);
    lines.push(`  at: ${emitScalar(record.at)}`);
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

function refused(problem: string): ApprovalLedgerReading {
  return { records: new Map(), problem };
}

/**
 * The bytes of a ledger, read.
 *
 * The order the checks run in is the order a person can act on: whether it is
 * YAML at all, whether it is a map, whether every key is a node id written
 * once — all of that in `readLedgerRoot` — and only then whether every record
 * has the shape and the values, which is this file's own half. The first thing
 * wrong is the whole answer: a ledger is one fact about the project, and it
 * either reads or it does not.
 */
export function parseApprovalLedger(text: string): ApprovalLedgerReading {
  const root = readLedgerRoot(text, GRAMMAR);
  if (root.problem !== null) {
    return refused(root.problem);
  }

  const records = new Map<string, ApprovalRecord>();
  for (const [id, value] of root.entries) {
    const held = readStringMap(value, RECORD_KEYS);
    if (held === null) {
      return refused(`${RECORD_SHAPE} — the record under ${id} is not.`);
    }
    const approvedHash = judgeIdentity("An approved hash", held["approvedHash"] ?? "");
    const by = judgeIdentity("An approver", held["by"] ?? "");
    const at = judgeIdentity("An approval instant", held["at"] ?? "");
    const [problem] = [...approvedHash.problems, ...by.problems, ...at.problems];
    if (problem !== undefined) {
      return refused(`Under ${id}, ${lowerFirst(problem)}`);
    }
    records.set(id, {
      approvedHash: approvedHash.value,
      by: by.value,
      at: at.value,
    });
  }
  return { records, problem: null };
}
