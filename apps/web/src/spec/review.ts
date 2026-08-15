import type { api } from "@/api";
import type { SpecEdge } from "./spec-node";
import type { Signal } from "./view/furniture";

/**
 * WHAT THE DAEMON SAYS ABOUT THE GRAPH, IN THE SHAPES THIS SURFACE READS IT IN.
 *
 * EVERY TYPE BELOW IS DERIVED FROM THE CLIENT AND NONE IS WRITTEN OUT. The
 * router's answer is already a type — it travels here through
 * `@shall/daemon/router` — so a hand-written copy of it would be a second
 * declaration of the wire, out of step on the first field the daemon adds and
 * with nothing to error. `Awaited<ReturnType<…>>` is how a caller with no
 * `@trpc/server` dependency names an answer, and this app has none.
 *
 * IT IS A `.ts` AND NOT A `.tsx` ON PURPOSE. Nothing here renders: the colour a
 * node wears, the relations that point at it and the sentences a person reads
 * are all decisions that can be made — and read — without a browser, and the
 * components that draw them live in `review-parts.tsx`.
 */
export type ReviewReport = Awaited<ReturnType<typeof api.spec.review.query>>;
/** One node that has a colour, and the one word for why. */
export type ReviewStatus = ReviewReport["statuses"][number];
export type StatusReason = ReviewStatus["reason"];
/** An id something still points at with nothing behind it. */
export type MissingNode = ReviewReport["missing"][number];
/** A file under `.shall/spec` that would not read, with every sentence against it. */
export type BrokenFile = ReviewReport["broken"][number];
export type ApprovedVersion = Awaited<
  ReturnType<typeof api.spec.approvedVersion.query>
>;
export type GitStatus = Awaited<ReturnType<typeof api.spec.gitStatus.query>>;

/**
 * NO COLOURS YET — the board before the first review lands, as one shared value
 * rather than a fresh empty map per render.
 *
 * Its identity is the point. Every card on the canvas is rebuilt when the map it
 * was built against changes, so a `new Map()` written inline would hand React
 * Flow fifty new node objects on every render of the plane. `NOTHING_SELECTED`
 * in `view/highlight.ts` is the same trick for the same reason.
 */
export const NO_SIGNALS: ReadonlyMap<string, Signal> = new Map();

/**
 * THE ONE LINE WHERE THE DAEMON'S COLOUR BECOMES THE CANVAS'S SIGNAL.
 *
 * The two unions are declared a repository apart — `core/arith/color.ts` names
 * the verdict, `view/furniture.ts` names what a card can wear — and this
 * assignment is where they have to agree. A fourth colour on the wire is a
 * compile error HERE, in a file whose whole job is the crossing, rather than a
 * card silently drawn in no class at all.
 *
 * A NODE WITH NO ENTRY GETS NO SIGNAL, and that absence is the daemon's answer
 * rather than a gap — every canon type is coloured now, the execution band
 * included, so a card without a dot is a card the review has not answered for.
 * Nothing here computes a verdict of its own.
 */
export function signalsOf(
  report: ReviewReport | null,
): ReadonlyMap<string, Signal> {
  if (report === null) {
    return NO_SIGNALS;
  }

  const signals = new Map<string, Signal>();
  for (const status of report.statuses) {
    signals.set(status.id, status.color);
  }
  return signals;
}

/** The same list keyed by id, for the panel — which wants the reason, not the colour. */
export function statusesById(
  report: ReviewReport | null,
): ReadonlyMap<string, ReviewStatus> {
  const byId = new Map<string, ReviewStatus>();
  for (const status of report?.statuses ?? []) {
    byId.set(status.id, status);
  }
  return byId;
}

/**
 * THE RELATIONS THAT POINT AT A NODE — what a deletion leaves drawn to nothing.
 *
 * Only the relations pointing IN. The ones that start at the node go with it,
 * so they are not what a person deleting it has to be warned about.
 */
export function referrersOf(
  edges: readonly SpecEdge[],
  id: string,
): SpecEdge[] {
  return edges.filter((edge) => edge.toId === id);
}

/**
 * WHAT DELETING A NODE DOES, IN THE ORDER IT MATTERS: what goes, what is left
 * pointing at nothing, and that neither comes back. Both dialogs that can delete
 * a node say it in these words, because there is one answer and it does not
 * depend on which door the person came through.
 */
export function deletionSentence(id: string): string {
  return `${id} leaves the graph, and the relations that start at it go with it. Relations that point at it stay behind, drawn to a node that is no longer there. This cannot be undone.`;
}

/**
 * HOW MUCH IS POINTING AT IT, COUNTED IN RELATIONS AND NOT IN NODES. The list
 * drawn under this sentence is one row per relation, so a number counted any
 * other way would be a number the reader can see is wrong: two relations between
 * the same pair are two rows and are two here.
 */
export function impactSentence(id: string, count: number): string {
  if (count === 0) {
    return `Nothing points at ${id}.`;
  }
  if (count === 1) {
    return `One relation points at ${id}. Deleting it leaves that relation drawn to a node that is gone.`;
  }
  return `${String(count)} relations point at ${id}. Deleting it leaves them drawn to a node that is gone.`;
}

/**
 * The two lists the Problems dialog is made of, counted once here so the button
 * that opens it and the dialog it opens cannot disagree about how many there are.
 */
export function problemCount(report: ReviewReport | null): number {
  return report === null ? 0 : report.missing.length + report.broken.length;
}
