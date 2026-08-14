/**
 * A node of the spec graph: a short name to read it by, a name, and the body —
 * the specification itself, as free markdown.
 *
 * `body` IS OPAQUE TEXT AND THE GRAPH DOES NOT READ IT. What a node says is the
 * author's — a person's or an agent's — and Shall renders it back exactly as it
 * was written. The structure the graph needs lives beside it, not inside it:
 * the type is the folder, the id is the filename, the two names are frontmatter
 * keys, and the relations are the `edges:` list. Everything the templates
 * suggest about the body — the `## Definition` a Term usually opens with — is a
 * starting shape, never a rule, so an empty body is a node with nothing to say
 * yet and not a refusal.
 *
 * The two instants are both stamps rather than fields — nothing on a form offers
 * them, and core has no clock to make one, so whoever reads the file brings
 * them. They are the file's own mtime, twice: a file has one modification time
 * and no birth time worth trusting, so a node reads as having been written when
 * it was last modified. That is also why a relation added to this node moves its
 * stamp — the relation is a line in this node's file, and writing the line
 * writes the file.
 */
/**
 * A human's signature over one node, written by the daemon on the web approve
 * action and by nothing else. `hash` is `sha256:<hex>` over the node's payload
 * — its own `type/id` line, then its canonical file without this block — and
 * `tag` is `hmac:<hex>`, the HMAC-SHA256 of that hash string under this
 * machine's key at `~/.shall/key`. An agent can copy the shape but not the
 * tag, which is the whole of what makes green a state only a person can make.
 */
export interface NodeApproval {
  readonly hash: string;
  readonly tag: string;
  /** The username of whoever pressed approve. */
  readonly by: string;
  /** ISO 8601, the daemon's clock at the moment of the write. */
  readonly at: string;
}

/**
 * An agent asking for this node to go, written by the agent into the file
 * itself — the one deletion path an agent has. The block is inside the
 * approval payload, so writing it un-matches the hash and the node turns
 * yellow with nobody else lifting a finger; a person then approves the
 * deletion or rejects it in the panel.
 */
export interface NodeDeletionProposal {
  readonly by: string;
  readonly rationale: string;
}

export interface SpecNode {
  id: string;
  type: string;
  shortName: string;
  name: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  /**
   * The two machine blocks, in a file that is otherwise the author's. A person
   * edits neither by hand, and every ordinary save carries both over
   * untouched. The explicit `| undefined` is what lets a caller build a node
   * with `{ approval: maybe }` under `exactOptionalPropertyTypes`.
   */
  approval?: NodeApproval | undefined;
  deletionProposed?: NodeDeletionProposal | undefined;
}

/**
 * The fields an edit may reach — which is why `id` and `type` are missing.
 *
 * Both are the node's identity and are settled at create. The id is the primary
 * key and the thing every edge names, so moving it would strand the edges; the
 * type is what decides which edges are grammatical at all, so changing it would
 * leave incident edges the grammar no longer allows. A different type is a
 * different node.
 *
 * `body` REPLACES THE WHOLE BODY: the panel edits it as one text and sends it
 * back as one text, so what arrives is the document as the author left it and
 * never a patch to merge.
 */
export interface SpecNodeValues {
  shortName: string;
  name: string;
  body: string;
}
