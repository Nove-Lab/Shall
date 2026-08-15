/**
 * THE SHAPE OF A NODE AND OF AN EDGE IS THE CANON'S, NOT THIS APP'S.
 *
 * This file used to declare its own `SpecNode`, and a second declaration of a
 * stored row is a second thing to keep in step with the database — it was
 * already out of step, still spelling an `attrs` JSON blob that the row's
 * named columns replaced. The re-export stays so that the
 * Spec plane's modules keep one import for the row they draw, but the type is
 * `@shall/core/graph`'s and there is nowhere here for it to drift.
 *
 * What is left below is the one thing that IS this surface's: how a stored
 * instant is written for a person to read.
 */
export type { SpecEdge, SpecNode } from "@shall/core/graph";

/**
 * A stored instant in the reader's own locale and time zone.
 *
 * It is deliberately not stable across machines, which is why it is here and not
 * in the pure `view/` folder: everything there must draw the same picture
 * everywhere, and this is the opposite promise.
 *
 * IT TAKES EITHER SPELLING OF AN INSTANT, because the two the daemon serves are
 * both moments to whoever is reading them: a file's mtime is a number, the
 * ledger's `at` on an approval is ISO 8601, and one function is all the rule
 * there is.
 *
 * A DATE THAT WILL NOT PARSE IS PRINTED AS THE TEXT IT WAS. `toLocaleString` on
 * an unparseable value says "Invalid Date", which tells the reader nothing and
 * hides the one thing that would: what the file actually holds. A stamp somebody
 * can check against the file is worth more than a sentence saying it is broken.
 */
export function formatStamp(at: number | string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? String(at) : date.toLocaleString();
}
