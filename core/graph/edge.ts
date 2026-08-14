/**
 * An edge of the spec graph: one relation, drawn from a source node to a
 * target.
 *
 * IT LIVES IN THE SOURCE NODE'S FILE AND NOWHERE ELSE. Mirroring it on the
 * target would give one fact two homes, and two homes are two things that can
 * disagree after a merge — so an edge is read out of the `edges:` list of the
 * file it leaves, and deleting that file deletes it with no bookkeeping.
 *
 * THE ID IS SYNTHESIZED, NEVER STORED. `<fromId> <type> <toId>` says everything
 * an edge is, so there is nothing to keep in a file and nothing that can be
 * stale: two files claiming one edge is not a state that can be written. The
 * web reads the id opaquely — a React Flow key, a highlight-set member, the
 * argument to `spec.removeEdge` — and `removeEdge` parses the triple back out
 * of it to find the file to rewrite.
 *
 * THERE IS NO `createdAt`. An edge is a line in a file, and the file's mtime is
 * the only time anything here has; a per-edge stamp would have to be invented
 * at write and would then be a fact with no home.
 *
 * AND THE SOURCE NODE'S STAMP MOVES WHEN THIS EDGE DOES. Adding or removing a
 * relation rewrites the file it lives in, and a delete elsewhere rewrites every
 * file that referred to the deleted node — so the "Updated" a panel shows for a
 * node can move without any field of that node changing. It is the honest
 * answer while the file is the single home of the fact: the file really was
 * written. What a stamp per edge would buy is not worth a second home for a
 * time nobody edits.
 */
export interface SpecEdge {
  id: string;
  type: string;
  fromId: string;
  toId: string;
}

/**
 * A space, which is the one character that cannot appear in either end of the
 * triple: an id is `[A-Za-z0-9._-]` by the id door, and an edge type is
 * `[A-Z_]+` by the canon. That is what makes the split below unambiguous
 * without an escape rule.
 */
const SEPARATOR = " ";

export function formatEdgeId(
  fromId: string,
  type: string,
  toId: string,
): string {
  return `${fromId}${SEPARATOR}${type}${SEPARATOR}${toId}`;
}

/**
 * The triple back out of an id, or `null` when the string is not one — which is
 * a caller sending an id it did not get from us, so the answer is the caller's
 * to turn into a sentence. Nothing here checks that the three parts name
 * anything real; that is the graph's question and not the string's.
 */
export function parseEdgeId(id: string): Omit<SpecEdge, "id"> | null {
  const parts = id.split(SEPARATOR);
  if (parts.length !== 3) {
    return null;
  }
  const [fromId, type, toId] = parts;
  if (
    fromId === undefined ||
    type === undefined ||
    toId === undefined ||
    fromId === "" ||
    type === "" ||
    toId === ""
  ) {
    return null;
  }
  return { type, fromId, toId };
}
