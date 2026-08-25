/**
 * core/arith — the judgement arithmetic, computed on read and never stored.
 *
 * Everything here is counting and comparing over a graph somebody else loaded:
 * colour and its priority order first, then closure, then the review queue that
 * cuts what is waiting into bundles a person can decide, then the board and the
 * vitals that count what those passes already said. No AI reaches into this
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
export {
  cyclesOf,
  cyclicOf,
  cyclicSentence,
  isCyclic,
} from "./seams.js";
export type { Cycle, Cycles, ModuleHop } from "./seams.js";
export { missingSentence, reviewGraph } from "./review.js";
export type {
  BrokenFile,
  GraphReview,
  MissingNode,
  ReviewStatus,
} from "./review.js";
export { workBoardOf } from "./board.js";
export type { FixSpecItem, ImplementItem, Ref, WorkBoard } from "./board.js";
export {
  chainGreen,
  depthOf,
  isClosableWorkItem,
  isCompleted,
  prerequisitesMet,
  prerequisitesOf,
  workItemStateOf,
  upwardChainOf,
} from "./work-item-state.js";
export type { ColorAt } from "./work-item-state.js";
export {
  criteriaOf,
  isCriteriaCarrier,
  satisfactionOf,
} from "./satisfaction.js";
export type { ClosureAt, Satisfaction } from "./satisfaction.js";
export { vitalsOf } from "./vitals.js";
export type {
  ClosureRow,
  CompletionRow,
  HealthRule,
  HealthRuleId,
  OpenCriterion,
  OpenWorkItem,
  Progress,
  SatisfactionRow,
  UnsatCarrier,
  Vitals,
} from "./vitals.js";
export { closureBundleIdOf, reviewBundles, scanRankOf } from "./bundles.js";
export type {
  AcClosureBundle,
  BundleKind,
  BundleMember,
  EvidenceMember,
  ReviewBundle,
  ReviewQueue,
  ScanRank,
  SpecApprovalBundle,
  StandaloneFindingBundle,
  WorkItemClosureBundle,
  TypeCount,
  UnchangedNode,
  WorkReportBundle,
} from "./bundles.js";
