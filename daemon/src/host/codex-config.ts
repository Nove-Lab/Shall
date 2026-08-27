import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeByRename } from "./atomic-write.js";
import { getShallHome } from "./shall-home.js";

/**
 * THE TWO LINES THAT LET `shall` WORK FROM INSIDE CODEX'S SANDBOX, written into
 * the project's own `.codex/config.toml` when the project is wired for Codex.
 *
 * WHY THIS IS SHALL'S TO WRITE. Every `shall` call is a loopback connection to
 * the daemon, and every one of them reads and sometimes writes `~/.shall`;
 * Codex's `workspace-write` sandbox refuses both by default, and what a
 * person met was `shall status` failing inside every process with a sentence
 * about `rm ~/.shall/daemon.json`. A product that asks the person to go and
 * find two config keys has not made the folder a Shall project — `shall init`
 * has, and so it writes them.
 *
 * MERGED WITH THE HOOKS FILE'S RESTRAINT, over text rather than a parsed
 * document, because there is no TOML reader here and a config file is a
 * person's. A missing file is written whole; a file with no
 * `[sandbox_workspace_write]` table gains the table at its end; a table that
 * lacks a key gains the key on the line under its header; a key that is
 * already there is left exactly as the person wrote it, whatever it says — a
 * `network_access = false` somebody set is a decision, and the CLI's own
 * sentence says what to do when the daemon cannot be reached. A file this
 * cannot make sense of is left alone.
 *
 * IT NEVER THROWS, for the reason every kit writer does not.
 */

/** Where Codex reads a project's own configuration. */
export const CODEX_CONFIG_FILE = ".codex/config.toml";

const TABLE = "[sandbox_workspace_write]";

/** The two keys, and the line each is written as. */
function wantedLines(): { key: string; line: string }[] {
  const home = getShallHome().root;
  return [
    { key: "network_access", line: "network_access = true" },
    { key: "writable_roots", line: `writable_roots = [${JSON.stringify(home)}]` },
  ];
}

/** Whether a line sets this key, however it is spaced. */
function sets(line: string, key: string): boolean {
  return new RegExp(`^\\s*${key}\\s*=`).test(line);
}

/** The lines of one table: from its header to the line before the next header. */
function tableRange(lines: readonly string[], header: string): [number, number] | null {
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) {
    return null;
  }
  let end = lines.length;
  for (let at = start + 1; at < lines.length; at += 1) {
    if (/^\s*\[/.test(lines[at] ?? "")) {
      end = at;
      break;
    }
  }
  return [start, end];
}

/** The text as it should stand, or null when nothing has to change. */
export function withSandboxConfig(current: string | null): string | null {
  const wanted = wantedLines();
  if (current === null) {
    return `# Written by shall init: shall talks to its daemon over localhost and keeps its books under ~/.shall.\n${TABLE}\n${wanted.map((entry) => entry.line).join("\n")}\n`;
  }
  const lines = current.split("\n");
  const range = tableRange(lines, TABLE);
  if (range === null) {
    const tail = current.endsWith("\n") || current === "" ? "" : "\n";
    return `${current}${tail}${current.trim() === "" ? "" : "\n"}${TABLE}\n${wanted.map((entry) => entry.line).join("\n")}\n`;
  }
  const [start, end] = range;
  const inside = lines.slice(start + 1, end);
  const missing = wanted.filter((entry) => !inside.some((line) => sets(line, entry.key)));
  if (missing.length === 0) {
    return null;
  }
  lines.splice(start + 1, 0, ...missing.map((entry) => entry.line));
  return lines.join("\n");
}

export async function writeCodexSandboxConfig(projectPath: string): Promise<void> {
  try {
    const target = path.join(projectPath, ...CODEX_CONFIG_FILE.split("/"));
    const current = await readFile(target, "utf8").catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return null;
        }
        throw error;
      },
    );
    const wanted = withSandboxConfig(current);
    if (wanted !== null) {
      await writeByRename(target, wanted);
    }
  } catch {
    // Silence, deliberately: wiring is a convenience, not a condition.
  }
}
