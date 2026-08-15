import { execFile } from "node:child_process";

/**
 * git as a place where state is KEPT: what the history already holds, and the
 * one commit a person's button press records into it.
 *
 * THIS IS THE DAEMON'S FIRST CHILD PROCESS, AND ITS ONLY ONE. `./git.js` reads
 * the branch out of `.git/HEAD` by hand and spawns nothing, because the header
 * asks that question on every glance at a project. These questions are the
 * other kind: a history cannot be read out of one file by hand, and nothing
 * below is asked unless somebody clicked something. Every spawn git ever gets
 * in this daemon goes through `runGit`.
 *
 * ONE RULE ABOUT PATHS, SO THAT NO CALL SITE HAS TO REASON ABOUT ITS OWN.
 * Every command runs with `cwd` set to the repository root the caller found,
 * and every path handed in is relative to THAT root, with `/` separators —
 * never absolute, never reached through `..`, never a Windows backslash. It is
 * a rule rather than a habit because breaking it FAILS SILENTLY: `git show
 * <ref>:<path>` resolves `<path>` from the root of the tree unless it begins
 * with `./`, so a path that is merely correct relative to some other folder
 * names nothing at all, and the answer that comes back is `null` — which is the
 * very same answer a genuinely deleted file gives. A wrong path here does not
 * look wrong. It looks like history with a hole in it.
 *
 * NOTHING HERE COMMITS OF ITS OWN ACCORD AND NOTHING HERE WRITES INTO THE
 * WORKING TREE. `commitPaths` runs when a person presses a button and at no
 * other time; everything else reads. The bytes lifted out of history are handed
 * back as a string for the store to write through its own doors — there is no
 * `checkout` in this module on purpose, because a checkout would land a file on
 * disk behind the store's back, past every sentence it makes a write pass.
 *
 * NOTHING HERE THROWS. A machine with no git is an ordinary machine, a folder
 * that is no repository is an ordinary folder, and a ref nothing answers to is
 * an ordinary question with no answer. Each of them is a value.
 */

/**
 * What running git amounted to.
 *
 * `absent` is kept apart from `failed` because the two ask different things of
 * a caller: a failure has git's own sentence in it to show a person, while
 * `absent` means the question was never actually put — this machine has no git,
 * so the feature is not on offer at all and a panel shows no button rather than
 * an error about one.
 */
export type GitAnswer =
  | { readonly kind: "ok"; readonly stdout: string }
  | { readonly kind: "failed"; readonly code: number; readonly stderr: string }
  | { readonly kind: "absent" };

/**
 * Long enough that a cold repository on a slow disk finishes, short enough that
 * a git which has gone to sleep on something releases the request instead of
 * holding it forever.
 */
const TIMEOUT_MS = 15_000;

/**
 * 16 MiB of output. One node file is a few kilobytes and a whole history
 * listing is a few hundred lines, so this is not a limit any honest question
 * meets — it is the fence that keeps a runaway `log` from being read into the
 * daemon's heap without end. Passing it kills the process and arrives as a
 * `failed` answer, never as a truncated `ok`.
 */
const OUTPUT_CAP = 16 << 20;

/** git's own words when it left none of its own — a timeout, a killed process. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * One git command, run to the end, answered as a value.
 *
 * THE ENVIRONMENT IS THE PERSON'S, WITH THREE CORRECTIONS. `GIT_OPTIONAL_LOCKS`
 * off, because a plain `status` refreshes the index and takes `index.lock` to do
 * it — a read of ours must never be the reason a person's own `git commit` in a
 * terminal says the repository is locked. `GIT_TERMINAL_PROMPT` off, because a
 * daemon has no terminal to answer a prompt with, and a git waiting for one
 * would sit there until the timeout. `LC_ALL=C`, so that what git prints is in
 * one language whatever the machine is set to.
 *
 * `binary` exists so a test can drive this at a name nothing answers to. It is
 * not a setting: there is one git and it is called git.
 */
export async function runGit(
  cwd: string,
  args: readonly string[],
  binary = "git",
): Promise<GitAnswer> {
  return new Promise<GitAnswer>((resolve) => {
    try {
      execFile(
        binary,
        args,
        {
          cwd,
          encoding: "utf8",
          maxBuffer: OUTPUT_CAP,
          timeout: TIMEOUT_MS,
          windowsHide: true,
          env: {
            ...process.env,
            GIT_OPTIONAL_LOCKS: "0",
            GIT_TERMINAL_PROMPT: "0",
            LC_ALL: "C",
          },
        },
        (error, stdout, stderr) => {
          if (error === null) {
            resolve({ kind: "ok", stdout });
            return;
          }
          // NOTHING WAS RUN AT ALL. A `cwd` that is not there answers with the
          // same `ENOENT` a missing binary does, and the two cannot be told
          // apart from here — which is honest enough, because both mean the
          // same thing to a caller: git could not be put the question, so
          // there is nothing to show a person about the answer.
          if (error.code === "ENOENT") {
            resolve({ kind: "absent" });
            return;
          }
          resolve({
            kind: "failed",
            // A process killed on the timeout or over the output cap has no
            // exit status of its own; 1 stands in, and the sentence below is
            // where the truth of it actually is.
            code: typeof error.code === "number" ? error.code : 1,
            stderr: stderr.trim() === "" ? messageOf(error) : stderr,
          });
        },
      );
    } catch (error) {
      // `execFile` refuses some arguments before git is anywhere near — a NUL
      // byte inside a path is the reachable one — and it refuses them by
      // throwing. This module answers with values, so that becomes one.
      resolve({ kind: "failed", code: 1, stderr: messageOf(error) });
    }
  });
}

/**
 * The repository root holding a path, or null when the path is in none.
 *
 * IT IS ASKED OF GIT AND NOT WALKED FOR, unlike the branch in `./git.js`: this
 * is the root every other function in this module measures its paths against,
 * and git's own answer is the one those paths will be resolved against. A walk
 * that guessed differently — over a symlinked checkout, inside a linked
 * worktree — would put every later path one folder out.
 *
 * Not being in a repository is an ordinary state of a project, not a failure.
 */
export async function repositoryRoot(startPath: string): Promise<string | null> {
  const answer = await runGit(startPath, ["rev-parse", "--show-toplevel"]);
  if (answer.kind !== "ok") {
    return null;
  }
  const root = answer.stdout.trim();
  return root === "" ? null : root;
}

/**
 * Whether anything under any of `relPaths` is uncommitted — the question behind
 * whether the button is worth offering.
 *
 * ONE STATUS FOR ALL THE PATHS, because the answer is one boolean: git takes
 * every pathspec at once and prints the union, and asking it once per path
 * would spawn a process to learn nothing the first one did not already say.
 *
 * A PATH THAT IS NOWHERE IS NOT AN ERROR HERE. `status` under a pathspec that
 * matches nothing is silent and exits 0 — unlike `add` and `commit`, which both
 * refuse one — so the approval ledger's folder can be asked about on every
 * glance at a project that has never approved anything and has no such folder
 * yet. Only a path outside the repository fails at all, and that reads as not
 * dirty like every other failure here — the last paragraph below.
 *
 * AN UNTRACKED FILE COUNTS, which is what `--untracked-files=all` is for: a
 * node somebody just wrote has never been added, and it is exactly the change
 * this whole feature exists to record. `all` names each file rather than
 * collapsing a folder git has never seen down to the folder, so the answer does
 * not turn on where the new files happen to sit.
 *
 * `--porcelain=v1` is named rather than left to default, because the default is
 * git's to change; all this asks is whether the output is empty, and naming the
 * version is what keeps that a stable question. The output itself is never
 * read for what it says — see `commitPaths` for why nothing here parses it.
 *
 * A git that failed, or is not there, reads as NOT DIRTY. The button it feeds
 * would offer to commit something Shall cannot see, and offering nothing is the
 * better half of that mistake.
 */
export async function isDirtyUnder(
  root: string,
  relPaths: readonly string[],
): Promise<boolean> {
  const answer = await runGit(root, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    ...relPaths,
  ]);
  return answer.kind === "ok" && answer.stdout.trim() !== "";
}

/**
 * Whether this machine knows who its commits are by. `--get` on a key nobody
 * set exits non-zero, so a `failed` answer here is the ordinary way of saying
 * "unset" and not a fault.
 *
 * IT ASKS THE CONFIG AND NOT GIT'S GUESS. Given no `user.name`, git will invent
 * one out of the account and the hostname and commit under it — and a spec
 * history signed `yjshin@laptop.(none)` names nobody, while one signed Shall at
 * least says which hand did it.
 */
async function hasIdentity(root: string): Promise<boolean> {
  for (const key of ["user.email", "user.name"]) {
    const answer = await runGit(root, ["config", "--get", key]);
    if (answer.kind !== "ok" || answer.stdout.trim() === "") {
      return false;
    }
  }
  return true;
}

/** Only ever passed when the machine has no identity of its own. */
const SHALL_IDENTITY = [
  "-c",
  "user.name=Shall",
  "-c",
  "user.email=shall@local",
] as const;

/**
 * Everything under `relPaths`, staged and committed in ONE commit under the
 * message a person gave. The only write this module makes, and it makes it
 * because somebody pressed a button.
 *
 * `commit -- <pathspec>` IS A PARTIAL COMMIT, AND THAT IS THE POINT. Whatever
 * else a person has staged stays staged and stays out of this commit: the
 * button records the spec and the ledger beside it and nothing else. A daemon
 * that swept up somebody's half-staged refactor because it happened to be in
 * the index would be the last time they pressed it.
 *
 * THE PATHS ARE FILTERED DOWN TO THE ONES THAT ACTUALLY MOVED, BECAUSE GIT
 * REFUSES A PATHSPEC THAT NAMES NOTHING. `add -A -- <path>` is fatal on a
 * pathspec matching neither the worktree nor the index — a folder that is not
 * there at all, which is exactly the approval ledger of a project nobody has
 * approved anything in — and it takes the whole `add` down with it; `commit --
 * <path>` fails on a pathspec the index and HEAD have never heard of, an
 * untracked empty folder included. A path with a change in it is by
 * construction known to both, so filtering by `isDirtyUnder` leaves only
 * pathspecs both commands accept. A tracked folder somebody deleted whole
 * survives the filter and both commands: the index still matches it, and the
 * commit records the deletion.
 *
 * THE FILTER ASKS ONE PATH AT A TIME AND NEVER READS THE STATUS OUTPUT. Which
 * of several paths moved cannot be told from the union `isDirtyUnder` already
 * asks for, and picking the answer back out of the porcelain lines would mean
 * parsing them — where a path with a byte above ASCII arrives quoted and
 * escaped, and a rename arrives as `old -> new`, two paths on one line. A
 * second question per path is cheaper than being wrong about a path's name.
 *
 * THE IDENTITY IS SUPPLIED, NEVER OVERRIDDEN. Shall's own pair goes on the
 * front of the argv only when the machine has neither name nor email of its
 * own — a fresh container, a CI checkout — so that everywhere there is a person
 * to name, the commit is theirs.
 *
 * SIGNING IS THE PERSON'S SETTING AND ITS FAILURE IS THEIR NEWS. `commit.gpgsign`
 * runs their key, and a key that is locked or gone fails the commit; it arrives
 * here as an ordinary `failed` answer carrying git's own stderr, which is what
 * the caller shows.
 *
 * ONE RACE IS NAMED AND NOT FOUGHT: a file that goes away between the filter
 * and the `add` turns a matched pathspec back into an unmatched one, and the
 * answer is git's own failure sentence. There is no retry — the person pressed
 * the button once, and the honest thing is to show them what git said rather
 * than to commit some other tree than the one they were looking at.
 *
 * Nothing dirty means nothing is spawned at all, and the answer wears git's own
 * words for it. Callers ask `isDirtyUnder` first, so this is the floor and not
 * the ordinary path.
 */
export async function commitPaths(
  root: string,
  relPaths: readonly string[],
  message: string,
): Promise<GitAnswer> {
  const dirty: string[] = [];
  for (const rel of relPaths) {
    if (await isDirtyUnder(root, [rel])) {
      dirty.push(rel);
    }
  }
  if (dirty.length === 0) {
    // git's opening words for this, with the rest of its sentence left off:
    // what follows in git's own output ("working tree clean") is a claim about
    // the whole tree, and this is a claim about these paths.
    return { kind: "failed", code: 1, stderr: "nothing to commit" };
  }
  // `-A` under a pathspec, so a node file somebody deleted by hand is staged as
  // the deletion it is. Anything outside `dirty` is untouched.
  const staged = await runGit(root, ["add", "-A", "--", ...dirty]);
  if (staged.kind !== "ok") {
    return staged;
  }
  const identity = (await hasIdentity(root)) ? [] : SHALL_IDENTITY;
  return runGit(root, [
    ...identity,
    "commit",
    "-m",
    message,
    "--",
    ...dirty,
  ]);
}

/** How far back a caller is served when it does not say. */
const HISTORY_LIMIT = 50;

/**
 * The commits that touched one file, newest first — the list an approval walks
 * looking for the version whose bytes its hash still fits.
 *
 * The walk is bounded because it is a search with a stopping condition: a hash
 * that matches none of the last fifty versions of a file is not going to be
 * found by reading the fifty before those, and the caller has a better answer
 * for a person than an unbounded wait.
 */
export async function fileHistory(
  root: string,
  relPath: string,
  limit?: number,
): Promise<string[]> {
  const answer = await runGit(root, [
    "log",
    "--format=%H",
    `--max-count=${limit ?? HISTORY_LIMIT}`,
    "--",
    relPath,
  ]);
  if (answer.kind !== "ok") {
    return [];
  }
  return answer.stdout.split("\n").filter((line) => line !== "");
}

/**
 * One file's bytes as of one commit, or null when that commit has no such file.
 *
 * `<ref>:<path>` reads from the root of the tree, which is why the path rule at
 * the top of this file is a rule — see the header for what getting it wrong
 * looks like, which is this function politely answering null.
 *
 * A REF WITH NO ANSWER IS NULL AND NOT AN ERROR, and `<sha>^` on a root commit
 * is the case that matters: asking what a file looked like before the commit
 * that first added it is a perfectly ordinary question whose answer is
 * "nothing was there".
 */
export async function fileAt(
  root: string,
  ref: string,
  relPath: string,
): Promise<string | null> {
  const answer = await runGit(root, ["show", `${ref}:${relPath}`]);
  return answer.kind === "ok" ? answer.stdout : null;
}

/** As far back as a lost file is looked for by its id alone. */
const SEARCH_LIMIT = 200;

/**
 * Where a bare id last lived, found by searching the history for a file named
 * after it under any band and any type.
 *
 * THIS IS HOW A DELETED NODE IS FOUND WITHOUT CORE TEACHING THIS MODULE THE
 * LAYOUT. A restore starts from an id and nothing else — the file is gone, so
 * there is no folder to read the type out of — and `<band>/<Type>/<id>.md` is
 * `core/store`'s knowledge, not the daemon's. The one thing named here is the
 * SHAPE: two folders deep under the spec folder, which is a fact about paths
 * rather than about the canon, and it stays true as bands and types come and
 * go.
 *
 * `:(glob)` is a magic pathspec, so `*` stops at a `/` and the two stars are
 * exactly two folders. It is one argv element and no shell is involved, so
 * there is nothing to quote and nothing that could expand it on the way.
 */
export async function pathForId(
  root: string,
  relSpecDir: string,
  id: string,
): Promise<string | null> {
  const answer = await runGit(root, [
    "log",
    `--max-count=${SEARCH_LIMIT}`,
    "--name-only",
    "--format=",
    "--",
    `:(glob)${relSpecDir}/*/*/${id}.md`,
  ]);
  if (answer.kind !== "ok") {
    return null;
  }
  // `--format=` leaves a blank line where each commit's message would be, and
  // the newest commit that named the file comes first — which is the path the
  // id most recently had, the one a restore should come back to.
  return answer.stdout.split("\n").find((line) => line !== "") ?? null;
}

/**
 * The last commit that touched a file, which for a file that is no longer there
 * is the commit that REMOVED it — so `<sha>^` is where its final contents are.
 * That pairing is the whole of restoring a file somebody deleted by hand.
 */
export async function lastCommitTouching(
  root: string,
  relPath: string,
): Promise<string | null> {
  const answer = await runGit(root, ["rev-list", "-1", "HEAD", "--", relPath]);
  if (answer.kind !== "ok") {
    return null;
  }
  const sha = answer.stdout.trim();
  return sha === "" ? null : sha;
}

/**
 * A fresh repository in a folder, so a project made outside one has a history
 * to record into from its first commit.
 *
 * `--quiet` because the hint git prints about default branch names is a message
 * for a terminal, and there is nobody at one. Re-running it over a repository
 * that already exists is git's own no-op, not an error.
 */
export async function initRepository(folder: string): Promise<GitAnswer> {
  return runGit(folder, ["init", "--quiet"]);
}
