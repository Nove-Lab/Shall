/**
 * The judgement itself, held once and read by everything that writes or reads a
 * spec file — the daemon's two write doors and the loader that parses a folder
 * of markdown the daemon did not write.
 *
 * IT COLLECTS AND NEVER THROWS. A door has one caller waiting for one answer,
 * so it wants the first thing wrong; a loader is reading a file a person or an
 * agent hand-edited and wants everything wrong with it in one pass. Throwing
 * serves the first and cannot serve the second, so this module returns problems
 * and the door turns `problems[0]` into its refusal. THE ORDER IS THEREFORE
 * PART OF THE CONTRACT: `problems[0]` is exactly the sentence the door used to
 * throw, and every rule below is written in the order a person can act on it.
 *
 * WHAT IS JUDGED IS SMALL ON PURPOSE. The body of a node is the specification
 * itself and it is free markdown — the graph does not read it, so nothing here
 * has an opinion about its headings, its sections or its shape. What remains to
 * judge is only what every text file owes its readers: characters that survive
 * the trip through UTF-8 and git, and a size the tools can carry.
 *
 * Nothing here reads a database, a file or a clock, so it is as safe in a
 * browser bundle as it is in the daemon — which is why the byte cap is measured
 * with `TextEncoder` and not with `Buffer`.
 */

/**
 * The per-value byte cap, 256 KiB — the previous system's measurement trigger
 * for blob storage, kept as the one number that bounds what a single node may
 * hold. Held once: the write doors and the loader both read it from here, and a
 * cap spelled in two places is two caps.
 */
export const TEXT_BYTE_CAP = 262144;

/** What `judgeText` found: the value as it would be stored, and what is wrong with it. */
export interface TextJudgement {
  readonly value: string;
  readonly problem: string | null;
}

/** What `judgeBody` found: the body as it would be stored, and every sentence against it. */
export interface BodyJudgement {
  readonly value: string;
  readonly problems: readonly string[];
}

/**
 * Text on its way into a node, trimmed — so the stored bytes are what the panel
 * showed rather than whatever whitespace came with the paste.
 *
 * NUL is refused outright, because a file holding one is not text: git reads a
 * NUL and calls the file binary, which costs this design the diff, the merge
 * and the review that are the whole reason the spec moved into the repository.
 * An editor that does open it shows a value no screen can read back, and an id
 * carrying one is an id nothing can address.
 *
 * A lone surrogate is refused for the same reason and one more. It has no UTF-8
 * encoding at all, so what lands in the file is U+FFFD and the value read back
 * is not the value written — and since a write answers with what it was handed
 * rather than with what landed, the screen would be told a node it does not
 * have. No keyboard or paste makes one; it takes a client that wrote the escape
 * itself, which is exactly the caller who should be told rather than quietly
 * corrected.
 *
 * EMPTINESS IS NOT JUDGED HERE, because the callers answer it differently: a
 * name that trims to nothing is a refusal, a body that trims to nothing is a
 * node with nothing to say yet. Each caller says which it is.
 */
export function judgeText(label: string, value: string): TextJudgement {
  return judgeCharacters(label, value.trim());
}

/**
 * The two refusals above, asked of a value whose edges have already been settled
 * — because the body settles them differently from a one-line name, and both
 * still have to answer for the characters a text file cannot carry.
 */
function judgeCharacters(label: string, value: string): TextJudgement {
  if (value.includes("\0")) {
    return { value, problem: `${label} cannot contain a NUL character.` };
  }
  if (/\p{Surrogate}/u.test(value)) {
    return { value, problem: `${label} is not well-formed text.` };
  }
  return { value, problem: null };
}

/**
 * What a whole-value trim would do to the body, said as whole BLANK LINES
 * instead.
 *
 * The difference is one line long and it is the difference between keeping a
 * person's markdown and breaking it. A body that opens with an indented code
 * block is four spaces on every line; a trim takes them off the FIRST line only,
 * because that is where the value starts, and leaves them on the rest. What
 * comes back is not a dedented block — it is a paragraph with three indented
 * lines hanging off it, which is a different document from the one that was
 * written. Stripping blank lines cannot do that: it either drops a line whole or
 * keeps it whole, so the indentation a person wrote is the indentation stored.
 *
 * A line of nothing but spaces counts as blank, which is what an editor leaves
 * behind and what nobody means. And the edges are all this touches — a blank
 * line INSIDE the body is a paragraph break, and it stays.
 */
function trimBodyEdges(value: string): string {
  const lines = value.split("\n");
  let first = 0;
  let past = lines.length;
  while (first < past && (lines[first] ?? "").trim() === "") {
    first += 1;
  }
  while (past > first && (lines[past - 1] ?? "").trim() === "") {
    past -= 1;
  }
  return lines.slice(first, past).join("\n");
}

/**
 * A body arrives from a browser textarea, a Windows editor or a git checkout
 * with `core.autocrlf` on, so its line endings are whatever that machine uses.
 * Canonical files are LF only, and a value judged as CRLF but emitted as LF
 * would make the file's own re-read differ from what was written — the fixpoint
 * would not hold. So the judgement settles the question before it judges
 * anything, and a CR never reaches a stored value.
 */
function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

/** Held once: it carries no state, and the cap is asked about on every value. */
const UTF8 = new TextEncoder();

/**
 * The body of a node, judged as the one free-text value it is — the same rule
 * at both write doors and in the loader, so a body the panel can save is a body
 * every reader accepts.
 *
 * THERE IS NO SHAPE RULE, DELIBERATELY. The body is the specification and it
 * belongs to whoever writes it: any heading, any fence, any table, a `---` line,
 * a second `## Definition` or none at all. The templates suggest a shape and
 * nothing enforces one. What is judged is only what no text file can carry —
 * the NUL and the lone surrogate `judgeText` refuses — and the byte cap,
 * measured in the bytes that reach the file, not in characters: one Korean
 * syllable is three of them, and the cap is a cap on the file.
 *
 * The edges are settled first — line endings to LF, leading and trailing blank
 * lines dropped — so what is judged is exactly what would be stored, and a save
 * that changed nothing writes the bytes it read.
 */
export function judgeBody(value: string): BodyJudgement {
  const settled = trimBodyEdges(normalizeLineEndings(value));
  const problems: string[] = [];
  const characters = judgeCharacters("The specification", settled);
  if (characters.problem !== null) {
    problems.push(characters.problem);
  }
  if (UTF8.encode(settled).length > TEXT_BYTE_CAP) {
    problems.push("The specification cannot hold more than 256 KiB of text.");
  }
  return { value: settled, problems };
}

/**
 * An id is a filename now, on every machine the repository is ever cloned to,
 * so the shape door is where portability is settled rather than at the moment
 * some collaborator's checkout fails.
 */
const NODE_ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * The names MS-DOS gave to devices, which Windows still refuses to a file.
 * Matched case-insensitively, and against the part of the id BEFORE ITS FIRST
 * DOT, because that is the part Windows reads: `NUL.md` opens the null device
 * and not a spec node, so an id of `NUL` and an id of `NUL.anything` are the
 * same unwritable filename.
 */
const WINDOWS_DEVICE_NAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

/**
 * The sentence against an id, or `null` when there is none.
 *
 * Three refusals and three sentences, because one sentence cannot describe all
 * three honestly: a person told that ids use "letters, digits, dots, hyphens
 * and underscores" after typing `CON` has been told nothing they can act on.
 */
export function judgeNodeId(id: string): string | null {
  if (!NODE_ID_SHAPE.test(id)) {
    return "An id uses letters, digits, dots, hyphens and underscores, starts with a letter or digit, and holds at most 64 characters.";
  }
  // Legal in the shape above and still not portable: Windows drops a trailing
  // dot from a name, so `R-0001.` and `R-0001` would reach for the same file on
  // one collaborator's machine and two files on another's.
  if (id.endsWith(".")) {
    return "An id cannot end with a dot, because a name ending in a dot does not survive the trip to every machine this repository is cloned to.";
  }
  // The shape door has already refused every character a dot could be hiding,
  // so the head of the split is a device name or it is nothing.
  const [head = id] = id.split(".");
  if (WINDOWS_DEVICE_NAME.test(head)) {
    return `${head} is a reserved device name on Windows, so no file can be named after it. Choose another id.`;
  }
  return null;
}
