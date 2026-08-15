import {
  anchorsFor,
  isColored,
  type AnchorEdge,
  type SpecEdge,
  type SpecNode,
} from "../graph/index.js";
import {
  approvalPayload,
  blocksOf,
  type ApprovalLedger,
  type NodeFileEdge,
  type ParsedNode,
} from "../serialize/index.js";
import type { SpecGraph } from "../store/file-store.js";

/**
 * The colour of one node: red for a hole in the specification, yellow for a
 * change nobody has read, green for a node a person approved and nothing has
 * touched since.
 *
 * FIVE PREDICATES AND ONE ORDER. Each question below is asked on its own and
 * answers about one fact — is the file there, does it parse, does anything hold
 * it, has a person approved it, does that approval still fit the bytes.
 * `colorOf` is the ORDER those questions are asked in and it holds no judgement
 * of its own: every rule about what is wrong lives in a predicate, so a rule can
 * be read, tested and changed in one place, and the composition stays a list of
 * ifs a person can check against the spec.
 *
 * A COLOUR IS THE ARITHMETIC OF TWO FILES: what the spec says now, hashed as it
 * stands, against what the ledger remembers, which is the hash a person
 * approved. Nothing is signed and nothing needs to be — the node file is pure
 * authorship and the ledger is the daemon's own book — so green is an equality
 * between two files and never a claim stored inside one of them. That is what
 * lets it be recomputed on every read, and why a hand edit or a `git checkout`
 * moves a colour with nobody told about it.
 *
 * THE ORDER IS THE PRODUCT. A node that is both unanchored and unapproved is
 * told about the anchor, because approving a node that hangs off nothing is
 * work thrown away — the chain answers the first thing that is wrong and stops.
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
 * graph arrives as data, the ledger's records arrive as data beside it, and the
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
 * have since moved reads as "changed" and the person approves again. What it
 * cannot cost is a false green, because green is that equality and nothing else.
 */

/**
 * `sha256:<hex>` over an approval payload — the daemon's function, injected;
 * core hashes nothing itself.
 *
 * Injected rather than imported so that this module never names a crypto
 * library and keeps its promise to run anywhere. The daemon holds the one
 * implementation, and every hash the ledger remembers was written with it.
 */
export type PayloadHash = (payload: string) => string;

/**
 * What the chain knows about approvals: the ledger's records, and the hash that
 * turns a node into the string a record names.
 *
 * The two travel as one because neither answers anything alone — a record is a
 * hash, and what that hash is over is a question only the function can answer.
 * One parameter is also one fixture in a test and one thing for the daemon to
 * build beside the graph it just read.
 */
export interface Approvals {
  readonly records: ApprovalLedger;
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
 * Everything a colour question needs about the REST of the graph, indexed once,
 * and the book the approvals are read out of.
 *
 * A review colours every node in the project, and each of them asks which edges
 * touch it — so the maps are built once and the whole pass is linear instead of
 * a scan of every edge per node.
 */
export interface ColorContext {
  /** The ids that parsed. An edge to anything else reaches nothing. */
  readonly living: ReadonlySet<string>;
  readonly incoming: ReadonlyMap<string, readonly SpecEdge[]>;
  readonly outgoing: ReadonlyMap<string, readonly SpecEdge[]>;
  readonly approvals: Approvals;
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
 * The graph, indexed for colouring, with the ledger carried in beside it.
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
  approvals: Approvals,
): ColorContext {
  const living = new Set<string>();
  for (const node of graph.nodes) {
    living.add(node.id);
  }
  const incoming = new Map<string, SpecEdge[]>();
  const outgoing = new Map<string, SpecEdge[]>();
  for (const edge of graph.edges) {
    index(incoming, edge.toId, edge);
    index(outgoing, edge.fromId, edge);
  }
  return { living, incoming, outgoing, approvals };
}

/** Nothing indexed under an id is no edges, not a missing entry to guard against. */
function edgesOf(
  map: ReadonlyMap<string, readonly SpecEdge[]>,
  id: string,
): readonly SpecEdge[] {
  return map.get(id) ?? [];
}

/**
 * The hash a record would have to name for this node as it stands.
 *
 * THE CHAIN AND THE APPROVE DOOR HASH THE SAME THING, which is why this is one
 * function both call rather than two spellings of one formula. The daemon takes
 * it over the graph it has just loaded and writes the answer into the ledger;
 * `isHashMatched` takes it again on every read and compares. Two spellings that
 * drifted apart would turn every approval yellow the moment it was made, and
 * nothing would say which of the two halves was wrong.
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
  | { readonly color: "red"; readonly reason: "missing" | "malformed" | "orphan" }
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
 * The parameter stays so that all five predicates are one shape and the chain
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

/**
 * Whether a person has ever approved this node — one lookup, by id, in the
 * ledger's records.
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
  return context.approvals.records.has(subject.id);
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
  const record = context.approvals.records.get(subject.id);
  if (node === null || record === undefined) {
    return false;
  }
  const edges = edgesOf(context.outgoing, node.id).map((edge) => ({
    type: edge.type,
    toId: edge.toId,
  }));
  return (
    record.approvedHash === contentHashOf(node, edges, context.approvals.hash)
  );
}

/**
 * THE PRIORITY ORDER AND NOTHING ELSE.
 *
 * Null is not a colour and not an absence of information — it is a subject the
 * question does not apply to, which today is only a type the canon does not
 * have. Every canon type is coloured, the execution band included: a work log
 * is written by an agent and read by a person, and the same three questions
 * apply to it as to a requirement. An id nothing claims has no type to ask
 * about, so it goes through: a hole is a hole whatever was supposed to fill it.
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
  if (!hasApproval(subject, context)) {
    return { color: "yellow", reason: "unapproved" };
  }
  if (!isHashMatched(subject, context)) {
    return { color: "yellow", reason: "changed" };
  }
  return { color: "green", reason: "approved" };
}
