import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import { NODE_TYPES } from "@shall/core/graph";
import { emitTemplate } from "@shall/core/serialize";
import {
  getProjectTemplatesPath,
  getSharedTemplatesPath,
  removeProjectTemplates,
  writeProjectFiles,
  writeSharedTemplates,
} from "./project-files.js";

/**
 * The files a project folder is made of, written the way this daemon writes
 * everything: beside the target and moved onto it, so nothing ever reads half of
 * one.
 *
 * WHAT IS PINNED HERE IS THE RACE. The shared templates are regenerated on
 * every daemon start and every open, and a start racing an open over
 * `~/.shall/templates` is two of these overlapping — which is exactly when a
 * temporary name shared by both writers turns an ordinary open into an `ENOENT`
 * on a rename. It bites hardest on a fresh machine, where every template has
 * work to do.
 */

/** A fake `~`, so the templates these tests write are not the machine's. */
before(async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "shall-files-home-"));
  // `getShallHome` reads `os.homedir()` on every call, which is `$HOME` on
  // POSIX — so this redirects the shared folder without a seam that exists
  // only for tests.
  process.env.HOME = home;
});

async function newFolder(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "shall-files-"));
}

describe("the shared templates are regenerated safely", () => {
  test("two writers over the shared folder both finish, and write the same 21 files", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const settled = await Promise.allSettled([
        writeSharedTemplates(),
        writeSharedTemplates(),
      ]);
      assert.deepEqual(
        settled.map((result) => result.status),
        ["fulfilled", "fulfilled"],
        settled
          .map((result) =>
            result.status === "rejected" ? String(result.reason) : "ok",
          )
          .join(" | "),
      );

      const templates = getSharedTemplatesPath();
      const entries = await readdir(templates);
      assert.equal(entries.length, NODE_TYPES.length);
      // No `.tmp` survives a finished write, whichever of the two got there
      // first, and every file holds the whole template rather than half of one.
      assert.deepEqual(
        entries.filter((entry) => !entry.endsWith(".md")),
        [],
      );
      for (const entry of NODE_TYPES) {
        assert.equal(
          await readFile(path.join(templates, `${entry.name}.md`), "utf8"),
          emitTemplate(entry.name),
          entry.name,
        );
      }
    }
  });

  test("a second pass over current templates writes nothing at all", async () => {
    // The byte compare is what keeps the folder's mtimes quiet on every start,
    // so a regeneration that rewrote identical bytes would churn 21 files
    // nobody touched.
    await writeSharedTemplates();
    const templates = getSharedTemplatesPath();
    const before = new Map<string, number>();
    for (const entry of await readdir(templates)) {
      before.set(entry, (await stat(path.join(templates, entry))).mtimeMs);
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeSharedTemplates();

    for (const [entry, stamp] of before) {
      assert.equal(
        (await stat(path.join(templates, entry))).mtimeMs,
        stamp,
        entry,
      );
    }
  });
});

describe("a project's own folder", () => {
  test("two initializations of one folder leave one whole project behind", async () => {
    // The loser's cleanup used to remove the winner's half-built folder, because
    // both had built it under the same temporary name.
    const folder = await newFolder();
    const metadata = { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", name: "p", schemaVersion: 1 } as const;
    const settled = await Promise.allSettled([
      writeProjectFiles(folder, metadata),
      writeProjectFiles(folder, metadata),
    ]);
    // One of them may lose the race and say the folder is already initialized;
    // what may not happen is both of them failing, or the survivor's folder
    // being incomplete.
    assert.ok(
      settled.some((result) => result.status === "fulfilled"),
      settled
        .map((result) =>
          result.status === "rejected" ? String(result.reason) : "ok",
        )
        .join(" | "),
    );

    // No `templates` here any more: the reference set is the machine's, under
    // `~/.shall/templates`, and a node's starting file is written straight
    // into the spec by `shall add-spec-node`.
    const shall = path.join(folder, ".shall");
    const entries = (await readdir(shall)).sort();
    assert.deepEqual(entries, [".gitignore", "project.json", "spec"]);
  });

  test("a template set an older Shall committed into a project is removed whole", async () => {
    const folder = await newFolder();
    const templates = getProjectTemplatesPath(folder);
    await mkdir(templates, { recursive: true });
    await writeFile(
      path.join(templates, "Requirement.md"),
      "# left behind by an older Shall\n",
      "utf8",
    );

    await removeProjectTemplates(folder);
    await assert.rejects(stat(templates));

    // A project that never had one is a no-op, not an error — every open runs
    // this, and most projects will have nothing to remove.
    await removeProjectTemplates(folder);
  });
});
