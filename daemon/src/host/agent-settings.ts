import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * The two lines Shall writes into somebody else's agent configuration, so that
 * an agent working in a project checkout is told which doors are not its own.
 *
 * The first keeps `~/.shall/**` — Shall's own home: the registry, the config,
 * the daemon's state, the reference templates — out of an agent's reading.
 * Agents work under the FILE CONTRACT: they read and write `.shall/spec`
 * markdown and talk to no daemon. Nothing up there is a secret any more, and
 * the rule stays anyway, because that home is Shall's and not the project's.
 *
 * The second keeps the ledger folder out of an agent's pen. Its three files —
 * approvals, rejections, acceptances — are the only things under `.shall` that
 * are nobody's authorship: the daemon writes them when a person approves,
 * refuses or closes, and they are the whole of what makes green, a standing red
 * and a closed criterion states only a person can put a node into. AN AGENT MAY
 * READ THEM — the ledgers are committed beside the spec, and knowing what is
 * already judged, and why, is useful — and it may not write them. `Edit(...)` is the rule that says exactly that: it covers every
 * built-in tool that edits a file, the Write tool included, so it covers making
 * the file out of nothing too, and a rule path beginning with a single `/` is
 * read against the project's root rather than the filesystem's.
 *
 * THIS IS CONVENTION DEFENCE, NOT A SANDBOX. Nothing here enforces anything: an
 * agent that ignores the file — a different tool, a patched one, a shell
 * command that writes the path directly — writes the ledger anyway. The user
 * spec says so in its own words: 관례 방어만.
 *
 * It is worth writing because it makes the boundary LEGIBLE: a person reading
 * their own settings file can see which paths Shall considers off-limits, and
 * which way round — one may not be read, the other may not be written — which
 * is the part a silent convention never gets to say.
 *
 * Only the Claude adapter exists today. Agents with no deny mechanism at all are
 * simply not covered, and this module does not pretend otherwise.
 */
export const AGENT_DENY_RULES = [
  "Read(~/.shall/**)",
  "Edit(/.shall/ledger/**)",
] as const;

function getAgentSettingsPath(projectPath: string): string {
  return path.join(projectPath, ".claude", "settings.json");
}

/**
 * A name no other write is using, which the pid alone is not: a pid is constant
 * for the life of a process, so two opens of one project inside one daemon would
 * pick the same temporary name and one would truncate the other's bytes. The pid
 * says WHO left a stray file behind, the random tail says which write.
 */
function temporaryName(target: string): string {
  return `${target}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
}

/**
 * Written beside the target and moved onto it, so an agent starting up never
 * reads half a settings file, and swept up if the write fails so a crash leaves
 * no litter in somebody's `.claude` folder.
 */
async function writeByRename(target: string, text: string): Promise<void> {
  const temporary = temporaryName(target);
  try {
    await writeFile(temporary, text, "utf8");
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** Two-space JSON with a trailing newline — what an editor and `git` expect. */
function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * An object with keys, and neither `null` nor an array — the shape a settings
 * block has to have before anything may be merged into it.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Writes or merges the deny rules into `<project>/.claude/settings.json`.
 *
 * IT NEVER THROWS. This is an open-time convenience and not a condition of
 * opening a project: a read-only checkout, a settings file somebody is mid-edit
 * on, a `.claude` folder owned by another user — every one of them ends as
 * silence, because none of them is a reason a person cannot open their project.
 * The file is somebody else's, and Shall's whole claim on it is two array
 * entries:
 *
 * - No file at all: `.claude` is made and a settings file holding only the
 *   rules is written.
 * - Unparseable: NOTHING HAPPENS. A JSONC file with comments in it, or a
 *   half-finished edit, is still somebody's work, and a rewrite would eat it.
 * - Wrong shape (`permissions` not an object, `deny` not an array): nothing
 *   happens either. Shall does not get to decide what those mean.
 * - Every rule already present: NOT REWRITTEN. An open that reformats a file on
 *   every click is a diff nobody asked for; the mtime stays quiet.
 * - Otherwise ONLY THE MISSING RULES are appended to the END of `deny`, in the
 *   order `AGENT_DENY_RULES` lists them, and every other key stays exactly
 *   where it was — `JSON.parse`/`stringify` preserve insertion order for string
 *   keys, and assigning to a key that already exists does not move it, so this
 *   leans on the language rather than on a rewriter. A settings file an older
 *   Shall wrote therefore gains the second rule and keeps the first one where
 *   it stands. The one-time reformat of the file's spacing is the price, paid
 *   exactly once, on the open that actually adds a rule.
 */
export async function writeAgentDenyRules(projectPath: string): Promise<void> {
  try {
    const settingsPath = getAgentSettingsPath(projectPath);

    // Only a missing file means "write a fresh one". Any other read failure is
    // a file that is there and cannot be read, and writing over it would be a
    // clobber rather than a merge.
    const current = await readFile(settingsPath, "utf8").catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return null;
        }
        throw error;
      },
    );

    if (current === null) {
      await mkdir(path.dirname(settingsPath), { recursive: true });
      await writeByRename(
        settingsPath,
        serialize({ permissions: { deny: [...AGENT_DENY_RULES] } }),
      );
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(current) as unknown;
    } catch {
      return;
    }
    if (!isPlainObject(parsed)) {
      return;
    }

    const permissions = parsed.permissions;
    if (permissions !== undefined && !isPlainObject(permissions)) {
      return;
    }
    const block: Record<string, unknown> = permissions ?? {};

    const deny = block.deny;
    if (deny !== undefined && !Array.isArray(deny)) {
      return;
    }
    const rules: unknown[] = deny ?? [];
    const missing = AGENT_DENY_RULES.filter((rule) => !rules.includes(rule));
    if (missing.length === 0) {
      return;
    }

    // Whatever else is in that list stays in it, junk included. This module
    // polices exactly two entries: its own.
    block.deny = [...rules, ...missing];
    parsed.permissions = block;
    await writeByRename(settingsPath, serialize(parsed));
  } catch {
    // Silence, deliberately: see above.
  }
}
