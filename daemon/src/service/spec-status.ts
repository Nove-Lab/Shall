import {
  colorContextOf,
  reviewGraph,
  writtenEdgesOf,
  type BrokenFile,
  type MissingNode,
  type ReviewStatus,
  type TaskBoard,
} from "@shall/core/arith";
import {
  bandOf,
  columnsInOrder,
  compare,
  type Band,
  type NodeDeletionProposal,
} from "@shall/core/graph";
import type { NodeFileEdge } from "@shall/core/serialize";
import { loadGraph } from "@shall/core/store";
import { boardOver } from "./spec-board.js";
import {
  fileOf,
  isInScope,
  projectRootAt,
  scopePrefixesOf,
  specPathsOf,
} from "./spec-graph.js";
import { requireLedgers } from "./spec-review.js";

/**
 * What the project is, node by node — the surface an agent reads before it
 * touches anything. WHY it is served rather than worked out is argued over
 * `statusSpec` below, which is the one place that argument is written down.
 *
 * IT TAKES A PATH AND NOT A PROJECT ID, like `checkSpec` and `scaffoldSpecNode`
 * and for the same reason: the caller is standing in a checkout, and a fresh
 * clone is in no registry.
 *
 * NOTHING HERE IS A DOOR. Every judgement is a person's, made in the web UI,
 * and this reads what they decided — it writes nothing, and the folder is
 * exactly as it was before the question.
 */

/**
 * One node as this surface says it: everything the review computed, plus what
 * the file itself is — its type, where it sits, what it is called, and the
 * relations it draws.
 */
export interface NodeStatus extends ReviewStatus {
  type: string;
  /**
   * The band the type is drawn in — `bandOf`'s own answer, kept as it comes
   * rather than cast into a band the type does not belong to. The null is the
   * shape of that answer and not an event: a type outside the canon gets no
   * colour, so no node carrying one ever reaches this list.
   */
  band: Band | null;
  shortName: string;
  name: string;
  /** Relative to the spec folder, `/`-separated — the spelling every row uses. */
  file: string;
  /**
   * The deletion an agent wrote into the file, or null. It is not a colour of
   * its own: the block sits inside the content a record's hash is taken over,
   * so a node carrying one reads yellow "changed" like any other edit. This
   * says which edit it was.
   */
  deletionProposed: NodeDeletionProposal | null;
  /**
   * THE RELATIONS AS THIS FILE WRITES THEM, dangling ones included — the file's
   * own content and not a judgement about it. A line to an id nothing answers
   * to is still a line in this file, and `missing` below is where the graph
   * says so.
   *
   * They are here so that a structural question — has every actor got a use
   * case, does this task target anything — is one call and not fifty file
   * reads.
   */
  edges: NodeFileEdge[];
}

/** The whole project as one read: every node with its colour, and the two lists of what is wrong. */
export interface SpecStatus {
  root: string;
  /** The scope as it was resolved — `checkSpec`'s field, and the same words. */
  scope: string[];
  nodes: NodeStatus[];
  missing: MissingNode[];
  broken: BrokenFile[];
}

/**
 * The canon's own column order — band by band, and inside a band the roster's
 * row order — as a lookup, so the sort below compares two numbers instead of
 * scanning the roster per node.
 *
 * It is `columnsInOrder`'s answer and not a second spelling of it: the Spec
 * plane draws its columns in that order, and a list an agent reads should
 * arrive in the order the person beside it is looking at.
 */
const COLUMN_RANK: ReadonlyMap<string, number> = new Map<string, number>(
  columnsInOrder().map((entry, index) => [entry.name, index]),
);

/** A type outside the canon sorts last, which is where a node that cannot exist belongs. */
function columnRankOf(type: string): number {
  return COLUMN_RANK.get(type) ?? COLUMN_RANK.size;
}

/**
 * The colours, from wherever the caller is standing.
 *
 * IT EXISTS SO THAT NOBODY WORKS OUT A COLOUR FOR THEMSELVES, and this doc
 * block is where that argument lives — the CLI's header and the deny rule
 * beside an agent's settings each point here rather than making it again,
 * because the arithmetic is the daemon's. (The README makes the case in its own
 * words, as a product page must: it is read by people who will never open this
 * file.) Green, red and closed are
 * arithmetic over the spec folder and the three books, and an agent that read
 * the files and reached its own conclusion would be a second implementation of
 * the chain — one that goes stale the day a rule moves, and one nothing tests.
 * So the whole answer is served: the colour, the one word for why, the sentence
 * a rule of the graph wrote, who approved, who refused and what they said,
 * whether a closure subject is met, and what state a task is in.
 *
 * THE JOIN IS BY ID AND NEVER BY POSITION. `reviewGraph` sorts its statuses and
 * leaves out anything the colour chain has no vocabulary for, so the two lists
 * are neither the same length nor the same order as `graph.nodes` — a walk down
 * both at once would hand one node's colour to another node's name.
 *
 * THE SCOPE NARROWS THE THREE LISTS AND NOTHING ELSE. The graph is loaded
 * whole, because a colour is arithmetic over all of it — the anchor holding a
 * node, the aim its work is under, the chain above a task all reach out of
 * whatever folder was asked about — and a narrowed load would answer a
 * different question in the same words. A missing id is kept for as long as any
 * file still pointing at it is in scope: the id's own file does not exist,
 * which is the whole of what is wrong with it, so the referrers are the only
 * address it has.
 */
export async function statusSpec(
  startPath: string,
  scope: readonly string[] = [],
): Promise<SpecStatus> {
  const root = await projectRootAt(startPath);
  const paths = specPathsOf(root);
  const prefixes = await scopePrefixesOf(paths.specDir, startPath, scope);
  const graph = await loadGraph(paths.specDir);
  const ledgers = await requireLedgers(paths, "status");
  // Built here and handed on, because `reviewGraph` would otherwise build it
  // again and the written edges below are read straight out of it.
  const context = colorContextOf(graph, ledgers);
  const review = reviewGraph(graph, ledgers, context);

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodes: NodeStatus[] = [];
  for (const status of review.statuses) {
    const node = byId.get(status.id);
    if (node === undefined) {
      continue;
    }
    nodes.push({
      ...status,
      type: node.type,
      band: bandOf(node.type),
      shortName: node.shortName,
      name: node.name,
      file: fileOf(node),
      deletionProposed: node.deletionProposed ?? null,
      edges: writtenEdgesOf(node, context),
    });
  }
  nodes.sort(
    (a, b) => columnRankOf(a.type) - columnRankOf(b.type) || compare(a.id, b.id),
  );

  // A referrer is always a node the graph holds — a refused file contributes no
  // edges — so `?` is the shape of an answer nobody reaches, and a scope that
  // named nothing takes every entry anyway.
  const fileOfId = (id: string): string =>
    fileOf({ type: byId.get(id)?.type ?? "?", id });
  return {
    root,
    scope: prefixes,
    nodes: nodes.filter((node) => isInScope(node.file, prefixes)),
    missing: review.missing.filter((entry) =>
      entry.referencedBy.some((referrer) =>
        isInScope(fileOfId(referrer.fromId), prefixes),
      ),
    ),
    broken: review.broken.filter((entry) => isInScope(entry.file, prefixes)),
  };
}

/**
 * The Task Board, from wherever the caller is standing — the same board the
 * panel draws, for an agent in a checkout rather than a person in a browser.
 *
 * IT IS THE SAME BOARD AND NOT A SECOND ONE: `boardOver` is the whole of it,
 * and finding the project is all this adds. The root travels back with it so
 * that a caller printing a row can say which folder it came out of.
 */
export async function boardAt(
  startPath: string,
): Promise<{ root: string } & TaskBoard> {
  const root = await projectRootAt(startPath);
  return { root, ...(await boardOver(specPathsOf(root))) };
}
