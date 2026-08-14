import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * The current branch of the repository holding a path, read from the files git
 * itself maintains.
 *
 * NO `git` BINARY IS SPAWNED. The answer is one line in one file, the header
 * asks on every glance at a project, and a daemon that forked a process per
 * glance would be paying a subprocess for a `readFile`. Reading `.git/HEAD` is
 * also the one git fact whose format has been stable for git's whole life:
 * `ref: refs/heads/<branch>` on a branch, a bare object id when detached.
 *
 * THE WALK GOES UP, the way git's own discovery does, because a Shall project
 * is not necessarily the repository root — a spec can live in a package of a
 * monorepo whose `.git` sits two folders above it.
 *
 * EVERY FAILURE IS `null`, never a throw: not being a git repository is an
 * ordinary state of a project, and the header simply shows nothing for it.
 */
export async function readGitBranch(startPath: string): Promise<string | null> {
  const gitDir = await findGitDirAbove(startPath);
  if (gitDir === null) {
    return null;
  }

  let head: string;
  try {
    head = (await readFile(path.join(gitDir, "HEAD"), "utf8")).trim();
  } catch {
    return null;
  }

  const ref = /^ref: refs\/heads\/(.+)$/.exec(head);
  const branch = ref?.[1];
  if (branch !== undefined) {
    return branch;
  }
  // A detached HEAD is a bare object id (40 hex for SHA-1, 64 for SHA-256).
  // Seven characters is what git itself abbreviates to, and the header is a
  // glance, not a lookup key.
  if (/^[0-9a-f]{40,64}$/.test(head)) {
    return head.slice(0, 7);
  }
  return null;
}

/**
 * The actual git directory for the repository holding `startPath`, or null.
 *
 * `.git` is usually a folder and sometimes a FILE — a linked worktree and a
 * submodule both hold one line, `gitdir: <path>`, pointing at where the real
 * directory lives, relative to the file when it is not absolute. One level of
 * that indirection is followed, which is all git itself writes.
 */
async function findGitDirAbove(startPath: string): Promise<string | null> {
  let directory = path.resolve(startPath);
  for (;;) {
    const candidate = path.join(directory, ".git");
    try {
      const details = await stat(candidate);
      if (details.isDirectory()) {
        return candidate;
      }
      if (details.isFile()) {
        const pointer = /^gitdir: (.+)$/m.exec(
          await readFile(candidate, "utf8"),
        );
        const target = pointer?.[1]?.trim();
        if (target !== undefined && target !== "") {
          return path.resolve(directory, target);
        }
        return null;
      }
    } catch {
      // Nothing named `.git` here; keep walking.
    }
    const parent = path.dirname(directory);
    // The root of the filesystem is its own parent, and it is where the walk
    // stops rather than where it loops.
    if (parent === directory) {
      return null;
    }
    directory = parent;
  }
}
