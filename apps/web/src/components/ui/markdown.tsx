import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * PROSE, DRAWN AS THE DOCUMENT IT IS.
 *
 * A prose attribute is the body of a spec file — `## Description` and the
 * markdown under it — so a panel that printed `**must**` with its asterisks
 * would be showing the syntax rather than the thing written. The file and the
 * screen say the same sentence; only one of them has to show the punctuation
 * that made it.
 *
 * NOTHING HERE IS BIGGER THAN THE PANEL IT SITS IN. Every block stays at the
 * `text-sm` the panel reads at and headings separate by WEIGHT rather than by
 * size, because this markdown is already inside a field whose label named it:
 * a heading that outgrew that label would make the document argue with the form
 * around it. The scale is the design system's, not a document's.
 *
 * WIDE THINGS SCROLL INSIDE THEMSELVES. The panel is a narrow column beside a
 * canvas, and a code line or a table wider than it must take its own scrollbar
 * — otherwise one long line widens the panel and every other field reflows to
 * accommodate a value nobody was reading.
 *
 * RAW HTML IS NOT RENDERED, which is `react-markdown`'s default and is left
 * that way deliberately: these files are written by agents and merged from
 * branches, and a spec file is a document to read, never markup this app runs.
 *
 * EVERY RULE BELOW MERGES THE CLASS IT WAS HANDED RATHER THAN REPLACING IT.
 * `remark-gfm` labels some of what it builds — `contains-task-list` on a list,
 * `language-ts` on a fence — and a rule that spread those props over its own
 * `className` would hand the styling of exactly those elements back to nobody.
 */

/** One tag's classes, merged with whatever the markdown pipeline labelled it. */
const COMPONENTS: Components = {
  p: ({ node: _node, className, ...props }) => (
    <p className={cn("my-2", className)} {...props} />
  ),

  // Two weights across six levels. A spec's own sections are already the
  // fields, so anything in here is a subheading of one of them.
  h1: ({ node: _node, className, ...props }) => (
    <h1 className={cn("mt-3 mb-1.5 font-semibold", className)} {...props} />
  ),
  h2: ({ node: _node, className, ...props }) => (
    <h2 className={cn("mt-3 mb-1.5 font-semibold", className)} {...props} />
  ),
  h3: ({ node: _node, className, ...props }) => (
    <h3 className={cn("mt-3 mb-1.5 font-medium", className)} {...props} />
  ),
  h4: ({ node: _node, className, ...props }) => (
    <h4 className={cn("mt-3 mb-1.5 font-medium", className)} {...props} />
  ),
  h5: ({ node: _node, className, ...props }) => (
    <h5 className={cn("mt-3 mb-1.5 font-medium", className)} {...props} />
  ),
  h6: ({ node: _node, className, ...props }) => (
    <h6
      className={cn("text-muted-foreground mt-3 mb-1.5 font-medium", className)}
      {...props}
    />
  ),

  ul: ({ node: _node, className, ...props }) => (
    <ul className={cn("my-2 list-disc space-y-1 pl-5", className)} {...props} />
  ),
  ol: ({ node: _node, className, ...props }) => (
    <ol
      className={cn("my-2 list-decimal space-y-1 pl-5", className)}
      {...props}
    />
  ),
  li: ({ node: _node, className, ...props }) => (
    <li className={cn("pl-0.5", className)} {...props} />
  ),

  // The id field reads in `font-mono text-xs`, so code reads that way too — a
  // person comparing an id in a sentence with the id above it is comparing the
  // same shapes.
  code: ({ node: _node, className, ...props }) => (
    <code
      className={cn(
        "bg-muted rounded px-1 py-0.5 font-mono text-xs",
        className,
      )}
      {...props}
    />
  ),
  // A fence is a block, so the pill the inline rule draws is undone for the
  // `code` inside it rather than guessed at from its `language-` label. The
  // child selectors outrank the plain classes on that `code` by specificity,
  // which is what lets one rule serve both shapes.
  pre: ({ node: _node, className, ...props }) => (
    <pre
      className={cn(
        "bg-muted/50 my-2 overflow-x-auto rounded-md border p-3 font-mono text-xs",
        "[&>code]:block [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-xs",
        className,
      )}
      {...props}
    />
  ),

  blockquote: ({ node: _node, className, ...props }) => (
    <blockquote
      className={cn("text-muted-foreground my-2 border-l-2 pl-3", className)}
      {...props}
    />
  ),
  hr: ({ node: _node, className, ...props }) => (
    <hr className={cn("my-3", className)} {...props} />
  ),

  // A spec may cite a ticket or a doc. It opens away from the app, because
  // navigating the panel away from the node being read loses the reading.
  a: ({ node: _node, className, ...props }) => (
    <a
      className={cn("font-medium underline underline-offset-2", className)}
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),

  // The scroller is the wrapper and not the table, because a table told to
  // scroll stops laying out as a table.
  table: ({ node: _node, className, ...props }) => (
    <div className="my-2 overflow-x-auto">
      <table className={cn("w-full border-collapse", className)} {...props} />
    </div>
  ),
  th: ({ node: _node, className, ...props }) => (
    <th
      className={cn("border px-2 py-1 text-left font-medium", className)}
      {...props}
    />
  ),
  td: ({ node: _node, className, ...props }) => (
    <td className={cn("border px-2 py-1 align-top", className)} {...props} />
  ),

  img: ({ node: _node, className, ...props }) => (
    <img
      className={cn("my-2 max-w-full rounded-md border", className)}
      {...props}
    />
  ),
};

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // `break-words` because an agent writing a path or a URL with no spaces
        // in it should not be able to push the panel wider than its column.
        "text-sm leading-relaxed break-words",
        // The document's own first and last blocks sit flush with the field:
        // their margins are for their neighbours inside the value, not for the
        // gap the form already spaces with.
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        // A task list carries its state in the checkbox, so the bullet beside
        // it would be a second marker for one item.
        "[&_li:has(>input)]:list-none [&_li:has(>input)]:pl-0",
        "[&_input[type=checkbox]]:mr-1.5 [&_input[type=checkbox]]:align-middle",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
