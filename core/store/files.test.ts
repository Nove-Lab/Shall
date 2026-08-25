import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { describeFailure, isAbsent, writeBytes } from "./files.js";

/**
 * The filesystem manners every door in `core/store` keeps.
 *
 * The doors above exercise most of this file on their way past — a folder that
 * is not there, a permission bit, a symlink in a circle — and what is left is
 * what no door can reach from where it stands: the answers this module gives to
 * a `catch` holding something that is not an errno at all, the tail of the
 * errno table that a spec folder does not produce on demand, and what happens
 * to the temporary file when the write beside the target lands and the rename
 * onto it does not.
 *
 * REAL DIRECTORIES, like every other suite in this folder, because the claim is
 * about a filesystem.
 */

const roots: string[] = [];

async function makeDir(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "shall-files-"));
  roots.push(root);
  return root;
}

after(async () => {
  for (const root of roots) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("what the filesystem said, in this module's words", () => {
  test("a thing that is not there is absent, and a thing that is not an errno is not", () => {
    assert.equal(isAbsent({ code: "ENOENT" }), true);
    // A `spec` that is somehow a file has no entries either, and the
    // check-and-then-read race is worse than the answer.
    assert.equal(isAbsent({ code: "ENOTDIR" }), true);
    assert.equal(isAbsent({ code: "EACCES" }), false);
    assert.equal(isAbsent({}), false);

    // A `catch` holds whatever was thrown, and a string, a null and an
    // undefined are all of them things that can be thrown. None of them says a
    // file is missing, and reading `.code` off one of them would throw a second
    // time inside the handler for the first.
    assert.equal(isAbsent("ENOENT"), false);
    assert.equal(isAbsent(null), false);
    assert.equal(isAbsent(undefined), false);
  });

  test("the codes a spec folder produces read as English, and the rest keep their code", () => {
    for (const [code, sentence] of [
      ["EACCES", "the filesystem refused permission"],
      ["EPERM", "the filesystem refused permission"],
      ["EISDIR", "it is a folder and not a file"],
      ["ENOTDIR", "something along its path is a file and not a folder"],
      ["EEXIST", "something already stands where a folder along its path would go"],
      ["ELOOP", "its symbolic links lead in a circle"],
      ["ENAMETOOLONG", "its name is longer than the filesystem allows"],
    ] as const) {
      assert.equal(describeFailure({ code }), sentence, code);
    }

    // The unmapped tail keeps the code, deliberately: inventing a soothing
    // phrase for something nobody anticipated would tell the person less than
    // the letters their operating system already documents.
    assert.equal(describeFailure({ code: "EDQUOT" }), "the filesystem answered EDQUOT");

    // And where there is no code to keep, the sentence says only what is known.
    assert.equal(describeFailure(new Error("thrown by something else")), "the filesystem refused it");
    assert.equal(describeFailure({ code: 13 }), "the filesystem refused it");
    assert.equal(describeFailure(null), "the filesystem refused it");
  });
});

describe("a write lands whole or not at all", () => {
  test("a rename that cannot happen throws, and takes its temporary file with it", async () => {
    const root = await makeDir();
    const target = path.join(root, "occupied");
    await mkdir(target);

    // The bytes go to a name beside the target and the rename moves them onto
    // it; a folder standing there is what a rename cannot be asked to do. What
    // matters afterwards is that the failure left nothing behind — a stray
    // `.tmp` is a file the next reader has to be taught to ignore.
    await assert.rejects(() => writeBytes(target, "bytes\n"));
    assert.deepEqual(await readdir(root), ["occupied"]);
    assert.deepEqual(await readdir(target), []);
  });

  test("a target whose folder is not there throws the filesystem's own error", async () => {
    const root = await makeDir();
    await assert.rejects(
      () => writeBytes(path.join(root, "nowhere", "book.yaml"), "bytes\n"),
      (error: unknown) => isAbsent(error),
    );
    assert.deepEqual(await readdir(root), []);
  });
});
