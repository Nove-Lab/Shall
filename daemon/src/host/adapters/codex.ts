import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentAdapter, KitLayout } from "./adapter.js";
import {
  KIT_MARKER,
  generatedRoot,
  mergeHookEntry,
  readKitFile,
  removeStaleSkills,
  skillFiles,
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
 * the wiring Codex would read if the tree were installed whole, and it is
 * merged into the project's own hooks file instead of overwriting it;
 * `AGENTS.md.block` is the body of the managed span. Both are read by name and
 * neither is ever written into a project as a file of its own, which is why
 * `targetOf` refuses them.
 */

/** Where the skills land: the project's own skills root, one folder per skill. */
const SKILLS_ROOT = ".agents/skills";

/** Where the hook script lands, and where its wiring is merged. */
const HOOK_SCRIPT = ".codex/hooks/shall/check-spec.mjs";
const HOOKS_FILE = ".codex/hooks.json";

/** The page that proves this project was wired for Codex by Shall. */
const DETECT_PAGE = `${SKILLS_ROOT}/shall-help/SKILL.md`;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The one hook entry the generated tree declares, read out of the tree rather
 * than retyped here.
 *
 * THE PROFILE IS WHERE THE MATCHER LIVES. `apply_patch` is the tool name Codex
 * reports and the payload it carries is a patch rather than a path, which is a
 * fact about Codex that `profiles/codex/static/hooks/hooks.json` already
 * states; a copy of it in the daemon would be a second answer to keep in step.
 * Anything unreadable there answers null and the wiring is skipped in silence,
 * because a hook nobody could describe is not one to invent.
 */
async function declaredHook(): Promise<{
  matcher: string;
  command: string;
  timeout: number;
} | null> {
  const text = await readKitFile(codexLayout, "hooks/hooks.json").catch(
    () => null,
  );
  if (text === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (!isPlainObject(parsed) || !isPlainObject(parsed.hooks)) {
    return null;
  }
  const post = parsed.hooks.PostToolUse;
  const entry = Array.isArray(post) ? (post[0] as unknown) : null;
  if (!isPlainObject(entry) || typeof entry.matcher !== "string") {
    return null;
  }
  const hooks = entry.hooks;
  const first = Array.isArray(hooks) ? (hooks[0] as unknown) : null;
  if (!isPlainObject(first) || typeof first.command !== "string") {
    return null;
  }
  return {
    matcher: entry.matcher,
    command: first.command,
    timeout: typeof first.timeout === "number" ? first.timeout : 90,
  };
}

export const codexLayout: KitLayout = {
  agent: "codex",
  embeddedPrefix: "kit/codex/",
  root: () => generatedRoot("codex"),

  async walk(root: string): Promise<string[]> {
    return [
      ...(await skillFiles(root)),
      "hooks/check-spec.mjs",
      "hooks/hooks.json",
      "AGENTS.md.block",
    ];
  },

  targetOf(relative: string): string | null {
    const [folder, ...rest] = relative.split("/");
    if (folder === "skills" && rest.length > 1 && relative.endsWith(".md")) {
      return `${SKILLS_ROOT}/${rest.join("/")}`;
    }
    if (relative === "hooks/check-spec.mjs") {
      return HOOK_SCRIPT;
    }
    // The wiring and the block are inputs, and are read by name.
    return null;
  },

  // Nothing to say: the codex profile already said it at build time.
  transform: (text: string) => text,

  removeStale: (projectPath, written) =>
    removeStaleSkills(projectPath, written, SKILLS_ROOT),

  async wireHooks(projectPath: string): Promise<void> {
    const declared = await declaredHook();
    if (declared === null) {
      return;
    }
    await mergeHookEntry(
      path.join(projectPath, ...HOOKS_FILE.split("/")),
      declared.matcher,
      declared.command,
      declared.timeout,
    );
  },
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
