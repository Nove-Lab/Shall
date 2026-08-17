import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import { AGENT_RULES_FILE } from "../host/agent-rules.js";
import { createProject, openProject } from "./projects.js";

/**
 * What opening a project does BESIDES answering.
 *
 * The four conveniences an open runs are each tested where they live; what has
 * no home of its own is the WIRING — that a fresh project comes with the page
 * an agent reads, and that reopening one written by an older Shall brings it
 * current. It is the half that silently stops happening when somebody edits the
 * `Promise.all` above them.
 */

let home = "";
let workspace = "";

before(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "shall-projects-"));
  home = path.join(workspace, "home");
  await mkdir(home, { recursive: true });
  // `getShallHome` reads `os.homedir()` on every call, so this redirects the
  // registry and the config without a seam that exists only for tests. Git is
  // told to ignore the machine's own config, because `createProject` runs
  // `git init` in a folder that is in no repository.
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = path.join(home, ".config");
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});

async function newFolder(): Promise<string> {
  return mkdtemp(path.join(workspace, "project-"));
}

function rulesPathOf(projectPath: string): string {
  return path.join(projectPath, ...AGENT_RULES_FILE.split("/"));
}

describe("opening a project", () => {
  test("a new project comes with the page an agent reads", async () => {
    const folder = await newFolder();
    await createProject(folder);

    const text = await readFile(rulesPathOf(folder), "utf8");
    assert.match(text, /Never delete a spec file/);
  });

  test("a project from an older Shall gains it on the next open", async () => {
    const folder = await newFolder();
    const project = await createProject(folder);
    await rm(rulesPathOf(folder), { force: true });

    await openProject(project.path);

    const text = await readFile(rulesPathOf(folder), "utf8");
    assert.match(text, /Never delete a spec file/);
  });

  test("an open that changes nothing leaves the page's mtime alone", async () => {
    const folder = await newFolder();
    const project = await createProject(folder);
    const first = await stat(rulesPathOf(folder));

    await openProject(project.path);

    const second = await stat(rulesPathOf(folder));
    assert.equal(second.mtimeMs, first.mtimeMs);
  });

  test("a rules folder of somebody's own is not disturbed", async () => {
    const folder = await newFolder();
    const project = await createProject(folder);
    const mine = path.join(folder, ".claude", "rules", "house-style.md");
    await mkdir(path.dirname(mine), { recursive: true });
    await writeFile(mine, "# House style\n", "utf8");

    await openProject(project.path);

    assert.equal(await readFile(mine, "utf8"), "# House style\n");
  });
});
