#!/usr/bin/env node

import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
// The CLI is a client, not a second reader of the host: `~/.shall` has one
// implementation and it belongs to the daemon. This borrows it to find the
// port to talk to, and nothing else.
import {
  ensureShallHome,
  readConfig,
  readDaemonState,
  removeDaemonState,
} from "@shall/daemon/home";
import { parseArguments, USAGE, type Answering } from "./args.js";
import { connect } from "./client.js";

process.title = "shall";

// The same discipline now covers a project's own files. `init`, `check`,
// `status` and `board` open nothing and read nothing: they start the daemon like
// the bare command does and then ask a procedure, because the daemon is the one
// process that reads spec files for Shall. A terminal that parsed those files
// itself would be a second reader with its own opinion of the format, and the
// first hand-written file they disagreed about would be a bug nobody could
// locate — which is the whole reason every fact in this system has one home.
//
// `status` AND `board` MAKE THAT BARGAIN TWICE OVER — nobody here works out a
// colour or a place on the board for themselves, for the reason `statusSpec`
// gives in full in `daemon/src/service/spec-status.ts`.
//
// WHAT IS NOT HERE IS AS DELIBERATE AS WHAT IS. There is no `shall approve`, no
// `shall reject` and no `shall close`: a judgement is a person's, made in the
// web UI over what they can see, and a command that let an agent write one into
// a book would make the ledgers a record of what the agent decided about itself.

const execFileAsync = promisify(execFile);

/** Loopback unless `--host` is given: the app is this machine's, by default. */
const LOOPBACK = "127.0.0.1";

/** What `--host` asks for: every interface, so another machine can reach it. */
const EVERY_INTERFACE = "0.0.0.0";

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function getRunningHost(url: string): Promise<string | null> {
  try {
    const response = await fetch(`${url}/health`);
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { host?: unknown };
    return typeof body.host === "string" ? body.host : null;
  } catch {
    return null;
  }
}

async function waitForServer(
  url: string,
  expectedHost: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if ((await getRunningHost(url)) === expectedHost) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function stopProcess(pid: number): Promise<void> {
  process.kill(pid, "SIGTERM");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!isProcessAlive(pid)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Could not stop Shall daemon process ${pid}`);
}

async function openBrowser(url: string): Promise<boolean> {
  try {
    if (process.platform === "win32") {
      await execFileAsync("cmd.exe", ["/c", "start", "", url]);
    } else if (process.platform === "darwin") {
      await execFileAsync("open", [url]);
    } else if (
      process.env.WSL_DISTRO_NAME ||
      os.release().toLowerCase().includes("microsoft")
    ) {
      await execFileAsync("cmd.exe", ["/c", "start", "", url]);
    } else {
      await execFileAsync("xdg-open", [url]);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * A daemon running at the configured port and listening on `bindHost`, and the
 * URL to reach it at.
 *
 * The state file on record is believed only so far: a pid that is gone, a port
 * the config no longer names, or a bind address that is not the one asked for
 * all mean the process to talk to is not the process that is running, so the old
 * one is stopped and forgotten before a new one takes the port.
 */
async function ensureDaemon(bindHost: string): Promise<string> {
  await ensureShallHome();
  const config = await readConfig();
  const url = `http://localhost:${config.port}`;
  let daemonState = await readDaemonState();

  if (daemonState !== null && !isProcessAlive(daemonState.pid)) {
    await removeDaemonState(daemonState.pid);
    daemonState = null;
  }

  if (
    daemonState !== null &&
    (daemonState.port !== config.port ||
      (await getRunningHost(`http://localhost:${daemonState.port}`)) !==
        bindHost)
  ) {
    await stopProcess(daemonState.pid);
    await removeDaemonState(daemonState.pid);
    daemonState = null;
  }

  if (daemonState === null) {
    const daemonPath = fileURLToPath(import.meta.resolve("@shall/daemon/main"));
    const child = spawn(process.execPath, [daemonPath], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        NODE_ENV: "production",
        SHALL_HOST: bindHost,
      },
    });
    child.unref();

    if (!(await waitForServer(url, bindHost))) {
      throw new Error(`Shall daemon did not start at ${url}`);
    }
  }

  return url;
}

/** The app is the browser; when it cannot be opened, the URL is the app. */
async function openShall(url: string): Promise<void> {
  if (!(await openBrowser(url))) {
    console.log(`Shall is running at ${url}`);
  }
}

/**
 * A refusal arrives here already written for a person — the daemon says why in a
 * sentence — so it is printed as one. Letting it out as an unhandled rejection
 * would bury that sentence under a stack trace of this file's own plumbing,
 * which is never the thing that went wrong.
 */
function sentenceOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * WHAT A COMMAND WORKED OUT, before anybody has decided how to say it.
 *
 * COMPUTING THE ANSWER IS SEPARATE FROM SAYING IT, and that is what keeps
 * `--json` honest: one place below turns this into either a single JSON object
 * or lines for a person, so no command can print half of one and half of the
 * other, and no command added later can forget the flag exists.
 */
interface Said {
  /** The object `--json` prints, whole. */
  answer: unknown;
  /** The same answer written for a person, one entry per line. */
  prose: string[];
  /**
   * Whether the ANSWER is a failure. `check` is the only command with one: a
   * spec that does not hold together is a failed check, while a red node is
   * precisely what `status` and `board` were asked for.
   */
  failed: boolean;
}

/**
 * `shall init` — this folder, made into a Shall project.
 *
 * `projects.create` already reopens a folder that has a `.shall` in it, so
 * running this twice is not an error and the sentence printed says only what is
 * true either way: this is a Shall project, and here it is.
 */
async function init(url: string): Promise<Said> {
  const project = await connect(url).projects.create.mutate({
    path: process.cwd(),
  });
  return {
    answer: { id: project.id, name: project.name, path: project.path },
    prose: [`${project.name} is a Shall project at ${project.path}.`],
    failed: false,
  };
}

/**
 * `shall add-spec-node --type <Type>` — a starting file for one new node,
 * written at the node's own path with the next free id as its name.
 *
 * ONE COMMAND FOR ALL TWENTY-TWO TYPES: the type is an argument and never a
 * subcommand, so the canon can grow without this file learning a new word. The
 * daemon resolves the spelling case-insensitively and refuses an unknown one
 * with the full list, which is this command's `--help` for types.
 *
 * THE FIRST LINE OF OUTPUT IS THE PATH, ALONE. The caller is usually an agent
 * that asked exactly this question — where do I write? — and a bare absolute
 * path is the answer it can take without parsing prose. The sentence for a
 * person follows on its own line.
 */
async function addSpecNode(url: string, type: string): Promise<Said> {
  const scaffolded = await connect(url).spec.scaffold.mutate({
    path: process.cwd(),
    type,
  });
  const wrote = path.join(scaffolded.root, scaffolded.file);
  return {
    answer: {
      root: scaffolded.root,
      file: scaffolded.file,
      path: wrote,
      type: scaffolded.type,
      id: scaffolded.id,
    },
    prose: [
      wrote,
      `A new ${scaffolded.type}, ${scaffolded.id} — fill it in, then shall check reads it back.`,
    ],
    failed: false,
  };
}

/** English that does not say "1 nodes". */
function count(amount: number, one: string, many: string): string {
  return `${amount} ${amount === 1 ? one : many}`;
}

/**
 * Where a reading was taken: the project, and the folders a scope narrowed it
 * to. A prefix that resolved to nothing is the spec folder itself — the whole of
 * it — so it names no narrowing.
 */
function under(root: string, scope: readonly string[]): string {
  const named = scope.filter((prefix) => prefix.length > 0);
  return named.length === 0 ? root : `${root}, in ${named.join(" and ")}`;
}

/** The width of the widest of them, so a column of them lines up. */
function widest(words: readonly string[]): number {
  return words.reduce((width, word) => Math.max(width, word.length), 0);
}

/**
 * A sentence somebody else wrote, moved under the row it belongs to — every line
 * of it, because a rationale is a paragraph as often as it is a line.
 */
function indented(text: string): string {
  return text
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

/**
 * A person's standing refusal, in this client's one spelling of it — `status`
 * prints it under a node and `board` under a Fix Spec row, and one function is
 * what keeps those two from drifting into two sentences for one record. The
 * rationale is carried WHOLE: it is a work order written for whoever picks the
 * node up, and a summary of it is a different instruction.
 */
function refusal(by: string, at: string, rationale: string): string {
  return `${by} refused it on ${at} — ${rationale}`;
}

/**
 * `shall check` — the compiler an agent writing spec files by hand compiles
 * against.
 *
 * Three lists arrive and all are printed as `file — sentence`, because each is
 * about a file and the sentence already says which kind it is. A problem is a
 * file the graph could not take; a gap is a hole the graph holds while every
 * file reads — a relation kept toward an id nothing answers to, a node no live
 * anchor reaches; a note is a file that reads perfectly well and merely is not
 * written the way Shall writes it. Problems and gaps decide the exit code, and
 * a spec mid-authoring therefore fails until its holes close — deliberate
 * pressure, not a severity to demote. Failing a build over a note would teach
 * agents to reformat files that were never wrong.
 *
 * The count goes first even when something is broken, because what a problem
 * costs is exactly the difference between the folder and this number — with
 * one exception the daemon spells from the project root — a ledger that will
 * not read, which costs no node and every judgement.
 *
 * A SCOPE NARROWS THE THREE LISTS AND NOT THE COUNT, which is `checkSpec`'s own
 * bargain and its reason: the count is what the folder holds, and the lists are
 * what was asked about. The first line names where the reading was taken all
 * the same — a scope that landed somewhere other than where it was aimed is
 * otherwise invisible in the one command a build hangs its exit code on. That
 * code is decided after the narrowing, so a check pointed at one folder passes
 * or fails on that folder's account.
 */
async function check(url: string, scope: readonly string[]): Promise<Said> {
  const result = await connect(url).spec.check.query({
    path: process.cwd(),
    scope: [...scope],
  });

  const prose = [
    `${count(result.nodeCount, "node", "nodes")} and ${count(
      result.edgeCount,
      "relation",
      "relations",
    )} under ${under(result.root, result.scope)}.`,
  ];
  for (const problem of result.problems) {
    prose.push(`${problem.file} — ${problem.message}`);
  }
  for (const gap of result.gaps) {
    prose.push(`${gap.file} — ${gap.message}`);
  }
  for (const note of result.notes) {
    prose.push(`${note.file} — ${note.message}`);
  }

  return {
    answer: result,
    prose,
    failed: result.problems.length + result.gaps.length > 0,
  };
}

/**
 * A node whose type the canon does not have — which the loader never serves, so
 * this heading is the honest place for one rather than a band it is not in.
 */
const NO_BAND = "No band";

/**
 * `shall status` — the project node by node, so that nobody has to work out a
 * colour for themselves.
 *
 * THE SUMMARY LINE IS WHAT MOST CALLERS CAME FOR: how much there is and how much
 * of it is settled. The rows below are the same answer at the width of one node,
 * grouped into the bands the daemon already sorted them into — which is the
 * order of the columns on the Spec plane, so an agent's list and the screen
 * beside it read the same way down.
 *
 * A SECOND LINE IS FOR A SENTENCE SOMEBODY ELSE WROTE, and only for that: a rule
 * of the graph naming what is off target, a person refusing the node, a person
 * leaving a subject open. Each is printed whole, because each is the instruction
 * for putting the node right and a shortened instruction is a different one.
 */
async function status(url: string, scope: readonly string[]): Promise<Said> {
  const result = await connect(url).spec.status.query({
    path: process.cwd(),
    scope: [...scope],
  });

  const tally = { red: 0, yellow: 0, green: 0 };
  for (const node of result.nodes) {
    tally[node.color] += 1;
  }
  const prose = [
    `${count(result.nodes.length, "node", "nodes")} under ${under(
      result.root,
      result.scope,
    )} — ${tally.red} red, ${tally.yellow} yellow, ${tally.green} green.`,
  ];

  // A criterion says open or closed and a task says blocked, ready or done; no
  // other type is asked either question, so the column is only as wide as the
  // answers actually given and disappears when none were.
  //
  // A TASK IS ASKED BOTH AND ANSWERS IN ONE WORD. `done` IS the closed mark,
  // said in the vocabulary of a task, so its own word is the one that shows —
  // printing `open ready` beside each other would be one fact told twice.
  const state = (node: { closure: string | null; taskState: string | null }) =>
    node.taskState ?? node.closure ?? "";
  const width = {
    id: widest(result.nodes.map((node) => node.id)),
    type: widest(result.nodes.map((node) => node.type)),
    color: widest(result.nodes.map((node) => node.color)),
    state: widest(result.nodes.map(state)),
  };

  let band: string | null = null;
  for (const node of result.nodes) {
    const its = node.band ?? NO_BAND;
    if (its !== band) {
      prose.push(its);
      band = its;
    }
    prose.push(
      `  ${[
        node.id.padEnd(width.id),
        node.type.padEnd(width.type),
        node.color.padEnd(width.color),
        ...(width.state > 0 ? [state(node).padEnd(width.state)] : []),
        node.name,
      ].join("  ")}`,
    );
    // A standing refusal and a subject left open are the two things a person
    // wrote about this node; the reason word says which of them is the colour,
    // and the rejection ledger holds one record per node, so at most one of the
    // two is here.
    if (node.reason === "rejected" && node.rejection !== null) {
      prose.push(
        indented(
          refusal(
            node.rejection.by,
            node.rejection.at,
            node.rejection.rationale,
          ),
        ),
      );
    }
    if (node.leftOpen !== null) {
      prose.push(
        indented(
          `${node.leftOpen.by} left it open on ${node.leftOpen.at} — ${node.leftOpen.rationale}`,
        ),
      );
    }
    if (node.problem !== null) {
      prose.push(indented(node.problem));
    }
  }

  if (result.missing.length > 0) {
    prose.push("Missing ids");
    for (const hole of result.missing) {
      prose.push(
        `  ${hole.id} — ${hole.referencedBy
          .map((referrer) => `${referrer.fromId} ${referrer.type}`)
          .join(", ")}`,
      );
    }
  }
  if (result.broken.length > 0) {
    prose.push("Files that would not read");
    for (const file of result.broken) {
      prose.push(`  ${file.file}`);
      prose.push(indented(file.problems.join(" ")));
    }
  }

  return { answer: result, prose, failed: false };
}

/**
 * `shall board` — the Task Board in a terminal: what the specification needs
 * fixed, and what is ready to be worked on.
 *
 * THE TWO SECTIONS ARE TWO AUDIENCES, which is why they are headed rather than
 * merged into one ranked list: Fix Spec is for whoever is repairing the spec,
 * Implement is for whoever is building, and everything in the second has already
 * passed every gate.
 */
async function board(url: string): Promise<Said> {
  const result = await connect(url).spec.board.query({ path: process.cwd() });

  const prose = [`The board under ${result.root}.`];
  prose.push(
    result.fixSpec.length === 0
      ? "Fix Spec — nothing to fix."
      : `Fix Spec — ${count(result.fixSpec.length, "thing", "things")} to fix.`,
  );
  for (const row of result.fixSpec) {
    // A row for a file that would not read has no id, and the path is the only
    // identity it has; a row for a hole has no name behind the id.
    prose.push(
      `  ${row.reason} — ${row.id ?? row.file ?? ""}${
        row.name === null ? "" : ` ${row.name}`
      }`,
    );
    prose.push(
      indented(
        row.by !== null && row.at !== null
          ? refusal(row.by, row.at, row.detail)
          : row.detail,
      ),
    );
  }

  prose.push(
    result.implement.length === 0
      ? "Implement — nothing is ready to start."
      : `Implement — ${count(
          result.implement.length,
          "task",
          "tasks",
        )} ready to start.`,
  );
  for (const row of result.implement) {
    prose.push(`  ${row.id} ${row.name}`);
    // What the task belongs to, what it aims at and who is already on it — each
    // clause left out when there is nothing to put in it, because a row of empty
    // headings says less than a shorter row.
    const clauses: string[] = [];
    if (row.modules.length > 0) {
      clauses.push(
        `Allocated by ${row.modules.map((module) => module.id).join(", ")}.`,
      );
    }
    if (row.requirements.length > 0) {
      clauses.push(
        `For ${row.requirements.map((carrier) => carrier.id).join(", ")}.`,
      );
    }
    if (row.targets.length > 0) {
      clauses.push(
        `Targets ${row.targets
          .map((target) => `${target.id} (${target.closure ?? "no closure"})`)
          .join(", ")}.`,
      );
    }
    if (row.addressedBy.length > 0) {
      clauses.push(
        `Addressed by ${row.addressedBy
          .map((log) => `${log.id} (${log.color})`)
          .join(", ")}.`,
      );
    }
    if (clauses.length > 0) {
      prose.push(indented(clauses.join(" ")));
    }
  }

  return { answer: result, prose, failed: false };
}

/** Which command was asked for, and nothing about how its answer is said. */
function answerFor(url: string, asked: Answering): Promise<Said> {
  switch (asked.command) {
    case "init":
      return init(url);
    case "check":
      return check(url, asked.scope);
    case "status":
      return status(url, asked.scope);
    case "board":
      return board(url);
    case "add-spec-node":
      return addSpecNode(url, asked.type);
  }
}

/**
 * THE ONE PLACE AN ANSWER BECOMES OUTPUT.
 *
 * WITH `--json`, STDOUT CARRIES EXACTLY ONE JSON OBJECT AND NOTHING ELSE — the
 * answer, or `{"error": …}` carrying the sentence the daemon refused with. A
 * caller reads stdout once and parses it once, whichever way the run went, and a
 * stray line of prose above it would break every one of them.
 *
 * EXIT CODES ARE A CONTRACT, and a short one. `check` exits 1 when the spec does
 * not hold together — problems or gaps, counted after a scope narrowed them —
 * because it is a compiler and a build that ignored it would ship the hole.
 * Every other command exits 0 unless the call itself failed: a red node, a
 * standing refusal, an empty board are answers and not errors. A CALLER BRANCHES
 * ON THE CONTENT, NEVER ON THE CODE.
 */
async function report(asked: Answering): Promise<void> {
  try {
    // Every command here works on the folder the person is standing in, which is
    // the folder their editor and their agent are standing in too.
    const said = await answerFor(await ensureDaemon(LOOPBACK), asked);
    if (asked.json) {
      console.log(JSON.stringify(said.answer, null, 2));
    } else if (said.prose.length > 0) {
      console.log(said.prose.join("\n"));
    }
    if (said.failed) {
      process.exitCode = 1;
    }
  } catch (error) {
    const sentence = sentenceOf(error);
    if (asked.json) {
      console.log(JSON.stringify({ error: sentence }, null, 2));
    } else {
      console.error(sentence);
    }
    process.exitCode = 1;
  }
}

const asked = parseArguments(process.argv.slice(2));

if ("usage" in asked) {
  // The words alone were wrong: no daemon has been started and no folder read,
  // so this goes to stderr and the one line shows the shape that would work.
  console.error(asked.usage);
  process.exitCode = 1;
} else if (asked.command === "help") {
  console.log(USAGE);
} else if (asked.command === "unknown") {
  // A mistyped command has no shape of its own to be shown, so it is answered
  // with every shape there is — the screen `shall help` prints, quoted rather
  // than summarised into a sentence that would go stale the next time a command
  // is added.
  console.error(
    `Unknown command: ${asked.name} — here is everything shall does.`,
  );
  console.error(USAGE);
  process.exitCode = 1;
} else if (asked.command === "open") {
  // No command means the app: find or start the daemon, then open it.
  await openShall(
    await ensureDaemon(asked.network ? EVERY_INTERFACE : LOOPBACK),
  );
} else {
  await report(asked);
}
