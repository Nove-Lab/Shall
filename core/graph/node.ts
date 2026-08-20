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
  /**
   * The commits this work produced, as the shas git gave them — a WorkLog's
   * key and no other type's, so a reader of any other node never sees it set.
   * A sha and nothing else: the message, the author and the date are git's to
   * answer for, and a list that copied them would be a second home for facts
   * whose first home is the repository. Author content, inside the approval
   * payload like the edges are; an ordinary save carries it over.
   */
  commits?: string[] | undefined;
  /**
   * Whether this finding is stopping the work that found it — a Finding's key
   * and no other type's. It is the author's judgement and not a lock: nothing
   * computed reads it, no gate consults it, and a task is neither blocked nor
   * freed by one. Absent and `false` are one state, so only `true` is ever
   * written; a finding that is not blocking says nothing about it.
   */
  blocking?: boolean | undefined;
  /**
   * The nodes a finding is about, as a hint for whoever reads it — a Finding's
   * key and no other type's, and NOT a relation. Nothing resolves these ids:
   * one the graph cannot answer to is not a fault, an empty list is not a
   * fault, and no walk follows them. A finding starts no relation at all, so
   * this is how it says what it concerns without a line in somebody else's
   * file.
   */
  relatedNodes?: string[] | undefined;
  /**
   * The one machine block, in a file that is otherwise the author's. A person
   * does not edit it by hand, and every ordinary save carries it over
   * untouched. The explicit `| undefined` is what lets a caller build a node
   * with `{ deletionProposed: maybe }` under `exactOptionalPropertyTypes`.
   */
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
 *
 * `commits` IS THE SAME BARGAIN FOR A WORKLOG'S LIST, WITH ONE MORE SPELLING:
 * absent means "leave what the file has", so a caller that never heard of the
 * key — an older client, an edit that reached only the names — carries the
 * list over untouched; present means "this is the list now", and an empty
 * list is a work log that produced no commit. On any other type the reader
 * refuses the key by name, so a Requirement cannot pick one up by accident.
 *
 * `blocking` AND `relatedNodes` ARE THAT SAME BARGAIN FOR A FINDING. Absent
 * carries over, present replaces. The carry-over is written `??` and not `||`
 * for `blocking`, because `false` is a judgement somebody made and only
 * `undefined` means they did not reach the key.
 */
export interface SpecNodeValues {
  shortName: string;
  name: string;
  body: string;
  commits?: readonly string[] | undefined;
  blocking?: boolean | undefined;
  relatedNodes?: readonly string[] | undefined;
}
