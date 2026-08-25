import assert from "node:assert/strict";
import {
  mkdir,
  readdir,
  readFile,
  mkdtemp,
  stat,
  writeFile,
} from "node:fs/promises";
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

/** A generated file of an older kit, marker and all. */
function marked(body: string): string {
  return `${KIT_MARKER}\n\n${body}\n`;
}

async function exists(target: string): Promise<boolean> {
  return stat(target).then(
    () => true,
    () => false,
  );
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

  test("only the `.md` files under the commands folder are Shall's to remove", async () => {
    const project = await newProject();
    await writeAgentKit(project);
    const commands = at(project, ".claude/commands");
    // The marker is the ownership test and the extension is the second half of
    // it: a note somebody kept beside their commands is not a command.
    await writeFile(path.join(commands, "shall.notes.txt"), marked("A note."));
    await writeFile(path.join(commands, "notes.md"), marked("Not Shall's."));

    await writeAgentKit(project);
    assert.ok(await exists(path.join(commands, "shall.notes.txt")));
    assert.ok(await exists(path.join(commands, "notes.md")));
  });

  test("a directory wearing a kit file's name is left where it is", async () => {
    const project = await newProject();
    await writeAgentKit(project);
    const stray = at(project, ".claude/commands/shall.folder.md");
    await mkdir(stray, { recursive: true });

    await writeAgentKit(project);
    // Nothing can be read out of it, so nothing proves it is Shall's.
    assert.ok(await exists(stray));
  });
});

describe("the folder an earlier layout wrote", () => {
  test("gives up its marked files and stays for what is left", async () => {
    const project = await newProject();
    await writeAgentKit(project);
    const older = at(project, ".claude/commands/shall");
    await mkdir(older, { recursive: true });
    await writeFile(path.join(older, "specify.md"), marked("An old command."));
    await writeFile(path.join(older, "mine.md"), "My own notes.\n");
    // A folder inside it proves nothing about who owns it, and unreadable is
    // not the same answer as unmarked.
    await mkdir(path.join(older, "notes"), { recursive: true });

    await writeAgentKit(project);
    assert.deepEqual((await readdir(older)).sort(), ["mine.md", "notes"]);
  });

  test("goes with the last of them when it holds nothing else", async () => {
    const project = await newProject();
    await writeAgentKit(project);
    const older = at(project, ".claude/commands/shall");
    await mkdir(older, { recursive: true });
    await writeFile(path.join(older, "specify.md"), marked("An old command."));
    await writeFile(path.join(older, "work.md"), marked("Another."));

    await writeAgentKit(project);
    assert.equal(await exists(older), false);
  });

  test("is not a folder at all when somebody's file wears the name", async () => {
    const project = await newProject();
    await writeAgentKit(project);
    const named = at(project, ".claude/commands/shall");
    await writeFile(named, "Not a folder, and not Shall's.\n");

    await writeAgentKit(project);
    assert.equal(await readFile(named, "utf8"), "Not a folder, and not Shall's.\n");
  });
});

describe("the skills an older kit left behind", () => {
  test("a marked one goes, and every other kind stays", async () => {
    const project = await newProject();
    await writeAgentKit(project);
    const skills = at(project, ".claude/skills");
    const write = async (skill: string, page: string | null): Promise<void> => {
      await mkdir(path.join(skills, skill), { recursive: true });
      if (page !== null) {
        await writeFile(path.join(skills, skill, "SKILL.md"), page);
      }
    };
    await write("shall-retired", marked("An old skill."));
    await write("shall-mine", "My own skill that shares the prefix.\n");
    await write("shall-empty", null);
    await write("mine", marked("Marked, and still not Shall's to name."));

    await writeAgentKit(project);
    assert.equal(await exists(path.join(skills, "shall-retired")), false);
    assert.ok(await exists(path.join(skills, "shall-mine", "SKILL.md")));
    assert.ok(await exists(path.join(skills, "shall-empty")));
    assert.ok(await exists(path.join(skills, "mine", "SKILL.md")));
    // The six the kit just wrote are its own, and are not stale.
    assert.ok(await exists(path.join(skills, "shall-specify", "SKILL.md")));
  });
});

describe("the hook wiring", () => {
  const settingsOf = (project: string): string =>
    at(project, ".claude/settings.json");

  async function withSettings(text: string): Promise<string> {
    const project = await newProject();
    await mkdir(at(project, ".claude"), { recursive: true });
    await writeFile(settingsOf(project), text, "utf8");
    return project;
  }

  test("a settings file Shall cannot make sense of is left exactly as it is", async () => {
    for (const original of [
      "// a comment JSONC allows and JSON.parse does not\n{}",
      "null",
      "5",
      '["not an object at all"]',
      '{"hooks":[]}',
      '{"hooks":{"PostToolUse":{}}}',
    ]) {
      const project = await withSettings(original);
      await writeAgentKit(project);
      // Shall does not get to decide what somebody else's shape meant.
      assert.equal(await readFile(settingsOf(project), "utf8"), original, original);
      // And the rest of the kit still arrived.
      assert.ok(await exists(at(project, ".claude/commands/shall.specify.md")));
    }
  });

  test("a hook entry already written by hand is not written a second time", async () => {
    const project = await withSettings(
      `${JSON.stringify(
        {
          hooks: {
            PostToolUse: [
              {
                matcher: "Write",
                hooks: [
                  {
                    type: "command",
                    command:
                      'node "$CLAUDE_PROJECT_DIR/.claude/hooks/shall/check-spec.mjs" --quiet',
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
    );
    const before = await readFile(settingsOf(project), "utf8");

    await writeAgentKit(project);
    // The person's own matcher and flags are the wiring; a second entry would
    // run the compile twice on every write.
    assert.equal(await readFile(settingsOf(project), "utf8"), before);
  });

  test("a settings file that cannot be read is silence, not a failure", async () => {
    const project = await newProject();
    await mkdir(at(project, ".claude/settings.json"), { recursive: true });

    await writeAgentKit(project);
    // The kit is written before the wiring is attempted, so the commands are
    // there and the unreadable path is untouched.
    assert.ok(await exists(at(project, ".claude/commands/shall.specify.md")));
    assert.ok((await stat(at(project, ".claude/settings.json"))).isDirectory());
  });

  test("a project folder that cannot hold a kit is silence too", async () => {
    const folder = await newProject();
    const file = path.join(folder, "project");
    await writeFile(file, "not a folder\n", "utf8");

    // Wiring is an open-time convenience, not a condition of opening.
    await writeAgentKit(file);
    assert.equal(await readFile(file, "utf8"), "not a folder\n");
  });
});
