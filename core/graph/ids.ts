import { nodeTypeEntry } from "./canon.js";

/**
 * Node ids: the type's canon prefix, then a zero-padded ordinal — `R-0003`.
 *
 * The prefix is there so an id read on a card or in an error message says what
 * it points at without a lookup. The padding is not decoration: ids sort as
 * bytes, and unpadded `R-10` would sort ahead of `R-2` and quietly put a column
 * in the wrong order. At a fixed width, byte order and numeric order agree.
 *
 * The width is what bounds the sequence — four digits stop at `9999`, and past
 * that a suggestion is refused rather than emitting `R-10000`, which would sort
 * between `R-0999` and `R-1000` and break that property for every id after it.
 */

/** Zero-padded to this many digits. */
export const ID_SEQUENCE_WIDTH = 4;

/** The last ordinal that fits the width. */
export const ID_SEQUENCE_MAX = 9999;

/** Between the prefix and the ordinal, and not a character a prefix may carry. */
const SEPARATOR = "-";

const DIGITS = /^\d+$/;

/** The prefix a type's ids carry, or null when the type is not one of the 21. */
export function idPrefixFor(type: string): string | null {
  return nodeTypeEntry(type)?.prefix ?? null;
}

export function formatNodeId(prefix: string, ordinal: number): string {
  return `${prefix}${SEPARATOR}${String(ordinal).padStart(ID_SEQUENCE_WIDTH, "0")}`;
}

/**
 * The id to put in a new node's form: one past the highest ordinal already
 * taken by that type, or `""` when there is nothing sensible to offer — an
 * unknown type, or a sequence that has reached `ID_SEQUENCE_MAX`. Empty means
 * "you type one", which is a state the form already handles, so this never
 * throws.
 *
 * It is a SUGGESTION and only that. The person can replace it with anything,
 * so no reader of an id may assume it has this shape: the format is how ids are
 * offered, never a fact about the ids that come back.
 *
 * Ids that do not match the type's own `<prefix>-<four digits>` are skipped
 * rather than parsed loosely — a hand-typed `R-x` should not push the next
 * suggestion anywhere.
 */
export function nextIdSuggestion(
  type: string,
  existingIds: readonly string[],
): string {
  const prefix = idPrefixFor(type);
  if (prefix === null) {
    return "";
  }

  const head = `${prefix}${SEPARATOR}`;
  let highest = 0;
  for (const id of existingIds) {
    if (!id.startsWith(head)) {
      continue;
    }
    const digits = id.slice(head.length);
    if (digits.length !== ID_SEQUENCE_WIDTH || !DIGITS.test(digits)) {
      continue;
    }
    const ordinal = Number(digits);
    if (ordinal > highest) {
      highest = ordinal;
    }
  }

  const next = highest + 1;
  return next > ID_SEQUENCE_MAX ? "" : formatNodeId(prefix, next);
}
