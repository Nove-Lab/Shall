/**
 * THE CONSERVATIVE BODY SPLITTER — the report's one look inside a body, and a
 * shallow one on purpose.
 *
 * A body is the author's and the graph never reads it; the report renders it
 * back whole. These two functions exist for exactly the two conveniences the
 * report's spec names — a Journal row's "User Prompt" first line, a
 * Scenario's "Scenario Type" grouping — and they PROMISE NOTHING: a heading
 * is looked for, never expected, and absence answers null so the caller
 * renders nothing rather than inventing something. No computation imports
 * this module; only chapter assembly does.
 *
 * A `##` inside a code fence is content, not a heading, so the split walks
 * fence state the way a markdown reader would.
 */

/** One stretch of a body: the `##` heading it sits under, or null before the first. */
export interface BodyPart {
  heading: string | null;
  markdown: string;
}

const HEADING = /^##\s+(.*?)\s*$/;
const FENCE = /^(`{3,}|~{3,})/;

/**
 * Splits a body at its own `##` headings. The parts joined back together are
 * the body minus the heading lines — nothing is dropped, nothing added, and a
 * body with no headings is one part with a null heading.
 */
export function partsOf(body: string): BodyPart[] {
  const parts: BodyPart[] = [];
  let heading: string | null = null;
  let lines: string[] = [];
  let fence: string | null = null;

  const close = (): void => {
    const markdown = lines.join("\n");
    if (heading !== null || markdown.trim() !== "") {
      parts.push({ heading, markdown });
    }
  };

  for (const line of body.split("\n")) {
    const opened = FENCE.exec(line);
    if (fence !== null) {
      // Inside a fence everything is content; the fence closes on a marker of
      // the same character at least as long, per commonmark.
      if (opened !== null && opened[1]!.startsWith(fence[0]!) && opened[1]!.length >= fence.length) {
        fence = null;
      }
      lines.push(line);
      continue;
    }
    if (opened !== null) {
      fence = opened[1]!;
      lines.push(line);
      continue;
    }
    const found = HEADING.exec(line);
    if (found !== null) {
      close();
      heading = found[1]!;
      lines = [];
      continue;
    }
    lines.push(line);
  }
  close();
  return parts;
}

/**
 * The first non-empty line under the named `##` heading, or null when the
 * body has no such heading or nothing under it. The match is case-insensitive
 * and trimmed — "## user prompt" answers for "User Prompt" — because the
 * heading is an authoring convention, not a schema.
 */
export function firstLineOf(body: string, heading: string): string | null {
  const wanted = heading.trim().toLowerCase();
  for (const part of partsOf(body)) {
    if (part.heading === null || part.heading.trim().toLowerCase() !== wanted) {
      continue;
    }
    for (const line of part.markdown.split("\n")) {
      const text = line.trim();
      if (text !== "") {
        return text;
      }
    }
    return null;
  }
  return null;
}
