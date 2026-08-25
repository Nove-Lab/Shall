import assert from "node:assert/strict";
import { mkdir, readFile, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { KIT_MARKER, writeAgentKit } from "./agent-kit.js";

/**
 * The kit Shall writes into a project's `.claude` — the plugin said in the
 * project-command dialect.
 *
 * WHAT IS PINNED IS THE DIALECT AND THE OWNERSHIP. The commands arrive under
 * the `shall.` names with the colon namespace translated away, the skills
 * arrive whole and callable by their bare names, the compile hook is wired
 * into the settings file with the merge restraint the deny rules taught, and
 * nothing without the marker is ever Shall's to remove.
 */

async function newProject(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "shall-agent-kit-"));
}

function at(project: string, relative: string): string {
  return path.join(project, ...relative.split("/"));
}

describe("the agent kit", () => {
  test("a fresh project gets the commands, the skills and the hook, in the project dialect", async () => {
    const project = await newProject();
    await writeAgentKit(project);

    const command = await readFile(
      at(project, ".claude/commands/shall.specify.md"),
      "utf8",
    );
    // The frontmatter stays first; the marker sits under it.
    assert.ok(command.startsWith("---\n"), command.slice(0, 20));
    assert.ok(command.includes(KIT_MARKER));
    assert.ok(!command.includes("/shall:"), "colon namespace survived");
    assert.ok(!command.includes("${CLAUDE_PLUGIN_ROOT}"), "plugin root survived");

    const skill = await readFile(
      at(project, ".claude/skills/shall-specify/SKILL.md"),
      "utf8",
    );
    assert.ok(skill.startsWith("---\n"));
    assert.match(skill, /name: shall-specify/);
    assert.ok(skill.includes(KIT_MARKER));
    assert.ok(!skill.includes("shall:shall-"), "namespaced skill specifier survived");

    // A reference page rides along with its skill.
    const reference = await readFile(
      at(project, ".claude/skills/shall-work/references/develop.md"),
      "utf8",
    );
    assert.ok(reference.includes(KIT_MARKER));

    const hook = await readFile(
      at(project, ".claude/hooks/shall/check-spec.mjs"),
      "utf8",
    );
    assert.ok(hook.startsWith("#!"), hook.slice(0, 20));

    const settings = JSON.parse(
      await readFile(at(project, ".claude/settings.json"), "utf8"),
    ) as { hooks: { PostToolUse: { hooks: { command: string }[] }[] } };
    assert.match(
      settings.hooks.PostToolUse[0]?.hooks[0]?.command ?? "",
      /\$CLAUDE_PROJECT_DIR\/\.claude\/hooks\/shall\/check-spec\.mjs/,
    );
  });

  test("a second write changes nothing that already stands", async () => {
    const project = await newProject();
    await writeAgentKit(project);
    const target = at(project, ".claude/commands/shall.work.md");
    const before = await readFile(target, "utf8");
    const settingsBefore = await readFile(
      at(project, ".claude/settings.json"),
      "utf8",
    );

    await writeAgentKit(project);
    assert.equal(await readFile(target, "utf8"), before);
    assert.equal(
      await readFile(at(project, ".claude/settings.json"), "utf8"),
      settingsBefore,
    );
  });

  test("a stale kit file with the marker is removed, and a person's file is not", async () => {
    const project = await newProject();
    await writeAgentKit(project);
    const commands = at(project, ".claude/commands");
    await writeFile(
      path.join(commands, "shall.retired.md"),
      `---\n---\n${KIT_MARKER}\nAn old command.\n`,
    );
    await writeFile(
      path.join(commands, "shall.mine.md"),
      "My own command that happens to share the prefix.\n",
    );

    await writeAgentKit(project);
    await assert.rejects(
      readFile(path.join(commands, "shall.retired.md"), "utf8"),
    );
    assert.ok(await readFile(path.join(commands, "shall.mine.md"), "utf8"));
  });

  test("a settings file somebody edited keeps its shape, and gains only the hook", async () => {
    const project = await newProject();
    await mkdir(at(project, ".claude"), { recursive: true });
    await writeFile(
      at(project, ".claude/settings.json"),
      `${JSON.stringify({ permissions: { deny: ["Read(~/.shall/**)"] } }, null, 2)}\n`,
    );
    await writeAgentKit(project);
    const settings = JSON.parse(
      await readFile(at(project, ".claude/settings.json"), "utf8"),
    ) as Record<string, unknown>;
    assert.deepEqual(settings.permissions, { deny: ["Read(~/.shall/**)"] });
    assert.ok(Array.isArray((settings.hooks as { PostToolUse: unknown[] }).PostToolUse));
  });
});
