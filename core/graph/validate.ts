import { attributesFor, TEXT_BYTE_CAP } from "./attributes.js";

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
 * Nothing here reads a database, a file or a clock, so it is as safe in a
 * browser bundle as it is in the daemon — which is why the byte cap is measured
 * with `TextEncoder` and not with `Buffer`.
 */

/** What `judgeText` found: the value as it would be stored, and what is wrong with it. */
export interface TextJudgement {
  readonly value: string;
  readonly problem: string | null;
}

/** What `judgeAttributes` found: the filled slots, and every sentence against them. */
export interface AttributeJudgement {
  readonly values: Record<string, string>;
  readonly problems: string[];
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
 * EMPTINESS IS NOT JUDGED HERE, because the two callers answer it differently: a
 * name that trims to nothing is a refusal, an optional attribute that trims to
 * nothing is a cell the person cleared. Each caller says which it is.
 */
export function judgeText(label: string, value: string): TextJudgement {
  return judgeCharacters(label, value.trim());
}

/**
 * The two refusals above, asked of a value whose edges have already been settled
 * — because prose settles them differently from a line, and both still have to
 * answer for the characters a text file cannot carry.
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
 * What a whole-value trim would do to prose, said as whole BLANK LINES instead.
 *
 * The difference is one line long and it is the difference between keeping a
 * person's markdown and breaking it. A section that opens with an indented code
 * block is four spaces on every line; a trim takes them off the FIRST line only,
 * because that is where the value starts, and leaves them on the rest. What
 * comes back is not a dedented block — it is a paragraph with three indented
 * lines hanging off it, which is a different document from the one that was
 * written. Stripping blank lines cannot do that: it either drops a line whole or
 * keeps it whole, so the indentation a person wrote is the indentation stored.
 *
 * A line of nothing but spaces counts as blank, which is what an editor leaves
 * behind and what nobody means. And the edges are all this touches — a blank
 * line INSIDE prose is a paragraph break, and it stays.
 */
function trimProseEdges(value: string): string {
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
 * A prose value arrives from a browser textarea, a Windows editor or a git
 * checkout with `core.autocrlf` on, so its line endings are whatever that
 * machine uses. Canonical files are LF only, and a value judged as CRLF but
 * emitted as LF would make the file's own re-read differ from what was written
 * — the fixpoint would not hold. So the door settles the question before it
 * judges anything, and a CR never reaches a stored value.
 */
function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

/**
 * The one restriction on prose, which is otherwise opaque text: a line starting
 * with `## ` is how a spec file names its sections, so a value carrying one
 * would parse back as two attributes. The alternative was an escape convention,
 * which every hand and every agent editing these files would have to learn, and
 * which would cost emit its identity with the content it emits. `m` here is
 * JavaScript's own idea of a line start, which is slightly wider than a file's
 * — a door may be stricter than what reads it, never the reverse.
 */
const PROSE_SECTION_HEADING = /^## /m;

/** Held once: it carries no state, and the cap is asked about on every slot. */
const UTF8 = new TextEncoder();

/**
 * What a write door does to a node's attributes, in ONE place — both doors and
 * the loader run this and none of them keeps a rule of its own.
 *
 * WHAT ARRIVES IS THE WHOLE MAP, not a patch. The panel sends this type's entire
 * roster every time, so a name the map omits and a name it sends empty mean the
 * same thing — that slot is empty — and what comes back holds the FILLED ones
 * only. A name absent from the answer is a key the file does not write at all,
 * which is how an edit clears an optional cell.
 *
 * THE ORDER THE CHECKS RUN IN IS THE ORDER A PERSON CAN ACT ON:
 *   · a name this type does not carry comes first, because every later answer
 *     would be about a field that is not there to be wrong;
 *   · then the trim and the two characters a text file cannot carry, so what
 *     the rest judges is what would actually be stored;
 *   · a value that trims to nothing is not a value — the optional slot is left
 *     empty, the required one is remembered;
 *   · every required slot left empty is said AT ONCE. A door that refuses a
 *     five-slot type one field at a time makes a person submit five times to
 *     learn five things, and each refusal reads like a different problem;
 *   · last the shape rules, which only a filled value can break.
 *
 * WHICH NAMES A REFUSAL USES IS NOT AN ACCIDENT. An unknown attribute is
 * something only a program can send — the panel offers this type's controls and
 * nothing else — so that sentence speaks in stored names, which is what the
 * caller wrote and what it must write instead. Everything after it is a field a
 * person is looking at, so those sentences use the label the person is reading.
 *
 * There is no second fence under this one any more. The 169 CHECKs of the old
 * schema are gone with the database they belonged to, and a markdown file will
 * hold whatever is written into it, so this is the only place that says no —
 * which is why the loader runs it again over every file it did not write.
 */
export function judgeAttributes(
  nodeType: string,
  raw: Record<string, string>,
): AttributeJudgement {
  // A type outside the canon has no roster to judge against, and this is the
  // look-up that finds out — on the create door where the caller named the type,
  // on the edit door where the type came off the stored node, and at load where
  // it came off the folder name. Nothing further can be said without a roster,
  // so this answer is alone.
  const descriptors = attributesFor(nodeType);
  if (descriptors === null) {
    return { values: {}, problems: [`Unknown node type: ${nodeType}`] };
  }

  const problems: string[] = [];

  // Named together with the type, because the type is the half a person needs:
  // `priority` is a perfectly real column that a Requirement two rows away does
  // carry. Every canon type carries at least one attribute, so there is no
  // empty-tail sentence to write.
  const carried = descriptors.map((descriptor) => descriptor.name);
  const unknown = Object.keys(raw).filter((name) => !carried.includes(name));
  if (unknown.length > 0) {
    problems.push(
      `A ${nodeType} does not carry ${unknown.join(", ")}. It carries ${carried.join(", ")} and nothing else.`,
    );
  }

  const values: Record<string, string> = {};
  const unfilled: string[] = [];
  for (const descriptor of descriptors) {
    const sent = raw[descriptor.name];
    if (sent === undefined) {
      if (descriptor.required) {
        unfilled.push(descriptor.label);
      }
      continue;
    }
    // A line and a choice are one scalar each, so their edges are whitespace and
    // nothing else. Prose is a document, and its first line's indentation is
    // part of what it says.
    const judged =
      descriptor.kind === "prose"
        ? judgeCharacters(
            descriptor.label,
            trimProseEdges(normalizeLineEndings(sent)),
          )
        : judgeText(descriptor.label, sent);
    if (judged.problem !== null) {
      // Filled, and unusable. It is not stored and it is not counted as empty:
      // answering a NUL with "a Requirement requires Statement" as well would
      // name one mistake twice and send the person to fill a field they filled.
      problems.push(judged.problem);
      continue;
    }
    if (judged.value === "") {
      if (descriptor.required) {
        unfilled.push(descriptor.label);
      }
      continue;
    }
    values[descriptor.name] = judged.value;
  }

  if (unfilled.length > 0) {
    problems.push(`A ${nodeType} requires ${unfilled.join(", ")}.`);
  }

  // In roster order, so a person who filled two fields wrongly is told about the
  // one nearer the top of the panel first.
  for (const descriptor of descriptors) {
    const value = values[descriptor.name];
    if (value === undefined) {
      continue;
    }
    // Wider than the line breaks a file can hold: U+2028 renders as two lines
    // on every screen this value will ever be shown on, and a frontmatter
    // scalar that is one line by construction is what lets the emitter skip
    // YAML's block styles altogether.
    if (
      descriptor.kind === "line" &&
      /[\n\r\u000B\u000C\u0085\u2028\u2029]/.test(value)
    ) {
      problems.push(
        `${descriptor.label} is one line, so it cannot contain a line break.`,
      );
    }
    if (descriptor.kind === "prose" && PROSE_SECTION_HEADING.test(value)) {
      problems.push(
        `${descriptor.label} cannot contain a line that begins with "## " — that is how a spec file names its sections.`,
      );
    }
    // Measured in the bytes that reach the file, not in characters: one Korean
    // syllable is three of them, and the cap is a cap on the file.
    if (UTF8.encode(value).length > TEXT_BYTE_CAP) {
      problems.push(
        `${descriptor.label} cannot hold more than 256 KiB of text.`,
      );
    }
    if (descriptor.kind === "choice") {
      // A `choice` always carries its vocabulary; the fallback is what the
      // optional key costs to read and never a live branch. The values are the
      // stored spellings, which is what a caller has to send — the English
      // labels belong to the screen.
      const vocabulary = (descriptor.values ?? []).map((choice) => choice.value);
      if (!vocabulary.includes(value)) {
        problems.push(
          `${descriptor.label} must be one of ${vocabulary.join(", ")}.`,
        );
      }
    }
  }

  return { values, problems };
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
