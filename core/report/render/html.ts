import { hrefFrom, type NodeHome } from "../atlas.js";
import type { Badge, Block, Fact, Inline } from "../model.js";
import { htmlOfMarkdown } from "./markdown.js";

/**
 * THE RENDERER — IR in, HTML out, and no questions asked of the graph. What a
 * block says is the chapter's; how it reads on paper is this file's. Every
 * text node passes through `escape`, and a body passes through micromark with
 * raw HTML off, so nothing an author wrote can become markup here.
 */

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Pushes a rendered body's own headings under the identity heading above
 * them: a body's `##` must not rank beside the page's chapters. Clamped at
 * h6, because HTML ends there and a deep nest reads fine one rank flat.
 */
export function shiftHeadings(html: string, by: number): string {
  if (by <= 0) {
    return html;
  }
  return html
    .replace(/<h([1-6])(?=[\s>])/g, (_, level: string) => `<h${Math.min(Number(level) + by, 6)}`)
    .replace(/<\/h([1-6])>/g, (_, level: string) => `</h${Math.min(Number(level) + by, 6)}>`);
}

/** What every render call carries: where it stands, and where nodes live. */
export interface RenderContext {
  /** The emitting file's report-relative path — hrefs resolve against it. */
  fromFile: string;
  /** Node id → home, prebuilt from the graph; an id not in it renders as text. */
  homes: ReadonlyMap<string, NodeHome>;
  /** Whether id anchors are stamped — off for a rendering that duplicates
   * blocks another page already anchors. */
  anchors: boolean;
}

function badgeHtml(badge: Badge): string {
  return `<span class="badge tone-${badge.tone}">${escapeHtml(badge.label)}</span>`;
}

export function renderInline(inline: Inline, context: RenderContext): string {
  switch (inline.kind) {
    case "text":
      return escapeHtml(inline.text);
    case "badge":
      return badgeHtml(inline.badge);
    case "link": {
      const target =
        "node" in inline.to
          ? (() => {
              const home = context.homes.get(inline.to.node);
              return home === undefined ? null : { file: home.file, anchor: home.anchor };
            })()
          : inline.to;
      if (target === null) {
        // A link at nothing — a dangling edge's id — is said, not clicked.
        return escapeHtml(inline.text);
      }
      const href = hrefFrom(context.fromFile, target);
      return `<a href="${escapeHtml(href)}">${escapeHtml(inline.text)}</a>`;
    }
  }
}

function inlinesHtml(inlines: readonly Inline[], context: RenderContext): string {
  return inlines.map((inline) => renderInline(inline, context)).join("");
}

function factHtml(fact: Fact, context: RenderContext): string {
  const value = fact.inlines.length === 0 ? "none" : inlinesHtml(fact.inlines, context);
  return `<p class="fact"><span class="fact-label">${escapeHtml(fact.label)}:</span> ${value}</p>`;
}

function idAttribute(anchor: string | null, context: RenderContext): string {
  return anchor !== null && context.anchors ? ` id="${escapeHtml(anchor)}"` : "";
}

export function renderBlock(block: Block, context: RenderContext): string {
  switch (block.kind) {
    case "heading": {
      const tag = `h${block.level}`;
      return `<${tag}${idAttribute(block.anchor, context)}>${escapeHtml(block.text)}</${tag}>`;
    }
    case "line":
      return `<p class="line">${inlinesHtml(block.inlines, context)}</p>`;
    case "ratio": {
      const share =
        block.denominator === 0
          ? 0
          : Math.round((block.numerator / block.denominator) * 100);
      const note = block.note === null ? "" : ` <span class="ratio-note">${escapeHtml(block.note)}</span>`;
      const label =
        block.to === null
          ? escapeHtml(block.label)
          : renderInline({ kind: "link", to: block.to, text: block.label }, context);
      return [
        `<div class="ratio">`,
        `<p class="line"><span class="ratio-label">${label}</span> `,
        `<span class="ratio-value">${block.numerator} of ${block.denominator}</span>${note}</p>`,
        `<div class="bar" role="presentation"><div class="bar-fill" style="width:${share}%"></div></div>`,
        `</div>`,
      ].join("");
    }
    case "rows": {
      const caption = block.caption === null ? "" : `<caption>${escapeHtml(block.caption)}</caption>`;
      const head =
        block.header === null
          ? ""
          : `<thead><tr>${block.header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>`;
      const body = block.rows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td>${inlinesHtml(cell, context)}</td>`).join("")}</tr>`,
        )
        .join("");
      return `<table>${caption}${head}<tbody>${body}</tbody></table>`;
    }
    case "node": {
      // The identity heading sits under the chapter's h2 sections, one rank
      // deeper per nesting step; the body's own headings go one deeper still.
      const level = Math.min(3 + block.depth, 6);
      const badges = block.badges.map(badgeHtml).join(" ");
      const facts = block.facts.map((fact) => factHtml(fact, context)).join("");
      const body =
        block.body === null || block.body.trim() === ""
          ? ""
          : `<div class="node-body">${shiftHeadings(htmlOfMarkdown(block.body), level - 1)}</div>`;
      return [
        `<section class="node"${idAttribute(block.id, context)}>`,
        `<h${level} class="node-head">${escapeHtml(block.name)} `,
        `<span class="node-ref">${escapeHtml(block.shortName)} · ${escapeHtml(block.id)}</span>`,
        badges === "" ? "" : ` ${badges}`,
        `</h${level}>`,
        facts,
        body,
        `</section>`,
      ].join("");
    }
  }
}

/** One entry of the TOC bar; `sub` lists the current chapter's own headings. */
export interface TocEntry {
  href: string;
  text: string;
  current: boolean;
  sub: { href: string; text: string }[];
}

export interface Page {
  /** The <title>; the h1 is separate so the index can differ. */
  title: string;
  heading: string;
  /** "chapter" puts the page-break class on the h1 for print. */
  headingClass: "chapter" | "plain";
  cssHref: string;
  toc: TocEntry[];
  /** A quiet way back — node pages point at their owning chapter. */
  back: { href: string; text: string } | null;
  blocks: readonly Block[];
}

function tocHtml(toc: readonly TocEntry[]): string {
  if (toc.length === 0) {
    return "";
  }
  const items = toc
    .map((entry) => {
      const current = entry.current ? ` aria-current="page"` : "";
      const sub =
        entry.sub.length === 0
          ? ""
          : `<ul>${entry.sub
              .map((section) => `<li><a href="${escapeHtml(section.href)}">${escapeHtml(section.text)}</a></li>`)
              .join("")}</ul>`;
      return `<li><a href="${escapeHtml(entry.href)}"${current}>${escapeHtml(entry.text)}</a>${sub}</li>`;
    })
    .join("");
  return `<nav class="toc" aria-label="Report contents"><ul>${items}</ul></nav>`;
}

/** The chrome around any main content — what every emitted page shares. */
export function renderShell(
  page: Pick<Page, "title" | "cssHref" | "toc">,
  mainHtml: string,
): string {
  return [
    "<!doctype html>",
    `<html lang="en">`,
    "<head>",
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<meta name="color-scheme" content="light">`,
    `<title>${escapeHtml(page.title)}</title>`,
    `<link rel="stylesheet" href="${escapeHtml(page.cssHref)}">`,
    "</head>",
    "<body>",
    tocHtml(page.toc),
    "<main>",
    mainHtml,
    "</main>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export function renderPage(page: Page, context: RenderContext): string {
  const back =
    page.back === null
      ? ""
      : `<p class="back"><a href="${escapeHtml(page.back.href)}">${escapeHtml(page.back.text)}</a></p>\n`;
  const blocks = page.blocks.map((block) => renderBlock(block, context)).join("\n");
  const main = `${back}<h1 class="${page.headingClass}">${escapeHtml(page.heading)}</h1>\n${blocks}`;
  return renderShell(page, main);
}

