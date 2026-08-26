import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  parseArguments,
  USAGE,
  type Invocation,
  type UsageError,
} from "./args.js";

/**
 * The command line, read — the one part of this client that answers without a
 * daemon, a port or a folder, and therefore the one part a test can hold still.
 *
 * WHAT IS ASSERTED IS THE CONTRACT AN AGENT WRITES AGAINST: which command each
 * line means, that both spellings of an option are the same ask, that `--scope`
 * and `--refs` accumulate rather than overwrite, that `log` reads its kind and
 * its summary by position and nothing else does, and that every refusal ends in
 * a shape a person can read straight back off the help screen.
 */

/** The invocation, with a usage error failing the test instead of the assertion after it. */
function invocation(...argv: string[]): Invocation {
  const parsed = parseArguments(argv);
  assert.ok(
    !("usage" in parsed),
    `shall ${argv.join(" ")} was refused: ${(parsed as UsageError).usage}`,
  );
  return parsed;
}

/** The refusal, with a parsed command failing the test instead. */
function refusalOf(...argv: string[]): string {
  const parsed = parseArguments(argv);
  assert.ok("usage" in parsed, `shall ${argv.join(" ")} was accepted`);
  return parsed.usage;
}

describe("the commands", () => {
  test("no word at all opens the app on loopback", () => {
    assert.deepEqual(invocation(), { command: "open", network: false });
  });

  test("--host opens it to the network, and repeating it is the same ask", () => {
    assert.deepEqual(invocation("--host"), { command: "open", network: true });
    assert.deepEqual(invocation("--host", "--host"), {
      command: "open",
      network: true,
    });
  });

  test("init, check, status and board are themselves", () => {
    assert.deepEqual(invocation("init"), { command: "init", json: false });
    assert.deepEqual(invocation("check"), {
      command: "check",
      json: false,
      scope: [],
    });
    assert.deepEqual(invocation("status"), {
      command: "status",
      json: false,
      scope: [],
    });
    assert.deepEqual(invocation("board"), { command: "board", json: false });
    assert.deepEqual(invocation("report"), { command: "report", json: false });
  });

  test("add-spec-node takes its type in either spelling", () => {
    assert.deepEqual(invocation("add-spec-node", "--type", "Requirement"), {
      command: "add-spec-node",
      json: false,
      type: "Requirement",
    });
    assert.deepEqual(invocation("add-spec-node", "--type=Requirement"), {
      command: "add-spec-node",
      json: false,
      type: "Requirement",
    });
  });

  test("log takes its kind and its summary as the two words after it", () => {
    assert.deepEqual(invocation("log", "work_done", "Wrote the parser"), {
      command: "log",
      json: false,
      kind: "work_done",
      summary: "Wrote the parser",
      refs: [],
    });
    // The words are taken as typed — which kinds the feed has is the daemon's
    // sentence, and a summary is whatever one shell word holds.
    assert.deepEqual(invocation("log", "anything", "a summary, with a comma"), {
      command: "log",
      json: false,
      kind: "anything",
      summary: "a summary, with a comma",
      refs: [],
    });
  });

  test("help is the same command by either name", () => {
    assert.deepEqual(invocation("help"), { command: "help" });
    assert.deepEqual(invocation("--help"), { command: "help" });
  });

  test("--version asks which Shall this is, and takes nothing with it", () => {
    assert.deepEqual(invocation("--version"), { command: "version" });
    // Repeated is the one ask again, the way --host repeated is.
    assert.deepEqual(invocation("--version", "--version"), {
      command: "version",
    });
    assert.equal(
      refusalOf("--version", "--json"),
      "shall --version does not take --json — shall --version",
    );
    // It is a question about this install, not an option on a command.
    assert.match(
      refusalOf("check", "--version"),
      /^shall check does not take --version — /,
    );
  });

  test("upgrade takes nothing at all, --json included", () => {
    assert.deepEqual(invocation("upgrade"), { command: "upgrade" });
    // There is no answer to shape: the whole of it is a sentence saying whether
    // the swap happened.
    assert.equal(
      refusalOf("upgrade", "--json"),
      "shall upgrade does not take --json — shall upgrade",
    );
    assert.equal(
      refusalOf("upgrade", "now"),
      "shall upgrade does not take now — shall upgrade",
    );
  });

  test("a word shall does not have is a command it does not know", () => {
    assert.deepEqual(invocation("approve"), {
      command: "unknown",
      name: "approve",
    });
  });
});

describe("--scope", () => {
  test("takes a path in either spelling", () => {
    assert.deepEqual(invocation("check", "--scope", "intent/Goal"), {
      command: "check",
      json: false,
      scope: ["intent/Goal"],
    });
    assert.deepEqual(invocation("status", "--scope=intent/Goal"), {
      command: "status",
      json: false,
      scope: ["intent/Goal"],
    });
  });

  test("accumulates, because two folders means both of them", () => {
    assert.deepEqual(
      invocation(
        "check",
        "--scope",
        "intent",
        "--scope=plan/Work item",
        "--scope",
        "../ac",
      ),
      {
        command: "check",
        json: false,
        scope: ["intent", "plan/Work item", "../ac"],
      },
    );
  });

  test("the = spelling names a path even when it starts with a dash", () => {
    assert.deepEqual(invocation("check", "--scope=-odd/Goal"), {
      command: "check",
      json: false,
      scope: ["-odd/Goal"],
    });
  });

  test("is not a question the other commands have", () => {
    assert.equal(
      refusalOf("board", "--scope", "intent"),
      "shall board does not take --scope — shall board [--json]",
    );
    assert.equal(
      refusalOf("report", "--scope", "intent"),
      "shall report does not take --scope — shall report [--json]",
    );
    assert.match(
      refusalOf("init", "--scope=intent"),
      /^shall init does not take/,
    );
    assert.match(
      refusalOf("log", "work_done", "done", "--scope", "intent"),
      /^shall log does not take --scope — /,
    );
  });
});

describe("--refs", () => {
  test("takes ids after commas, in either spelling", () => {
    assert.deepEqual(
      invocation("log", "work_done", "done", "--refs", "WL-0001,AC-0002"),
      {
        command: "log",
        json: false,
        kind: "work_done",
        summary: "done",
        refs: ["WL-0001", "AC-0002"],
      },
    );
    assert.deepEqual(
      invocation("log", "work_done", "done", "--refs=WL-0001,AC-0002"),
      {
        command: "log",
        json: false,
        kind: "work_done",
        summary: "done",
        refs: ["WL-0001", "AC-0002"],
      },
    );
    assert.deepEqual(invocation("log", "work_done", "done", "--refs", "WL-0001"), {
      command: "log",
      json: false,
      kind: "work_done",
      summary: "done",
      refs: ["WL-0001"],
    });
  });

  test("accumulates and ignores a blank entry, because two lists means both of them", () => {
    assert.deepEqual(
      invocation(
        "log",
        "work_done",
        "done",
        "--refs",
        "WL-0001,,AC-0002",
        "--refs= R-0003 , ",
        "--refs",
        "D-0004",
      ),
      {
        command: "log",
        json: false,
        kind: "work_done",
        summary: "done",
        refs: ["WL-0001", "AC-0002", "R-0003", "D-0004"],
      },
    );
  });

  test("sits anywhere among the two words of log", () => {
    assert.deepEqual(
      invocation("log", "--refs", "WL-0001", "work_done", "done"),
      {
        command: "log",
        json: false,
        kind: "work_done",
        summary: "done",
        refs: ["WL-0001"],
      },
    );
    assert.deepEqual(
      invocation("log", "work_done", "--refs=WL-0001", "done"),
      {
        command: "log",
        json: false,
        kind: "work_done",
        summary: "done",
        refs: ["WL-0001"],
      },
    );
  });

  test("is not a question the other commands have", () => {
    assert.equal(
      refusalOf("status", "--refs", "WL-0001"),
      "shall status does not take --refs — shall status [--scope <path>]... [--json]",
    );
    assert.match(
      refusalOf("board", "--refs=WL-0001"),
      /^shall board does not take --refs=WL-0001 — /,
    );
    assert.match(
      refusalOf("add-spec-node", "--type", "Goal", "--refs", "WL-0001"),
      /^shall add-spec-node does not take --refs — /,
    );
  });
});

describe("--json", () => {
  test("is taken by every command that answers with something", () => {
    for (const [command, expected] of [
      ["init", { command: "init", json: true }],
      ["check", { command: "check", json: true, scope: [] }],
      ["status", { command: "status", json: true, scope: [] }],
      ["board", { command: "board", json: true }],
      ["report", { command: "report", json: true }],
    ] as const) {
      assert.deepEqual(invocation(command, "--json"), expected);
    }
    assert.deepEqual(invocation("add-spec-node", "--json", "--type=Goal"), {
      command: "add-spec-node",
      json: true,
      type: "Goal",
    });
    assert.deepEqual(invocation("log", "work_done", "done", "--json"), {
      command: "log",
      json: true,
      kind: "work_done",
      summary: "done",
      refs: [],
    });
  });

  test("sits on either side of an option that carries a value", () => {
    assert.deepEqual(invocation("status", "--json", "--scope", "plan"), {
      command: "status",
      json: true,
      scope: ["plan"],
    });
    assert.deepEqual(invocation("status", "--scope", "plan", "--json"), {
      command: "status",
      json: true,
      scope: ["plan"],
    });
  });

  test("sits on either side of the two words of log", () => {
    const logged = {
      command: "log",
      json: true,
      kind: "work_done",
      summary: "done",
      refs: ["WL-0001"],
    };
    assert.deepEqual(
      invocation("log", "--json", "work_done", "done", "--refs", "WL-0001"),
      logged,
    );
    assert.deepEqual(
      invocation("log", "work_done", "done", "--refs", "WL-0001", "--json"),
      logged,
    );
    // Between them too: a flag is a flag wherever it falls, and the two words
    // are the two that carry no dash.
    assert.deepEqual(
      invocation("log", "work_done", "--json", "done", "--refs=WL-0001"),
      logged,
    );
  });

  test("twice is the same ask, the way --host twice is", () => {
    assert.deepEqual(invocation("check", "--json", "--json"), {
      command: "check",
      json: true,
      scope: [],
    });
  });

  test("is not an option of the app itself", () => {
    assert.equal(
      refusalOf("--host", "--json"),
      "shall does not take --json — shall [--host]",
    );
  });
});

describe("what a person is told when the words are wrong", () => {
  test("an option given without the thing it carries", () => {
    assert.equal(
      refusalOf("check", "--scope"),
      "shall check needs a path after --scope — shall check [--scope <path>]... [--json]",
    );
    assert.equal(
      refusalOf("status", "--scope="),
      "shall status needs a path after --scope — shall status [--scope <path>]... [--json]",
    );
    assert.equal(
      refusalOf("add-spec-node", "--type"),
      "shall add-spec-node needs a type after --type — shall add-spec-node --type <Type> [--json]",
    );
  });

  test("an option after one that carries a value is not its value", () => {
    // The person asked for JSON. A parser that took the flag as the path would
    // narrow the run to a folder nobody named and then answer in prose, so
    // every option that carries something refuses a word beginning with `-`
    // and says which option was left empty.
    assert.equal(
      refusalOf("check", "--scope", "--json"),
      "shall check needs a path after --scope — shall check [--scope <path>]... [--json]",
    );
    assert.equal(
      refusalOf("status", "--scope", "--json"),
      "shall status needs a path after --scope — shall status [--scope <path>]... [--json]",
    );
    assert.equal(
      refusalOf("add-spec-node", "--type", "--json"),
      "shall add-spec-node needs a type after --type — shall add-spec-node --type <Type> [--json]",
    );
    // The option repeated is that same miss, and the complaint is about the
    // option left empty rather than about the word that followed it.
    assert.match(
      refusalOf("check", "--scope", "--scope", "intent"),
      /^shall check needs a path after --scope — /,
    );
  });

  test("add-spec-node without a type at all", () => {
    assert.equal(
      refusalOf("add-spec-node"),
      "shall add-spec-node needs a type — shall add-spec-node --type <Type> [--json]",
    );
    assert.equal(
      refusalOf("add-spec-node", "--json"),
      "shall add-spec-node needs a type — shall add-spec-node --type <Type> [--json]",
    );
  });

  test("log without a kind, without a summary, or with a third word", () => {
    assert.equal(
      refusalOf("log"),
      "shall log needs a kind — shall log <kind> <summary> [--refs <id,id>] [--json]",
    );
    assert.equal(
      refusalOf("log", "--json"),
      "shall log needs a kind — shall log <kind> <summary> [--refs <id,id>] [--json]",
    );
    assert.equal(
      refusalOf("log", "work_done"),
      "shall log needs a summary after the kind — shall log <kind> <summary> [--refs <id,id>] [--json]",
    );
    assert.equal(
      refusalOf("log", "work_done", "--refs", "WL-0001", "--json"),
      "shall log needs a summary after the kind — shall log <kind> <summary> [--refs <id,id>] [--json]",
    );
    // A summary left unquoted arrives as several words, and the third of them
    // is refused rather than stitched back on: the summary that reaches the
    // feed is the one that was typed, or none.
    assert.equal(
      refusalOf("log", "work_done", "wrote", "the", "parser"),
      "shall log takes a kind and one summary, quoted as one word — shall log <kind> <summary> [--refs <id,id>] [--json]",
    );
    // A word with a dash is never a positional, even for the one command that
    // takes positionals: it is an option log does not have.
    assert.equal(
      refusalOf("log", "work_done", "done", "-x"),
      "shall log does not take -x — shall log <kind> <summary> [--refs <id,id>] [--json]",
    );
  });

  test("--refs without ids", () => {
    for (const argv of [
      ["log", "work_done", "done", "--refs"],
      ["log", "work_done", "done", "--refs="],
      ["log", "work_done", "done", "--refs", ","],
      ["log", "work_done", "done", "--refs=, ,"],
      ["log", "work_done", "done", "--refs", "--json"],
    ]) {
      assert.equal(
        refusalOf(...argv),
        "shall log needs ids after --refs — shall log <kind> <summary> [--refs <id,id>] [--json]",
        `shall ${argv.join(" ")}`,
      );
    }
  });

  test("an option that belongs to another command", () => {
    assert.equal(
      refusalOf("status", "--type", "Requirement"),
      "shall status does not take --type — shall status [--scope <path>]... [--json]",
    );
    assert.equal(
      refusalOf("check", "--host"),
      "shall check does not take --host — shall check [--scope <path>]... [--json]",
    );
  });

  test("an option nothing has, and a word that is no option at all", () => {
    assert.match(
      refusalOf("board", "--verbose"),
      /^shall board does not take --verbose — /,
    );
    assert.match(
      refusalOf("init", "somewhere"),
      /^shall init does not take somewhere — /,
    );
    assert.match(
      refusalOf("help", "--json"),
      /^shall help does not take --json — /,
    );
  });

  test("every refusal ends in a line the help screen already shows", () => {
    const refusals = [
      refusalOf("check", "--scope"),
      refusalOf("check", "--host"),
      refusalOf("check", "elsewhere"),
      refusalOf("status", "--type"),
      refusalOf("board", "--scope", "intent"),
      refusalOf("init", "--json=yes"),
      refusalOf("add-spec-node"),
      refusalOf("--host", "--json"),
      refusalOf("log"),
      refusalOf("log", "work_done"),
      refusalOf("log", "a", "b", "c"),
      refusalOf("log", "a", "b", "--refs"),
      refusalOf("status", "--refs", "WL-0001"),
      refusalOf("--version", "board"),
    ];
    for (const refusal of refusals) {
      const shape = refusal.split(" — ").at(-1) ?? "";
      assert.ok(
        USAGE.includes(shape),
        `${shape} is not a shape the help screen shows`,
      );
    }
    // The two refusals of one command show one shape, whatever was wrong.
    assert.equal(
      refusalOf("check", "--scope").split(" — ").at(-1),
      refusalOf("check", "--host").split(" — ").at(-1),
    );
  });
});

describe("the help screen", () => {
  test("names every command exactly once", () => {
    for (const shape of [
      "shall [--host]",
      "shall init [--json]",
      "shall check [--scope <path>]... [--json]",
      "shall status [--scope <path>]... [--json]",
      "shall board [--json]",
      "shall report [--json]",
      "shall add-spec-node --type <Type> [--json]",
      "shall log <kind> <summary> [--refs <id,id>] [--json]",
      "shall upgrade",
      "shall --version",
      "shall help",
    ]) {
      assert.ok(
        USAGE.includes(shape),
        `${shape} is missing from the help screen`,
      );
    }
  });

  test("says what the options listed under the commands do", () => {
    assert.match(USAGE, /--scope may be given more than once/);
    assert.match(USAGE, /--json writes the answer as one JSON object/);
    assert.match(USAGE, /--refs names the nodes a log line is about/);
  });
});
