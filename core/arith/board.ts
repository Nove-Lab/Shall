import { compare, orphanFixSentence, type SpecNode } from "../graph/index.js";
import type { RefusedFile, SpecGraph } from "../store/file-store.js";
import {
  colorContextOf,
  type ColorContext,
  type Ledgers,
} from "./color.js";
import { missingSentence, reviewGraph, type ReviewStatus } from "./review.js";
import { depthOf } from "./work-item-state.js";

/**
 * THE BOARD: what the specification needs fixed, and what is ready to be worked
 * on. Two lists, computed from the graph and the books on every read, stored
 * nowhere.
 *
 * WHAT IS ON IT IS WHAT SOMEBODY CAN ACT ON NOW. A work item whose chain is unread,
 * or whose prerequisite is unfinished, is not dimmed here and not listed with a
 * reason — it is absent, and it appears of its own accord the moment the thing
 * above it is settled. A board that showed everything with a note about why
 * most of it is unavailable is a board nobody reads twice.
 *
 * THE TWO LISTS ARE TWO AUDIENCES AND THE ORDER IS THE MESSAGE. Fix Spec is for
 * whoever is going to repair the specification, and the rejection rationale on
 * it is a work order written by a person, so it is carried WHOLE and never
 * summarised. Implement is for whoever is going to build, and everything on it
 * has already passed every gate.
 *
 * IT SAYS THE SAME WORDS AS `shall check`. The orphan clause and the missing-id
 * sentence are `core/graph`'s and `review.ts`'s, quoted here rather than
 * rewritten, so a person who runs the CLI and a person who opens the panel are
 * told the same thing about the same node.
 *
 * PURE AND BROWSER-SAFE, like everything in `core/arith`.
 */

/** A node named as a reference: enough for a row and a link, no more. */
export interface Ref {
  id: string;
  shortName: string;
  name: string;
}

/**
 * One thing that needs fixing, and everything needed to fix it.
 *
 * EVERY FIELD IS REQUIRED AND NULLABLE, for the reason `ReviewStatus.approval`
 * gives — this crosses the wire as JSON. A row for a file that would not read
 * has no id and no type; a row for a hole has no file; only a rejected row has
 * a person and an instant.
 */
export interface FixSpecItem {
  /**
   * WHAT THE BOARD CALLS THIS ROW — `fix:<id>`, or `fix:<file>` for a file that
   * would not read far enough to have one.
   *
   * IT IS NOT THE NODE ID, and it is not a React key either: it is the row's
   * name in a URL, the way a bundle's `id` is. The two halves of the board can
   * both hold `WI-0001` — a work item can be red AND, once fixed, ready — so the
   * prefix is what keeps one page from opening the other's row.
   */
  key: string;
  id: string | null;
  type: string | null;
  shortName: string | null;
  name: string | null;
  /** Whose turn it is: a person refused this, or a rule of the graph did. */
  kind: "rejected" | "grammar";
  reason:
    | "missing"
    | "malformed"
    | "orphan"
    | "off-target"
    | "cyclic"
    | "premature"
    | "rejected";
  /** The rationale VERBATIM, or the rule's own sentence. Never summarised. */
  detail: string;
  file: string | null;
  by: string | null;
  at: string | null;
  updatedAt: number | null;
}

/** One work item that can be started now, with what it belongs to and aims at. */
export interface ImplementItem {
  /** `work-item:<id>` — the row's name in a URL; see `FixSpecItem.key`. */
  key: string;
  id: string;
  shortName: string;
  name: string;
  updatedAt: number;
  /** The modules that allocated it — never empty on this list, since the module's ALLOCATES is what holds a work item at all. */
  modules: Ref[];
  /**
   * What carries the criteria this work item targets — a Requirement, or a Scenario
   * for an integration criterion, which is why the field is not called
   * `requirementsOnly`.
   */
  requirements: Ref[];
  targets: { id: string; name: string; closure: "open" | "closed" | null }[];
  /** Work already addressing it — the "somebody is on this" hint. */
  addressedBy: { id: string; name: string; color: "red" | "yellow" | "green" }[];
  /** The longest prerequisite chain under it — the item page's own note; the list is in id order. */
  depth: number;
}

export interface WorkBoard {
  fixSpec: FixSpecItem[];
  implement: ImplementItem[];
}

/**
 * Where a reason sorts. A person's refusal first, because it is an instruction
 * somebody wrote for whoever is reading this; then the seams the grammar found,
 * then the holes, then the files that would not read at all.
 *
 * IT IS THE COLOUR CHAIN'S PRIORITY READ BACKWARDS, deliberately: the chain
 * answers missing → malformed → orphan → off-target → cyclic → rejected because
 * that is the order a single node's defects mask each other in, and this board
 * sorts a LIST for a person whose first job is the instructions people wrote.
 * Both orders are right for their own audience. The four seams the grammar
 * found share a rank on purpose — between them it is the tiebreak below (`at`,
 * then `updatedAt`, then id) that decides, oldest first.
 */
const RANK: Readonly<Record<FixSpecItem["reason"], number>> = {
  rejected: 0,
  orphan: 1,
  "off-target": 1,
  cyclic: 1,
  premature: 1,
  missing: 2,
  malformed: 3,
};

/** The reference a row makes to a node it already holds. */
function refOf(node: SpecNode): Ref {
  return { id: node.id, shortName: node.shortName, name: node.name };
}

/** The nodes one relation reaches from this one, living only, in id order. */
function reach(
  id: string,
  type: string,
  direction: "in" | "out",
  context: ColorContext,
): SpecNode[] {
  const edges =
    direction === "in"
      ? context.incoming.get(id) ?? []
      : context.outgoing.get(id) ?? [];
  const found: SpecNode[] = [];
  for (const edge of edges) {
    if (edge.type !== type) {
      continue;
    }
    const node = context.nodes.get(direction === "in" ? edge.fromId : edge.toId);
    if (node !== undefined && !found.includes(node)) {
      found.push(node);
    }
  }
  found.sort((a, b) => compare(a.id, b.id));
  return found;
}

/** A red node's row: which rule, and the sentence that rule wrote. */
function fixOf(
  node: SpecNode,
  status: ReviewStatus,
  context: ColorContext,
): FixSpecItem | null {
  const common = {
    key: `fix:${node.id}`,
    id: node.id,
    type: node.type,
    shortName: node.shortName,
    name: node.name,
    file: null,
    updatedAt: node.updatedAt,
  };
  if (status.reason === "rejected" && status.rejection !== null) {
    return {
      ...common,
      kind: "rejected",
      reason: "rejected",
      // WHOLE, AND NEVER A FIRST LINE. This is a work order a person wrote for
      // whoever picks the node up; a summary of it is a different instruction.
      detail: status.rejection.rationale,
      by: status.rejection.by,
      at: status.rejection.at,
    };
  }
  if (status.reason === "orphan") {
    return {
      ...common,
      kind: "grammar",
      reason: "orphan",
      // The check's own sentence, quoted from its one home in `core/graph`.
      detail: orphanFixSentence(node.id, node.type),
      by: null,
      at: null,
    };
  }
  if (status.reason === "off-target" && status.problem !== null) {
    return {
      ...common,
      kind: "grammar",
      reason: "off-target",
      detail: status.problem,
      by: null,
      at: null,
    };
  }
  if (status.reason === "cyclic" && status.problem !== null) {
    return {
      ...common,
      kind: "grammar",
      reason: "cyclic",
      detail: status.problem,
      by: null,
      at: null,
    };
  }
  if (status.reason === "premature" && status.problem !== null) {
    return {
      ...common,
      kind: "grammar",
      reason: "premature",
      detail: status.problem,
      by: null,
      at: null,
    };
  }
  return null;
}

/**
 * The board, whole.
 *
 * THE REVIEW IS RUN ONCE AND EVERYTHING READS IT. Colours, rejections, closure
 * marks, the aim rule's sentence AND the work item's own word all come out of that
 * one pass — the Implement list below is the review's `workItemState === "ready"`
 * read back rather than recomputed, so the badge on the Spec plane and the
 * Implement column here cannot disagree: they are one field.
 */
export function workBoardOf(graph: SpecGraph, ledgers: Ledgers): WorkBoard {
  const context = colorContextOf(graph, ledgers);
  const review = reviewGraph(graph, ledgers, context);
  const status = new Map<string, ReviewStatus>();
  for (const held of review.statuses) {
    status.set(held.id, held);
  }

  const fixSpec: FixSpecItem[] = [];
  for (const held of review.statuses) {
    if (held.color !== "red") {
      continue;
    }
    const node = context.nodes.get(held.id);
    if (node === undefined) {
      continue;
    }
    const row = fixOf(node, held, context);
    if (row !== null) {
      fixSpec.push(row);
    }
  }

  // A hole is ONE row with one sentence per referrer — the same sentences the
  // check files under each referrer's own file, joined so the row names every
  // file that would have to be re-anchored.
  for (const hole of review.missing) {
    fixSpec.push({
      key: `fix:${hole.id}`,
      id: hole.id,
      type: null,
      shortName: null,
      name: null,
      kind: "grammar",
      reason: "missing",
      detail: hole.referencedBy
        .map((referrer) => missingSentence(hole.id, referrer))
        .join(" "),
      file: null,
      by: null,
      at: null,
      updatedAt: null,
    });
  }

  // A file that would not read is ONE row per FILE, which is what `broken`
  // already is: `reviewGraph` grouped the sentences and dropped the copies a
  // refused file also leaves in `graph.problems`. The id and type come back off
  // `graph.refused`, which is where a refused NODE file's are known; a stray
  // `.md` has neither.
  const refusedAt = new Map<string, RefusedFile>(
    graph.refused.map((refusal) => [refusal.file, refusal]),
  );
  for (const broken of review.broken) {
    const refusal = refusedAt.get(broken.file);
    fixSpec.push({
      // A file that would not read far enough to carry an id is named by its
      // path — the only identity it has, and the one the row shows.
      key: `fix:${refusal?.id ?? broken.file}`,
      id: refusal?.id ?? null,
      type: refusal?.type ?? null,
      shortName: null,
      name: null,
      kind: "grammar",
      reason: "malformed",
      detail: broken.problems.join(" "),
      file: broken.file,
      by: null,
      at: null,
      updatedAt: null,
    });
  }

  fixSpec.sort(
    (a, b) =>
      RANK[a.reason] - RANK[b.reason] ||
      compare(a.at ?? "", b.at ?? "") ||
      (a.updatedAt ?? 0) - (b.updatedAt ?? 0) ||
      compare(a.id ?? a.file ?? "", b.id ?? b.file ?? ""),
  );

  const implement: ImplementItem[] = [];
  for (const held of review.statuses) {
    // THE GATE IS THE REVIEW'S OWN WORD. `work-item-state.ts` decided it once, per
    // work item, inside the pass above; a second computation here is exactly the
    // drift the shared module exists to prevent.
    if (held.workItemState !== "ready") {
      continue;
    }
    const node = context.nodes.get(held.id);
    if (node === undefined) {
      continue;
    }
    const modules = reach(node.id, "ALLOCATES", "in", context).map(refOf);
    const targeted = reach(node.id, "TARGETS", "out", context);
    const carriers = new Map<string, Ref>();
    for (const criterion of targeted) {
      for (const carrier of reach(criterion.id, "HAS_CRITERION", "in", context)) {
        carriers.set(carrier.id, refOf(carrier));
      }
    }
    implement.push({
      key: `work-item:${node.id}`,
      id: node.id,
      shortName: node.shortName,
      name: node.name,
      updatedAt: node.updatedAt,
      modules,
      requirements: [...carriers.values()].sort((a, b) => compare(a.id, b.id)),
      targets: targeted.map((criterion) => ({
        id: criterion.id,
        name: criterion.name,
        // Null when the far end is no criterion — the same answer the queue's
        // work item card gives for this field, so one wire word for one fact.
        closure: status.get(criterion.id)?.closure ?? null,
      })),
      addressedBy: reach(node.id, "ADDRESSES", "in", context).map((log) => ({
        id: log.id,
        name: log.name,
        color: status.get(log.id)?.color ?? "yellow",
      })),
      depth: depthOf(node.id, context),
    });
  }
  // ID ORDER, AND NOTHING CLEVERER. The list once sorted by depth and age so
  // the shallow and the stale came first, and a person could not find a row
  // where they expected it; ids are how every other list here reads, and the
  // chain a work item sits in is its row's own facts.
  implement.sort((a, b) => compare(a.id, b.id));

  return { fixSpec, implement };
}
