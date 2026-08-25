import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import {
  commitPaths,
  fileAt,
  fileHistory,
  initRepository,
  isDirtyUnder,
  lastCommitTouching,
  pathForId,
  repositoryRoot,
  runGit,
} from "./git-cli.js";

/**
 * Real repositories, built in a temp folder and thrown away — because every
 * claim this module makes is a claim about what git does, and a fake git would
 * only pin what we already believe about it. What is pinned here is the pairing
 * of a question and the shape of git's answer: the partial commit that leaves
 * the rest of a tree alone, the bytes of a version, the `^` that reaches past a
 * deletion, and the glob that finds a bare id under folders nobody recorded.
 *
 * NOTHING IN HERE TOUCHES THE SHALL REPOSITORY. Every command runs with `cwd`
 * inside a `mkdtemp` folder of its own.
 */

/**
 * Whether there is a git to ask. A machine without one is a machine where this
 * module answers `absent` to everything, which is a state it is built for and
 * not one these tests can demonstrate anything else in — so they say they were
 * skipped rather than passing quietly.
 *
 * Resolved at the top level because `node:test` wants the skip decided when a
 * test is REGISTERED, which is before any `before` hook has run.
 */
const NO_GIT = (await runGit(os.tmpdir(), ["--version"])).kind === "absent";

/**
 * A fake `~`, so that whoever runs these tests does not lend them their name.
 * `commitPaths` supplies Shall's identity exactly when the machine has none,
 * and the developer's own `~/.gitconfig` would hide that case on every machine
 * where it could be seen. `XDG_CONFIG_HOME` moves the other place git keeps a
 * global config, and `GIT_CONFIG_NOSYSTEM` shuts out `/etc/gitconfig`, which a
 * container image is entitled to have filled in.
 */
before(async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "shall-gitcli-home-"));
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = home;
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});

/** The stdout of a command the scaffolding cannot proceed without. */
async function must(root: string, args: readonly string[]): Promise<string> {
  const answer = await runGit(root, args);
  if (answer.kind !== "ok") {
    assert.fail(`git ${args.join(" ")} — ${JSON.stringify(answer)}`);
  }
  return answer.stdout;
}

/**
 * `realpath` because `mkdtemp` hands back a path through whatever symlink the
 * machine's temp folder is behind (`/var` on macOS is the famous one), while
 * `rev-parse --show-toplevel` answers with the resolved one — and comparing the
 * two would fail over a fact about the filesystem rather than about this module.
 */
async function newRepository(): Promise<string> {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "shall-gitcli-")),
  );
  const started = await initRepository(root);
  assert.equal(started.kind, "ok", JSON.stringify(started));
  return root;
}

async function place(
  root: string,
  relative: string,
  text: string,
): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text, "utf8");
}

/** Everything in the tree, committed under a name of the test's own. */
async function commitEverything(root: string, message: string): Promise<string> {
  await must(root, ["add", "-A"]);
  await must(root, [
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-m",
    message,
  ]);
  return (await must(root, ["rev-parse", "HEAD"])).trim();
}

const SPEC = ".shall/spec";
const NODE = `${SPEC}/intent/Requirement/R-0001.md`;
/** The second subtree one commit covers, and the folder it lives in. */
const LEDGER_DIR = ".shall/ledger";
const LEDGER = `${LEDGER_DIR}/approvals.yaml`;

/** No trailing newline and a byte above ASCII, so "byte for byte" means it. */
const FIRST = "---\nshort_name: café\nname: A café\n---\n\nFirst.";
const SECOND = "---\nshort_name: café\nname: A café\n---\n\nSecond.";
/** Shaped like the ledger only so a reader knows what these bytes stand for. */
const RECORD =
  "R-0001:\n  approvedHash: sha256:0000\n  by: someone\n  at: 2026-08-15T09:00:00.000Z\n";

describe("running git at all", () => {
  test("a name nothing answers to is an answer and not a crash", async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "shall-gitcli-none-"));
    const answer = await runGit(
      folder,
      ["--version"],
      `definitely-not-git-${randomUUID()}`,
    );
    assert.equal(answer.kind, "absent");
  });

  test(
    "a command git refuses comes back with its code and its own words",
    { skip: NO_GIT && "no git on this machine" },
    async () => {
      const root = await newRepository();
      const answer = await runGit(root, ["cat-file", "-p", "deadbeef"]);
      assert.equal(answer.kind, "failed");
      if (answer.kind !== "failed") {
        return;
      }
      assert.ok(answer.code > 0, `exit code was ${answer.code}`);
      assert.match(answer.stderr, /deadbeef/);
    },
  );

  test("an argument node itself refuses is an answer and not a throw", async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "shall-gitcli-nul-"));
    // A NUL byte inside a path never reaches git at all: `execFile` throws
    // over it before a process exists, and this module answers with values.
    const answer = await runGit(folder, ["show", "HEAD:a\0b.md"]);
    assert.equal(answer.kind, "failed");
    if (answer.kind !== "failed") {
      return;
    }
    assert.equal(answer.code, 1);
    assert.match(answer.stderr, /null bytes/);
  });

  test(
    "output past the cap is a failure with a sentence, never a truncated ok",
    { skip: NO_GIT && "no git on this machine" },
    async () => {
      const root = await newRepository();
      // One byte over the cap is enough, and a file of one repeated character
      // is a fast thing for git to store.
      await place(root, "big.bin", "a".repeat((16 << 20) + 1));
      await commitEverything(root, "something too big to read");

      const answer = await runGit(root, ["show", "HEAD:big.bin"]);
      assert.equal(answer.kind, "failed");
      if (answer.kind !== "failed") {
        return;
      }
      // A process killed for its output has no exit status of its own, and
      // git left no words either — so the sentence is node's.
      assert.equal(answer.code, 1);
      assert.match(answer.stderr, /maxBuffer/);
    },
  );
});

describe("finding the repository", () => {
  test(
    "a folder in no repository answers that it is in none",
    { skip: NO_GIT && "no git on this machine" },
    async () => {
      const bare = await mkdtemp(path.join(os.tmpdir(), "shall-gitcli-bare-"));
      assert.equal(await repositoryRoot(bare), null);
    },
  );

  test(
    "the root is found from a folder nested inside it",
    { skip: NO_GIT && "no git on this machine" },
    async () => {
      const root = await newRepository();
      const nested = path.join(root, ".shall", "spec", "intent");
      await mkdir(nested, { recursive: true });
      assert.equal(await repositoryRoot(nested), root);
    },
  );
});

describe("what is uncommitted", () => {
  test(
    "a node nobody has added yet reads as dirty, and a committed one does not",
    { skip: NO_GIT && "no git on this machine" },
    async () => {
      const root = await newRepository();
      assert.equal(await isDirtyUnder(root, [SPEC]), false);

      // Untracked, which is the state every new node file starts in.
      await place(root, NODE, FIRST);
      assert.equal(await isDirtyUnder(root, [SPEC]), true);

      await commitEverything(root, "the first node");
      assert.equal(await isDirtyUnder(root, [SPEC]), false);

      // Edited in place: tracked and changed is the other half of dirty.
      await place(root, NODE, SECOND);
      assert.equal(await isDirtyUnder(root, [SPEC]), true);
    },
  );

  test(
    "a path that is not there anywhere counts as clean rather than as an error",
    { skip: NO_GIT && "no git on this machine" },
    async () => {
      const root = await newRepository();
      await place(root, NODE, FIRST);

      // Nobody has approved anything here, so there is no ledger folder to
      // find — and a pathspec matching nothing is silence, not a failure.
      assert.equal(await isDirtyUnder(root, [LEDGER_DIR]), false);
      // And it does not swallow the path beside it that HAS moved: the answer
      // is the union of the two, which is what the button asks about.
      assert.equal(await isDirtyUnder(root, [SPEC, LEDGER_DIR]), true);
    },
  );
});

describe("recording a commit", () => {
  test(
    "the commit takes the named subtree and leaves the rest of the tree alone",
    { skip: NO_GIT && "no git on this machine" },
    async () => {
      const root = await newRepository();
      await place(root, NODE, FIRST);
      await place(root, "README.md", "# somebody's own work\n");

      const answer = await commitPaths(root, [SPEC], "Save the spec");
      assert.equal(answer.kind, "ok", JSON.stringify(answer));

      assert.equal(await isDirtyUnder(root, [SPEC]), false);
      // The file outside the subtree is untouched: still uncommitted, and not
      // in the tree the commit wrote.
      assert.equal(await isDirtyUnder(root, ["README.md"]), true);
      assert.equal(await fileAt(root, "HEAD", NODE), FIRST);
      assert.equal(await fileAt(root, "HEAD", "README.md"), null);
    },
  );

  test(
    "two subtrees go into one commit, and a third stays exactly as it was staged",
    { skip: NO_GIT && "no git on this machine" },
    async () => {
      const root = await newRepository();
      await place(root, NODE, FIRST);
      await place(root, LEDGER, RECORD);
      await place(root, "notes.md", "somebody's own work\n");
      // Staged by hand and left there: the half-finished change this button
      // must never sweep up.
      await must(root, ["add", "--", "notes.md"]);

      const answer = await commitPaths(
        root,
        [SPEC, LEDGER_DIR],
        "Save the spec",
      );
      assert.equal(answer.kind, "ok", JSON.stringify(answer));

      // One commit, holding both subtrees.
      assert.equal(await fileAt(root, "HEAD", NODE), FIRST);
      assert.equal(await fileAt(root, "HEAD", LEDGER), RECORD);
      assert.equal((await must(root, ["rev-list", "--count", "HEAD"])).trim(), "1");
      assert.equal(await isDirtyUnder(root, [SPEC, LEDGER_DIR]), false);

      // The third path is out of the commit and still staged, byte for byte
      // as the person left it.
      assert.equal(await fileAt(root, "HEAD", "notes.md"), null);
      assert.equal(
        (await must(root, ["diff", "--cached", "--name-only"])).trim(),
        "notes.md",
      );
    },
  );

  test(
    "a path with nothing in it is dropped from the commit rather than failing it",
    { skip: NO_GIT && "no git on this machine" },
    async () => {
      const root = await newRepository();
      await place(root, NODE, FIRST);
      await place(root, LEDGER, RECORD);
      await commitEverything(root, "the node and the ledger");

      // Only the node moved, and the quiet path is dropped rather than sorted
      // out: a path with nothing in it may be a folder git tracks and has
      // nothing to say about, or one that is not there at all — the second is
      // the one `add` is fatal over — so the filter treats both alike.
      await place(root, NODE, SECOND);
      const answer = await commitPaths(
        root,
        [SPEC, LEDGER_DIR],
        "Change the node",
      );
      assert.equal(answer.kind, "ok", JSON.stringify(answer));
      assert.equal(
        (await must(root, ["show", "--name-only", "--format=", "HEAD"])).trim(),
        NODE,
      );
      assert.equal(await fileAt(root, "HEAD", LEDGER), RECORD);
    },
  );

  test(
    "a folder git has never seen is not a pathspec that fails a commit",
    { skip: NO_GIT && "no git on this machine" },
    async () => {
      const root = await newRepository();
      await place(root, NODE, FIRST);

      // Nobody has approved anything, so there is no ledger folder at all —
      // and `add -A` over a pathspec matching nothing is fatal for the whole
      // add, which is what the filter is there to prevent.
      const answer = await commitPaths(
        root,
        [SPEC, LEDGER_DIR],
        "Save the spec",
      );
      assert.equal(answer.kind, "ok", JSON.stringify(answer));
      assert.equal(await fileAt(root, "HEAD", NODE), FIRST);

      // An empty folder is the other half of the same fact: `add` takes it and
      // `commit` refuses it, and it never reaches either because a folder with
      // nothing in it has nothing to commit.
      await mkdir(path.join(root, LEDGER_DIR), { recursive: true });
      await place(root, NODE, SECOND);
      const second = await commitPaths(
        root,
        [SPEC, LEDGER_DIR],
        "Change the node",
      );
      assert.equal(second.kind, "ok", JSON.stringify(second));
      assert.equal(await fileAt(root, "HEAD", NODE), SECOND);
    },
  );

  test(
    "a subtree somebody deleted whole is committed as the deletion it is",
    { skip: NO_GIT && "no git on this machine" },
    async () => {
      const root = await newRepository();
      await place(root, NODE, FIRST);
      await place(root, LEDGER, RECORD);
      await commitEverything(root, "the node and the ledger");

      await rm(path.join(root, LEDGER_DIR), { recursive: true });
      // The worktree has no such folder now, but the index still matches the
      // pathspec — so the removal is a change like any other.
      assert.equal(await isDirtyUnder(root, [LEDGER_DIR]), true);

      const answer = await commitPaths(
        root,
        [SPEC, LEDGER_DIR],
        "Drop the ledger",
      );
      assert.equal(answer.kind, "ok", JSON.stringify(answer));
      assert.equal(await fileAt(root, "HEAD", LEDGER), null);
      assert.equal(await fileAt(root, "HEAD", NODE), FIRST);
      assert.equal(await isDirtyUnder(root, [SPEC, LEDGER_DIR]), false);
    },
  );

  test(
    "a machine with no identity of its own still commits, under Shall's name",
    { skip: NO_GIT && "no git on this machine" },
    async () => {
      const root = await newRepository();
      await place(root, NODE, FIRST);

      const answer = await commitPaths(root, [SPEC], "Save the spec");
      assert.equal(answer.kind, "ok", JSON.stringify(answer));
      assert.equal((await must(root, ["log", "-1", "--format=%an"])).trim(), "Shall");
      assert.equal(
        (await must(root, ["log", "-1", "--format=%ae"])).trim(),
        "shall@local",
      );

      // And a person who HAS a name keeps it — Shall's pair is a stand-in for
      // a machine with nobody on it, never an override.
      await must(root, ["config", "user.name", "Someone"]);
      await must(root, ["config", "user.email", "someone@example.com"]);
      await place(root, NODE, SECOND);
      const second = await commitPaths(root, [SPEC], "Change the node");
      assert.equal(second.kind, "ok", JSON.stringify(second));
      assert.equal(
        (await must(root, ["log", "-1", "--format=%an"])).trim(),
        "Someone",
      );
    },
  );

  test(
    "a name or an email set to nothing is no identity at all",
    { skip: NO_GIT && "no git on this machine" },
    async () => {
      const root = await newRepository();
      await place(root, NODE, FIRST);
      // git takes an empty value and hands it back on `--get` with an exit
      // status of 0 — so the answer being `ok` is not the same as there being
      // somebody to name.
      await must(root, ["config", "user.name", "Someone"]);
      await must(root, ["config", "user.email", ""]);

      const answer = await commitPaths(root, [SPEC], "Save the spec");
      assert.equal(answer.kind, "ok", JSON.stringify(answer));
      assert.equal(
        (await must(root, ["log", "-1", "--format=%an"])).trim(),
        "Shall",
      );
    },
  );

  test(
    "a git that refuses the staging hands its own words back unchanged",
    { skip: NO_GIT && "no git on this machine" },
    async () => {
      const root = await newRepository();
      await place(root, NODE, FIRST);
      // What a person's own `git commit` in a terminal leaves behind while it
      // is running. `status` does not want the lock — `GIT_OPTIONAL_LOCKS` is
      // off — so the path survives the filter and it is `add` that refuses.
      await place(root, ".git/index.lock", "");

      const answer = await commitPaths(root, [SPEC], "Save the spec");
      assert.equal(answer.kind, "failed", JSON.stringify(answer));
      if (answer.kind !== "failed") {
        return;
      }
      assert.match(answer.stderr, /index\.lock/);
      // Nothing was committed and nothing was staged behind the failure.
      assert.equal(await isDirtyUnder(root, [SPEC]), true);
    },
  );
});

describe("reading out of history", () => {
  test(
    "a file's version at a commit comes back byte for byte",
    { skip: NO_GIT && "no git on this machine" },
    async () => {
      const root = await newRepository();
      await place(root, NODE, FIRST);
      const first = await commitEverything(root, "the first node");
      await place(root, NODE, SECOND);
      const second = await commitEverything(root, "an edit");

      assert.deepEqual(await fileHistory(root, NODE), [second, first]);
      assert.equal(await fileAt(root, first, NODE), FIRST);
      assert.equal(await fileAt(root, second, NODE), SECOND);
      assert.equal(await fileAt(root, "HEAD", NODE), SECOND);

      // The history of a file no commit ever named is empty, not a failure.
      assert.deepEqual(await fileHistory(root, `${SPEC}/nothing.md`), []);

      // The walk is a search with a stopping condition, and a caller that
      // knows how far it is willing to look says so.
      assert.deepEqual(await fileHistory(root, NODE, 1), [second]);
    },
  );

  test(
    "a file somebody deleted is found in the commit before the one that removed it",
    { skip: NO_GIT && "no git on this machine" },
    async () => {
      const root = await newRepository();
      await place(root, NODE, FIRST);
      await commitEverything(root, "the first node");
      await rm(path.join(root, NODE));
      const removed = await commitEverything(root, "gone by hand");

      assert.equal(await lastCommitTouching(root, NODE), removed);
      assert.equal(await fileAt(root, `${removed}^`, NODE), FIRST);
      // The commit that removed it holds nothing at that path, which is the
      // reason `^` is where a restore reads from.
      assert.equal(await fileAt(root, "HEAD", NODE), null);

      // A path no commit ever named has no last commit, and git says so by
      // succeeding with nothing to say rather than by failing.
      assert.equal(await lastCommitTouching(root, `${SPEC}/never.md`), null);
    },
  );

  test(
    "a bare id is found under whatever folders once held it",
    { skip: NO_GIT && "no git on this machine" },
    async () => {
      const root = await newRepository();
      await place(root, NODE, FIRST);
      await commitEverything(root, "the first node");
      await rm(path.join(root, NODE));
      await commitEverything(root, "gone by hand");

      // Nothing was told where the file lived; the band and the type came back
      // out of the history.
      assert.equal(await pathForId(root, SPEC, "R-0001"), NODE);
      assert.equal(await pathForId(root, SPEC, "R-0404"), null);
      // A file one folder shallower is not a node file, and the two stars do
      // not reach it.
      await place(root, `${SPEC}/Requirement/R-0002.md`, FIRST);
      await commitEverything(root, "a file out of place");
      assert.equal(await pathForId(root, SPEC, "R-0002"), null);
    },
  );
});

describe("a folder that is no repository", () => {
  test(
    "answers every reading question without a throw",
    { skip: NO_GIT && "no git on this machine" },
    async () => {
      const bare = await mkdtemp(path.join(os.tmpdir(), "shall-gitcli-out-"));
      assert.equal(await isDirtyUnder(bare, [SPEC]), false);
      assert.deepEqual(await fileHistory(bare, NODE), []);
      assert.equal(await fileAt(bare, "HEAD", NODE), null);
      assert.equal(await pathForId(bare, SPEC, "R-0001"), null);
      assert.equal(await lastCommitTouching(bare, NODE), null);
      // And a commit is a failure rather than a throw: nothing can be dirty
      // where git answers nothing, so no path survives the filter and no
      // process is spawned to be refused by.
      const answer = await commitPaths(bare, [SPEC], "Save the spec");
      assert.equal(answer.kind, "failed");
    },
  );
});
