import {
  anchorsFor,
  isColored,
  type AnchorEdge,
  type SpecEdge,
  type SpecNode,
} from "../graph/index.js";
import { approvalPayload, blocksOf } from "../serialize/index.js";
import type { SpecGraph } from "../store/file-store.js";

/**
 * The colour of one node: red for a hole in the specification, yellow for a
 * change nobody has read, green for a node a person signed and nothing has
 * touched since.
 *
 * SIX PREDICATES AND ONE ORDER. Each question below is asked on its own and
 * answers about one fact — is the file there, does it parse, does anything hold
 * it, is it signed, is the signature this machine's, does the signature still
 * fit the bytes. `colorOf` is the ORDER those questions are asked in and it
 * holds no judgement of its own: every rule about what is wrong lives in a
 * predicate, so a rule can be read, tested and changed in one place, and the
 * composition stays a list of ifs a person can check against the spec.
 *
 * THE ORDER IS THE PRODUCT. A node that is both unanchored and unapproved is
 * told about the anchor, because approving a node that hangs off nothing is
 * work thrown away — the chain answers the first thing that is wrong and stops.
 *
 * A DELETION PROPOSAL NEEDS NO BRANCH HERE, and that is the design rather than
 * an omission. The proposal sits INSIDE the bytes an approval signs, so an agent
 * writing one un-matches the hash by itself and the node turns yellow with the
 * reason "changed" — the same yellow an edited body earns, because it is the
 * same fact: this node is not what the person approved. Stripping the proposal
 * puts the bytes back, the hash fits again, and the node is green with nothing
 * else undone. No state was stored, so no state had to be repaired.
 *
 * THIS MODULE IS PURE AND BROWSER-SAFE. No filesystem, no clock, no crypto — the
 * two things only a machine with a key can do arrive as `Seal`, and the graph
 * arrives as data. The same graph and the same seal always give the same colour.
 */

/**
 * The two questions a key answers. The daemon builds one over `~/.shall/key`;
 * core never sees the key and could not forge a tag if it wanted to.
 */
export interface Seal {
  /** `sha256:<hex>` over the payload bytes. */
  readonly hash: (payload: string) => string;
  /** Whether `tag` is the HMAC of `hash` under this machine's key. */
  readonly verifies: (hash: string, tag: string) => boolean;
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
 * Everything a colour question needs about the REST of the graph, indexed once.
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
  readonly seal: Seal;
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
 * The graph, indexed for colouring.
 *
 * DANGLING EDGES ARE IN HERE ON PURPOSE. The loader keeps a relation whose
 * target no file answers to, and it is exactly what makes a hole visible: the
 * edge is what says somebody still expects that node to exist. What is NOT in
 * here is any edge of a refused file — the loader drops those with the file —
 * so a source that would not parse cannot anchor anything, which is the right
 * answer and the one `living` enforces again on the other side.
 */
export function colorContextOf(graph: SpecGraph, seal: Seal): ColorContext {
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
  return { living, incoming, outgoing, seal };
}

/** Nothing indexed under an id is no edges, not a missing entry to guard against. */
function edgesOf(
  map: ReadonlyMap<string, readonly SpecEdge[]>,
  id: string,
): readonly SpecEdge[] {
  return map.get(id) ?? [];
}

/**
 * What a node is, and why. The reason is the sentence's subject — a caller
 * writes the words, this says which words.
 */
export type ColorVerdict =
  | { readonly color: "red"; readonly reason: "missing" | "malformed" | "orphan" }
  | { readonly color: "yellow"; readonly reason: "unapproved" | "forged" | "changed" }
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
 * The parameter stays so that all six predicates are one shape and the chain can
 * call them without remembering which is which.
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

/** Whether a person has ever signed this node. */
export function hasApproval(
  subject: ColorSubject,
  _context: ColorContext,
): boolean {
  return subject.node?.approval !== undefined;
}

/**
 * Whether the tag was made by THIS machine's key.
 *
 * An agent can copy the whole shape of an approval block — the hash is
 * computable from the file — and it cannot produce the tag, because the key
 * never leaves the machine and never reaches core. This is the whole of what
 * makes green a state only a person can put a node into.
 */
export function isTagValid(
  subject: ColorSubject,
  context: ColorContext,
): boolean {
  const approval = subject.node?.approval;
  if (approval === undefined) {
    return false;
  }
  return context.seal.verifies(approval.hash, approval.tag);
}

/**
 * Whether the signature still fits the node.
 *
 * The payload is recomputed from the node as it stands — its identity line, its
 * canonical file without the approval block, its outgoing relations, and any
 * deletion proposal — so a body edited, a name changed, a relation added or
 * removed, or a deletion proposed all land here as one answer: this is not what
 * was approved.
 *
 * The type is the node's folder and the folder is a canon type by the time a
 * node exists, so the emit inside `approvalPayload` has a format to write. The
 * chain never reaches this predicate for anything else — `colorOf` has already
 * sent an unknown type away as uncoloured.
 */
export function isHashMatched(
  subject: ColorSubject,
  context: ColorContext,
): boolean {
  const node = subject.node;
  const approval = node?.approval;
  if (node === null || approval === undefined) {
    return false;
  }
  const edges = edgesOf(context.outgoing, node.id).map((edge) => ({
    type: edge.type,
    toId: edge.toId,
  }));
  return (
    approval.hash ===
    context.seal.hash(
      approvalPayload(node.type, node.id, node, edges, blocksOf(node)),
    )
  );
}

/**
 * THE PRIORITY ORDER AND NOTHING ELSE.
 *
 * Null is not a colour and not an absence of information — it is a node the
 * question does not apply to. The execution band is the record of work done, and
 * a work log is neither approved nor stale; asking whether it is green is asking
 * something it has no answer to. An id nothing claims has no type to ask about,
 * so it goes through: a hole is a hole whatever was supposed to fill it.
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
  if (!isTagValid(subject, context)) {
    return { color: "yellow", reason: "forged" };
  }
  if (!isHashMatched(subject, context)) {
    return { color: "yellow", reason: "changed" };
  }
  return { color: "green", reason: "approved" };
}
