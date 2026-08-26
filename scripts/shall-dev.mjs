import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { devHomeEnvironment } from "./dev-home.mjs";

// `bun run shall` — the checkout's CLI aimed at the checkout's home, so trying
// a command never knocks on (or restarts) the installed Shall's daemon.
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const child = spawn(
  process.execPath,
  [path.join(repoRoot, "client/cli/dist/main.js"), ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, ...(await devHomeEnvironment()) },
  },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  process.exit(signal !== null ? 1 : (code ?? 1));
});
