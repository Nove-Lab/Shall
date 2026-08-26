import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE CHECKOUT'S OWN SHALL HOME. An installed Shall and a checkout share a
 * machine but must never share `~/.shall`: whichever daemon starts rewrites
 * the templates, walks every registered project's kit, and takes the one
 * daemon slot — so a dev run against the real home leaves dev fingerprints on
 * real projects and knocks the installed daemon over. The checkout gets
 * `.shall-dev/` in the repo instead, on a port of its own, and `SHALL_HOME`
 * (read in `daemon/src/host/shall-home.ts`) is what points a process at it.
 *
 * THE PORT IS SEEDED, NOT DEFAULTED, because the daemon's own default is the
 * installed Shall's 9461: a fresh home left to the daemon to fill in would
 * collide with the very install this file exists to keep clear of.
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const DEV_HOME = path.join(repoRoot, ".shall-dev");
const DEFAULT_DEV_PORT = 9462;

/**
 * Seeds `.shall-dev/` (a config with the dev port, on the first run) and
 * returns the environment that aims a child at it: `SHALL_HOME` for the daemon
 * and the CLI, `SHALL_DAEMON_PORT` for Vite's proxy and HMR.
 */
export async function devHomeEnvironment() {
  await mkdir(DEV_HOME, { recursive: true });
  const configPath = path.join(DEV_HOME, "config.json");
  let port = DEFAULT_DEV_PORT;
  try {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    if (Number.isInteger(config.port)) {
      port = config.port;
    }
  } catch {
    await writeFile(
      configPath,
      `${JSON.stringify({ port }, null, 2)}\n`,
      "utf8",
    );
  }
  return { SHALL_HOME: DEV_HOME, SHALL_DAEMON_PORT: String(port) };
}
