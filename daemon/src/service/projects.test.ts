import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import { AGENT_RULES_FILE } from "../host/agent-rules.js";
import { initRepository } from "../host/git-cli.js";
import { isRefusal } from "./errors.js";
import {
  createProject,
  getProject,
  getProjectGitBranch,
  listRecentProjects,
  openProject,
  removeRecentProject,
  requireRegistryProject,
} from "./projects.js";

/**
 * What the project doors do BESIDES answering.
 *
 * The four conveniences an open runs are each tested where they live; what has
 * no home of its own is the WIRING — that a fresh project comes with the page
 * an agent reads, and that reopening one written by an older Shall brings it
 * current. It is the half that silently stops happening when somebody edits the
 * `Promise.all` above them.
 *
 * The rest of this file holds the REFUSALS and the TOLERANCES: which folders
 * are not projects and say so, and which stale facts a door is expected to
 * survive rather than fail on — a registry name that lagged behind
 * `project.json`, a folder somebody deleted under a link that still points at
 * it.
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

function metadataPathOf(projectPath: string): string {
  return path.join(projectPath, ".shall", "project.json");
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/** An id in the registry's shape that no project was ever made under. */
const UNKNOWN_ID = "01ABCDEFGHIJKLMNOPQRSTUVWX";

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

describe("making a project", () => {
  test("a folder that is already one is opened, not made twice", async () => {
    const folder = await newFolder();
    const first = await createProject(folder);

    const second = await createProject(folder);

    assert.equal(second.id, first.id);
    assert.equal(second.path, first.path);
  });

  test("a folder in no repository gets one", async () => {
    const folder = await newFolder();
    await createProject(folder);

    assert.ok(await exists(path.join(folder, ".git")));
  });

  test("a caller that said no to git gets a project and no repository", async () => {
    const folder = await newFolder();
    const project = await createProject(folder, { initGit: false });

    assert.equal(project.path, folder);
    assert.equal(await exists(path.join(folder, ".git")), false);
  });

  test("a folder already inside a repository gets no second one", async () => {
    const repository = await mkdtemp(path.join(workspace, "repo-"));
    await initRepository(repository);
    const folder = path.join(repository, "package");
    await mkdir(folder);

    await createProject(folder);

    assert.equal(await exists(path.join(folder, ".git")), false);
  });

  test("the name is the folder's own", async () => {
    const folder = await newFolder();
    const project = await createProject(folder);

    assert.equal(project.name, path.basename(folder));
  });
});

describe("what is not a project", () => {
  test("Shall's own home is refused by name", async () => {
    await assert.rejects(openProject(home), /is Shall's own home/);
  });

  test("a folder with no .shall is refused", async () => {
    const folder = await newFolder();

    await assert.rejects(openProject(folder), /Not a Shall project/);
  });

  test("a .shall folder with no project.json is refused", async () => {
    const folder = await newFolder();
    await mkdir(path.join(folder, ".shall"));

    await assert.rejects(openProject(folder), /but no project\.json/);
  });

  test("a project.json that is not one is refused", async () => {
    const folder = await newFolder();
    const project = await createProject(folder);
    await writeFile(
      metadataPathOf(folder),
      JSON.stringify({ id: project.id, schemaVersion: 2 }),
      "utf8",
    );

    await assert.rejects(openProject(folder), /Invalid Shall project/);
  });

  test("a path that is not a directory is refused before anything else", async () => {
    const folder = await newFolder();
    const file = path.join(folder, "notes.md");
    await writeFile(file, "not a folder\n", "utf8");

    await assert.rejects(openProject(file), /Not a directory/);
  });
});

describe("the registry entry behind an id", () => {
  test("a known id answers with the entry", async () => {
    const project = await createProject(await newFolder());

    const entry = await requireRegistryProject(project.id);

    assert.deepEqual(entry, project);
  });

  test("an id nobody knows is refused as missing", async () => {
    await assert.rejects(
      requireRegistryProject(UNKNOWN_ID),
      (error: unknown) => isRefusal(error) && error.kind === "missing",
    );
  });
});

describe("resolving an id for a screen", () => {
  test("an id nobody knows answers null rather than refusing", async () => {
    assert.equal(await getProject(UNKNOWN_ID), null);
  });

  test("a folder that is gone answers null", async () => {
    const project = await createProject(await newFolder());
    await rm(project.path, { recursive: true, force: true });

    assert.equal(await getProject(project.id), null);
  });

  test("the name comes from project.json when the registry lags", async () => {
    const project = await createProject(await newFolder());
    await writeFile(
      metadataPathOf(project.path),
      JSON.stringify({ id: project.id, name: "Renamed", schemaVersion: 1 }),
      "utf8",
    );

    const resolved = await getProject(project.id);

    assert.equal(resolved?.name, "Renamed");
  });

  test("a project.json that cannot be read leaves the registry's own", async () => {
    const project = await createProject(await newFolder());
    await writeFile(metadataPathOf(project.path), "{ not json", "utf8");

    const resolved = await getProject(project.id);

    assert.deepEqual(resolved, project);
  });
});

describe("the branch behind the header", () => {
  test("an id nobody knows answers no branch rather than refusing", async () => {
    assert.deepEqual(await getProjectGitBranch(UNKNOWN_ID), { branch: null });
  });

  test("a project in a repository answers the branch it is on", async () => {
    const project = await createProject(await newFolder());
    await writeFile(
      path.join(project.path, ".git", "HEAD"),
      "ref: refs/heads/spec-work\n",
      "utf8",
    );

    assert.deepEqual(await getProjectGitBranch(project.id), {
      branch: "spec-work",
    });
  });

  test("a project in no repository answers no branch", async () => {
    const project = await createProject(await newFolder(), { initGit: false });

    assert.deepEqual(await getProjectGitBranch(project.id), { branch: null });
  });
});

describe("the recent list", () => {
  test("a folder that is gone is still listed, marked absent", async () => {
    const kept = await createProject(await newFolder());
    const deleted = await createProject(await newFolder());
    await rm(deleted.path, { recursive: true, force: true });

    const recent = await listRecentProjects();

    assert.equal(recent.find((entry) => entry.id === kept.id)?.exists, true);
    assert.equal(recent.find((entry) => entry.id === deleted.id)?.exists, false);
  });

  test("removing one drops it from the list and leaves the folder", async () => {
    const project = await createProject(await newFolder());

    await removeRecentProject(project.id);

    const recent = await listRecentProjects();
    assert.equal(
      recent.some((entry) => entry.id === project.id),
      false,
    );
    assert.ok(await exists(metadataPathOf(project.path)));
  });
});
