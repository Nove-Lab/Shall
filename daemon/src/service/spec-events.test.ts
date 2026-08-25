import assert from "node:assert/strict";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { isRefusal } from "./errors.js";
import { createProject } from "./projects.js";
import { closeAllFeeds, subscribe } from "./spec-events.js";

/**
 * The feed a browser listens to, over a real folder.
 *
 * WHAT IS PINNED HERE IS THE LIFETIME. One watch however many listeners, no
 * watch once the last one leaves, and an id nobody knows refused before any
 * descriptor is taken. The daemon has never held an operating-system resource
 * across requests before, so the rule for giving it back is the thing worth
 * a test.
 */

let home = "";
let workspace = "";

before(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "shall-events-"));
  home = path.join(workspace, "home");
  await mkdir(home, { recursive: true });
  // `getShallHome` reads `os.homedir()` on every call, so this redirects the
  // registry without a seam that exists only for tests; git is told to ignore
  // the machine's own config because `createProject` runs `git init`.
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = path.join(home, ".config");
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});

after(() => closeAllFeeds());

async function newProject(): Promise<{ id: string; path: string }> {
  return createProject(await mkdtemp(path.join(workspace, "project-")));
}

/** The way the store writes, so the watcher sees what it would really see. */
async function writeNode(projectPath: string, id: string): Promise<void> {
  const folder = path.join(projectPath, ".shall", "spec", "intent", "Goal");
  await mkdir(folder, { recursive: true });
  const target = path.join(folder, `${id}.md`);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `---\nshort_name: a\nname: a\n---\n`, "utf8");
  await rename(temporary, target);
}

/** One change, or the word for nothing arriving in time. */
function heard(): {
  listener: { changed: () => void; failed: (reason: string) => void };
  next: (within?: number) => Promise<"changed" | "failed" | "silence">;
  count: () => number;
} {
  const queue: ("changed" | "failed")[] = [];
  let waiting: ((answer: "changed" | "failed") => void) | null = null;
  let heardCount = 0;
  const push = (answer: "changed" | "failed"): void => {
    heardCount += 1;
    if (waiting !== null) {
      const resume = waiting;
      waiting = null;
      resume(answer);
      return;
    }
    queue.push(answer);
  };
  return {
    listener: { changed: () => push("changed"), failed: () => push("failed") },
    count: () => heardCount,
    next: async (within = 2_000) => {
      const held = queue.shift();
      if (held !== undefined) {
        return held;
      }
      return new Promise((resolve) => {
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

describe("a project's feed", () => {
  test("a file written by anything at all reaches a listener", async () => {
    const project = await newProject();
    const listener = heard();
    const release = await subscribe(project.id, listener.listener);

    await writeNode(project.path, "G-0001");

    assert.equal(await listener.next(), "changed");
    release();
  });

  test("two listeners are told once each, and the folder is watched once", async () => {
    const project = await newProject();
    const first = heard();
    const second = heard();
    const releaseFirst = await subscribe(project.id, first.listener);
    const releaseSecond = await subscribe(project.id, second.listener);

    await writeNode(project.path, "G-0001");

    assert.equal(await first.next(), "changed");
    assert.equal(await second.next(), "changed");
    // One watch and not two: a second watch would report the same write again.
    assert.equal(await first.next(400), "silence");
    assert.equal(first.count(), 1);
    assert.equal(second.count(), 1);

    releaseFirst();
    releaseSecond();
  });

  test("the last listener out closes the watch", async () => {
    const project = await newProject();
    const listener = heard();
    const release = await subscribe(project.id, listener.listener);
    await writeNode(project.path, "G-0001");
    assert.equal(await listener.next(), "changed");

    release();
    await writeNode(project.path, "G-0002");

    assert.equal(await listener.next(400), "silence");
  });

  test("one listener leaving does not take the other's watch with it", async () => {
    const project = await newProject();
    const staying = heard();
    const leaving = heard();
    const releaseStaying = await subscribe(project.id, staying.listener);
    const releaseLeaving = await subscribe(project.id, leaving.listener);

    releaseLeaving();
    await writeNode(project.path, "G-0001");

    assert.equal(await staying.next(), "changed");
    assert.equal(leaving.count(), 0);
    releaseStaying();
  });

  test("releasing twice is allowed and closes nothing twice", async () => {
    const project = await newProject();
    const listener = heard();
    const release = await subscribe(project.id, listener.listener);
    release();
    release();

    const second = heard();
    const releaseSecond = await subscribe(project.id, second.listener);
    await writeNode(project.path, "G-0001");
    assert.equal(await second.next(), "changed");
    releaseSecond();
  });

  test("a release left over from a feed the shutdown closed does not take the new one with it", async () => {
    const project = await newProject();
    const first = heard();
    const release = await subscribe(project.id, first.listener);
    closeAllFeeds();
    assert.equal(await first.next(), "failed");

    // A second listener arrives afterwards and builds a watch of its own. The
    // first one's release, called late, is about a feed nobody holds any more,
    // and the last shutdown of the run is what says the new one is still held:
    // a feed that release had closed would have nobody left to tell.
    const second = heard();
    await subscribe(project.id, second.listener);
    release();

    closeAllFeeds();
    assert.equal(await second.next(), "failed");
  });

  test("a project whose folder has gone is refused, and the ask after it is back is watched", async () => {
    // The registry outlives the folder it points at, so this is an ordinary
    // state and not a broken one: there is nothing to watch, and a stream over
    // a folder nothing is watching is a screen that has quietly stopped being
    // true. Refusing is also the way back — the browser gives up on a refusal
    // and retries a connection that merely opened and closed, for ever.
    const project = await newProject();
    const shall = path.join(project.path, ".shall");
    await rm(shall, { recursive: true, force: true });
    const lost = heard();
    await assert.rejects(subscribe(project.id, lost.listener), (error: unknown) => {
      assert.ok(isRefusal(error));
      assert.equal(error.kind, "conflict");
      assert.equal(
        error.message,
        `Shall could not watch ${shall}, so nothing on this project's screen would stay true. Nothing is listening.`,
      );
      return true;
    });
    assert.equal(lost.count(), 0);

    // The folder comes back — a clone, a checkout, a folder moved back — and
    // the next ask builds a watch, because the refused one left nothing behind
    // for it to join.
    await mkdir(path.join(shall, "spec", "intent", "Goal"), { recursive: true });
    const listener = heard();
    const release = await subscribe(project.id, listener.listener);
    await writeNode(project.path, "G-0001");
    assert.equal(await listener.next(), "changed");
    release();
  });

  test("an id nobody knows is refused before a watch is taken", async () => {
    const listener = heard();
    await assert.rejects(
      subscribe("01ABCDEFGHIJKLMNOPQRSTUVWX", listener.listener),
      (error: unknown) => isRefusal(error) && error.kind === "missing",
    );
  });

  test("shutting down tells every listener the feed is over", async () => {
    const project = await newProject();
    const listener = heard();
    await subscribe(project.id, listener.listener);

    closeAllFeeds();

    assert.equal(await listener.next(), "failed");
    // And the folder is no longer watched: a write after the fact says nothing.
    await writeNode(project.path, "G-0009");
    assert.equal(await listener.next(400), "silence");
  });
});
