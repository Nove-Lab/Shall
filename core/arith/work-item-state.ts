import {
  closureKindOf,
  compare,
  type NodeTypeName,
  type SpecNode,
} from "../graph/index.js";
import { claimantsOf, closureOf, closureVerdictOf } from "./closure.js";
import type { ColorContext } from "./color.js";

/**
 * WHETHER A WORK ITEM CAN BE PICKED UP — blocked, ready, in review, or done.
 *
 * FOUR WORDS, MUTUALLY EXCLUSIVE, AND EVERY WORK ITEM HAS EXACTLY ONE. `done` is
 * the closure axis: a person said the completion reports claiming this work item
 * satisfy it. `in_review` is the stretch between a report and that word: somebody
 * has called the work finished and nobody has judged it yet, so a second turn
 * picking it up would build the same thing twice — the board keeps it off the
 * Implement column for exactly that reason. `ready` is everything the column
 * asks for — nothing above it is unread or refused, and everything it waits on
 * is finished. `blocked` is the rest, which is not a defect and not a warning:
 * it is simply a work item whose turn has not come.
 *
 * WHAT ENDS A REVIEW WITHOUT ENDING THE WORK: a report a person REFUSED is red
 * and claims nothing here, and a list a person LEFT OPEN is a judgment already
 * made — both send the work item back to `ready`, because both say more work is
 * owed. A work log alone never puts a work item in review: a log is how the work
 * was done, not a claim that it is finished, so a turn that stopped part-way
 * leaves the item ready for the next one to carry on.
 *
 * IT IS ONE PREDICATE SET WITH TWO READERS, WHICH IS WHY IT IS ITS OWN MODULE.
 * The board (`board.ts`) lists the ready ones; the review (`review.ts`) puts
 * the word on every work item so the Spec plane can draw a badge beside its id. If
 * either of them re-derived it, the badge and the board could disagree — and
 * the badge is checked against the board by a test for exactly that reason.
 * `review.ts` cannot import `board.ts` (the board reads a whole review), so the
 * predicates live below both of them.
 *
 * THE COLOUR ARRIVES AS A FUNCTION. Whoever asks has usually just coloured the
 * whole graph, and colouring the chain again per work item would be a second pass
 * over the same nodes; `ColorAt` lets the caller hand over the answers it has.
 *
 * PURE AND BROWSER-SAFE like the rest of `core/arith`: an indexed graph, the
 * books inside it, and the same inputs always give the same word.
 */

/** The colour of a node by id, as the caller already computed it. */
export type ColorAt = (id: string) => "red" | "yellow" | "green" | null;

/** The one relation a work item waits on — canon #15, written in the work item's own file. */
const DEPENDS_ON = "DEPENDS_ON";

/** The relation that puts work under a work item — canon #23, the log's own line. */
const ADDRESSES = "ADDRESSES";

/**
 * HOW THE CHAIN ABOVE A WORK ITEM IS WALKED — one row per type, and every hop is a
 * relation the canon already has.
 *
 * `in` IS THE ORDINARY DIRECTION UP. Almost every relation in the canon points
 * from the container to the contained, so the parent is the SOURCE of an
 * incoming edge: a work item's module is what ALLOCATES it, a module's
 * responsibility is what IS_REALIZED_BY it, and a goal's parent goal is what
 * REFINES it. That last one is worth naming because it is easy to get backwards:
 * `ANCHOR_RULES` gives `Goal` no anchor, so REFINES is not one of the canon's
 * out-anchors, and `specChildrenOf` in `bundles.ts` already walks an outgoing
 * REFINES DOWNWARD into sub-goals. This table is that walk's inverse on that
 * edge, deliberately.
 *
 * `out` MEANS TWO DIFFERENT THINGS HERE, both on purpose:
 *   · the lower node's OWN anchor line, which points at its parent — a work item's
 *     `TARGETS` is the one such hop in this table; and
 *   · a deliberate one-step descent into the detail hanging off the chain —
 *     a responsibility's requirements, a requirement's criteria and
 *     constraints, a scenario's criteria. The user's gate asks for those: a
 *     yellow criterion under the requirement this work item serves is a criterion
 *     nobody has read, and starting work under it is work thrown away. They
 *     terminate at criteria and constraints, whose own rows go no further down.
 *
 * WHAT IS NOT IN THE TABLE IS NOT IN THE CHAIN, and that is the local gate the
 * spec asks for: interfaces, data schemas, satellites, work logs, findings,
 * terms and the module's OTHER work items are all absent, so an unrelated part of
 * the graph being yellow cannot hide this work item.
 */
const UPWARD: Partial<
  Record<NodeTypeName, readonly { dir: "in" | "out"; edge: string }[]>
> = {
  WorkItem: [
    { dir: "in", edge: "ALLOCATES" },
    { dir: "out", edge: "TARGETS" },
  ],
  Module: [{ dir: "in", edge: "IS_REALIZED_BY" }],
  SystemResponsibility: [
    { dir: "in", edge: "DERIVES_RESPONSIBILITY" },
    { dir: "out", edge: "REQUIRES" },
  ],
  Scenario: [
    { dir: "in", edge: "DETAILS" },
    { dir: "out", edge: "HAS_CRITERION" },
  ],
  UseCase: [{ dir: "in", edge: "PERFORMS" }],
  Actor: [{ dir: "in", edge: "PURSUED_BY" }],
  Goal: [{ dir: "in", edge: "REFINES" }],
  Requirement: [
    { dir: "in", edge: "REQUIRES" },
    { dir: "out", edge: "HAS_CRITERION" },
    { dir: "out", edge: "HAS_CONSTRAINT" },
  ],
  AcceptanceCriterion: [{ dir: "in", edge: "HAS_CRITERION" }],
  Constraint: [],
};

/**
 * Whether a person has said this work item is done — the closure axis, asked of the
 * work item rather than of a criterion.
 */
export function isCompleted(workItem: SpecNode, context: ColorContext): boolean {
  return closureOf(workItem, context) === "closed";
}

/**
 * Whether somebody has called this work item finished and nobody has answered
 * yet — a completion report claiming it that is not refused, and no standing
 * word from a person over the list.
 */
export function isInReview(
  workItem: SpecNode,
  context: ColorContext,
  colorAt: ColorAt,
): boolean {
  if (closureVerdictOf(workItem, context)?.kind === "left-open") {
    return false;
  }
  return claimantsOf(workItem.id, context).some(
    (claimant) => colorAt(claimant.id) !== "red",
  );
}

/**
 * The work items this one waits on: every `DEPENDS_ON` its own file draws, in id
 * order, DANGLING ONES INCLUDED. A prerequisite no file answers to is a hole in
 * the spec, and the hole is what `prerequisitesMet` refuses on.
 */
export function prerequisitesOf(
  workItemId: string,
  context: ColorContext,
): string[] {
  const ids: string[] = [];
  for (const edge of context.outgoing.get(workItemId) ?? []) {
    if (edge.type === DEPENDS_ON && !ids.includes(edge.toId)) {
      ids.push(edge.toId);
    }
  }
  ids.sort(compare);
  return ids;
}

/**
 * Whether everything this work item waits on is finished — every prerequisite living
 * and closed. A dangling prerequisite blocks: the id names work nobody can show
 * is done, and the board says so in its Fix Spec half rather than pretending
 * here.
 */
export function prerequisitesMet(
  workItem: SpecNode,
  context: ColorContext,
): boolean {
  return prerequisitesOf(workItem.id, context).every((id) => {
    const held = context.nodes.get(id);
    return held !== undefined && isCompleted(held, context);
  });
}

/**
 * Every node the chain above this work item passes through, THE WORK ITEM ITSELF
 * INCLUDED, in id order.
 *
 * A DANGLING FAR END IS IN THE LIST AND IS NOT EXPANDED. The edge says somebody
 * expects a node there; nothing living answers, so the chain cannot be green
 * and the walk has nowhere to go from it. Both facts are true at once and this
 * is how they are both kept.
 *
 * THE WORK ITEM IS IN ITS OWN CHAIN because a work item nobody has read, or one a person
 * has refused, is not work to hand an agent either.
 */
export function upwardChainOf(
  workItem: SpecNode,
  context: ColorContext,
): string[] {
  const seen = new Set<string>([workItem.id]);
  const queue: string[] = [workItem.id];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) {
      continue;
    }
    const node = context.nodes.get(id);
    if (node === undefined) {
      // A far end nothing living answers to: counted, never walked through.
      continue;
    }
    for (const hop of UPWARD[node.type as NodeTypeName] ?? []) {
      const edges =
        hop.dir === "in"
          ? context.incoming.get(id) ?? []
          : context.outgoing.get(id) ?? [];
      for (const edge of edges) {
        if (edge.type !== hop.edge) {
          continue;
        }
        const next = hop.dir === "in" ? edge.fromId : edge.toId;
        if (seen.has(next)) {
          continue;
        }
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return [...seen].sort(compare);
}

/** Whether every node in that chain is green — a hole or a refusal is not. */
export function chainGreen(
  workItem: SpecNode,
  context: ColorContext,
  colorAt: ColorAt,
): boolean {
  return upwardChainOf(workItem, context).every((id) => colorAt(id) === "green");
}

/** The word a work item wears — see the module's doc comment for the four. */
export type WorkItemState = "blocked" | "ready" | "in_review" | "done";

/**
 * The word for this work item: `done`, `blocked`, `in_review`, or `ready`.
 * Exactly one, always, asked in that order — a closed item is done whatever
 * else is true of it; an item whose turn has not come is blocked whatever has
 * been claimed about it, because `blocked` is the word the premature rule
 * reads and a log under an unread chain is early whether or not a report
 * followed it; and only a startable item can be in review, which is what keeps
 * `in_review` a fact about the board's own list.
 */
export function workItemStateOf(
  workItem: SpecNode,
  context: ColorContext,
  colorAt: ColorAt,
): WorkItemState {
  if (isCompleted(workItem, context)) {
    return "done";
  }
  if (!prerequisitesMet(workItem, context) || !chainGreen(workItem, context, colorAt)) {
    return "blocked";
  }
  return isInReview(workItem, context, colorAt) ? "in_review" : "ready";
}

/**
 * How deep in the prerequisite graph this work item sits: 0 with nothing before it,
 * otherwise one more than the deepest thing it waits on.
 *
 * A CYCLE TERMINATES AND DOES NOT HANG. `DEPENDS_ON` is acyclic by rule and the
 * loader still does not refuse a loop — every work item on one is red (`cyclic`, in
 * `seams.ts`) rather than rejected at the door, so a loop reaches this
 * walk. It carries the ids it is currently inside and DROPS a prerequisite
 * already on its own path: the
 * loop stops counting itself, and the number that comes back is the depth of
 * the acyclic part. Nothing is memoised across that guard — a cached answer
 * taken while a cycle was open would be a wrong number for a work item outside the
 * cycle later. The order this feeds is a reading order and not a schedule, so a
 * cyclic pair sorting beside each other is the honest answer to a graph that
 * cannot say which of the two comes first. Neither of them is on the Implement
 * list to be ordered anyway: the loop turned them red first.
 */
export function depthOf(workItemId: string, context: ColorContext): number {
  const settled = new Map<string, number>();

  function walk(id: string, inside: ReadonlySet<string>): number {
    if (inside.has(id)) {
      return 0;
    }
    const held = settled.get(id);
    if (held !== undefined) {
      return held;
    }
    const within = new Set(inside).add(id);
    let deepest = 0;
    let cyclic = false;
    for (const prerequisite of prerequisitesOf(id, context)) {
      if (!context.nodes.has(prerequisite)) {
        // A hole is not a depth. It blocks the work item elsewhere; here it counts
        // as nothing rather than as an unknown number.
        continue;
      }
      if (within.has(prerequisite)) {
        cyclic = true;
        continue;
      }
      deepest = Math.max(deepest, walk(prerequisite, within) + 1);
    }
    if (!cyclic) {
      settled.set(id, deepest);
    }
    return deepest;
  }

  return walk(workItemId, new Set());
}

/** Whether this type is a work item at all — the one lookup the board and review share. */
export function isClosableWorkItem(type: string): boolean {
  return closureKindOf(type)?.kind === "workItem";
}

/**
 * THE BLOCKED WORK ITEM THIS WORK LOG ADDRESSES, or null — the one red that reads
 * other nodes' judgements.
 *
 * WORK IS LOGGED ONLY UNDER A WORK ITEM WHOSE TURN HAS COME. `blocked` is the
 * board's own word — unfinished, and either its chain is unread or something
 * it waits on is open — and a work log registered against such a work item is not
 * early news but a rule broken: the board exists so that work starts where
 * the plan says it may, and a log under a blocked work item is work the plan
 * cannot yet account for.
 *
 * IT CANNOT BE A CLAUSE OF `colorOf`, and that is why it lives here: the base
 * chain answers a node from what the files SAY — its own lines, the lines
 * around it, and the books — and this question
 * reads the ADDRESSED work item's state, which reads the colours of the chain
 * above that work item. `reviewGraph` asks it after the base chain, only of a node
 * the chain left unred — so every deeper red keeps its own sentence, and every
 * surface that reads statuses sees this one. Nothing else asks a WorkLog's
 * colour directly, which is the fact that keeps the two-step honest.
 *
 * The first blocked work item in edge order is named; fixing it surfaces the next.
 * A dangling ADDRESSES is not asked about — the missing rule owns the hole.
 */
export function prematureAddressOf(
  workLog: SpecNode,
  context: ColorContext,
  colorAt: ColorAt,
): string | null {
  if (workLog.type !== "WorkLog") {
    return null;
  }
  for (const edge of context.outgoing.get(workLog.id) ?? []) {
    if (edge.type !== ADDRESSES) {
      continue;
    }
    const workItem = context.nodes.get(edge.toId);
    if (workItem === undefined || !isClosableWorkItem(workItem.type)) {
      continue;
    }
    if (workItemStateOf(workItem, context, colorAt) === "blocked") {
      return workItem.id;
    }
  }
  return null;
}

/**
 * The breach as one sentence — the rule and both ids, with no instruction
 * tail, so the doors and the board can each add their own.
 */
export function prematureSentence(workLogId: string, workItemId: string): string {
  return `${workLogId} addresses ${workItemId}, and ${workItemId} is blocked — work is logged only under a work item whose turn has come: its chain read and agreed, and everything it waits on finished.`;
}
