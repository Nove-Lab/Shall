import type { SpecNode } from "../graph/index.js";
import type { RefusedFile, SpecGraph } from "../store/file-store.js";
import { closureOf, closureVerdictOf } from "./closure.js";
import {
  type ColorContext,
  colorContextOf,
  colorOf,
  type ColorSubject,
  type ColorVerdict,
  type Ledgers,
  livingSubject,
  offTargetOf,
  offTargetSentence,
} from "./color.js";

/**
 * The whole project, coloured — one pass over a loaded graph, and the three
 * lists a review screen or `shall check` is made of.
 *
 * THE THREE LISTS ARE THREE KINDS OF WORK AND NOT THREE SEVERITIES. `statuses`
 * is every node that has a colour; `missing` is the ids something still points
 * at with nothing behind them, each with the referrers that would have to be
 * re-anchored; `broken` is the files that would not read, which is a fix a
 * person makes in an editor rather than in a panel.
 *
 * A FILE THAT WILL NOT READ IS A FIX WHEREVER IT SITS, so refused files go
 * straight to `broken` without the colour chain. The chain's vocabulary — green,
 * yellow, anchored, approved — belongs to living nodes of the living bands, and
 * a `WorkLog` whose frontmatter somebody broke is outside that vocabulary and
 * still work somebody has to do. Routing it through `colorOf` would drop it on
 * the band guard, which would be the composition making a judgement of its own.
 * Missing ids keep using the chain: they have no band, no file and no folder to
 * be outside anything.
 *
 * NOTHING HERE IS STORED. It is recomputed from the graph on every read, like
 * everything else in `core/arith`, which is what lets a hand edit or a
 * `git checkout` change a colour with nobody told about it.
 */

/**
 * One node that has a colour, the one word for why, what the two judgement
 * books say about it, and — for a criterion — whether it is met.
 */
export interface ReviewStatus {
  id: string;
  color: "red" | "yellow" | "green";
  reason: ColorVerdict["reason"];
  /**
   * The ledger's record for this node, WHATEVER THE COLOUR CAME BACK AS. A
   * `changed` node still says who approved the earlier version, because that is
   * the person a reviewer would go and ask, and a red one is still a node
   * somebody once read. Only a node the ledger has no record for says nothing.
   *
   * REQUIRED AND NULLABLE, NEVER OPTIONAL. This shape crosses the wire as JSON,
   * where an absent key and `undefined` are the same thing and neither survives
   * the trip, while `null` is a value that does — so the panel can ask about the
   * field rather than about whether the field arrived. An optional key would
   * also make every construction of a status a spread under
   * `exactOptionalPropertyTypes`, for a fact every status has an answer to.
   */
  approval: { by: string; at: string } | null;
  /**
   * The rejection ledger's record for this node, WHATEVER THE COLOUR CAME BACK
   * AS — the same bargain the approval above makes, for the same reason.
   *
   * A STANDING REJECTION IS EXACTLY `reason === "rejected"`, and nothing else
   * here says so: the colour is the chain's answer and this is the book's entry,
   * and reading the second as if it were the first is what would make a fixed
   * node look refused. When the reason is something else, this is HISTORY — the
   * hearing that already happened — and it is worth a line on a card: "this was
   * rejected before, and here is what was said", which is the one thing a
   * reviewer looking at a resubmitted node wants to read first.
   *
   * A CRITERION LEFT OPEN IS NOT A REJECTION OF THE CRITERION, and it does not
   * arrive here: a rejection-ledger record that carries an evidence map is a
   * judgement about the list of evidence and lives in `leftOpen` below, so this
   * field is null for it and the node's colour is untouched by it.
   *
   * REQUIRED AND NULLABLE, NEVER OPTIONAL, for the reason written above.
   */
  rejection: { by: string; at: string; rationale: string } | null;
  /**
   * Whether an acceptance criterion is satisfied — and null for every other
   * type, because no other type is a thing that can be met.
   *
   * IT IS A SECOND AXIS AND NOT A FOURTH COLOUR. Green says a person agreed with
   * what this criterion demands; closed says somebody showed that the demand is
   * met, on evidence they named. A criterion can be green and open all release
   * long, and that is not a defect in either answer.
   *
   * REQUIRED AND NULLABLE, NEVER OPTIONAL, for the reason written above — and
   * here the null carries a fact of its own: this node is not a criterion, so
   * the question does not apply.
   */
  closure: "open" | "closed" | null;
  /**
   * The person's STANDING word that this criterion is not met by the evidence
   * claiming it now, with the reason — the other exit from the review queue,
   * beside closing. Null when nobody has said so about this list, when the
   * word lapsed (the criterion or the list moved), or when the node is not a
   * criterion at all. A closed criterion has null here too: the two books hold
   * a criterion in one or the other.
   *
   * REQUIRED AND NULLABLE, NEVER OPTIONAL, for the reason written above.
   */
  leftOpen: { by: string; at: string; rationale: string } | null;
  /**
   * THE SENTENCE A RULE OF THE GRAPH WROTE AGAINST THIS NODE, when its red came
   * from one that names other nodes — today the aim rule (`off-target`), which
   * needs the log, the task, the criteria and the evidence spelled out to be
   * acted on, and which the panel could not compose from the one node it holds.
   * Null for every other reason: an orphan's sentence is the anchor phrase the
   * panel already composes from the type, and the books' reasons carry their
   * own records above.
   *
   * REQUIRED AND NULLABLE, NEVER OPTIONAL, for the reason written above.
   */
  problem: string | null;
}

/** An id with nothing behind it, and everything still pointing at it. */
export interface MissingNode {
  id: string;
  referencedBy: { fromId: string; type: string }[];
}

/** A file that would not read, with every sentence against it. */
export interface BrokenFile {
  file: string;
  problems: string[];
}

export interface GraphReview {
  statuses: ReviewStatus[];
  missing: MissingNode[];
  broken: BrokenFile[];
}

/**
 * Byte order, not locale order — the same choice `core/store` makes, for the
 * same reason: ids and paths are ASCII, and a review that sorted by the daemon's
 * locale would put its own output at the mercy of an environment variable.
 */
function compare(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** A refused file, said as the review says it — its own sentences, copied out. */
function brokenOf(refusal: RefusedFile): BrokenFile {
  return { file: refusal.file, problems: [...refusal.problems] };
}

/**
 * The closure mark, asked only of the one type it means anything for.
 *
 * The type is compared by name rather than routed through a table, because
 * there is exactly one criterion type in the canon and a table of one row would
 * be a second place to keep that fact.
 */
function closureFor(
  node: SpecNode,
  context: ColorContext,
): "open" | "closed" | null {
  return node.type === "AcceptanceCriterion" ? closureOf(node, context) : null;
}

/** The aim rule's sentence, and only when that rule is what made the node red. */
function problemFor(
  node: SpecNode,
  reason: ColorVerdict["reason"],
  context: ColorContext,
): string | null {
  if (reason !== "off-target") {
    return null;
  }
  const breach = offTargetOf(livingSubject(node), context);
  return breach === null ? null : offTargetSentence(node.id, breach);
}

/** The standing left-open word, asked of the same one type. */
function leftOpenFor(
  node: SpecNode,
  context: ColorContext,
): { by: string; at: string; rationale: string } | null {
  if (node.type !== "AcceptanceCriterion") {
    return null;
  }
  const verdict = closureVerdictOf(node, context);
  return verdict !== null && verdict.kind === "left-open"
    ? { by: verdict.by, at: verdict.at, rationale: verdict.rationale }
    : null;
}

export function reviewGraph(
  graph: SpecGraph,
  ledgers: Ledgers,
): GraphReview {
  const context = colorContextOf(graph, ledgers);
  const statuses: ReviewStatus[] = [];
  const missing: MissingNode[] = [];
  const broken: BrokenFile[] = [];

  for (const node of graph.nodes) {
    const verdict = colorOf(livingSubject(node), context);
    if (verdict === null) {
      // A type outside the canon, which the loader never serves as a node —
      // kept as the honest shape of `colorOf`'s answer rather than cast away.
      continue;
    }
    // A node that parsed is present and problem-free, so `missing` and
    // `malformed` cannot come back for one — every other reason is a status.
    // The record is read again here rather than carried out of the chain: the
    // chain answers a colour, and who approved it is a fact about the node that
    // a red row is as entitled to as a green one.
    const approval = ledgers.approvals.get(node.id);
    const rejection = ledgers.rejections.get(node.id);
    statuses.push({
      id: node.id,
      color: verdict.color,
      reason: verdict.reason,
      approval:
        approval === undefined ? null : { by: approval.by, at: approval.at },
      rejection:
        rejection === undefined || rejection.evidence !== undefined
          ? null
          : {
              by: rejection.by,
              at: rejection.at,
              rationale: rejection.rationale,
            },
      closure: closureFor(node, context),
      leftOpen: leftOpenFor(node, context),
      problem: problemFor(node, verdict.reason, context),
    });
  }

  // Both an id a node holds and an id a refused file holds are CLAIMED: there is
  // a file at that path either way, so nothing about it is missing. The refused
  // one is broken instead, which is the next list down.
  const claimed = new Set<string>(context.living);
  const refusedFiles = new Set<string>();
  for (const refusal of graph.refused) {
    claimed.add(refusal.id);
    refusedFiles.add(refusal.file);
    broken.push(brokenOf(refusal));
  }

  // Every id an edge names that nothing on disk answers to. Enumerated from the
  // edges, so each of these has at least one referrer by construction — and the
  // verdict is still read rather than assumed, because a subject that came back
  // as anything else would be a change in the chain and not a row for this list.
  const asked = new Set<string>();
  for (const edge of graph.edges) {
    if (claimed.has(edge.toId) || asked.has(edge.toId)) {
      continue;
    }
    asked.add(edge.toId);
    // NOTHING IS DERIVED FROM THE ID. There is no file, so there is no folder,
    // so there is no type — and reading one off the id's prefix would be
    // inventing a fact about a node nobody has.
    const subject: ColorSubject = {
      id: edge.toId,
      type: null,
      present: false,
      node: null,
      problems: [],
    };
    const verdict = colorOf(subject, context);
    if (verdict === null || verdict.reason !== "missing") {
      continue;
    }
    const referencedBy = (context.incoming.get(edge.toId) ?? [])
      .map((referrer) => ({ fromId: referrer.fromId, type: referrer.type }))
      .sort(
        (a, b) => compare(a.fromId, b.fromId) || compare(a.type, b.type),
      );
    missing.push({ id: edge.toId, referencedBy });
  }

  // A shut folder, a stray `.md` at the top of the tree, a type folder in the
  // wrong band: no subject to colour, and still red on a screen. Grouped by
  // file, because the fix is per file and a person reads it that way, and the
  // sentences keep the order the loader produced them in.
  const strays = new Map<string, string[]>();
  for (const problem of graph.problems) {
    if (refusedFiles.has(problem.file)) {
      // Already a row above, said in full. Repeating it here would show one
      // broken file twice.
      continue;
    }
    const held = strays.get(problem.file);
    if (held === undefined) {
      strays.set(problem.file, [problem.message]);
    } else {
      held.push(problem.message);
    }
  }
  for (const [file, problems] of strays) {
    broken.push({ file, problems });
  }

  statuses.sort((a, b) => compare(a.id, b.id));
  missing.sort((a, b) => compare(a.id, b.id));
  broken.sort((a, b) => compare(a.file, b.file));

  return { statuses, missing, broken };
}
