import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { KIT_MARKER } from "../agent-kit.js";
import { agentsToWire, detectWiredAgents } from "./registry.js";

/**
 * WHICH AGENTS A FOLDER IS WIRED FOR, and what is done about the answer.
 *
 * DETECTION IS THE MARKER AND NOT THE PATH. A `.claude` folder exists in
 * projects Shall has never touched and a `.agents/skills` folder is any skill
 * anybody wrote; what proves a wiring is one page Shall generated, carrying the
 * one line Shall stamps every generated page with. A file at the right path
 * WITHOUT that line is somebody else's file with a name that collided, and
 * saying it was Shall's would let an open overwrite it.
 *
 * THE POLICY IS PINNED SEPARATELY, because it is a decision rather than a
 * reading: the union of what was asked for and what is there, and Claude when
 * that union is empty.
 */

async function newProject(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "shall-detect-"));
}

/** A page at one of the two paths detection reads, with or without the marker. */
async function page(
  project: string,
  relative: string,
  marked: boolean,
): Promise<void> {
  const target = path.join(project, ...relative.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(
    target,
    marked ? `---\n---\n${KIT_MARKER}\nA page.\n` : "A page of my own.\n",
  );
}

const CLAUDE_PAGE = ".claude/commands/shall.help.md";
const CODEX_PAGE = ".agents/skills/shall-help/SKILL.md";

describe("detecting what a project is wired for", () => {
  test("a folder nothing wrote into is wired for nothing", async () => {
    assert.deepEqual(await detectWiredAgents(await newProject()), []);
  });

  test("a marked page is that agent, and each agent has its own", async () => {
    const claude = await newProject();
    await page(claude, CLAUDE_PAGE, true);
    assert.deepEqual(await detectWiredAgents(claude), ["claude"]);

    const codex = await newProject();
    await page(codex, CODEX_PAGE, true);
    assert.deepEqual(await detectWiredAgents(codex), ["codex"]);
  });

  test("both marked is both, in the order the agents are listed", async () => {
    const project = await newProject();
    await page(project, CODEX_PAGE, true);
    await page(project, CLAUDE_PAGE, true);

    assert.deepEqual(await detectWiredAgents(project), ["claude", "codex"]);
  });

  test("a page at the same path without the marker is nobody's wiring", async () => {
    const project = await newProject();
    await page(project, CLAUDE_PAGE, false);
    await page(project, CODEX_PAGE, false);

    // Somebody's own help command, and somebody's own skill folder. Reporting
    // them as Shall's would let the next open write over them.
    assert.deepEqual(await detectWiredAgents(project), []);
  });

  test("a path that is a folder rather than a page proves nothing", async () => {
    const project = await newProject();
    await mkdir(path.join(project, ...CLAUDE_PAGE.split("/")), {
      recursive: true,
    });

    assert.deepEqual(await detectWiredAgents(project), []);
  });
});

describe("what is wired after the answer", () => {
  test("what was asked for is added to what is already there", () => {
    assert.deepEqual(agentsToWire(["codex"], ["claude"]), ["claude", "codex"]);
    // Nothing typed at `init` takes an agent away: there is no door for that.
    assert.deepEqual(agentsToWire(["claude"], ["claude", "codex"]), [
      "claude",
      "codex",
    ]);
  });

  test("asking for nothing keeps what is there", () => {
    assert.deepEqual(agentsToWire([], ["codex"]), ["codex"]);
  });

  test("a project wired for nothing falls back to Claude", () => {
    // Which is why a hand-deleted `.claude` comes back on the next open, and
    // why every caller that never heard of the choice behaves as it always did.
    assert.deepEqual(agentsToWire([], []), ["claude"]);
  });
});
