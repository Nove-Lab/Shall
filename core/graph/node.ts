/**
 * A node of the spec graph.
 *
 * One shape for every type today: `attrs` is a JSON object in a text column,
 * which the architecture calls out as temporary — each node type is meant to
 * grow its own columns, and its layer (intent / design / execution) with them.
 */
export interface SpecNode {
  id: string;
  type: string;
  /** A JSON object, stored as text. */
  attrs: string;
  createdAt: number;
}

/** The fields an edit may reach — id and createdAt are the node's identity. */
export interface SpecNodeValues {
  type: string;
  attrs: string;
}
