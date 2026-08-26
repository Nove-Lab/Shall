import type { Block, ReportInput } from "../model.js";

/**
 * ONE CHAPTER, ONE RULE. Everything a chapter is — which types it starts
 * from, which edges it follows, what it places where — lives in one file
 * implementing this interface, and `report.ts` only iterates the list. A
 * schema revision that moves an edge touches the chapter that walks it and
 * nothing else; that containment is the reason this interface exists.
 */
export interface ChapterRule {
  /** 1..7 — the document's chapter number. */
  ordinal: number;
  /** The file stem: `chapters/<slug>.html`, e.g. "01-terms". */
  slug: string;
  /** The chapter heading as the index and the TOC print it. */
  title: string;
  assemble(input: ReportInput): AssembledChapter;
}

/**
 * What a chapter assembled: its page, the detail pages it OWNS (each node
 * page has exactly one owning chapter — the atlas says which), and the one
 * mechanical count sentence the index prints beside its link.
 */
export interface AssembledChapter {
  /** Counts only — "3 actors, 5 use cases, 9 scenarios." */
  summary: string;
  blocks: Block[];
  pages: ChapterPage[];
}

/** One owned detail page, emitted as `nodes/<id>.html` unless `file` says. */
export interface ChapterPage {
  id: string;
  /** The page's `<title>` and h1 — a node's own name, or a listing's. */
  title: string;
  blocks: Block[];
  /**
   * An explicit report-relative path for pages that are not a node's — the
   * progress listings, say. Absent means `nodes/<id>.html`.
   */
  file?: string | undefined;
  /**
   * Where the page's back link points. "index" is for the types a chapter
   * assembles but no longer tables — a constraint hangs off many chapters, so
   * no one chapter is its way back. Absent means the owning chapter.
   */
  back?: "chapter" | "index" | undefined;
}
