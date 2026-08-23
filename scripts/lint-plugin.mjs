import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The repo root has no `@shall` link — that resolution belongs to the
// workspaces — so core is imported by the path it actually sits at, the same
// way `scripts/dev.mjs` reaches for the workspace scripts by name.
import {
  EDGE_TYPE_NAMES,
  NODE_TYPES,
  sectionGuideFor,
} from "../core/dist/graph/index.js";

/**
 * The plugin's compiler.
 *
 * The plugin ships prose and nothing else: its whole payload is sentences an
 * agent will follow literally. A skill that invents `SATISFIES` because the
 * process document used to say so, or tells an agent to run a subcommand that
 * does not exist, fails in the only place it cannot be caught — inside somebody
 * else's session, hours later, as a spec file the graph refuses. So the prose
 * gets checked against the same tables the code is checked against.
 *
 * Every rule here is a rule about a name, because a name is the one thing in
 * documentation that can be wrong in a way a reader cannot see.
 */

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDirectory);
const pluginRoot = path.join(repoRoot, "plugin");

/**
 * SCREAMING_SNAKE words that are not relations and never will be.
 *
 * If this list stops you on an ordinary English word or a code identifier, add
 * it. If it stops you on something that reads like a relation — a verb, a
 * participle, a `VERBED_BY` — you have invented a relation, and the fix is in
 * the document, not here.
 */
const ALLOWED_SHOUTS = new Set([
  // Prose emphasis.
  "SHALL",
  "MUST",
  "NEVER",
  "ALWAYS",
  "EVERY",
  "EVERYTHING",
  "NOTHING",
  "ANYTHING",
  "EXACTLY",
  "INSTEAD",
  "BEFORE",
  "AFTER",
  "FIRST",
  "ALONE",
  "WHOLE",
  "ONLY",
  "IMPORTANT",
  "WARNING",
  "YELLOW",
  "GREEN",
  "PARENT",
  "CHILD",
  "FOLDER",
  "FILENAME",
  "ORPHAN",
  "LEAVES",
  "EDITS",
  // Formats, protocols and plumbing.
  "JSON",
  "YAML",
  "PATH",
  "CLI",
  "URL",
  "HTTP",
  "HTTPS",
  "POSIX",
  "ASCII",
  "UTF",
  "ENOENT",
  "STDIN",
  "STDOUT",
  "STDERR",
  // Names this repository and Claude Code use.
  "ARGUMENTS",
  "CLAUDE_PLUGIN_ROOT",
  "README",
  "SKILL",
  "SHALL_HOST",
  "NODE_ENV",
  "EDGE_GRAMMAR",
  "EDGE_TYPE_NAMES",
  "ANCHOR_RULES",
  "NODE_TYPES",
]);

/** The subcommands `shall` answers to. */
const SUBCOMMANDS = new Set([
  "init",
  "check",
  "status",
  "board",
  "add-spec-node",
  "log",
  "help",
]);

/**
 * The three the docs name in order to deny them. There is no `shall approve`,
 * no `shall reject` and no `shall close`, and saying so is the point of the
 * sentence they appear in — so the check that catches an invented subcommand
 * must not catch the sentence that exists to prevent one.
 */
const DENIED_SUBCOMMANDS = new Set(["approve", "reject", "close"]);

/**
 * The four relations older process documents name and the canon does not have.
 *
 * They cannot be banned outright: the skills carry the translation table that
 * teaches an agent what each of them became, and a table cannot say what a name
 * translates to without writing the name. They cannot be allowed outright
 * either — these four are the exact names a stale process document will push an
 * agent into writing, which is the whole reason this check exists. So they are
 * allowed on a line that already denies or translates them, and nowhere else.
 */
const DENIED_RELATIONS = new Set([
  "SATISFIES",
  "DERIVED_FROM",
  "ASSIGNED_TO",
  "CONSTRAINS",
]);

/** What makes a line a denial rather than an instruction. */
const DENIAL = /no such|not exist|never|nothing|wrong|older process/i;

/** `--type <Type>` is how the CLI's shape is written down, not a real type. */
const TYPE_PLACEHOLDERS = new Set(["Type", "NodeType"]);

const EDGE_TYPES = new Set(EDGE_TYPE_NAMES);
const CANON_TYPES = new Set(NODE_TYPES.map((entry) => entry.name));

const SCREAMING = /\b[A-Z][A-Z0-9_]{4,}\b/g;
const TYPE_FLAG = /--type[=\s]+<?`?([A-Za-z][A-Za-z0-9]*)/g;
const SHALL_CALL = /\bshall\s+([a-z][a-z0-9-]*)/g;
const INLINE_CODE = /`([^`]+)`/g;
const FENCE = /^\s*(`{3,}|~{3,})/;

/**
 * The interpunct: how a template writes "pick one of these".
 *
 * It is not a character English prose reaches for. In this repository it means
 * one thing — a starting file offering the choices a heading takes — so a
 * plugin document that contains one is a plugin document that pasted a
 * vocabulary, whatever the words around it have since drifted into.
 */
const MIDDLE_DOT = "·";

/**
 * Every hint core's section guide carries, mapped to the heading it belongs
 * to.
 *
 * These are the strings `shall add-spec-node` writes into the commented header
 * of a starting file: the vocabulary a heading offers, or the convention it
 * asks for. They are the canon's, they move when the canon moves, and core is
 * the only place they may live.
 */
const TEMPLATE_HINTS = collectTemplateHints();

function collectTemplateHints() {
  const hints = new Map();
  for (const entry of NODE_TYPES) {
    const sections = sectionGuideFor(entry.name);
    if (sections === null) {
      continue;
    }
    for (const section of sections) {
      if (typeof section.hint !== "string" || section.hint.length === 0) {
        continue;
      }
      if (!hints.has(section.hint)) {
        hints.set(section.hint, `${entry.name}'s ${section.label}`);
      }
    }
  }
  // Longest first: one hint can sit inside another — "comma-separated" is the
  // whole of one heading's hint and the opening of another's — and a reader
  // told twice about one phrase reads it as two mistakes.
  return new Map(
    [...hints].sort(([left], [right]) => right.length - left.length),
  );
}

const violations = [];

/** Whether a line already carries a canon relation — a translation, not an order. */
function namesARealEdgeType(text) {
  return EDGE_TYPE_NAMES.some((name) => text.includes(name));
}

function report(file, line, sentence) {
  violations.push({
    file: path.relative(repoRoot, file),
    line,
    sentence,
  });
}

function markdownFilesUnder(directory) {
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries.sort()) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...markdownFilesUnder(full));
    } else if (entry.endsWith(".md")) {
      found.push(full);
    }
  }
  return found;
}

/**
 * (a) Every shout of five characters or more is a relation name or it is on the
 * list. This is the check that stops a skill reaching back into the process
 * document's vocabulary.
 */
function checkShouts(file, lines) {
  lines.forEach((text, index) => {
    for (const match of text.matchAll(SCREAMING)) {
      const token = match[0];
      if (ALLOWED_SHOUTS.has(token) || EDGE_TYPES.has(token)) {
        continue;
      }
      if (DENIED_RELATIONS.has(token)) {
        if (DENIAL.test(text) || namesARealEdgeType(text)) {
          continue;
        }
        report(
          file,
          index + 1,
          `${token} is quoted without being denied — it is one of the four names the old process document used and the canon never had, so name the relation that replaced it on the same line, or say outright that it does not exist. A reader who meets it bare will write it.`,
        );
        continue;
      }
      report(
        file,
        index + 1,
        `${token} is not a relation the canon has — the relations are the edge types in core/graph/grammar.ts, and an agent told to write this one will write a file the graph refuses. If it is an ordinary word, add it to ALLOWED_SHOUTS in scripts/lint-plugin.mjs.`,
      );
    }
  });
}

/** (b) A `--type` argument names one of the canon's own types, or a placeholder. */
function checkTypeFlags(file, lines) {
  lines.forEach((text, index) => {
    for (const match of text.matchAll(TYPE_FLAG)) {
      const type = match[1];
      if (CANON_TYPES.has(type) || TYPE_PLACEHOLDERS.has(type)) {
        continue;
      }
      report(
        file,
        index + 1,
        `--type ${type} names no canon node type — the daemon refuses the spelling and the agent gets no starting file.`,
      );
    }
  });
}

/**
 * (c) Every `shall <word>` in a code span or a fenced block is a subcommand the
 * CLI answers to. Only code is scanned: prose says "a Shall project" and "the
 * shall command" in ways no reader mistakes for an instruction, and a linter
 * that argued with English would be turned off within the week.
 */
function checkShallCalls(file, lines) {
  let inFence = false;
  lines.forEach((text, index) => {
    if (FENCE.test(text)) {
      inFence = !inFence;
      return;
    }
    const fragments = inFence
      ? [text]
      : [...text.matchAll(INLINE_CODE)].map((match) => match[1]);
    for (const fragment of fragments) {
      for (const match of fragment.matchAll(SHALL_CALL)) {
        const word = match[1];
        if (SUBCOMMANDS.has(word) || DENIED_SUBCOMMANDS.has(word)) {
          continue;
        }
        report(
          file,
          index + 1,
          `shall ${word} is not a subcommand — the CLI answers to ${[...SUBCOMMANDS].join(", ")} and nothing else.`,
        );
      }
    }
  });
}

/**
 * (d) Every command has to interpolate the request it was given.
 *
 * It is asked of the whole `commands/` folder and not of one file by name. A
 * command is the only document in the plugin the user's own words pass
 * through, and a second command that forgot the slot would fail the same way
 * the first would have: the process runs, interviews nobody about anything the
 * person actually said, and produces a specification for a request it never
 * read.
 */
function checkCommandArguments(file, relative, source) {
  if (!source.includes("$ARGUMENTS")) {
    report(
      file,
      1,
      `${relative} never mentions $ARGUMENTS, so the user's request never reaches the process.`,
    );
  }
}

/**
 * (e) No plugin document carries a type's body vocabulary.
 *
 * The starting file `shall add-spec-node` writes is the single copy of what a
 * type's body suggests — the headings, and beside a few of them the choices
 * that heading takes — and `sectionGuideFor` in core/graph/guide.ts is where
 * that copy is made. A plugin document that repeats it has forked the canon
 * into a file nobody rebuilds: the guide gains a constraint type, the skill
 * still offers twelve, and the agent reading the skill writes a word the canon
 * retired into a node that loads fine and means the wrong thing. The starting
 * file is right there in the agent's hands when it needs the vocabulary; a
 * skill has no reason to anticipate it.
 *
 * Two things are caught. A hint reproduced verbatim is the copy itself. A `·`
 * is the copy's fingerprint, and it is checked separately because a pasted
 * vocabulary drifts word by word — by the time the wording no longer matches
 * the guide, the separator is usually the only evidence left that it was ever
 * the guide's.
 *
 * What is deliberately not caught: `short_name`, `name` and `edges`. Those are
 * the file format, carried by every node file whatever its type, and the
 * authoring skill cannot teach where a relation goes without writing an
 * `edges` block — so they pass here, in every plugin file.
 */
function checkTemplateVocabulary(file, lines) {
  lines.forEach((text, index) => {
    const quoted = [];
    for (const [hint, heading] of TEMPLATE_HINTS) {
      if (!text.includes(hint)) {
        continue;
      }
      if (quoted.some((longer) => longer.includes(hint))) {
        continue;
      }
      quoted.push(hint);
      report(
        file,
        index + 1,
        `"${hint}" is the template hint for ${heading}, copied out of core/graph/guide.ts — the starting file from shall add-spec-node already offers it, and this copy will still say it after the canon has changed its mind. Delete the vocabulary and let the agent read the starting file.`,
      );
    }
    if (quoted.length > 0 || !text.includes(MIDDLE_DOT)) {
      return;
    }
    report(
      file,
      index + 1,
      `a ${MIDDLE_DOT} here — that is the separator a starting file uses to offer the choices a heading takes, so this line is a type's vocabulary pasted into the plugin. The vocabulary belongs to core/graph/guide.ts alone; write the sentence without it.`,
    );
  });
}

// A guide that hands back nothing is a guide that moved, and rule (e) would
// then pass every document in silence. Say so instead.
if (TEMPLATE_HINTS.size === 0) {
  report(
    fileURLToPath(import.meta.url),
    1,
    "sectionGuideFor returned no hints for any of the canon's types, so rule (e) is checking the plugin against an empty vocabulary and would pass a copy of anything. Point it back at the guide before trusting this run.",
  );
}

for (const file of markdownFilesUnder(pluginRoot)) {
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  const relative = path.relative(pluginRoot, file);

  checkShouts(file, lines);
  checkTypeFlags(file, lines);
  checkShallCalls(file, lines);
  checkTemplateVocabulary(file, lines);
  if (path.dirname(relative) === "commands") {
    checkCommandArguments(file, relative.split(path.sep).join("/"), source);
  }
}

if (violations.length > 0) {
  violations.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line,
  );
  for (const violation of violations) {
    console.log(`${violation.file}:${violation.line} — ${violation.sentence}`);
  }
  process.exit(1);
}
