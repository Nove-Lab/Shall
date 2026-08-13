/**
 * A node of the spec graph: a short name to read it by, a name, and the prose
 * body a person writes.
 *
 * The two instants are both stamps rather than fields — nothing on a form
 * offers them, and core has no clock to make one, so whoever writes the row
 * brings them. A node that has never been edited carries the same value twice:
 * it was last modified when it was written.
 */
export interface SpecNode {
  id: string;
  type: string;
  shortName: string;
  name: string;
  content: string;
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
 */
export interface SpecNodeValues {
  shortName: string;
  name: string;
  content: string;
}
