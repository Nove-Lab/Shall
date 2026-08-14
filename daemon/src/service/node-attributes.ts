import { judgeAttributes, judgeText } from "@shall/core/graph";
import { invalid } from "./errors.js";

/**
 * The write doors' half of the judgement: the sentences live in
 * `core/graph/validate.ts`, where the loader can reach them too, and this turns
 * the first of them into a refusal.
 *
 * THE RULES ARE NOT HERE ON PURPOSE. A file a person hand-edited has to be told
 * everything wrong with it at once, so core collects problems rather than
 * throwing; a door has one caller waiting on one answer, so it throws the first.
 * Same order, same sentences, two shapes — and `problems[0]` is the contract
 * that keeps the door's voice identical to what it was when the rules lived
 * here.
 */

/** @see judgeText — the trim, the NUL, the lone surrogate, and why emptiness is not judged. */
export function trimmedText(label: string, value: string): string {
  const { value: trimmed, problem } = judgeText(label, value);
  if (problem !== null) {
    throw invalid(problem);
  }
  return trimmed;
}

/** @see judgeAttributes — the whole roster, the order the checks run in, and which names each sentence uses. */
export function validateAttributes(
  nodeType: string,
  raw: Record<string, string>,
): Record<string, string> {
  const { values, problems } = judgeAttributes(nodeType, raw);
  // Indexed rather than length-tested because `noUncheckedIndexedAccess` makes
  // the first element's existence the thing to check, and it is the same check.
  const [first] = problems;
  if (first !== undefined) {
    throw invalid(first);
  }
  return values;
}
