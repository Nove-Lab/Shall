import assert from "node:assert/strict";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import { watchShallFolder } from "./spec-watcher.js";

/**
 * The watch under a project's `.shall` folder.
 *
 * THE FIRST TEST IS THE ONE THAT MATTERS. A watch registered per FILE — which
 * is what `fs.watch(dir, { recursive: true })` is on Linux — hears the first
 * write to a path and nothing after it, because every write in this system
 * lands as a temporary file and is renamed onto its target, replacing the inode
 * the watch was holding. That failure is invisible to a test that writes once,
 * and it is the whole reason this module watches directories instead.
 */

const stops: (() => void)[] = [];

afterEach(() => {
  while (stops.length > 0) {
    stops.pop()?.();
  }
});

/** A watch whose changes can be waited for, one at a time. */
function watching(shallPath: string): {
  next: (within?: number) => Promise<"changed" | "failed" | "silence">;
} {
  const queue: ("changed" | "failed")[] = [];
  let waiting: ((answer: "changed" | "failed") => void) | null = null;
  const push = (answer: "changed" | "failed"): void => {
    if (waiting !== null) {
      const resume = waiting;
      waiting = null;
      resume(answer);
      return;
    }
    queue.push(answer);
  };
  stops.push(
    watchShallFolder(
      shallPath,
      () => push("changed"),
      () => push("failed"),
    ),
  );
  return {
    next: async (within = 2_000) => {
      const held = queue.shift();
      if (held !== undefined) {
        return held;
      }
      return new Promise<"changed" | "failed" | "silence">((resolve) => {
        const timer = setTimeout(() => {
          waiting = null;
          resolve("silence");
        }, within);
        waiting = (answer) => {
          clearTimeout(timer);
          resolve(answer);
        };
      });
    },
  };
}

/** The way the store writes: beside the target, then renamed onto it. */
async function writeByRename(target: string, text: string): Promise<void> {
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, text, "utf8");
  await rename(temporary, target);
}

async function newShall(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "shall-watch-"));
  const shallPath = path.join(root, ".shall");
  await mkdir(path.join(shallPath, "spec", "intent", "Goal"), {
    recursive: true,
  });
  return shallPath;
}

describe("watching a project's folder", () => {
  test("a second write to one file is heard as loudly as the first", async () => {
    const shallPath = await newShall();
    const node = path.join(shallPath, "spec", "intent", "Goal", "G-0001.md");
    const watch = watching(shallPath);

    await writeByRename(node, "first");
    assert.equal(await watch.next(), "changed");

    // The write that a per-file watch would sleep through: the inode it was
    // holding went with the first rename.
    await writeByRename(node, "second");
    assert.equal(await watch.next(), "changed");

    await writeByRename(node, "third");
    assert.equal(await watch.next(), "changed");
  });

  test("a folder that arrives later is watched too", async () => {
    const shallPath = await newShall();
    const watch = watching(shallPath);

    // The ledger arrives with the first approval and a type folder with the
    // first node of its type, so a folder that was not there at the start is
    // the ordinary case rather than the exotic one.
    const ledger = path.join(shallPath, "ledger");
    await mkdir(ledger, { recursive: true });
    assert.equal(await watch.next(), "changed");

    await writeByRename(path.join(ledger, "approvals.yaml"), "G-0001: {}\n");
    assert.equal(await watch.next(), "changed");
  });

  test("a burst of writes is one change", async () => {
    const shallPath = await newShall();
    const folder = path.join(shallPath, "spec", "intent", "Goal");
    const watch = watching(shallPath);

    await writeByRename(path.join(folder, "G-0001.md"), "one");
    await writeByRename(path.join(folder, "G-0002.md"), "two");
    await writeByRename(path.join(folder, "G-0003.md"), "three");

    assert.equal(await watch.next(), "changed");
    // Three files, one sentence: what a reader wants to know is that the folder
    // moved, and a screen redrawn three times is the same screen.
    assert.equal(await watch.next(400), "silence");
  });

  test("a temporary file on its own is not a change", async () => {
    const shallPath = await newShall();
    const folder = path.join(shallPath, "spec", "intent", "Goal");
    const watch = watching(shallPath);
    // macOS hands a new watch the writes made just before it — here the mkdir
    // that built the folder — so this waits that out. Every other test writes
    // something the watch must speak about, which swallows the same noise; a
    // test whose whole answer is silence has to start from silence.
    while ((await watch.next(400)) !== "silence") {
      /* what building the folder left behind */
    }

    await writeFile(path.join(folder, "G-0001.md.9.tmp"), "half a file", "utf8");

    assert.equal(await watch.next(400), "silence");
  });

  test("a folder that goes away is let go, and what is left is still heard", async () => {
    const shallPath = await newShall();
    const intent = path.join(shallPath, "spec", "intent");
    const watch = watching(shallPath);

    // A type folder emptied and removed — by a `git checkout` of a branch that
    // never had it, or by a person in a file manager.
    await rm(path.join(intent, "Goal"), { recursive: true });
    assert.equal(await watch.next(), "changed");

    // The watch on the folder that went is dropped rather than kept as a
    // descriptor on a dead inode, and the folders still there still speak.
    await writeByRename(path.join(intent, "notes.md"), "still here");
    assert.equal(await watch.next(), "changed");
  });

  test("a stop inside a burst takes the pending change with it", async () => {
    const shallPath = await newShall();
    const folder = path.join(shallPath, "spec", "intent", "Goal");
    let changes = 0;
    const stop = watchShallFolder(
      shallPath,
      () => {
        changes += 1;
      },
      () => assert.fail("a watch that was stopped failed"),
    );
    stops.push(stop);

    await writeByRename(path.join(folder, "G-0001.md"), "one");
    // Long enough that the event has certainly arrived and short enough that
    // the burst has not settled: the timer is pending when the stop lands.
    await new Promise((resolve) => setTimeout(resolve, 60));
    stop();

    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(changes, 0);
  });

  test("stopping is silence, and stopping twice is allowed", async () => {
    const shallPath = await newShall();
    const folder = path.join(shallPath, "spec", "intent", "Goal");
    const stop = watchShallFolder(
      shallPath,
      () => assert.fail("a stopped watch spoke"),
      () => assert.fail("a stopped watch failed"),
    );
    stop();
    stop();

    await writeByRename(path.join(folder, "G-0001.md"), "after");
    await new Promise((resolve) => setTimeout(resolve, 400));
  });

  test("a folder that is not there fails rather than watching nothing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "shall-watch-"));
    const missing = path.join(root, ".shall");
    const watch = watching(missing);

    assert.equal(await watch.next(), "failed");
    await rm(root, { recursive: true, force: true });
  });
});
