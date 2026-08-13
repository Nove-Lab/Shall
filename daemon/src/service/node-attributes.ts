import { attributesFor, TEXT_BYTE_CAP } from "@shall/core/graph";
import { invalid } from "./errors.js";

/**
 * Text on its way into a node, trimmed — so the stored bytes are what the panel
 * showed rather than whatever whitespace came with the paste.
 *
 * NUL is refused outright, because it is the one character sqlite will take and
 * not give back: the full bytes go in, the read stops at the NUL, and what comes
 * out is a shorter string than what went in. A row written that way holds text
 * no screen can show and, if the NUL is in an id, an id nothing can address.
 *
 * A lone surrogate is refused for the same reason and one more. Sqlite stores it
 * as U+FFFD, so the value read back is not the value written — and since a write
 * answers with what it was handed rather than with what landed, the screen would
 * be told a node it does not have. No keyboard or paste makes one; it takes a
 * client that wrote the escape itself, which is exactly the caller who should be
 * told rather than quietly corrected.
 *
 * EMPTINESS IS NOT JUDGED HERE, because the two callers answer it differently: a
 * name that trims to nothing is a refusal, an optional attribute that trims to
 * nothing is a cell the person cleared. Each caller says which it is.
 */
export function trimmedText(label: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("\0")) {
    throw invalid(`${label} cannot contain a NUL character.`);
  }
  if (/\p{Surrogate}/u.test(trimmed)) {
    throw invalid(`${label} is not well-formed text.`);
  }
  return trimmed;
}

/**
 * What a write door does to a node's attributes, in ONE place — both doors run
 * this and neither keeps a rule of its own.
 *
 * WHAT ARRIVES IS THE WHOLE MAP, not a patch. The panel sends this type's entire
 * roster every time, so a name the map omits and a name it sends empty mean the
 * same thing — that slot is empty — and what comes back holds the FILLED ones
 * only. The store writes NULL for every name absent from the answer, which is
 * how an edit clears an optional cell.
 *
 * THE ORDER THE CHECKS RUN IN IS THE ORDER A PERSON CAN ACT ON:
 *   · a name this type does not carry comes first, because every later answer
 *     would be about a field that is not there to be wrong;
 *   · then the trim and the two characters sqlite would not hand back, so what
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
 * The schema says all of this again from underneath, in 169 CHECKs. Two fences,
 * one rule: this one exists to name the type, the attribute and the values in a
 * sentence, and the database's exists because a rule held only by the doors is
 * held only by the doors that exist today.
 */
export function validateAttributes(
  nodeType: string,
  raw: Record<string, string>,
): Record<string, string> {
  // A type outside the canon has no roster to judge against, and this is the
  // look-up that finds out — on the create door where the caller named the type,
  // and on the edit door where the type came off the stored row.
  const descriptors = attributesFor(nodeType);
  if (descriptors === null) {
    throw invalid(`Unknown node type: ${nodeType}`);
  }

  // Named together with the type, because the type is the half a person needs:
  // `priority` is a perfectly real column that a Requirement two rows away does
  // carry. Every canon type carries at least one attribute, so there is no
  // empty-tail sentence to write.
  const carried = descriptors.map((descriptor) => descriptor.name);
  const unknown = Object.keys(raw).filter((name) => !carried.includes(name));
  if (unknown.length > 0) {
    throw invalid(
      `A ${nodeType} does not carry ${unknown.join(", ")}. It carries ${carried.join(", ")} and nothing else.`,
    );
  }

  const values: Record<string, string> = {};
  const unfilled: string[] = [];
  for (const descriptor of descriptors) {
    const sent = raw[descriptor.name];
    const value = sent === undefined ? "" : trimmedText(descriptor.label, sent);
    if (value === "") {
      if (descriptor.required) {
        unfilled.push(descriptor.label);
      }
      continue;
    }
    values[descriptor.name] = value;
  }

  if (unfilled.length > 0) {
    throw invalid(`A ${nodeType} requires ${unfilled.join(", ")}.`);
  }

  // In roster order, so a person who filled two fields wrongly is told about the
  // one nearer the top of the panel first.
  for (const descriptor of descriptors) {
    const value = values[descriptor.name];
    if (value === undefined) {
      continue;
    }
    // Wider than the CHECK underneath, which knows only char(10) and char(13):
    // a door may be stricter than its backstop, never the reverse, and U+2028
    // renders as two lines on every screen this value will ever be shown on.
    if (
      descriptor.kind === "line" &&
      /[\n\r\u000B\u000C\u0085\u2028\u2029]/.test(value)
    ) {
      throw invalid(
        `${descriptor.label} is one line, so it cannot contain a line break.`,
      );
    }
    // Refused here so the cap arrives as a sentence — the schema's
    // `octet_length` CHECK under this rule answers with a raw constraint
    // violation, which the router can only relay as a daemon failure.
    if (Buffer.byteLength(value, "utf8") > TEXT_BYTE_CAP) {
      throw invalid(
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
        throw invalid(
          `${descriptor.label} must be one of ${vocabulary.join(", ")}.`,
        );
      }
    }
  }

  return values;
}
