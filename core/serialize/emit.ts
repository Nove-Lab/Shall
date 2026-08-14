import { isNodeType } from "../graph/index.js";
import { emitScalar } from "./scalar.js";

/**
 * A node as the bytes of its own file — the canonical form, and the only form
 * this repository ever writes.
 *
 * WHAT IS NOT IN THE FILE IS THE POINT. The type is the folder the file sits in
 * and the id is its name, so neither is written inside; the two stamps are the
 * filesystem's `mtime`, so there is no date to write either. Every fact has one
 * home, and a file that repeated one of them would be a second home that a
 * merge could set against the first.
 *
 * THE FRONTMATTER IS THE MACHINE'S AND THE BODY IS THE AUTHOR'S. Above the
 * fence live the three facts the graph itself needs — the two names and the
 * outgoing edges — written canonically: keys in one order, edges in one order,
 * LF, no BOM, one trailing newline, so two people who make the same edit
 * produce the same bytes and therefore no conflict. Below the fence is the
 * specification as free markdown, and emit is the IDENTITY on it: whatever a
 * person or an agent wrote is what the file carries, byte for byte.
 *
 * It is a pure function of the node: no clock, no filesystem, no randomness,
 * and no help from the `yaml` package, which reads these files and never writes
 * one.
 */

/** The frontmatter fence, opening and closing, exactly three hyphens on a line. */
export const FENCE = "---";

/**
 * The one place the wire name and the file name of this field differ.
 * `shortName` is what every layer above calls it — the panel, the tRPC
 * procedures, `SpecNode` — and `short_name` is what the file says, because a
 * file key is something a person types and snake_case is what the format has
 * always used. The translation happens here and in the parser, and nowhere
 * else.
 */
export const SHORT_NAME_KEY = "short_name";

export const NAME_KEY = "name";

export const EDGES_KEY = "edges";

/**
 * What a file says about its node. It is `SpecNode` minus the four facts a file
 * does not carry, written as its own shape so that a caller cannot pass a stamp
 * or an id in and believe it landed somewhere.
 */
export interface NodeFileFields {
  readonly shortName: string;
  readonly name: string;
  readonly body: string;
}

/**
 * An outgoing edge, as small as the file needs it: the source is the file
 * itself and the id is synthesized from the triple, so neither is written.
 * `SpecEdge` satisfies this shape, which is what callers hand over.
 */
export interface NodeFileEdge {
  readonly type: string;
  readonly toId: string;
}

/**
 * Byte-wise ascending by `(type, to)`.
 *
 * Compared with `<` rather than `localeCompare`, which would sort by the
 * daemon's locale and put a file's bytes at the mercy of an environment
 * variable. Edge types are `[A-Z_]+` and ids are ASCII by the id door, so
 * UTF-16 order, byte order and the order a person expects are the same order.
 */
function byTypeThenTarget(a: NodeFileEdge, b: NodeFileEdge): number {
  if (a.type !== b.type) {
    return a.type < b.type ? -1 : 1;
  }
  if (a.toId !== b.toId) {
    return a.toId < b.toId ? -1 : 1;
  }
  return 0;
}

/**
 * The file, whole, ending in exactly one newline.
 *
 * An empty body is an ABSENT tail, never a blank line after the fence: empty
 * and absent would then be two spellings of one state, and the file of a node
 * with nothing to say should end where its facts end.
 *
 * It throws for a type outside the canon, which is the one thing it cannot
 * write around. That is a caller that never went through a door, so it is a
 * defect and not a refusal — refusals are sentences a person reads in a panel,
 * and this is a stack trace a developer reads once.
 */
export function emitNodeFile(
  type: string,
  node: NodeFileFields,
  edges: readonly NodeFileEdge[],
): string {
  if (!isNodeType(type)) {
    throw new Error(`Unknown node type: ${type}`);
  }

  const lines: string[] = [FENCE];
  lines.push(`${SHORT_NAME_KEY}: ${emitScalar(node.shortName)}`);
  lines.push(`${NAME_KEY}: ${emitScalar(node.name)}`);

  // Omitted entirely when there are none, rather than written as an empty list:
  // a node with no relations should read as a node with nothing to say about
  // relations, and `edges: []` is a sentence about emptiness.
  if (edges.length > 0) {
    lines.push(`${EDGES_KEY}:`);
    // Copied before sorting: the caller's array is the caller's, and a store
    // that handed us its own list would find it reordered underneath it.
    for (const edge of [...edges].sort(byTypeThenTarget)) {
      // Both ends go through the scalar rule too. An id may be `0x1A` or `true`
      // — the id door allows letters and digits and does not know YAML — and
      // written plain either one would come back a number or a boolean.
      lines.push(`  - type: ${emitScalar(edge.type)}`);
      lines.push(`    to: ${emitScalar(edge.toId)}`);
    }
  }
  lines.push(FENCE);

  let text = `${lines.join("\n")}\n`;

  // A blank line, then the body exactly as it is stored, and one newline to end
  // it. The blank line is markdown's own paragraph separation from the fence,
  // and the body is untouched: emit is the identity on it, which is what makes
  // "the file is the truth" literal — the bytes a person reads are the bytes
  // the author wrote. The body's own edges were settled at the door (LF, no
  // leading or trailing blank lines), so wrapping it in exactly one blank line
  // and one newline re-reads as the same body.
  if (node.body !== "") {
    text += `\n${node.body}\n`;
  }

  return text;
}
