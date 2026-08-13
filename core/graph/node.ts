/**
 * A node of the spec graph: a short name to read it by, a name, and the typed
 * attributes its own type carries.
 *
 * `attributes` holds the FILLED ONES ONLY. An optional slot a person left alone
 * is an absent key, never an empty string — the store writes NULL for it and
 * omits it on the way back — so a reader asks whether the key is there and
 * never compares against `""`. What the keys may be is `attributesFor(type)`'s
 * answer and nothing else; this shape is deliberately a plain map so that core
 * carries the roster in one file rather than in every signature.
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
  attributes: Record<string, string>;
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
 * `attributes` OVERWRITES THE WHOLE MAP: a slot the map does not name is
 * cleared, not kept. This is safe only because the panel always sends the
 * type's entire roster, so an absent key means "the person emptied it" and
 * never "the caller had nothing to say about it". It is the opposite of the
 * per-key merge the previous system used, and the difference is invisible until
 * a caller sends a partial map, so no caller may send one.
 */
export interface SpecNodeValues {
  shortName: string;
  name: string;
  attributes: Record<string, string>;
}
