import { compare, judgeBody, type ClosureSubject } from "../graph/index.js";
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
 * The rejection ledger — `.shall/ledger/rejections.yaml` — as bytes, and bytes
 * back into records.
 *
 * A REJECTION IS A PERSON'S REFUSAL OF ONE NODE AT ONE CONTENT HASH, and the
 * rationale is the whole point of it. Somebody read the node, decided it is not
 * right, and wrote down what is wrong and what it should be instead. That
 * sentence is what the agent whose turn it now is will read, so it is stored
 * beside the hash it was written against rather than in a log nobody opens.
 *
 * IT LAPSES BY ARITHMETIC, NOT BY ANYBODY'S HAND. The record names the hash of
 * the content that was refused; the moment the content changes, the hashes stop
 * matching and the rejection stops standing — the node goes back to yellow and
 * into the review queue on its own. Nothing sweeps this file. A record whose
 * hash no longer matches is the HISTORY of a hearing, and a panel is entitled
 * to show it as one ("this was rejected before, and here is why"), which is why
 * a lapsed record is kept rather than pruned.
 *
 * APPROVALS AND REJECTIONS NEVER ERASE EACH OTHER. They are two books and a
 * node may stand in both — approved once, rejected later, or the other way
 * round — and the colour rules decide which one wins (a standing rejection
 * does). Writing one never touches the other, so no write can lose a fact
 * somebody recorded. WITHDRAWING IS REMOVING THE KEY: a rejection taken back
 * leaves nothing behind here, because the person is saying it should not have
 * been recorded, and git holds what the file said before.
 *
 * ONE RECORD PER NODE, THE LATEST ONLY, like the approval ledger — the map's
 * own grammar says so, and re-rejecting replaces the value. Read leniently,
 * written canonically, refused for the whole file in one sentence: all of that
 * is `ledger-common.ts`, shared with the other two books.
 *
 * TWO KINDS OF "NO" LIVE IN THIS BOOK, told apart by one key. A record without
 * a claimant map is the refusal of a NODE — its content, at that hash — and it
 * is what turns the node red. A record WITH one (`evidence:` for a criterion,
 * `reports:` for a task) is a subject LEFT OPEN: somebody looked at every
 * claimant, decided the subject is not met by them, and said why. That is a
 * judgement about the list and not about the subject's wording, so it colours
 * nothing; it names the subject's hash and every claimant's hash so that a
 * changed subject or a changed list asks the question again, exactly as an
 * acceptance does. The two are the same shape plus one map, and they share the
 * key so that a subject is EITHER closed (acceptances) OR left open (here)
 * and never both — the doors that write them remove the other book's record.
 */

/** Where the ledger lives, under a project's `.shall` folder. */
export const REJECTIONS_FILE = "ledger/rejections.yaml";

/** One person's rejection of one node, as the ledger remembers it. */
export interface RejectionRecord {
  /** `sha256:<hex>` over the node's approval payload at the moment of rejection. */
  readonly rejectedHash: string;
  /** The username of whoever pressed reject. */
  readonly by: string;
  /** ISO 8601, the daemon's clock at the moment of the write. */
  readonly at: string;
  /**
   * What is wrong, and what it should be instead — the one field of any ledger
   * that is prose. It may hold line breaks, and the emitter writes those as
   * `\n` inside a double-quoted scalar rather than as a block, because the
   * scalar rule is the one this codebase freezes and it has no block style.
   */
  readonly rationale: string;
  /**
   * PRESENT ONLY FOR A SUBJECT LEFT OPEN: which kind of thing was left open,
   * and every node claiming it at the moment of the judgement — id →
   * `sha256:<hex>` of that claimant's own payload. Absent for the ordinary
   * rejection of a node's own words.
   *
   * ON DISK IT IS ONE MAP UNDER ONE NAME — `evidence:` for a criterion,
   * `reports:` for a task, the same two names the acceptance ledger uses for
   * the same two lists — and a record carrying both is refused. The tag is read
   * back off whichever name is there.
   */
  readonly leftOpen?:
    | {
        readonly kind: ClosureSubject;
        readonly claimants: ReadonlyMap<string, string>;
      }
    | undefined;
}

/** The whole ledger: node id to its latest record. */
export type RejectionLedger = ReadonlyMap<string, RejectionRecord>;

/**
 * What one ledger amounted to. `problem` is null exactly when the file read;
 * a file with a problem contributes NO records — half a ledger is a worse
 * answer than none, for the same reason half a node is.
 */
export interface RejectionLedgerReading {
  readonly records: RejectionLedger;
  readonly problem: string | null;
}

/** The record's keys, in the order the emitter writes them. */
const RECORD_KEYS = ["rejectedHash", "by", "at", "rationale"] as const;

/** Refused wholesale rather than per-key: it is one rule about one shape. */
const RECORD_SHAPE =
  "Every record in the rejection ledger is a map of rejectedHash, by, at and rationale, each of them text — with one map of what was left open over it, evidence for a criterion or reports for a task, holding at least one entry and never both";

/** The three words the shared root reader makes this book's sentences out of. */
const GRAMMAR: LedgerGrammar = {
  noun: "rejection ledger",
  recordNoun: "rejection record",
  latest: "a rejection has one latest record",
};

/**
 * The ledger as Shall writes it: ids in byte order, each record's four keys in
 * one order, every key and value through `emitScalar` — the KEY too, because an
 * id that reads as a number (`1234`) or a word YAML knows (`true`) would come
 * back as something other than the string it is, and the fixpoint would not
 * hold. An empty ledger is no bytes at all, which reads back as no records.
 *
 * A rationale with line breaks comes out as one double-quoted scalar holding
 * `\n`, which is `emitScalar`'s ordinary answer to a value it cannot write
 * plain. It is not pretty and it is not meant to be: these bytes are Shall's,
 * the prose is read in a panel, and one line per record is a diff a person can
 * follow.
 */
export function emitRejectionLedger(records: RejectionLedger): string {
  const ids = [...records.keys()].sort(compare);
  const lines: string[] = [];
  for (const id of ids) {
    const record = records.get(id);
    if (record === undefined) {
      continue;
    }
    lines.push(`${emitScalar(id)}:`);
    lines.push(`  rejectedHash: ${emitScalar(record.rejectedHash)}`);
    if (record.leftOpen !== undefined) {
      // The map goes right after the hash it was judged beside, as it does in
      // the acceptance ledger, so the two books read alike. An empty map is
      // written as a bare `evidence:`/`reports:` and refused on the way back —
      // see the acceptance ledger for why the emitter does not paper over it.
      lines.push(`  ${CLAIMANT_WORDS[record.leftOpen.kind].key}:`);
      for (const claimantId of [...record.leftOpen.claimants.keys()].sort(
        compare,
      )) {
        const hash = record.leftOpen.claimants.get(claimantId);
        if (hash === undefined) {
          continue;
        }
        lines.push(`    ${emitScalar(claimantId)}: ${emitScalar(hash)}`);
      }
    }
    lines.push(`  by: ${emitScalar(record.by)}`);
    lines.push(`  at: ${emitScalar(record.at)}`);
    lines.push(`  rationale: ${emitScalar(record.rationale)}`);
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

function refused(problem: string): RejectionLedgerReading {
  return { records: new Map(), problem };
}

/**
 * The record's shape, or null: the four text keys, and either no list at all or
 * exactly one of `evidence`/`reports`, a map of text to text with something in
 * it. Written out rather than reached for from `readStringMap`, because that
 * helper asks for a tuple of strings and the fifth key here is a map.
 *
 * BOTH LISTS AT ONCE IS REFUSED. A record that says a criterion and a task were
 * both left open over one id is not a record anything can act on, and picking
 * one would be inventing the verdict.
 */
function readRecordShape(value: unknown): {
  readonly rejectedHash: string;
  readonly by: string;
  readonly at: string;
  readonly rationale: string;
  readonly leftOpen: {
    readonly kind: ClosureSubject;
    readonly claimants: ReadonlyMap<string, string>;
  } | null;
} | null {
  if (!isMap(value)) {
    return null;
  }
  const keys = Object.keys(value);
  const kinds = (Object.keys(CLAIMANT_WORDS) as ClosureSubject[]).filter(
    (kind) => keys.includes(CLAIMANT_WORDS[kind].key),
  );
  if (kinds.length > 1) {
    return null;
  }
  const [kind] = kinds;
  if (keys.length !== RECORD_KEYS.length + (kind === undefined ? 0 : 1)) {
    return null;
  }
  const rejectedHash = value["rejectedHash"];
  const by = value["by"];
  const at = value["at"];
  const rationale = value["rationale"];
  if (
    typeof rejectedHash !== "string" ||
    typeof by !== "string" ||
    typeof at !== "string" ||
    typeof rationale !== "string"
  ) {
    return null;
  }
  if (kind === undefined) {
    return { rejectedHash, by, at, rationale, leftOpen: null };
  }
  const claimants = value[CLAIMANT_WORDS[kind].key];
  if (!isMap(claimants)) {
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
  return {
    rejectedHash,
    by,
    at,
    rationale,
    leftOpen: { kind, claimants: held },
  };
}

/**
 * The bytes of a ledger, read.
 *
 * THE RATIONALE IS JUDGED AS A BODY AND THE OTHER THREE AS IDENTITIES, which is
 * the one place this book differs from the approval ledger. A hash, a username
 * and an instant are one line each and are held to that — trimmed, required, no
 * control characters. A rationale is prose: its line endings are settled to LF,
 * its blank edges dropped and only what no text file can carry is refused, by
 * the very function the node body goes through, so that a sentence the panel
 * can save is a sentence this file accepts. It is then REQUIRED, because a
 * rejection without a reason is a turn handed to an agent with nothing in it.
 */
export function parseRejectionLedger(text: string): RejectionLedgerReading {
  const root = readLedgerRoot(text, GRAMMAR);
  if (root.problem !== null) {
    return refused(root.problem);
  }

  const records = new Map<string, RejectionRecord>();
  for (const [id, value] of root.entries) {
    const held = readRecordShape(value);
    if (held === null) {
      return refused(`${RECORD_SHAPE} — the record under ${id} is not.`);
    }

    // The claimant map's defence is `judgeClaimantList` in `ledger-common.ts`,
    // shared word for word with the acceptance ledger.
    if (held.leftOpen !== null) {
      const words = CLAIMANT_WORDS[held.leftOpen.kind];
      const listProblem = judgeClaimantList(
        root.source,
        id,
        GRAMMAR,
        words,
        `a ${held.leftOpen.kind} left open names one hash for ${words.each}`,
        held.leftOpen.claimants.keys(),
      );
      if (listProblem !== null) {
        return refused(listProblem);
      }
    }

    const rejectedHash = judgeIdentity("A rejected hash", held.rejectedHash);
    const by = judgeIdentity("A rejecter", held.by);
    const at = judgeIdentity("A rejection instant", held.at);
    const rationale = judgeBody(held.rationale);
    const rationaleProblems =
      rationale.problems.length === 0 && rationale.value === ""
        ? ["A rationale is required."]
        : rationale.problems;
    const problems: string[] = [
      ...rejectedHash.problems,
      ...by.problems,
      ...at.problems,
      ...rationaleProblems,
    ];
    let leftOpen: RejectionRecord["leftOpen"];
    if (held.leftOpen !== null) {
      const claimants = new Map<string, string>();
      for (const [claimantId, hash] of held.leftOpen.claimants) {
        const judgedHash = judgeIdentity(
          CLAIMANT_WORDS[held.leftOpen.kind].hash,
          hash,
        );
        problems.push(...judgedHash.problems);
        claimants.set(claimantId, judgedHash.value);
      }
      leftOpen = { kind: held.leftOpen.kind, claimants };
    }
    const [problem] = problems;
    if (problem !== undefined) {
      return refused(`Under ${id}, ${lowerFirst(problem)}`);
    }
    records.set(id, {
      rejectedHash: rejectedHash.value,
      by: by.value,
      at: at.value,
      rationale: rationale.value,
      ...(leftOpen === undefined ? {} : { leftOpen }),
    });
  }
  return { records, problem: null };
}
