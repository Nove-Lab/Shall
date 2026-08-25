import {
  anchorsFor,
  closureKindOf,
  compare,
  layerOf,
  type Band,
  type ClosureKind,
  type ClosureSubject,
  type NodeTypeName,
  type SpecNode,
} from "../graph/index.js";
import type { SpecGraph } from "../store/file-store.js";
import {
  colorContextOf,
  type ColorContext,
  type ColorVerdict,
  type Ledgers,
} from "./color.js";
import { claimantsOf, closureAsks } from "./closure.js";
import { reviewGraph, type ReviewStatus } from "./review.js";

/**
 * The review queue: everything waiting for a person, cut into bundles a person
 * can actually decide.
 *
 * A BUNDLE IS A UNIT OF JUDGEMENT AND NOT A LIST OF ROWS. Nobody approves a
 * requirement without its criteria, and nobody reads a work log without the
 * evidence it submitted — so the queue does not hand out one node at a time. It
 * finds a node somebody has to look at, walks out from it along the relations
 * that MEAN "this belongs to that", and shows the whole piece: what changed,
 * what did not, and how much of the graph is under the decision.
 *
 * NOTHING HERE IS STORED. No bundle id in a file, no membership table, no
 * "assigned to" column. The queue is recomputed from the graph and the three
 * ledgers on every read, which is why judging one node makes the queue
 * rearrange itself with nobody told about it, and why a `git checkout` of a
 * branch is a different queue and not a stale one.
 *
 * FIVE KINDS, BECAUSE THERE ARE FIVE THINGS A PERSON DOES.
 *  - *Spec approval* — a piece of the specification changed; read it and agree
 *    or say what is wrong.
 *  - *Work report* — an agent finished something and wrote it down; read the
 *    journal, the logs, the evidence and the findings as one report.
 *  - *Standalone finding* — a finding no work log recorded: something brought
 *    between turns of work rather than found inside one. Read it and take it,
 *    or say what is wrong with it.
 *  - *AC closure* — a criterion is green and open and approved evidence now
 *    claims to satisfy it; decide whether it does.
 *  - *Work item closure* — the same question over the other closure subject: a work item
 *    is green and open and approved completion reports claim it; decide
 *    whether the work they report satisfies it.
 *
 * WORK REPORT IS CUT FIRST, and the order is load-bearing rather than
 * cosmetic. The execution record has a natural container — a Journal, with its
 * logs and their evidence under it — and the specification does not: an
 * Assumption can hang off two nodes and a Requirement can be reached from
 * several. So the side with the honest container claims its nodes first, and
 * the spec pass then works over what is left. Cutting the other way round would
 * let a spec bundle reach sideways into a report and take a work log with it.
 *
 * THE STANDALONE FINDINGS ARE CUT BETWEEN THE TWO REPORT PASSES, and for the
 * same bookkeeping reason. A finding nothing records is on the report side and
 * is a root there, so the pass that mops up report-side roots would stand one
 * up as a one-row work report — which is a card titled "Work report" over a
 * thing no work reported. Cutting it first, and marking it covered, is what
 * keeps the later pass off it.
 *
 * THE SCAN ORDER IS THE CANON READ DOWNWARDS — Decision, then Goal, down to
 * DomainEntity — and it is what picks the root when several nodes of one bundle
 * are yellow: the highest node is the one a person should be looking at, and the
 * rest of the piece hangs below it. A satellite has no place in that order of
 * its own, so it takes the rank of the DEEPEST node it hangs off, and sorts
 * after a non-satellite of that rank. Deepest and not highest: an Assumption
 * shared by a green Goal and a yellow Requirement belongs to the requirement
 * being judged now, and ranking it by the Goal would stand it up as a bundle of
 * its own beside the one it is part of.
 *
 * RANK IS NOT RESIDENCE, and `Decision` is where the two come apart. It is
 * filed in the Plan band and it ranks above `Goal`, because a decision is the
 * reason a revision was made: when one is yellow, everything it AFFECTS — a goal
 * and a term as readily as a module — is one thing to judge, and only a type
 * that outranks all of them can gather that into a single bundle.
 *
 * AN EDGE IS WALKED FORWARD DOWN THE ORDER AND BACKWARD UP IT, and that rule
 * replaces the anchor table's. Almost every relation in the canon points from
 * the container to the contained, so "outgoing" and "downward" are usually the
 * same direction — except where a node draws the edge at its parent ITSELF: an
 * `Evidence` is held by the `CLAIMS` it points at, and a work item aims its
 * `TARGETS` at the criterion above it (an aim, not a hold, since 2026-08-23 —
 * the module's `ALLOCATES` holds it). Those arrows point at the PARENT and are
 * read backwards. The anchor table used to answer which ones they were, and it
 * was exact for as long as no type outranked what it pointed at; a `Decision`
 * is the first that does, so the question moved to the order, which is where
 * the intent was all along. See `runsDownward`.
 *
 * ROOTS ARE YELLOW AND ONLY YELLOW. A rejected node is not the reviewer's turn
 * any more — somebody read it, said what is wrong, and handed it back — so it
 * never stands a bundle up by itself, and a node whose only trouble is a
 * standing rejection leaves the queue entirely. It still RIDES ALONG as a
 * member when some yellow root reaches it, red and with its rationale on the
 * row, because a person judging the piece around it has to see it is there. A
 * `premature` log rides along for the same reason: its evidence and reports
 * are still rows a person can approve, and hiding the red log that submitted
 * them would show a report with its author cut out. Red for a broken or
 * unanchored file is not in the queue at all: that is a fix in an editor, and
 * `shall check` is where it is said — and the aim rule's red is its claimant's
 * own red too, so nothing there goes unseen.
 *
 * DOMAIN NODES STAND ALONE, EXCEPT WHERE A DECISION REVISES ONE. `Term` and
 * `DomainEntity` are the global sink — everything MENTIONS them and they contain
 * nothing — so a walk never descends into Domain, and a yellow term reached from
 * nowhere would otherwise never be shown to anybody. One node, one bundle, which
 * is the smallest arrangement that keeps the promise that every yellow node is in
 * at least one bundle. The exception is `AFFECTS`: a mention is a reference and a
 * revision is not, and the vocabulary a decision is rewriting belongs on the card
 * that says why. One step, and no further — see `REVISES`.
 *
 * PURE AND BROWSER-SAFE like the rest of `core/arith`: a graph, three ledgers
 * and an injected hash in, JSON out, no clock and no filesystem anywhere.
 */

/* ------------------------------------------------------------------ *
 * The wire
 * ------------------------------------------------------------------ */

export type BundleKind =
  | "spec-approval"
  | "work-report"
  | "standalone-finding"
  | "ac-closure"
  | "work-item-closure";

/**
 * One node on a bundle's list, with everything a row needs and nothing a card
 * needs — the body is not in here. A card reads `spec.nodes` beside the queue,
 * so shipping every body twice would make the queue's payload the size of the
 * project.
 *
 * EVERY FIELD IS REQUIRED AND NULLABLE WHERE IT CAN BE ABSENT, for the reason
 * `ReviewStatus.approval` gives: this crosses the wire as JSON, an absent key
 * and `undefined` do not survive the trip, and `null` does.
 */
export interface BundleMember {
  id: string;
  type: string;
  shortName: string;
  name: string;
  /** The file's mtime, which is what "waiting since" is counted from. */
  updatedAt: number;
  color: "red" | "yellow" | "green";
  reason: ColorVerdict["reason"];
  approval: { by: string; at: string } | null;
  rejection: { by: string; at: string; rationale: string } | null;
  closure: "open" | "closed" | null;
  /** An agent has asked for this node to go — decided in the Spec plane, not here. */
  deletionProposed: boolean;
  /** The OTHER bundles this same node is a member of, in id order. */
  sharedWith: string[];
}

/**
 * A green node inside a bundle's reach: named, never judged.
 *
 * IT IS THE HALF OF THE PICTURE THAT IS EASY TO FORGET. Approving a changed
 * requirement is also a statement that the criteria under it, which nobody
 * touched, still say the right thing — so they are listed, with no buttons, for
 * the reader to notice.
 */
export interface UnchangedNode {
  id: string;
  type: string;
  shortName: string;
  name: string;
}

/** How many nodes of one type the bundle covers — members and unchanged together. */
export interface TypeCount {
  type: string;
  count: number;
}

export interface SpecApprovalBundle {
  kind: "spec-approval";
  id: string;
  rootId: string;
  title: string;
  /** The oldest `updatedAt` among the members — what the queue sorts on. */
  since: number;
  members: BundleMember[];
  unchanged: UnchangedNode[];
  counts: TypeCount[];
}

export interface WorkReportBundle {
  kind: "work-report";
  id: string;
  rootId: string;
  title: string;
  since: number;
  members: BundleMember[];
  unchanged: UnchangedNode[];
  counts: TypeCount[];
}

/**
 * A finding no work log recorded, standing on its own.
 *
 * SAME BODY AS THE OTHER TWO, DELIBERATELY. It holds one member today and its
 * `unchanged` is always empty, so a narrower shape would be truthful and would
 * also be a fourth thing for the panel to special-case; keeping the three
 * walked kinds one body on the wire is what lets one card body render all of
 * them and one comparator sort them.
 */
export interface StandaloneFindingBundle {
  kind: "standalone-finding";
  id: string;
  rootId: string;
  title: string;
  since: number;
  members: BundleMember[];
  unchanged: UnchangedNode[];
  counts: TypeCount[];
}

/**
 * A claimant, with the work that submitted it. The commits are the WorkLog's
 * own `commits:` list — git is where a sha means anything, and this is the
 * thread back to it.
 */
export interface EvidenceMember extends BundleMember {
  submittedBy: { workLogId: string; commits: string[] }[];
}

export interface AcClosureBundle {
  kind: "ac-closure";
  id: string;
  acId: string;
  title: string;
  since: number;
  ac: BundleMember;
  /** Green claimants first, then yellow; id order inside each. */
  evidence: EvidenceMember[];
  /**
   * The latest hearing per piece of evidence — every claimant of this criterion
   * now, plus everything the current acceptance record names, that a person has
   * ever refused. Oldest first.
   */
  history: { evidenceId: string; by: string; at: string; rationale: string }[];
}

/**
 * A WORK ITEM WAITING TO BE CALLED DONE, on the completion reports that claim it.
 *
 * IT IS THE CRITERION'S BUNDLE WITH THE OTHER SUBJECT IN IT: the same question
 * — is this list enough — asked about reports instead of about evidence, so
 * the shape is the same shape and only the nouns move. What it adds is
 * `targets`: the criteria this work item aimed to close, with their own marks,
 * because "is the work item done" is a question a person answers partly by looking
 * at whether what it was for has closed. Each report row carries `submittedBy`
 * the way an evidence row does — the same thread back to the work and its
 * commits.
 */
export interface WorkItemClosureBundle {
  kind: "work-item-closure";
  id: string;
  workItemId: string;
  title: string;
  since: number;
  workItem: BundleMember;
  /** Every living completion report claiming the work item, id order. */
  reports: EvidenceMember[];
  /** Context only: the living criteria the work item TARGETS, and where each stands. */
  targets: { id: string; name: string; closure: "open" | "closed" | null }[];
  /** The latest hearing per report, oldest first — the criterion bundle's rule. */
  history: { reportId: string; by: string; at: string; rationale: string }[];
}

export type ReviewBundle =
  | SpecApprovalBundle
  | WorkReportBundle
  | StandaloneFindingBundle
  | AcClosureBundle
  | WorkItemClosureBundle;

/**
 * The three kinds a walk produces, and the body they share.
 *
 * They are named together because `subgraphBundle` builds all three and the
 * queue's own bookkeeping treats them alike: each has `members`, each is
 * covered once kept. The two closure kinds are the other axis and are built
 * somewhere else entirely.
 */
type SubgraphKind = "spec-approval" | "work-report" | "standalone-finding";

type SubgraphBundle =
  | SpecApprovalBundle
  | WorkReportBundle
  | StandaloneFindingBundle;

export interface ReviewQueue {
  bundles: ReviewBundle[];
}

/* ------------------------------------------------------------------ *
 * The scan order
 * ------------------------------------------------------------------ */

/**
 * The canon read downwards: the body types in the order a person meets them,
 * Domain last because it is the sink everything points into rather than a place
 * the walk descends to.
 *
 * `Decision` HEADS IT, ABOVE `Goal`, AND DOES NOT LIVE THERE. It is filed in the
 * Plan band, and rank and residence are two axes: residence says which folder
 * holds the file, rank says what contains what. A decision is the reason a
 * revision was made, so when one is yellow the whole ripple it AFFECTS — a goal
 * and a term as readily as a module — is one thing to judge, and only a type
 * that outranks all of them can gather it into one bundle.
 *
 * `satisfies` and not a bare array, so a type the canon renames is a compile
 * error here rather than a node that silently sorts last.
 */
const SCAN_ORDER = [
  "Decision",
  "Goal",
  "Actor",
  "UseCase",
  "Scenario",
  "SystemResponsibility",
  "Requirement",
  "AcceptanceCriterion",
  "Constraint",
  "Module",
  "Interface",
  "DataSchema",
  "WorkItem",
  "Journal",
  "WorkLog",
  "Evidence",
  "CompletionReport",
  "Finding",
  "Term",
  "DomainEntity",
] as const satisfies readonly NodeTypeName[];

/**
 * The types whose rank is borrowed from whatever they hang off. One today, and
 * still a list with the machinery around it — because `ASSUMES` runs from three
 * bands at once (a Goal, a responsibility or a requirement in Intent, a module
 * in Plan, a work log in Execution), an assumption has no fixed depth AND no
 * fixed side. Give it a static rank and either the walk climbs backwards out of
 * a work log into the report, or a work log's assumption is judged on the spec
 * side. Both of those are the borrow doing its job.
 */
const SATELLITE_TYPES = [
  "Assumption",
] as const satisfies readonly NodeTypeName[];

/**
 * Every type, for counting a bundle's types in one fixed order. A COUNT IS
 * ABOUT A TYPE AND NOT ABOUT A NODE, so it cannot borrow a satellite's derived
 * rank — the satellite sits at the end instead.
 */
const COUNT_ORDER: readonly string[] = [...SCAN_ORDER, ...SATELLITE_TYPES];

/** Where a type sorts, and whether it is one of the ones that borrow a rank. */
export interface ScanRank {
  readonly rank: number;
  readonly satellite: boolean;
}

/**
 * The rank of a TYPE — null for a type the canon does not have.
 *
 * A satellite answers with the rank it falls back to when nothing living holds
 * it, which is after every body type; the rank it actually sorts by depends on
 * the node and is worked out per node below. Exported so a test can walk
 * `NODE_TYPES` and prove that every one of them has an answer: a type with no
 * rank would sort somewhere arbitrary and nobody would notice until a queue
 * looked wrong.
 */
export function scanRankOf(type: string): ScanRank | null {
  const at = SCAN_ORDER.indexOf(type as (typeof SCAN_ORDER)[number]);
  if (at >= 0) {
    return { rank: at, satellite: false };
  }
  if (SATELLITE_TYPES.includes(type as (typeof SATELLITE_TYPES)[number])) {
    return { rank: SCAN_ORDER.length, satellite: true };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Where a node lives
 * ------------------------------------------------------------------ */

/**
 * Which of the two walks a node belongs to. The layers collapse to three
 * answers, because Intent and Plan are one piece of specification as far as a
 * reviewer is concerned — a requirement and the module that realizes it are
 * approved together.
 */
type Side = "spec" | "report" | "domain";

/** A node's rank, its satellite flag, and the layer it calls home. */
interface ScanPlace {
  readonly rank: number;
  readonly satellite: boolean;
  readonly home: Band | null;
}

/** A satellite nothing living holds: last in the order, and homeless with it. */
const NOWHERE: ScanPlace = {
  rank: SCAN_ORDER.length,
  satellite: true,
  home: null,
};

/**
 * What a satellite hangs off — READ OFF THE ANCHOR TABLE and not off a second
 * copy of it.
 *
 * The relations that hold a satellite are exactly the relations `ANCHOR_RULES`
 * names for its type: `ASSUMES` into an Assumption, which is the one satellite
 * the canon has today. So the far ends of a type's LIVE anchor edges are its
 * attachers, whichever way those edges run, and a canon that grew a second
 * satellite tomorrow would be walked correctly here without this function being
 * touched.
 */
function attachersOf(node: SpecNode, context: ColorContext): string[] {
  const attachers: string[] = [];
  for (const anchor of anchorsFor(node.type)) {
    if (anchor.direction === "in") {
      for (const edge of context.incoming.get(node.id) ?? []) {
        if (edge.type === anchor.edgeType && context.living.has(edge.fromId)) {
          attachers.push(edge.fromId);
        }
      }
    } else {
      for (const edge of context.outgoing.get(node.id) ?? []) {
        if (edge.type === anchor.edgeType && context.living.has(edge.toId)) {
          attachers.push(edge.toId);
        }
      }
    }
  }
  attachers.sort(compare);
  return attachers;
}

/**
 * One node's place, following a satellite's chain of attachers down to a body
 * type.
 *
 * THE VISITED SET IS NOT OPTIONAL, though the canon cannot reach it today: no
 * `ASSUMES` source is itself a satellite, so there is no chain to walk and no
 * cycle to fall into. It is four lines, the canon has carried three satellites
 * before and could chain again, and a queue that hung on a cycle in a
 * hand-written file would take the whole panel with it.
 */
function placeAt(
  id: string,
  context: ColorContext,
  visiting: ReadonlySet<string>,
): ScanPlace {
  const node = context.nodes.get(id);
  if (node === undefined) {
    return NOWHERE;
  }
  const rank = scanRankOf(node.type);
  if (rank === null) {
    return NOWHERE;
  }
  if (!rank.satellite) {
    return { rank: rank.rank, satellite: false, home: layerOf(node.type) };
  }
  const seen = new Set<string>(visiting);
  seen.add(id);
  // A HOMELESS ATTACHER NEVER OUTRANKS A HOMED ONE. A satellite chain that ends
  // in nothing living comes back as `NOWHERE`, whose rank is the last one — and
  // "last" would win a plain deepest-rank comparison against a real WorkLog or
  // Requirement, moving the satellite to the wrong side of the queue. So the
  // choice is made among the homed attachers first, and only a satellite with no
  // homed attacher at all is homeless itself. With one single-hop satellite in
  // the canon this cannot be reached either; it is the same four lines and the
  // same reason as the visited set above.
  let deepest: ScanPlace | null = null;
  for (const attacher of attachersOf(node, context)) {
    if (seen.has(attacher)) {
      continue;
    }
    const place = placeAt(attacher, context, seen);
    if (place.home === null) {
      continue;
    }
    if (deepest === null || place.rank > deepest.rank) {
      deepest = place;
    }
  }
  if (deepest === null) {
    return { rank: rank.rank, satellite: true, home: null };
  }
  return { rank: deepest.rank, satellite: true, home: deepest.home };
}

/** Every living node's place, worked out once. */
function placesOf(context: ColorContext): Map<string, ScanPlace> {
  const places = new Map<string, ScanPlace>();
  for (const id of context.nodes.keys()) {
    places.set(id, placeAt(id, context, new Set<string>()));
  }
  return places;
}

/**
 * The walk a node belongs to. A satellite with nothing living to hang off — a
 * shape the anchor rules already colour red — falls in with the specification,
 * which is where a person would go looking for it. A `Decision` lands here by
 * its band like everything else: Plan is spec, and its rank is a separate fact
 * settled in `SCAN_ORDER`.
 */
function sideOf(home: Band | null): Side {
  if (home === "Execution") {
    return "report";
  }
  if (home === "Domain") {
    return "domain";
  }
  return "spec";
}

/* ------------------------------------------------------------------ *
 * The scan itself
 * ------------------------------------------------------------------ */

/** The graph, the review and the places — everything the passes below read. */
interface Scan {
  readonly context: ColorContext;
  readonly status: ReadonlyMap<string, ReviewStatus>;
  readonly place: ReadonlyMap<string, ScanPlace>;
}

function placeFor(scan: Scan, id: string): ScanPlace {
  return scan.place.get(id) ?? NOWHERE;
}

function sideFor(scan: Scan, id: string): Side {
  return sideOf(placeFor(scan, id).home);
}

/**
 * On a bundle's list: a node somebody still has to look at, a node somebody
 * has already handed back, or work that jumped its turn — the two reds a
 * reviewer must SEE beside the piece they are judging.
 */
function isMember(scan: Scan, id: string): boolean {
  const held = scan.status.get(id);
  return (
    held !== undefined &&
    (held.color === "yellow" ||
      held.reason === "rejected" ||
      held.reason === "premature")
  );
}

/** Able to stand a bundle up — see the header for why that is yellow alone. */
function isRoot(scan: Scan, id: string): boolean {
  return scan.status.get(id)?.color === "yellow";
}

/**
 * Whether some living work log wrote the line that puts this finding inside a
 * turn of work.
 *
 * IT IS NOT AN ANCHOR QUESTION ANY MORE, WHICH IS WHY IT IS ASKED HERE. The
 * canon stopped requiring a finding to be recorded, so `anchorsFor` has nothing
 * to say about one; what the queue still needs to know is whether this finding
 * belongs to somebody's report or to nobody's, and that is exactly the question
 * the `RECORDS` line answers. Living, not merely written: a line in a file that
 * is gone records nothing, and a finding it names is as loose as one nothing
 * ever named.
 */
function isRecorded(scan: Scan, id: string): boolean {
  for (const edge of scan.context.incoming.get(id) ?? []) {
    if (edge.type === "RECORDS" && scan.context.living.has(edge.fromId)) {
      return true;
    }
  }
  return false;
}

function isGreen(scan: Scan, id: string): boolean {
  return scan.status.get(id)?.color === "green";
}

/** Rank, then non-satellites before satellites of that rank, then id bytes. */
function byScan(scan: Scan): (a: string, b: string) => number {
  return (a, b) => {
    const left = placeFor(scan, a);
    const right = placeFor(scan, b);
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }
    if (left.satellite !== right.satellite) {
      return left.satellite ? 1 : -1;
    }
    return compare(a, b);
  };
}

/**
 * Whether this edge runs DOWN the scan order — which is to say, whether it
 * points at something this node contains rather than at what contains it.
 *
 * THE SCAN ORDER ANSWERS THIS AND THE ANCHOR TABLE NO LONGER DOES. For as long
 * as the canon had no type that outranked what it pointed at, `ANCHOR_RULES`
 * was an exact stand-in: every out-anchor — a work log's `ADDRESSES`, an
 * evidence's and a report's `CLAIMS`, and a work item's `TARGETS` while it was
 * one — runs up the order, and nothing else does. A `Decision` broke the tie.
 * It is held by the `AFFECTS` it draws, so the anchor table calls that edge
 * parent-pointing; and it ranks above everything it affects, so the order calls
 * it containing. The order is the one that carries the intent, so the two
 * questions are separated here: the anchor table says what HOLDS a node to the
 * graph, and the scan order says what CONTAINS it — which is also why a work
 * item's `TARGETS` can stop holding anything and still be read backwards.
 *
 * LEVEL COUNTS AS DOWNWARD, and that is not a rounding choice. `DEPENDS_ON`,
 * `CONFLICTS_WITH`, `REFINES` and `RELATES_TO` join two nodes of one rank, and
 * an `Assumption` borrows the rank of the deepest thing it hangs off — so an
 * `ASSUMES` into an assumption with one attacher is exactly level. A strict
 * test would leave every such assumption unreached and standing a bundle of its
 * own. The two tests are exact complements, so every live edge is walked once
 * and one way.
 *
 * It reads the PER-NODE rank and not the type's, which is what makes the
 * borrow work; `placesOf` has settled every one of them before any walk starts.
 */
function runsDownward(scan: Scan, fromId: string, toId: string): boolean {
  return placeFor(scan, fromId).rank <= placeFor(scan, toId).rank;
}

/**
 * The one relation that means REVISION and not reference.
 *
 * Domain is the sink and a walk does not descend into it, because `MENTIONS` is
 * a reference: a requirement that names a term does not contain it, and
 * following those would put the vocabulary in every bundle. `AFFECTS` says the
 * opposite thing — the decision REVISES the term, and that revision is part of
 * what a person is being asked to judge — so this edge crosses the wall. One
 * step only: the walk stops at what it reaches, because a `DENOTES` out of that
 * term is a reference again.
 */
const REVISES: ReadonlySet<string> = new Set(["AFFECTS"]);

/** Same side, or the one step across the Domain wall that a revision makes. */
function reaches(scan: Scan, side: Side, edgeType: string, id: string): boolean {
  const there = sideFor(scan, id);
  return there === side || (there === "domain" && REVISES.has(edgeType));
}

/**
 * The children of a node: everything it contains, with the parent-pointing
 * arrows turned around.
 *
 * Forward along every live outgoing edge that runs down the order, backward
 * along every live incoming edge that runs up it — the same rule seen from both
 * ends, which is why one body serves both sides. What differs between the two
 * walks is only which side a child may be on.
 *
 * NO EDGE LEAVES THE SIDE, with the single exception a revision makes. A
 * `WorkLog` that mentions a Term and an `Evidence` that claims a criterion both
 * point OUT of the record at something the report is ABOUT rather than
 * something it contains, and a `Decision` that RESOLVES a Finding points into
 * the record from outside it — the same wall read from the other side. A
 * finding is written down, read as part of the record that found it — or on its
 * own card when no record found it — and answered by a decision that names it;
 * none of those three is a reason to drag a work report into a spec approval or
 * the other way round.
 */
function childrenOf(scan: Scan, id: string, side: Side): string[] {
  const children: string[] = [];
  for (const edge of scan.context.outgoing.get(id) ?? []) {
    if (!scan.context.living.has(edge.toId)) {
      continue;
    }
    // Points at the parent.
    if (!runsDownward(scan, id, edge.toId)) {
      continue;
    }
    if (reaches(scan, side, edge.type, edge.toId)) {
      children.push(edge.toId);
    }
  }
  for (const edge of scan.context.incoming.get(id) ?? []) {
    if (!scan.context.living.has(edge.fromId)) {
      continue;
    }
    // Strictly upward only, so a level edge is not walked twice.
    if (runsDownward(scan, edge.fromId, id)) {
      continue;
    }
    if (reaches(scan, side, edge.type, edge.fromId)) {
      children.push(edge.fromId);
    }
  }
  return children;
}

/** The specification walk: Intent and Plan, plus a revision's step into Domain. */
function specChildrenOf(scan: Scan, id: string): string[] {
  return childrenOf(scan, id, "spec");
}

/** The record walk: Execution and nothing else — see `childrenOf`. */
function reportChildrenOf(scan: Scan, id: string): string[] {
  return childrenOf(scan, id, "report");
}

/**
 * Everything one root reaches, itself included.
 *
 * THE VISITED SET IS WHAT MAKES `DEPENDS_ON` AND `CONFLICTS_WITH` SAFE. The
 * canon has self-loops by design — a requirement depends on a requirement — so
 * the walk is over a graph and never a tree, and an id already reached is
 * skipped rather than followed again.
 */
function subgraphOf(
  scan: Scan,
  rootId: string,
  childrenOf: (scan: Scan, id: string) => string[],
): string[] {
  const reached = new Set<string>([rootId]);
  const queue: string[] = [rootId];
  for (let at = 0; at < queue.length; at += 1) {
    const id = queue[at];
    if (id === undefined) {
      continue;
    }
    for (const child of childrenOf(scan, id)) {
      if (reached.has(child)) {
        continue;
      }
      reached.add(child);
      queue.push(child);
    }
  }
  return [...reached];
}

/* ------------------------------------------------------------------ *
 * Building the rows
 * ------------------------------------------------------------------ */

function memberOf(scan: Scan, id: string): BundleMember | null {
  const node = scan.context.nodes.get(id);
  const held = scan.status.get(id);
  if (node === undefined || held === undefined) {
    return null;
  }
  return {
    id: node.id,
    type: node.type,
    shortName: node.shortName,
    name: node.name,
    updatedAt: node.updatedAt,
    color: held.color,
    reason: held.reason,
    approval: held.approval === null ? null : { ...held.approval },
    rejection: held.rejection === null ? null : { ...held.rejection },
    closure: held.closure,
    deletionProposed: node.deletionProposed !== undefined,
    sharedWith: [],
  };
}

function unchangedOf(scan: Scan, id: string): UnchangedNode | null {
  const node = scan.context.nodes.get(id);
  if (node === undefined) {
    return null;
  }
  return {
    id: node.id,
    type: node.type,
    shortName: node.shortName,
    name: node.name,
  };
}

/** Per type, over everything the bundle covers, in the canon's own order. */
function countsOf(scan: Scan, ids: readonly string[]): TypeCount[] {
  const tally = new Map<string, number>();
  for (const id of ids) {
    const node = scan.context.nodes.get(id);
    if (node === undefined) {
      continue;
    }
    tally.set(node.type, (tally.get(node.type) ?? 0) + 1);
  }
  const counts: TypeCount[] = [];
  for (const [type, count] of tally) {
    counts.push({ type, count });
  }
  const rankOf = (type: string): number => {
    const at = COUNT_ORDER.indexOf(type);
    return at < 0 ? COUNT_ORDER.length : at;
  };
  counts.sort(
    (a, b) => rankOf(a.type) - rankOf(b.type) || compare(a.type, b.type),
  );
  return counts;
}

/**
 * The oldest stamp among a bundle's members — "waiting since".
 *
 * An empty list cannot happen (a bundle stands on at least one yellow member),
 * and answers 0 rather than an infinity if it ever did, because a number that
 * does not survive JSON is a worse bug than a wrong sort.
 */
function sinceOf(scan: Scan, ids: readonly string[]): number {
  let oldest: number | null = null;
  for (const id of ids) {
    const node = scan.context.nodes.get(id);
    if (node === undefined) {
      continue;
    }
    if (oldest === null || node.updatedAt < oldest) {
      oldest = node.updatedAt;
    }
  }
  return oldest ?? 0;
}

/**
 * What each walked kind's id begins with — `spec:R-0001`, `report:J-0001`,
 * `finding:F-0001`. A table rather than a chain of ternaries for the reason
 * `CLOSURE_BUNDLE` is one: a fourth walked kind is then a compile error here
 * instead of a bundle id that reads like some other kind's.
 */
const SUBGRAPH_PREFIX: Readonly<Record<SubgraphKind, string>> = {
  "spec-approval": "spec",
  "work-report": "report",
  "standalone-finding": "finding",
};

/**
 * HOW EVERY BUNDLE OPENS ITS TITLE: the root's id and its short name.
 *
 * The short name is the half a person recognises — `A-0001 (Shopper)` — while
 * the full name is a whole sentence, and the queue is a list of rows a sentence
 * does not fit on. The id stays first because it is what the row is looked up
 * by everywhere else.
 */
function namedRoot(node: SpecNode): string {
  return `${node.id} (${node.shortName})`;
}

/**
 * One walked subgraph as a bundle — or null when nothing in it is yellow, which
 * is a Journal whose whole record is already approved.
 */
function subgraphBundle(
  scan: Scan,
  kind: SubgraphKind,
  rootId: string,
  reached: readonly string[],
): SubgraphBundle | null {
  const root = scan.context.nodes.get(rootId);
  if (root === undefined) {
    return null;
  }
  const found = reached.filter((id) => isMember(scan, id)).sort(byScan(scan));
  if (!found.some((id) => isRoot(scan, id))) {
    return null;
  }
  // The root leads its own bundle when it is one of the things being judged.
  // A Journal that is itself green is a title and not a row.
  const memberIds = found.includes(rootId)
    ? [rootId, ...found.filter((id) => id !== rootId)]
    : found;
  const unchangedIds = reached
    .filter((id) => isGreen(scan, id))
    .sort(byScan(scan));

  const members: BundleMember[] = [];
  for (const id of memberIds) {
    const member = memberOf(scan, id);
    if (member !== null) {
      members.push(member);
    }
  }
  const unchanged: UnchangedNode[] = [];
  for (const id of unchangedIds) {
    const node = unchangedOf(scan, id);
    if (node !== null) {
      unchanged.push(node);
    }
  }

  /**
   * EVERYTHING THIS DECISION REACHES, MINUS THE ROOT ITSELF — the number the
   * title's suffix turns on. Members and unchanged are disjoint (one is what is
   * not green, the other is what is), so the two lists are a set with the root
   * taken out; the root is in one of them in every case but the green Journal,
   * where it leads its report without being a row.
   */
  const beyondRoot = new Set([...memberIds, ...unchangedIds]);
  beyondRoot.delete(rootId);

  const body = {
    id: `${SUBGRAPH_PREFIX[kind]}:${rootId}`,
    rootId,
    /*
     * THE SUFFIX IS THE WALKED SUBGRAPH'S ALONE. A spec approval, a report and
     * a standalone finding are all a root with whatever the canon's chain hangs
     * below it, and the chain runs one way — so "the nodes under it" names the
     * direction the walk actually went. A root nothing came with is just itself.
     */
    title:
      beyondRoot.size === 0
        ? namedRoot(root)
        : `${namedRoot(root)} and the nodes under it`,
    since: sinceOf(scan, memberIds),
    members,
    unchanged,
    counts: countsOf(scan, [...memberIds, ...unchangedIds]),
  };
  // Spelled out per kind rather than spread over a variable `kind`, so that the
  // discriminant is a literal in every arm and a kind added to `SubgraphKind`
  // stops here rather than shipping with whatever `kind` happened to hold.
  switch (kind) {
    case "work-report":
      return { kind: "work-report", ...body };
    case "standalone-finding":
      return { kind: "standalone-finding", ...body };
    case "spec-approval":
      return { kind: "spec-approval", ...body };
  }
}

/* ------------------------------------------------------------------ *
 * AC closure
 * ------------------------------------------------------------------ */

/** The work logs that submitted this evidence, with the commits they produced. */
function submittersOf(
  scan: Scan,
  evidenceId: string,
): { workLogId: string; commits: string[] }[] {
  const submitters: { workLogId: string; commits: string[] }[] = [];
  for (const edge of scan.context.incoming.get(evidenceId) ?? []) {
    if (edge.type !== "SUBMITS" || !scan.context.living.has(edge.fromId)) {
      continue;
    }
    const workLog = scan.context.nodes.get(edge.fromId);
    if (workLog === undefined) {
      continue;
    }
    submitters.push({
      workLogId: workLog.id,
      commits: [...(workLog.commits ?? [])],
    });
  }
  submitters.sort((a, b) => compare(a.workLogId, b.workLogId));
  return submitters;
}

/** The prefix and kind each closure subject's bundle is built under. */
const CLOSURE_BUNDLE: Readonly<
  Record<ClosureSubject, { readonly kind: BundleKind; readonly prefix: string }>
> = {
  criterion: { kind: "ac-closure", prefix: "closure" },
  workItem: { kind: "work-item-closure", prefix: "completion" },
};

/**
 * The id the queue gives a closure subject's card — `closure:<criterion>`,
 * `completion:<work item>` — or null for a type that is no closure subject.
 * ONE SPELLING: the card is built under it below, and the Vitals name the card
 * an open criterion is waiting on with it, so a panel link and a queue row
 * cannot drift apart by a prefix.
 */
export function closureBundleIdOf(
  subjectType: string,
  subjectId: string,
): string | null {
  const kind = closureKindOf(subjectType);
  return kind === null ? null : closureBundleIdFor(kind, subjectId);
}

/** The same spelling, for a caller that already holds the kind. */
function closureBundleIdFor(kind: ClosureKind, subjectId: string): string {
  return `${CLOSURE_BUNDLE[kind.kind].prefix}:${subjectId}`;
}

/**
 * THE LATEST HEARING PER CLAIMANT — everything claiming the subject now, plus
 * everything the record it is closed on names, that a person has ever refused.
 * A claimant that was accepted and later refused is part of the hearing even
 * though it no longer claims anything.
 */
function hearingsOf(
  scan: Scan,
  subjectId: string,
  claimantIds: readonly string[],
): { id: string; by: string; at: string; rationale: string }[] {
  const heard = new Set<string>(claimantIds);
  for (const id of scan.context.ledgers.acceptances
    .get(subjectId)
    ?.claimants.keys() ?? []) {
    heard.add(id);
  }
  const hearings: { id: string; by: string; at: string; rationale: string }[] =
    [];
  for (const id of [...heard].sort(compare)) {
    const rejection = scan.status.get(id)?.rejection;
    if (rejection === undefined || rejection === null) {
      continue;
    }
    hearings.push({ id, ...rejection });
  }
  hearings.sort((a, b) => compare(a.at, b.at) || compare(a.id, b.id));
  return hearings;
}

/** The living criteria a work item aims to close, with where each of them stands. */
function targetsOf(
  scan: Scan,
  workItemId: string,
): { id: string; name: string; closure: "open" | "closed" | null }[] {
  const targets: { id: string; name: string; closure: "open" | "closed" | null }[] =
    [];
  for (const edge of scan.context.outgoing.get(workItemId) ?? []) {
    if (edge.type !== "TARGETS" || !scan.context.living.has(edge.toId)) {
      continue;
    }
    const criterion = scan.context.nodes.get(edge.toId);
    if (criterion === undefined) {
      continue;
    }
    targets.push({
      id: criterion.id,
      name: criterion.name,
      closure: scan.status.get(criterion.id)?.closure ?? null,
    });
  }
  targets.sort((a, b) => compare(a.id, b.id));
  return targets;
}

/**
 * A SUBJECT IS ASKED ABOUT WHEN ITS OWN WORDS ARE AGREED, SOMETHING CLAIMS IT,
 * EVERY CLAIMANT IS APPROVED, AND NOBODY HAS SAID A WORD ABOUT THIS LIST —
 * `closureAsks` is the whole condition, and it is the same condition for both
 * subjects. A claim nobody has read yet is not a claim a person can judge on,
 * so a criterion with a yellow piece of evidence, or a work item with an unread work
 * log, is open and off the queue until that claimant is approved (which is what
 * brings it here); the list itself is still everything attached, so the closing
 * that follows is over all of it. The two exits are the two words, and either
 * one takes the subject out of the queue until the subject or the list changes.
 *
 * ONE BUILDER, TWO ARMS. Everything above the return — the guard, the rows, the
 * hearing, `since` — is one path; only the last statement names the fields for
 * the subject it is about.
 */
function closureBundleFor(
  scan: Scan,
  subject: SpecNode,
): AcClosureBundle | WorkItemClosureBundle | null {
  const kind = closureKindOf(subject.type);
  // WHERE THE TWO AXES TOUCH IS INSIDE `closureAsks` AND NOT HERE. A subject
  // whose own words are not agreed — unapproved, edited since, refused — is not
  // asked whether it is met: there is nothing settled to be met AGAINST. This
  // used to be a rejected-only guard at this line, and the gap it left showed
  // up on a screen as a yellow work item wearing a green Done.
  if (kind === null || !closureAsks(subject, scan.context)) {
    return null;
  }
  const claimants = claimantsOf(subject.id, scan.context);
  const shown = claimants.map((claimant) => claimant.id).sort(compare);
  const seat = memberOf(scan, subject.id);
  if (seat === null) {
    return null;
  }
  const rows: BundleMember[] = [];
  for (const id of shown) {
    const member = memberOf(scan, id);
    if (member !== null) {
      rows.push(member);
    }
  }
  const hearings = hearingsOf(scan, subject.id, shown);
  const id = closureBundleIdFor(kind, subject.id);
  /*
   * NO SUFFIX HERE, AND THE DIRECTION IS WHY. A closure bundle's rows are the
   * evidence and the reports that CLAIM this subject — relations written in the
   * claimant and pointing up at it — so they hang above the subject and not
   * below. Calling them "the nodes under it" would name the wrong end of the
   * only line joining them.
   */
  const title = namedRoot(subject);
  const since = sinceOf(scan, [subject.id, ...shown]);

  if (kind.kind === "workItem") {
    return {
      kind: "work-item-closure",
      id,
      workItemId: subject.id,
      title,
      since,
      workItem: seat,
      reports: rows.map((row) => ({
        ...row,
        submittedBy: submittersOf(scan, row.id),
      })),
      targets: targetsOf(scan, subject.id),
      history: hearings.map(({ id: reportId, ...rest }) => ({
        reportId,
        ...rest,
      })),
    };
  }
  return {
    kind: "ac-closure",
    id,
    acId: subject.id,
    title,
    since,
    ac: seat,
    evidence: rows.map((row) => ({
      ...row,
      submittedBy: submittersOf(scan, row.id),
    })),
    history: hearings.map(({ id: evidenceId, ...rest }) => ({
      evidenceId,
      ...rest,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * The queue
 * ------------------------------------------------------------------ */

/** Every member row of a bundle: the three walked kinds carry `members`. */
function seatsOf(bundle: ReviewBundle): BundleMember[] {
  switch (bundle.kind) {
    case "ac-closure":
      return [bundle.ac, ...bundle.evidence];
    case "work-item-closure":
      return [bundle.workItem, ...bundle.reports];
    default:
      return bundle.members;
  }
}

/**
 * The two closures first, then approval, then the report, then a finding
 * nobody recorded.
 *
 * The criterion comes before the work item for the reason the scan order puts
 * `AcceptanceCriterion` above `WorkItem`: the canon reads downwards,
 * and whether the criteria a work item aimed at have closed is part of what a person
 * reads before saying the work item is done. The standalone finding is last because
 * it is the one card that decides nothing: reading it is the whole of what
 * happens there, and what would answer it is a decision somebody writes
 * afterwards.
 *
 * A RECORD AND NOT AN ARRAY, because `indexOf` answers -1 for a kind nobody
 * listed and -1 sorts FIRST — a kind added to the union and forgotten here
 * would quietly take the top of everybody's queue. `Record<BundleKind, …>`
 * refuses to compile instead.
 */
const KIND_RANK: Readonly<Record<BundleKind, number>> = {
  "ac-closure": 0,
  "work-item-closure": 1,
  "spec-approval": 2,
  "work-report": 3,
  "standalone-finding": 4,
};

export function reviewBundles(
  graph: SpecGraph,
  ledgers: Ledgers,
): ReviewQueue {
  const context = colorContextOf(graph, ledgers);
  const review = reviewGraph(graph, ledgers, context);
  const status = new Map<string, ReviewStatus>();
  for (const held of review.statuses) {
    status.set(held.id, held);
  }
  const scan: Scan = { context, status, place: placesOf(context) };

  const nodes = [...context.nodes.values()].sort((a, b) =>
    compare(a.id, b.id),
  );
  // The comparator factory is called once, not once per comparison — its other
  // two callers already do this, and a sort allocates O(n log n) comparisons.
  const inOrder = byScan(scan);
  const inScanOrder = [...nodes].sort((a, b) => inOrder(a.id, b.id));

  const bundles: ReviewBundle[] = [];
  const covered = new Set<string>();
  const keep = (bundle: SubgraphBundle | null): void => {
    if (bundle === null) {
      return;
    }
    bundles.push(bundle);
    for (const member of bundle.members) {
      covered.add(member.id);
    }
  };

  // 1. Work report. Journals first, whatever colour they are — a journal is the
  //    container the canon gives the record, and it titles the report even when
  //    the only thing changed under it is one work log.
  for (const journal of nodes.filter((node) => node.type === "Journal")) {
    keep(
      subgraphBundle(
        scan,
        "work-report",
        journal.id,
        subgraphOf(scan, journal.id, reportChildrenOf),
      ),
    );
  }
  // 1a. Then the findings no work log recorded — brought between turns of work
  //     rather than found inside one, so there is no report for them to be read
  //     as part of. Cut here, before the pass below, and marked covered by
  //     `keep`: that pass takes report-side roots, a loose finding is one, and
  //     it would otherwise stand the same node up as a one-row work report.
  //     Walked over itself alone, like a domain node — a finding draws no
  //     relation, so there is nowhere else for the walk to go.
  for (const node of inScanOrder) {
    if (
      node.type !== "Finding" ||
      covered.has(node.id) ||
      !isRoot(scan, node.id) ||
      isRecorded(scan, node.id)
    ) {
      continue;
    }
    keep(subgraphBundle(scan, "standalone-finding", node.id, [node.id]));
  }

  // 1b. Then whatever the journals did not reach: a work log that addresses a
  //     work item with no journal logging it is still a report somebody has to read.
  //     A finding a journal-less log recorded arrives here too, inside that
  //     log's report — recorded is recorded, whether or not a journal logged
  //     the log.
  for (const node of inScanOrder) {
    if (
      covered.has(node.id) ||
      !isRoot(scan, node.id) ||
      sideFor(scan, node.id) !== "report"
    ) {
      continue;
    }
    keep(
      subgraphBundle(
        scan,
        "work-report",
        node.id,
        subgraphOf(scan, node.id, reportChildrenOf),
      ),
    );
  }

  // 2. Spec approval. ONLY THE ROOT CHOICE LOOKS AT `covered`; the walk does
  //    not, so a node two roots both reach is a member of both bundles and the
  //    rows say so through `sharedWith`. That is the multi-parent rule: a shared
  //    assumption really is part of both decisions.
  for (const node of inScanOrder) {
    if (
      covered.has(node.id) ||
      !isRoot(scan, node.id) ||
      sideFor(scan, node.id) !== "spec"
    ) {
      continue;
    }
    keep(
      subgraphBundle(
        scan,
        "spec-approval",
        node.id,
        subgraphOf(scan, node.id, specChildrenOf),
      ),
    );
  }
  // Domain last, one node at a time — nothing walks into the sink.
  for (const node of inScanOrder) {
    if (
      covered.has(node.id) ||
      !isRoot(scan, node.id) ||
      sideFor(scan, node.id) !== "domain"
    ) {
      continue;
    }
    keep(subgraphBundle(scan, "spec-approval", node.id, [node.id]));
  }

  // 3. Closure, on its own axis: a subject here is out of the approval queue,
  //    and what is waiting is the question of whether it is met — a criterion on
  //    its evidence, a work item on the reports that claim it. Nothing is marked
  //    covered: closure is not approval.
  for (const node of nodes) {
    if (closureKindOf(node.type) === null) {
      continue;
    }
    const bundle = closureBundleFor(scan, node);
    if (bundle !== null) {
      bundles.push(bundle);
    }
  }

  // 4. Cross-references, computed over every seat in every bundle at once so
  //    that both ends of a share point at each other.
  const seats = new Map<string, { bundleId: string; member: BundleMember }[]>();
  for (const bundle of bundles) {
    for (const member of seatsOf(bundle)) {
      const held = seats.get(member.id);
      if (held === undefined) {
        seats.set(member.id, [{ bundleId: bundle.id, member }]);
      } else {
        held.push({ bundleId: bundle.id, member });
      }
    }
  }
  for (const held of seats.values()) {
    if (held.length < 2) {
      continue;
    }
    for (const seat of held) {
      const others = new Set<string>();
      for (const other of held) {
        if (other.bundleId !== seat.bundleId) {
          others.add(other.bundleId);
        }
      }
      seat.member.sharedWith = [...others].sort(compare);
    }
  }

  // 5. The order of the queue: what is decidable now first, then oldest first.
  bundles.sort(
    (a, b) =>
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      a.since - b.since ||
      compare(a.id, b.id),
  );
  return { bundles };
}
