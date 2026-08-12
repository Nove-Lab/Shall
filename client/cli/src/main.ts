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

process.title = "shall";

const execFileAsync = promisify(execFile);
const cliArguments = process.argv.slice(2);
const unknownArguments = cliArguments.filter((argument) => argument !== "--host");
if (unknownArguments.length > 0) {
  throw new Error(`Unknown option: ${unknownArguments.join(", ")}`);
}
const bindHost = cliArguments.includes("--host") ? "0.0.0.0" : "127.0.0.1";

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
    (await getRunningHost(`http://localhost:${daemonState.port}`)) !== bindHost)
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

if (!(await openBrowser(url))) {
  console.log(`Shall is running at ${url}`);
}
