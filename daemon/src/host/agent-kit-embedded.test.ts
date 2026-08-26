import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { SHALL_VERSION } from "@shall/core/version";
import { KIT_MARKER, writeAgentKit } from "./agent-kit.js";
import { setEmbeddedFiles } from "./embedded.js";

/**
 * The same kit, written by a Shall that has no checkout behind it.
 *
 * IT IS A FILE OF ITS OWN AND NOT A CASE IN `agent-kit.test.ts` BECAUSE THE
 * CARRY HAS NO UNDO: once files are handed in, this process is a binary for as
 * long as it lives, and the suite next door is the one that must go on reading
 * the real `agents/dist/claude`. Node gives every test file its own process, so
 * two answers are kept apart by being kept in separate files.
 *
 * THE PLUGIN HERE IS INVENTED, WORD FOR WORD, and that is the assertion: none
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
  "kit/commands/specify.md": encode(
    "---\ndescription: invented\n---\n\nRun /shall:specify and read shall:shall-specify.\n",
  ),
  "kit/skills/shall-specify/SKILL.md": encode("An invented skill page.\n"),
  "kit/skills/shall-specify/references/phase-1.md": encode(
    "An invented reference.\n",
  ),
  "kit/hooks/check-spec.mjs": encode("// an invented hook\n"),
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
});
