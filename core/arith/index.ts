/**
 * core/arith — the judgement arithmetic, computed on read and never stored.
 *
 * Everything here is counting and comparing over a graph somebody else loaded:
 * colour and its priority order first, then coverage, staleness and its
 * propagation, gate verdicts, the task board, vitals. No AI reaches into this
 * module, and none of its results are written down — they are recomputed from
 * the files on every read, which is what lets a hand edit or a `git checkout`
 * change an answer with nobody told about it.
 *
 * IT IS PURE AND BROWSER-SAFE. No filesystem, no clock, no crypto: the graph
 * arrives as data, the approval ledger's records arrive as data beside it, and
 * the one call core cannot make itself — a sha256 over a node's content —
 * arrives as a function, the two together as `Approvals` the daemon builds. So
 * the same web bundle that draws the canvas can colour it, and the daemon and
 * the panel cannot disagree about what a node is.
 */
export {
  colorContextOf,
  colorOf,
  contentHashOf,
  hasApproval,
  hasSchemaViolation,
  isHashMatched,
  isMissing,
  isOrphan,
} from "./color.js";
export type {
  Approvals,
  ColorContext,
  ColorSubject,
  ColorVerdict,
  PayloadHash,
} from "./color.js";
export { reviewGraph } from "./review.js";
export type {
  BrokenFile,
  GraphReview,
  MissingNode,
  ReviewStatus,
} from "./review.js";
