import {
  articleFor,
  closureKindOf,
  compare,
  type SpecNode,
} from "../graph/index.js";
import type { RefusedFile, SpecGraph } from "../store/file-store.js";
import { closureVerdictOf, type ClosureVerdict } from "./closure.js";
import { cyclicOf, cyclicSentence } from "./seams.js";
import {
  isCriteriaCarrier,
  satisfactionOf,
  type ClosureAt,
} from "./satisfaction.js";
import {
  isClosableWorkItem,
  prematureAddressOf,
  prematureSentence,
  workItemStateOf,
  type ColorAt,
  type WorkItemState,
} from "./work-item-state.js";
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
 * books say about it, and — for a closure subject, the criterion or the work item —
 * whether it is met.
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
   * A SUBJECT LEFT OPEN IS NOT A REJECTION OF THAT SUBJECT, and it does not
   * arrive here: a rejection-ledger record that carries a claimant map is a
   * judgement about the list — the evidence claiming a criterion, the work
   * addressing a work item — and lives in `leftOpen` below, so this field is null
   * for it and the node's colour is untouched by it.
   *
   * REQUIRED AND NULLABLE, NEVER OPTIONAL, for the reason written above.
   */
  rejection: { by: string; at: string; rationale: string } | null;
  /**
   * Whether a closure subject is satisfied — a criterion met on its evidence, a
   * work item done on the reports claiming it — and null for every other type,
   * because no other type is a thing that can be met. `CLOSURE_KINDS` in
   * `core/graph` is the table of which two those are.
   *
   * IT IS A SECOND AXIS AND NOT A FOURTH COLOUR. Green says a person agreed
   * with what this subject demands; closed says somebody showed that the demand
   * is met, on claimants they named. A subject can be green and open all
   * release long, and that is not a defect in either answer.
   *
   * REQUIRED AND NULLABLE, NEVER OPTIONAL, for the reason written above — and
   * here the null carries a fact of its own: this node is not a closure
   * subject, so the question does not apply.
   */
  closure: "open" | "closed" | null;
  /**
   * The person's STANDING word that this subject is not met by what claims it
   * now — the evidence over a criterion, the work over a work item — with the
   * reason: the other exit from the review queue, beside closing. Null when
   * nobody has said so about this list, when the word lapsed (the subject or
   * the list moved), or when the node is no closure subject at all. A closed
   * subject has null here too: the two books hold a subject in one or the
   * other.
   *
   * REQUIRED AND NULLABLE, NEVER OPTIONAL, for the reason written above.
   */
  leftOpen: { by: string; at: string; rationale: string } | null;
  /**
   * WHETHER THIS IMPLEMENTATION WORK ITEM CAN BE PICKED UP — blocked, ready, in review or done
   * — and null for every type that is not one, because the question does not
   * apply to them.
   *
   * IT IS THE BOARD'S OWN ANSWER AND NOT A SECOND OPINION. `work-item-state.ts` says
   * which word a work item wears, the Work Board's Implement column is exactly the
   * `ready` ones, and this field is what lets the Spec plane draw the same
   * answer beside the work item's id without asking a different question.
   *
   * REQUIRED AND NULLABLE, NEVER OPTIONAL, for the reason written above.
   */
  workItemState: WorkItemState | null;
  /**
   * WHETHER EVERYTHING THIS CARRIER DEMANDS IS SHOWN MET — sat or unsat — for
   * the two types the canon lets carry criteria, a Requirement and a Scenario,
   * and null for every other type. Null too for a carrier that demands no
   * criterion at all: that one is unspecified, not unmet, and the Spec plane
   * draws nothing beside its id for it.
   *
   * IT IS THE VITALS' OWN ANSWER AND NOT A SECOND OPINION. `satisfaction.ts`
   * rolls a carrier's criteria up into the word, the Vitals' satisfaction
   * ratios count exactly the carriers wearing `sat`, and this field is what
   * lets the Spec plane draw the same answer beside the carrier's id — the
   * badge and the ratio are one computation read twice.
   *
   * REQUIRED AND NULLABLE, NEVER OPTIONAL, for the reason written above.
   */
  satisfaction: "sat" | "unsat" | null;
  /**
   * THE SENTENCE A RULE OF THE GRAPH WROTE AGAINST THIS NODE, when its red came
   * from one that names other nodes — the aim rule (`off-target`), which needs
   * the log, the work item and the claims spelled out to be acted on, the loop rule
   * (`cyclic`), which has to recite the way round, and the blocked-address rule
   * (`premature`), which names the work item whose turn has not come. The panel
   * could not compose any of them from the one node it holds.
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

/** A refused file, said as the review says it — its own sentences, copied out. */
function brokenOf(refusal: RefusedFile): BrokenFile {
  return { file: refusal.file, problems: [...refusal.problems] };
}

/** A seam's own sentence, and only when that seam is what made the node red. */
function problemFor(
  node: SpecNode,
  reason: ColorVerdict["reason"],
  context: ColorContext,
): string | null {
  if (reason === "cyclic") {
    // Every node on the loop gets the sentence starting from itself, because a
    // person meets it on whichever file they opened.
    const cycle = cyclicOf(livingSubject(node), context);
    return cycle === null ? null : cyclicSentence(node.id, cycle);
  }
  if (reason !== "off-target") {
    return null;
  }
  const breach = offTargetOf(livingSubject(node), context);
  return breach === null ? null : offTargetSentence(node.id, breach);
}

/**
 * ONE REFERRER'S LINE ABOUT AN ID NO FILE NAMES — the sentence `shall check`
 * files under that referrer, said once here so the Work Board can say the same
 * words. It is per referrer and not per id: the subject of the sentence is the
 * file that still points at the hole, which is the file somebody opens.
 */
export function missingSentence(
  id: string,
  referrer: MissingNode["referencedBy"][number],
): string {
  return `${referrer.fromId} has ${articleFor(referrer.type)} ${referrer.type} relation to ${id}, and no file names ${id}. The relation is kept as written, so writing or restoring ${id} attaches it again.`;
}

export function reviewGraph(
  graph: SpecGraph,
  ledgers: Ledgers,
  // A caller that has already indexed the graph hands its context in; the
  // default keeps every other caller whole. Before the parameter, the board,
  // the bundles and the daemon's doors each built this index twice per read —
  // once for themselves and once again in here.
  context: ColorContext = colorContextOf(graph, ledgers),
): GraphReview {
  // The colour of any node, computed once per id — the chain above a work item is
  // walked per work item and the same requirement sits above many of them.
  const settled = new Map<string, "red" | "yellow" | "green" | null>();
  const colorAt: ColorAt = (id) => {
    const held = settled.get(id);
    if (held !== undefined) {
      return held;
    }
    const node = context.nodes.get(id);
    const answer =
      node === undefined ? null : colorOf(livingSubject(node), context)?.color ?? null;
    settled.set(id, answer);
    return answer;
  };
  // The closure word of any subject, computed once per id — a carrier asks
  // about each criterion it demands, and the criterion's own row asks again,
  // and hashing the criterion's bytes twice for one review would be the same
  // waste the colour memo above exists to avoid. A type that is no closure
  // subject is not asked and answers null.
  const words = new Map<string, ClosureVerdict | null>();
  const wordAt = (id: string): ClosureVerdict | null => {
    const held = words.get(id);
    if (held !== undefined) {
      return held;
    }
    const node = context.nodes.get(id);
    const answer =
      node === undefined || closureKindOf(node.type) === null
        ? null
        : closureVerdictOf(node, context);
    words.set(id, answer);
    return answer;
  };
  // The mark a carrier reads per criterion: closed when the standing word is
  // `closed`, open for any other word or none, null where nothing living is a
  // closure subject under the id — which the roll-up reads as not closed.
  const closureAt: ClosureAt = (id) => {
    const node = context.nodes.get(id);
    if (node === undefined || closureKindOf(node.type) === null) {
      return null;
    }
    return wordAt(id)?.kind === "closed" ? "closed" : "open";
  };
  const statuses: ReviewStatus[] = [];
  const missing: MissingNode[] = [];
  const broken: BrokenFile[] = [];

  for (const node of graph.nodes) {
    let verdict = colorOf(livingSubject(node), context);
    // THE NINTH QUESTION — work logged under a work item whose turn has not come —
    // is asked here and not inside `colorOf`, because it reads the addressed
    // work item's STATE, which reads other nodes' colours; the base chain answers
    // one node from its own file and the books. Only a node the chain left
    // unred is asked, so every deeper red keeps its own sentence.
    const blockedWorkItemId =
      verdict !== null && verdict.color !== "red"
        ? prematureAddressOf(node, context, colorAt)
        : null;
    if (blockedWorkItemId !== null) {
      verdict = { color: "red", reason: "premature" };
    }
    // The memo is seeded by the loop that just did the work: `colorAt` asked
    // about a node this pass has already coloured would otherwise run the whole
    // chain a second time, and every work item's chain runs through nodes of this
    // very list. (The chain above a work item holds no work logs, so the eighth
    // question can never be part of an answer it is itself waiting on.)
    settled.set(node.id, verdict?.color ?? null);
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
    // ONE CLOSURE VERDICT PER SUBJECT. `closure` and `leftOpen` are two
    // readings of the same answer — the mark, and the standing word behind an
    // open mark — so it is asked once here rather than once per field. A type
    // that is no closure subject at all is not asked, and both fields say so
    // with their own nulls.
    const closable = closureKindOf(node.type) !== null;
    const word = closable ? wordAt(node.id) : null;
    statuses.push({
      id: node.id,
      color: verdict.color,
      reason: verdict.reason,
      approval:
        approval === undefined ? null : { by: approval.by, at: approval.at },
      rejection:
        rejection === undefined || rejection.leftOpen !== undefined
          ? null
          : {
              by: rejection.by,
              at: rejection.at,
              rationale: rejection.rationale,
            },
      closure: closable ? (word?.kind === "closed" ? "closed" : "open") : null,
      leftOpen:
        word !== null && word.kind === "left-open"
          ? { by: word.by, at: word.at, rationale: word.rationale }
          : null,
      workItemState: isClosableWorkItem(node.type)
        ? workItemStateOf(node, context, colorAt)
        : null,
      satisfaction: isCriteriaCarrier(node.type)
        ? satisfactionOf(node, context, closureAt)
        : null,
      problem:
        blockedWorkItemId !== null
          ? prematureSentence(node.id, blockedWorkItemId)
          : problemFor(node, verdict.reason, context),
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
