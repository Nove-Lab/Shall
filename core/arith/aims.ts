import { closureKindOf, compare, type SpecNode } from "../graph/index.js";
import { claimantsOf, type ClosureVerdict } from "./closure.js";
import type { ColorContext } from "./color.js";
import type { WorkItemState } from "./work-item-state.js";

/**
 * WHETHER ANYTHING IS STILL AIMED AT A CRITERION — pending, spent, or none.
 *
 * THREE WORDS, MUTUALLY EXCLUSIVE, AND EVERY OPEN CRITERION WEARS EXACTLY ONE.
 * Evidence reaches a criterion through the aim rule in `color.ts` and through
 * nothing else: a work log addressing a work item that TARGETS the criterion
 * is the one place a claim on it may be filed. So once every work item aiming
 * at a criterion is `done` and nothing is filed under it, no turn of work left
 * in the plan can produce evidence for it — the criterion is open, and there
 * is nowhere left for a verdict to be reached. That is `spent`, and saying it
 * out loud is what this module is for: a project once sat three turns with
 * thirteen criteria in that state and nothing computed said a word.
 *
 * THE QUEUE IS ASKED BEFORE THE PLAN IS. Living evidence with no standing
 * left-open word is the vitals' `awaiting-review`: a person still has to
 * answer it, so a verdict is ahead however finished the plan looks, and the
 * word is `pending`. Only when the evidence side has nothing ahead — nothing
 * claims it, or somebody has already said "not on these" — does the plan's
 * own half decide: `none` when no living work item aims at it, `spent` when
 * every one that does is done, `pending` while any of them is not.
 *
 * `none` IS NOT `spent`, AND NEITHER IS HEALTH RULE 7. All three say something
 * about a criterion nothing aims at; they are three different questions.
 * `spent` is an aim used up — a plan that looks finished and is not. `none` is
 * a criterion the plan never aimed at, narrowed here to the OPEN ones with
 * nothing filed under them, so it is rule 7's population and not rule 7's
 * answer: `criterion-without-work-item` is structural, counts a closed
 * criterion too, and does not move when somebody accepts a report — this word
 * does, on purpose, because the acceptance is exactly what spends the aim.
 *
 * NO COLOUR IS READ AND NO BOOK IS OPENED HERE. The closure verdict and the
 * work items' words arrive as the caller's own answers, the way `ColorAt` does
 * in `work-item-state.ts` — a review has just computed both, and computing
 * them again per criterion would walk the same chains once per criterion.
 *
 * PURE AND BROWSER-SAFE, like everything in `core/arith`.
 */

/** The one relation that aims work at a criterion — canon #22, the work item's own line. */
const TARGETS = "TARGETS";

/**
 * The word a work item wears, by id, as the caller already computed it — the
 * same bargain `ColorAt` makes next door. Null for an id nothing living
 * answers to and for a type that is no work item, which is the answer that
 * keeps a criterion `pending` rather than calling the plan finished on a
 * work item nobody can see.
 */
export type StateAt = (id: string) => WorkItemState | null;

/** The three words — the module's doc comment says what each one says. */
export type Aims = "pending" | "spent" | "none";

/**
 * The living work items whose own file draws a TARGETS line at this
 * criterion, in id order. It is the board's `reach` walk, spelled again here
 * because `review.ts` composes this module and the board reads a whole review
 * — the walk is twelve lines, and the import would run the wrong way.
 */
export function aimingWorkItemsOf(
  criterionId: string,
  context: ColorContext,
): SpecNode[] {
  const found: SpecNode[] = [];
  for (const edge of context.incoming.get(criterionId) ?? []) {
    if (edge.type !== TARGETS || !context.living.has(edge.fromId)) {
      continue;
    }
    const node = context.nodes.get(edge.fromId);
    if (node !== undefined && !found.includes(node)) {
      found.push(node);
    }
  }
  found.sort((a, b) => compare(a.id, b.id));
  return found;
}

/**
 * The word for this criterion, or null where the question does not apply — a
 * type that is no criterion, or one already closed. The clauses are asked in
 * the order the module's doc comment argues for, and the closure verdict is
 * the caller's, already computed for the `closure` and `leftOpen` fields.
 */
export function aimsOf(
  node: SpecNode,
  context: ColorContext,
  word: ClosureVerdict | null,
  stateAt: StateAt,
): Aims | null {
  if (closureKindOf(node.type)?.kind !== "criterion" || word?.kind === "closed") {
    return null;
  }
  // The vitals' `awaiting-review`, said as this word: something claims it and
  // nobody has judged the list, so the queue is where the verdict comes from.
  if (word?.kind !== "left-open" && claimantsOf(node.id, context).length > 0) {
    return "pending";
  }
  const aiming = aimingWorkItemsOf(node.id, context);
  if (aiming.length === 0) {
    return "none";
  }
  return aiming.every((workItem) => stateAt(workItem.id) === "done")
    ? "spent"
    : "pending";
}

/** "WI-0001", "WI-0001 and WI-0002", "WI-0001, WI-0002 and WI-0003". */
function listOf(ids: readonly string[]): string {
  if (ids.length <= 1) {
    return ids[0] ?? "";
  }
  return `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1] ?? ""}`;
}

/**
 * THE SPENT AIM AS ONE SENTENCE, from the criterion's side — the ids a person
 * would open, the rule that makes them the only ones, and the one move that
 * puts a verdict back ahead of it. There is no second point of view to write:
 * a work item somebody finished is not wrong, and nothing is drawn under it.
 * No command is named, the way `orphanFixSentence` names none: the sentence
 * is what is wrong and what would put it right, and which door is the
 * process's to say.
 */
export function spentSentence(
  criterionId: string,
  workItemIds: readonly string[],
): string {
  return `${criterionId} is open, and every work item aiming at it is done — ${listOf(workItemIds)}. Evidence is filed only under a work log addressing a work item that targets the criterion, so nothing left in the plan can reach a verdict on it. Aim a work item at it that can run its evaluation process.`;
}
