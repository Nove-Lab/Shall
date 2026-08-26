import { chapterFileOf, homeOf, hrefFrom, pageFileOf, type NodeHome } from "./atlas.js";
import { CHAPTERS } from "./chapters/index.js";
import type { AssembledChapter, ChapterRule } from "./chapters/rule.js";
import type { Block, Cell, Inline, ReportFile, ReportInput } from "./model.js";
import { renderPage, type RenderContext, type TocEntry } from "./render/html.js";
import { REPORT_CSS } from "./render/stylesheet.js";
import { healthSummaryOf } from "./vocabulary.js";

/**
 * THE ORCHESTRATOR — one pass over the chapter list, out the other side as
 * files. It owns the report's file layout (index, chapters/, nodes/ and the
 * chapters' own listing pages, the stylesheet), the chrome every page shares
 * (TOC, back links, previous and next), and the stamp; what any chapter
 * CONTAINS is that chapter's business alone.
 */

const INDEX_FILE = "index.html";
const CSS_FILE = "assets/report.css";

function fileLink(fromFile: string, file: string, text: string): Inline {
  return { kind: "link", to: { file, anchor: null }, text };
}

/** "2026-08-26 09:41 UTC" out of an ISO stamp — a reslicing, not a wording. */
function readableInstant(iso: string): string {
  if (iso.length < 16 || iso[10] !== "T") {
    return iso;
  }
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function stampBlocks(input: ReportInput): Block[] {
  const clauses: string[] = [`Generated ${readableInstant(input.stamp.generatedAt)}`];
  if (input.stamp.gitHead !== null) {
    clauses.push(`commit ${input.stamp.gitHead.slice(0, 7)}`);
  }
  clauses.push(healthSummaryOf(input.vitals.health));
  const blocks: Block[] = [
    { kind: "line", inlines: [{ kind: "text", text: clauses.join(" · ") }] },
  ];
  if (input.vitals.empty) {
    blocks.push({ kind: "line", inlines: [{ kind: "text", text: "The specification is empty." }] });
  }
  return blocks;
}

/** The loader's own findings, said as it said them — mechanical honesty. */
function unreadableBlocks(input: ReportInput): Block[] {
  const rows: Cell[][] = [
    ...input.graph.refused.map((file): Cell[] => [
      [{ kind: "text", text: file.file }],
      [{ kind: "text", text: file.problems.join(" ") }],
    ]),
    ...input.graph.problems.map((problem): Cell[] => [
      [{ kind: "text", text: problem.file }],
      [{ kind: "text", text: problem.message }],
    ]),
  ];
  if (rows.length === 0) {
    return [];
  }
  return [
    { kind: "heading", level: 2, text: "Files that would not read", anchor: null, inToc: false },
    { kind: "rows", caption: null, header: ["File", "What the loader said"], rows },
  ];
}

function chapterHeading(chapter: ChapterRule): string {
  return `${chapter.ordinal}. ${chapter.title}`;
}

/** The TOC every page carries: the overview and the seven chapters. */
function tocFor(fromFile: string, currentSlug: string | null, current?: AssembledChapter): TocEntry[] {
  const entries: TocEntry[] = [
    {
      href: hrefFrom(fromFile, { file: INDEX_FILE, anchor: null }),
      text: "Overview",
      current: currentSlug === null && fromFile === INDEX_FILE,
      sub: [],
    },
  ];
  for (const chapter of CHAPTERS) {
    const file = chapterFileOf(chapter.slug);
    const isCurrent = chapter.slug === currentSlug;
    const sub =
      isCurrent && current !== undefined && fromFile === file
        ? current.blocks
            .filter(
              (block): block is Extract<Block, { kind: "heading" }> =>
                block.kind === "heading" && block.inToc && block.anchor !== null,
            )
            .map((block) => ({ href: `#${block.anchor}`, text: block.text }))
        : [];
    entries.push({
      href: hrefFrom(fromFile, { file, anchor: null }),
      text: chapterHeading(chapter),
      current: isCurrent,
      sub,
    });
  }
  return entries;
}

/** ← previous · next → at a chapter's foot; the index stands before chapter 1. */
function neighboursLine(fromFile: string, ordinal: number): Block {
  const inlines: Inline[] = [];
  const previous = CHAPTERS.find((chapter) => chapter.ordinal === ordinal - 1);
  const next = CHAPTERS.find((chapter) => chapter.ordinal === ordinal + 1);
  inlines.push(
    previous === undefined
      ? fileLink(fromFile, INDEX_FILE, "← Overview")
      : fileLink(fromFile, chapterFileOf(previous.slug), `← ${chapterHeading(previous)}`),
  );
  if (next !== undefined) {
    inlines.push({ kind: "text", text: "   ·   " });
    inlines.push(fileLink(fromFile, chapterFileOf(next.slug), `${chapterHeading(next)} →`));
  }
  return { kind: "line", inlines };
}

export function reportFilesOf(input: ReportInput): ReportFile[] {
  // Where every node lives — built once from the graph, handed to every
  // render so a link is an id and nothing more until this moment.
  const homes = new Map<string, NodeHome>();
  for (const node of input.graph.nodes) {
    const home = homeOf(node.id, node.type);
    if (home !== null) {
      homes.set(node.id, home);
    }
  }

  const assembled = CHAPTERS.map((chapter) => ({
    chapter,
    result: chapter.assemble(input),
  }));

  const files: ReportFile[] = [];

  // The chapters, each with its own page and the pages it owns.
  for (const { chapter, result } of assembled) {
    const file = chapterFileOf(chapter.slug);
    const context: RenderContext = { fromFile: file, homes, anchors: true };
    files.push({
      path: file,
      content: renderPage(
        {
          title: `${chapterHeading(chapter)} — ${input.stamp.projectName}`,
          heading: chapterHeading(chapter),
          headingClass: "chapter",
          cssHref: hrefFrom(file, { file: CSS_FILE, anchor: null }),
          toc: tocFor(file, chapter.slug, result),
          back: null,
          blocks: [...result.blocks, neighboursLine(file, chapter.ordinal)],
        },
        context,
      ),
    });
    for (const page of result.pages) {
      const pageFile = page.file ?? pageFileOf(page.id);
      const pageContext: RenderContext = { fromFile: pageFile, homes, anchors: true };
      const back =
        page.back === "index"
          ? {
              href: hrefFrom(pageFile, { file: INDEX_FILE, anchor: null }),
              text: "← Overview",
            }
          : {
              href: hrefFrom(pageFile, { file: chapterFileOf(chapter.slug), anchor: null }),
              text: `← ${chapterHeading(chapter)}`,
            };
      files.push({
        path: pageFile,
        content: renderPage(
          {
            title: `${page.title} — ${input.stamp.projectName}`,
            heading: page.title,
            headingClass: "plain",
            cssHref: hrefFrom(pageFile, { file: CSS_FILE, anchor: null }),
            toc: tocFor(pageFile, chapter.slug),
            back,
            blocks: page.blocks,
          },
          pageContext,
        ),
      });
    }
  }

  // The index: name, stamp, what would not read, and the chapters with
  // their one-line counts.
  const indexBlocks: Block[] = [
    ...stampBlocks(input),
    ...unreadableBlocks(input),
    { kind: "heading", level: 2, text: "Chapters", anchor: null, inToc: false },
    {
      kind: "rows",
      caption: null,
      header: null,
      rows: assembled.map(({ chapter, result }): Cell[] => [
        [fileLink(INDEX_FILE, chapterFileOf(chapter.slug), chapterHeading(chapter))],
        [{ kind: "text", text: result.summary }],
      ]),
    },
  ];
  files.push({
    path: INDEX_FILE,
    content: renderPage(
      {
        title: input.stamp.projectName,
        heading: input.stamp.projectName,
        headingClass: "plain",
        cssHref: CSS_FILE,
        toc: tocFor(INDEX_FILE, null),
        back: null,
        blocks: indexBlocks,
      },
      { fromFile: INDEX_FILE, homes, anchors: true },
    ),
  });

  files.push({ path: CSS_FILE, content: REPORT_CSS });
  return files;
}
