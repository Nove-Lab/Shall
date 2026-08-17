/**
 * core/arith — the judgement arithmetic, computed on read and never stored.
 *
 * Everything here is counting and comparing over a graph somebody else loaded:
 * colour and its priority order first, then closure, then the review queue that
 * cuts what is waiting into bundles a person can decide. No AI reaches into this
 * module, and none of its results are written down — they are recomputed from
 * the files and the ledgers on every read, which is what lets a hand edit or a
 * `git checkout` change an answer with nobody told about it.
 *
 * IT IS PURE AND BROWSER-SAFE. No filesystem, no clock, no crypto: the graph
 * arrives as data, the three ledgers' records arrive as data beside it, and the
 * one call core cannot make itself — a sha256 over a node's content — arrives as
 * a function, the four together as `Ledgers` the daemon builds. So the same web
 * bundle that draws the canvas can colour it, and the daemon and the panel
 * cannot disagree about what a node is.
 */
export {
  colorContextOf,
  colorOf,
  contentHashOf,
  hasApproval,
  hasSchemaViolation,
  isHashMatched,
  isMissing,
  isOffTarget,
  isOrphan,
  isRejected,
  livingSubject,
  offTargetOf,
  offTargetSentence,
  writtenEdgesOf,
} from "./color.js";
export type {
  ColorContext,
  ColorSubject,
  ColorVerdict,
  Ledgers,
  OffTarget,
  PayloadHash,
} from "./color.js";
export {
  claimantHashesOf,
  claimantsOf,
  closureAsks,
  closureOf,
  closureVerdictOf,
  isAcceptanceStanding,
  isLeftOpenStanding,
  isSubjectAgreed,
  unapprovedClaimantsOf,
  type ClosureVerdict,
} from "./closure.js";
export { missingSentence, reviewGraph } from "./review.js";
export type {
  BrokenFile,
  GraphReview,
  MissingNode,
  ReviewStatus,
} from "./review.js";
export { taskBoardOf } from "./board.js";
export type { FixSpecItem, ImplementItem, Ref, TaskBoard } from "./board.js";
export {
  chainGreen,
  depthOf,
  isClosableTask,
  isCompleted,
  prerequisitesMet,
  prerequisitesOf,
  taskStateOf,
  upwardChainOf,
} from "./task-state.js";
export type { ColorAt } from "./task-state.js";
export { reviewBundles, scanRankOf } from "./bundles.js";
export type {
  AcClosureBundle,
  BundleKind,
  BundleMember,
  EvidenceMember,
  ReviewBundle,
  ReviewQueue,
  ScanRank,
  SpecApprovalBundle,
  TaskClosureBundle,
  TypeCount,
  UnchangedNode,
  WorkReportBundle,
} from "./bundles.js";
