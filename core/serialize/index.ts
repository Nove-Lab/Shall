import { emitNodeFile } from "./emit.js";
import { parseNodeFile } from "./parse.js";

/**
 * core/serialize — the graph as bytes, and bytes back into the graph.
 *
 * One node is one markdown file, and this module is the whole of what that
 * means: the frozen file format, the scalar rule under it, the reader that is
 * lenient about how a file was written, and the templates a person starts from.
 *
 * IT IS PURE. No filesystem, no clock, no randomness — the fs lives in
 * `core/store`, the timestamps live in `stat`, and the type and id of a node
 * live in its path. The same graph is therefore always the same bytes, which is
 * what makes `git diff` mean what it says and two people's identical edits
 * merge without a conflict.
 */
export { emitNodeFile, FENCE } from "./emit.js";
export type { NodeFileEdge, NodeFileFields } from "./emit.js";
export { emitScalar, isPlainSafe } from "./scalar.js";
export { parseNodeFile } from "./parse.js";
export type { NodeFileReading, ParsedNode } from "./parse.js";
export { emitTemplate } from "./template.js";

/**
 * Whether these bytes are already exactly what Shall would write.
 *
 * This is the whole of the "valid but not canonical" note `shall check` serves:
 * a file with comments, another quoting style, keys in another order or a
 * missing final newline is read perfectly well and still answers `false` here,
 * because the next save from the panel will rewrite it and the person should
 * hear that from a check rather than from a diff they did not expect.
 *
 * A file that cannot be read is not canonical either. It has a problem, and a
 * problem is a louder thing than a note, so the caller reports that instead.
 */
export function isCanonical(
  type: string,
  fileName: string,
  text: string,
): boolean {
  const reading = parseNodeFile(type, fileName, text);
  if (reading.node === undefined) {
    return false;
  }
  return emitNodeFile(type, reading.node, reading.edges) === text;
}
