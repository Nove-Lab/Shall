/**
 * THE CODEX PROFILE: everything about Shall's prose that is true of the OpenAI
 * Codex CLI and of no other agent.
 *
 * `agents/core` says the process. This file says how Codex spells it — and
 * Codex spells almost none of it the way Claude does. There are no slash
 * commands, so a command is a skill; there is no `$ARGUMENTS`, so the user's
 * words are whatever the message says after the mention; there is no question
 * tool outside Plan mode, so a question is plain options and a turn that ends;
 * there is no per-skill tool list and no deny rule Shall writes, so the
 * read-only guard is carried by the sentence alone and the ledger guard by the
 * pre-tool hook Shall wires beside the compile hook.
 *
 * WHAT IT WAS MEASURED AGAINST. `docs/Codex_Terrain_Survey.md` is the ground,
 * and every shape below traces to a line in it: codex-cli 0.149.1, project
 * skills at `<project>/.agents/skills/<dir>/SKILL.md`, a skill named
 * `shall:help` loading and answering to `$shall:help`. A dot ends a mention and
 * a colon does not, which is why the seven names wear colons.
 *
 * WHERE IT DEPARTS, IT SAYS SO. `agents/README.md` asks that a value which is
 * not a plain translation carry a comment, because a reader has no other way to
 * tell a spelling from a decision. There are five here — `{{no-write-guard}}`,
 * the two ledger guards, core's `description` dropped for its `summary`, and
 * core's `tools` dropped altogether — and each one is a promise that used to be
 * kept by a permission layer and is now kept by a sentence.
 */

/** Where a Codex session finds a project's skills at runtime. */
const SKILLS_ROOT = ".agents/skills";

/**
 * The five skills a command hands over to.
 *
 * IN CODEX THEY ARE NOT SKILLS. Every `SKILL.md` under the skills root is
 * invocable and takes a line in the startup catalog, and core marks these five
 * `process: true` — a process a person does not start directly. Claude spells
 * that with `user-invocable: false`; Codex has no key for it, so the only way
 * to say it is to stop being a skill: the spine lands as `references/spine.md`
 * inside the folder of the command that hands over to it, and the command's own
 * step 1 sends the reader there. `shall-authoring` is core's one `process:
 * false` skill and stays a skill here, found by its description the way any
 * library skill is.
 */
const HANDED_OVER_TO = new Set([
  "shall-specify",
  "shall-plan",
  "shall-work",
  "shall-raise",
  "shall-help",
]);

/**
 * The order the commands are said in — the order a person meets them, which is
 * the README's and not the alphabetical order core is walked in. It is the
 * table of contents of the always-on block below, so an entry core has and this
 * list does not is a command a session would never hear of; `extras` refuses to
 * assemble the block in that case rather than quietly dropping the row.
 */
const COMMAND_ORDER = [
  "specify.md",
  "plan.md",
  "work.md",
  "work.todo.md",
  "work.report.md",
  "raise.md",
  "help.md",
];

/**
 * A command's mention, worked out from the core file's own name: `work.todo.md`
 * is `$shall:work:todo`. Codex reads a dot as the end of a mention and a colon
 * as part of one, so the dots core writes become colons here and nowhere else.
 */
function mentionOf(fileName) {
  return `shall:${fileName.replace(/\.md$/, "").split(".").join(":")}`;
}

/** The folder a skill of that name lives in: a directory carries no colon. */
function folderOf(name) {
  return name.split(":").join("-");
}

/** The file that carries a skill's process — a spine for the five, the skill itself for a library. */
function pageOf(skill) {
  return HANDED_OVER_TO.has(skill)
    ? `${SKILLS_ROOT}/${skill}/references/spine.md`
    : `${SKILLS_ROOT}/${skill}/SKILL.md`;
}

/**
 * A frontmatter value, quoted.
 *
 * Both keys are quoted because both can carry a colon: a name IS a colon
 * (`shall:work:todo`), and a description says `Use as:` before the mention. A
 * plain YAML scalar that contains a colon and a space is a mapping, and the
 * probe that measured a colon-named skill loading quoted its name for exactly
 * that reason.
 */
function quoted(value) {
  return `"${value.split("\\").join("\\\\").split('"').join('\\"')}"`;
}

/**
 * The inline vocabulary: one core token, one Codex sentence.
 *
 * A value is a string, or a function of the file being rendered when the answer
 * is not the same everywhere — `{{args}}` names the mention that carried the
 * request, and only the file knows which command that is.
 */
export const vocabulary = {
  /**
   * The slot a command's own argument text arrives in.
   *
   * CODEX HAS NO SLOT. There is no `$ARGUMENTS` and no expansion machinery of
   * any kind: a skill is invoked by a `$name` mention inside an ordinary
   * message, and the request is whatever that message goes on to say. So the
   * value is a sentence rather than a token, and it names the mention this
   * entry is invoked by — the whole point of the slot is that the process reads
   * the user's own words, and a sentence that pointed at "the message" without
   * saying which mention would leave a session guessing which words are the
   * request.
   */
  args: ({ file }) => {
    if (!file.startsWith("entries/")) {
      throw new Error(
        `${file}: {{args}} is an entry's slot, and this file is not an entry — the codex profile has no mention to point at from here.`,
      );
    }
    return `Everything after the \`$${mentionOf(file.split("/").pop())}\` mention in the message that invoked this skill — those words verbatim, and nothing inferred beyond them.`;
  },

  /** Asking, at the head of a sentence and inside one. */
  Ask: "Put the choice to the user as plain options and end your turn",
  ask: "put the choice to the user as plain options and end your turn",

  /**
   * How a question behaves. The three process spines add a sentence of their
   * own after this one; `shall-raise` stops here, which is why the shared value
   * ends where it does.
   *
   * There is a question tool in Codex — `request_user_input` — and it answers
   * only in Plan mode, so naming it would send a session reaching for something
   * that is not there in the mode these processes run in. The measured idiom is
   * the one written here: the options in the message, and the turn ended on
   * them.
   */
  "ask-mechanics":
    "**Ask in options, and end the turn on the question.** There is no question tool here: a question is plain text at the end of your message. Ask one question, number its options, put the one you recommend first with `(Recommended)` suffixed to its label — then stop and wait, because the user's next message is the answer. Never answer the question yourself, and never carry on past one you asked.",

  /**
   * The ledger is the daemon's alone. Under Claude the refusal is a deny rule
   * in the project's settings; under Codex it is the `PreToolUse` hook Shall
   * wires from `hooks/hooks.json` — `guard-paths.mjs`, which exits 2 on a
   * write, a patch or a shell line under the folder. A hook is a wall only
   * while it runs, so the sentence still says the rule outright. Two spellings
   * because the two sites say it at two depths.
   */
  "ledger-guard":
    "a hook in `.codex/hooks.json` refuses the write before it happens, and the rule holds where the hook does not reach: NEVER write, create or repair anything under `.shall/ledger/**`",
  "ledger-guard-layout":
    "a pre-tool hook Shall wired refuses a write, a patch or a shell line that touches `.shall/ledger/**`, and the rule is yours to keep wherever a hook is not running",

  /**
   * The read-only commands' other half. DEPARTURE: Claude refuses the writing
   * tools outright in the command's own frontmatter, and Codex frontmatter
   * takes a name and a description and nothing else — there is no tool list to
   * write and no permission layer underneath it. So the clause core wrote for a
   * mechanism now says who the mechanism is. A clause rather than a sentence:
   * the two entries that use it finish it in their own voice — one is a guide,
   * one is a survey — and core keeps both.
   */
  "no-write-guard":
    "Nothing here refuses a writing tool for you, so this refusal is yours to keep and you keep it absolutely — this command writes nothing at all, not a node, not a scratch file, not a note",
};

/**
 * Step 1 of every entry.
 *
 * A Codex skill has no way to load another skill, so "load" is "read the file":
 * the path is project-relative, which is what a session standing in the project
 * root can act on without knowing where the kit was installed from. The
 * per-entry rationale that follows the block stays in core, because it says why
 * THAT command reads THOSE files.
 *
 * THE FALLBACK RENDERS NOTHING. It exists for a Claude session that refuses the
 * namespaced skill specifier; here the instruction was a file path to begin
 * with, so a second way of saying it would be the same sentence twice. The
 * generator takes the blank paragraph with it.
 */
export const blocks = {
  "load-skills": (names) =>
    names.length === 1
      ? `Read \`${pageOf(names[0])}\` and follow it.`
      : `Read both files and follow them, in this order: \`${pageOf(names[0])}\`, then \`${pageOf(names[1])}\`.`,

  "load-skills-fallback": () => "",
};

/**
 * An entry's frontmatter, in the only two keys Codex reads.
 *
 * `description` IS THE CATALOG AND THE TRIGGER AT ONCE. Codex loads every
 * skill's name and description at startup, against a context budget of about
 * two percent, and matches the same sentence when it decides a skill applies to
 * what the user just asked. So the value is core's `summary` — the one line
 * written to be read in a table — plus the invocation, spelled out with core's
 * own argument hint so a person reading the catalog can type the command.
 *
 * DEPARTURE, TWICE OVER. Core's `description` does not come through: it is a
 * paragraph, written for a slash command's own help, and seven of those in a
 * startup catalog would spend the budget on prose nobody asked for. Core's
 * `tools` does not come through either — Codex has no per-skill tool list, so
 * the permission shape core names is spelled nowhere in this tree, and what the
 * read-only commands promise is carried by `{{no-write-guard}}` in their bodies
 * instead.
 */
export function entryFrontmatter(fields, file) {
  const name = mentionOf(file.split("/").pop());
  const hint = fields["argument-hint"];
  return [
    `name: ${quoted(name)}`,
    `description: ${quoted(`${fields.summary} Use as: $${name} ${hint}.`)}`,
  ];
}

/**
 * A skill's frontmatter, or none at all.
 *
 * The five skills a command hands over to are not skills in this dialect —
 * their page is a reference file, and a reference file carries no frontmatter —
 * so this answers `null` for them and the generator writes the body alone. The
 * one skill that stays a skill is the library one, and its description is the
 * first sentence of core's, which is the sentence that says when to reach for
 * it; what follows that sentence is a table of contents the catalog does not
 * need.
 *
 * The two halves check each other: a skill core marks `process: true` that this
 * profile has not routed to a spine would land as a `SKILL.md` with no
 * frontmatter, so it is refused here by name rather than shipped.
 */
export function skillFrontmatter(fields, file) {
  const skill = file.split("/")[1];
  if (HANDED_OVER_TO.has(skill)) {
    if (fields.process !== "true") {
      throw new Error(
        `${file}: the codex profile sends this skill's page to references/spine.md, and core does not mark it process: true — one of the two is wrong.`,
      );
    }
    return null;
  }
  if (fields.process === "true") {
    throw new Error(
      `${file}: core marks it process: true, and Codex has no way to say a skill is not user-invocable — add ${skill} to HANDED_OVER_TO so its page becomes a spine, or the catalog offers a process nobody should start.`,
    );
  }
  const [sentence] = fields.description.split(". ");
  return [
    `name: ${quoted(fields.name)}`,
    `description: ${quoted(`${sentence.replace(/\.$/, "")}.`)}`,
  ];
}

/**
 * The invocation names, longest source first, applied to every rendered file.
 *
 * A dot ends a mention in Codex, so `/shall:work.todo` cannot survive as it is
 * written: the whole name is spelled in colons and reached with `$`. The bare
 * `shall-authoring` core writes for the library skill needs no row — it is
 * already the name Codex knows it by.
 */
export const names = [
  ["/shall:work.todo", "$shall:work:todo"],
  ["/shall:work.report", "$shall:work:report"],
  ["/shall:specify", "$shall:specify"],
  ["/shall:plan", "$shall:plan"],
  ["/shall:work", "$shall:work"],
  ["/shall:raise", "$shall:raise"],
  ["/shall:help", "$shall:help"],
];

/**
 * Where a core file lands under `agents/dist/codex`.
 *
 * EVERYTHING IS A SKILL FOLDER, because a skill folder is the only shape Codex
 * loads. An entry becomes the `SKILL.md` of a folder named after its own
 * mention — `shall:work:todo` in `skills/shall-work-todo/` — and the spine of
 * the process it hands over to becomes `references/spine.md` under the folder
 * of the command that carries it. `shall-work` is one spine and three commands:
 * the folder that keeps the references is `shall-work`, and `shall-work-todo`
 * and `shall-work-report` are entries alone whose step 1 points back into it.
 */
export function targetOf(relative) {
  const [folder, ...rest] = relative.split("/");
  if (folder === "entries") {
    return `skills/${folderOf(mentionOf(rest.join("/")))}/SKILL.md`;
  }
  if (folder === "skills" && rest.length === 2 && rest[1] === "SKILL.md" && HANDED_OVER_TO.has(rest[0])) {
    return `skills/${rest[0]}/references/spine.md`;
  }
  return relative;
}

/**
 * The links the move broke, mended.
 *
 * IT IS MECHANICAL AND IT IS SCOPED TO THE TREES THAT MOVED. A spine that has
 * come down into `references/` reaches its own pages as siblings rather than
 * through the folder it is now inside, and those pages reach back at a file
 * that is no longer above them. Nothing else is touched: `shall-authoring` did
 * not move, and a path written in prose — `shall-authoring/references/
 * relations.md` — is a sentence about a file rather than a link to one.
 *
 * A form neither pattern covers is not silently left alone: `lint-agents.mjs`
 * resolves every relative link in the generated tree, so a link this pass
 * missed is a broken path with a file and a line number on it.
 */
const SPINE_LINK = /\[(`?)references\/([A-Za-z0-9._-]+\.md)\1\]\(references\/\2\)/g;

export function rewrite(text, relative) {
  const [folder, skill, ...rest] = relative.split("/");
  if (folder !== "skills" || !HANDED_OVER_TO.has(skill)) {
    return text;
  }
  if (rest.length === 1 && rest[0] === "SKILL.md") {
    return text.replace(SPINE_LINK, "[$1$2$1](./$2)");
  }
  return text
    .split("[`../SKILL.md`](../SKILL.md)")
    .join("[`./spine.md`](./spine.md)")
    .split("[../SKILL.md](../SKILL.md)")
    .join("[./spine.md](./spine.md)");
}

/**
 * The always-on block, assembled from what the entries declare.
 *
 * Codex has no rules file and no managed-block convention: `AGENTS.md` is the
 * one document loaded into every session, root to cwd, against a 32KiB budget
 * shared with whatever the project itself put there. So this is a block rather
 * than a file — the daemon owns where it goes and the fences around it — and it
 * is short on purpose: seven rows, two rules, and the way in. It says what a
 * session cannot work out for itself, which is that these commands exist; the
 * processes are read when one is invoked, and none of them is summarised here.
 *
 * No marker and no version line. The daemon writes those at insertion time, the
 * same way it does for every other kit file, and a generated tree that carried
 * them would carry a version that is only true until the next release.
 */
export function extras(entries) {
  const byFile = new Map(entries.map((entry) => [entry.file.split("/").pop(), entry.fields]));
  const rows = COMMAND_ORDER.map((fileName) => {
    const fields = byFile.get(fileName);
    if (fields === undefined) {
      throw new Error(
        `agents/core/entries/${fileName} is in the codex profile's COMMAND_ORDER and not in core — remove the row, or the block promises a command that does not exist.`,
      );
    }
    const name = mentionOf(fileName);
    // A hint that offers a choice writes it with a pipe — `[--auto | --dry]` —
    // and a pipe is what ends a cell, code span or no code span.
    const hint = fields["argument-hint"].split("|").join("\\|");
    return `| \`$${name} ${hint}\` | ${fields.summary} |`;
  });
  for (const fileName of byFile.keys()) {
    if (!COMMAND_ORDER.includes(fileName)) {
      throw new Error(
        `agents/core/entries/${fileName} is a command the codex profile's COMMAND_ORDER does not list, so the always-on block would never mention it. Add it in the order a person meets it.`,
      );
    }
  }
  return {
    "AGENTS.md.block": [
      "## Shall",
      "",
      "Shall keeps this project's specification as a graph of markdown files — one file per node, from goals down to acceptance criteria, modules, work items and the journals of work done — and asks a person to approve every one of them in the browser. Agents run the processes that write those files and a person judges them in the Review Queue, so nothing here is built on a node nobody has approved.",
      "",
      "| Invoke | What it does |",
      "|---|---|",
      ...rows,
      "",
      `A spec node file is written the way \`$shall-authoring\` says — the folder, the id, the frontmatter, the relation lines, and what to do when \`shall check\` refuses one. Read that skill before writing under \`.shall/spec\`, whichever process asked for the file.`,
      "",
      "Two rules hold outside every one of those processes. **Never delete a spec file**: a deletion is proposed in the file's own frontmatter and the file stays where it is, because taking a node out of the graph takes the decision away from the person whose decision it is. **Never write anything under `.shall/ledger/`**: those books are the daemon's, they are what green means, and a ledger an agent edited is a judgment forged rather than a file fixed.",
      "",
      "Run `shall` to open the app; `shall status --json`, `shall board --json` and `shall check` read the project.",
      "",
    ].join("\n"),
  };
}

/**
 * Words that must never reach this tree — another dialect's, or this one's own
 * name said the way the other agent spells it. Each is a rendering that would
 * pass every other check and then fail in a session: an agent reading
 * `$ARGUMENTS` looks for a slot that does not exist, and one told to run
 * `/shall:plan` types a slash command Codex removed in March.
 */
export const forbidden = [
  ["$ARGUMENTS", "Codex has no argument slot — the request is the words after the mention."],
  ["CLAUDE_PLUGIN_ROOT", "that is Claude's runtime path; a Codex skill is read from the project's own skills folder."],
  ["AskUserQuestion", "that is Claude's question tool; a question here is plain options and a turn that ends."],
  ["/shall:", "Codex has no slash commands — a command is a `$shall:…` mention."],
  ["/shall.", "that is the project-command dialect Claude's kit writes; a command here is a `$shall:…` mention."],
];

/**
 * What is copied byte for byte and never rendered: the hook wiring, which is
 * Codex's own file format and has nothing to say to core. There is no manifest
 * beside it — a Codex project has no plugin to declare, only folders it reads.
 */
export const staticRoot = "static";
