import {
  anchorsFor,
  compare,
  isColored,
  type AnchorEdge,
  type SpecEdge,
  type SpecNode,
} from "../graph/index.js";
import {
  approvalPayload,
  blocksOf,
  type AcceptanceLedger,
  type ApprovalLedger,
  type NodeFileEdge,
  type ParsedNode,
  type RejectionLedger,
} from "../serialize/index.js";
import type { SpecGraph } from "../store/file-store.js";

/**
 * The colour of one node: red for a hole in the specification or a refusal
 * somebody wrote down, yellow for a change nobody has read, green for a node a
 * person approved and nothing has touched since.
 *
 * SEVEN PREDICATES AND ONE ORDER. Each question below is asked on its own and
 * answers about one fact — is the file there, does it parse, does anything hold
 * it, does its aim land where the grammar says it may, has a person refused it
 * at these bytes, has a person approved it, does that approval still fit the
 * bytes. `colorOf` is the ORDER those questions are
 * asked in and it holds no judgement of its own: every rule about what is wrong
 * lives in a predicate, so a rule can be read, tested and changed in one place,
 * and the composition stays a list of ifs a person can check against the spec.
 *
 * A COLOUR IS THE ARITHMETIC OF TWO FILES: what the spec says now, hashed as it
 * stands, against what a ledger remembers, which is the hash a person judged.
 * Nothing is signed and nothing needs to be — the node file is pure authorship
 * and the ledgers are the daemon's own books — so green is an equality between
 * two files and never a claim stored inside one of them. That is what lets it be
 * recomputed on every read, and why a hand edit or a `git checkout` moves a
 * colour with nobody told about it.
 *
 * THE ORDER IS THE PRODUCT. A node that is both unanchored and unapproved is
 * told about the anchor, because approving a node that hangs off nothing is
 * work thrown away — the chain answers the first thing that is wrong and stops.
 * The aim rule sits right after the anchor for the same reason: it is grammar,
 * a seam in the graph a person cannot approve over, and it is answered before
 * any book is opened.
 *
 * A REJECTION IS THE SAME ARITHMETIC POINTED THE OTHER WAY, which is why it
 * needs no branch of its own beyond one predicate. The record names the hash of
 * the content that was refused, so the moment an agent fixes the node the hashes
 * stop matching, the rejection stops standing on its own, and the node is yellow
 * again with nothing swept and nobody told. A LAPSED REJECTION IS NOT DELETED —
 * it is the history of a hearing, and a panel is entitled to show it as one.
 * AND A REJECTION OVER AN APPROVAL WINS, because it is asked first: the two
 * books never erase each other, a node may stand in both, and the order here is
 * the whole of what decides between them. A person who approved a node and then
 * refused it at the same bytes has changed their mind, and the later word is the
 * one on the screen; withdrawing the rejection puts the green back untouched,
 * because the approval was never written over.
 *
 * A DELETION PROPOSAL NEEDS NO BRANCH HERE, and that is the design rather than
 * an omission. The proposal sits INSIDE the content a record's hash is taken
 * over, so an agent writing one un-matches the hash by itself and the node turns
 * yellow with the reason "changed" — the same yellow an edited body earns,
 * because it is the same fact: this node is not what the person approved.
 * Stripping the proposal puts the bytes back, the hash fits again, and the node
 * is green with nothing else undone. No state was stored, so no state had to be
 * repaired.
 *
 * THIS MODULE IS PURE AND BROWSER-SAFE. No filesystem, no clock, no crypto: the
 * graph arrives as data, the ledgers' records arrive as data beside it, and the
 * one call core cannot make itself — a sha256 — arrives as a function. The same
 * graph, the same records and the same hash always give the same colour, which
 * is what lets the panel in the browser and the daemon on the socket answer
 * alike.
 *
 * THE ONE-TURN PROPERTY IS GONE, AND THAT IS FINE. The old approve door hashed a
 * node inside the store's write turn because approving WROTE the node's file,
 * and a hash taken over anything other than the bytes about to be written would
 * have been a lie. The daemon now hashes the graph it has just loaded and writes
 * only the ledger, so a save can land in between. What that costs is one yellow:
 * a record names content and not a moment, so a record taken over bytes that
 * have since moved reads as "changed" and the person judges again. What it
 * cannot cost is a false green, because green is that equality and nothing else.
 */

/**
 * `sha256:<hex>` over an approval payload — the daemon's function, injected;
 * core hashes nothing itself.
 *
 * Injected rather than imported so that this module never names a crypto
 * library and keeps its promise to run anywhere. The daemon holds the one
 * implementation, and every hash the ledgers remember was written with it.
 */
export type PayloadHash = (payload: string) => string;

/**
 * The three books a judgement is read out of, and the hash that turns a node
 * into the string a record names.
 *
 * THEY TRAVEL AS ONE BECAUSE NONE OF THEM ANSWERS ANYTHING ALONE — a record is a
 * hash, and what that hash is over is a question only the function can answer.
 * One parameter is also one fixture in a test and one thing for the daemon to
 * build beside the graph it just read.
 *
 * THREE BOOKS AND NOT ONE TABLE WITH A VERDICT COLUMN. Approval, rejection and
 * acceptance are three different acts by a person, they lapse under different
 * arithmetic, and one of them — the acceptance — is about a criterion and its
 * evidence rather than about a node's own bytes. Kept apart, each file is a
 * diff a person can read, and writing in one can never lose a fact recorded in
 * another.
 */
export interface Ledgers {
  readonly approvals: ApprovalLedger;
  readonly rejections: RejectionLedger;
  readonly acceptances: AcceptanceLedger;
  readonly hash: PayloadHash;
}

/**
 * One thing the chain can be asked about.
 *
 * THREE POPULATIONS SHARE ONE SHAPE, and they are not all nodes. A node that
 * loaded is the ordinary case; a file that would not read is present and has
 * problems and no node; an id that only an edge names is present nowhere at all.
 * The last one is why `type` may be null: nothing on disk claims that id, so
 * there is no folder to read a type off, and guessing one from the id's prefix
 * would be inventing a fact about a node that does not exist.
 */
export interface ColorSubject {
  readonly id: string;
  /** Null only for an id nothing on disk claims. */
  readonly type: string | null;
  /** A file is there under this id, whether or not it parsed. */
  readonly present: boolean;
  /** Null when the file is absent or was refused. */
  readonly node: SpecNode | null;
  readonly problems: readonly string[];
}

/**
 * A node that loaded, as the chain asks about it: present, problem-free, and
 * itself.
 *
 * Written once here rather than spelled out at each of the three call sites,
 * because a subject assembled by hand is a place where `present: false` can be
 * typed by accident and turn a healthy node into a hole.
 */
export function livingSubject(node: SpecNode): ColorSubject {
  return { id: node.id, type: node.type, present: true, node, problems: [] };
}

/**
 * Everything a colour question needs about the REST of the graph, indexed once,
 * and the books the judgements are read out of.
 *
 * A review colours every node in the project, and each of them asks which edges
 * touch it — so the maps are built once and the whole pass is linear instead of
 * a scan of every edge per node.
 */
export interface ColorContext {
  /** The ids that parsed. An edge to anything else reaches nothing. */
  readonly living: ReadonlySet<string>;
  /**
   * The nodes themselves, by id — the one lookup the edge indexes cannot
   * answer. Closure asks it for the evidence a record names, and the review
   * queue asks it for the far end of every edge it walks; both would otherwise
   * scan `graph.nodes` per question, and both need the NODE and not merely the
   * fact that the id is living.
   */
  readonly nodes: ReadonlyMap<string, SpecNode>;
  readonly incoming: ReadonlyMap<string, readonly SpecEdge[]>;
  readonly outgoing: ReadonlyMap<string, readonly SpecEdge[]>;
  readonly ledgers: Ledgers;
}

function index(map: Map<string, SpecEdge[]>, key: string, edge: SpecEdge): void {
  const held = map.get(key);
  if (held === undefined) {
    map.set(key, [edge]);
  } else {
    held.push(edge);
  }
}

/**
 * The graph, indexed for colouring, with the ledgers carried in beside it.
 *
 * DANGLING EDGES ARE IN HERE ON PURPOSE. The loader keeps a relation whose
 * target no file answers to, and it is exactly what makes a hole visible: the
 * edge is what says somebody still expects that node to exist. What is NOT in
 * here is any edge of a refused file — the loader drops those with the file —
 * so a source that would not parse cannot anchor anything, which is the right
 * answer and the one `living` enforces again on the other side.
 */
export function colorContextOf(
  graph: SpecGraph,
  ledgers: Ledgers,
): ColorContext {
  const living = new Set<string>();
  const nodes = new Map<string, SpecNode>();
  for (const node of graph.nodes) {
    living.add(node.id);
    nodes.set(node.id, node);
  }
  const incoming = new Map<string, SpecEdge[]>();
  const outgoing = new Map<string, SpecEdge[]>();
  for (const edge of graph.edges) {
    index(incoming, edge.toId, edge);
    index(outgoing, edge.fromId, edge);
  }
  return { living, nodes, incoming, outgoing, ledgers };
}

/** Nothing indexed under an id is no edges, not a missing entry to guard against. */
function edgesOf(
  map: ReadonlyMap<string, readonly SpecEdge[]>,
  id: string,
): readonly SpecEdge[] {
  return map.get(id) ?? [];
}

/**
 * This node's outgoing relations as its own file writes them — the shape a
 * content hash is taken over.
 *
 * Dangling ones included, and that is the point: they are lines in this file, so
 * they are content the way the body is. One spelling, because four callers ask
 * the same question — the approval hash, the rejection hash, the closure's hash
 * of a piece of evidence, and the status surface, which hands the same list to
 * a person instead of to a digest — and four spellings that drifted apart would
 * disagree about what a node IS.
 */
export function writtenEdgesOf(
  node: SpecNode,
  context: ColorContext,
): NodeFileEdge[] {
  return edgesOf(context.outgoing, node.id).map((edge) => ({
    type: edge.type,
    toId: edge.toId,
  }));
}

/**
 * The hash a record would have to name for this node as it stands.
 *
 * THE CHAIN AND THE JUDGEMENT DOORS HASH THE SAME THING, which is why this is
 * one function they all call rather than several spellings of one formula. The
 * daemon takes it over the graph it has just loaded and writes the answer into a
 * ledger; `isHashMatched` and `isRejected` take it again on every read and
 * compare. Two spellings that drifted apart would turn every approval yellow the
 * moment it was made, and nothing would say which of the two halves was wrong.
 *
 * THE EDGES ARE THE NODE'S OUTGOING RELATIONS EXACTLY AS WRITTEN IN ITS FILE,
 * dangling ones included. They are lines in this file, so they are content the
 * way the body is; dropping the dangling ones would make this node's hash move
 * when some OTHER file appeared or vanished, and a person would be asked to
 * approve again for an edit nobody made here.
 */
export function contentHashOf(
  node: ParsedNode,
  edges: readonly NodeFileEdge[],
  hash: PayloadHash,
): string {
  return hash(approvalPayload(node.type, node.id, node, edges, blocksOf(node)));
}

/**
 * What a node is, and why. The reason is the sentence's subject — a caller
 * writes the words, this says which words.
 */
export type ColorVerdict =
  | {
      readonly color: "red";
      readonly reason:
        | "missing"
        | "malformed"
        | "orphan"
        | "off-target"
        // THE ONE REASON `colorOf` NEVER ANSWERS. Work logged under a task
        // whose turn has not come reads the ADDRESSED task's state — other
        // nodes' judgements — which the base chain cannot; `reviewGraph` asks
        // it, after the chain, via `prematureAddressOf` in task-state.ts.
        | "premature"
        | "rejected";
    }
  | { readonly color: "yellow"; readonly reason: "unapproved" | "changed" }
  | { readonly color: "green"; readonly reason: "approved" };

/**
 * An id something still names, with no file behind it.
 *
 * BOTH HALVES MATTER. A file that is not there and that nothing points at is not
 * a hole in anything — it is a node that was deleted and cleaned up after, or an
 * id somebody typed into a search box. It becomes a hole the moment a relation
 * in some other file still expects it, and that relation is what this asks for.
 */
export function isMissing(
  subject: ColorSubject,
  context: ColorContext,
): boolean {
  return (
    !subject.present && edgesOf(context.incoming, subject.id).length > 0
  );
}

/**
 * A file that is there and would not read as a node.
 *
 * THE CONTEXT IS UNUSED AND STAYS IN THE SIGNATURE. Every cross-file question a
 * spec file can fail — an id two files claim, a relation the canon does not
 * allow between these two types — was already asked by the loader, which put its
 * sentences in `problems` and left the file out of the graph. There is nothing
 * for this predicate to look up; it reads the answer the loader already wrote.
 * The parameter stays so that all seven predicates are one shape and the chain
 * can call them without remembering which is which.
 */
export function hasSchemaViolation(
  subject: ColorSubject,
  _context: ColorContext,
): boolean {
  return subject.problems.length > 0;
}

/** Whether this anchor is actually held — by a relation to a node the graph HAS. */
function isAnchorLive(
  node: SpecNode,
  anchor: AnchorEdge,
  context: ColorContext,
): boolean {
  if (anchor.direction === "in") {
    return edgesOf(context.incoming, node.id).some(
      (edge) =>
        edge.type === anchor.edgeType && context.living.has(edge.fromId),
    );
  }
  return edgesOf(context.outgoing, node.id).some(
    (edge) => edge.type === anchor.edgeType && context.living.has(edge.toId),
  );
}

/**
 * A node the canon says must be held, that nothing holds.
 *
 * THE FAR END HAS TO BE ALIVE. A relation to an id no file answers to, or to a
 * file that would not parse, is a line pointing at nothing — and a node hanging
 * off it is exactly as unanchored as a node with no line at all. That is why
 * this asks `living` rather than counting edges: the edge list is what somebody
 * wrote, and `living` is what the project actually has.
 *
 * ONE LIVE ANCHOR IS ENOUGH. The rules list alternatives, never requirements
 * together, so an `Interface` that is only consumed is anchored.
 *
 * A rootless type is never an orphan — see `ANCHOR_RULES` for why `Term`,
 * `DomainEntity` and `Goal` are where the canon starts.
 */
export function isOrphan(
  subject: ColorSubject,
  context: ColorContext,
): boolean {
  const node = subject.node;
  if (node === null) {
    return false;
  }
  const anchors = anchorsFor(node.type);
  if (anchors.length === 0) {
    return false;
  }
  return !anchors.some((anchor) => isAnchorLive(node, anchor, context));
}

/* ------------------------------------------------------------------ *
 * The aim rule
 * ------------------------------------------------------------------ */

/** The four relations the aim rule reads — canon edges #17, #22, #23, #24. */
const SUBMITS = "SUBMITS";
const TARGETS = "TARGETS";
const ADDRESSES = "ADDRESSES";
const CLAIMS = "CLAIMS";

/**
 * One breach of the aim rule, named at both ends and tagged by which claimant
 * broke it. The evidence arm carries the whole chain — the work log, the tasks
 * it addresses, what those tasks target, and what the evidence claims. The
 * report arm is one hop shorter: a verification report claims a TASK, so the
 * allowed set is the addressed tasks themselves — and `workLogId` is null only
 * for the one breach that needs no submitter, a report claiming more than one
 * task. Enough for a sentence a person can act on from either node.
 */
export type OffTarget =
  | {
      readonly claimant: "evidence";
      readonly workLogId: string;
      readonly evidenceId: string;
      readonly tasks: readonly string[];
      readonly targets: readonly string[];
      readonly claims: readonly string[];
    }
  | {
      readonly claimant: "report";
      readonly workLogId: string | null;
      readonly reportId: string;
      readonly addresses: readonly string[];
      readonly claims: readonly string[];
    };

/** The ids at the far end of this node's outgoing edges of one type, as written. */
function writtenTargetsOf(
  id: string,
  edgeType: string,
  context: ColorContext,
): string[] {
  const ids: string[] = [];
  for (const edge of edgesOf(context.outgoing, id)) {
    if (edge.type === edgeType) {
      ids.push(edge.toId);
    }
  }
  return ids.sort(compare);
}

/**
 * The tasks a work log addresses (living ones — a line at a task nobody has
 * written is a hole the missing rule already names) and, together, everything
 * those tasks target, as written.
 */
function aimOf(
  workLogId: string,
  context: ColorContext,
): { tasks: string[]; targets: string[] } {
  const tasks = writtenTargetsOf(workLogId, ADDRESSES, context).filter((id) =>
    context.living.has(id),
  );
  const targets = new Set<string>();
  for (const task of tasks) {
    for (const target of writtenTargetsOf(task, TARGETS, context)) {
      targets.add(target);
    }
  }
  return { tasks, targets: [...targets].sort(compare) };
}

/**
 * Whether one piece of evidence's claims all fall inside an aim.
 *
 * AN EMPTY AIM IS AN EMPTY ALLOWANCE, NOT AN EXEMPTION. A log that addresses
 * no task is fine on its own — foundation work exists — but its tasks target
 * nothing, so there is nothing its evidence may claim, and any claim under it
 * is a breach. It used to be an exemption ("under no aim, never red"), and the
 * gap showed on a screen: evidence under an aimless log could claim any
 * criterion in the project. The one asymmetry is deliberate: under an empty
 * aim, evidence that claims NOTHING raises no breach here — the missing claim
 * is the anchor rule's sentence (a claimless evidence is an orphan), and the
 * log itself has done nothing wrong.
 */
function breachOf(
  workLogId: string,
  evidenceId: string,
  aim: { tasks: string[]; targets: string[] },
  context: ColorContext,
): OffTarget | null {
  const claims = writtenTargetsOf(evidenceId, CLAIMS, context);
  const inside =
    aim.tasks.length === 0
      ? claims.length === 0
      : claims.length > 0 &&
        claims.every((claim) => aim.targets.includes(claim));
  return inside
    ? null
    : {
        claimant: "evidence",
        workLogId,
        evidenceId,
        tasks: aim.tasks,
        targets: aim.targets,
        claims,
      };
}

/**
 * Whether one verification report's claim falls inside its work log's
 * addressing — the report's own half of the aim rule, one hop shorter than the
 * evidence's: a report claims a TASK, so the allowed set is the tasks the
 * submitting log addresses, as written.
 *
 * EXACTLY ONE CLAIM IS THE CARDINALITY AND IT IS CHECKED ELSEWHERE TOO: a
 * report claiming several tasks is a breach whoever submitted it (the arm in
 * `offTargetOf` below), and a report claiming nothing is the anchor rule's
 * orphan, not this rule's business — the same asymmetry the evidence keeps.
 */
function reportBreachOf(
  workLogId: string,
  reportId: string,
  context: ColorContext,
): OffTarget | null {
  const claims = writtenTargetsOf(reportId, CLAIMS, context);
  if (claims.length === 0) {
    return null;
  }
  const addresses = writtenTargetsOf(workLogId, ADDRESSES, context);
  const inside =
    claims.length === 1 &&
    claims.every((claim) => addresses.includes(claim));
  return inside
    ? null
    : { claimant: "report", workLogId, reportId, addresses, claims };
}

/**
 * THE AIM RULE, OVER BOTH CLAIMANTS: a work log that addresses a task submits
 * evidence only for the criteria that task targets, and submits verification
 * reports only for the addressed tasks themselves — exactly one task per
 * report, because a report that verified two things verified neither whole.
 *
 * It is the one rule of the canon that reads three files at once — the log's
 * `ADDRESSES`, the task's `TARGETS`, the claimant's `CLAIMS` — and it is a
 * rule of GRAMMAR and not of judgement: it decides red, before anybody is
 * asked to approve anything, the way an orphan does. Work done under a task
 * that produces evidence for some other criterion, or a report for some other
 * task, is work the plan cannot account for, and the person who would
 * otherwise be asked to approve it should be shown the seam instead.
 *
 * BOTH ENDS GO RED, because either file may be the one to fix — the log's
 * `ADDRESSES` line, the task's `TARGETS` line or the claimant's `CLAIMS` line —
 * and a person standing on either node should read the same sentence. A work
 * log that addresses no task is under an EMPTY aim, not outside the rule: the
 * log itself is fine, and the moment its evidence or its report claims
 * anything both go red, because a claim is accounted for by the task the work
 * was done under and this work is under none. Only a claimant submitted by NO
 * log is outside the membership half — nothing ties it to a plan for this rule
 * to read — though a report claiming several tasks is a breach with or without
 * a submitter. Where several breaches exist the first in id order is named;
 * fixing it surfaces the next.
 *
 * Read off written edges, dangling ones included: a claim at a criterion no
 * file names is still a claim outside the aim, and a task's target that is
 * missing is still the target the plan wrote — the missing rule says its own
 * sentence about the id.
 */
export function offTargetOf(
  subject: ColorSubject,
  context: ColorContext,
): OffTarget | null {
  const node = subject.node;
  if (node === null) {
    return null;
  }
  if (node.type === "WorkLog") {
    const aim = aimOf(node.id, context);
    for (const submittedId of writtenTargetsOf(node.id, SUBMITS, context)) {
      const submitted = context.nodes.get(submittedId);
      if (submitted === undefined) {
        continue;
      }
      const breach =
        submitted.type === "Evidence"
          ? breachOf(node.id, submittedId, aim, context)
          : submitted.type === "VerificationReport"
            ? reportBreachOf(node.id, submittedId, context)
            : null;
      if (breach !== null) {
        return breach;
      }
    }
    return null;
  }
  if (node.type === "Evidence" || node.type === "VerificationReport") {
    // A REPORT CLAIMING SEVERAL TASKS IS A BREACH WHOEVER SUBMITTED IT — the
    // cardinality is the rule's own clause, not the submitter's, so it is
    // asked before the submitters are, and an unsubmitted report cannot carry
    // two claims either.
    if (node.type === "VerificationReport") {
      const claims = writtenTargetsOf(node.id, CLAIMS, context);
      if (claims.length > 1) {
        return {
          claimant: "report",
          workLogId: null,
          reportId: node.id,
          addresses: [],
          claims,
        };
      }
    }
    const submitters = edgesOf(context.incoming, node.id)
      .filter((edge) => edge.type === SUBMITS && context.living.has(edge.fromId))
      .map((edge) => edge.fromId)
      .sort(compare);
    for (const workLogId of submitters) {
      const breach =
        node.type === "Evidence"
          ? breachOf(workLogId, node.id, aimOf(workLogId, context), context)
          : reportBreachOf(workLogId, node.id, context);
      if (breach !== null) {
        return breach;
      }
    }
    return null;
  }
  return null;
}

/** The predicate the chain calls — the breach, as a yes or a no. */
export function isOffTarget(
  subject: ColorSubject,
  context: ColorContext,
): boolean {
  return offTargetOf(subject, context) !== null;
}

/** "AC-0001" / "AC-0001 and AC-0002" / "no criterion". */
function listOf(ids: readonly string[]): string {
  if (ids.length === 0) {
    return "no criterion";
  }
  if (ids.length === 1) {
    return ids[0] ?? "";
  }
  return `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1] ?? ""}`;
}

/**
 * The breach as one sentence, from the point of view of the node it is drawn
 * under — the same fact said from the log's side and from the evidence's, so
 * that a person can act on it wherever they meet it.
 */
export function offTargetSentence(subjectId: string, breach: OffTarget): string {
  if (breach.claimant === "report") {
    return reportSentence(subjectId, breach);
  }
  const tasks = breach.tasks.join(", ");
  const rule =
    "a work log's evidence claims only the criteria its task targets.";
  // The empty aim gets its own two sentences: "addresses , which targets no
  // criterion" is not a thing a person can read, and the fix is different —
  // draw the ADDRESSES line the work was done under, or withdraw the claim.
  if (breach.tasks.length === 0) {
    // "No task the graph holds" and not "no task": a log whose only ADDRESSES
    // lines reach missing or refused ids is in this arm too, and telling its
    // reader a line they can see does not exist would be a sentence the file
    // itself contradicts.
    const aimless =
      "a work log's evidence claims only the criteria its task targets, and this log addresses no task the graph holds.";
    if (subjectId === breach.workLogId) {
      return `${breach.workLogId} addresses no task the graph holds, but submits ${breach.evidenceId}, which claims ${listOf(breach.claims)} — ${aimless}`;
    }
    return `${breach.evidenceId} claims ${listOf(breach.claims)}, but the work log that submitted it, ${breach.workLogId}, addresses no task the graph holds — ${aimless}`;
  }
  if (subjectId === breach.workLogId) {
    return `${breach.workLogId} addresses ${tasks}, which targets ${listOf(breach.targets)}, but submits ${breach.evidenceId}, which claims ${listOf(breach.claims)} — ${rule}`;
  }
  return `${breach.evidenceId} claims ${listOf(breach.claims)}, but the work log that submitted it, ${breach.workLogId}, addresses ${tasks}, which targets ${listOf(breach.targets)} — ${rule}`;
}

/** "IT-0001" / "IT-0001 and IT-0002" / "no task" — the report's own list words. */
function taskListOf(ids: readonly string[]): string {
  if (ids.length === 0) {
    return "no task";
  }
  if (ids.length === 1) {
    return ids[0] ?? "";
  }
  return `${ids.slice(0, -1).join(", ")} and ${ids[ids.length - 1] ?? ""}`;
}

/**
 * The report's breach as one sentence, from either end — the same shape the
 * evidence's sentences keep, one hop shorter.
 */
function reportSentence(
  subjectId: string,
  breach: Extract<OffTarget, { claimant: "report" }>,
): string {
  const rule = "a verification report claims exactly one task its work log addresses.";
  // More than one claim breaks the rule whoever submitted the report, so the
  // sentence needs no work log — and for the one with no submitter there is
  // none to name.
  if (breach.claims.length > 1) {
    return subjectId === breach.workLogId
      ? `${breach.workLogId} submits ${breach.reportId}, which claims ${taskListOf(breach.claims)} — ${rule}`
      : `${breach.reportId} claims ${taskListOf(breach.claims)} — ${rule}`;
  }
  if (breach.addresses.length === 0) {
    const aimless = `${rule.slice(0, -1)}, and this log addresses no task at all.`;
    if (subjectId === breach.workLogId) {
      return `${breach.workLogId} addresses no task, but submits ${breach.reportId}, which claims ${taskListOf(breach.claims)} — ${aimless}`;
    }
    return `${breach.reportId} claims ${taskListOf(breach.claims)}, but the work log that submitted it, ${breach.workLogId ?? "nothing"}, addresses no task — ${aimless}`;
  }
  if (subjectId === breach.workLogId) {
    return `${breach.workLogId} addresses ${taskListOf(breach.addresses)}, but submits ${breach.reportId}, which claims ${taskListOf(breach.claims)} — ${rule}`;
  }
  return `${breach.reportId} claims ${taskListOf(breach.claims)}, but the work log that submitted it, ${breach.workLogId ?? "nothing"}, addresses ${taskListOf(breach.addresses)} — ${rule}`;
}

/* ------------------------------------------------------------------ *
 * The books
 * ------------------------------------------------------------------ */

/**
 * Whether a person's refusal of this node still stands — a record for the id,
 * taken over the bytes the node has NOW.
 *
 * IT IS THE SAME EQUALITY AS `isHashMatched`, READ THE OTHER WAY. An approval
 * that fits says "this is what I read and I am happy with it"; a rejection that
 * fits says "this is what I read and it is not right yet". Both are a hash
 * beside a node, so both lapse the moment the node moves — which is the whole
 * mechanism by which an agent's fix takes a node out of the red without anybody
 * pressing anything, and by which a stale refusal cannot go on blocking work
 * that was already done.
 *
 * A RECORD THAT NO LONGER FITS IS NOT AN ERROR AND IS NOT SWEPT. It is history:
 * this node was refused once, and here is what was said. `ReviewStatus` carries
 * it whatever the colour for exactly that reason.
 */
export function isRejected(
  subject: ColorSubject,
  context: ColorContext,
): boolean {
  const node = subject.node;
  const record = context.ledgers.rejections.get(subject.id);
  if (node === null || record === undefined) {
    return false;
  }
  // A record carrying a claimant map is a subject LEFT OPEN — a judgement about
  // the list of evidence claiming a criterion, or of reports claiming a task,
  // and not about the subject's own words — so it colours nothing here;
  // `closure.ts` reads those.
  if (record.leftOpen !== undefined) {
    return false;
  }
  return (
    record.rejectedHash ===
    contentHashOf(node, writtenEdgesOf(node, context), context.ledgers.hash)
  );
}

/**
 * Whether a person has ever approved this node — one lookup, by id, in the
 * approval ledger's records.
 *
 * IT ASKS NOTHING ABOUT THE NODE'S CONTENT, which is the next predicate's
 * question and not this one's. A record whose hash stopped fitting still answers
 * yes here, and that is what keeps "changed" a different word from "unapproved":
 * one says nobody has ever read this node, the other says somebody read an
 * earlier version of it and their name is worth showing.
 */
export function hasApproval(
  subject: ColorSubject,
  context: ColorContext,
): boolean {
  return context.ledgers.approvals.has(subject.id);
}

/**
 * Whether the record still fits the node.
 *
 * The hash is recomputed from the node as it stands — its identity line, its
 * canonical file, its outgoing relations, and any deletion proposal — so a body
 * edited, a name changed, a relation added or removed, or a deletion proposed
 * all land here as one answer: this is not what was approved.
 *
 * THE IDENTITY LINE IS WHAT KEEPS TWO NODES APART. A record holds a hash and no
 * id of its own beyond the key it is filed under, so identical bytes at two
 * addresses would otherwise share one hash and a copied node would arrive
 * already green. The payload starts with `type/id`, so it cannot.
 *
 * The type is the node's folder and the folder is a canon type by the time a
 * node exists, so the emit inside the payload has a format to write. The chain
 * never reaches this predicate for anything else — `colorOf` has already sent an
 * unknown type away as uncoloured.
 */
export function isHashMatched(
  subject: ColorSubject,
  context: ColorContext,
): boolean {
  const node = subject.node;
  const record = context.ledgers.approvals.get(subject.id);
  if (node === null || record === undefined) {
    return false;
  }
  return (
    record.approvedHash ===
    contentHashOf(node, writtenEdgesOf(node, context), context.ledgers.hash)
  );
}

/**
 * THE PRIORITY ORDER AND NOTHING ELSE.
 *
 * Null is not a colour and not an absence of information — it is a subject the
 * question does not apply to, which today is only a type the canon does not
 * have. Every canon type is coloured, the execution band included: a work log
 * is written by an agent and read by a person, and the same questions apply to
 * it as to a requirement. An id nothing claims has no type to ask about, so it
 * goes through: a hole is a hole whatever was supposed to fill it.
 *
 * THE REJECTION IS ASKED AFTER THE THREE STRUCTURAL REDS AND BEFORE THE TWO
 * YELLOWS. After, because a node whose file will not read or that hangs off
 * nothing has a fix that comes first and a refusal of its content would be the
 * wrong sentence to show. Before, because a refusal is the LATER word about a
 * node somebody may well have approved earlier, and the queue's whole rule is
 * that a rejected node is the agent's turn rather than the reviewer's.
 */
export function colorOf(
  subject: ColorSubject,
  context: ColorContext,
): ColorVerdict | null {
  if (subject.type !== null && !isColored(subject.type)) {
    return null;
  }
  if (isMissing(subject, context)) {
    return { color: "red", reason: "missing" };
  }
  if (hasSchemaViolation(subject, context)) {
    return { color: "red", reason: "malformed" };
  }
  if (isOrphan(subject, context)) {
    return { color: "red", reason: "orphan" };
  }
  if (isOffTarget(subject, context)) {
    return { color: "red", reason: "off-target" };
  }
  if (isRejected(subject, context)) {
    return { color: "red", reason: "rejected" };
  }
  if (!hasApproval(subject, context)) {
    return { color: "yellow", reason: "unapproved" };
  }
  if (!isHashMatched(subject, context)) {
    return { color: "yellow", reason: "changed" };
  }
  return { color: "green", reason: "approved" };
}
