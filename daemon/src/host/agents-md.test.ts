import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { SHALL_VERSION } from "@shall/core/version";
import {
  AGENTS_MD_BEGIN,
  AGENTS_MD_END,
  writeAgentsMdBlock,
} from "./agents-md.js";

/**
 * The managed span inside somebody else's `AGENTS.md`.
 *
 * WHAT IS PINNED IS THE FIVE STATES that file can be in when Shall arrives, and
 * that the four which are not "already right" leave everything outside the
 * fences exactly as it stood. The fifth — already right — is the one that has to
 * write nothing at all, because an open that reformats a person's file every
 * time is a diff nobody asked for.
 */

const BODY = "## Shall\n\nWhat an agent has to know.\n";

async function newProject(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "shall-agents-md-"));
}

function pageOf(project: string): string {
  return path.join(project, "AGENTS.md");
}

async function read(project: string): Promise<string> {
  return readFile(pageOf(project), "utf8").catch(() => "");
}

describe("the block in AGENTS.md", () => {
  test("a project with no page gets one holding the block alone", async () => {
    const project = await newProject();
    await writeAgentsMdBlock(project, BODY);

    const page = await read(project);
    assert.equal(
      page,
      `${AGENTS_MD_BEGIN}\n<!-- Version: ${SHALL_VERSION} -->\n\n## Shall\n\nWhat an agent has to know.\n${AGENTS_MD_END}\n`,
    );
  });

  test("a page of somebody's own keeps its prose, and the block arrives under it", async () => {
    const project = await newProject();
    await writeFile(pageOf(project), "# House rules\n\nRun the tests.\n");

    await writeAgentsMdBlock(project, BODY);

    const page = await read(project);
    // Their words are first and unchanged: an instructions file is read from
    // the top, and Shall's half-page is not the part that goes there.
    assert.ok(page.startsWith("# House rules\n\nRun the tests.\n"));
    assert.match(page, /What an agent has to know/);
    assert.ok(page.trimEnd().endsWith(AGENTS_MD_END));
  });

  test("a block an older Shall wrote is replaced between the fences and nowhere else", async () => {
    const project = await newProject();
    await writeFile(
      pageOf(project),
      `# House rules\n\n${AGENTS_MD_BEGIN}\n<!-- Version: 0.0.1 -->\n\nWhat an older Shall said.\n${AGENTS_MD_END}\n\nAnd my own note after it.\n`,
    );

    await writeAgentsMdBlock(project, BODY);

    const page = await read(project);
    assert.ok(page.startsWith("# House rules\n\n"));
    assert.ok(page.endsWith("\n\nAnd my own note after it.\n"));
    assert.match(page, /What an agent has to know/);
    assert.ok(!page.includes("What an older Shall said"));
    // One block, not two: the span was replaced rather than appended to.
    assert.equal(page.split(AGENTS_MD_BEGIN).length - 1, 1);
  });

  for (const [what, page] of [
    ["only an opening fence", `# Mine\n\n${AGENTS_MD_BEGIN}\n\nHalf a block.\n`],
    ["only a closing fence", `# Mine\n\nHalf a block.\n${AGENTS_MD_END}\n`],
    [
      "the fences in the wrong order",
      `${AGENTS_MD_END}\n\nsomething\n\n${AGENTS_MD_BEGIN}\n`,
    ],
  ] as const) {
    test(`a page with ${what} is left exactly as it is`, async () => {
      const project = await newProject();
      await writeFile(pageOf(project), page);

      await writeAgentsMdBlock(project, BODY);

      // Half a pair is somebody's edit mid-flight, and there is no honest place
      // to put the fence that is missing.
      assert.equal(await read(project), page);
    });
  }

  test("a second write over the same page leaves its mtime alone", async () => {
    const project = await newProject();
    await writeAgentsMdBlock(project, BODY);
    const first = await stat(pageOf(project));

    await writeAgentsMdBlock(project, BODY);

    const second = await stat(pageOf(project));
    assert.equal(second.mtimeMs, first.mtimeMs);
  });

  test("a folder that cannot hold the page is silence, not a failure", async () => {
    const folder = await newProject();
    const file = path.join(folder, "project");
    await writeFile(file, "not a folder\n");

    // Wiring is an open-time convenience, not a condition of opening.
    await writeAgentsMdBlock(file, BODY);
    assert.equal(await readFile(file, "utf8"), "not a folder\n");
  });
});
