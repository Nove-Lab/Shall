/**
 * THE CLAUDE PROFILE: everything about Shall's prose that is true of Claude
 * Code and of no other agent.
 *
 * `agents/core` says the process. This file says how Claude spells it — which
 * tool asks a question, where a skill's file sits at runtime, what a
 * frontmatter key is called, which folder a command lands in. Nothing here
 * decides what a process does; nothing in core knows this file exists.
 *
 * IT IS THE FIRST PROFILE, NOT THE ONLY ONE. Every export below is the whole
 * of what a second profile has to answer, so a codex profile is this file's
 * sibling and core is untouched by its arrival.
 *
 * THE VALUES ARE LOAD-BEARING BYTES. `scripts/build-agents.mjs --parity`
 * existed to prove they reproduce the hand-written plugin exactly; a change to
 * one of these strings is a change to what every session reads.
 */

/** Where a Claude session finds the plugin's own folder at runtime. */
const PLUGIN_ROOT = "${CLAUDE_PLUGIN_ROOT}";

/**
 * The inline vocabulary: one core token, one Claude sentence.
 *
 * Lowercase inside the braces on purpose — the prose lint scans for
 * SCREAMING_SNAKE relation names, and a token it can read as one would be
 * reported as an invented relation in every file that used it.
 *
 * A profile that omits a token any core file uses is a hard error at build
 * time rather than a silent gap, so this map is complete by construction.
 */
export const vocabulary = {
  /** The slot a command's own argument text arrives in. */
  args: "$ARGUMENTS",

  /** Asking, at the head of a sentence and inside one. */
  Ask: "Ask with AskUserQuestion",
  ask: "ask with AskUserQuestion",

  /**
   * How the question tool behaves. The three process spines add a sentence of
   * their own after this one; `shall-raise` stops here, which is why the
   * shared value ends where it does.
   */
  "ask-mechanics":
    '**Ask in options.** Questions go through AskUserQuestion: at most four per round, 2–4 options each (a free-text "Other" is added for you), the option you recommend first with `(Recommended)` suffixed to its label, header label 12 characters or fewer.',

  /**
   * The ledger is the daemon's alone, and under Claude the refusal is
   * mechanical: a deny rule Shall writes into the project's settings. Two
   * spellings because the two sites say it at two depths — the skill states
   * the refusal, its layout reference names the rule.
   */
  "ledger-guard": "the project's `.claude/settings.json` denies the edit outright",
  "ledger-guard-layout":
    "the project's `.claude/settings.json` carries `Edit(/.shall/ledger/**)`, a deny rule Shall wrote there itself",

  /**
   * The read-only commands' mechanical half. A clause rather than a sentence:
   * the two entries that use it finish it in their own voice — one is a guide,
   * one is a survey — and core keeps both.
   */
  "no-write-guard": "The tools that write are refused for this command",

  /**
   * The plan before the code, in the work stretch. Claude's plan mode is the
   * same `/plan` a person types, and the agent can enter it itself; leaving it
   * is the user's approval, which is the one stop the stretch adds. Under
   * `--auto` there is nobody to approve, so the plan stays in the conversation.
   */
  "plan-tool":
    "Enter plan mode with EnterPlanMode — the same `/plan` a person would type — read the code, write the plan, and leave it with ExitPlanMode. The approval is the user's, and it is the one stop this stretch adds; a plan the user sends back is revised there, not argued with.",
  "plan-tool-auto":
    "do not enter plan mode — there is nobody to approve it. Write the plan out in your reply instead, in the same shape a plan file would have — the files, the functions, the order — as a message the person reads afterwards, and only then carry on",
};

/**
 * Step 1 of every entry, in two blocks.
 *
 * The head is the instruction, and the per-entry rationale that follows it
 * stays in core because it says why THAT command loads THOSE skills. The
 * fallback is the same instruction said again for a session where the
 * namespaced specifier is refused, and it is a block because it ends in a
 * list.
 *
 * One skill and two skills are different sentences, not a loop over a list:
 * "Load both … in this order" is not what one skill would say.
 */
export const blocks = {
  "load-skills": (names) =>
    names.length === 1
      ? `Load \`shall:${names[0]}\` with the Skill tool.`
      : `Load both with the Skill tool, in this order: \`shall:${names[0]}\`, then \`shall:${names[1]}\`.`,

  "load-skills-fallback": (names) =>
    names.length === 1
      ? [
          "If the namespaced specifier is refused, read the file directly instead and follow it the same way:",
          "",
          `- \`${PLUGIN_ROOT}/skills/${names[0]}/SKILL.md\``,
        ].join("\n")
      : [
          "If those namespaced specifiers are refused, read the two files directly instead and follow them the same way:",
          "",
          ...names.map((name) => `- \`${PLUGIN_ROOT}/skills/${name}/SKILL.md\``),
        ].join("\n"),
};

/**
 * What core's `tools:` word means in Claude's own two keys.
 *
 * Core names the shape of the permission — what a process needs to be able to
 * do — and this table is where that becomes a tool list. `readonly` carries a
 * disallow as well: refusing the writing tools outright is half of what the
 * survey and the guide promise in prose, and a list that merely omitted them
 * would leave the promise to the model's goodwill.
 */
const TOOL_SETS = {
  readonly: {
    allowed: "Bash(shall:*), Read, Skill",
    disallowed: "Write, Edit, MultiEdit, NotebookEdit",
  },
  spec: {
    allowed: "Bash(shall:*), Read, Glob, Grep, Write, Edit, AskUserQuestion, Skill",
  },
  "spec-and-git": {
    allowed:
      "Bash(shall:*), Bash(git:*), Read, Glob, Grep, Write, Edit, AskUserQuestion, Skill, EnterPlanMode, ExitPlanMode",
  },
};

/** A skill's `tools:` word, said the same way. */
const SKILL_TOOL_SETS = {
  "shall-cli": "Bash(shall:*)",
};

/**
 * An entry's frontmatter, in Claude's keys and Claude's order.
 *
 * `summary` does not come through: it is the catalog line, written for a table
 * of what Shall offers, and Claude's own frontmatter has no key for it.
 *
 * `disable-model-invocation` is on every entry and is not core's business.
 * These are processes a person starts; a model that could start one on its own
 * would be interviewing somebody who never asked to be interviewed.
 */
export function entryFrontmatter(fields, file) {
  const tools = TOOL_SETS[fields.tools];
  if (tools === undefined) {
    throw new Error(
      `${file}: tools: ${fields.tools} is not a permission shape the claude profile knows (${Object.keys(TOOL_SETS).join(", ")}).`,
    );
  }
  const lines = [
    `description: ${fields.description}`,
    `argument-hint: ${fields["argument-hint"]}`,
    "disable-model-invocation: true",
    `allowed-tools: ${tools.allowed}`,
  ];
  if (tools.disallowed !== undefined) {
    lines.push(`disallowed-tools: ${tools.disallowed}`);
  }
  return lines;
}

/**
 * A skill's frontmatter.
 *
 * `process: true` means the skill carries a process a command hands over to,
 * and Claude says that by refusing to let a user invoke it directly. Core
 * writes the key on every skill so a missing one is an author's oversight
 * rather than a default; `process: false` — the authoring skill, which any
 * session may reach for — emits no key at all, because absence is how Claude
 * spells the permissive case.
 */
export function skillFrontmatter(fields, file) {
  const allowed = SKILL_TOOL_SETS[fields.tools];
  if (allowed === undefined) {
    throw new Error(
      `${file}: tools: ${fields.tools} is not a skill tool set the claude profile knows (${Object.keys(SKILL_TOOL_SETS).join(", ")}).`,
    );
  }
  const lines = [
    `name: ${fields.name}`,
    `description: ${fields.description}`,
    `allowed-tools: ${allowed}`,
  ];
  if (fields.process === "true") {
    lines.push("user-invocable: false");
  }
  return lines;
}

/**
 * The invocation names, longest first, applied to every rendered file.
 *
 * Claude's plugin form IS the spelling core is written in, so this table is
 * empty and the pass over it is a no-op. It exists because the pass is not:
 * an agent whose commands are not `/shall:specify` renames them here, in one
 * table, and core never learns the difference.
 */
export const names = [];

/**
 * Where a core file lands under `agents/dist/claude`.
 *
 * An entry becomes a command — the plugin's whole reason for a `commands/`
 * folder — a skill keeps its own path, and the hook is script rather than
 * prose and is carried across as it is.
 */
export function targetOf(relative) {
  const [folder, ...rest] = relative.split("/");
  if (folder === "entries") {
    return `commands/${rest.join("/")}`;
  }
  return relative;
}

/**
 * What is copied byte for byte and never rendered: the manifest that makes
 * this a plugin, and the wiring that runs the compile hook. Both are Claude's
 * own file formats, so neither has anything to say to core.
 */
export const staticRoot = "static";
