import {
  closureKindOf,
  compare,
  type NodeTypeName,
  type SpecNode,
} from "../graph/index.js";
import type { SpecGraph } from "../store/file-store.js";
import type { Ref } from "./board.js";
import { closureBundleIdOf } from "./bundles.js";
import { claimantsOf, closureAsks } from "./closure.js";
import {
  colorContextOf,
  writtenEdgesOf,
  type ColorContext,
  type Ledgers,
} from "./color.js";
import { reviewGraph, type ReviewStatus } from "./review.js";
import { criteriaOf } from "./satisfaction.js";
import { isClosableWorkItem, type WorkItemState } from "./work-item-state.js";

/**
 * THE VITALS: how far the specification has come, and what it still lacks. Two
 * groups, computed from the graph and the books on every read, stored nowhere.
 *
 * PROGRESS IS FOUR RATIOS, EACH A COUNT OF A WORD THE REVIEW ALREADY WROTE.
 * Scenario and Requirement satisfaction count the carriers wearing `sat`; AC
 * closure counts the criteria wearing `closed`; work item completion counts the
 * work items wearing `done`. Nothing here decides any of those words — the review
 * is run once and everything reads it, the way the board does — so the badge on
 * the Spec plane and the figure on the Vitals page cannot disagree: they are one
 * field. The denominators are the one place this module has a rule of its own:
 * a carrier that demands no criterion is UNSPECIFIED and stays out of the
 * satisfaction ratio — but its count is carried beside the ratio, never
 * hidden — and a work item's ratio is over EVERY work item, blocked ones
 * included, because a ratio over the ready ones alone would rise as the work
 * above them stalled.
 *
 * SPEC HEALTH IS THE RESIDUAL LAYER. Seven absences, each a graph fact — a
 * line not written, a chain not reaching — and each chosen so that it is
 * neither red nor yellow: not a grammar fault (the Fix Spec board's) and not a
 * judgement waiting (the Review Queue's), but a thing that is not wrong and not
 * waiting and still not done. The rules are exclusive at the RULE level and
 * inclusive at the NODE level: every living node of a rule's type is examined
 * whatever colour it wears, and the row carries no colour. A specification
 * still being drafted is yellow all over, and that is exactly when "a
 * requirement with no criterion" is worth saying; and a structural count that
 * moved when somebody approved a node would be a second place to disagree with
 * the queue.
 *
 * WHAT A FILE WROTE IS WHAT IT HAS; WHAT LIVES AND IS CLOSED IS WHAT IS MET.
 * A carrier whose `HAS_CRITERION` names a criterion no file answers to has
 * demanded a criterion — it is unsat, not unspecified, and not a row under
 * rule 1 — and the hole itself is said once, on the Fix Spec board. The same
 * reading holds for an actor's `PERFORMS`, a use case's `DETAILS` and a
 * module's `ALLOCATES`. Rule 5 walks through living nodes only, so a hole in
 * the chain leaves the goal above it unreached: that goal is listed here AND
 * the hole is on the Fix Spec board, two facts on two surfaces, and the overlap
 * is accepted rather than hidden.
 *
 * NO BODY IS READ. A scenario's kind and an actor's kind are headings inside
 * markdown bodies, which the graph does not read, so the rule the specification
 * first asked for — a use case with no MAIN scenario — is asked here as a use
 * case with no scenario at all. Two graphs that differ only in their bodies
 * have the same vitals, and a test holds them to it.
 *
 * NO SCORE. Four ratios and seven rows, each shown on its own; nothing here
 * adds them up, because one number over all of them would be a thing to game.
 *
 * PURE AND BROWSER-SAFE, like everything in `core/arith`.
 */

/** One row of the satisfaction kind: carriers of one type, sat over specified. */
export interface SatisfactionRow {
  kind: "scenario-satisfaction" | "requirement-satisfaction";
  type: "Scenario" | "Requirement";
  /** Carriers wearing `sat`. */
  numerator: number;
  /** Carriers demanding at least one criterion — `sat` and `unsat` together. */
  denominator: number;
  /** Carriers demanding none: out of the ratio, and said beside it. */
  unspecified: number;
  /** The `unsat` carriers, id order, each with how many criteria it demands and how many are not closed. */
  unsat: UnsatCarrier[];
}

export interface UnsatCarrier extends Ref {
  criteria: number;
  openCriteria: number;
}

/** The closure row: criteria closed over every living criterion. */
export interface ClosureRow {
  kind: "ac-closure";
  numerator: number;
  denominator: number;
  /** Every open criterion, id order, with why it is open. */
  open: OpenCriterion[];
}

/**
 * Why a criterion is open — exactly one of three, asked in this order: a
 * person's standing word left it open; nothing claims it; something claims it
 * and nobody has judged the list. `aims` is the plan's side of the same
 * question, and it is a different one: the reason says where the criterion
 * stands now, the aim word says whether anything is still coming.
 *
 * EVERY FIELD IS REQUIRED AND NULLABLE, for the reason the board gives — this
 * crosses the wire as JSON. `bundleId` names the Review Queue card the
 * criterion is waiting on, and it is set only when that card exists now: a
 * criterion whose claimants are not all agreed yet has evidence and no card,
 * and it says so by the null.
 */
export interface OpenCriterion extends Ref {
  reason: "no-evidence" | "awaiting-review" | "left-open";
  /**
   * Whether anything is still aimed at it — the review's own word, read back
   * and never recomputed, like every other figure on this page. Null never
   * arrives on this list: a living criterion the review left open always wears
   * one of the three. The wire's own type is kept rather than a narrowed copy,
   * because narrowing it would need a cast to build the row.
   */
  aims: ReviewStatus["aims"];
  /** Living evidence claiming it now. */
  evidence: number;
  bundleId: string | null;
  leftOpen: { by: string; at: string; rationale: string } | null;
}

/** The completion row: work items done over every work item, blocked ones included. */
export interface CompletionRow {
  kind: "work-item-completion";
  numerator: number;
  denominator: number;
  /**
   * Every work item not yet done, id order, each with the word it wears — the
   * same flat list the other rows keep, so the four drill-downs read alike.
   * The word is the review's own (`ready`, `blocked` or `in_review`, never
   * `done` here); what blocks a blocked one is not repeated on this surface —
   * the work item's own page and the board's ordering already answer that.
   */
  open: OpenWorkItem[];
}

export interface OpenWorkItem extends Ref {
  workItemState: Exclude<WorkItemState, "done">;
}

export interface Progress {
  scenarios: SatisfactionRow;
  requirements: SatisfactionRow;
  criteria: ClosureRow;
  workItems: CompletionRow;
}

export type HealthRuleId =
  | "requirement-without-criterion"
  | "scenario-without-criterion"
  | "actor-without-use-case"
  | "use-case-without-scenario"
  | "goal-without-responsibility"
  | "module-without-work-item"
  | "criterion-without-work-item";

/** One rule, always present — violated exactly when `nodes` is not empty. */
export interface HealthRule {
  id: HealthRuleId;
  /** The rule's place in the specification's own table, 1 to 7 — the order clean rows keep. */
  ordinal: number;
  subjectType: string;
  /** Living nodes of that type that were looked at — so "passed" can be told from "nothing to check". */
  examined: number;
  /** The violators, id order. */
  nodes: Ref[];
}

export interface Vitals {
  /** Nothing living and nothing refused: a folder with no specification in it yet. */
  empty: boolean;
  progress: Progress;
  /** Every rule, the violated ones first and the rest in the table's order. */
  health: HealthRule[];
}

/** The reference a row makes to a node it already holds. */
function refOf(node: SpecNode): Ref {
  return { id: node.id, shortName: node.shortName, name: node.name };
}

/** The far ends of one relation this node's own file writes, each once, id order. */
function writtenTargetsOf(
  node: SpecNode,
  type: string,
  context: ColorContext,
): string[] {
  const ids: string[] = [];
  for (const line of writtenEdgesOf(node, context)) {
    if (line.type === type && !ids.includes(line.toId)) {
      ids.push(line.toId);
    }
  }
  ids.sort(compare);
  return ids;
}

/** How many living files draw one relation at this node. */
function incomingCountOf(
  id: string,
  type: string,
  context: ColorContext,
): number {
  let count = 0;
  for (const edge of context.incoming.get(id) ?? []) {
    if (edge.type === type) {
      count += 1;
    }
  }
  return count;
}

/**
 * HOW A GOAL REACHES A RESPONSIBILITY — the specification's coverage chain,
 * `Goal —PURSUED_BY→ Actor —PERFORMS→ UseCase —DETAILS→ Scenario
 * —DERIVES_RESPONSIBILITY→ SystemResponsibility`, walked once for the whole
 * graph from the responsibilities UP rather than once per goal down: each row
 * names the one relation that reaches a node of that type from the node above
 * it, and the flood follows those relations' INCOMING ends. It is the Intent
 * half of the chain `work-item-state.ts` climbs, read from the other end.
 *
 * `Goal —REFINES→ Goal` IS IN THE TABLE on purpose: a parent goal is achieved
 * through its sub-goals — that is the sufficiency question the goal phase asks
 * out loud — so a parent that reaches a responsibility through a child has
 * reached one.
 */
const CLIMB: Readonly<Partial<Record<NodeTypeName, string>>> = {
  SystemResponsibility: "DERIVES_RESPONSIBILITY",
  Scenario: "DETAILS",
  UseCase: "PERFORMS",
  Actor: "PURSUED_BY",
  Goal: "REFINES",
};

/** Every living node from which some responsibility is reachable along the chain, the responsibilities included. */
function reachingResponsibilityIds(context: ColorContext): ReadonlySet<string> {
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const node of context.nodes.values()) {
    if (node.type === "SystemResponsibility") {
      seen.add(node.id);
      queue.push(node.id);
    }
  }
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) {
      continue;
    }
    const node = context.nodes.get(id);
    const climb = node === undefined ? undefined : CLIMB[node.type as NodeTypeName];
    if (climb === undefined) {
      continue;
    }
    for (const edge of context.incoming.get(id) ?? []) {
      if (edge.type !== climb || seen.has(edge.fromId)) {
        continue;
      }
      seen.add(edge.fromId);
      queue.push(edge.fromId);
    }
  }
  return seen;
}

/** The seven rules, in the specification's own order. */
interface RuleRow {
  readonly id: HealthRuleId;
  readonly ordinal: number;
  readonly subjectType: NodeTypeName;
  readonly violates: (
    node: SpecNode,
    context: ColorContext,
    reaching: ReadonlySet<string>,
  ) => boolean;
}

const RULES: readonly RuleRow[] = [
  {
    id: "requirement-without-criterion",
    ordinal: 1,
    subjectType: "Requirement",
    violates: (node, context) => criteriaOf(node, context).length === 0,
  },
  {
    id: "scenario-without-criterion",
    ordinal: 2,
    subjectType: "Scenario",
    violates: (node, context) => criteriaOf(node, context).length === 0,
  },
  {
    id: "actor-without-use-case",
    ordinal: 3,
    subjectType: "Actor",
    violates: (node, context) =>
      writtenTargetsOf(node, "PERFORMS", context).length === 0,
  },
  {
    id: "use-case-without-scenario",
    ordinal: 4,
    subjectType: "UseCase",
    violates: (node, context) =>
      writtenTargetsOf(node, "DETAILS", context).length === 0,
  },
  {
    id: "goal-without-responsibility",
    ordinal: 5,
    subjectType: "Goal",
    violates: (node, _context, reaching) => !reaching.has(node.id),
  },
  {
    id: "module-without-work-item",
    ordinal: 6,
    subjectType: "Module",
    violates: (node, context) =>
      writtenTargetsOf(node, "ALLOCATES", context).length === 0,
  },
  {
    id: "criterion-without-work-item",
    ordinal: 7,
    subjectType: "AcceptanceCriterion",
    violates: (node, context) => incomingCountOf(node.id, "TARGETS", context) === 0,
  },
];

function satisfactionRowOf(
  kind: SatisfactionRow["kind"],
  type: SatisfactionRow["type"],
  nodes: readonly SpecNode[],
  status: ReadonlyMap<string, ReviewStatus>,
  context: ColorContext,
): SatisfactionRow {
  let numerator = 0;
  let denominator = 0;
  let unspecified = 0;
  const unsat: UnsatCarrier[] = [];
  for (const node of nodes) {
    if (node.type !== type) {
      continue;
    }
    // THE REVIEW'S OWN WORD, read back rather than recomputed.
    const word = status.get(node.id)?.satisfaction ?? null;
    if (word === null) {
      unspecified += 1;
      continue;
    }
    denominator += 1;
    if (word === "sat") {
      numerator += 1;
      continue;
    }
    const criteria = criteriaOf(node, context);
    unsat.push({
      ...refOf(node),
      criteria: criteria.length,
      // Not closed: open, or nothing living under the id — the same reading
      // the roll-up took to call the carrier unsat.
      openCriteria: criteria.filter(
        (id) => status.get(id)?.closure !== "closed",
      ).length,
    });
  }
  return { kind, type, numerator, denominator, unspecified, unsat };
}

function closureRowOf(
  nodes: readonly SpecNode[],
  status: ReadonlyMap<string, ReviewStatus>,
  context: ColorContext,
): ClosureRow {
  let numerator = 0;
  let denominator = 0;
  const open: OpenCriterion[] = [];
  for (const node of nodes) {
    if (closureKindOf(node.type)?.kind !== "criterion") {
      continue;
    }
    const held = status.get(node.id);
    if (held === undefined) {
      continue;
    }
    denominator += 1;
    if (held.closure === "closed") {
      numerator += 1;
      continue;
    }
    const evidence = claimantsOf(node.id, context).length;
    if (held.leftOpen !== null) {
      open.push({
        ...refOf(node),
        reason: "left-open",
        aims: held.aims,
        evidence,
        bundleId: null,
        leftOpen: held.leftOpen,
      });
    } else if (evidence === 0) {
      open.push({
        ...refOf(node),
        reason: "no-evidence",
        aims: held.aims,
        evidence,
        bundleId: null,
        leftOpen: null,
      });
    } else {
      open.push({
        ...refOf(node),
        reason: "awaiting-review",
        aims: held.aims,
        evidence,
        // The card exists exactly when the queue would cut one — the same
        // question `bundles.ts` asks before building it.
        bundleId: closureAsks(node, context)
          ? closureBundleIdOf(node.type, node.id)
          : null,
        leftOpen: null,
      });
    }
  }
  return { kind: "ac-closure", numerator, denominator, open };
}

function completionRowOf(
  nodes: readonly SpecNode[],
  status: ReadonlyMap<string, ReviewStatus>,
): CompletionRow {
  let numerator = 0;
  let denominator = 0;
  const open: OpenWorkItem[] = [];
  for (const node of nodes) {
    if (!isClosableWorkItem(node.type)) {
      continue;
    }
    const word = status.get(node.id)?.workItemState ?? null;
    if (word === null) {
      continue;
    }
    denominator += 1;
    if (word === "done") {
      numerator += 1;
    } else {
      open.push({ ...refOf(node), workItemState: word });
    }
  }
  return { kind: "work-item-completion", numerator, denominator, open };
}

/**
 * The vitals, whole.
 *
 * THE REVIEW IS RUN ONCE AND EVERYTHING READS IT — colours, closure marks,
 * the work items' words and the carriers' words all come out of that one pass,
 * the way the board reads them; what this module adds is counting, the three
 * reasons a criterion is open, the work not yet done, and the seven rows.
 */
export function vitalsOf(graph: SpecGraph, ledgers: Ledgers): Vitals {
  const context = colorContextOf(graph, ledgers);
  const review = reviewGraph(graph, ledgers, context);
  const status = new Map<string, ReviewStatus>();
  for (const held of review.statuses) {
    status.set(held.id, held);
  }
  const nodes = [...graph.nodes].sort((a, b) => compare(a.id, b.id));

  const progress: Progress = {
    scenarios: satisfactionRowOf(
      "scenario-satisfaction",
      "Scenario",
      nodes,
      status,
      context,
    ),
    requirements: satisfactionRowOf(
      "requirement-satisfaction",
      "Requirement",
      nodes,
      status,
      context,
    ),
    criteria: closureRowOf(nodes, status, context),
    workItems: completionRowOf(nodes, status),
  };

  const reaching = reachingResponsibilityIds(context);
  const health: HealthRule[] = RULES.map((rule) => {
    let examined = 0;
    const violators: Ref[] = [];
    for (const node of nodes) {
      if (node.type !== rule.subjectType) {
        continue;
      }
      examined += 1;
      if (rule.violates(node, context, reaching)) {
        violators.push(refOf(node));
      }
    }
    return {
      id: rule.id,
      ordinal: rule.ordinal,
      subjectType: rule.subjectType,
      examined,
      nodes: violators,
    };
  });
  // Violated first, so a person reading down meets what there is to do before
  // what is clean; the table's own order inside each half.
  health.sort(
    (a, b) =>
      Number(b.nodes.length > 0) - Number(a.nodes.length > 0) ||
      a.ordinal - b.ordinal,
  );

  return {
    empty: graph.nodes.length === 0 && graph.refused.length === 0,
    progress,
    health,
  };
}
