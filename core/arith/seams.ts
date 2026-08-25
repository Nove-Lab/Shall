import { compare } from "../graph/index.js";
import type { SpecGraph } from "../store/file-store.js";
import type { ColorContext, ColorSubject } from "./color.js";

/**
 * A LOOP IN THE WRITTEN ORDER — work that waits on itself, two modules neither
 * of which can be built without the other, or a goal refined through others
 * back into itself.
 *
 * WHY IT IS A COLOUR AND NOT A WARNING. `DEPENDS_ON` is what the board computes
 * readiness from: a work item is ready when everything it waits on is finished, so
 * every work item on a loop is waiting on something that is waiting on it, and NONE
 * OF THEM CAN EVER BE CALLED READY. The old comment in `work-item-state.ts` said the
 * walk "terminates and does not hang" on a cycle, which is true and was never
 * the whole answer — the walk survived, and the plan quietly held work nobody
 * could start. Two modules that consume each other's contracts are the same
 * fact one layer up: neither can be built, read or replaced on its own, which
 * is the entire promise a module boundary makes.
 *
 * IT IS GRAMMAR AND NOT JUDGEMENT, like the anchor rule and the aim rule. It is
 * read off what the files say, before any book is opened, and a person cannot
 * approve over it — approving one node of a loop would be agreeing to an order
 * that has no beginning.
 *
 * ONE PASS PER GRAPH, NOT ONE WALK PER NODE. `colorContextOf` runs this once
 * and every colour question then reads a map. A per-node walk would be quadratic
 * over a graph that is re-read on every keystroke in the panel.
 *
 * THE THIRD GRAPH IS THE INTENT'S OWN. `REFINES` is a decomposition — a goal
 * refined into the sub-goals that achieve it — so a loop of them is a
 * decomposition with no top: every goal on it is achieved through itself, and
 * the sufficiency question the goal phase asks out loud has no place to start.
 * It was an open question while this module was the plan's alone; taking it is
 * why the module is named for the seams and not for one plane.
 *
 * WHAT IT DELIBERATELY DOES NOT CATCH. `CONFLICTS_WITH` runs both ways between
 * two requirements by design — it says they disagree, not that one comes first —
 * so it is not an order and cannot be circular. `RELATES_TO` between domain
 * entities is a description of the world and not a precedence either.
 *
 * PURE AND BROWSER-SAFE, like everything else in `core/arith`.
 */

/** The one relation that says a thing comes after another — canon #9 and #15. */
const DEPENDS_ON = "DEPENDS_ON";

/** How a module publishes a contract, and how another calls it — canon #11, #12. */
const EXPOSES = "EXPOSES";
const CONSUMES = "CONSUMES";

/** How a goal is decomposed into the sub-goals that achieve it — canon #1. */
const REFINES = "REFINES";

/**
 * One step of a module loop: who calls, through which contract, and who
 * publishes it.
 *
 * THE CONTRACT IS IN THE STEP because it is the line that gets removed. There
 * is no relation between two modules in the canon — a module depends on another
 * by consuming what that one exposes — so a sentence naming only the two
 * modules would leave a person hunting through two files for the line to cut.
 */
export interface ModuleHop {
  readonly from: string;
  readonly via: string;
  readonly to: string;
}

/**
 * The loop one node stands on, said from that node.
 *
 * `loop` STARTS AT THE SUBJECT AND DOES NOT REPEAT IT. For a waiting loop it is
 * the ids in the order they wait, the subject first, closing back on the subject
 * implicitly; for a module loop it is the hops, the subject's own hop first.
 * `type` is the subject's node type, which is what decides between the two
 * sentences a waiting loop can be said in — a work item's and a requirement's.
 */
export type Cycle =
  | {
      readonly kind: "depends";
      readonly type: string;
      readonly loop: readonly string[];
    }
  | { readonly kind: "refines"; readonly loop: readonly string[] }
  | { readonly kind: "module"; readonly loop: readonly ModuleHop[] };

/** Every node standing on a loop, and the loop it stands on. */
export type Cycles = ReadonlyMap<string, Cycle>;

/** One node's outgoing steps in the derived graph, however the steps are labelled. */
interface Step {
  readonly to: string;
  /** The contract the hop runs through — null in the waiting graph, which has none. */
  readonly via: string | null;
}

type Adjacency = ReadonlyMap<string, readonly Step[]>;

function push(map: Map<string, Step[]>, from: string, step: Step): void {
  const held = map.get(from);
  if (held === undefined) {
    map.set(from, [step]);
  } else {
    held.push(step);
  }
}

/**
 * The two graphs a loop can run in, built together in one walk of the edges.
 *
 * THE WAITING GRAPH IS WRITTEN DOWN; THE MODULE GRAPH IS DERIVED. `DEPENDS_ON`
 * is an edge somebody wrote, both ends living — a dangling one names no order
 * because nothing is at the far end of it, and the missing rule already says so.
 * A module's dependency is never written: it is `A CONSUMES I` met with
 * `B EXPOSES I`, which is why this pass has to see every contract before it can
 * name a single hop.
 *
 * A MODULE CONSUMING ITS OWN CONTRACT IS NOT A DEPENDENCY. Publishing something
 * and then calling it is a module talking to itself; the loop this rule is
 * about is one that crosses a boundary, so `A === B` is dropped rather than
 * reported as a one-step cycle.
 *
 * WHERE TWO CONTRACTS RUN BETWEEN THE SAME PAIR, the smallest id is the one the
 * sentence names. Any of them would do — the point is that the answer is the
 * same on every read, so that a person who fixed one line sees the sentence
 * change rather than watching it name a different contract each time.
 */
function graphsOf(graph: SpecGraph): {
  waiting: Adjacency;
  modules: Adjacency;
  refining: Adjacency;
} {
  const living = new Set<string>();
  for (const node of graph.nodes) {
    living.add(node.id);
  }
  const waiting = new Map<string, Step[]>();
  const refining = new Map<string, Step[]>();
  // The two halves of a module hop, indexed by the contract they meet at.
  const exposedBy = new Map<string, string[]>();
  const consumedBy = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!living.has(edge.fromId) || !living.has(edge.toId)) {
      continue;
    }
    if (edge.type === DEPENDS_ON) {
      push(waiting, edge.fromId, { to: edge.toId, via: null });
      continue;
    }
    if (edge.type === REFINES) {
      push(refining, edge.fromId, { to: edge.toId, via: null });
      continue;
    }
    const index =
      edge.type === EXPOSES
        ? exposedBy
        : edge.type === CONSUMES
          ? consumedBy
          : null;
    if (index === null) {
      continue;
    }
    const held = index.get(edge.toId);
    if (held === undefined) {
      index.set(edge.toId, [edge.fromId]);
    } else {
      held.push(edge.fromId);
    }
  }
  const modules = new Map<string, Step[]>();
  // Smallest contract id wins between one pair, so the pairs are collected
  // first and the winner picked once.
  const between = new Map<string, ModuleHop>();
  for (const [contract, callers] of consumedBy) {
    for (const publisher of exposedBy.get(contract) ?? []) {
      for (const caller of callers) {
        if (caller === publisher) {
          continue;
        }
        const key = `${caller}\u0000${publisher}`;
        const held = between.get(key);
        if (held === undefined || compare(contract, held.via) < 0) {
          between.set(key, { from: caller, via: contract, to: publisher });
        }
      }
    }
  }
  for (const hop of between.values()) {
    push(modules, hop.from, { to: hop.to, via: hop.via });
  }
  for (const steps of [
    ...waiting.values(),
    ...modules.values(),
    ...refining.values(),
  ]) {
    steps.sort((left, right) => compare(left.to, right.to));
  }
  return { waiting, modules, refining };
}

/**
 * Every node that stands on a loop of this graph — the strongly connected
 * components with more than one member.
 *
 * IT IS COMPONENTS AND NOT BACK EDGES, and the difference is a real one rather
 * than a preference. A walk that marks whatever sits on its own path when it
 * meets a back edge misses nodes: give A→B, B→C, C→A and also A→C, and a walk
 * that takes A→C first closes the loop A→C→A, marks those two, and then meets C
 * from B already finished — B is on a loop and nothing said so. A component
 * asks the question the right way round: two nodes are in one component exactly
 * when each can reach the other, which is what standing on a loop MEANS.
 *
 * Iterative, because a component can be as deep as the graph is long and a
 * specification is somebody's file tree, not a fixed size. Self-loops cannot
 * arise: the loader refuses a relation from a file to its own id.
 */
function loopingNodes(adjacency: Adjacency): Set<string> {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const looping = new Set<string>();
  let next = 0;

  const roots = [...adjacency.keys()].sort(compare);
  for (const root of roots) {
    if (index.has(root)) {
      continue;
    }
    // Each frame is a node and how far through its successors we are.
    const frames: { id: string; at: number }[] = [{ id: root, at: 0 }];
    index.set(root, next);
    low.set(root, next);
    next += 1;
    stack.push(root);
    onStack.add(root);
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      if (frame === undefined) {
        break;
      }
      const steps = adjacency.get(frame.id) ?? [];
      if (frame.at < steps.length) {
        const step = steps[frame.at];
        frame.at += 1;
        if (step === undefined) {
          continue;
        }
        if (!index.has(step.to)) {
          index.set(step.to, next);
          low.set(step.to, next);
          next += 1;
          stack.push(step.to);
          onStack.add(step.to);
          frames.push({ id: step.to, at: 0 });
        } else if (onStack.has(step.to)) {
          low.set(
            frame.id,
            Math.min(low.get(frame.id) ?? 0, index.get(step.to) ?? 0),
          );
        }
        continue;
      }
      frames.pop();
      const parent = frames[frames.length - 1];
      if (parent !== undefined) {
        low.set(
          parent.id,
          Math.min(low.get(parent.id) ?? 0, low.get(frame.id) ?? 0),
        );
      }
      if (low.get(frame.id) !== index.get(frame.id)) {
        continue;
      }
      const component: string[] = [];
      for (;;) {
        const held = stack.pop();
        if (held === undefined) {
          break;
        }
        onStack.delete(held);
        component.push(held);
        if (held === frame.id) {
          break;
        }
      }
      if (component.length > 1) {
        for (const id of component) {
          looping.add(id);
        }
      }
    }
  }
  return looping;
}

/**
 * The shortest way from this node back to itself, as the steps taken.
 *
 * SHORTEST, BECAUSE THE SENTENCE IS READ BY A PERSON. A node inside a large
 * tangle sits on many loops, and reciting the longest one helps nobody; the
 * shortest names the fewest lines that have to be looked at, and one of them is
 * the line to cut. Successors are walked in id order, so the answer is the same
 * on every read of the same graph.
 *
 * Null when nothing comes back, which the caller has already ruled out by
 * asking only about nodes in a component — kept as an honest return rather than
 * an assertion.
 */
function shortestLoop(
  from: string,
  adjacency: Adjacency,
  within: ReadonlySet<string>,
): Step[] | null {
  const cameBy = new Map<string, { previous: string; step: Step }>();
  const seen = new Set<string>([from]);
  let frontier: string[] = [from];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const step of adjacency.get(id) ?? []) {
        if (!within.has(step.to)) {
          continue;
        }
        if (step.to === from) {
          // Closed. Walk the trail back, then read it forwards.
          const steps = [step];
          let at = id;
          while (at !== from) {
            const held = cameBy.get(at);
            if (held === undefined) {
              break;
            }
            steps.push(held.step);
            at = held.previous;
          }
          return steps.reverse();
        }
        if (seen.has(step.to)) {
          continue;
        }
        seen.add(step.to);
        cameBy.set(step.to, { previous: id, step });
        next.push(step.to);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * Every loop in the specification, one entry per node standing on one.
 *
 * The three graphs are asked separately and their answers share one map, which
 * they can because no type is in two of them: `DEPENDS_ON` runs between two
 * requirements or between two work items, `REFINES` between two goals, and a
 * module never draws either.
 */
export function cyclesOf(graph: SpecGraph): Cycles {
  const typeById = new Map<string, string>();
  for (const node of graph.nodes) {
    typeById.set(node.id, node.type);
  }
  const { waiting, modules, refining } = graphsOf(graph);
  const cycles = new Map<string, Cycle>();

  const looping = loopingNodes(waiting);
  for (const id of looping) {
    const steps = shortestLoop(id, waiting, looping);
    if (steps === null) {
      continue;
    }
    cycles.set(id, {
      kind: "depends",
      type: typeById.get(id) ?? "?",
      loop: [id, ...steps.slice(0, -1).map((step) => step.to)],
    });
  }

  const refined = loopingNodes(refining);
  for (const id of refined) {
    const steps = shortestLoop(id, refining, refined);
    if (steps === null) {
      continue;
    }
    cycles.set(id, {
      kind: "refines",
      loop: [id, ...steps.slice(0, -1).map((step) => step.to)],
    });
  }

  const circling = loopingNodes(modules);
  for (const id of circling) {
    const steps = shortestLoop(id, modules, circling);
    if (steps === null) {
      continue;
    }
    const hops: ModuleHop[] = [];
    let at = id;
    for (const step of steps) {
      hops.push({ from: at, via: step.via ?? "?", to: step.to });
      at = step.to;
    }
    cycles.set(id, { kind: "module", loop: hops });
  }

  return cycles;
}

/** The loop this node stands on, or null — the map, read. */
export function cyclicOf(
  subject: ColorSubject,
  context: ColorContext,
): Cycle | null {
  return context.cycles.get(subject.id) ?? null;
}

/** The predicate the chain calls — the loop, as a yes or a no. */
export function isCyclic(
  subject: ColorSubject,
  context: ColorContext,
): boolean {
  return cyclicOf(subject, context) !== null;
}

/**
 * The loop as one sentence, said from the node it is drawn under.
 *
 * EVERY NODE ON THE LOOP GETS ITS OWN, starting from itself, because a person
 * meets this on whichever file they opened and the fix is a line in one of
 * them. The three sentences differ in what the loop MEANS, which is different
 * for work, for a specification and for a boundary — and each one ends with the
 * two ways out, because "there is a cycle" is a diagnosis and not an
 * instruction.
 */
export function cyclicSentence(subjectId: string, cycle: Cycle): string {
  if (cycle.kind === "module") {
    const hops = cycle.loop
      .map((hop) => `${hop.from} consumes ${hop.via}, which ${hop.to} exposes`)
      .join(", and ");
    return `${hops} — a module's dependencies run one way, and a loop means neither module can be built, read or replaced without the other. Remove one CONSUMES line, or move what both need into a module of its own.`;
  }
  if (cycle.kind === "refines") {
    const refined = [...cycle.loop.slice(1), cycle.loop[0] ?? subjectId].join(
      ", which refines ",
    );
    return `${subjectId} refines ${refined} — a refinement is a decomposition, and a loop of them has no top: every goal here is achieved only through itself. Remove one REFINES line, or lift what they share into a goal above them.`;
  }
  const chain = [...cycle.loop.slice(1), cycle.loop[0] ?? subjectId].join(
    ", which waits on ",
  );
  if (cycle.type === "WorkItem") {
    return `${subjectId} waits on ${chain} — a work item cannot wait on itself through others, and no work item on this loop can ever be called ready. Remove one DEPENDS_ON line, or split the work item both halves need.`;
  }
  return `${subjectId} waits on ${chain} — nothing in a specification waits on itself through others, so neither of these can be the one that comes first. Remove one DEPENDS_ON line, or write the shared part as a third node both depend on.`;
}
