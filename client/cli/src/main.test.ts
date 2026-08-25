import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { closeSync, openSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { SHALL_VERSION } from "@shall/core/version";

/**
 * The client as a person runs it: its own process, a `~` of its own, and a
 * stand-in on the port where a daemon would be.
 *
 * IT IS RUN AND NOT IMPORTED, because `main.ts` is a script — reading `argv`,
 * printing and setting an exit code are the top level of the file, and there is
 * nothing to call. What that buys is that every claim here is about the thing
 * that ships: the words on stdout, the words on stderr, and the code the shell
 * sees.
 *
 * NOTHING REACHES A REAL DAEMON, A REAL `~` OR A REAL BROWSER. `$HOME` moves
 * `~/.shall` into a temp folder for the run, the stand-in below answers the two
 * doors this client knocks on, and a stub `open` earlier on `PATH` catches the
 * one command that would otherwise put a window on somebody's screen.
 *
 * WHAT IS NOT COVERED, AND WHY — three things, all of them the machine's rather
 * than this client's. SPAWNING THE DAEMON, and the wait for it to answer: it
 * starts a detached process that binds a port and outlives the test. Every
 * branch that decides WHETHER to spawn is exercised all the same — the pid that
 * is gone, the port that moved, the bind that is not the one asked for, the
 * daemon too old to keep — because those are the judgements and the spawn is
 * only the consequence. THE OTHER PLATFORMS' BROWSERS: `cmd.exe` and
 * `xdg-open` are chosen by `process.platform`, which is the one thing a run on
 * this machine cannot be talked out of. A REFUSAL THAT IS NOT AN `Error`: every
 * throw this client can meet is one, and the other half of that ternary is
 * there so a future one cannot arrive as `[object Object]`.
 *
 * `shall upgrade` IS HERE ONLY AS THE FORK. A run under this suite is a checkout
 * and so meets the refusal, which is the branch that lives in this file; the
 * download, the checksum and the swap are `upgrade.test.ts`'s, where the file
 * being replaced belongs to the test rather than being the runtime it runs on.
 */

const asked = promisify(execFile);

/** The script under test, run through the same loader its own suite uses. */
const MAIN = fileURLToPath(new URL("./main.ts", import.meta.url));

/**
 * The loader, by address rather than by name: every run below stands in a folder
 * of its own, where the name `tsx` resolves to nothing.
 */
const LOADER = import.meta.resolve("tsx");

/**
 * THE PROCEDURES THIS CLI CALLS, spelled a second time on purpose. `main.ts`
 * compares its own manifest against what a daemon says it serves, and a test
 * that imported that list could not tell the day a new call site was added and
 * the manifest was not.
 */
const SERVED = [
  "projects.create",
  "spec.board",
  "spec.check",
  "spec.log",
  "spec.scaffold",
  "spec.status",
];

/** Loopback, the default bind — what `/health` says for a daemon nobody hosted. */
const LOOPBACK = "127.0.0.1";

/** What `--host` asks for, and what `/health` says once it was given. */
const EVERY_INTERFACE = "0.0.0.0";

/**
 * One answer from `/health`. The three words are the ways an answer can be no
 * answer at all: a status that is not ok, a body with no bind in it, and a body
 * that is not JSON — each of which `main.ts` reads as silence.
 */
type Health =
  | { host: string; version?: string; procedures?: readonly unknown[] }
  | "unreadable"
  | "hostless"
  | "gibberish";

/**
 * A daemon of this build, listening where the app is this machine's.
 *
 * THE VERSION IS IMPORTED WHERE THE PROCEDURES ARE TYPED OUT, and the two are
 * different claims. The manifest is spelled a second time so a new call site
 * that nobody added to it fails here; the semver is the ONE number, so a test
 * carrying its own copy would only ever say that somebody bumped one of them
 * and not the other — which is the release, not a bug.
 */
const READY: Health = {
  host: LOOPBACK,
  version: SHALL_VERSION,
  procedures: SERVED,
};

/**
 * A daemon of this version missing one procedure this client calls — a build
 * from a working tree where the semver never moved, which is why the manifest
 * still has to be asked after the number matches.
 */
const OLD: Health = {
  host: LOOPBACK,
  version: SHALL_VERSION,
  procedures: SERVED.filter((name) => name !== "spec.log"),
};

/** A daemon of some other release: behind this CLI, and ahead of it. */
const BEHIND: Health = { host: LOOPBACK, version: "0.0.1", procedures: SERVED };
const AHEAD: Health = { host: LOOPBACK, version: "99.0.0", procedures: SERVED };

/**
 * A daemon from before the marker existed, which can say neither its version
 * nor what it serves.
 */
const SILENT: Health = { host: LOOPBACK };

/**
 * How long the stand-in terminal holds the pipe open after typing. A stdin that
 * reaches EOF while `readline` is waiting aborts the question instead of
 * answering it, so the answer is typed and then the pipe is kept alive for
 * longer than a run takes.
 */
const PATIENCE = 3;

/**
 * The one path the release lookup asks for. The stand-in answers it too, so a
 * run of the CLI can be told there is a newer Shall without any part of this
 * suite reaching GitHub — every run below is pointed at the stand-in, and a run
 * that named no release gets a 404, which is silence.
 */
const RELEASES = "/repos/Nove-Lab/Shall/releases/latest";

/** What one run of the CLI was asked to stand on, and answer with. */
interface Setup {
  /** One answer per knock on `/health`; the last one repeats. */
  health?: readonly Health[];
  /** The tag the release lookup answers with; none means nothing is published. */
  release?: string;
  /** What each procedure answers. */
  answers?: Readonly<Record<string, unknown>>;
  /** The sentence a procedure refuses with, instead of answering. */
  refusals?: Readonly<Record<string, string>>;
  /** The `daemon.json` on record, and whether it names the port the config does. */
  state?: { pid: number; at: "the port" | "another port" };
  /** Where the CLI stands; a fresh folder in no repository by default. */
  cwd?: string;
  /** What the machine's browser opener does: 0 opens, 1 will not. */
  browser?: number;
  /** The answer typed at `init`'s one question — given, the run gets a terminal. */
  typed?: string;
}

/** One run of the CLI, and everything it said, asked and left behind. */
interface Ran {
  code: number | null;
  out: string;
  err: string;
  /** Every procedure called, with the input that arrived. */
  calls: readonly { procedure: string; input: unknown }[];
  /** How many times `/health` was knocked on. */
  knocks: number;
  /** The daemon's address, as this client spells it. */
  url: string;
  /** Whether `~/.shall/daemon.json` is still on record afterwards. */
  onRecord: boolean;
  /** The urls handed to the machine's browser opener. */
  browsed: readonly string[];
  /** Where the CLI stood. */
  cwd: string;
}

/** The lines of an answer, with the trailing newline dropped. */
function lines(said: string): string[] {
  return said === "" ? [] : said.replace(/\n$/, "").split("\n");
}

async function present(file: string): Promise<boolean> {
  return readFile(file).then(
    () => true,
    () => false,
  );
}

async function folder(name: string): Promise<string> {
  return mkdtemp(path.join(await realpath(os.tmpdir()), `shall-cli-${name}-`));
}

/**
 * A daemon that is only what this client asks of it: `/health`, and the tRPC
 * door. It answers whatever the test told it to and remembers what it was
 * asked, which is how the input a command sends is pinned without a spec folder
 * on disk anywhere.
 */
function standIn(setup: Setup): {
  listen(): Promise<number>;
  close(): Promise<void>;
  calls: { procedure: string; input: unknown }[];
  knocks(): number;
} {
  const health = setup.health ?? [READY];
  const answers = setup.answers ?? {};
  const refusals = setup.refusals ?? {};
  const calls: { procedure: string; input: unknown }[] = [];
  let knocked = 0;

  const server = createServer((request, response) => {
    const at = new URL(request.url ?? "/", "http://localhost");
    if (at.pathname === RELEASES) {
      if (setup.release === undefined) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ tag_name: setup.release, assets: [] }));
      return;
    }
    if (at.pathname === "/health") {
      const says = health[Math.min(knocked, health.length - 1)] ?? READY;
      knocked += 1;
      if (says === "unreadable") {
        response.writeHead(503).end();
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        says === "gibberish"
          ? "{"
          : JSON.stringify(says === "hostless" ? {} : says),
      );
      return;
    }
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const procedure = at.pathname.slice("/trpc/".length);
      // A query carries its input in the query string and a mutation in the
      // body; both arrive as one batch keyed by position.
      const sent =
        request.method === "GET"
          ? at.searchParams.get("input")
          : Buffer.concat(chunks).toString("utf8");
      const batch = JSON.parse(
        sent === null || sent === "" ? "{}" : sent,
      ) as Record<string, unknown>;
      calls.push({ procedure, input: batch["0"] });

      const refused = refusals[procedure];
      response.writeHead(refused === undefined ? 200 : 400, {
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify([
          refused === undefined
            ? { result: { data: answers[procedure] ?? null } }
            : {
                error: {
                  message: refused,
                  code: -32600,
                  data: {
                    code: "BAD_REQUEST",
                    httpStatus: 400,
                    path: procedure,
                  },
                },
              },
        ]),
      );
    });
  });

  return {
    async listen(): Promise<number> {
      await new Promise<void>((resolve) =>
        server.listen(0, LOOPBACK, resolve),
      );
      return (server.address() as AddressInfo).port;
    },
    async close(): Promise<void> {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
    calls,
    knocks: () => knocked,
  };
}

/** The CLI as a shell runs it, with nothing on any of its three channels. */
function asItself(
  argv: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", LOADER, MAIN, ...argv], {
      cwd,
      env,
    });
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      err += chunk;
    });
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

/**
 * The same run under a terminal, which is the only way to reach the one question
 * `init` asks: it steps aside the moment stdin or stdout is not a TTY, and node
 * cannot make a pty of its own — `script` can. Both channels come back as one
 * transcript, because a pty is one channel.
 */
function atATerminal(
  argv: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  typed: string,
  home: string,
): Promise<{ code: number | null; out: string; err: string }> {
  const transcript = path.join(home, "terminal.log");
  const written = openSync(transcript, "w");
  return new Promise((resolve) => {
    const child = spawn(
      "/bin/sh",
      [
        "-c",
        `{ printf '%s\\n' "$SHALL_TYPED"; sleep ${PATIENCE}; } | script -q /dev/null "$0" --import "$SHALL_LOADER" "$@"`,
        process.execPath,
        MAIN,
        ...argv,
      ],
      {
        cwd,
        env: { ...env, SHALL_TYPED: typed, SHALL_LOADER: LOADER },
        stdio: ["ignore", written, written],
      },
    );
    child.on("close", (code) => {
      closeSync(written);
      const said = readFileSync(transcript, "utf8")
        .replace(/\r/g, "")
        // What readline drew to move the cursor about, which is not what it said.
        .replace(/\[[0-9;]*[A-Za-z]/g, "");
      resolve({ code, out: said, err: said });
    });
  });
}

/**
 * One run of the CLI, with a `~`, a folder, a stand-in daemon and a stub browser
 * built for it and thrown away after. The port is whatever the stand-in was
 * given, and the config the client reads names that one — which is how a state
 * file can name the same port or a different one without either being real.
 */
async function running(
  argv: readonly string[],
  setup: Setup = {},
): Promise<Ran> {
  const daemon = standIn(setup);
  const port = await daemon.listen();

  const home = await folder("home");
  await mkdir(path.join(home, ".shall"));
  const record = path.join(home, ".shall", "daemon.json");
  await writeFile(
    path.join(home, ".shall", "config.json"),
    `${JSON.stringify({ port })}\n`,
  );
  if (setup.state !== undefined) {
    await writeFile(
      record,
      `${JSON.stringify({
        pid: setup.state.pid,
        port: setup.state.at === "the port" ? port : port + 1,
      })}\n`,
    );
  }

  // The machine's browser opener, caught before it can put a window on a
  // screen: it writes down what it was handed and then does what it was told.
  const bin = path.join(home, "bin");
  await mkdir(bin);
  const browsed = path.join(home, "browsed");
  await writeFile(
    path.join(bin, "open"),
    `#!/bin/sh\nprintf '%s\\n' "$1" >> '${browsed}'\nexit ${setup.browser ?? 0}\n`,
    { mode: 0o755 },
  );

  const cwd = setup.cwd ?? (await folder("work"));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    // Every run, whether it cares about releases or not: a suite that left this
    // unset would ask GitHub what the newest Shall is on every bare `shall` and
    // every `init` it runs.
    SHALL_RELEASES_API: `http://localhost:${port}`,
  };

  const said =
    setup.typed === undefined
      ? await asItself(argv, cwd, env)
      : await atATerminal(argv, cwd, env, setup.typed, home);
  await daemon.close();

  return {
    ...said,
    calls: daemon.calls,
    knocks: daemon.knocks(),
    url: `http://localhost:${port}`,
    onRecord: await present(record),
    browsed: lines(await readFile(browsed, "utf8").catch(() => "")),
    cwd,
  };
}

/**
 * A process the CLI is entitled to stop, because a state file names it. A deaf
 * one refuses SIGTERM, which is the only way to see what this client says when
 * a daemon will not go.
 */
const doomed: number[] = [];
function sacrifice(deaf = false): number {
  const child = spawn(
    process.execPath,
    [
      "-e",
      `${deaf ? "process.on('SIGTERM', () => {});" : ""}setInterval(() => {}, 1000);`,
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  assert.ok(child.pid !== undefined, "no sacrificial process started");
  doomed.push(child.pid);
  return child.pid;
}

/** A pid nothing answers to: a process that ran and was reaped. */
async function departed(): Promise<number> {
  const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  assert.ok(child.pid !== undefined, "no process started");
  await new Promise((resolve) => child.on("exit", resolve));
  return child.pid;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

after(() => {
  for (const pid of doomed) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already stopped, which is what most of these tests are about.
    }
  }
});

/** Whether there is a git to ask; two claims here are claims about what git says. */
const NO_GIT = await asked("git", ["--version"]).then(
  () => false,
  () => true,
);

/** Whether a pty can be had, which is what the one interactive question needs. */
const NO_TERMINAL = process.platform !== "darwin";

describe("finding the daemon to talk to", () => {
  test("a daemon of this build on record is adopted as it stands", async () => {
    const pid = sacrifice();
    const ran = await running(["board", "--json"], {
      state: { pid, at: "the port" },
      health: [READY, READY],
      answers: { "spec.board": { fixSpec: [], implement: [] } },
    });

    assert.equal(ran.code, 0);
    assert.equal(ran.err, "");
    // Adopted means left alone: the record stands and so does the process.
    assert.ok(ran.onRecord, "the state file was thrown away");
    assert.ok(alive(pid), "a daemon of this build was stopped");
    // The knock the state file makes unnecessary is not made.
    assert.equal(ran.knocks, 2);
  });

  test("a state file naming a process that is gone is forgotten", async () => {
    const ran = await running(["board", "--json"], {
      state: { pid: await departed(), at: "the port" },
      answers: { "spec.board": { fixSpec: [], implement: [] } },
    });

    assert.equal(ran.code, 0);
    assert.equal(ran.err, "");
    assert.equal(ran.onRecord, false);
    // With nothing on record the port is asked before anything is spawned, and
    // a daemon answering right is adopted.
    assert.equal(ran.knocks, 1);
  });

  test("a daemon on record at another port is stopped before the port is knocked on", async () => {
    const pid = sacrifice();
    const ran = await running(["board", "--json"], {
      state: { pid, at: "another port" },
      answers: { "spec.board": { fixSpec: [], implement: [] } },
    });

    assert.equal(ran.code, 0);
    assert.equal(ran.onRecord, false);
    assert.equal(
      alive(pid),
      false,
      "the daemon at the old port was left running",
    );
  });

  for (const [what, health] of [
    [
      "listening on another bind",
      { host: EVERY_INTERFACE, version: SHALL_VERSION, procedures: SERVED },
    ],
    ["answering with an error", "unreadable"],
    ["answering without a bind", "hostless"],
  ] as const) {
    test(`a daemon on record ${what} is stopped, and the port knocked on afresh`, async () => {
      const pid = sacrifice();
      const ran = await running(["board", "--json"], {
        state: { pid, at: "the port" },
        health: [health, READY],
        answers: { "spec.board": { fixSpec: [], implement: [] } },
      });

      assert.equal(ran.code, 0);
      assert.equal(ran.onRecord, false);
      assert.equal(
        alive(pid),
        false,
        "the daemon that was not the one asked for was left running",
      );
      assert.equal(ran.knocks, 2);
    });
  }

  test("a health nobody could read leaves the daemon on record alone", async () => {
    const pid = sacrifice();
    const ran = await running(["board", "--json"], {
      state: { pid, at: "the port" },
      // The bind answers, and then the marker's own probe does not: a flaky
      // moment is not a version, and nothing is restarted over one.
      health: [READY, "gibberish"],
      answers: { "spec.board": { fixSpec: [], implement: [] } },
    });

    assert.equal(ran.code, 0);
    assert.equal(ran.err, "");
    assert.ok(ran.onRecord, "a daemon was forgotten over a probe that failed");
    assert.ok(alive(pid), "a daemon was stopped over a probe that failed");
  });

  /**
   * The four ways a daemon can be some Shall other than this one. Shall has ONE
   * semver, so a number that is behind and a number that is ahead are the same
   * answer: skew is the state where the templates, the schema and the calls
   * stop agreeing with nobody being told. A daemon too old to say a number is
   * that same answer once more, and a matching number with a missing procedure
   * is why the manifest is still asked afterwards.
   */
  const NOT_THIS_SHALL = [
    ["running an older release", BEHIND],
    ["running a newer release", AHEAD],
    ["too old to say which Shall it is", SILENT],
    ["missing a procedure this client calls", OLD],
  ] as const;

  for (const [what, health] of NOT_THIS_SHALL) {
    test(`a daemon on record ${what} is restarted`, async () => {
      const pid = sacrifice();
      const ran = await running(["board", "--json"], {
        state: { pid, at: "the port" },
        // The bind is right, the build is not, and the one that takes the port
        // afterwards is of this build.
        health: [READY, health, READY],
        answers: { "spec.board": { fixSpec: [], implement: [] } },
      });

      assert.equal(ran.code, 0);
      assert.equal(
        ran.err,
        "Restarting the Shall daemon: the one running is a different Shall from this CLI.\n",
      );
      assert.equal(ran.onRecord, false);
      assert.equal(alive(pid), false, "the other Shall was left running");
    });
  }

  for (const [what, health] of [
    ...NOT_THIS_SHALL,
    [
      "answering with a list that is not names",
      { host: LOOPBACK, version: SHALL_VERSION, procedures: ["spec.check", 7] },
    ],
  ] as const) {
    test(`another Shall no state file names is adopted, ${what}, with a word about stopping it`, async () => {
      const ran = await running(["board", "--json"], {
        health: [health],
        answers: { "spec.board": { fixSpec: [], implement: [] } },
      });

      // The knock cannot restart what it finds: no record names a pid this
      // process may kill, so the sentence is the whole of the answer.
      assert.equal(ran.code, 0);
      assert.equal(
        ran.err,
        `The Shall daemon at ${ran.url} is a different Shall from this CLI and no state file names its process — stop it yourself and run shall again.\n`,
      );
      assert.equal(ran.calls.length, 1);
    });
  }

  test("a daemon that will not stop is said so, and nothing else is tried", async () => {
    const pid = sacrifice(true);
    const ran = await running(["board"], {
      state: { pid, at: "another port" },
    });

    assert.equal(ran.code, 1);
    // The sentence, and no stack trace of this client's own plumbing over it.
    assert.equal(ran.err, `Could not stop Shall daemon process ${pid}\n`);
    assert.equal(
      ran.calls.length,
      0,
      "a command was sent to a daemon that would not go",
    );
  });
});

describe("opening the app", () => {
  test("the bare command hands the daemon's url to the browser", async () => {
    const ran = await running([]);

    assert.equal(ran.code, 0);
    assert.equal(ran.out, "");
    assert.deepEqual(ran.browsed, [ran.url]);
  });

  test("--host asks for every interface, and adopts only a daemon bound there", async () => {
    const ran = await running(["--host"], {
      health: [
        { host: EVERY_INTERFACE, version: SHALL_VERSION, procedures: SERVED },
      ],
    });

    assert.equal(ran.code, 0);
    assert.deepEqual(ran.browsed, [ran.url]);
  });

  test("a browser that will not open is answered with the url", async () => {
    const ran = await running([], { browser: 1 });

    assert.equal(ran.code, 0);
    assert.equal(ran.out, `Shall is running at ${ran.url}\n`);
  });
});

/** A folder that is a Shall project, as far as a walk up from `cwd` can tell. */
async function project(): Promise<string> {
  const root = await folder("project");
  await mkdir(path.join(root, ".shall"));
  await writeFile(path.join(root, ".shall", "project.json"), "{}\n");
  return root;
}

/** A release two majors above this one, whatever this one is. */
function later(): string {
  const [major = "0"] = SHALL_VERSION.split(".");
  return `${Number(major) + 1}.0.0`;
}

describe("the folder somebody is standing in", () => {
  test("a folder in no project is said so, and the app opens anyway", async () => {
    const ran = await running([]);

    assert.equal(ran.code, 0);
    assert.equal(
      ran.err,
      "This folder is not inside a Shall project — run shall init to make it one.\n",
    );
    // The picker is still worth opening: a person's other projects are in it.
    assert.deepEqual(ran.browsed, [ran.url]);
  });

  test("a project folder, and any folder under it, is said nothing about", async () => {
    const root = await project();
    const deep = path.join(root, "src", "parser");
    await mkdir(deep, { recursive: true });

    for (const where of [root, deep]) {
      const ran = await running([], { cwd: where });

      assert.equal(ran.code, 0);
      assert.equal(ran.err, "");
      assert.deepEqual(ran.browsed, [ran.url]);
    }
  });

  // The line is about the folder and not about the network, so it arrives on a
  // machine that could not ask about releases at all.
  test("nothing is said about a folder when a command was typed", async () => {
    const ran = await running(["board", "--json"], {
      answers: { "spec.board": { fixSpec: [], implement: [] } },
    });

    assert.equal(ran.err, "");
  });
});

describe("the version notice", () => {
  for (const argv of [[], ["init"]] as const) {
    test(`a newer release is one line on stderr under ${["shall", ...argv].join(" ")}`, async () => {
      const ran = await running([...argv], {
        release: `v${later()}`,
        cwd: await project(),
        answers: { "projects.create": PROJECT },
      });

      assert.equal(ran.code, 0);
      assert.equal(ran.err, `Shall ${later()} is out — run shall upgrade.\n`);
    });
  }

  test("the release this Shall already is says nothing", async () => {
    const ran = await running([], {
      release: SHALL_VERSION,
      cwd: await project(),
    });

    assert.equal(ran.err, "");
  });

  test("--json keeps stdout to the one object, and the notice to stderr", async () => {
    const ran = await running(["init", "--json"], {
      release: later(),
      answers: { "projects.create": PROJECT },
    });

    assert.equal(ran.code, 0);
    assert.deepEqual(JSON.parse(ran.out), PROJECT);
    assert.equal(ran.err, `Shall ${later()} is out — run shall upgrade.\n`);
  });

  for (const argv of [
    ["board"],
    ["check"],
    ["status"],
    ["log", "work_done", "did a thing"],
  ] as const) {
    test(`shall ${argv[0]} carries no notice`, async () => {
      const ran = await running([...argv], {
        release: later(),
        cwd: await project(),
        answers: {
          "spec.board": { root: "/work/atlas", fixSpec: [], implement: [] },
          "spec.check": {
            root: "/work/atlas",
            scope: [],
            nodeCount: 0,
            edgeCount: 0,
            problems: [],
            gaps: [],
            notes: [],
          },
          "spec.status": {
            root: "/work/atlas",
            scope: [],
            nodes: [],
            missing: [],
            broken: [],
          },
          "spec.log": { ok: true },
        },
      });

      assert.equal(ran.code, 0);
      assert.equal(ran.err, "");
    });
  }
});

describe("shall upgrade", () => {
  test("a Shall running from a checkout is told what upgrades it", async () => {
    const ran = await running(["upgrade"], { release: later() });

    // A checkout has no single file to swap, and the refusal says what does the
    // job there instead. Nothing was started to find that out.
    assert.equal(ran.code, 1);
    assert.equal(ran.out, "");
    assert.equal(
      ran.err,
      "shall upgrade replaces the installed Shall binary; this Shall runs from a checkout, which upgrades with git.\n",
    );
    assert.equal(ran.knocks, 0);
  });

  test("it takes nothing after it", async () => {
    const ran = await running(["upgrade", "--json"]);

    assert.equal(ran.code, 1);
    assert.equal(
      ran.err,
      "shall upgrade does not take --json — shall upgrade\n",
    );
  });
});

describe("the words alone", () => {
  test("help is the whole screen, on stdout", async () => {
    const ran = await running(["help"]);

    assert.equal(ran.code, 0);
    assert.match(ran.out, /^shall — the specification a team works from/);
    assert.match(ran.out, /shall log <kind> <summary>/);
    assert.match(ran.out, /shall upgrade +Fetch the newest Shall there is/);
    // Nothing was started to answer a question about words.
    assert.equal(ran.knocks, 0);
  });

  test("--version is the number alone, on stdout, with nothing started to say it", async () => {
    const ran = await running(["--version"]);

    assert.equal(ran.code, 0);
    // A bare semver and no sentence around it: the caller is as often a
    // release script as it is a person.
    assert.equal(ran.out, `${SHALL_VERSION}\n`);
    assert.equal(ran.err, "");
    assert.equal(ran.knocks, 0);
    // The version this install rides is the daemon's too, which is the whole
    // reason a daemon saying a different one is not adopted.
    assert.match(ran.out, /^\d+\.\d+\.\d+\n$/);
  });

  test("a command shall does not know is answered with every command there is", async () => {
    const ran = await running(["approve"]);

    assert.equal(ran.code, 1);
    assert.equal(ran.out, "");
    assert.match(
      ran.err,
      /^Unknown command: approve — here is everything shall does\.\n/,
    );
    assert.match(ran.err, /shall board \[--json\]/);
    assert.equal(ran.knocks, 0);
  });

  test("a usage error is one line, on stderr", async () => {
    const ran = await running(["check", "--scope"]);

    assert.equal(ran.code, 1);
    assert.equal(ran.out, "");
    assert.equal(
      ran.err,
      "shall check needs a path after --scope — shall check [--scope <path>]... [--json]\n",
    );
    assert.equal(ran.knocks, 0);
  });
});

/** A project as `projects.create` answers for it, reopened or made just now. */
const PROJECT = { id: "P-1", name: "atlas", path: "/work/atlas" };

describe("shall init", () => {
  test("says what is true either way, and how to go on from here", async () => {
    const ran = await running(["init"], {
      answers: { "projects.create": PROJECT },
    });

    assert.equal(ran.code, 0);
    assert.deepEqual(lines(ran.out), [
      "atlas is a Shall project at /work/atlas.",
      "Open the app:  shall",
      "Or ask your agent: run claude here, then /shall.help",
    ]);
    // The folder the person is standing in, and no answer to a question that
    // was never asked: a run with no terminal keeps the daemon's own default.
    assert.deepEqual(ran.calls, [
      { procedure: "projects.create", input: { path: ran.cwd } },
    ]);
  });

  test("--json is one object and nothing else", async () => {
    const ran = await running(["init", "--json"], {
      answers: { "projects.create": PROJECT },
    });

    assert.equal(ran.code, 0);
    assert.deepEqual(JSON.parse(ran.out), PROJECT);
    assert.equal(ran.err, "");
  });

  test(
    "a .gitignore that swallows the spec is said so, and not acted on",
    { skip: NO_GIT ? "no git on this machine" : false },
    async () => {
      const repo = await folder("repo");
      await asked("git", ["init", "-q"], { cwd: repo });
      await writeFile(path.join(repo, ".gitignore"), ".shall\n");

      const ran = await running(["init"], {
        cwd: repo,
        answers: { "projects.create": PROJECT },
      });

      assert.equal(ran.code, 0);
      assert.deepEqual(lines(ran.out), [
        "atlas is a Shall project at /work/atlas.",
        ".shall is matched by .gitignore — the spec and the ledgers are meant to be committed, so unignore it.",
        "Open the app:  shall",
        "Or ask your agent: run claude here, then /shall.help",
      ]);
      // Already a repository: there is nothing to ask, so nothing is asked.
      assert.deepEqual(ran.calls, [
        { procedure: "projects.create", input: { path: repo } },
      ]);
    },
  );

  for (const [typed, answered] of [
    ["n", false],
    ["", true],
  ] as const) {
    test(
      `a folder in no repository is asked about, and "${typed}" means ${answered}`,
      { skip: NO_TERMINAL ? "no pty on this platform" : false },
      async () => {
        const ran = await running(["init"], {
          typed,
          answers: { "projects.create": PROJECT },
        });

        assert.match(
          ran.out,
          /This folder is not a git repository\. Git is how a specification is versioned and restored\./,
        );
        assert.match(ran.out, /Run git init here\? \[Y\/n\]/);
        // The question exists so that proceeding without a repository is a
        // choice somebody made; the answer travels to the daemon as one.
        assert.deepEqual(ran.calls, [
          {
            procedure: "projects.create",
            input: { path: ran.cwd, initGit: answered },
          },
        ]);
      },
    );
  }
});

describe("shall add-spec-node", () => {
  test("answers with the path alone first, then the sentence", async () => {
    const ran = await running(["add-spec-node", "--type", "work item"], {
      answers: {
        "spec.scaffold": {
          root: "/work/atlas",
          file: ".shall/spec/plan/Work item/WI-0008.md",
          type: "Work item",
          id: "WI-0008",
        },
      },
    });

    assert.equal(ran.code, 0);
    assert.deepEqual(lines(ran.out), [
      "/work/atlas/.shall/spec/plan/Work item/WI-0008.md",
      "A new Work item, WI-0008 — fill it in, then shall check reads it back.",
    ]);
    // The spelling is carried as typed: which types there are, and how a name
    // is resolved, are the daemon's sentences.
    assert.deepEqual(ran.calls, [
      {
        procedure: "spec.scaffold",
        input: { path: ran.cwd, type: "work item" },
      },
    ]);
  });
});

describe("shall log", () => {
  test("writes one line of the feed, and says which kind it wrote", async () => {
    const ran = await running(
      ["log", "work_done", "Wrote the parser", "--refs", "WL-0001,AC-0002"],
      { answers: { "spec.log": { ok: true } } },
    );

    assert.equal(ran.code, 0);
    assert.deepEqual(lines(ran.out), ["Logged work_done."]);
    assert.deepEqual(ran.calls, [
      {
        procedure: "spec.log",
        input: {
          path: ran.cwd,
          kind: "work_done",
          summary: "Wrote the parser",
          refs: ["WL-0001", "AC-0002"],
        },
      },
    ]);
  });

  test("a kind the daemon refuses arrives as the sentence it wrote", async () => {
    const sentence =
      "kind must be one of specify_done, plan_done, work_done, raise_landed.";
    const ran = await running(["log", "approve", "Looks good"], {
      refusals: { "spec.log": sentence },
    });

    assert.equal(ran.code, 1);
    assert.equal(ran.out, "");
    assert.equal(ran.err, `${sentence}\n`);
  });

  test("--json puts that same sentence in the one object on stdout", async () => {
    const sentence = "summary must not be empty.";
    const ran = await running(["log", "work_done", "x", "--json"], {
      refusals: { "spec.log": sentence },
    });

    assert.equal(ran.code, 1);
    assert.equal(ran.err, "");
    assert.deepEqual(JSON.parse(ran.out), { error: sentence });
  });
});

describe("shall check", () => {
  test("a spec that does not hold together fails, and says where", async () => {
    const ran = await running(["check", "--scope", "intent", "--scope", "plan"], {
      answers: {
        "spec.check": {
          root: "/work/atlas",
          scope: ["intent", "plan"],
          nodeCount: 1,
          edgeCount: 2,
          problems: [
            { file: "intent/Goal/G-0001.md", message: "unknown key: piority" },
          ],
          gaps: [
            {
              file: "plan/Work item/WI-0007.md",
              message: "targets AC-0009, which nothing answers to",
            },
          ],
          notes: [
            {
              file: "intent/Goal/G-0002.md",
              message: "the heading is not the node's name",
            },
          ],
        },
      },
    });

    // A compiler: the exit code is the whole point of the command.
    assert.equal(ran.code, 1);
    // The count is what the folder holds; the three lists are what was asked
    // about; and the first line names where the reading was taken, so a scope
    // that landed somewhere other than where it was aimed is visible.
    assert.deepEqual(lines(ran.out), [
      "1 node and 2 relations under /work/atlas, in intent and plan.",
      "intent/Goal/G-0001.md — unknown key: piority",
      "plan/Work item/WI-0007.md — targets AC-0009, which nothing answers to",
      "intent/Goal/G-0002.md — the heading is not the node's name",
    ]);
    assert.deepEqual(ran.calls, [
      {
        procedure: "spec.check",
        input: { path: ran.cwd, scope: ["intent", "plan"] },
      },
    ]);
  });

  test("a note does not fail the check, and a prefix that resolved to nothing names no narrowing", async () => {
    const ran = await running(["check"], {
      answers: {
        "spec.check": {
          root: "/work/atlas",
          scope: [""],
          nodeCount: 2,
          edgeCount: 1,
          problems: [],
          gaps: [],
          notes: [
            {
              file: "intent/Goal/G-0002.md",
              message: "the heading is not the node's name",
            },
          ],
        },
      },
    });

    assert.equal(ran.code, 0);
    assert.deepEqual(lines(ran.out), [
      "2 nodes and 1 relation under /work/atlas.",
      "intent/Goal/G-0002.md — the heading is not the node's name",
    ]);
  });
});

describe("shall status", () => {
  test("every node in its band, with what a person wrote under it", async () => {
    const ran = await running(["status", "--scope=intent"], {
      answers: {
        "spec.status": {
          root: "/work/atlas",
          scope: ["intent"],
          nodes: [
            {
              id: "G-0001",
              type: "Goal",
              band: "Intent",
              color: "red",
              reason: "rejected",
              closure: null,
              workItemState: null,
              name: "Ship the reader",
              rejection: {
                by: "ada",
                at: "2026-02-03",
                rationale: "Two goals in one.\nSplit it.",
              },
              leftOpen: null,
              problem: null,
            },
            {
              id: "AC-0002",
              type: "Acceptance criterion",
              band: "Intent",
              color: "yellow",
              reason: "changed",
              closure: "open",
              workItemState: null,
              name: "Reads a folder",
              rejection: null,
              leftOpen: {
                by: "bo",
                at: "2026-02-04",
                rationale: "The evidence names no run.",
              },
              problem: null,
            },
            {
              id: "WI-0003",
              type: "Work item",
              band: "Plan",
              color: "red",
              reason: "off-target",
              closure: "open",
              workItemState: "ready",
              name: "Write the parser",
              rejection: null,
              leftOpen: null,
              problem: "aims at AC-0002, which no requirement carries",
            },
            {
              id: "X-0004",
              type: "Nonesuch",
              band: null,
              color: "red",
              reason: "malformed",
              closure: null,
              workItemState: null,
              name: "Out of the canon",
              rejection: null,
              leftOpen: null,
              problem: null,
            },
          ],
          missing: [
            {
              id: "AC-0009",
              referencedBy: [
                { fromId: "WI-0003", type: "TARGETS" },
                { fromId: "WI-0005", type: "TARGETS" },
              ],
            },
          ],
          broken: [
            {
              file: "plan/Work item/WI-0006.md",
              problems: ["frontmatter is not a mapping", "no id"],
            },
          ],
        },
      },
    });

    assert.equal(ran.code, 0);
    // One heading per band in the canon's own column order, the columns as wide
    // as the widest answer given, and under a row only what somebody else wrote
    // — carried whole, paragraph and all.
    assert.deepEqual(lines(ran.out), [
      "4 nodes under /work/atlas, in intent — 3 red, 1 yellow, 0 green.",
      "Intent",
      "  G-0001   Goal                  red            Ship the reader",
      "    ada refused it on 2026-02-03 — Two goals in one.",
      "    Split it.",
      "  AC-0002  Acceptance criterion  yellow  open   Reads a folder",
      "    bo left it open on 2026-02-04 — The evidence names no run.",
      "Plan",
      "  WI-0003  Work item             red     ready  Write the parser",
      "    aims at AC-0002, which no requirement carries",
      "No band",
      "  X-0004   Nonesuch              red            Out of the canon",
      "Missing ids",
      "  AC-0009 — WI-0003 TARGETS, WI-0005 TARGETS",
      "Files that would not read",
      "  plan/Work item/WI-0006.md",
      "    frontmatter is not a mapping no id",
    ]);
  });

  test("a project nobody asked either question of has no state column", async () => {
    const ran = await running(["status"], {
      answers: {
        "spec.status": {
          root: "/work/atlas",
          scope: [],
          nodes: [
            {
              id: "G-0001",
              type: "Goal",
              band: "Intent",
              color: "green",
              reason: "approved",
              closure: null,
              workItemState: null,
              name: "Ship the reader",
              rejection: null,
              leftOpen: null,
              problem: null,
            },
          ],
          missing: [],
          broken: [],
        },
      },
    });

    assert.equal(ran.code, 0);
    // No closure and no work item state anywhere: the column disappears rather
    // than standing empty beside every row.
    assert.deepEqual(lines(ran.out), [
      "1 node under /work/atlas — 0 red, 0 yellow, 1 green.",
      "Intent",
      "  G-0001  Goal  green  Ship the reader",
    ]);
  });
});

describe("shall board", () => {
  test("two sections for two audiences, each with what it takes to act", async () => {
    const ran = await running(["board"], {
      answers: {
        "spec.board": {
          root: "/work/atlas",
          fixSpec: [
            {
              key: "fix:G-0001",
              id: "G-0001",
              type: "Goal",
              shortName: "reader",
              name: "Ship the reader",
              kind: "rejected",
              reason: "rejected",
              detail: "Two goals in one.",
              file: "intent/Goal/G-0001.md",
              by: "ada",
              at: "2026-02-03",
              updatedAt: 1,
            },
            {
              key: "fix:AC-0009",
              id: "AC-0009",
              type: null,
              shortName: null,
              name: null,
              kind: "grammar",
              reason: "missing",
              detail: "WI-0003 TARGETS it, and nothing answers to it.",
              file: null,
              by: null,
              at: null,
              updatedAt: null,
            },
            {
              key: "fix:plan/Work item/WI-0006.md",
              id: null,
              type: null,
              shortName: null,
              name: null,
              kind: "grammar",
              reason: "malformed",
              detail: "frontmatter is not a mapping",
              file: "plan/Work item/WI-0006.md",
              by: null,
              at: null,
              updatedAt: null,
            },
          ],
          implement: [
            {
              key: "work-item:WI-0003",
              id: "WI-0003",
              shortName: "parser",
              name: "Write the parser",
              updatedAt: 1,
              modules: [{ id: "M-0001", shortName: "reader", name: "Reader" }],
              requirements: [
                { id: "R-0002", shortName: "reads", name: "Reads a folder" },
              ],
              targets: [
                { id: "AC-0003", name: "Reads a folder", closure: "closed" },
                { id: "AC-0004", name: "Reads a file", closure: null },
              ],
              addressedBy: [
                { id: "WL-0005", name: "First pass", color: "green" },
              ],
              depth: 1,
            },
            {
              key: "work-item:WI-0007",
              id: "WI-0007",
              shortName: "writer",
              name: "Write the writer",
              updatedAt: 2,
              modules: [],
              requirements: [],
              targets: [],
              addressedBy: [],
              depth: 0,
            },
          ],
        },
      },
    });

    assert.equal(ran.code, 0);
    // A row for a hole has no name behind the id and a row for a file that
    // would not read has no id at all, so the path is the identity it has; only
    // a refusal carries a person and an instant. Under an Implement row, a
    // clause is left out when there is nothing to put in it.
    assert.deepEqual(lines(ran.out), [
      "The board under /work/atlas.",
      "Fix Spec — 3 things to fix.",
      "  rejected — G-0001 Ship the reader",
      "    ada refused it on 2026-02-03 — Two goals in one.",
      "  missing — AC-0009",
      "    WI-0003 TARGETS it, and nothing answers to it.",
      "  malformed — plan/Work item/WI-0006.md",
      "    frontmatter is not a mapping",
      "Implement — 2 work items ready to start.",
      "  WI-0003 Write the parser",
      "    Allocated by M-0001. For R-0002. Targets AC-0003 (closed), AC-0004 (no closure). Addressed by WL-0005 (green).",
      "  WI-0007 Write the writer",
    ]);
    assert.deepEqual(ran.calls, [
      { procedure: "spec.board", input: { path: ran.cwd } },
    ]);
  });

  test("an empty board says so twice, once for each audience", async () => {
    const ran = await running(["board"], {
      answers: {
        "spec.board": { root: "/work/atlas", fixSpec: [], implement: [] },
      },
    });

    assert.equal(ran.code, 0);
    assert.deepEqual(lines(ran.out), [
      "The board under /work/atlas.",
      "Fix Spec — nothing to fix.",
      "Implement — nothing is ready to start.",
    ]);
  });
});
