import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import type { RegistryProject } from "../types.js";
import {
  readRegistry,
  removeRegistryProject,
  renameRegistryProject,
  upsertRegistryProject,
} from "./registry.js";
import { ensureShallHome, getShallHome } from "./shall-home.js";

/**
 * The list of projects under `~/.shall/registry.json`.
 *
 * WHAT IS PINNED HERE IS RECENCY AND IDENTITY. The file is the picker's order,
 * so an upsert has to move an entry to the front and a rename has to leave it
 * exactly where it was; and a project is one folder AND one id, so opening a
 * path that already has an entry replaces it rather than listing the same
 * folder twice. What the file may never be is guessed at: a registry of the
 * wrong shape is an error and not an empty list.
 */

let home = "";

before(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "shall-registry-home-"));
  // `getShallHome` reads `os.homedir()` on every call, which is `$HOME` on
  // POSIX — so this redirects the registry without a seam that exists only for
  // tests.
  process.env.HOME = home;
});

function project(id: string, name: string, at: string): RegistryProject {
  return { id, name, path: at };
}

async function idsInOrder(): Promise<string[]> {
  return (await readRegistry()).projects.map((entry) => entry.id);
}

/** Somebody else's registry file, or a wrecked one, already on disk. */
async function writeRegistry(text: string): Promise<void> {
  await ensureShallHome();
  await writeFile(getShallHome().registryPath, text, "utf8");
}

describe("the project registry", () => {
  test("a home with no registry yet answers with an empty one", async () => {
    assert.deepEqual(await readRegistry(), { projects: [] });
  });

  test("a project arrives at the front, and arriving again returns to it", async () => {
    await writeRegistry(`${JSON.stringify({ projects: [] })}\n`);
    await upsertRegistryProject(project("a", "A", "/one"));
    await upsertRegistryProject(project("b", "B", "/two"));
    assert.deepEqual(await idsInOrder(), ["b", "a"]);

    await upsertRegistryProject(project("a", "A", "/one"));
    // The picker's order is this list's order, and the front is where the
    // project somebody just opened belongs.
    assert.deepEqual(await idsInOrder(), ["a", "b"]);
    assert.equal((await readRegistry()).projects.length, 2);
  });

  test("one folder is one entry, whatever id it arrives under", async () => {
    await writeRegistry(`${JSON.stringify({ projects: [] })}\n`);
    await upsertRegistryProject(project("a", "A", "/one"));

    // A folder reinitialized under a new id is the same folder, and listing it
    // twice would open two projects over one `.shall`.
    await upsertRegistryProject(project("second", "A again", "/one"));

    assert.deepEqual(await readRegistry(), {
      projects: [project("second", "A again", "/one")],
    });
  });

  test("a rename does not bump recency", async () => {
    await writeRegistry(`${JSON.stringify({ projects: [] })}\n`);
    await upsertRegistryProject(project("a", "A", "/one"));
    await upsertRegistryProject(project("b", "B", "/two"));

    await renameRegistryProject("a", "Renamed");

    // Renaming is not opening: the list is unchanged but for the one name.
    assert.deepEqual((await readRegistry()).projects, [
      project("b", "B", "/two"),
      project("a", "Renamed", "/one"),
    ]);
  });

  test("a rename of an id nobody has changes nothing", async () => {
    await writeRegistry(`${JSON.stringify({ projects: [] })}\n`);
    await upsertRegistryProject(project("a", "A", "/one"));

    await renameRegistryProject("gone", "Renamed");

    assert.deepEqual((await readRegistry()).projects, [project("a", "A", "/one")]);
  });

  test("removing takes one entry and leaves the rest", async () => {
    await writeRegistry(`${JSON.stringify({ projects: [] })}\n`);
    await upsertRegistryProject(project("a", "A", "/one"));
    await upsertRegistryProject(project("b", "B", "/two"));

    await removeRegistryProject("a");
    assert.deepEqual(await idsInOrder(), ["b"]);

    // Removing what is not there is a no-op, not an error.
    await removeRegistryProject("a");
    assert.deepEqual(await idsInOrder(), ["b"]);
  });

  test("a file two-space JSON with a trailing newline is what lands", async () => {
    await writeRegistry(`${JSON.stringify({ projects: [] })}\n`);
    await upsertRegistryProject(project("a", "A", "/one"));

    const text = await readFile(getShallHome().registryPath, "utf8");
    assert.ok(text.endsWith("}\n"), JSON.stringify(text.slice(-8)));
    assert.ok(text.includes('\n  "projects"'), text);
  });

  test("a registry of the wrong shape is an error, not an empty list", async () => {
    for (const wrecked of [
      "5",
      "null",
      '"a string"',
      "[]",
      "{}",
      '{"projects":{}}',
    ]) {
      await writeRegistry(wrecked);
      // Answering `{ projects: [] }` here would hand the picker an empty
      // machine and invite an upsert to overwrite the file with one project.
      await assert.rejects(
        readRegistry(),
        { message: `Invalid Shall registry: ${getShallHome().registryPath}` },
        wrecked,
      );
    }
  });

  test("a registry that is not JSON at all is an error as well", async () => {
    await writeRegistry("{ not json");
    await assert.rejects(readRegistry(), SyntaxError);
  });
});
