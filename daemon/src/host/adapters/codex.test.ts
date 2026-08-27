import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { SHALL_VERSION } from "@shall/core/version";
import { KIT_MARKER, generatedRoot } from "../agent-kit.js";
import { AGENTS_MD_BEGIN, AGENTS_MD_END } from "../agents-md.js";
import { codexAdapter } from "./codex.js";

/**
 * THE KIT A CODEX PROJECT GETS — the same generated prose as Claude's, in the
 * three places Codex reads and in none of Claude's.
 *
 * WHAT IS PINNED IS THE LANDING, THE OWNERSHIP AND THE RESTRAINT. The skills
 * arrive under the project's own skills root and carry the marker and the
 * version under their frontmatter; the hook arrives as script and byte for
 * byte; the hooks file is merged into with exactly the care the deny rules
 * taught, and the `AGENTS.md` block is fenced. Nothing without the marker is
 * ever Shall's to remove, and a Codex project never grows a `.claude`.
 */

const KIT_VERSION_LINE = `<!-- Version: ${SHALL_VERSION} -->`;

async function newProject(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "shall-codex-kit-"));
}

function at(project: string, relative: string): string {
  return path.join(project, ...relative.split("/"));
}

async function exists(target: string): Promise<boolean> {
  return stat(target).then(
    () => true,
    () => false,
  );
}

const HOOKS_FILE = ".codex/hooks.json";

describe("the codex kit", () => {
  test("a fresh project gets the skills, the hook script and the wiring", async () => {
    const project = await newProject();
    await codexAdapter.wire(project);

    const skill = await readFile(
      at(project, ".agents/skills/shall-help/SKILL.md"),
      "utf8",
    );
    // The frontmatter stays first — it is what names the skill to Codex — and
    // the stamp sits directly under it.
    assert.ok(skill.startsWith("---\n"), skill.slice(0, 20));
    assert.match(skill, /name: "shall:help"/);
    assert.ok(skill.includes(`${KIT_MARKER}\n${KIT_VERSION_LINE}\n`));
    // Nothing rewrites this tree: the codex profile already said it in Codex's
    // own dialect at build time.
    assert.ok(!skill.includes("/shall."), "a Claude command survived");

    // A reference page rides along with its skill.
    const reference = await readFile(
      at(project, ".agents/skills/shall-help/references/spine.md"),
      "utf8",
    );
    assert.ok(reference.includes(`${KIT_MARKER}\n${KIT_VERSION_LINE}\n`));

    // The hook is script and not prose, so it arrives exactly as generated: an
    // HTML comment at the top of it would be a syntax error to node.
    const hook = await readFile(
      at(project, ".codex/hooks/shall/check-spec.mjs"),
      "utf8",
    );
    assert.equal(
      hook,
      await readFile(
        path.join(generatedRoot("codex"), "hooks", "check-spec.mjs"),
        "utf8",
      ),
    );
    assert.ok(!hook.includes(KIT_MARKER));

    const hooks = JSON.parse(
      await readFile(at(project, HOOKS_FILE), "utf8"),
    ) as {
      hooks: {
        PreToolUse: { matcher: string; hooks: { command: string }[] }[];
        PostToolUse: { matcher: string; hooks: unknown[] }[];
      };
    };
    // `apply_patch` is the tool name Codex reports; the matcher is read out of
    // the generated tree rather than retyped in the daemon.
    assert.equal(hooks.hooks.PostToolUse[0]?.matcher, "apply_patch|Edit|Write");
    // The guard fires before a tool — the wall the prose used to be alone in.
    assert.equal(hooks.hooks.PreToolUse[0]?.matcher, "Bash|apply_patch|Edit|Write");
    assert.equal(
      hooks.hooks.PreToolUse[0]?.hooks[0]?.command,
      "node .codex/hooks/shall/guard-paths.mjs",
    );
    assert.ok(await exists(at(project, ".codex/hooks/shall/guard-paths.mjs")));
  });

  test("every generated page says which Shall wrote it, once", async () => {
    const project = await newProject();
    await codexAdapter.wire(project);

    const skills = at(project, ".agents/skills");
    const pages: string[] = [];
    for (const skill of await readdir(skills)) {
      pages.push(path.join(skills, skill, "SKILL.md"));
    }
    assert.ok(pages.length > 0, "the kit wrote no skills at all");
    for (const page of pages) {
      const text = await readFile(page, "utf8");
      assert.ok(text.includes(`${KIT_MARKER}\n${KIT_VERSION_LINE}\n`), page);
      assert.equal(text.split(KIT_VERSION_LINE).length - 1, 1, page);
    }
  });

  test("the always-on block lands in AGENTS.md between the fences", async () => {
    const project = await newProject();
    await codexAdapter.wire(project);

    const page = await readFile(at(project, "AGENTS.md"), "utf8");
    assert.ok(page.startsWith(AGENTS_MD_BEGIN));
    assert.ok(page.trimEnd().endsWith(AGENTS_MD_END));
    assert.match(page, /\$shall:specify/);
    // The block is a managed span and never a file of its own.
    assert.equal(await exists(at(project, "AGENTS.md.block")), false);
  });

  test("nothing of Claude's is written into a Codex project", async () => {
    const project = await newProject();
    await codexAdapter.wire(project);

    assert.equal(await exists(at(project, ".claude")), false);
  });

  test("a second wire changes nothing that already stands", async () => {
    const project = await newProject();
    await codexAdapter.wire(project);
    const watched = [
      ".agents/skills/shall-help/SKILL.md",
      ".codex/hooks/shall/check-spec.mjs",
      HOOKS_FILE,
      "AGENTS.md",
    ];
    const before = await Promise.all(
      watched.map(async (relative) => (await stat(at(project, relative))).mtimeMs),
    );

    await codexAdapter.wire(project);

    const after = await Promise.all(
      watched.map(async (relative) => (await stat(at(project, relative))).mtimeMs),
    );
    assert.deepEqual(after, before);
  });

  test("a project folder that cannot hold a kit is silence", async () => {
    const folder = await newProject();
    const file = path.join(folder, "project");
    await writeFile(file, "not a folder\n");

    await codexAdapter.wire(file);
    assert.equal(await readFile(file, "utf8"), "not a folder\n");
  });
});

describe("the skills an older codex kit left behind", () => {
  test("a marked one goes, and every other kind stays", async () => {
    const project = await newProject();
    await codexAdapter.wire(project);
    const skills = at(project, ".agents/skills");
    const write = async (skill: string, page: string | null): Promise<void> => {
      await mkdir(path.join(skills, skill), { recursive: true });
      if (page !== null) {
        await writeFile(path.join(skills, skill, "SKILL.md"), page);
      }
    };
    await write("shall-retired", `${KIT_MARKER}\n\nAn old skill.\n`);
    await write("shall-mine", "My own skill that shares the prefix.\n");
    await write("shall-empty", null);
    await write("mine", `${KIT_MARKER}\n\nMarked, and still not Shall's to name.`);

    await codexAdapter.wire(project);

    assert.equal(await exists(path.join(skills, "shall-retired")), false);
    assert.ok(await exists(path.join(skills, "shall-mine", "SKILL.md")));
    assert.ok(await exists(path.join(skills, "shall-empty")));
    assert.ok(await exists(path.join(skills, "mine", "SKILL.md")));
    // The ones this kit just wrote are its own, and are not stale.
    assert.ok(await exists(path.join(skills, "shall-help", "SKILL.md")));
  });
});

describe("the codex hook wiring", () => {
  async function withHooks(text: string): Promise<string> {
    const project = await newProject();
    await mkdir(at(project, ".codex"), { recursive: true });
    await writeFile(at(project, HOOKS_FILE), text, "utf8");
    return project;
  }

  test("a hooks file Shall cannot make sense of is left exactly as it is", async () => {
    for (const original of [
      "// a comment JSONC allows and JSON.parse does not\n{}",
      "null",
      '["not an object at all"]',
      '{"hooks":[]}',
      '{"hooks":{"PostToolUse":{}}}',
    ]) {
      const project = await withHooks(original);
      await codexAdapter.wire(project);

      assert.equal(await readFile(at(project, HOOKS_FILE), "utf8"), original);
      // And the rest of the kit still arrived.
      assert.ok(
        await exists(at(project, ".agents/skills/shall-help/SKILL.md")),
      );
    }
  });

  test("a hooks file of somebody's own keeps its shape and gains one entry", async () => {
    const project = await withHooks(
      `${JSON.stringify(
        {
          hooks: {
            PostToolUse: [
              {
                matcher: "Write",
                hooks: [{ type: "command", command: "make lint" }],
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
    );

    await codexAdapter.wire(project);

    const hooks = JSON.parse(
      await readFile(at(project, HOOKS_FILE), "utf8"),
    ) as { hooks: { PostToolUse: { matcher: string }[] } };
    assert.equal(hooks.hooks.PostToolUse.length, 2);
    assert.equal(hooks.hooks.PostToolUse[0]?.matcher, "Write");
    assert.equal(hooks.hooks.PostToolUse[1]?.matcher, "apply_patch|Edit|Write");
  });

  test("an entry already wired by hand is not written a second time", async () => {
    const project = await withHooks(
      `${JSON.stringify(
        {
          hooks: {
            PostToolUse: [
              {
                matcher: "Write",
                hooks: [
                  {
                    type: "command",
                    command: "node .codex/hooks/shall/check-spec.mjs --quiet",
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
    await codexAdapter.wire(project);

    // The person's own matcher and flags are the wiring; a second entry would
    // run the compile twice on every write. The guard is a hook they did not
    // wire, and it arrives under its own event beside theirs.
    const hooks = JSON.parse(await readFile(at(project, HOOKS_FILE), "utf8")) as {
      hooks: { PreToolUse: unknown[]; PostToolUse: { matcher: string }[] };
    };
    assert.deepEqual(
      hooks.hooks.PostToolUse.map((held) => held.matcher),
      ["Write"],
    );
    assert.equal(hooks.hooks.PreToolUse.length, 1);
  });
});
