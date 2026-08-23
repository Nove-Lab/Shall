/**
 * core/store — the project's `.shall/spec` folder, the three ledgers beside
 * it, and the activity feed under them.
 *
 * The only core module that touches a filesystem, and the only one that knows
 * where a node lives. What a file SAYS is `core/serialize`'s business and what
 * it may say is `core/graph`'s; this module owns the folder around them — which
 * paths are node files, how a write lands, and what a whole directory of
 * markdown amounts to when it is read at once. The ledgers — approvals,
 * rejections, acceptances — are the files under `.shall` that are nobody's
 * authorship, Shall writes them and Shall reads them, and they go through one
 * shared door that keeps the same manners as the spec folder's. The activity
 * feed under `ledger/feed/` is Shall's own in the same way and a list rather
 * than a book, so it has a door of its own with the same manners and one verb,
 * append.
 *
 * It replaces the sqlite store that stood here. The queue that serialized writes
 * survived the change; everything else went with the database.
 */
export {
  readAcceptanceLedger,
  recordAcceptance,
  withdrawAcceptance,
} from "./acceptance-ledger.js";
export { appendActivity, readActivity } from "./activity-ledger.js";
export {
  readApprovalLedger,
  recordApproval,
  recordApprovals,
} from "./approval-ledger.js";
export {
  readRejectionLedger,
  recordRejection,
  withdrawRejection,
} from "./rejection-ledger.js";
export {
  addEdge,
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
  FileProblem,
  RefusedFile,
  ScaffoldedNode,
  SpecGraph,
} from "./file-store.js";
export { describeFailure as describeFileFailure } from "./files.js";
export { RESTORE_THE_BOOK } from "./ledger-door.js";
export { isStoreRefusal, StoreRefusal } from "./refusal.js";
export type { RefusalKind } from "./refusal.js";
/** The ledgers' and the feed's own shapes, named here so a caller of a door has one import. */
export type {
  AcceptanceLedgerReading,
  ActivityReading,
  ApprovalLedgerReading,
  RejectionLedgerReading,
} from "../serialize/index.js";
