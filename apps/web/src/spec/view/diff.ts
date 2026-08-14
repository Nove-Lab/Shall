/**
 * WHAT MOVED BETWEEN TWO VERSIONS OF ONE FILE, LINE BY LINE.
 *
 * A node that changed since it was approved is yellow, and the only useful thing
 * to say about it is which lines are not the same. That answer is arithmetic
 * over two strings — no DOM, no clock, no library — so it lives in `view/` with
 * the layouts and the routing, where it can be executed and checked without a
 * browser. `review-parts.tsx` draws the rows; nothing here knows a colour.
 *
 * IT IS A LINE DIFF AND NEVER A WORD ONE. The unit a person edits a spec file in
 * is the line, the two texts being compared are whole files, and a word-level
 * diff of a paragraph that was rewritten says less than the paragraph does.
 */

export type DiffKind = "same" | "add" | "del";

export interface DiffRow {
  readonly kind: DiffKind;
  readonly text: string;
}

/**
 * HOW BIG A COMPARISON THIS WILL ACTUALLY MAKE — a table of `before x after`
 * cells, which is quadratic in the length of the two files.
 *
 * Four million cells is a `Uint32Array` of 16MB and a fraction of a second, which
 * two thousand lines against two thousand reaches. A spec node is a page or two,
 * so nothing real gets near it; what the cap protects against is a pasted log or
 * a generated file, where the honest failure is a coarser answer and not a
 * hung tab.
 */
const CELL_CAP = 4_000_000;

/**
 * A FILE'S LINES, WITH ITS LINE ENDINGS SETTLED FIRST.
 *
 * `\r\n` is normalised because the two sides can come from different places — one
 * is `git show`'s bytes, the other is the file on disk — and a diff that reported
 * every line as changed because one side carries carriage returns would be
 * reporting the checkout and not the edit.
 *
 * EXACTLY ONE TRAILING NEWLINE IS DROPPED. A text file ends with one, and it
 * terminates the last line rather than starting an empty one; splitting without
 * dropping it would show a phantom blank row at the foot of every file. A second
 * trailing newline is a real blank line and stays.
 *
 * An empty text is NO lines, which is not the same as one empty line — a file
 * with nothing in it and a file with a blank line in it are different files.
 */
export function linesOf(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  if (normalized === "") {
    return [];
  }
  const body = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return body.split("\n");
}

/**
 * THE TWO VERSIONS AS ONE LIST OF ROWS, by the longest common subsequence of
 * their lines.
 *
 * The table is filled from the BOTTOM RIGHT — `at(i, j)` is the length of the
 * longest common subsequence of the two tails — and the answer is then walked
 * FORWARD from the top left, which is the order the rows have to come out in.
 * It is one flat `Uint32Array` rather than an array of arrays: the row width is
 * known before the first cell, and one allocation of `(before + 1) * (after + 1)`
 * counts is both smaller and the thing the cap above is expressed in.
 *
 * ON A REPLACEMENT THE DELETION COMES FIRST, which is what makes a changed line
 * read as one line: the old text and the new text end up adjacent, old above.
 * The tie — `at(i + 1, j) >= at(i, j + 1)`, where neither direction loses
 * anything — is what decides it, and it is the whole of that convention.
 *
 * OVER THE CAP THE ANSWER IS COARSER AND STILL TRUE: the whole of one file
 * deleted and the whole of the other added. It says less than a diff and it says
 * nothing false, which is the right trade for an input this screen was not
 * built for.
 */
export function lineDiff(approved: string, current: string): DiffRow[] {
  const before = linesOf(approved);
  const after = linesOf(current);

  if (before.length * after.length > CELL_CAP) {
    return [
      ...before.map<DiffRow>((text) => ({ kind: "del", text })),
      ...after.map<DiffRow>((text) => ({ kind: "add", text })),
    ];
  }

  const width = after.length + 1;
  const lcs = new Uint32Array((before.length + 1) * width);
  // `?? 0` and not a `!`: an index into a typed array is `number | undefined`
  // under `noUncheckedIndexedAccess`, and the row past the end of the table is
  // genuinely zero — the longest common subsequence of two empty tails.
  const at = (i: number, j: number): number => lcs[i * width + j] ?? 0;

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      lcs[i * width + j] =
        (before[i] ?? "") === (after[j] ?? "")
          ? at(i + 1, j + 1) + 1
          : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    const left = before[i] ?? "";
    const right = after[j] ?? "";
    if (left === right) {
      rows.push({ kind: "same", text: left });
      i += 1;
      j += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      rows.push({ kind: "del", text: left });
      i += 1;
    } else {
      rows.push({ kind: "add", text: right });
      j += 1;
    }
  }
  // Whichever file outlasted the other: its tail is all deletion or all addition.
  while (i < before.length) {
    rows.push({ kind: "del", text: before[i] ?? "" });
    i += 1;
  }
  while (j < after.length) {
    rows.push({ kind: "add", text: after[j] ?? "" });
    j += 1;
  }
  return rows;
}

/**
 * ONE FILE AS ROWS, ALL OF THEM UNCHANGED — for the case where there is nothing
 * to compare against. Git no longer holding the version a node was approved at
 * is not an error and not an empty answer: the file as it stands is still the
 * thing the person came to read, and it is shown in the same block, in the same
 * face, with no line claiming to have moved.
 */
export function wholeFile(text: string): DiffRow[] {
  return linesOf(text).map<DiffRow>((line) => ({ kind: "same", text: line }));
}
