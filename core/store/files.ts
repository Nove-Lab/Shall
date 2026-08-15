import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";

/**
 * The filesystem manners every door in `core/store` keeps.
 *
 * ONE ANSWER TO EACH FILESYSTEM QUESTION, SETTLED ONCE. Whether a thing that is
 * not there is a failure, what an errno says in English, how bytes become text,
 * how text becomes a file no reader catches half-written, and whose turn it is
 * to write — all of it here, so that the spec folder's doors and the approval
 * ledger's door behave the same way and a second copy of any of it cannot drift.
 *
 * NOTHING HERE REFUSES. These helpers hand back a reading or throw whatever the
 * filesystem threw; the door above turns that into one of `core/store`'s
 * refusals, because only the door knows what was being attempted and what it
 * cost.
 */

/**
 * A folder that is not there is a graph with nothing in it, not a failure: a
 * fresh `shall init` has no type folders at all, and git does not carry an empty
 * one, so the first node of a project is written into a folder that does not
 * exist yet. `ENOTDIR` joins it — a `spec` that is somehow a file has no
 * entries either, and the check-and-then-read race is worse than the answer.
 */
export function isAbsent(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/**
 * Why the filesystem said no, in words a person can act on.
 *
 * AN ERRNO IS NOT A SENTENCE. These strings end up inside refusals a person
 * reads in a panel or under `shall check`, where this codebase says what
 * happened in English rather than handing over a code to look up. The mapped
 * ones are the codes a spec folder actually produces — a permission bit, a
 * symlink pointing at a folder, a path with a file part-way along it.
 *
 * The unmapped tail keeps the code, deliberately. Something nobody anticipated
 * has gone wrong, and inventing a soothing English phrase for it would tell the
 * person less than the four letters their operating system already documents.
 */
export function describeFailure(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  switch (code) {
    case "EACCES":
    case "EPERM":
      return "the filesystem refused permission";
    case "EISDIR":
      return "it is a folder and not a file";
    case "ENOTDIR":
      return "something along its path is a file and not a folder";
    case "EEXIST":
      return "something already stands where a folder along its path would go";
    case "ELOOP":
      return "its symbolic links lead in a circle";
    case "ENAMETOOLONG":
      return "its name is longer than the filesystem allows";
    default:
      return typeof code === "string"
        ? `the filesystem answered ${code}`
        : "the filesystem refused it";
  }
}

/**
 * Bytes decoded STRICTLY, which `readFile(path, "utf8")` is not.
 *
 * That one answers a malformed byte with U+FFFD and no complaint, so a file
 * saved by a Latin-1 editor would load as a node whose name is quietly not the
 * name in the file — and the first save from the panel would write the
 * replacement character down and lose the original byte with nothing to undo.
 * A file this module cannot read faithfully is a file it refuses to read at all.
 */
const UTF8 = new TextDecoder("utf-8", { fatal: true });

/**
 * One file's text, or why there is none. `absent` is not a problem: nobody
 * asked about a file that is not there, and a file that vanished between the
 * listing and the read is the ordinary shape of an agent working in the folder.
 */
export type TextReading =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "absent" }
  /** A clause, not a sentence: each caller says what it cost. */
  | { readonly kind: "unreadable"; readonly because: string };

export async function readText(absolutePath: string): Promise<TextReading> {
  let bytes: Buffer;
  try {
    bytes = await readFile(absolutePath);
  } catch (error) {
    if (isAbsent(error)) {
      return { kind: "absent" };
    }
    return { kind: "unreadable", because: describeFailure(error) };
  }
  try {
    return { kind: "text", text: UTF8.decode(bytes) };
  } catch {
    return { kind: "unreadable", because: "it is not valid UTF-8 text" };
  }
}

/**
 * Written beside the file and moved onto it, so a reader — the panel, another
 * agent, `git status` — never meets a half-written node. A `.tmp` left behind
 * by a crash is ignored by the loader rather than read as a node.
 *
 * THE NAME IS UNIQUE PER WRITE AND NOT PER PROCESS. The pid says who is
 * writing, which is worth knowing when a stray file turns up, but it is not
 * enough on its own to say WHICH write: two daemons in separate pid namespaces
 * over one mounted volume, or one pid reused after the first daemon died, would
 * share the name — and two writers sharing a temp path is one of them
 * truncating the other's bytes and the loser renaming a file that is no longer
 * there. The random tail costs nothing and removes the question.
 */
export async function writeBytes(target: string, text: string): Promise<void> {
  const temporary = `${target}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    await writeFile(temporary, text, "utf8");
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** The tail of the queue for each key, so the next turn can join it. */
const queues = new Map<string, Promise<unknown>>();

/**
 * ONE TURN PER KEY, AND A TURN MAY NOT WAIT ON ITS OWN KEY. The key is whatever
 * a write is the unit of work over — a resolved spec folder for the node files
 * inside it, a resolved path for the approval ledger — and the turns holding one
 * key run one after another in the order they arrived. Two different keys never
 * wait on each other, so a door queueing on a file and a door queueing on the
 * folder above it cannot deadlock; what does deadlock is a `run` that calls back
 * in on its own key, because the turn it would be waiting for is the turn it is.
 * The helpers under the doors take the resolved folder or file they were handed
 * instead of asking for a turn of their own.
 *
 * A single rename never needed this. A read-modify-write is a different animal
 * — the await between reading a file and rewriting it is a gap another write
 * would slip into, and two writes that both read the same file before either
 * rewrote it would leave the second one's version standing with the first one's
 * change gone. Queuing removes the gaps rather than teaching every caller to
 * retry, and it is what the architecture already claims: the daemon is the
 * single Shall process writing these files.
 *
 * READS DO NOT QUEUE. `loadGraph` never waits for a write, because a write
 * lands by rename and a reader therefore sees one whole version of a file or
 * another — never half of one. That is also the arrangement that keeps an agent
 * editing the folder from being a party this queue has to know about.
 */
export async function withQueue<T>(
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  const ahead = queues.get(key) ?? Promise.resolve();
  // A write that failed is still a write that finished, so the queue moves on.
  const turn = ahead.catch(() => undefined).then(run);
  queues.set(key, turn);
  return turn;
}
