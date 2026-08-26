/**
 * THE REPORT'S ONE STYLESHEET, emitted as `assets/report.css`.
 *
 * IT IS A TS CONSTANT AND NOT A .css FILE because the generator ships inside
 * the single binary, and `bun build --compile` carries the JS module graph
 * only — a loose asset beside the source would not exist at run time (the
 * agent kit dug a whole embedding pipeline for exactly this; a constant is
 * that pipeline for free, the way `agent-rules.ts` carries RULES).
 *
 * THE VALUES ARE THE WEB APP'S LIGHT TOKENS, copied as literals from
 * `apps/web/src/index.css` — same ink, same accents, no bundle dependency.
 * Badge tones colour BESIDE their labels, never instead of them, and the
 * print rules keep the whole report legible as a grayscale PDF.
 */
export const REPORT_CSS = `:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --border: oklch(0.922 0 0);
  --primary: oklch(54.6% 0.245 262.881);
  --good: oklch(69.6% 0.17 162.48);
  --pending: oklch(76.9% 0.188 70.08);
  --attention: oklch(63.7% 0.237 25.331);
  --radius: 0.625rem;
}

* { box-sizing: border-box; }

html {
  font-family: 'Geist Variable', ui-sans-serif, system-ui, -apple-system,
    'Segoe UI', Roboto, Arial, sans-serif;
}

body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  line-height: 1.6;
  font-size: 1rem;
}

main {
  /* Wide enough for the tables the chapters are made of; prose on the node
     pages still caps itself below. */
  max-width: 72rem;
  padding: 2.5rem 2rem 5rem;
  margin: 0 auto;
}

h1 { font-size: 1.75rem; letter-spacing: -0.025em; margin: 0 0 0.5rem; }
h2 { font-size: 1.35rem; letter-spacing: -0.025em; margin: 2.5rem 0 0.75rem; }
h3 { font-size: 1.1rem; margin: 2rem 0 0.5rem; }
h4, h5, h6 { font-size: 1rem; margin: 1.5rem 0 0.5rem; }

a { color: var(--primary); text-decoration: none; }
a:hover { text-decoration: underline; }

code, pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    'Liberation Mono', 'Courier New', monospace;
  font-size: 0.875em;
}
pre {
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) * 0.8);
  padding: 0.75rem 1rem;
  overflow-x: auto;
}
code { background: var(--muted); border-radius: 0.25rem; padding: 0.1em 0.3em; }
pre code { background: none; padding: 0; }

table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75rem 0 1.25rem;
  font-size: 0.9375rem;
}
caption {
  text-align: left;
  color: var(--muted-foreground);
  font-size: 0.875rem;
  padding-bottom: 0.375rem;
}
th, td {
  text-align: left;
  border-bottom: 1px solid var(--border);
  padding: 0.375rem 0.75rem 0.375rem 0;
  vertical-align: top;
}
th { color: var(--muted-foreground); font-weight: 500; font-size: 0.8125rem; }

.node {
  margin: 1.5rem 0;
  padding-left: 0;
}
.node .node { margin: 1rem 0 1rem 1.25rem; border-left: 2px solid var(--border); padding-left: 1.25rem; }
.node-head { display: block; }
.node-ref {
  color: var(--muted-foreground);
  font-weight: 400;
  font-size: 0.8125rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    'Liberation Mono', 'Courier New', monospace;
  white-space: nowrap;
}
.node-body { margin-top: 0.5rem; max-width: 76ch; }

.badge {
  display: inline-block;
  vertical-align: middle;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.4;
  border-radius: 999px;
  padding: 0.05rem 0.55rem;
  border: 1px solid var(--border);
  white-space: nowrap;
}
.tone-good { background: color-mix(in oklab, var(--good) 14%, white); border-color: color-mix(in oklab, var(--good) 45%, white); }
.tone-pending { background: color-mix(in oklab, var(--pending) 18%, white); border-color: color-mix(in oklab, var(--pending) 55%, white); }
.tone-attention { background: color-mix(in oklab, var(--attention) 12%, white); border-color: color-mix(in oklab, var(--attention) 45%, white); }
.tone-neutral { background: var(--muted); }

.fact { margin: 0.25rem 0; font-size: 0.9375rem; }
.fact-label { color: var(--muted-foreground); }

.line { margin: 0.5rem 0; }
.stamp { color: var(--muted-foreground); font-size: 0.9375rem; }

.ratio { margin: 1.25rem 0; }
.ratio-label { font-weight: 500; }
.ratio-value { font-variant-numeric: tabular-nums; }
.ratio-note { color: var(--muted-foreground); font-size: 0.875rem; }
.bar {
  height: 0.375rem;
  background: var(--muted);
  border-radius: 999px;
  overflow: hidden;
  margin-top: 0.25rem;
}
.bar-fill { height: 100%; background: var(--good); }

.back { font-size: 0.875rem; margin: 0 0 1.5rem; }

nav.toc {
  font-size: 0.875rem;
  line-height: 1.9;
}
nav.toc ul { list-style: none; margin: 0; padding: 0; }
nav.toc ul ul { padding-left: 1rem; font-size: 0.8125rem; }
nav.toc a { color: var(--foreground); }
nav.toc a[aria-current="page"] { color: var(--primary); font-weight: 500; }

@media (min-width: 60rem) {
  body { display: flex; }
  nav.toc {
    position: sticky;
    top: 0;
    align-self: flex-start;
    max-height: 100vh;
    overflow-y: auto;
    width: 16rem;
    flex-shrink: 0;
    padding: 2.5rem 1rem 2.5rem 1.5rem;
    border-right: 1px solid var(--border);
  }
  main { flex: 1; min-width: 0; }
}
@media (max-width: 59.99rem) {
  nav.toc { padding: 1.25rem 1.5rem 0; border-bottom: 1px solid var(--border); }
}

@page { size: A4; margin: 20mm; }
@media print {
  nav.toc, .back { display: none; }
  body { display: block; }
  main { max-width: none; margin: 0; padding: 0; }
  h1.chapter { break-before: page; }
  .node, tr { break-inside: avoid; }
  a { color: inherit; }
  .bar { display: none; }
}
`;
