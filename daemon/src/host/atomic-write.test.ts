import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { temporaryName, writeByRename } from "./atomic-write.js";

/**
 * The one way this daemon puts bytes on a path it does not own alone.
 *
 * WHAT IS PINNED HERE IS THE LITTER. A rename is atomic and needs no test to
 * say so; what needed one is the two ways a temporary outlives its write — a
 * name a second writer in the same process picks as well, and a failure that
 * leaves the half-written file behind for somebody to find in `git status`.
 */

async function newFolder(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "shall-atomic-"));
}

describe("a write by rename", () => {
  test("lands the whole file and leaves nothing beside it", async () => {
    const folder = await newFolder();
    const target = path.join(folder, "note.md");

    await writeByRename(target, "one\n");
    await writeByRename(target, "two\n");

    assert.equal(await readFile(target, "utf8"), "two\n");
    assert.deepEqual(await readdir(folder), ["note.md"]);
  });

  test("takes its temporary with it when it cannot land", async () => {
    const folder = await newFolder();
    const target = path.join(folder, "occupied");
    // A rename onto a folder cannot succeed, which is a stand-in for every
    // other way the second half of a write fails.
    await mkdir(path.join(target, "inside"), { recursive: true });

    await assert.rejects(writeByRename(target, "one\n"));

    assert.deepEqual(await readdir(folder), ["occupied"]);
  });

  test("fails outright when there is nowhere to write, and still leaves nothing", async () => {
    const folder = await newFolder();
    const target = path.join(folder, "missing", "note.md");

    await assert.rejects(writeByRename(target, "one\n"));

    assert.deepEqual(await readdir(folder), []);
  });
});

describe("a temporary name", () => {
  test("is a different name every time, which the pid alone was not", async () => {
    const target = "/tmp/shall/note.md";
    const first = temporaryName(target);
    const second = temporaryName(target);

    // Two writes to one target inside one daemon — two tabs on one project —
    // used to pick the same name and truncate each other.
    assert.notEqual(first, second);
    for (const name of [first, second]) {
      assert.ok(name.startsWith(`${target}.`), name);
      // `*.tmp` still matches, so the project's ignore rule does not change,
      // and the pid still says which process left a stray behind.
      assert.ok(name.endsWith(".tmp"), name);
      assert.ok(name.includes(`.${process.pid}.`), name);
    }
  });

  test("does not collide when two writers race over one target", async () => {
    const folder = await newFolder();
    const target = path.join(folder, "note.md");
    // Both finish, and the folder holds the target and nothing else.
    await Promise.all([
      writeByRename(target, "one\n"),
      writeByRename(target, "one\n"),
    ]);

    assert.deepEqual(await readdir(folder), ["note.md"]);
    assert.equal(await readFile(target, "utf8"), "one\n");
  });
});

describe("the file a write replaces", () => {
  test("is never read half-written", async () => {
    const folder = await newFolder();
    const target = path.join(folder, "note.md");
    await writeFile(target, "before\n", "utf8");

    await writeByRename(target, "after\n");

    assert.equal(await readFile(target, "utf8"), "after\n");
  });
});
