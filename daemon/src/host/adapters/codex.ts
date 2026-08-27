import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentAdapter, KitLayout } from "./adapter.js";
import {
  KIT_MARKER,
  generatedRoot,
  hookScripts,
  readKitFile,
  removeStaleSkills,
  skillFiles,
  wireDeclaredHooks,
  writeKit,
} from "../agent-kit.js";
import { writeAgentsMdBlock } from "../agents-md.js";

/**
 * CODEX, WIRED — the same prose, in the three places Codex reads.
 *
 * THE TREE IS COPIED AND NOT TRANSLATED. `agents/dist/codex` is already said in
 * Codex's own dialect — the seven commands are seven skills, the mention is the
 * frontmatter name, and nothing in it spells a Claude command — so this layout
 * transforms nothing. That is the point of generating per agent rather than
 * rewriting one agent's tree into another's: the rewrite happened at build
 * time, against a profile somebody wrote on purpose.
 *
 * THREE PLACES, BECAUSE CODEX HAS NO FOURTH. The skills go to `.agents/skills`,
 * which is the project's own skills root; the hook script goes under `.codex/`
 * and is wired from `.codex/hooks.json`; and the always-on half-page goes into
 * the project's `AGENTS.md`, which is the one file Codex reads before every
 * session. There is no `.claude/rules` equivalent and no per-path deny rule, so
 * the rules page has no home here and the ledger guard is a sentence in the
 * block rather than a permission — which is said outright in the prose, because
 * a guard that implied a mechanism would be a lie a session acts on.
 *
 * TWO OF THE FILES IT CARRIES ARE INPUTS AND NOT COPIES. `hooks/hooks.json` is
 * the wiring Codex would read if the tree were installed whole — the compile
 * hook after a write, and the guard before one — and it is merged into the
 * project's own hooks file instead of overwriting it;
 * `AGENTS.md.block` is the body of the managed span. Both are read by name and
 * neither is ever written into a project as a file of its own, which is why
 * `targetOf` refuses them.
 */

/** Where the skills land: the project's own skills root, one folder per skill. */
const SKILLS_ROOT = ".agents/skills";

/** Where the hook scripts land, and where their wiring is merged. */
const HOOKS_ROOT = ".codex/hooks/shall";
const HOOKS_FILE = ".codex/hooks.json";

/** The page that proves this project was wired for Codex by Shall. */
const DETECT_PAGE = `${SKILLS_ROOT}/shall-help/SKILL.md`;

export const codexLayout: KitLayout = {
  agent: "codex",
  embeddedPrefix: "kit/codex/",
  root: () => generatedRoot("codex"),

  async walk(root: string): Promise<string[]> {
    return [
      ...(await skillFiles(root)),
      ...(await hookScripts(root)),
      "hooks/hooks.json",
      "AGENTS.md.block",
    ];
  },

  targetOf(relative: string): string | null {
    const [folder, ...rest] = relative.split("/");
    if (folder === "skills" && rest.length > 1 && relative.endsWith(".md")) {
      return `${SKILLS_ROOT}/${rest.join("/")}`;
    }
    if (relative.startsWith("hooks/") && relative.endsWith(".mjs")) {
      return `${HOOKS_ROOT}/${relative.slice("hooks/".length)}`;
    }
    // The wiring and the block are inputs, and are read by name.
    return null;
  },

  // Nothing to say: the codex profile already said it at build time.
  transform: (text: string) => text,

  removeStale: (projectPath, written) =>
    removeStaleSkills(projectPath, written, SKILLS_ROOT),

  wireHooks: (projectPath) =>
    wireDeclaredHooks(codexLayout, path.join(projectPath, ...HOOKS_FILE.split("/"))),
};

/**
 * CODEX'S `wire` AND `refresh` ARE THE SAME ACT, and that is a fact about Codex
 * rather than an oversight. Nothing Shall writes for it is a merge into a file
 * whose other contents are a person's judgement — the hooks file is merged with
 * the same restraint Claude's settings file is, and the `AGENTS.md` block is
 * fenced — so there is no half of this that a daemon's start sweep should be
 * kept out of. The day Codex grows a permission layer, that is the day these
 * two stop being one line.
 */
async function writeCodexKit(projectPath: string): Promise<void> {
  const body = await readKitFile(codexLayout, "AGENTS.md.block").catch(
    () => null,
  );
  await Promise.all([
    writeKit(projectPath, codexLayout),
    body === null ? Promise.resolve() : writeAgentsMdBlock(projectPath, body),
  ]);
}

export const codexAdapter: AgentAdapter = {
  id: "codex",
  name: "Codex",

  async detect(projectPath: string): Promise<boolean> {
    const page = await readFile(
      path.join(projectPath, ...DETECT_PAGE.split("/")),
      "utf8",
    ).catch(() => "");
    return page.includes(KIT_MARKER);
  },

  refresh: writeCodexKit,
  wire: writeCodexKit,
};
