import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { SHALL_VERSION } from "@shall/core/version";
import { KIT_MARKER, writeAgentKit } from "./agent-kit.js";
import { codexAdapter } from "./adapters/codex.js";
import { AGENTS_MD_BEGIN, AGENTS_MD_END } from "./agents-md.js";
import { setEmbeddedFiles } from "./embedded.js";

/**
 * The same kits, written by a Shall that has no checkout behind it.
 *
 * IT IS A FILE OF ITS OWN AND NOT A CASE IN `agent-kit.test.ts` BECAUSE THE
 * CARRY HAS NO UNDO: once files are handed in, this process is a binary for as
 * long as it lives, and the suite next door is the one that must go on reading
 * the real `agents/dist/*`. Node gives every test file its own process, so two
 * answers are kept apart by being kept in separate files.
 *
 * BOTH TREES ARE CARRIED, UNDER A PREFIX EACH, which is the other half of what
 * this file pins: `kit/claude/` and `kit/codex/` are what `build-binary.mjs`
 * writes, and an agent whose bytes are carried under the wrong name is an agent
 * a release cannot wire.
 *
 * THE TREES HERE ARE INVENTED, WORD FOR WORD, and that is the assertion: none
 * of these sentences exist in the repository, so a kit that arrives carrying
 * them was written from the bytes and from nothing else.
 */

function encode(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

function at(project: string, relative: string): string {
  return path.join(project, ...relative.split("/"));
}

setEmbeddedFiles({
  "kit/claude/commands/specify.md": encode(
    "---\ndescription: invented\n---\n\nRun /shall:specify and read shall:shall-specify.\n",
  ),
  "kit/claude/skills/shall-specify/SKILL.md": encode("An invented skill page.\n"),
  "kit/claude/skills/shall-specify/references/phase-1.md": encode(
    "An invented reference.\n",
  ),
  "kit/claude/hooks/check-spec.mjs": encode("// an invented hook\n"),
  "kit/codex/skills/shall-help/SKILL.md": encode(
    '---\nname: "shall:help"\n---\n\nAn invented Codex skill page.\n',
  ),
  "kit/codex/skills/shall-help/references/spine.md": encode(
    "An invented Codex reference.\n",
  ),
  "kit/codex/hooks/check-spec.mjs": encode("// an invented codex hook\n"),
  "kit/claude/hooks/hooks.json": encode(
    `${JSON.stringify(
      {
        hooks: {
          PostToolUse: [
            {
              matcher: "Write|Edit|MultiEdit",
              hooks: [
                {
                  type: "command",
                  command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/check-spec.mjs"',
                  timeout: 90,
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
  ),
  "kit/codex/hooks/hooks.json": encode(
    `${JSON.stringify(
      {
        hooks: {
          PostToolUse: [
            {
              matcher: "apply_patch|Edit|Write",
              hooks: [
                {
                  type: "command",
                  command: "node .codex/hooks/shall/check-spec.mjs",
                  timeout: 90,
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
  ),
  "kit/codex/AGENTS.md.block": encode("## Shall\n\nAn invented block.\n"),
  "web/index.html": encode("<!doctype html>"),
});

describe("the kit a binary writes", () => {
  test("every carried file lands where the checkout's would have", async () => {
    const project = await mkdtemp(path.join(os.tmpdir(), "shall-kit-carried-"));
    await writeAgentKit(project);

    const command = await readFile(
      at(project, ".claude/commands/shall.specify.md"),
      "utf8",
    );
    assert.match(command, /invented/);
    assert.ok(command.includes(KIT_MARKER));
    assert.ok(command.includes(`<!-- Version: ${SHALL_VERSION} -->`));
    // The dialect is the plugin's, said in the project's grammar — the same
    // transform the checkout gets, applied to bytes rather than to a file.
    assert.ok(command.includes("/shall.specify"));
    assert.ok(command.includes("shall-specify"));
    assert.ok(!command.includes("/shall:specify"));

    const skill = await readFile(
      at(project, ".claude/skills/shall-specify/SKILL.md"),
      "utf8",
    );
    assert.ok(skill.includes("An invented skill page."));
    const reference = await readFile(
      at(project, ".claude/skills/shall-specify/references/phase-1.md"),
      "utf8",
    );
    assert.ok(reference.includes(KIT_MARKER));

    // The hook is script and not prose: it arrives byte for byte, because an
    // HTML comment at the top of it would be a syntax error to node.
    const hook = await readFile(
      at(project, ".claude/hooks/shall/check-spec.mjs"),
      "utf8",
    );
    assert.equal(hook, "// an invented hook\n");

    const settings = JSON.parse(
      await readFile(at(project, ".claude/settings.json"), "utf8"),
    ) as { hooks?: { PostToolUse?: unknown[] } };
    assert.equal(settings.hooks?.PostToolUse?.length, 1);
  });

  test("a second write over the same folder changes nothing", async () => {
    const project = await mkdtemp(path.join(os.tmpdir(), "shall-kit-carried-"));
    await writeAgentKit(project);
    const written = at(project, ".claude/commands/shall.specify.md");
    const first = await readFile(written, "utf8");
    await writeAgentKit(project);
    assert.equal(await readFile(written, "utf8"), first);
  });

  test("the codex tree lands in its own three places, from the bytes alone", async () => {
    const project = await mkdtemp(path.join(os.tmpdir(), "shall-kit-carried-"));
    await codexAdapter.wire(project);

    const skill = await readFile(
      at(project, ".agents/skills/shall-help/SKILL.md"),
      "utf8",
    );
    assert.match(skill, /An invented Codex skill page/);
    // The frontmatter stays first, and the stamp sits under it — the same
    // treatment a Claude page gets, in a file Codex reads.
    assert.ok(skill.startsWith("---\n"), skill.slice(0, 20));
    assert.ok(skill.includes(`${KIT_MARKER}\n<!-- Version: ${SHALL_VERSION} -->\n`));
    const reference = await readFile(
      at(project, ".agents/skills/shall-help/references/spine.md"),
      "utf8",
    );
    assert.ok(reference.includes(KIT_MARKER));

    const hook = await readFile(
      at(project, ".codex/hooks/shall/check-spec.mjs"),
      "utf8",
    );
    assert.equal(hook, "// an invented codex hook\n");

    // The wiring is merged from the carried `hooks.json`, and the block from
    // the carried `AGENTS.md.block`: neither is ever written as a file.
    const hooks = JSON.parse(
      await readFile(at(project, ".codex/hooks.json"), "utf8"),
    ) as { hooks: { PostToolUse: { matcher: string }[] } };
    assert.equal(hooks.hooks.PostToolUse[0]?.matcher, "apply_patch|Edit|Write");
    const agentsMd = await readFile(at(project, "AGENTS.md"), "utf8");
    assert.ok(agentsMd.startsWith(AGENTS_MD_BEGIN));
    assert.match(agentsMd, /An invented block/);
    assert.ok(agentsMd.trimEnd().endsWith(AGENTS_MD_END));
  });
});
