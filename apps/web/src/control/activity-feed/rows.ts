import type { api } from "../../api";

/**
 * THE FEED'S ROW VOCABULARY, importable without the feed's table: the glance on
 * the overview and the panel both read these. The queue's
 * `review-queue/rows.ts` and the board's `work-board/rows.ts` are the same
 * shape next door.
 *
 * WHY A MODULE AT ALL, when a row is a record with its refs trimmed. Two
 * reasons, each of which wants one place: the labels are a `Record` over the
 * kind union, so a fifth kind decided in `core/serialize/activity.ts` is a
 * compile error here and not a badge that renders a wire word; and the refs a
 * row shows are capped in one place, so the panel's links and the glance's
 * plain text agree on which three and on how many are behind them.
 *
 * EVERY TYPE HERE IS DERIVED FROM THE CLIENT AND NONE IS WRITTEN OUT — the
 * `spec/review.ts` rule. The daemon's answer is already a type, and a copy of
 * it would be out of step on the first field the daemon adds.
 *
 * EVERY IMPORT IS RELATIVE, the `spec/view/*` bargain: this file is run by
 * `node --import tsx` in the test, and tsx does not resolve `@/`; the test's
 * own tsconfig has no `paths` either, so even a type-only `@/api` would fail
 * the typecheck that covers the test. The client's type is reached the long
 * way round, and nothing is lost — it is the same `api` and the same wire.
 */

export type ActivityMonth = Awaited<ReturnType<typeof api.spec.activity.query>>;
/** One line of one month's file: the end of a run, as the agent logged it. */
export type ActivityEntry = ActivityMonth["entries"][number];
export type ActivityKind = ActivityEntry["kind"];

/**
 * THE FOUR KINDS IN A PERSON'S WORDS, IN ONE PLACE. `Record<ActivityKind, …>`
 * and not a loose map: a fifth kind decided in `core/serialize/activity.ts`
 * is a compile error at this table rather than a badge that renders a wire
 * word. The glance reads the same map, so the badge on the card and the badge
 * on the panel cannot disagree.
 */
export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  specify_done: "Specify done",
  plan_done: "Plan done",
  work_done: "Work done",
  raise_landed: "Raise landed",
};

/** Representative refs a row shows before "and N more". */
export const REFS_SHOWN = 3;

/**
 * ONE ROW OF THE TABLE IS ONE RECORD OF THE FILE. Nothing folds: every line is
 * a run's own finished record with its own sentence, and two of them are two
 * things, so the screen shows the month as flat as the file keeps it.
 */
export interface ActivityRow {
  /** The index of the record in the answer — unique and stable per answer. */
  readonly key: string;
  readonly kind: ActivityKind;
  /** ISO `at` of the record. */
  readonly at: string;
  /** The record's summary verbatim — the sentence the agent logged. */
  readonly sentence: string;
  /** Distinct, in the record's order, capped at REFS_SHOWN. */
  readonly refs: readonly string[];
  /** Distinct refs beyond the cap. */
  readonly hiddenRefs: number;
}

/**
 * THE MONTH AS ROWS, NEWEST FIRST IN AND NEWEST FIRST OUT — one row per
 * record, in the order the daemon serves them, which is already newest first.
 * The only arithmetic is over the refs: the same id twice on one line is one
 * door, and a line about many nodes shows the first few and counts the rest.
 */
export function activityRows(entries: readonly ActivityEntry[]): ActivityRow[] {
  return entries.map((entry, index) => {
    const distinct = entry.refs.filter((ref, at, all) => all.indexOf(ref) === at);
    const refs = distinct.slice(0, REFS_SHOWN);
    return {
      key: String(index),
      kind: entry.kind,
      at: entry.at,
      sentence: entry.summary,
      refs,
      hiddenRefs: distinct.length - refs.length,
    };
  });
}

/**
 * THE REFS CELL AS PLAIN TEXT — the ids and the overflow — for the overview's
 * glance, where there is no room for links, or a dash when the row names no
 * node (the board's "—" for a row with no date).
 */
export function rowNote(row: ActivityRow): string {
  if (row.refs.length === 0) {
    return "—";
  }
  return (
    row.refs.join(", ") +
    (row.hiddenRefs > 0 ? ` and ${String(row.hiddenRefs)} more` : "")
  );
}
