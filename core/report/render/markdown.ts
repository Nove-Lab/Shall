import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";

/**
 * A node's body, rendered exactly as written. `allowDangerousHtml` stays at
 * its default of false, so raw HTML an author (or an agent) left in a body
 * arrives escaped — the report is a file a manager double-clicks, and no
 * script may ride a body into it.
 */
export function htmlOfMarkdown(markdown: string): string {
  return micromark(markdown, {
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  });
}
