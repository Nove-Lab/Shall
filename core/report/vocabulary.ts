import type { HealthRule, HealthRuleId, OpenCriterion, ReviewStatus } from "../arith/index.js";
import type { Badge } from "./model.js";

/**
 * THE ONE PLACE THE REPORT'S WORDS LIVE. The reader is a manager who has never
 * opened Shall, so the internal vocabulary — red, yellow, green, sat, unsat —
 * never reaches the page: every computed state crosses into plain words here,
 * and a test holds the emitted bytes to it. A chapter that wants a status
 * word asks this module; one that spelled its own would be the second home
 * this file exists to prevent.
 *
 * TONES ARE ROLES, NOT COLOURS. "attention" is a stylesheet decision; the
 * label beside it is what carries the meaning, so every state reads with no
 * legend and survives a grayscale print.
 */

/** The registration axis — what the approval ledger says of any node. */
export function registrationOf(status: ReviewStatus): Badge {
  switch (status.color) {
    case "green":
      return { label: "Approved", tone: "good" };
    case "yellow":
      return { label: "Awaiting review", tone: "pending" };
    case "red":
      return { label: "Needs attention", tone: "attention" };
  }
}

/** The satisfaction axis of an acceptance criterion. */
export function criterionOf(status: ReviewStatus): Badge | null {
  switch (status.closure) {
    case "closed":
      return { label: "Met", tone: "good" };
    case "open":
      return { label: "Open", tone: "pending" };
    case null:
      return null;
  }
}

/**
 * The satisfaction axis of a Requirement or Scenario. `null` satisfaction IS
 * the carrier that demands no criterion — `satisfactionOf` answers null for
 * exactly that — so "No criteria yet" needs no second count of edges.
 */
export function carrierOf(status: ReviewStatus): Badge {
  switch (status.satisfaction) {
    case "sat":
      return { label: "Satisfied", tone: "good" };
    case "unsat":
      return { label: "Not yet satisfied", tone: "pending" };
    case null:
      return { label: "No criteria yet", tone: "neutral" };
  }
}

/** The work axis of a WorkItem. */
export function workOf(status: ReviewStatus): Badge | null {
  switch (status.workItemState) {
    case "done":
      return { label: "Done", tone: "good" };
    case "ready":
      return { label: "Ready", tone: "pending" };
    case "in_review":
      return { label: "In review", tone: "pending" };
    case "blocked":
      return { label: "Blocked", tone: "attention" };
    case null:
      return null;
  }
}

/** Why an open criterion is open, in the vitals' own three cases. */
export function openReasonOf(reason: OpenCriterion["reason"]): string {
  switch (reason) {
    case "no-evidence":
      return "No evidence yet";
    case "awaiting-review":
      return "Awaiting review";
    case "left-open":
      return "Left open";
  }
}

/** The seven coverage checks, named for a reader who never saw the rules. */
export function healthRuleLabelOf(id: HealthRuleId): string {
  switch (id) {
    case "requirement-without-criterion":
      return "Requirements without acceptance criteria";
    case "scenario-without-criterion":
      return "Scenarios without acceptance criteria";
    case "actor-without-use-case":
      return "Actors without a use case";
    case "use-case-without-scenario":
      return "Use cases without a scenario";
    case "goal-without-responsibility":
      return "Goals no responsibility answers to";
    case "module-without-work-item":
      return "Modules without a work item";
    case "criterion-without-work-item":
      return "Criteria no work item targets";
  }
}

/**
 * The stamp's health clause — a rule passes when it names no node. The total
 * is whatever the vitals sent, so a new rule upstream changes the sentence
 * without a count here going stale.
 */
export function healthSummaryOf(health: readonly HealthRule[]): string {
  const passing = health.filter((rule) => rule.nodes.length === 0).length;
  return `${passing} of ${health.length} coverage checks pass`;
}
