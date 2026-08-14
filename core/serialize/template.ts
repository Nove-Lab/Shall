import {
  attributesFor,
  EDGE_GRAMMAR,
  formatNodeId,
  idPrefixFor,
  nodeTypeEntry,
  type AttributeDescriptor,
} from "../graph/index.js";
import { EDGES_KEY, FENCE, NAME_KEY, SHORT_NAME_KEY } from "./emit.js";

/**
 * The starting file for a type, derived from the roster and committed to the
 * repository — one per canon type, under `.shall/templates/`.
 *
 * IT IS A PURE FUNCTION OF THE REGISTRY, so regenerating is byte-idempotent and
 * the daemon can rewrite the folder on every open, comparing bytes and writing
 * only what differs. `git status` stays quiet, and a Shall upgrade that changes
 * a vocabulary shows up as an ordinary diff a person can read and commit.
 *
 * THE HINTS ARE COMMENTS AND THE VALUES ARE EMPTY. A template that shipped
 * placeholder text would be a template whose placeholder could pass validation
 * — `TODO` is a perfectly good one-line string — and the first thing a person
 * would learn is that Shall accepts nonsense. Empty means absent, absent means
 * an unfilled required slot, and an unfilled required slot meets the same
 * `A Requirement requires Statement, Description.` a half-filled panel meets.
 * The guidance loop is the refusal, not the placeholder.
 *
 * EVERY WORD BELOW IS DERIVED. Requiredness and kind from the roster, the
 * vocabularies from the columns, the relation table from the edge grammar, the
 * suggested id from the type's prefix. Nothing here is a second copy of a fact
 * that lives somewhere else, which is why a template cannot go stale.
 */

/**
 * The column the hints start in. It is the width the roster needs today — the
 * longest key any type carries in its frontmatter is `responsibility_type:` at
 * twenty — with room to spare, so that every template's hints line up in the
 * same place and a person reading two of them side by side reads one shape.
 */
const HINT_COLUMN = 23;

/**
 * What one key wants, in four words: whether it must be filled, and whether it
 * is one line of anything or one of a fixed list. The vocabulary is written out
 * in the stored spellings, because that is what goes in the file — the English
 * labels belong to the panel.
 */
function hintFor(descriptor: AttributeDescriptor): string {
  const need = descriptor.required ? "required" : "optional";
  const shape =
    descriptor.kind === "choice"
      ? `one of: ${(descriptor.values ?? [])
          .map((choice) => choice.value)
          .join(" | ")}`
      : "one line";
  return `# ${need} · ${shape}`;
}

/**
 * The template for one type, or a thrown defect for a name the canon does not
 * have — the caller is a loop over the canon itself, so a miss is a bug and not
 * something a person can be told about.
 */
export function emitTemplate(type: string): string {
  const entry = nodeTypeEntry(type);
  const descriptors = attributesFor(type);
  if (entry === null || descriptors === null) {
    throw new Error(`Unknown node type: ${type}`);
  }

  // The same split the emitter makes, from the same place: one scalar goes
  // above the fence, a person's paragraphs go below it.
  const scalars = descriptors.filter(
    (descriptor) => descriptor.kind !== "prose",
  );
  const prose = descriptors.filter((descriptor) => descriptor.kind === "prose");

  const lines: string[] = [FENCE];
  lines.push(`# ${type} — copy to ../spec/${type}/<id>.md and fill in.`);
  lines.push(
    "# The FILENAME is the id and the FOLDER is the type; neither is repeated below.",
  );
  lines.push(
    "# An id uses letters, digits, dots, hyphens and underscores, at most 64 characters.",
  );
  lines.push(`# Suggested shape: ${formatNodeId(entry.prefix, 1)}.`);

  const keys: { key: string; hint: string }[] = [
    { key: SHORT_NAME_KEY, hint: "# required · one line" },
    { key: NAME_KEY, hint: "# required · one line" },
    ...scalars.map((descriptor) => ({
      key: descriptor.name,
      hint: hintFor(descriptor),
    })),
  ];
  // Aligned to the widest key when the roster ever grows one past the column,
  // so the hints of one file always agree with each other even if they stop
  // agreeing with another file's.
  const column = Math.max(
    HINT_COLUMN,
    ...keys.map((slot) => slot.key.length + 2),
  );
  for (const slot of keys) {
    lines.push(`${slot.key}:`.padEnd(column) + slot.hint);
  }

  lines.push(
    `# Body sections: ${prose
      .map(
        (descriptor) =>
          `"## ${descriptor.label}" ${descriptor.required ? "required" : "optional"}`,
      )
      .join(" · ")}.`,
  );

  const rows = EDGE_GRAMMAR.filter((row) => row.fromType === type);
  const [firstRow] = rows;
  if (firstRow === undefined) {
    lines.push(`# From a ${type} the canon allows no outgoing relations.`);
  } else {
    lines.push(
      "# Outgoing relations are written HERE and only here — never on the target.",
    );
    // `a` before every type name, `AcceptanceCriterion` included: every refusal
    // this codebase already writes chooses the article that way, and one voice
    // matters more here than one letter of grammar.
    lines.push(`# From a ${type} the canon allows:`);
    const arrow = Math.max(...rows.map((row) => row.edgeType.length)) + 1;
    for (const row of rows) {
      lines.push(`#   ${row.edgeType.padEnd(arrow)}-> ${row.toType}`);
    }
    // Commented out rather than left as an empty key: `edges:` with nothing
    // under it is a list of no edges, and a new node has none.
    const targetPrefix = idPrefixFor(firstRow.toType);
    if (targetPrefix !== null) {
      lines.push(`# ${EDGES_KEY}:`);
      lines.push(`#   - type: ${firstRow.edgeType}`);
      lines.push(`#     to: ${formatNodeId(targetPrefix, 1)}`);
    }
  }

  lines.push(FENCE);

  // The headings alone, with nothing under them — the same shape the emitter
  // writes, with every value empty. A section left empty reads as absent, so
  // the file a person starts from is a file that refuses itself until it is
  // filled in.
  let text = `${lines.join("\n")}\n`;
  if (prose.length > 0) {
    text += `\n${prose.map((descriptor) => `## ${descriptor.label}`).join("\n\n")}\n`;
  }
  return text;
}
