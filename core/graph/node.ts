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
export interface SpecNode {
  id: string;
  type: string;
  shortName: string;
  name: string;
  body: string;
  createdAt: number;
  updatedAt: number;
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
