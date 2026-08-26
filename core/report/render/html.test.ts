import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { NodeHome } from "../atlas.js";
import type { Block, Inline } from "../model.js";
import {
  escapeHtml,
  renderBlock,
  renderInline,
  renderPage,
  shiftHeadings,
  type Page,
  type RenderContext,
} from "./html.js";

/**
 * THE EMITTED BYTES. The report is a file a manager double-clicks, so two
 * things are held to here and nothing else is: nothing an author wrote can
 * become markup, and every href is arithmetic off the emitting file rather
 * than a chapter's guess.
 *
 * THE HEADING RANKS ARE STRUCTURE, NOT STYLE. A body's own `##` may not rank
 * beside a chapter's sections, so an identity heading's level and the shift
 * under it are asserted together — a screen reader's outline is the thing that
 * breaks when they drift apart.
 */

const HOMES = new Map<string, NodeHome>([
  ["T-0001", { file: "chapters/01-terms.html", anchor: "T-0001" }],
  ["AC-0001", { file: "nodes/AC-0001.html", anchor: null }],
]);

function contextOf(overrides: Partial<RenderContext> = {}): RenderContext {
  return { fromFile: "chapters/05-requirements.html", homes: HOMES, anchors: true, ...overrides };
}

describe("escapeHtml", () => {
  test("closes the four doors markup opens", () => {
    assert.equal(escapeHtml(`<a href="x">`), "&lt;a href=&quot;x&quot;&gt;");
    assert.equal(escapeHtml("a & b"), "a &amp; b");
  });

  test("escapes the ampersand first, so nothing is escaped twice", () => {
    // "&lt;" an author typed must arrive as text, not as a "<".
    assert.equal(escapeHtml("&lt;"), "&amp;lt;");
  });

  test("leaves ordinary text exactly as written", () => {
    assert.equal(escapeHtml("Report of the ‘quarter’ — 100% done"), "Report of the ‘quarter’ — 100% done");
    assert.equal(escapeHtml(""), "");
  });
});

describe("shiftHeadings", () => {
  test("pushes every rank down by the given number", () => {
    assert.equal(shiftHeadings("<h1>a</h1><h2>b</h2><h3>c</h3>", 2), "<h3>a</h3><h4>b</h4><h5>c</h5>");
  });

  test("clamps at h6, where HTML ends", () => {
    assert.equal(shiftHeadings("<h5>deep</h5>", 2), "<h6>deep</h6>");
    assert.equal(shiftHeadings("<h6>deeper</h6>", 3), "<h6>deeper</h6>");
  });

  test("keeps a heading's attributes", () => {
    assert.equal(shiftHeadings(`<h2 id="x" class="y">t</h2>`, 2), `<h4 id="x" class="y">t</h4>`);
  });

  test("does nothing at all when there is nothing to shift", () => {
    const html = "<h2>a</h2>";
    assert.equal(shiftHeadings(html, 0), html);
    assert.equal(shiftHeadings(html, -1), html);
  });

  test("leaves text that merely looks like a tag alone", () => {
    assert.equal(shiftHeadings("<p>h2 is a rank</p><hr>", 2), "<p>h2 is a rank</p><hr>");
  });
});

describe("renderInline", () => {
  test("says text escaped", () => {
    assert.equal(renderInline({ kind: "text", text: "5 < 6 & rising" }, contextOf()), "5 &lt; 6 &amp; rising");
  });

  test("draws a badge with its tone and its word", () => {
    assert.equal(
      renderInline({ kind: "badge", badge: { label: "Awaiting review", tone: "pending" } }, contextOf()),
      `<span class="badge tone-pending">Awaiting review</span>`,
    );
  });

  test("resolves a known node through the homes map, relative to the emitting file", () => {
    const link: Inline = { kind: "link", to: { node: "T-0001" }, text: "Ledger" };
    assert.equal(
      renderInline(link, contextOf({ fromFile: "chapters/05-requirements.html" })),
      `<a href="01-terms.html#T-0001">Ledger</a>`,
    );
    assert.equal(
      renderInline(link, contextOf({ fromFile: "nodes/AC-0001.html" })),
      `<a href="../chapters/01-terms.html#T-0001">Ledger</a>`,
    );
  });

  test("says a dangling node link rather than linking it", () => {
    // A dangling edge's id has nowhere to point; a link at nothing would be a
    // dead click in a file somebody opened from disk.
    const html = renderInline(
      { kind: "link", to: { node: "R-9999" }, text: "R-9999 <missing>" },
      contextOf(),
    );
    assert.equal(html, "R-9999 &lt;missing&gt;");
    assert.doesNotMatch(html, /<a/);
  });

  test("takes a file target as written", () => {
    assert.equal(
      renderInline(
        { kind: "link", to: { file: "index.html", anchor: null }, text: "Contents" },
        contextOf(),
      ),
      `<a href="../index.html">Contents</a>`,
    );
  });

  test("escapes the text of a link it did draw", () => {
    assert.equal(
      renderInline({ kind: "link", to: { node: "AC-0001" }, text: `"quoted"` }, contextOf()),
      `<a href="../nodes/AC-0001.html">&quot;quoted&quot;</a>`,
    );
  });
});

describe("renderBlock", () => {
  test("draws a heading at its level, with its anchor", () => {
    const heading: Block = { kind: "heading", level: 2, text: "Requirements", anchor: "reqs", inToc: true };
    assert.equal(renderBlock(heading, contextOf()), `<h2 id="reqs">Requirements</h2>`);
    assert.equal(
      renderBlock({ ...heading, level: 3, anchor: null }, contextOf()),
      "<h3>Requirements</h3>",
    );
  });

  test("drops every anchor when the context says the page is a copy", () => {
    // A rendering that repeats blocks another page already anchors would make
    // the id ambiguous, so a copy keeps none of them.
    assert.equal(
      renderBlock(
        { kind: "heading", level: 2, text: "Requirements", anchor: "reqs", inToc: true },
        contextOf({ anchors: false }),
      ),
      "<h2>Requirements</h2>",
    );
  });

  test("draws a line as its inlines, joined with nothing between", () => {
    assert.equal(
      renderBlock(
        {
          kind: "line",
          inlines: [
            { kind: "text", text: "Generated " },
            { kind: "link", to: { node: "T-0001" }, text: "here" },
          ],
        },
        contextOf(),
      ),
      `<p class="line">Generated <a href="01-terms.html#T-0001">here</a></p>`,
    );
  });

  test("draws a ratio as a count and a bar of that share", () => {
    const html = renderBlock(
      {
        kind: "ratio",
        label: "Criteria met",
        numerator: 1,
        denominator: 4,
        note: "2 unspecified",
        to: null,
      },
      contextOf(),
    );
    assert.match(html, /<span class="ratio-label">Criteria met<\/span>/);
    assert.match(html, /<span class="ratio-value">1 of 4<\/span>/);
    assert.match(html, /<span class="ratio-note">2 unspecified<\/span>/);
    assert.match(html, /style="width:25%"/);
  });

  test("draws an empty bar rather than dividing by zero", () => {
    const html = renderBlock(
      { kind: "ratio", label: "Work items done", numerator: 0, denominator: 0, note: null, to: null },
      contextOf(),
    );
    assert.match(html, /style="width:0%"/);
    assert.match(html, /<span class="ratio-value">0 of 0<\/span>/);
    assert.doesNotMatch(html, /ratio-note/);
  });

  test("clicks a ratio's label through to the listing it counts, or says it plain", () => {
    // A bar is a summary of a listing somewhere else in the report; the label
    // is the way there, and the href is arithmetic off the emitting file just
    // like every other link — the same block on two pages, two hrefs.
    const ratio: Block = {
      kind: "ratio",
      label: "Scenarios covered",
      numerator: 3,
      denominator: 4,
      note: null,
      to: { file: "progress/scenarios.html", anchor: null },
    };
    assert.match(
      renderBlock(ratio, contextOf({ fromFile: "chapters/07-progress.html" })),
      /<span class="ratio-label"><a href="\.\.\/progress\/scenarios\.html">Scenarios covered<\/a><\/span>/,
    );
    assert.match(
      renderBlock(ratio, contextOf({ fromFile: "index.html" })),
      /<span class="ratio-label"><a href="progress\/scenarios\.html">Scenarios covered<\/a><\/span>/,
    );

    // Nowhere to lead is not a dead link: the label is simply said.
    const plain = renderBlock({ ...ratio, to: null }, contextOf());
    assert.match(plain, /<span class="ratio-label">Scenarios covered<\/span>/);
    assert.doesNotMatch(plain, /<a/);
  });

  test("escapes a linked ratio label, and lets a node target resolve or fall to text", () => {
    assert.match(
      renderBlock(
        {
          kind: "ratio",
          label: `Criteria "met" & counted`,
          numerator: 1,
          denominator: 2,
          note: null,
          to: { node: "T-0001" },
        },
        contextOf(),
      ),
      /<span class="ratio-label"><a href="01-terms\.html#T-0001">Criteria &quot;met&quot; &amp; counted<\/a><\/span>/,
    );
    // An id the atlas does not know has nowhere to point, so the label is text.
    assert.match(
      renderBlock(
        {
          kind: "ratio",
          label: "Criteria met",
          numerator: 1,
          denominator: 2,
          note: null,
          to: { node: "R-9999" },
        },
        contextOf(),
      ),
      /<span class="ratio-label">Criteria met<\/span>/,
    );
  });

  test("draws rows as a table, header and caption only when there are any", () => {
    const rows: Block = {
      kind: "rows",
      caption: "Open criteria",
      header: ["Id", "Why"],
      rows: [
        [
          [{ kind: "link", to: { node: "AC-0001" }, text: "AC-0001" }],
          [{ kind: "text", text: "No evidence yet" }],
        ],
      ],
    };
    assert.equal(
      renderBlock(rows, contextOf()),
      "<table><caption>Open criteria</caption>" +
        "<thead><tr><th>Id</th><th>Why</th></tr></thead>" +
        `<tbody><tr><td><a href="../nodes/AC-0001.html">AC-0001</a></td><td>No evidence yet</td></tr></tbody>` +
        "</table>",
    );
    assert.equal(
      renderBlock({ ...rows, caption: null, header: null, rows: [] }, contextOf()),
      "<table><tbody></tbody></table>",
    );
  });

  test("draws a cell's several inlines inside the one cell", () => {
    // A relation column holds every edge the node has, links and the ", "
    // between them alike — one <td>, not one per link.
    const html = renderBlock(
      {
        kind: "rows",
        caption: null,
        header: null,
        rows: [
          [
            [
              { kind: "link", to: { node: "T-0001" }, text: "Ledger" },
              { kind: "text", text: ", " },
              { kind: "link", to: { node: "AC-0001" }, text: "AC-0001" },
            ],
          ],
        ],
      },
      contextOf(),
    );
    assert.equal(
      html,
      "<table><tbody><tr>" +
        `<td><a href="01-terms.html#T-0001">Ledger</a>, <a href="../nodes/AC-0001.html">AC-0001</a></td>` +
        "</tr></tbody></table>",
    );
    assert.equal(html.match(/<td>/g)?.length, 1);
  });

  test("draws an empty cell as an empty one, not as a missing column", () => {
    assert.equal(
      renderBlock(
        { kind: "rows", caption: null, header: null, rows: [[[], [{ kind: "text", text: "x" }]]] },
        contextOf(),
      ),
      "<table><tbody><tr><td></td><td>x</td></tr></tbody></table>",
    );
  });
});

describe("renderBlock, a node", () => {
  const node: Block = {
    kind: "node",
    id: "R-0001",
    type: "Requirement",
    name: "The report is one folder",
    shortName: "one-folder",
    depth: 0,
    badges: [
      { label: "Approved", tone: "good" },
      { label: "Not yet satisfied", tone: "pending" },
    ],
    facts: [{ label: "Realized by", inlines: [{ kind: "link", to: { node: "AC-0001" }, text: "AC-0001" }] }],
    body: "Intro line.\n\n## Detail\n\nUnder it.\n",
  };

  test("ranks the identity heading three deep, one deeper per nesting step", () => {
    assert.match(renderBlock(node, contextOf()), /<h3 class="node-head">/);
    assert.match(renderBlock({ ...node, depth: 1 }, contextOf()), /<h4 class="node-head">/);
    assert.match(renderBlock({ ...node, depth: 3 }, contextOf()), /<h6 class="node-head">/);
  });

  test("clamps the identity heading at h6", () => {
    const html = renderBlock({ ...node, depth: 7 }, contextOf());
    assert.match(html, /<h6 class="node-head">/);
    assert.match(html, /<\/h6>/);
  });

  test("says the name, the short name and the id, all escaped", () => {
    const html = renderBlock({ ...node, name: "A < B" }, contextOf());
    assert.match(html, /A &lt; B <span class="node-ref">one-folder · R-0001<\/span>/);
  });

  test("anchors the section at the node's id, and drops it for a copy", () => {
    assert.match(renderBlock(node, contextOf()), /<section class="node" id="R-0001">/);
    assert.match(renderBlock(node, contextOf({ anchors: false })), /<section class="node">/);
  });

  test("draws every badge with its tone class and its word", () => {
    const html = renderBlock(node, contextOf());
    assert.match(html, /<span class="badge tone-good">Approved<\/span>/);
    assert.match(html, /<span class="badge tone-pending">Not yet satisfied<\/span>/);
  });

  test("draws a fact's label and its links, and says none for an empty one", () => {
    const html = renderBlock(node, contextOf());
    assert.match(
      html,
      /<p class="fact"><span class="fact-label">Realized by:<\/span> <a href="\.\.\/nodes\/AC-0001\.html">AC-0001<\/a><\/p>/,
    );
    assert.match(
      renderBlock({ ...node, facts: [{ label: "Realized by", inlines: [] }] }, contextOf()),
      /<span class="fact-label">Realized by:<\/span> none<\/p>/,
    );
  });

  test("renders the body's markdown with its own headings pushed under the identity one", () => {
    // The body's `##` sits one rank below the h3 above it, not beside the
    // chapter's sections.
    const html = renderBlock(node, contextOf());
    assert.match(html, /<div class="node-body"><p>Intro line\.<\/p>\n<h4>Detail<\/h4>/);
    assert.match(renderBlock({ ...node, depth: 1 }, contextOf()), /<h5>Detail<\/h5>/);
  });

  test("lets no raw HTML in a body become markup", () => {
    const html = renderBlock({ ...node, body: "<script>alert(1)</script>\n" }, contextOf());
    assert.doesNotMatch(html, /<script/);
    assert.match(html, /&lt;script&gt;/);
  });

  test("draws no body div for a body that is empty or absent", () => {
    assert.doesNotMatch(renderBlock({ ...node, body: null }, contextOf()), /node-body/);
    assert.doesNotMatch(renderBlock({ ...node, body: "" }, contextOf()), /node-body/);
    assert.doesNotMatch(renderBlock({ ...node, body: "\n  \n" }, contextOf()), /node-body/);
  });
});

describe("renderPage", () => {
  const page: Page = {
    title: `Requirements — "Shall"`,
    heading: "Requirements",
    headingClass: "chapter",
    cssHref: "../assets/report.css",
    toc: [
      { href: "../index.html", text: "Contents", current: false, sub: [] },
      {
        href: "05-requirements.html",
        text: "Requirements",
        current: true,
        sub: [{ href: "#reqs", text: "Every requirement" }],
      },
    ],
    back: { href: "../chapters/05-requirements.html", text: "Back to Requirements" },
    blocks: [{ kind: "heading", level: 2, text: "Every requirement", anchor: "reqs", inToc: true }],
  };

  test("emits a whole document, doctype first", () => {
    const html = renderPage(page, contextOf());
    assert.ok(html.startsWith("<!doctype html>\n"), html.slice(0, 40));
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<meta charset="utf-8">/);
    assert.ok(html.endsWith("</html>\n"));
  });

  test("escapes the title and links the stylesheet where the page stands", () => {
    const html = renderPage(page, contextOf());
    assert.match(html, /<title>Requirements — &quot;Shall&quot;<\/title>/);
    assert.match(html, /<link rel="stylesheet" href="\.\.\/assets\/report\.css">/);
  });

  test("marks the current entry of the contents bar, and only it", () => {
    const html = renderPage(page, contextOf());
    assert.match(html, /<nav class="toc" aria-label="Report contents">/);
    assert.match(html, /<a href="05-requirements.html" aria-current="page">Requirements<\/a>/);
    assert.match(html, /<a href="\.\.\/index\.html">Contents<\/a>/);
    assert.equal(html.match(/aria-current/g)?.length, 1);
  });

  test("lists the current chapter's own headings under its entry", () => {
    assert.match(renderPage(page, contextOf()), /<ul><li><a href="#reqs">Every requirement<\/a><\/li><\/ul>/);
  });

  test("draws the heading, the way back and the blocks", () => {
    const html = renderPage(page, contextOf());
    assert.match(html, /<p class="back"><a href="\.\.\/chapters\/05-requirements\.html">Back to Requirements<\/a><\/p>/);
    assert.match(html, /<h1 class="chapter">Requirements<\/h1>/);
    assert.match(html, /<main>\n.*<h2 id="reqs">Every requirement<\/h2>/s);
  });

  test("draws no way back and no contents bar when there are none", () => {
    const html = renderPage({ ...page, back: null, toc: [] }, contextOf());
    assert.doesNotMatch(html, /class="back"/);
    assert.doesNotMatch(html, /class="toc"/);
    assert.match(html, /<h1 class="chapter">Requirements<\/h1>/);
  });
});
