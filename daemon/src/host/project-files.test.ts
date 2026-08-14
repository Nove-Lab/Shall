import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { NODE_TYPES } from "@shall/core/graph";
import { emitTemplate } from "@shall/core/serialize";
import {
  getProjectTemplatesPath,
  writeProjectFiles,
  writeTemplates,
} from "./project-files.js";

/**
 * The files a project folder is made of, written the way this daemon writes
 * everything: beside the target and moved onto it, so nothing ever reads half of
 * one.
 *
 * WHAT IS PINNED HERE IS THE RACE. `projects.open` regenerates all 23 templates
 * on a click of the picker, and two clicks, two tabs, or `shall init` running
 * while a browser opens the same folder are two of these overlapping — which is
 * exactly when a temporary name shared by both writers turns an ordinary open
 * into an `ENOENT` on a rename. It bites hardest on a fresh clone, where every
 * template has work to do.
 */

async function newFolder(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "shall-files-"));
}

describe("the templates are regenerated safely", () => {
  test("two writers over one folder both finish, and write the same 23 files", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const folder = await newFolder();
      const settled = await Promise.allSettled([
        writeTemplates(folder),
        writeTemplates(folder),
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

      const templates = getProjectTemplatesPath(folder);
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
    // The byte compare is what keeps `git status` quiet on every open, so a
    // regeneration that rewrote identical bytes would show up in a person's
    // working tree as 23 files they did not touch.
    const folder = await newFolder();
    await writeTemplates(folder);
    const templates = getProjectTemplatesPath(folder);
    const before = new Map<string, number>();
    for (const entry of await readdir(templates)) {
      before.set(entry, (await stat(path.join(templates, entry))).mtimeMs);
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeTemplates(folder);

    for (const [entry, stamp] of before) {
      assert.equal(
        (await stat(path.join(templates, entry))).mtimeMs,
        stamp,
        entry,
      );
    }
  });

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

    const shall = path.join(folder, ".shall");
    const entries = (await readdir(shall)).sort();
    assert.deepEqual(entries, [".gitignore", "project.json", "spec", "templates"]);
    assert.equal(
      (await readdir(path.join(shall, "templates"))).length,
      NODE_TYPES.length,
    );
  });
});
