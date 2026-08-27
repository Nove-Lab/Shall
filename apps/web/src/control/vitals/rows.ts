import type { api } from "../../api";
import { countWord } from "../parts";

/**
 * THE VITALS' ROW VOCABULARY, importable without the page: the glance on the
 * overview and the panel both read these, so the four ratios on the card and
 * the four rows on the page are the same numbers said the same way. The queue's
 * `review-queue/rows.ts`, the board's `work-board/rows.ts` and the feed's
 * `activity-feed/rows.ts` are the same shape next door.
 *
 * NOTHING HERE COMPUTES A VERDICT OF ITS OWN. Every count, every reason a
 * criterion is open, every open work item's word, and the order of
 * the seven rules arrive from `core/arith/vitals.ts` through the daemon; this
 * file turns them into words, picks the fixed order the specification gives
 * the four rows, and holds the labels and the one-line hints as `Record`s over
 * the wire unions — so a rule added or dropped in core is a compile error here
 * and not a row with no name.
 *
 * EVERY TYPE HERE IS DERIVED FROM THE CLIENT AND NONE IS WRITTEN OUT — the
 * `spec/review.ts` rule — and EVERY IMPORT IS RELATIVE, the `spec/view/*`
 * bargain: this file is run by `node --import tsx` in the test, and tsx does
 * not resolve `@/`.
 */

export type Vitals = Awaited<ReturnType<typeof api.spec.vitals.query>>;
export type HealthRule = Vitals["health"][number];
export type RuleId = HealthRule["id"];
export type OpenCriterion = Vitals["progress"]["criteria"]["open"][number];
export type OpenReason = OpenCriterion["reason"];
/** Pending, spent or none — what is still aimed at an open criterion, the review's own word. */
export type Aims = NonNullable<OpenCriterion["aims"]>;
export type OpenWorkItem = Vitals["progress"]["workItems"]["open"][number];

/** The four rows of Progress, in the specification's own order — the spec read downward. */
export type ProgressKey = "scenarios" | "requirements" | "criteria" | "work-items";

export interface ProgressRow {
  key: ProgressKey;
  /** The full name, for the page. */
  label: string;
  /** The short one, for the card. */
  short: string;
  numerator: number;
  denominator: number;
  /** What the ratio leaves out, said beside it — or null when there is nothing to say. */
  note: string | null;
}

/**
 * THE FOUR ROWS, IN ONE FIXED ORDER: scenarios, then requirements, then
 * criteria, then work items. The order is the specification's and not the
 * wire's — the wire's `progress` is an object, and an object's key order is
 * not a contract — so it is spelled here once and both surfaces read it.
 *
 * THE NOTE SAYS WHAT THE DENOMINATOR LEFT OUT, and only that. A satisfaction
 * ratio is over the carriers that demand a criterion, and the ones that demand
 * none are said beside it rather than hidden. The work item ratio leaves
 * nothing out — every work item is in it, blocked ones included — so its row
 * carries no note: how many are blocked is the drill-down's answer, one word
 * per row.
 */
export function progressRows(vitals: Vitals): ProgressRow[] {
  const { scenarios, requirements, criteria, workItems } = vitals.progress;
  return [
    {
      key: "scenarios",
      label: "Scenario Satisfaction",
      short: "Scenario",
      numerator: scenarios.numerator,
      denominator: scenarios.denominator,
      note:
        scenarios.unspecified > 0
          ? `${String(scenarios.unspecified)} unspecified`
          : null,
    },
    {
      key: "requirements",
      label: "Requirement Satisfaction",
      short: "Requirement",
      numerator: requirements.numerator,
      denominator: requirements.denominator,
      note:
        requirements.unspecified > 0
          ? `${String(requirements.unspecified)} unspecified`
          : null,
    },
    {
      key: "criteria",
      label: "AcceptanceCriterion Closure",
      short: "AcceptanceCriterion",
      numerator: criteria.numerator,
      denominator: criteria.denominator,
      note: null,
    },
    {
      key: "work-items",
      label: "WorkItem Completion",
      short: "WorkItem",
      numerator: workItems.numerator,
      denominator: workItems.denominator,
      note: null,
    },
  ];
}

/** "7/9" — the ratio as the two counts it is, never a percentage in words. */
export function ratioText(numerator: number, denominator: number): string {
  return `${String(numerator)}/${String(denominator)}`;
}

/**
 * The bar's length, 0 to 100. Nothing over nothing is an empty bar and not a
 * division: a row with no denominator is kept on the page at nought.
 */
export function percent(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((100 * numerator) / denominator)));
}

/** What each rule is called, exhaustive over the wire's own union. */
export const RULE_LABEL: Record<RuleId, string> = {
  "requirement-without-criterion": "Requirements without a criterion",
  "scenario-without-criterion": "Scenarios without a criterion",
  "actor-without-use-case": "Actors without a use case",
  "use-case-without-scenario": "Use cases without a scenario",
  "goal-without-responsibility": "Goals reaching no responsibility",
  "module-without-work-item": "Modules without a work item",
  "criterion-without-work-item": "Criteria no work item targets",
};

/**
 * The one line under a violated rule's nodes that says which process resolves
 * it — the specification's job down to the criteria, the plan's from the
 * module down.
 */
export const RULE_HINT: Record<RuleId, string> = {
  "requirement-without-criterion":
    "Derive acceptance criteria for these requirements with /shall.specify.",
  "scenario-without-criterion":
    "Derive acceptance criteria for these scenarios with /shall.specify.",
  "actor-without-use-case":
    "Give each of these actors a use case with /shall.specify.",
  "use-case-without-scenario":
    "Write each of these use cases' scenarios with /shall.specify.",
  "goal-without-responsibility":
    "A goal reaches a responsibility through an actor, a use case and a scenario — continue with /shall.specify.",
  "module-without-work-item":
    "Cut work items for these modules with /shall.plan.",
  "criterion-without-work-item":
    "Aim a work item at these criteria with /shall.plan.",
};

/** Whether a rule stands violated: exactly when it names a node. */
export function isViolated(rule: HealthRule): boolean {
  return rule.nodes.length > 0;
}

/** How many of the rules stand violated. */
export function violatedCount(vitals: Vitals): number {
  return vitals.health.filter(isViolated).length;
}

/**
 * The one line the card says about Spec Health: how many rules are violated,
 * or — at nought — that every check ran and found nothing, said so a clean
 * page reads as checked rather than as blank.
 */
export function healthLine(vitals: Vitals): string {
  const violated = violatedCount(vitals);
  if (violated === 0) {
    return `All ${String(vitals.health.length)} checks passed`;
  }
  return `${countWord(violated, "rule")} violated`;
}

/** The three reasons a criterion is open, in the order the page lists them. */
export const OPEN_REASONS: readonly OpenReason[] = [
  "no-evidence",
  "awaiting-review",
  "left-open",
];

export const OPEN_REASON_LABEL: Record<OpenReason, string> = {
  "no-evidence": "No evidence",
  "awaiting-review": "Awaiting review",
  "left-open": "Left open",
};

/**
 * The three aim words in a person's, exhaustive over the wire's own union — so
 * a fourth word in core is a compile error here and not a row with no label.
 */
export const AIMS_LABEL: Record<Aims, string> = {
  pending: "work still aimed at it",
  spent: "no work item left to judge it",
  none: "no work item targets it",
};

/**
 * What to say beside an open criterion about its aim, or nothing. `pending` is
 * the ordinary case — a verdict is still ahead — and a note under every row
 * would say nothing, so only the two that mean "nothing is coming" speak.
 */
export function aimsNoteOf(open: OpenCriterion): string | null {
  return open.aims === null || open.aims === "pending"
    ? null
    : AIMS_LABEL[open.aims];
}

/** The open criteria grouped by reason — every reason a key, empty or not, each group in the wire's order. */
export function openByReason(
  vitals: Vitals,
): Record<OpenReason, OpenCriterion[]> {
  const groups: Record<OpenReason, OpenCriterion[]> = {
    "no-evidence": [],
    "awaiting-review": [],
    "left-open": [],
  };
  for (const open of vitals.progress.criteria.open) {
    groups[open.reason].push(open);
  }
  return groups;
}

/** Whether there is nothing to measure yet — core's own word for it. */
export function isEmptySpec(vitals: Vitals): boolean {
  return vitals.empty;
}
