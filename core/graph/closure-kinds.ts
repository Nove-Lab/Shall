import type { NodeTypeName } from "./canon.js";

/**
 * The two things a person CLOSES, and the relation that claims each of them.
 *
 * CLOSURE IS A SECOND AXIS AND IT NOW HAS TWO SUBJECTS. A criterion is met when
 * evidence shows it is; a task is done when a completion report shows it is —
 * the work logs that addressed it are how it was worked on, not what proves it
 * finished. Both judgements are the same act — a person reads a LIST of lower
 * nodes and says "yes, on these" or "not yet, and here is why" — so both are
 * read out of the same two ledgers by the same arithmetic, and this table is
 * the only place that says which relation makes the list.
 *
 * IT LIVES IN `core/graph` AND NOT IN `core/arith`, beside `ANCHOR_RULES`, and
 * for the same reason that table does: "an Evidence claims a criterion by its
 * own CLAIMS line" is a fact about the canon rather than about arithmetic.
 * `core/arith/closure.ts` reads it the way `color.ts` reads `anchorsFor`, and a
 * browser that only wants to know whether a type has a closure at all — the
 * Spec plane's panel does — can ask without pulling the ledgers' parser in.
 *
 * THE CLAIM RUNS FROM THE CLAIMANT, both times — the lower node names what it
 * claims in its own file, so a new claim never touches the subject's file and
 * never moves its approval. Both rows are the CLAIMS edge on purpose: closing
 * is judged over claims, and ADDRESSES stays what it always was — which task
 * this work was done under — without being a closure list too.
 */

/** Which of the two things is being closed. */
export type ClosureSubject = "criterion" | "task";

/** One row: the subject, the relation that claims it, and what draws that relation. */
export interface ClosureKind {
  readonly kind: ClosureSubject;
  readonly subjectType: NodeTypeName;
  readonly claim: string;
  readonly claimantType: NodeTypeName;
}

export const CLOSURE_KINDS: readonly ClosureKind[] = [
  // #24 Evidence —CLAIMS→ AcceptanceCriterion
  {
    kind: "criterion",
    subjectType: "AcceptanceCriterion",
    claim: "CLAIMS",
    claimantType: "Evidence",
  },
  // #24— TaskCompletionReport —CLAIMS→ ImplementationTask
  {
    kind: "task",
    subjectType: "ImplementationTask",
    claim: "CLAIMS",
    claimantType: "TaskCompletionReport",
  },
];

/** The closure this type is the subject of, or null for the twenty that have none. */
export function closureKindOf(type: string): ClosureKind | null {
  return CLOSURE_KINDS.find((entry) => entry.subjectType === type) ?? null;
}

/** The closure a `ClosureSubject` names — the reverse lookup, for a record's own tag. */
export function closureKindNamed(kind: ClosureSubject): ClosureKind {
  const found = CLOSURE_KINDS.find((entry) => entry.kind === kind);
  if (found === undefined) {
    // Unreachable while `ClosureSubject` is read off this table, and thrown
    // rather than defaulted so that adding a third subject to the union without
    // a row here fails loudly at the first call instead of closing the wrong
    // thing quietly.
    throw new Error(`No closure kind named ${kind}`);
  }
  return found;
}
