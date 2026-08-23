import { emitNodeFile } from "./emit.js";
import { parseNodeFile } from "./parse.js";

/**
 * core/serialize — the graph as bytes, and bytes back into the graph.
 *
 * One node is one markdown file, and this module is the whole of what that
 * means: the frozen file format, the scalar rule under it, the reader that is
 * lenient about how a file was written, and the templates a person starts from.
 * The three ledgers — approvals, rejections and acceptances, the files Shall
 * writes itself, YAML and no prose — are read and written here too, under the
 * same scalar rule, the same YAML contract and one shared root grammar; and so
 * is the activity feed under `ledger/feed/` — the list of what the agents
 * finished, a list and not a map — read and written here under the same scalar
 * rule with a grammar of its own.
 *
 * IT IS PURE. No filesystem, no clock, no randomness — the fs lives in
 * `core/store`, the timestamps live in `stat`, and the type and id of a node
 * live in its path. The same graph is therefore always the same bytes, which is
 * what makes `git diff` mean what it says and two people's identical edits
 * merge without a conflict.
 */
export {
  approvalPayload,
  BLOCKING_KEY,
  blocksOf,
  COMMITS_KEY,
  COMMITS_TYPE,
  DELETION_PROPOSED_KEY,
  emitNodeFile,
  FENCE,
  FINDING_TYPE,
  RELATED_NODES_KEY,
  valuesOf,
} from "./emit.js";
export type { NodeFileBlocks, NodeFileEdge, NodeFileFields } from "./emit.js";
export {
  ACTIVITY_DIR,
  ACTIVITY_KINDS,
  activityFileFor,
  activityMonthOf,
  emitActivity,
  isActivityKind,
  parseActivity,
} from "./activity.js";
export type {
  ActivityKind,
  ActivityReading,
  ActivityRecord,
} from "./activity.js";
export {
  ACCEPTANCES_FILE,
  emitAcceptanceLedger,
  parseAcceptanceLedger,
} from "./acceptances.js";
export type {
  AcceptanceLedger,
  AcceptanceLedgerReading,
  AcceptanceRecord,
} from "./acceptances.js";
export {
  emitApprovalLedger,
  LEDGER_FILE,
  parseApprovalLedger,
} from "./ledger.js";
export type {
  ApprovalLedger,
  ApprovalLedgerReading,
  ApprovalRecord,
} from "./ledger.js";
export {
  emitRejectionLedger,
  parseRejectionLedger,
  REJECTIONS_FILE,
} from "./rejections.js";
export type {
  RejectionLedger,
  RejectionLedgerReading,
  RejectionRecord,
} from "./rejections.js";
export { emitScalar, isPlainSafe } from "./scalar.js";
export { parseNodeFile } from "./parse.js";
export type { NodeFileReading, ParsedNode } from "./parse.js";
export { emitScaffold, emitTemplate } from "./template.js";

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
  // The parse is passed as the blocks too — `ParsedNode` satisfies the shape —
  // so a file carrying a deletion proposal is compared against the whole of
  // what a save would write. Left out, every proposed file would read as
  // "valid but not canonical" over a block already written exactly as this
  // emitter writes it.
  return emitNodeFile(type, reading.node, reading.edges, reading.node) === text;
}
