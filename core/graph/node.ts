/**
 * A node of the spec graph: a short name to read it by, a name, and the prose
 * body a person writes.
 */
export interface SpecNode {
  id: string;
  type: string;
  shortName: string;
  name: string;
  content: string;
  createdAt: number;
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
