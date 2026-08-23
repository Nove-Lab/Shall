import { judgeNodeId } from "../graph/index.js";
import { describeParseError, lowerFirst } from "./ledger-common.js";
import { emitScalar } from "./scalar.js";
import { describeValue, isMap, judgeIdentity, readYaml } from "./yaml.js";

/**
 * The activity feed — `.shall/ledger/feed/YYYY-MM.yaml` — as bytes, and bytes
 * back into records.
 *
 * A LIST AND NOT A BOOK. Each of the three ledgers is a map from node id to
 * that node's latest record, because each of them is one fact about a node
 * that has one latest value. The feed is the other kind of file: what
 * happened, in the order it happened — one line for every run that finished —
 * and two runs about one node are two records, not one replaced by the other.
 * So its root is a YAML sequence, appended at the end, never sorted and never
 * deduplicated, and the shared root grammar in `ledger-common.ts`, which
 * insists on a map whose keys are ids, does not read it. What the feed shares
 * with the books is the scalar rule, the one YAML contract, the BOM-and-CRLF
 * settling and the vocabulary of a refusal; the grammar under them is its own.
 *
 * IT IS A SUMMARY FOR A PERSON AND AN INPUT TO NOTHING. No colour, gate, board
 * row or queue card reads the feed: a colour is arithmetic over the three
 * books and the current bytes of every file, and the feed is where a person
 * skims what the agents have been finishing. That is why a record carries a
 * free `summary` no book ever would — the sentence is for the reader and not
 * for Shall — and why a month that will not read costs the panel that shows
 * it and nothing else.
 *
 * ONE FILE PER MONTH, AND THE MONTH IS UTC'S. The file a record belongs in is
 * the first seven characters of its instant — `toISOString()`'s year and
 * month — so the daemon's clock picks the file, and a person east of
 * Greenwich may find a late-evening run under the next month's name. Nothing
 * depends on which file a record is in; the split is only so that a year of
 * activity is not one file rewritten on every line.
 *
 * FOUR KINDS, AND THE TYPE IS THE UNION. They are the ends of a run an agent
 * reports through `shall log` — a specification drawn out, modules planned, a
 * turn of work finished, a raise landed — and nothing else is a line here:
 * what a person judged lives in the three books, and the feed does not repeat
 * it. They are a closed list on the wire as well as on disk — a reader can
 * build a table keyed by them — and a kind nobody knows is refused here
 * rather than shown as a blank row.
 *
 * READ LENIENTLY, WRITTEN CANONICALLY, like everything else under `.shall`: a
 * block list or a flow list of refs, a quoted or a bare instant, keys in any
 * order, a missing `refs` or `summary` all read, and the next append puts the
 * whole file back in one spelling. What is refused is refused for the WHOLE
 * FILE in one sentence, the first thing wrong in the order a person can act
 * on — whether it is YAML, whether it is a list, whether each record is the
 * shape, then the kind, the refs and the instant — because the store will not
 * write over a month it cannot read, and a file half-read is a panel
 * half-told.
 */

/** Where the feed lives, under a project's `.shall` folder: one `YYYY-MM.yaml` per month. */
export const ACTIVITY_DIR = "ledger/feed";

/**
 * The four ends of a run an agent reports, through `shall log` and no other
 * way — every kind a record may carry, in the order a refusal lists them.
 */
export const ACTIVITY_KINDS = [
  "specify_done",
  "plan_done",
  "work_done",
  "raise_landed",
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Whether a string is one of the four, so a kind off the wire or off the disk can be narrowed to the union. */
export function isActivityKind(value: string): value is ActivityKind {
  return (ACTIVITY_KINDS as readonly string[]).includes(value);
}

/**
 * `"2026-08"` from an ISO instant — the first seven characters of
 * `toISOString()`, so the month is UTC's and the same instant always names the
 * same file.
 */
export function activityMonthOf(atIso: string): string {
  return atIso.slice(0, 7);
}

/** `"ledger/feed/2026-08.yaml"` — the month file an instant belongs in, relative to `.shall`. */
export function activityFileFor(atIso: string): string {
  return `${ACTIVITY_DIR}/${activityMonthOf(atIso)}.yaml`;
}

/**
 * One line of the feed: a run finished, and what it finished.
 *
 * NOBODY IS NAMED ON IT. The agent is not a person and the daemon writes the
 * line on its behalf, so there is no author key — the four keys below are the
 * whole record, and a reader meeting any other key refuses the file.
 */
export interface ActivityRecord {
  /** ISO 8601, the daemon's clock at the moment of the write. */
  readonly at: string;
  readonly kind: ActivityKind;
  /** The node ids the line is about — may be empty, never anything but ids. */
  readonly refs: readonly string[];
  /** The sentence for the reader, one line; the door that takes it never lets it be blank. */
  readonly summary: string;
}

/**
 * What one month file amounted to. `problem` is null exactly when the file
 * read; a file with a problem contributes NO records — half a month is a worse
 * answer than none, for the same reason half a ledger is.
 */
export interface ActivityReading {
  readonly records: readonly ActivityRecord[];
  readonly problem: string | null;
}

/** The four keys a record may hold, and no other. */
const RECORD_KEYS: ReadonlySet<string> = new Set(["at", "kind", "refs", "summary"]);

/** Refused wholesale rather than per-key: it is one rule about one shape. */
const RECORD_SHAPE =
  "Every record in the activity feed is a map of at and kind as text, refs as a list, and summary as text";

/**
 * The four kinds as a refusal lists them — built from the list itself rather
 * than written out again, because two lists of the same words are two lists
 * that can disagree, and the golden test pins the sentence either way.
 */
const KIND_LIST = `${ACTIVITY_KINDS.slice(0, -1).join(", ")} and ${ACTIVITY_KINDS.slice(-1).join("")}`;

/**
 * The feed as Shall writes it: the records in the order given, each one a
 * four-line map with the keys in one order, every value through `emitScalar`.
 *
 * THE ORDER IS THE CALLER'S AND NOTHING HERE SORTS IT. The file's order is the
 * order the daemon wrote — which is the order things happened, at the daemon's
 * clock — and sorting by `at` would let a record whose instant was typed by
 * hand jump the queue. Nothing deduplicates either: two identical lines are
 * two things that happened.
 *
 * `refs` IS A FLOW SEQUENCE WRITTEN WITH `emitScalar` ALONE, which is safe only
 * because every element is a node id: the id alphabet holds none of the
 * characters that mean something inside `[...]`, so the one scalar rule covers
 * the flow context too, and an id that reads as a number (`1234`) comes out
 * quoted exactly as it would as a map key. A ref that is not an id is the
 * reader's business to refuse, and the store's fixpoint catches it before the
 * disk does.
 *
 * `at` comes out double-quoted, as it does in the three books, because a
 * timestamp is a form the scalar rule never writes plain. `summary` is always
 * there, `""` if a caller hands one in, although the daemon's door never does.
 * An empty feed is no bytes at all, which reads back as no records.
 */
export function emitActivity(records: readonly ActivityRecord[]): string {
  const lines: string[] = [];
  for (const record of records) {
    lines.push(`- at: ${emitScalar(record.at)}`);
    lines.push(`  kind: ${emitScalar(record.kind)}`);
    lines.push(`  refs: [${record.refs.map((ref) => emitScalar(ref)).join(", ")}]`);
    lines.push(`  summary: ${emitScalar(record.summary)}`);
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

function refused(problem: string): ActivityReading {
  return { records: [], problem };
}

/**
 * The record's shape, or null: `at` and `kind` as text, `refs` a list of text
 * or absent, `summary` text or absent, and no key outside the four. Absent is
 * `[]` and `""` respectively — the tolerant reading, since the emitter never
 * leaves `refs` or `summary` out but a hand might.
 *
 * A KEY THAT IS THERE HOLDING THE WRONG THING IS NOT ABSENT. A bare `refs:` is
 * a null and not a list, `summary: [a]` is a list and not text; each is
 * refused as the shape rather than read as if the key were missing, because a
 * key somebody wrote is a key somebody meant.
 */
function readRecordShape(value: unknown): {
  readonly at: string;
  readonly kind: string;
  readonly refs: readonly string[];
  readonly summary: string;
} | null {
  if (!isMap(value)) {
    return null;
  }
  for (const key of Object.keys(value)) {
    if (!RECORD_KEYS.has(key)) {
      return null;
    }
  }
  const at = value["at"];
  const kind = value["kind"];
  if (typeof at !== "string" || typeof kind !== "string") {
    return null;
  }
  const refs = value["refs"] === undefined ? [] : value["refs"];
  if (!Array.isArray(refs)) {
    return null;
  }
  const ids: string[] = [];
  for (const ref of refs as readonly unknown[]) {
    if (typeof ref !== "string") {
      return null;
    }
    ids.push(ref);
  }
  const summary = value["summary"] === undefined ? "" : value["summary"];
  if (typeof summary !== "string") {
    return null;
  }
  return { at, kind, refs: ids, summary };
}

/**
 * The bytes of a month file, read. Never throws.
 *
 * A leading byte-order mark and CRLF are settled first, as the books settle
 * them, so the file's own re-read matches what was written. An empty file, a
 * file of nothing but comments and a null document are a month with nothing
 * in it and not an error: nobody has logged anything yet, and the first
 * record writes the first bytes.
 *
 * THE ORDER OF THE CHECKS IS THE ORDER A PERSON CAN ACT ON: whether it is YAML
 * at all, whether it is a list, and then record by record in file order —
 * whether the record is the shape, whether its kind is one of the four,
 * whether each ref is a node id, and only then whether the instant is the
 * identity it claims to be. The first thing wrong is the whole answer, and it
 * names the record by its number counted from one, because a record in a list
 * has no id to be named by.
 *
 * THE REFS ARE JUDGED AS NODE IDS, and not merely as text, for the emitter's
 * sake: it writes them into a flow sequence with the one scalar rule, which is
 * safe for an id and not for an arbitrary string. A blank ref lands in the
 * same refusal, since the shape sentence is true of it. The summary is not
 * judged at all — it is the reader's sentence, and the door that takes it from
 * an agent has already held it to one line.
 */
export function parseActivity(text: string): ActivityReading {
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

  const reading = readYaml(source);
  if (reading.error !== null) {
    return refused(
      `The activity feed is not YAML Shall can read: ${describeParseError(reading.error)}.`,
    );
  }
  if (reading.value === null || reading.value === undefined) {
    return { records: [], problem: null };
  }
  if (!Array.isArray(reading.value)) {
    return refused(
      `The activity feed is ${describeValue(reading.value)}, not a list of records.`,
    );
  }

  const entries: readonly unknown[] = reading.value;
  const records: ActivityRecord[] = [];
  for (const [index, entry] of entries.entries()) {
    const n = index + 1;
    const held = readRecordShape(entry);
    if (held === null) {
      return refused(`${RECORD_SHAPE} — record ${n} is not.`);
    }
    if (!isActivityKind(held.kind)) {
      return refused(
        `Record ${n} in the activity feed has the kind ${JSON.stringify(held.kind)}, which is none of ${KIND_LIST}.`,
      );
    }
    for (const ref of held.refs) {
      const judged = judgeNodeId(ref);
      if (judged !== null) {
        return refused(
          `Record ${n} in the activity feed refers to ${JSON.stringify(ref)}, which is not a node id. ${judged}`,
        );
      }
    }
    const at = judgeIdentity("An instant", held.at);
    const [problem] = at.problems;
    if (problem !== undefined) {
      return refused(`In record ${n} of the activity feed, ${lowerFirst(problem)}`);
    }
    records.push({ at: at.value, kind: held.kind, refs: held.refs, summary: held.summary });
  }
  return { records, problem: null };
}
