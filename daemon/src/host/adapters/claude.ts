import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentAdapter } from "./adapter.js";
import { KIT_MARKER, writeAgentKit } from "../agent-kit.js";
import { writeAgentRules } from "../agent-rules.js";
import { writeAgentDenyRules } from "../agent-settings.js";

/**
 * CLAUDE CODE, WIRED — the adapter that is yesterday's whole behaviour, said in
 * the shape a second agent needed.
 *
 * THE PAGE THIS DETECTS ON IS A COMMAND AND NOT THE FOLDER. `.claude` exists in
 * projects Shall has never touched, and a folder is not a wiring; the help
 * command carrying Shall's own marker is a file Shall wrote and nobody else
 * would have. One file, marker-guarded, the same test the removal sweep uses to
 * decide what is Shall's.
 *
 * THE DENY RULES ARE IN `wire` AND NOT IN `refresh`, which is the split this
 * interface exists to keep: they are two entries merged into a person's
 * settings file, and a daemon that restarts does not get to reach into every
 * registered project's settings on its own account.
 */
export const claudeAdapter: AgentAdapter = {
  id: "claude",
  name: "Claude Code",

  async detect(projectPath: string): Promise<boolean> {
    const page = await readFile(
      path.join(projectPath, ".claude", "commands", "shall.help.md"),
      "utf8",
    ).catch(() => "");
    return page.includes(KIT_MARKER);
  },

  async refresh(projectPath: string): Promise<void> {
    await Promise.all([
      writeAgentRules(projectPath),
      writeAgentKit(projectPath),
    ]);
  },

  async wire(projectPath: string): Promise<void> {
    await Promise.all([
      writeAgentDenyRules(projectPath),
      claudeAdapter.refresh(projectPath),
    ]);
  },
};
