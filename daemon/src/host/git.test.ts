import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { readGitBranch } from "./git.js";

/**
 * The branch is read from the files git maintains, not from a `git` child
 * process — so what these tests build is those files, byte for byte, and what
 * they pin is the reading: the two spellings of HEAD, the two shapes of
 * `.git`, and the walk that finds them from inside the tree.
 */

async function repository(head: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "shall-git-"));
  await mkdir(path.join(root, ".git"), { recursive: true });
  await writeFile(path.join(root, ".git", "HEAD"), head, "utf8");
  return root;
}

describe("readGitBranch", () => {
  test("a branch is the tail of the ref, slashes and all", async () => {
    const root = await repository("ref: refs/heads/main\n");
    assert.equal(await readGitBranch(root), "main");

    const sliced = await repository("ref: refs/heads/feature/spec-files\n");
    assert.equal(await readGitBranch(sliced), "feature/spec-files");
  });

  test("the walk goes up, because a project is not always the repository root", async () => {
    const root = await repository("ref: refs/heads/main\n");
    const nested = path.join(root, "packages", "app");
    await mkdir(nested, { recursive: true });
    assert.equal(await readGitBranch(nested), "main");
  });

  test("a detached HEAD reads as the seven characters git itself shows", async () => {
    const root = await repository(
      "0123456789abcdef0123456789abcdef01234567\n",
    );
    assert.equal(await readGitBranch(root), "0123456");
  });

  test("a linked worktree's .git file is followed to the real directory", async () => {
    const main = await repository("ref: refs/heads/main\n");
    // git writes the worktree's own HEAD under .git/worktrees/<name>/.
    const inner = path.join(main, ".git", "worktrees", "wt");
    await mkdir(inner, { recursive: true });
    await writeFile(path.join(inner, "HEAD"), "ref: refs/heads/wt-branch\n");

    const worktree = await mkdtemp(path.join(os.tmpdir(), "shall-git-wt-"));
    // Relative on purpose: git writes relative paths here when it can, and
    // resolving them against the wrong base is the mistake worth pinning.
    await writeFile(
      path.join(worktree, ".git"),
      `gitdir: ${path.relative(worktree, inner)}\n`,
      "utf8",
    );
    assert.equal(await readGitBranch(worktree), "wt-branch");
  });

  test("not a repository, and every other misfortune, is null", async () => {
    const bare = await mkdtemp(path.join(os.tmpdir(), "shall-git-none-"));
    assert.equal(await readGitBranch(bare), null);

    // A HEAD holding something neither spelling covers.
    const odd = await repository("this is not a head\n");
    assert.equal(await readGitBranch(odd), null);

    // A .git file pointing at nothing readable.
    const dangling = await mkdtemp(path.join(os.tmpdir(), "shall-git-dead-"));
    await writeFile(
      path.join(dangling, ".git"),
      "gitdir: /nowhere/at/all\n",
      "utf8",
    );
    assert.equal(await readGitBranch(dangling), null);
  });
});
