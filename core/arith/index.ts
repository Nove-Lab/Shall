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
 * arrives as data, and the one thing a key can do — sign and verify — arrives as
 * a `Seal` the daemon builds. So the same web bundle that draws the canvas can
 * colour it, and the daemon and the panel cannot disagree about what a node is.
 */
export {
  colorContextOf,
  colorOf,
  hasApproval,
  hasSchemaViolation,
  isHashMatched,
  isMissing,
  isOrphan,
  isTagValid,
} from "./color.js";
export type {
  ColorContext,
  ColorSubject,
  ColorVerdict,
  Seal,
} from "./color.js";
export { reviewGraph } from "./review.js";
export type {
  BrokenFile,
  GraphReview,
  MissingNode,
  ReviewStatus,
} from "./review.js";
