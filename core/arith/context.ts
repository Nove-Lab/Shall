import { compare, type SpecNode } from "../graph/index.js";
import type { ActivityRecord } from "../serialize/index.js";
import type { SpecGraph } from "../store/file-store.js";
import { reach, type Ref } from "./board.js";
import { colorContextOf, type ColorContext, type Ledgers } from "./color.js";
import { reviewGraph, type ReviewStatus } from "./review.js";
import { isClosableWorkItem, type WorkItemState } from "./work-item-state.js";

/**
 * THE LOOK BACK, COMPUTED: everything a turn of work should have read before it
 * starts on one work item, as a list of files to open.
 *
 * WHY THE DAEMON WALKS THIS AND NOT THE AGENT. The walk is eight relations
 * across three bands and it was a page of prose telling an agent which edge to
 * follow next; a page an agent follows is a page it can follow wrong, and the
 * one wrong turn nobody could see was the order of the recent turns — a journal
 * id is a zero-padded ordinal, and the ordinal is not the clock. So the walk is
 * arithmetic here, and the clock is the activity feed, which only the daemon
 * reads. What comes back is REFERENCES AND NEVER BODIES: the agent opens the
 * files, because the bodies are the point and this answer is the map to them.
 *
 * WHAT IS IN THE NEIGHBOURHOOD, and why each ring is there:
 *   · the module or modules that allocate the work item, and every sibling
 *     those modules allocate — where this item ends is where its siblings begin;
 *   · one hop upstream through the contracts — the modules exposing what this
 *     module consumes, and their work items that have been worked on — because
 *     the drift a turn actually meets is the difference between a contract as
 *     written and as it was implemented;
 *   · every work log addressing any of those, with the journal that logs it;
 *   · every completion report claiming a sibling — what was called finished;
 *   · every finding those logs recorded, and whether a decision resolved it;
 *   · EVERY DECISION WHOSE OWN LINES REACH THE NEIGHBOURHOOD — the work item,
 *     its modules, the siblings, the consumed interfaces, the criteria it targets
 *     and the requirements carrying them — not only the ones that answer a
 *     finding. The technology decision `/plan` writes reaches a module directly
 *     and answers no finding at all, and a look back that missed it would start
 *     a turn on a stack a person already refused;
 *   · the criteria this item and its siblings target, with their closure — the
 *     closed ones are what a turn re-runs to see it broke nothing;
 *   · the newest turns of the whole project, by the feed's clock;
 *   · what this item, once done, would let start.
 *
 * BOUNDED, AND HONEST ABOUT THE BOUND. A mature module has more logs than a
 * turn can read, so the logs are capped at `cap` newest-first, and `omitted`
 * says how many were left out — a silent truncation would read as the whole
 * past. Nothing else is capped: siblings, decisions and criteria are the size
 * of the module and a module that size has other problems.
 *
 * PURE AND BROWSER-SAFE, like everything in `core/arith`: the feed arrives as
 * records, and the file layout arrives as a function, because the spelling of a
 * node's path belongs to the store and the daemon and not to arithmetic.
 */

/** A node named as a reference, with its type and the file that holds it. */
export interface ContextRef extends Ref {
  type: string;
  /** Relative to the spec folder, `/`-separated — the spelling `shall status` uses. */
  file: string;
}

/** A work item, with the word it wears. */
export interface WorkItemRef extends ContextRef {
  state: WorkItemState;
}

export interface WorkContext {
  item: WorkItemRef;
  /** The modules that allocate it — never empty for a work item the graph holds. */
  modules: ContextRef[];
  /** Every other work item those modules allocate. */
  siblings: WorkItemRef[];
  /** One hop through the contracts: what this module consumes, who exposes it, and their worked-on items. */
  upstream: { module: ContextRef; interfaces: ContextRef[]; workItems: WorkItemRef[] }[];
  /** The work logs addressing the item, a sibling or an upstream item — newest first, capped. */
  logs: { log: ContextRef; addresses: string[]; journal: ContextRef | null }[];
  /** The reports claiming the item or a sibling, with the colour the claim wears. */
  reports: { report: ContextRef; claims: string; color: "red" | "yellow" | "green" | null }[];
  /** The findings those logs recorded, and whether a decision has answered each. */
  findings: { finding: ContextRef; recordedBy: string; resolved: boolean }[];
  /** Every decision whose own lines reach the neighbourhood, with what they reach. */
  decisions: { decision: ContextRef; affects: string[]; resolves: string[] }[];
  /** The criteria the item and its siblings target, with their closure. */
  criteria: { criterion: ContextRef; targetedBy: string[]; closure: "open" | "closed" | null }[];
  /** The newest turns of the project, by the feed's clock — or by id when the feed is empty. */
  recentTurns: { journal: ContextRef; at: string | null; logs: ContextRef[] }[];
  /** Which clock ordered `recentTurns`. */
  recentBy: "feed" | "id";
  /** The work items that wait on this one and on nothing else unfinished. */
  unblocks: WorkItemRef[];
  /** How many logs the cap left out. */
  omitted: number;
}

export interface WorkContextOptions {
  /** The node's file, relative to the spec folder — the store's spelling, handed in. */
  fileOf: (node: { readonly type: string; readonly id: string }) => string;
  /** How many recent turns to name. */
  recent?: number;
  /** How many logs to name before counting the rest. */
  cap?: number;
}

const ALLOCATES = "ALLOCATES";
const CONSUMES = "CONSUMES";
const EXPOSES = "EXPOSES";
const ADDRESSES = "ADDRESSES";
const LOGS = "LOGS";
const CLAIMS = "CLAIMS";
const RECORDS = "RECORDS";
const RESOLVES = "RESOLVES";
const AFFECTS = "AFFECTS";
const TARGETS = "TARGETS";
const HAS_CRITERION = "HAS_CRITERION";
const DEPENDS_ON = "DEPENDS_ON";

/** The feed kind a turn of work logs at its end. */
const WORK_DONE = "work_done";

/**
 * The look back for one work item, or null when the id names no living work
 * item — the caller says so in its own words.
 */
export function workContextOf(
  graph: SpecGraph,
  ledgers: Ledgers,
  feed: readonly ActivityRecord[],
  workItemId: string,
  options: WorkContextOptions,
): WorkContext | null {
  const context = colorContextOf(graph, ledgers);
  const item = context.nodes.get(workItemId);
  if (item === undefined || !isClosableWorkItem(item.type)) {
    return null;
  }
  const recent = options.recent ?? 3;
  const cap = options.cap ?? 30;

  const review = reviewGraph(graph, ledgers, context);
  const status = new Map<string, ReviewStatus>(
    review.statuses.map((row) => [row.id, row]),
  );
  const ref = (node: SpecNode): ContextRef => ({
    id: node.id,
    type: node.type,
    shortName: node.shortName,
    name: node.name,
    file: options.fileOf(node),
  });
  const itemRef = (node: SpecNode): WorkItemRef => ({
    ...ref(node),
    state: status.get(node.id)?.workItemState ?? "blocked",
  });
  const byId = (a: { id: string }, b: { id: string }) => compare(a.id, b.id);

  // The module ring, and the siblings under it.
  const modules = reach(item.id, ALLOCATES, "in", context);
  const siblings = unique(
    modules.flatMap((module) => reach(module.id, ALLOCATES, "out", context)),
  ).filter((node) => node.id !== item.id);

  // One hop upstream: consumed interface → the module exposing it → its items
  // that a log has addressed. An interface nothing in this project exposes is
  // an outside contract, and there is nothing of ours upstream of it.
  const consumed = unique(
    modules.flatMap((module) => reach(module.id, CONSUMES, "out", context)),
  );
  const upstream: WorkContext["upstream"] = [];
  const upstreamItems: SpecNode[] = [];
  for (const exposer of unique(
    consumed.flatMap((iface) => reach(iface.id, EXPOSES, "in", context)),
  )) {
    if (modules.some((module) => module.id === exposer.id)) {
      continue;
    }
    const interfaces = reach(exposer.id, EXPOSES, "out", context).filter((iface) =>
      consumed.some((held) => held.id === iface.id),
    );
    const workItems = reach(exposer.id, ALLOCATES, "out", context).filter(
      (held) => reach(held.id, ADDRESSES, "in", context).length > 0,
    );
    upstreamItems.push(...workItems);
    upstream.push({
      module: ref(exposer),
      interfaces: interfaces.map(ref),
      workItems: workItems.map(itemRef),
    });
  }

  // The logs, newest first — a log's ordinal is its order of writing within one
  // project, which is the one place the id is a clock.
  const addressed = [item, ...siblings, ...upstreamItems];
  const logNodes = unique(
    addressed.flatMap((held) => reach(held.id, ADDRESSES, "in", context)),
  ).sort((a, b) => compare(b.id, a.id));
  const omitted = Math.max(0, logNodes.length - cap);
  const logs = logNodes.slice(0, cap).map((log) => ({
    log: ref(log),
    addresses: reach(log.id, ADDRESSES, "out", context)
      .map((held) => held.id)
      .filter((id) => addressed.some((held) => held.id === id)),
    journal: reach(log.id, LOGS, "in", context).map(ref)[0] ?? null,
  }));

  const reports = [item, ...siblings]
    .flatMap((subject) =>
      reach(subject.id, CLAIMS, "in", context).map((report) => ({
        report: ref(report),
        claims: subject.id,
        color: status.get(report.id)?.color ?? null,
      })),
    )
    .sort((a, b) => compare(a.report.id, b.report.id));

  const findings = logNodes
    .flatMap((log) =>
      reach(log.id, RECORDS, "out", context).map((finding) => ({
        finding: ref(finding),
        recordedBy: log.id,
        resolved: reach(finding.id, RESOLVES, "in", context).length > 0,
      })),
    )
    .sort((a, b) => compare(a.finding.id, b.finding.id));

  // The criteria, and the requirements or scenarios carrying them.
  const criterionRows = new Map<string, { node: SpecNode; targetedBy: string[] }>();
  for (const subject of [item, ...siblings]) {
    for (const criterion of reach(subject.id, TARGETS, "out", context)) {
      const row = criterionRows.get(criterion.id) ?? { node: criterion, targetedBy: [] };
      row.targetedBy.push(subject.id);
      criterionRows.set(criterion.id, row);
    }
  }
  const criteria = [...criterionRows.values()]
    .map((row) => ({
      criterion: ref(row.node),
      targetedBy: row.targetedBy.sort(compare),
      closure: status.get(row.node.id)?.closure ?? null,
    }))
    .sort((a, b) => compare(a.criterion.id, b.criterion.id));
  const carriers = unique(
    [...criterionRows.values()].flatMap((row) =>
      reach(row.node.id, HAS_CRITERION, "in", context),
    ),
  );

  // Every decision whose own lines reach the neighbourhood.
  const neighbourhood = unique([
    item,
    ...modules,
    ...siblings,
    ...consumed,
    ...upstream.map((row) => context.nodes.get(row.module.id)).filter(isNode),
    ...[...criterionRows.values()].map((row) => row.node),
    ...carriers,
  ]);
  const decisionRows = new Map<string, { node: SpecNode; affects: Set<string>; resolves: Set<string> }>();
  const decisionRow = (decision: SpecNode) => {
    const row = decisionRows.get(decision.id) ?? {
      node: decision,
      affects: new Set<string>(),
      resolves: new Set<string>(),
    };
    decisionRows.set(decision.id, row);
    return row;
  };
  for (const held of neighbourhood) {
    for (const decision of reach(held.id, AFFECTS, "in", context)) {
      decisionRow(decision).affects.add(held.id);
    }
  }
  for (const found of findings) {
    for (const decision of reach(found.finding.id, RESOLVES, "in", context)) {
      decisionRow(decision).resolves.add(found.finding.id);
    }
  }
  const decisions = [...decisionRows.values()]
    .map((row) => ({
      decision: ref(row.node),
      affects: [...row.affects].sort(compare),
      resolves: [...row.resolves].sort(compare),
    }))
    .sort((a, b) => compare(a.decision.id, b.decision.id));

  // The recent turns: the feed's clock, and the id's when there is no feed.
  const journals: { node: SpecNode; at: string | null }[] = [];
  for (const record of feed) {
    if (record.kind !== WORK_DONE) {
      continue;
    }
    for (const id of record.refs) {
      const node = context.nodes.get(id);
      if (
        node !== undefined &&
        node.type === "Journal" &&
        !journals.some((held) => held.node.id === id)
      ) {
        journals.push({ node, at: record.at });
      }
    }
    if (journals.length >= recent) {
      break;
    }
  }
  const recentBy: WorkContext["recentBy"] = journals.length > 0 ? "feed" : "id";
  if (journals.length === 0) {
    for (const node of [...context.nodes.values()]
      .filter((held) => held.type === "Journal")
      .sort((a, b) => compare(b.id, a.id))
      .slice(0, recent)) {
      journals.push({ node, at: null });
    }
  }
  const recentTurns = journals.slice(0, recent).map((held) => ({
    journal: ref(held.node),
    at: held.at,
    logs: reach(held.node.id, LOGS, "out", context).map(ref),
  }));

  // What this item, done, would let start: the items waiting on it whose every
  // other prerequisite is already done.
  const unblocks = reach(item.id, DEPENDS_ON, "in", context)
    .filter((waiting) =>
      reach(waiting.id, DEPENDS_ON, "out", context).every(
        (prerequisite) =>
          prerequisite.id === item.id ||
          status.get(prerequisite.id)?.workItemState === "done",
      ),
    )
    .map(itemRef)
    .sort(byId);

  return {
    item: itemRef(item),
    modules: modules.map(ref),
    siblings: siblings.map(itemRef).sort(byId),
    upstream,
    logs,
    reports,
    findings,
    decisions,
    criteria,
    recentTurns,
    recentBy,
    unblocks,
    omitted,
  };
}

function unique(nodes: readonly SpecNode[]): SpecNode[] {
  const seen = new Set<string>();
  const found: SpecNode[] = [];
  for (const node of nodes) {
    if (!seen.has(node.id)) {
      seen.add(node.id);
      found.push(node);
    }
  }
  return found.sort((a, b) => compare(a.id, b.id));
}

function isNode(node: SpecNode | undefined): node is SpecNode {
  return node !== undefined;
}

/** Referenced so the import stays a doc anchor for readers of this file. */
export type { ColorContext };
