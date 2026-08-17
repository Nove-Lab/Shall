/**
 * The words a person typed, read into what they asked for — and nothing else.
 *
 * IT IMPORTS NOTHING, AND THAT IS THE WHOLE DESIGN. Reading arguments is the one
 * part of this client that can be tested with no daemon on the machine, no port
 * to talk to and no folder to stand in, and it stays that way only while this
 * file borrows nothing from `main.ts` or `client.ts` — either of which would drag
 * the router's types, and so the daemon's build, into a test run that has
 * neither.
 *
 * THE PARSER IS HAND-WRITTEN AND STAYS HAND-WRITTEN. The whole surface is eight
 * shapes and three options; a library would be a dependency to keep current, a
 * second vocabulary for what a flag is, and a help screen somebody else wrote.
 */

/** One command: how it is typed, and the line a help screen says about it. */
interface CommandShape {
  shape: string;
  says: string;
}

/**
 * EVERY COMMAND THERE IS, in the order a person meets them — the app first, the
 * project next, then the three readings, then the one thing this client writes.
 *
 * IT IS THE ONE HOME OF THE SHAPES. The help screen below is built from this
 * table and so is the line a usage error ends with, which is why the shape a
 * person is shown after a typo is letter for letter the shape they would have
 * read in `shall help`.
 */
const SHAPES = {
  // The bare command — no word at all, which is how a person opens the app.
  "": { shape: "shall", says: "Open the app in a browser." },
  "--host": {
    shape: "shall --host",
    says: "Open it and let other machines on this network reach it.",
  },
  init: {
    shape: "shall init [--json]",
    says: "Make this folder a Shall project.",
  },
  check: {
    shape: "shall check [--scope <path>]... [--json]",
    says: "Read the spec files and say what is wrong with them.",
  },
  status: {
    shape: "shall status [--scope <path>]... [--json]",
    says: "Every node with its colour, and what is missing or will not read.",
  },
  board: {
    shape: "shall board [--json]",
    says: "What the spec needs fixed, and what is ready to be implemented.",
  },
  "add-spec-node": {
    shape: "shall add-spec-node --type <Type> [--json]",
    says: "Start a new node file of that type.",
  },
  help: { shape: "shall help", says: "This screen." },
} as const satisfies Record<string, CommandShape>;

/** The word a person types as the command, `--host` and the bare line included. */
type CommandKey = keyof typeof SHAPES;

/** The widest shape, so the second column of the help screen starts in one place. */
const COLUMN = Math.max(
  ...Object.values(SHAPES).map((entry) => entry.shape.length),
);

/**
 * The help screen: one line per command, and the two options that cross them.
 *
 * It is what `shall help` prints and what an unknown command is answered with,
 * so a person who cannot remember a name and a person who guessed one wrong are
 * reading the same page.
 */
export const USAGE = [
  "shall — the specification a team works from, read where the work is.",
  "",
  ...Object.values(SHAPES).map(
    (entry) => `  ${entry.shape.padEnd(COLUMN)}  ${entry.says}`,
  ),
  "",
  "--scope may be given more than once, and each one names a file or a folder of .shall/spec.",
  "--json writes the answer as one JSON object on stdout and nothing else.",
].join("\n");

/**
 * A command line this client cannot act on, and the one line that shows the
 * shape it should have had.
 *
 * IT IS NOT AN ERROR THE COMMANDS THROW. Nothing has been started, no daemon has
 * been spoken to and no folder has been read: the words alone were wrong, which
 * is a different thing from a refusal the daemon wrote, and `main.ts` prints the
 * two on different channels for that reason.
 */
export interface UsageError {
  usage: string;
}

/** What the argument list asked for. */
export type Invocation =
  | { command: "open"; network: boolean }
  | { command: "help" }
  | { command: "unknown"; name: string }
  | { command: "init"; json: boolean }
  | { command: "check"; json: boolean; scope: string[] }
  | { command: "status"; json: boolean; scope: string[] }
  | { command: "board"; json: boolean }
  | { command: "add-spec-node"; json: boolean; type: string };

/**
 * The commands that answer with something — which is exactly the set `--json` is
 * about, so the flag is the test rather than a second list to keep in step.
 */
export type Answering = Extract<Invocation, { json: boolean }>;

/** How a message names the command it is about: `shall`, or `shall check`. */
function nameOf(command: CommandKey): string {
  return command === "" ? "shall" : `shall ${command}`;
}

/** The complaint, and then the shape — quoted from the table, never retyped. */
function wrong(command: CommandKey, clause: string): UsageError {
  return { usage: `${clause} — ${SHAPES[command].shape}` };
}

/** A word this command has no use for, whether it is an option or not. */
function unexpected(command: CommandKey, word: string): UsageError {
  return wrong(command, `${nameOf(command)} does not take ${word}`);
}

/** An option that was given without the thing it exists to carry. */
function needs(command: CommandKey, what: string): UsageError {
  return wrong(command, `${nameOf(command)} needs ${what}`);
}

/** Whether this word is that option, in either of the two spellings. */
function isOption(option: string, word: string): boolean {
  return word === option || word.startsWith(`${option}=`);
}

/**
 * `--type Requirement` and `--type=Requirement` are the same ask, so both are
 * read here — and a value nobody supplied and an empty one are the same miss,
 * because neither names anything.
 *
 * A WORD BEGINNING WITH `-` IS THAT SAME MISS AGAIN: AN OPTION IS NEVER A PATH
 * AND NEVER A TYPE. `shall check --scope --json` is a person asking for JSON,
 * and a parser that swallowed the flag would hand the daemon a nonsense scope
 * and answer in prose — a command doing something other than what was typed,
 * without ever saying so. Refused here, the answer is the usage error naming
 * the option that was left empty. The `=` spelling is how to mean it anyway,
 * for the rare path that really does start with a dash.
 */
function valueOf(
  option: string,
  word: string,
  words: string[],
): string | undefined {
  if (word !== option) {
    const attached = word.slice(`${option}=`.length);
    return attached === "" ? undefined : attached;
  }
  // Peeked before it is taken: a word that is not this option's value was never
  // this option's to eat.
  const next = words[0];
  if (next === undefined || next === "" || next.startsWith("-")) {
    return undefined;
  }
  words.shift();
  return next;
}

/** Everything an option can carry; which of them a command actually has is `takes`. */
interface Options {
  json: boolean;
  scope: string[];
  type: string | null;
}

/**
 * THE OPTIONS OF ONE COMMAND, read in one loop.
 *
 * A COMMAND IS OFFERED ONLY WHAT IT TAKES. `--scope` on `shall board` is not
 * quietly ignored and not silently obeyed: the board is an ordering of the whole
 * project, so asking it about one folder is a question it does not have, and the
 * answer says so with the shape that would have worked.
 *
 * `--scope` ACCUMULATES. A person narrowing to two folders means both of them,
 * and a last-one-wins rule would answer about one folder in a spelling that
 * names two.
 */
function optionsOf(
  command: CommandKey,
  rest: readonly string[],
  takes: { scope: boolean; type: boolean },
): Options | UsageError {
  let json = false;
  const scope: string[] = [];
  let type: string | null = null;
  // Shifted rather than indexed, because an option that carries a value eats the
  // word after it and a `for` over the array would have to be told it did.
  const words = [...rest];
  for (let word = words.shift(); word !== undefined; word = words.shift()) {
    if (word === "--json") {
      json = true;
      continue;
    }
    if (takes.scope && isOption("--scope", word)) {
      const value = valueOf("--scope", word, words);
      if (value === undefined) {
        return needs(command, "a path after --scope");
      }
      scope.push(value);
      continue;
    }
    if (takes.type && isOption("--type", word)) {
      const value = valueOf("--type", word, words);
      if (value === undefined) {
        return needs(command, "a type after --type");
      }
      type = value;
      continue;
    }
    return unexpected(command, word);
  }
  return { json, scope, type };
}

/**
 * The command line, read.
 *
 * `argv` is `process.argv.slice(2)` — this client's own words, with the runtime
 * and the script name already gone.
 *
 * A WORD IT DOES NOT KNOW IS A COMMAND AND NOT A USAGE ERROR. The two are
 * answered differently on purpose: a mistyped option has a shape to be shown,
 * and a mistyped command has none, so the caller prints the whole help screen
 * for it instead.
 */
export function parseArguments(
  argv: readonly string[],
): Invocation | UsageError {
  const [word, ...rest] = argv;

  // No word at all is the app, and `--host` is the same command with the door
  // open to the network: it says WHO MAY REACH the daemon and never what to do,
  // which is why it is the one option no other command here takes.
  if (word === undefined) {
    return { command: "open", network: false };
  }
  if (word === "--host") {
    const stray = rest.find((argument) => argument !== "--host");
    return stray === undefined
      ? { command: "open", network: true }
      : unexpected("--host", stray);
  }

  if (word === "help" || word === "--help") {
    const stray = rest[0];
    if (stray !== undefined) {
      return unexpected("help", stray);
    }
    return { command: "help" };
  }

  if (word === "init") {
    const read = optionsOf("init", rest, { scope: false, type: false });
    return "usage" in read ? read : { command: "init", json: read.json };
  }

  if (word === "board") {
    const read = optionsOf("board", rest, { scope: false, type: false });
    return "usage" in read ? read : { command: "board", json: read.json };
  }

  if (word === "check" || word === "status") {
    const read = optionsOf(word, rest, { scope: true, type: false });
    if ("usage" in read) {
      return read;
    }
    return word === "check"
      ? { command: "check", json: read.json, scope: read.scope }
      : { command: "status", json: read.json, scope: read.scope };
  }

  if (word === "add-spec-node") {
    const read = optionsOf("add-spec-node", rest, { scope: false, type: true });
    if ("usage" in read) {
      return read;
    }
    // The type is the whole of this command: there is no default node type and
    // there could not be one, because the twenty-two types are what the canon is.
    if (read.type === null) {
      return needs("add-spec-node", "a type");
    }
    return { command: "add-spec-node", json: read.json, type: read.type };
  }

  return { command: "unknown", name: word };
}
