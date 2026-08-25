import assert from "node:assert/strict";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import {
  browseDirectories,
  classifyShallFolder,
  createDirectory,
} from "./filesystem.js";
import { writeProjectFiles } from "./project-files.js";

/**
 * The folder picker's view of the machine.
 *
 * WHAT IS PINNED HERE IS WHAT A FOLDER IS ALLOWED TO LOOK LIKE. The picker
 * shows visible folders and says of each whether it is already a project — and
 * `~/.shall` wears the same `.shall` name a project's folder does, so the one
 * folder that must never read as openable is Shall's own home. The other half
 * is the name a person may type: a single visible folder name, and nothing
 * that walks anywhere.
 */

let home = "";

before(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "shall-browse-home-"));
  // `getShallHome` reads `os.homedir()` on every call, which is `$HOME` on
  // POSIX.
  process.env.HOME = home;
});

async function newFolder(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "shall-browse-"));
}

const METADATA = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  name: "p",
  schemaVersion: 1,
} as const;

describe("what a folder turns out to be", () => {
  test("a folder with metadata is a project and a bare one is not", async () => {
    const folder = await newFolder();
    assert.equal(await classifyShallFolder(folder), "none");

    await writeProjectFiles(folder, METADATA);
    assert.equal(await classifyShallFolder(folder), "project");
  });

  test("the folder holding Shall's own home is never openable", async () => {
    await mkdir(path.join(home, ".shall"), { recursive: true });
    await writeFile(
      path.join(home, ".shall", "project.json"),
      `${JSON.stringify(METADATA)}\n`,
      "utf8",
    );

    // Even wearing a project's metadata: `~/.shall` is Shall's, not a graph.
    assert.equal(await classifyShallFolder(home), "root");
  });
});

describe("browsing a folder", () => {
  test("lists the visible folders in name order, and says what each is", async () => {
    const folder = await newFolder();
    for (const name of ["beta", "alpha", ".hidden"]) {
      await mkdir(path.join(folder, name), { recursive: true });
    }
    await writeFile(path.join(folder, "note.md"), "not a folder\n", "utf8");
    await writeProjectFiles(path.join(folder, "alpha"), METADATA);

    const result = await browseDirectories(folder);

    assert.equal(result.path, folder);
    assert.equal(result.parent, path.dirname(folder));
    assert.equal(result.shall, "none");
    // Files and dotted folders are not places to open a project.
    assert.deepEqual(
      result.directories.map((entry) => [entry.name, entry.shall]),
      [
        ["alpha", "project"],
        ["beta", "none"],
      ],
    );
    assert.equal(result.directories[0]?.path, path.join(folder, "alpha"));
  });

  test("with nothing asked for, it starts at the home folder", async () => {
    const result = await browseDirectories();

    assert.equal(result.path, home);
  });

  test("the root of the filesystem has no parent to climb to", async () => {
    const result = await browseDirectories("/");

    assert.equal(result.parent, null);
  });

  test("a path that is not a folder is refused", async () => {
    const folder = await newFolder();
    const file = path.join(folder, "note.md");
    await writeFile(file, "not a folder\n", "utf8");

    await assert.rejects(browseDirectories(file), {
      message: `Not a directory: ${file}`,
    });
  });
});

describe("making a folder", () => {
  test("makes one under the parent, with the name trimmed", async () => {
    const parent = await newFolder();

    const made = await createDirectory(parent, "  new project  ");

    assert.equal(made, path.join(parent, "new project"));
    assert.ok((await stat(made)).isDirectory());
  });

  test("refuses anything that is not a single visible folder name", async () => {
    const parent = await newFolder();
    for (const name of ["", "   ", ".", "..", ".hidden", "a/b", "a\\b", "/tmp"]) {
      // Nothing typed into the picker may walk anywhere: the parent is the
      // folder the person is standing in.
      await assert.rejects(
        createDirectory(parent, name),
        { message: "Folder name must be a visible single directory name" },
        JSON.stringify(name),
      );
    }
  });

  test("refuses a parent that is not a folder", async () => {
    const folder = await newFolder();
    const file = path.join(folder, "note.md");
    await writeFile(file, "not a folder\n", "utf8");

    await assert.rejects(createDirectory(file, "child"), {
      message: `Not a directory: ${file}`,
    });
  });

  test("refuses a name already taken", async () => {
    const parent = await newFolder();
    await createDirectory(parent, "taken");

    // Not `recursive`, so an existing folder is an answer and not a silent
    // reuse of somebody else's.
    await assert.rejects(createDirectory(parent, "taken"));
  });
});
