import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import { NODE_TYPES } from "@shall/core/graph";
import { emitTemplate } from "@shall/core/serialize";
import {
  assertDirectory,
  ensureProjectSpec,
  findProjectRootAbove,
  getProjectAcceptancesPath,
  getProjectFeedDir,
  getProjectLedgerPath,
  getProjectMetadataPath,
  getProjectRejectionsPath,
  getProjectShallPath,
  getProjectSpecPath,
  getProjectTemplatesPath,
  getSharedTemplatesPath,
  isReachable,
  pathExists,
  readProjectMetadata,
  readSpecNodeFile,
  removeProjectTemplates,
  writeProjectFiles,
  writeProjectMetadata,
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

let home = "";

/** A fake `~`, so the templates these tests write are not the machine's. */
before(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "shall-files-home-"));
  // `getShallHome` reads `os.homedir()` on every call, which is `$HOME` on
  // POSIX — so this redirects the shared folder without a seam that exists
  // only for tests.
  process.env.HOME = home;
});

async function newFolder(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "shall-files-"));
}

const METADATA = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  name: "p",
  schemaVersion: 1,
} as const;

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

describe("a template the canon no longer has", () => {
  test("is removed, and a file that is not a template is left", async () => {
    await writeSharedTemplates();
    const templates = getSharedTemplatesPath();
    await writeFile(path.join(templates, "Widget.md"), "# a type that went\n");
    await writeFile(path.join(templates, "notes.txt"), "mine\n");

    await writeSharedTemplates();

    // A template for a type the loader refuses by folder name would teach an
    // agent to write a node nothing can read back.
    assert.equal(await pathExists(path.join(templates, "Widget.md")), false);
    assert.equal(await readFile(path.join(templates, "notes.txt"), "utf8"), "mine\n");
  });
});

describe("a project's own folder", () => {
  test("two initializations of one folder leave one whole project behind", async () => {
    // The loser's cleanup used to remove the winner's half-built folder, because
    // both had built it under the same temporary name.
    const folder = await newFolder();
    const metadata = METADATA;
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
    // And the loser's half-built folder went with its failure: a stray `.tmp`
    // here is one a person is asked to commit.
    assert.deepEqual(await readdir(folder), [".shall"]);
  });

  test("a folder that is already a project is refused", async () => {
    const folder = await newFolder();
    await writeProjectFiles(folder, METADATA);

    await assert.rejects(writeProjectFiles(folder, METADATA), {
      message: `Folder is already initialized: ${folder}`,
    });
  });

  test("the metadata written is the metadata read back", async () => {
    const folder = await newFolder();
    await writeProjectFiles(folder, METADATA);

    await writeProjectMetadata(folder, { ...METADATA, name: "renamed" });

    assert.deepEqual(await readProjectMetadata(folder), {
      ...METADATA,
      name: "renamed",
    });
    // Two-space JSON with a trailing newline, like every other file Shall
    // writes into somebody's checkout.
    const text = await readFile(getProjectMetadataPath(folder), "utf8");
    assert.ok(text.endsWith("}\n"), JSON.stringify(text.slice(-8)));
  });

  test("the spec folder is made by an open, and a second open is a no-op", async () => {
    const folder = await newFolder();
    // git carries no empty folder, so a clone of a project whose graph is
    // still empty arrives without `spec/`.
    await mkdir(getProjectShallPath(folder), { recursive: true });

    await ensureProjectSpec(folder);
    assert.ok((await stat(getProjectSpecPath(folder))).isDirectory());

    await ensureProjectSpec(folder);
    assert.ok((await stat(getProjectSpecPath(folder))).isDirectory());
  });
});

describe("where a project keeps things", () => {
  test("the layout is the one that is committed", async () => {
    const folder = "/somewhere/project";
    const shall = path.join(folder, ".shall");
    assert.equal(getProjectShallPath(folder), shall);
    assert.equal(getProjectMetadataPath(folder), path.join(shall, "project.json"));
    assert.equal(getProjectSpecPath(folder), path.join(shall, "spec"));
    assert.equal(getProjectTemplatesPath(folder), path.join(shall, "templates"));
    // The three books and the feed ride in one folder, which is what the
    // commit button carries.
    const ledger = path.dirname(getProjectLedgerPath(folder));
    assert.equal(ledger, path.join(shall, "ledger"));
    assert.equal(path.dirname(getProjectRejectionsPath(folder)), ledger);
    assert.equal(path.dirname(getProjectAcceptancesPath(folder)), ledger);
    assert.equal(path.dirname(getProjectFeedDir(folder)), ledger);
    // The reference set is the machine's and not the project's.
    assert.equal(getSharedTemplatesPath(), path.join(home, ".shall", "templates"));
  });
});

describe("the questions asked of a path", () => {
  test("`pathExists` answers no to a folder this process may not enter", async () => {
    const folder = await newFolder();
    const closed = path.join(folder, "closed");
    await mkdir(path.join(closed, "inside"), { recursive: true });
    assert.equal(await pathExists(path.join(closed, "inside")), true);
    assert.equal(await pathExists(path.join(folder, "gone")), false);

    await chmod(closed, 0o000);
    try {
      // Right for its callers: a folder Shall cannot enter is one it cannot
      // use either way.
      assert.equal(await pathExists(path.join(closed, "inside")), false);
      // Wrong for anything that turns the answer into a sentence, which is
      // why the other question exists.
      assert.equal(await isReachable(path.join(closed, "inside")), true);
    } finally {
      await chmod(closed, 0o700);
    }
  });

  test("`isReachable` answers no only to what is genuinely not there", async () => {
    const folder = await newFolder();
    assert.equal(await isReachable(folder), true);
    assert.equal(await isReachable(path.join(folder, "gone")), false);
  });

  test("`assertDirectory` refuses a file and passes a folder", async () => {
    const folder = await newFolder();
    const file = path.join(folder, "note.md");
    await writeFile(file, "not a folder\n", "utf8");

    await assertDirectory(folder);
    await assert.rejects(assertDirectory(file), {
      message: `Not a directory: ${file}`,
    });
  });
});

describe("finding the project a path is in", () => {
  test("walks up from anywhere inside the checkout", async () => {
    const folder = await newFolder();
    await writeProjectFiles(folder, METADATA);
    const deep = path.join(folder, "src", "host");
    await mkdir(deep, { recursive: true });

    // How `shall check` works from anywhere inside a clone, the way git does.
    assert.equal(await findProjectRootAbove(deep), folder);
    assert.equal(await findProjectRootAbove(folder), folder);
  });

  test("answers null when nothing above is a project", async () => {
    const folder = await newFolder();
    // The root of the filesystem is its own parent, and it is where the walk
    // stops rather than where it loops.
    assert.equal(await findProjectRootAbove(folder), null);
  });

  test("steps over Shall's own home", async () => {
    const shallHome = path.join(home, ".shall");
    await mkdir(shallHome, { recursive: true });
    await writeFile(
      path.join(shallHome, "project.json"),
      `${JSON.stringify(METADATA)}\n`,
      "utf8",
    );

    try {
      // `~/.shall` wears the same name a project's folder does, so the folder
      // holding it reads as a project until it is stepped over.
      assert.equal(await findProjectRootAbove(home), null);
    } finally {
      await rm(path.join(shallHome, "project.json"), { force: true });
    }
  });
});

describe("a node's own file", () => {
  test("is read out of the band folder the loader wrote it to", async () => {
    const folder = await newFolder();
    await writeProjectFiles(folder, METADATA);
    const spec = getProjectSpecPath(folder);
    await mkdir(path.join(spec, "intent", "Requirement"), { recursive: true });
    await writeFile(
      path.join(spec, "intent", "Requirement", "REQ-1.md"),
      "# a requirement\n",
      "utf8",
    );

    assert.equal(
      await readSpecNodeFile(spec, "Requirement", "REQ-1"),
      "# a requirement\n",
    );
  });

  test("is null for a type with no band and for a node that is not there", async () => {
    const folder = await newFolder();
    await writeProjectFiles(folder, METADATA);
    const spec = getProjectSpecPath(folder);

    assert.equal(await readSpecNodeFile(spec, "Widget", "W-1"), null);
    // A file that vanished between the loader's read and this one is a node
    // the next check will not mention either.
    assert.equal(await readSpecNodeFile(spec, "Requirement", "REQ-1"), null);
  });
});

describe("a project's own template folder", () => {
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
