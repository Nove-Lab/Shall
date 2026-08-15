/**
 * core/store — the project's `.shall/spec` folder, and the approval ledger
 * beside it.
 *
 * The only core module that touches a filesystem, and the only one that knows
 * where a node lives. What a file SAYS is `core/serialize`'s business and what
 * it may say is `core/graph`'s; this module owns the folder around them — which
 * paths are node files, how a write lands, and what a whole directory of
 * markdown amounts to when it is read at once. The ledger is the one file under
 * `.shall` that is nobody's authorship — Shall writes it and Shall reads it —
 * and it goes through a door of its own, keeping the same manners.
 *
 * It replaces the sqlite store that stood here. The queue that serialized writes
 * survived the change; everything else went with the database.
 */
export { readApprovalLedger, recordApproval } from "./approval-ledger.js";
export {
  addEdge,
  approveNodeFile,
  clearDeletionProposal,
  createNodeFile,
  deleteNodeFile,
  loadGraph,
  removeEdge,
  restoreNodeFile,
  revertNodeFile,
  scaffoldNodeFile,
  updateNodeFile,
} from "./file-store.js";
export type {
  ApprovalSigner,
  FileProblem,
  RefusedFile,
  ScaffoldedNode,
  SpecGraph,
} from "./file-store.js";
export { describeFailure as describeFileFailure } from "./files.js";
export { isStoreRefusal, StoreRefusal } from "./refusal.js";
export type { RefusalKind } from "./refusal.js";
/** The ledger's own shape, named here so a caller of the door has one import. */
export type { ApprovalLedgerReading } from "../serialize/index.js";
