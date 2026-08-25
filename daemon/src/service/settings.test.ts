import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import { getShallHome } from "../host/shall-home.js";
import { isRefusal } from "./errors.js";
import { createProject } from "./projects.js";
import {
  readGlobalSettings,
  readProjectSettings,
  updateGlobalSettings,
  updateProjectSettings,
} from "./settings.js";
import type { RegistryProject } from "../types.js";

/**
 * The Settings screen's two halves over a real `~/.shall` and a real project.
 *
 * WHAT IS PINNED HERE IS WHAT A WRITE TOUCHES AND WHAT IT LEAVES ALONE. An edit
 * to the port is the only writable key in `config.json` today, and the keys
 * beside it belong to whoever added them; a rename lands in `project.json` AND
 * in the registry, and in neither case is it allowed to move the project up the
 * recent list — the person renamed something, they did not open it.
 */

let home = "";
let workspace = "";

before(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "shall-settings-"));
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

async function newProject(): Promise<RegistryProject> {
  return createProject(await mkdtemp(path.join(workspace, "project-")), {
    initGit: false,
  });
}

function metadataPathOf(projectPath: string): string {
  return path.join(projectPath, ".shall", "project.json");
}

/** An id in the registry's shape that no project was ever made under. */
const UNKNOWN_ID = "01ABCDEFGHIJKLMNOPQRSTUVWX";

describe("what the screen shows for ~/.shall", () => {
  test("the three paths are the home's own and the port is the default", async () => {
    const settings = await readGlobalSettings();

    assert.equal(settings.homePath, path.join(home, ".shall"));
    assert.equal(settings.configPath, getShallHome().configPath);
    assert.equal(settings.registryPath, getShallHome().registryPath);
    assert.equal(settings.port, 9461);
  });

  test("the count is of the projects the registry holds", async () => {
    const counted = (await readGlobalSettings()).projectCount;
    await newProject();

    assert.equal((await readGlobalSettings()).projectCount, counted + 1);
  });
});

describe("editing ~/.shall", () => {
  test("the new port is what the next read answers", async () => {
    const settings = await updateGlobalSettings({ port: 9999 });

    assert.equal(settings.port, 9999);
    assert.equal((await readGlobalSettings()).port, 9999);
  });

  test("a key the edit does not touch survives it", async () => {
    await writeFile(
      getShallHome().configPath,
      `${JSON.stringify({ port: 9461, theme: "dark" }, null, 2)}\n`,
      "utf8",
    );

    await updateGlobalSettings({ port: 9500 });

    const config = JSON.parse(
      await readFile(getShallHome().configPath, "utf8"),
    ) as Record<string, unknown>;
    assert.equal(config.theme, "dark");
    assert.equal(config.port, 9500);
  });
});

describe("what the screen shows for a project", () => {
  test("the two paths under .shall are named in full", async () => {
    const project = await newProject();

    const settings = await readProjectSettings(project.id);

    assert.equal(settings.id, project.id);
    assert.equal(settings.name, project.name);
    assert.equal(settings.path, project.path);
    assert.equal(settings.schemaVersion, 1);
    assert.equal(settings.shallPath, path.join(project.path, ".shall"));
    assert.equal(settings.specPath, path.join(project.path, ".shall", "spec"));
  });

  test("an id nobody knows is refused as missing", async () => {
    await assert.rejects(
      readProjectSettings(UNKNOWN_ID),
      (error: unknown) => isRefusal(error) && error.kind === "missing",
    );
  });

  test("a project.json that is not one is refused", async () => {
    const project = await newProject();
    await writeFile(
      metadataPathOf(project.path),
      JSON.stringify({ id: project.id, name: "Kept", schemaVersion: 2 }),
      "utf8",
    );

    await assert.rejects(
      readProjectSettings(project.id),
      /Invalid Shall project/,
    );
  });
});

describe("renaming a project", () => {
  test("the new name lands in project.json and in the registry", async () => {
    const project = await newProject();

    const settings = await updateProjectSettings({
      id: project.id,
      name: "Renamed",
    });

    assert.equal(settings.name, "Renamed");
    const metadata = JSON.parse(
      await readFile(metadataPathOf(project.path), "utf8"),
    ) as Record<string, unknown>;
    assert.equal(metadata.name, "Renamed");
    assert.equal(metadata.id, project.id);
    assert.equal((await readProjectSettings(project.id)).name, "Renamed");
  });

  test("a rename does not move the project up the recent list", async () => {
    const older = await newProject();
    const newer = await newProject();

    await updateProjectSettings({ id: older.id, name: "Still older" });

    const registry = JSON.parse(
      await readFile(getShallHome().registryPath, "utf8"),
    ) as { projects: RegistryProject[] };
    const ids = registry.projects.map((entry) => entry.id);
    assert.ok(ids.indexOf(newer.id) < ids.indexOf(older.id));
  });

  test("a project.json that is not one is refused before anything is written", async () => {
    const project = await newProject();
    await writeFile(
      metadataPathOf(project.path),
      JSON.stringify({ id: project.id, name: 7, schemaVersion: 1 }),
      "utf8",
    );

    await assert.rejects(
      updateProjectSettings({ id: project.id, name: "Renamed" }),
      /Invalid Shall project/,
    );

    const registry = JSON.parse(
      await readFile(getShallHome().registryPath, "utf8"),
    ) as { projects: RegistryProject[] };
    assert.equal(
      registry.projects.find((entry) => entry.id === project.id)?.name,
      project.name,
    );
  });
});
