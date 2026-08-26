/**
 * core/report — the spec graph as a document.
 *
 * A pure generator: the daemon loads the graph, runs the review and the
 * vitals, reads the clock and the repository head, and hands everything in as
 * `ReportInput`; what comes back is the finished file set for `shall/report/`
 * — static HTML a manager opens from disk, assembled by following edges and
 * quoting bodies, never by writing sentences of its own. Chapter by chapter
 * the rules live in `chapters/`, the words in `vocabulary.ts`, the drawing in
 * `render/` — see each for its own bargain.
 */
export { reportFilesOf } from "./report.js";
export type { ReportFile, ReportInput, ReportStamp } from "./model.js";
