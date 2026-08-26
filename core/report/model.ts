import type { ColorContext, ReviewStatus, Vitals } from "../arith/index.js";
import type { SpecGraph } from "../store/index.js";

/**
 * THE REPORT'S INTERMEDIATE SHAPE — what a chapter assembles and what the
 * renderer draws, and nothing else on either side.
 *
 * THE SPLIT IS THE POINT. A chapter knows which edges to walk and says what it
 * found as blocks; the renderer knows what a block looks like in HTML and
 * where a node's page lives. Neither reaches across: a chapter never writes a
 * tag or an href, and the renderer never asks the graph a question. That is
 * what lets a schema revision stay inside one chapter file and a stylesheet
 * revision stay inside render/.
 *
 * THE SHAPE IS ALSO THE FENCE AROUND PROSE. The report is mechanical
 * aggregation: every sentence in it is a node's own body, a label from
 * `vocabulary.ts`, or a count. Blocks carry node fields and facts — there is
 * no free-paragraph block for a chapter to editorialise in, and `line` exists
 * for the index's stamp and for cross-reference sentences built out of links
 * and counts, not for commentary.
 */

/** The facts the daemon reads from the environment and hands in as data. */
export interface ReportStamp {
  projectName: string;
  /** ISO-8601, the daemon's clock — core has none. */
  generatedAt: string;
  /** HEAD's sha, or null where the project is not a git repository. */
  gitHead: string | null;
}

/** Everything a report is computed from — one load, handed over whole. */
export interface ReportInput {
  graph: SpecGraph;
  statuses: ReadonlyMap<string, ReviewStatus>;
  /** The edge index the walks run on — `incoming`/`outgoing` by node id. */
  context: ColorContext;
  vitals: Vitals;
  stamp: ReportStamp;
}

/** One emitted file, path relative to `shall/report/`, `/`-separated. */
export interface ReportFile {
  path: string;
  content: string;
}

/**
 * A badge's colour ROLE, never a colour WORD: the stylesheet decides what
 * "attention" looks like, and the internal red/yellow/green vocabulary stays
 * out of the emitted bytes entirely.
 */
export type Tone = "good" | "pending" | "attention" | "neutral";

/** A status word beside its tone — the label is what carries the meaning. */
export interface Badge {
  label: string;
  tone: Tone;
}

/**
 * Where a link points: at a node, wherever the atlas says that node lives, or
 * at an emitted file by its report-relative path. Chapters use the node form
 * so none of them knows another's file layout.
 */
export type LinkTarget =
  | { node: string }
  | { file: string; anchor: string | null };

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "link"; to: LinkTarget; text: string }
  | { kind: "badge"; badge: Badge };

/** One labelled, edge-derived line under a node: "Realized by: <links>". */
export interface Fact {
  label: string;
  inlines: Inline[];
}

/**
 * One table cell — inlines drawn in sequence, so a relation cell can hold
 * several links with plain ", " text between them. The tables are the
 * document's default reading: rows are nodes, columns are the fields every
 * node of the type HAS — frontmatter identity, edges, computed status — and
 * never anything read out of a body.
 */
export type Cell = Inline[];

/**
 * The blocks a page is made of.
 *
 * `node` is the workhorse: identity fields the renderer lays out (never
 * authored inlines, so a title cannot be invented), badges, edge facts, and
 * the body VERBATIM — the author's own markdown, headings and all, demoted
 * under the identity heading at render time. `depth` nests one node under
 * another (chapter 3's Actor → UseCase → Scenario) and drives both the
 * identity heading's level and how far the body's own headings are pushed
 * down.
 */
export type Block =
  | {
      kind: "heading";
      level: 2 | 3;
      text: string;
      /** Anchor id for in-page links; null for headings nothing points at. */
      anchor: string | null;
      /** Whether the TOC bar lists it under the current chapter. */
      inToc: boolean;
    }
  | {
      kind: "node";
      id: string;
      type: string;
      name: string;
      shortName: string;
      depth: number;
      badges: Badge[];
      facts: Fact[];
      body: string | null;
    }
  | { kind: "rows"; caption: string | null; header: string[] | null; rows: Cell[][] }
  | {
      kind: "ratio";
      label: string;
      numerator: number;
      denominator: number;
      note: string | null;
      /** Where the labelled bar leads — the axis's full listing, or nowhere. */
      to: LinkTarget | null;
    }
  | { kind: "line"; inlines: Inline[] };
