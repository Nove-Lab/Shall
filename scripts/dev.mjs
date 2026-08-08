import { spawn } from "node:child_process";

const argumentsList = process.argv.slice(2);
const unknownArguments = argumentsList.filter(
  (argument) => argument !== "--host",
);
if (unknownArguments.length > 0) {
  throw new Error(`Unknown option: ${unknownArguments.join(", ")}`);
}

const bindHost = argumentsList.includes("--host") ? "0.0.0.0" : "127.0.0.1";
const environment = {
  ...process.env,
  SHALL_HOST: bindHost,
};

function run(command, args, options = {}) {
  return spawn(command, args, {
    env: environment,
    stdio: "inherit",
    ...options,
  });
}

async function runToCompletion(command, args) {
  const child = run(command, args);
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  if (code !== 0) {
    process.exit(code);
  }
}

await runToCompletion("bun", ["run", "build:schema"]);
await runToCompletion("bun", ["run", "build:daemon"]);

const detached = process.platform !== "win32";
const children = [
  run("bun", ["run", "--filter", "@shall/daemon", "dev"], { detached }),
  run("bun", ["run", "--filter", "@shall/web", "dev"], { detached }),
];

function stopChild(child) {
  if (!child.pid || child.exitCode !== null) {
    return;
  }
  try {
    if (detached) {
      process.kill(-child.pid, "SIGTERM");
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    // The process already stopped.
  }
}

function stopAll() {
  for (const child of children) {
    stopChild(child);
  }
}

process.once("SIGINT", stopAll);
process.once("SIGTERM", stopAll);

const exitCode = await Promise.race(
  children.map(
    (child) =>
      new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code) => resolve(code ?? 1));
      }),
  ),
);

stopAll();
process.exit(exitCode);
