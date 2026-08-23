import { EDGE_GRAMMAR, compare, type SpecNode } from "../graph/index.js";
import { writtenEdgesOf, type ColorContext } from "./color.js";

/**
 * WHETHER WHAT A CARRIER DEMANDS IS SHOWN MET — sat, unsat, or nothing to say.
 *
 * A Requirement or a Scenario carries criteria, and each criterion has its own
 * mark: open, or closed by a person's word over the evidence claiming it. This
 * module rolls those marks up one level and no further. Every criterion the
 * carrier wrote closed → `sat`. Any of them open → `unsat`. No criterion written
 * at all → null, which is NOT unsat: a carrier nobody has specified criteria for
 * is unspecified, and calling it unmet would be a verdict about work that has
 * not been asked for yet. The Spec plane draws nothing for null.
 *
 * IT IS THE ONE NEW JUDGEMENT THE VITALS SURFACE MAKES, and it is a small one:
 * everything it reads — which lines a file wrote, whether a criterion is
 * closed — is decided elsewhere (`color.ts` for the lines, `closure.ts` for the
 * mark) and arrives here as data. It is its own module for the reason
 * `work-item-state.ts` is: two readers. The review (`review.ts`) puts the word
 * on every carrier so the Spec plane can draw a badge beside its id; the vitals
 * (`vitals.ts`) count the words into a ratio. If either re-derived it, the badge
 * and the ratio could disagree, and a test checks them against each other for
 * exactly that reason. `review.ts` cannot import `vitals.ts` (the vitals read a
 * whole review), so the predicate lives below both of them.
 *
 * "HAS CRITERIA" IS WHAT THE FILE WROTE, AND "CLOSED" IS WHAT LIVES AND IS
 * CLOSED. A `HAS_CRITERION` line whose far end no file answers to still counts
 * as a criterion demanded — the author did specify one — so the carrier is
 * unsat rather than unspecified, and the hole itself is the Fix Spec board's
 * row, said once there and not again here. The conservative side is the same
 * one `prerequisitesMet` takes over a dangling `DEPENDS_ON`.
 *
 * THE CLOSURE MARK ARRIVES AS A FUNCTION, `ColorAt`'s twin. Whoever asks has
 * usually just reviewed the whole graph and holds every criterion's mark; asking
 * `closure.ts` again per carrier would hash each criterion's bytes a second
 * time. A caller that has not may hand in `closureOf` wrapped.
 *
 * PURE AND BROWSER-SAFE like the rest of `core/arith`.
 */

/** The one word for a carrier's criteria, when it has any. */
export type Satisfaction = "sat" | "unsat";

/**
 * The closure mark of a node by id, as the caller already computed it — null
 * where nothing living answers to the id, or where what answers is no closure
 * subject at all. Both nulls read the same way here: not closed.
 */
export type ClosureAt = (id: string) => "open" | "closed" | null;

/** The relation a carrier writes at each criterion it demands — canon #7, in the carrier's own file. */
const HAS_CRITERION = "HAS_CRITERION";

/**
 * THE TYPES THAT CARRY CRITERIA, READ OFF THE GRAMMAR. The canon's table says
 * which source types may write `HAS_CRITERION` — a Requirement for a unit
 * verdict, a Scenario for an integration one — and this set is that column and
 * not a second spelling of it: a type the grammar lets carry criteria tomorrow
 * is a carrier here the same day.
 */
const CARRIER_TYPES: ReadonlySet<string> = new Set(
  EDGE_GRAMMAR.filter((row) => row.edgeType === HAS_CRITERION).map(
    (row) => row.fromType,
  ),
);

/** Whether this type is one the canon lets carry criteria — Requirement and Scenario today. */
export function isCriteriaCarrier(type: string): boolean {
  return CARRIER_TYPES.has(type);
}

/**
 * The criteria this carrier's own file demands: every `HAS_CRITERION` it
 * writes, by the id at the far end, each id once, in id order — dangling ones
 * included, for the reason the module doc gives.
 */
export function criteriaOf(carrier: SpecNode, context: ColorContext): string[] {
  const ids: string[] = [];
  for (const line of writtenEdgesOf(carrier, context)) {
    if (line.type === HAS_CRITERION && !ids.includes(line.toId)) {
      ids.push(line.toId);
    }
  }
  ids.sort(compare);
  return ids;
}

/**
 * The word for this carrier: `sat` when every criterion it demands is closed,
 * `unsat` when any is not, null when it demands none. Asked of a type that is
 * no carrier, it answers null too — there is nothing to roll up.
 */
export function satisfactionOf(
  carrier: SpecNode,
  context: ColorContext,
  closureAt: ClosureAt,
): Satisfaction | null {
  if (!isCriteriaCarrier(carrier.type)) {
    return null;
  }
  const criteria = criteriaOf(carrier, context);
  if (criteria.length === 0) {
    return null;
  }
  return criteria.every((id) => closureAt(id) === "closed") ? "sat" : "unsat";
}
