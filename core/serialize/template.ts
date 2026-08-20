import {
  bandFolderOf,
  EDGE_GRAMMAR,
  formatNodeId,
  idPrefixFor,
  nodeTypeEntry,
  sectionGuideFor,
  type SectionGuide,
} from "../graph/index.js";
import {
  BLOCKING_KEY,
  COMMITS_KEY,
  COMMITS_TYPE,
  EDGES_KEY,
  FENCE,
  FINDING_TYPE,
  NAME_KEY,
  RELATED_NODES_KEY,
  SHORT_NAME_KEY,
} from "./emit.js";

/**
 * The starting file for a type, in its two audiences.
 *
 * `emitTemplate` is the REFERENCE COPY — one per canon type, regenerated under
 * `~/.shall/templates/` so a person or an agent can read what a fresh node
 * looks like before making one. `emitScaffold` is the same file AS IT LANDS IN
 * A PROJECT: `shall add-spec-node` writes it at the node's own path, so the
 * lines about where to put the file and what to name it are not in it — the
 * path and the name are already true.
 *
 * BOTH ARE PURE FUNCTIONS OF THE CANON, so regenerating is byte-idempotent and
 * the daemon can rewrite the reference folder on every start, comparing bytes
 * and writing only what differs.
 *
 * A TEMPLATE IS A GUIDE AND NOT A CONTRACT. The body of a node is free
 * markdown: nothing requires the headings this file ships, and a node written
 * in an entirely different shape reads exactly as well. What must actually hold
 * — the two names, the id in the filename, the edge grammar — is said in the
 * `#` comments, which the first canonical save strips; the headings below the
 * fence are a starting shape a person or an agent may keep, reshape or delete.
 *
 * EVERY WORD BELOW IS DERIVED. The sections and their hints from the guide, the
 * relation table from the edge grammar, the paths from the band and the
 * prefix. Nothing here is a second copy of a fact that lives somewhere else,
 * which is why a template cannot go stale.
 */

/**
 * The column the key hints start in — wide enough that the two keys' hints line
 * up, and the same column in all 22 files so a person reading two of them side
 * by side reads one shape.
 */
const HINT_COLUMN = 23;

/**
 * Everything below the header: the two required keys, the body guide, and the
 * relation table. This is the part both audiences read identically, because
 * what a node needs does not depend on how its file came to exist.
 */
function startingLines(
  type: string,
  guide: readonly SectionGuide[],
): string[] {
  const lines: string[] = [];
  for (const key of [SHORT_NAME_KEY, NAME_KEY]) {
    lines.push(`${key}:`.padEnd(HINT_COLUMN) + "# required · one line");
  }

  lines.push(
    "# Everything below the closing fence is the specification: free markdown,",
  );
  lines.push(
    "# read back exactly as written. The headings that follow are a starting",
  );
  lines.push("# shape, not a rule — keep them, reshape them or write your own.");
  for (const suggested of guide) {
    lines.push(
      suggested.hint === undefined
        ? `#   ## ${suggested.label}`
        : `#   ## ${suggested.label} — ${suggested.hint}`,
    );
  }

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

  // The type-specific keys. Each belongs to one type and no other carries it, so
  // no other template mentions it — and these comments are the ONLY place a
  // type's own vocabulary is written down, which is why a key with no line here
  // is a key nobody writing the file can find.
  if (type === COMMITS_TYPE) {
    lines.push(
      "# The commits this work produced, one sha per line, in the order they were made.",
    );
    lines.push(`# ${COMMITS_KEY}:`);
    lines.push("#   - 0123abc");
  }
  if (type === FINDING_TYPE) {
    lines.push(
      "# Whether this finding stopped the work that found it. Write the key only",
    );
    lines.push(
      "# when it is true: nothing computed reads it, and a finding that is not",
    );
    lines.push("# blocking says nothing about it.");
    lines.push(`# ${BLOCKING_KEY}: true`);
    lines.push(
      "# The nodes this finding is about, as a hint for whoever reads it. It is",
    );
    lines.push(
      "# not a relation and nothing resolves it: an id no file answers to is not",
    );
    lines.push("# an error here, and an empty list is not one either.");
    lines.push(`# ${RELATED_NODES_KEY}:`);
    lines.push("#   - R-0001");
  }

  return lines;
}

/** Header, shared middle, fence, then the suggested headings as an actual start. */
function emitStartingFile(type: string, header: readonly string[]): string {
  const guide = sectionGuideFor(type);
  if (guide === null) {
    throw new Error(`Unknown node type: ${type}`);
  }
  const lines = [FENCE, ...header, ...startingLines(type, guide), FENCE];

  // The suggested headings, with nothing under them — the starting shape as an
  // actual start. A body left exactly as shipped still reads as a node; what to
  // put under each heading, and whether to keep it at all, is the author's.
  let text = `${lines.join("\n")}\n`;
  if (guide.length > 0) {
    text += `\n${guide.map((suggested) => `## ${suggested.label}`).join("\n\n")}\n`;
  }
  return text;
}

/**
 * The reference copy under `~/.shall/templates/`, or a thrown defect for a name
 * the canon does not have — the caller is a loop over the canon itself, so a
 * miss is a bug and not something a person can be told about.
 *
 * Its header is the half a scaffold does not need: where such a file lives,
 * what its name means, and the command that writes one so nobody has to place
 * it by hand.
 */
export function emitTemplate(type: string): string {
  const entry = nodeTypeEntry(type);
  const band = bandFolderOf(type);
  if (entry === null || band === null) {
    throw new Error(`Unknown node type: ${type}`);
  }
  return emitStartingFile(type, [
    `# ${type} — the starting shape of a ${type} node.`,
    `# \`shall add-spec-node --type ${type}\` writes this file into the project at`,
    `# .shall/spec/${band}/${type}/<id>.md with the next free id as its name.`,
    "# (Writing it there by hand works too: the FILENAME is the id and the FOLDER",
    "# is the type, so neither is repeated inside. An id uses letters, digits,",
    `# dots, hyphens and underscores, at most 64 characters — ${formatNodeId(entry.prefix, 1)} is the shape`,
    "# Shall suggests.)",
  ]);
}

/**
 * The file `shall add-spec-node` writes at the node's own path. The filename
 * and the folder are already the id and the type, so its header says only what
 * is left to do — fill it in, and let the check read the result.
 */
export function emitScaffold(type: string): string {
  return emitStartingFile(type, [
    `# A new ${type}. Fill it in — the \`#\` comments are notes to delete as you go,`,
    "# and `shall check` reads the result.",
  ]);
}
