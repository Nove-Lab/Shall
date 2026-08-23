import { judgeNodeId, type ClosureSubject } from "../graph/index.js";
import {
  describeValue,
  isMap,
  mapKeysAt,
  readYaml,
  type YamlError,
} from "./yaml.js";

/**
 * The grammar all three of Shall's ledgers share — `approvals.yaml`,
 * `rejections.yaml`, `acceptances.yaml` — settled once, here.
 *
 * THREE BOOKS, ONE SHAPE. Each ledger is a YAML map from node id to that node's
 * latest record of one kind: what was approved, what was rejected, what an
 * acceptance criterion was closed on. What differs between them is the record —
 * three fields or four, a nested map or none — and nothing above it. The root is
 * the same fact in all three: a map, one key per node, every key a node id
 * written once. So the root is read here and the record is read by the book that
 * owns it.
 *
 * IT IS AN EXTRACTION AND NOT A DESIGN. Every sentence below was first written
 * for the approval ledger, and the approval ledger's bytes and refusals are
 * frozen — they are in other people's git history and in a golden test that
 * spells them out character by character. So the clauses that a second book
 * would have said differently are PARAMETERS rather than rewrites: the noun the
 * file is called by, the noun its values are called by, and the clause that
 * closes the twin-key refusal. A reader can check that approvals still says what
 * it always said by substituting three strings.
 *
 * THE ORDER OF THE CHECKS IS THE ORDER A PERSON CAN ACT ON, and it is the same
 * in all three: whether it is YAML at all, whether it is a map, whether every
 * key is a node id written once, and only then whatever the record is. The first
 * thing wrong is the whole answer — a ledger is one fact about the project, and
 * it either reads or it does not, because a ledger half-read is a screen
 * half-green.
 */

/**
 * The three words that make one book's sentences out of the shared ones.
 *
 * They are held together rather than passed as three loose strings because they
 * have to agree with each other: a file called "the rejection ledger" whose
 * values are called "approval records" would be a refusal nobody could act on.
 */
export interface LedgerGrammar {
  /** How a refusal names the file: `approval ledger`, `rejection ledger`. */
  readonly noun: string;
  /** What the map's values are, for the not-a-map sentence: `approval record`. */
  readonly recordNoun: string;
  /** The clause that closes the twin-key refusal: `an approval has one latest record`. */
  readonly latest: string;
}

/**
 * One key of the root map and whatever stood under it, unjudged.
 *
 * The order is `toJS()`'s and therefore JavaScript's, which is the order the
 * keys were written except that a key spelling an integer comes first — a quirk
 * of every object in the language and not of this reader. It matters to nothing:
 * the first problem is the whole answer either way, and which of two broken
 * records gets named is not a fact anybody acts on differently.
 */
export type LedgerEntry = readonly [id: string, value: unknown];

/**
 * What the root of a ledger amounted to.
 *
 * `problem` is null exactly when the root read, and a root with a problem
 * carries no entries — the same rule the books above keep, for the same reason.
 *
 * `source` is the bytes AS THIS READER SETTLED THEM, handed back because a
 * caller that needs the document a second time (the acceptance ledger reparses
 * it to see the keys of a nested map) must ask about the same bytes this one
 * read. Settling twice would be harmless and asking about the unsettled text
 * would not be.
 */
export interface LedgerRootReading {
  readonly source: string;
  readonly entries: readonly LedgerEntry[];
  readonly problem: string | null;
}

/**
 * WHAT EACH CLOSURE KIND'S CLAIMANT LIST IS CALLED — the disk key and the three
 * nouns a refusal drops into a sentence.
 *
 * TWO BOOKS WRITE THESE LISTS — an acceptance closes a subject over one, a
 * left-open record holds one — and the names are deliberately THE SAME NAMES
 * in both: one list of claimants, one vocabulary, whichever book is holding
 * the verdict. This table is that fact; before it, each book carried its own
 * copy and a comment swearing they matched.
 */
export interface ClaimantWords {
  /** The disk key the map is written under: `evidence`, `reports`. */
  readonly key: string;
  /** One row of it, for the names-no-id refusal: `an evidence entry`. */
  readonly entry: string;
  /** The rows severally, for the twin-key refusal: `each piece of evidence`. */
  readonly each: string;
  /** A row's value, for the bad-hash refusal: `An evidence hash`. */
  readonly hash: string;
  /**
   * The subject as a person says it — `criterion`, `work item` — for the one
   * clause that names what was left open. The tag a record carries is a name
   * inside the process and reads as code; this is the word that goes in a
   * sentence.
   */
  readonly subject: string;
}

export const CLAIMANT_WORDS: Readonly<Record<ClosureSubject, ClaimantWords>> = {
  criterion: {
    key: "evidence",
    entry: "an evidence entry",
    each: "each piece of evidence",
    hash: "An evidence hash",
    subject: "criterion",
  },
  // `reports` is the key the book has carried since 2026-08-17 and is frozen
  // bytes (ARCHITECTURE, 얼어붙은 것): the tag renamed, the key did not.
  workItem: {
    key: "reports",
    entry: "a report entry",
    each: "each report",
    hash: "A report hash",
    subject: "work item",
  },
};

/**
 * THE NESTED MAP DEFENDED THE WAY THE ROOT IS. `toJS()` collapses a key written
 * once bare and once quoted into one property, at any depth, so the claimant
 * map is asked about the document's own keys through `mapKeysAt` — over the
 * very bytes the root reader settled, so both questions are about one source.
 * Two spellings of one claimant id would be two hashes for one node, and the
 * last one written would silently win.
 *
 * The ids are then judged as node ids, because that is what they are — the ids
 * first and the values after, which is the order the root reader keeps and the
 * order a person can act on: an entry that names no node is a worse thing to be
 * told second. The first problem is the whole answer, or null when the list
 * reads; the hashes beside the ids stay the caller's to judge, with the rest of
 * its record.
 *
 * `closing` is the clause that ends the twin-key refusal — "an acceptance names
 * one hash for each piece of evidence", "a criterion left open names one hash
 * for each piece of evidence" — because that is the one clause the two books
 * say differently about the same defence.
 */
export function judgeClaimantList(
  source: string,
  id: string,
  grammar: LedgerGrammar,
  words: ClaimantWords,
  closing: string,
  claimantIds: Iterable<string>,
): string | null {
  const seen = new Set<string>();
  for (const key of mapKeysAt(source, [id, words.key]) ?? []) {
    if (key !== "" && seen.has(key)) {
      return `${key} is written twice under ${id} in the ${grammar.noun}, once bare and once quoted — YAML reads two keys and Shall one id, and ${closing}.`;
    }
    seen.add(key);
  }
  for (const claimantId of claimantIds) {
    if (claimantId === "") {
      return `Under ${id}, ${words.entry} names no node id.`;
    }
    const judged = judgeNodeId(claimantId);
    if (judged !== null) {
      return `Under ${id}, ${JSON.stringify(claimantId)} is not a node id. ${judged}`;
    }
  }
  return null;
}

/** "An approver is required." → "an approver is required." — for after "Under X,". */
export function lowerFirst(sentence: string): string {
  return sentence.charAt(0).toLowerCase() + sentence.slice(1);
}

/**
 * The library's own message, except where the library is talking to a
 * programmer — see `parse.ts` for the same clause in the node file's words.
 *
 * The clause says "the ledger" and not which one, because it is true of all
 * three and the sentence it lands in has already named the book.
 */
export function describeParseError(error: YamlError): string {
  if (error.code === "MULTIPLE_DOCS") {
    return 'a "..." or "---" line inside it ends the ledger early, so the records after that line belong to nobody';
  }
  return error.message;
}

/**
 * The bytes of a ledger down to its entries: YAML, a map, and one node id per
 * key, with the record under each key left for the caller to judge.
 *
 * A leading byte-order mark and CRLF are tolerated and settled first, as the
 * node file's reader settles them, so the file's own re-read matches what was
 * written.
 *
 * An empty file is a ledger with nothing in it, not an error: nobody has
 * written anything into this book yet, and the first record writes the first
 * bytes.
 */
export function readLedgerRoot(
  text: string,
  grammar: LedgerGrammar,
): LedgerRootReading {
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const refused = (problem: string): LedgerRootReading => ({
    source,
    entries: [],
    problem,
  });

  const reading = readYaml(source);
  if (reading.error !== null) {
    return refused(
      `The ${grammar.noun} is not YAML Shall can read: ${describeParseError(reading.error)}.`,
    );
  }
  if (reading.value === null || reading.value === undefined) {
    return { source, entries: [], problem: null };
  }
  if (!isMap(reading.value)) {
    return refused(
      `The ${grammar.noun} is ${describeValue(reading.value)}, not a map from node id to ${grammar.recordNoun}.`,
    );
  }

  // The one fact `toJS()` loses: an id written once bare and once quoted —
  // `1234` and `"1234"`, `true` and `"true"` — is two keys to YAML and one
  // property to JavaScript. Caught off the document's own key list, so a fact
  // with two homes is refused here as it is in a node file. A key that spells
  // no id at all (`~:`) is not a twin of anything; it is refused by name below.
  const seen = new Set<string>();
  for (const key of reading.rootKeys ?? []) {
    if (key !== "" && seen.has(key)) {
      return refused(
        `${key} is written twice in the ${grammar.noun}, once bare and once quoted — YAML reads two keys and Shall one id, and ${grammar.latest}.`,
      );
    }
    seen.add(key);
  }

  const entries: LedgerEntry[] = [];
  for (const [id, value] of Object.entries(reading.value)) {
    if (id === "") {
      return refused(`A record in the ${grammar.noun} names no node id.`);
    }
    const judged = judgeNodeId(id);
    if (judged !== null) {
      return refused(
        `The ${grammar.noun} names ${JSON.stringify(id)}, which is not a node id. ${judged}`,
      );
    }
    entries.push([id, value]);
  }
  return { source, entries, problem: null };
}
