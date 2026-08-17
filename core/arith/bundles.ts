import {
  anchorsFor,
  closureKindOf,
  layerOf,
  type Band,
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
 * THREE KINDS, BECAUSE THERE ARE THREE THINGS A PERSON DOES.
 *  - *Spec approval* — a piece of the specification changed; read it and agree
 *    or say what is wrong.
 *  - *Work report* — an agent finished something and wrote it down; read the
 *    journal, the logs, the evidence and the findings as one report.
 *  - *AC closure* — a criterion is green and open and something now claims to
 *    satisfy it; decide whether it does.
 *
 * WORK REPORT IS CUT FIRST, and the order is load-bearing rather than
 * cosmetic. The execution record has a natural container — a Journal, with its
 * logs and their evidence under it — and the specification does not: an
 * Assumption can hang off two nodes and a Requirement can be reached from
 * several. So the side with the honest container claims its nodes first, and
 * the spec pass then works over what is left. Cutting the other way round would
 * let a spec bundle reach sideways into a report and take a work log with it.
 *
 * THE SCAN ORDER IS THE CANON READ DOWNWARDS — Goal to DomainEntity — and it is
 * what picks the root when several nodes of one bundle are yellow: the highest
 * node in the specification is the one a person should be looking at, and the
 * rest of the piece hangs below it. A satellite has no place in that order of
 * its own, so it takes the rank of the DEEPEST node it hangs off, and sorts
 * after a non-satellite of that rank. Deepest and not highest: an Assumption
 * shared by a green Goal and a yellow Requirement belongs to the requirement
 * being judged now, and ranking it by the Goal would stand it up as a bundle of
 * its own beside the one it is part of.
 *
 * THE OUT-ANCHOR EDGES ARE READ BACKWARDS, and that is the one place the walk
 * does not simply follow the arrows. Almost every relation in the canon points
 * from the container to the contained, so "outgoing" and "downward" are the same
 * direction — except where the canon anchors a node by an edge it draws ITSELF:
 * a `Decision` is held by the `RESOLVES`/`AFFECTS` it points at, and an
 * `Evidence` by the `CLAIMS` it points at. Those arrows point at the PARENT, so
 * following them forwards would let one yellow Decision swallow the whole
 * requirement subtree it merely comments on, and reading them backwards is what
 * puts the decision inside its requirement's bundle where it belongs. The table
 * of which edges those are is `ANCHOR_RULES` and is not copied here.
 *
 * ROOTS ARE YELLOW AND ONLY YELLOW. A rejected node is not the reviewer's turn
 * any more — somebody read it, said what is wrong, and handed it back — so it
 * never stands a bundle up by itself, and a node whose only trouble is a
 * standing rejection leaves the queue entirely. It still RIDES ALONG as a
 * member when some yellow root reaches it, red and with its rationale on the
 * row, because a person judging the piece around it has to see it is there. Red
 * for a broken or unanchored file is not in the queue at all: that is a fix in
 * an editor, and `shall check` is where it is said.
 *
 * DOMAIN NODES STAND ALONE. `Term` and `DomainEntity` are the global sink —
 * everything MENTIONS them and they contain nothing — so a walk never descends
 * into Domain, and a yellow term reached from nowhere would otherwise never be
 * shown to anybody. One node, one bundle, which is the smallest arrangement that
 * keeps the promise that every yellow node is in at least one bundle.
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
  | "ac-closure"
  | "task-closure";

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
 * A work log that addressed the task, with the commits it produced — the same
 * thread back to git the evidence rows carry, one hop shorter because the log
 * is the claimant here rather than what submitted one.
 */
export interface WorkLogMember extends BundleMember {
  commits: string[];
}

/**
 * A TASK WAITING TO BE CALLED DONE, on the work that addressed it.
 *
 * IT IS THE CRITERION'S BUNDLE WITH THE OTHER SUBJECT IN IT: the same question
 * — is this list enough — asked about work instead of about evidence, so the
 * shape is the same shape and only the nouns move. What it adds is `targets`:
 * the criteria this task aimed to close, with their own marks, because "is the
 * task done" is a question a person answers partly by looking at whether what
 * it was for has closed.
 */
export interface TaskClosureBundle {
  kind: "task-closure";
  id: string;
  taskId: string;
  title: string;
  since: number;
  task: BundleMember;
  /** Every living work log addressing the task, id order. */
  workLogs: WorkLogMember[];
  /** Context only: the living criteria the task TARGETS, and where each stands. */
  targets: { id: string; name: string; closure: "open" | "closed" | null }[];
  /** The latest hearing per work log, oldest first — the criterion bundle's rule. */
  history: { workLogId: string; by: string; at: string; rationale: string }[];
}

export type ReviewBundle =
  | SpecApprovalBundle
  | WorkReportBundle
  | AcClosureBundle
  | TaskClosureBundle;

export interface ReviewQueue {
  bundles: ReviewBundle[];
}

/* ------------------------------------------------------------------ *
 * The scan order
 * ------------------------------------------------------------------ */

/**
 * The canon read downwards: the nineteen body types in the order a person meets
 * them, Domain last because it is the sink everything points into rather than a
 * place the walk descends to.
 *
 * `satisfies` and not a bare array, so a type the canon renames is a compile
 * error here rather than a node that silently sorts last.
 */
const SCAN_ORDER = [
  "Goal",
  "Actor",
  "UseCase",
  "Scenario",
  "SystemResponsibility",
  "Requirement",
  "AcceptanceCriterion",
  "Constraint",
  "ModuleDesign",
  "Interface",
  "DataSchema",
  "ImplementationTask",
  "Journal",
  "WorkLog",
  "Evidence",
  "VerificationReport",
  "Finding",
  "Term",
  "DomainEntity",
] as const satisfies readonly NodeTypeName[];

/** The three types whose rank is borrowed from whatever they hang off. */
const SATELLITE_TYPES = [
  "Assumption",
  "Question",
  "Decision",
] as const satisfies readonly NodeTypeName[];

/**
 * All twenty-two, for counting a bundle's types in one fixed order. A COUNT IS
 * ABOUT A TYPE AND NOT ABOUT A NODE, so it cannot borrow a satellite's derived
 * rank — the three sit at the end in canon order instead.
 */
const COUNT_ORDER: readonly string[] = [...SCAN_ORDER, ...SATELLITE_TYPES];

/** Where a type sorts, and whether it is one of the three that borrow a rank. */
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
 * `NODE_TYPES` and prove that all twenty-two have an answer: a type with no rank
 * would sort somewhere arbitrary and nobody would notice until a queue looked
 * wrong.
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

function compare(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/**
 * What a satellite hangs off — READ OFF THE ANCHOR TABLE and not off a second
 * copy of it.
 *
 * The relations that hold a satellite are exactly the relations `ANCHOR_RULES`
 * names for its type: `ASSUMES` into an Assumption, `RAISES` into a Question,
 * `RESOLVES`/`AFFECTS` out of a Decision. So the far ends of a type's LIVE
 * anchor edges are its attachers, whichever way those edges run, and a canon
 * that grew a fourth satellite tomorrow would be walked correctly here without
 * this function being touched.
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
 * THE VISITED SET IS NOT OPTIONAL. A `Decision` resolves a `Question` raised by
 * a `Requirement`, and the canon permits a Decision to resolve a Question that
 * another Decision raised nothing of — but nothing in the grammar forbids a
 * cycle among satellites in a hand-written file, and a queue that hung on one
 * would take the whole panel with it.
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
  // A HOMELESS ATTACHER NEVER OUTRANKS A HOMED ONE. A satellite chain that
  // ends in nothing living (a Decision resolving a Question nobody raised)
  // comes back as `NOWHERE`, whose rank is the last one — and "last" would win
  // a plain deepest-rank comparison against a real WorkLog or Requirement,
  // moving the satellite to the wrong side of the queue. So the choice is made
  // among the homed attachers first, and only a satellite with no homed
  // attacher at all is homeless itself.
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
 * which is where a person would go looking for it.
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
 * On a bundle's list: a node somebody still has to look at, or a node somebody
 * has already handed back.
 */
function isMember(scan: Scan, id: string): boolean {
  const held = scan.status.get(id);
  return (
    held !== undefined && (held.color === "yellow" || held.reason === "rejected")
  );
}

/** Able to stand a bundle up — see the header for why that is yellow alone. */
function isRoot(scan: Scan, id: string): boolean {
  return scan.status.get(id)?.color === "yellow";
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

/** Whether this edge type is one the SOURCE type is anchored BY, pointing out. */
function isOutAnchor(type: string, edgeType: string): boolean {
  return anchorsFor(type).some(
    (anchor) => anchor.direction === "out" && anchor.edgeType === edgeType,
  );
}

/**
 * The children of a node on the specification side: everything it contains,
 * with the parent-pointing arrows turned around.
 *
 * Forward along every live outgoing edge whose target is Intent or Plan, EXCEPT
 * the ones the canon anchors this node by — those point at the parent. Backward
 * along every live incoming edge that is an out-anchor of ITS source, which is
 * the same rule seen from the other end: the decision that affects this
 * requirement is inside it.
 */
function specChildrenOf(scan: Scan, id: string): string[] {
  const node = scan.context.nodes.get(id);
  if (node === undefined) {
    return [];
  }
  const children: string[] = [];
  for (const edge of scan.context.outgoing.get(id) ?? []) {
    if (!scan.context.living.has(edge.toId)) {
      continue;
    }
    if (isOutAnchor(node.type, edge.type)) {
      continue;
    }
    if (sideFor(scan, edge.toId) === "spec") {
      children.push(edge.toId);
    }
  }
  for (const edge of scan.context.incoming.get(id) ?? []) {
    if (!scan.context.living.has(edge.fromId)) {
      continue;
    }
    const source = scan.context.nodes.get(edge.fromId);
    if (source === undefined || !isOutAnchor(source.type, edge.type)) {
      continue;
    }
    if (sideFor(scan, edge.fromId) === "spec") {
      children.push(edge.fromId);
    }
  }
  return children;
}

/**
 * The children of a node inside a report: every live outgoing edge that stays in
 * the execution record, with the same parent-pointing arrows turned around as
 * on the specification side.
 *
 * NO EDGE LEAVES THE BAND. A `Finding` that escalates to a Requirement, a
 * `WorkLog` that mentions a Term and an `Evidence` that claims a criterion all
 * point OUT of the record at something the report is about rather than
 * something the report contains — following any of them would drag half the
 * specification into a work report.
 *
 * THE OUT-ANCHOR RULE IS THE SAME RULE ON BOTH SIDES. A `Decision` that
 * resolves a question a work log raised hangs under that question, exactly as
 * it hangs under a requirement's question in the specification walk — read
 * forward, the decision would be a report of its own with the question inside
 * it, which is the tail wagging the dog.
 */
function reportChildrenOf(scan: Scan, id: string): string[] {
  const node = scan.context.nodes.get(id);
  if (node === undefined) {
    return [];
  }
  const children: string[] = [];
  for (const edge of scan.context.outgoing.get(id) ?? []) {
    if (!scan.context.living.has(edge.toId)) {
      continue;
    }
    if (isOutAnchor(node.type, edge.type)) {
      continue;
    }
    if (sideFor(scan, edge.toId) === "report") {
      children.push(edge.toId);
    }
  }
  for (const edge of scan.context.incoming.get(id) ?? []) {
    if (!scan.context.living.has(edge.fromId)) {
      continue;
    }
    const source = scan.context.nodes.get(edge.fromId);
    if (source === undefined || !isOutAnchor(source.type, edge.type)) {
      continue;
    }
    if (sideFor(scan, edge.fromId) === "report") {
      children.push(edge.fromId);
    }
  }
  return children;
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
 * One walked subgraph as a bundle — or null when nothing in it is yellow, which
 * is a Journal whose whole record is already approved.
 */
function subgraphBundle(
  scan: Scan,
  kind: "spec-approval" | "work-report",
  rootId: string,
  reached: readonly string[],
): SpecApprovalBundle | WorkReportBundle | null {
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

  const body = {
    id: `${kind === "work-report" ? "report" : "spec"}:${rootId}`,
    rootId,
    title: `${rootId} ${root.name}`,
    since: sinceOf(scan, memberIds),
    members,
    unchanged,
    counts: countsOf(scan, [...memberIds, ...unchangedIds]),
  };
  return kind === "work-report"
    ? { kind: "work-report", ...body }
    : { kind: "spec-approval", ...body };
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
  task: { kind: "task-closure", prefix: "completion" },
};

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

/** The living criteria a task aims to close, with where each of them stands. */
function targetsOf(
  scan: Scan,
  taskId: string,
): { id: string; name: string; closure: "open" | "closed" | null }[] {
  const targets: { id: string; name: string; closure: "open" | "closed" | null }[] =
    [];
  for (const edge of scan.context.outgoing.get(taskId) ?? []) {
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
 * A SUBJECT IS ASKED ABOUT WHEN SOMETHING CLAIMS IT, EVERY CLAIMANT IS
 * APPROVED, AND NOBODY HAS SAID A WORD ABOUT THIS LIST — `closureAsks` is the
 * whole condition, and it is the same condition for both subjects. A claim
 * nobody has read yet is not a claim a person can judge on, so a criterion with
 * a yellow piece of evidence, or a task with an unread work log, is open and
 * off the queue until that claimant is approved (which is what brings it here);
 * the list itself is still everything attached, so the closing that follows is
 * over all of it. The two exits are the two words, and either one takes the
 * subject out of the queue until the subject or the list changes.
 *
 * ONE BUILDER, TWO ARMS. Everything above the return — the guard, the rows, the
 * hearing, `since` — is one path; only the last statement names the fields for
 * the subject it is about.
 */
function closureBundleFor(
  scan: Scan,
  subject: SpecNode,
): AcClosureBundle | TaskClosureBundle | null {
  const kind = closureKindOf(subject.type);
  const held = scan.status.get(subject.id);
  // WHERE THE TWO AXES TOUCH IS INSIDE `closureAsks` AND NOT HERE. A subject
  // whose own words are not agreed — unapproved, edited since, refused — is not
  // asked whether it is met: there is nothing settled to be met AGAINST. This
  // used to be a rejected-only guard at this line, and the gap it left showed
  // up on a screen as a yellow task wearing a green Done.
  if (kind === null || held === undefined || !closureAsks(subject, scan.context)) {
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
  const id = `${CLOSURE_BUNDLE[kind.kind].prefix}:${subject.id}`;
  const title = `${subject.id} ${subject.name}`;
  const since = sinceOf(scan, [subject.id, ...shown]);

  if (kind.kind === "task") {
    return {
      kind: "task-closure",
      id,
      taskId: subject.id,
      title,
      since,
      task: seat,
      workLogs: rows.map((row) => ({
        ...row,
        commits: [...(scan.context.nodes.get(row.id)?.commits ?? [])],
      })),
      targets: targetsOf(scan, subject.id),
      history: hearings.map(({ id: workLogId, ...rest }) => ({
        workLogId,
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

/** Every member row of a bundle, whichever kind it is. */
function seatsOf(bundle: ReviewBundle): BundleMember[] {
  switch (bundle.kind) {
    case "ac-closure":
      return [bundle.ac, ...bundle.evidence];
    case "task-closure":
      return [bundle.task, ...bundle.workLogs];
    default:
      return bundle.members;
  }
}

/**
 * The two closures first, then approval, then the report.
 *
 * The criterion comes before the task for the reason the scan order puts
 * `AcceptanceCriterion` above `ImplementationTask`: the canon reads downwards,
 * and whether the criteria a task aimed at have closed is part of what a person
 * reads before saying the task is done.
 */
const KIND_ORDER: readonly BundleKind[] = [
  "ac-closure",
  "task-closure",
  "spec-approval",
  "work-report",
];

export function reviewBundles(
  graph: SpecGraph,
  ledgers: Ledgers,
): ReviewQueue {
  const context = colorContextOf(graph, ledgers);
  const review = reviewGraph(graph, ledgers);
  const status = new Map<string, ReviewStatus>();
  for (const held of review.statuses) {
    status.set(held.id, held);
  }
  const scan: Scan = { context, status, place: placesOf(context) };

  const nodes = [...context.nodes.values()].sort((a, b) =>
    compare(a.id, b.id),
  );
  const inScanOrder = [...nodes].sort((a, b) => byScan(scan)(a.id, b.id));

  const bundles: ReviewBundle[] = [];
  const covered = new Set<string>();
  const keep = (bundle: SpecApprovalBundle | WorkReportBundle | null): void => {
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
  // Then whatever the journals did not reach: a work log that addresses a task
  // with no journal logging it is still a report somebody has to read.
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
  //    its evidence, a task on the work that addressed it. Nothing is marked
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
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      a.since - b.since ||
      compare(a.id, b.id),
  );
  return { bundles };
}
