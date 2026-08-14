#!/usr/bin/env node

import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import os from "node:os";
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
import { connect } from "./client.js";

process.title = "shall";

// The same discipline now covers a project's own files. `init` and `check` open
// nothing and read nothing: they start the daemon like the bare command does and
// then ask a procedure, because the daemon is the one process that reads spec
// files for Shall. A terminal that parsed those files itself would be a second
// reader with its own opinion of the format, and the first hand-written file
// they disagreed about would be a bug nobody could locate — which is the whole
// reason every fact in this system has one home.

const execFileAsync = promisify(execFile);

/** Loopback unless `--host` is given: the app is this machine's, by default. */
const LOOPBACK = "127.0.0.1";

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
 * `shall init` — this folder, made into a Shall project.
 *
 * `projects.create` already reopens a folder that has a `.shall` in it, so
 * running this twice is not an error and the sentence printed says only what is
 * true either way: this is a Shall project, and here it is.
 */
async function init(url: string): Promise<void> {
  const project = await connect(url).projects.create.mutate({
    path: process.cwd(),
  });
  console.log(`${project.name} is a Shall project at ${project.path}.`);
}

/** English that does not say "1 nodes". */
function count(amount: number, one: string, many: string): string {
  return `${amount} ${amount === 1 ? one : many}`;
}

/**
 * `shall check` — the compiler an agent writing spec files by hand compiles
 * against.
 *
 * Two lists arrive and both are printed as `file — sentence`, because both are
 * about a file and the sentence already says which kind it is. Only problems
 * decide the exit code: a problem is a file left out of the graph, which is work
 * still to do, while a note is a file that reads perfectly well and merely is
 * not written the way Shall writes it. Failing a build over the second would
 * teach agents to reformat files that were never wrong.
 *
 * The count goes first even when something is broken, because what a problem
 * costs is exactly the difference between the folder and this number.
 */
async function check(url: string): Promise<void> {
  const result = await connect(url).spec.check.query({ path: process.cwd() });

  console.log(
    `${count(result.nodeCount, "node", "nodes")} and ${count(
      result.edgeCount,
      "relation",
      "relations",
    )} under ${result.root}.`,
  );
  for (const problem of result.problems) {
    console.log(`${problem.file} — ${problem.message}`);
  }
  for (const note of result.notes) {
    console.log(`${note.file} — ${note.message}`);
  }

  if (result.problems.length > 0) {
    process.exitCode = 1;
  }
}

const [command, ...rest] = process.argv.slice(2);

if (command === undefined || command === "--host") {
  // No command means the app: find or start the daemon, then open it. `--host`
  // is the one option, and it is about who may reach the daemon, not about what
  // to do — so it belongs to this branch and nothing else reads it.
  const unknownArguments = rest.filter((argument) => argument !== "--host");
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown option: ${unknownArguments.join(", ")}`);
  }
  const bindHost = command === "--host" ? "0.0.0.0" : LOOPBACK;
  await openShall(await ensureDaemon(bindHost));
} else if (command === "init" || command === "check") {
  if (rest.length > 0) {
    console.error(`shall ${command} takes no arguments.`);
    process.exitCode = 1;
  } else {
    // Both commands work on the folder the person is standing in, which is the
    // folder their editor and their agent are standing in too.
    const url = await ensureDaemon(LOOPBACK);
    try {
      await (command === "init" ? init(url) : check(url));
    } catch (error) {
      console.error(sentenceOf(error));
      process.exitCode = 1;
    }
  }
} else {
  console.error(
    `Unknown command: ${command} — shall opens the app, shall init makes this folder a Shall project, and shall check reads the spec files in it.`,
  );
  process.exitCode = 1;
}
