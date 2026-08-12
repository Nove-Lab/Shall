/**
 * An edge of the spec graph. The table exists; nothing reads or writes it yet.
 *
 * When it does, an edge also records the version of the node it points at, so
 * staleness is a comparison and not a guess — see core/arith.
 */
export interface SpecEdge {
  id: string;
  type: string;
  fromId: string;
  toId: string;
  createdAt: number;
}
