import assert from "node:assert/strict";
import { mkdir, mkdtemp, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { createProject } from "../service/projects.js";
import { closeAllFeeds } from "../service/spec-events.js";
import { createApp } from "./app.js";

/**
 * The one route that streams rather than answers.
 *
 * WHAT IS TESTED THROUGH HTTP IS WHAT ONLY HTTP CAN SAY: that a browser is
 * given a stream and not a document, and that an id nobody knows is REFUSED
 * rather than opened — because `EventSource` retries a connection that opened
 * and closed for ever, and gives up on one that was refused. The feed's own
 * behaviour is tested where it lives, in `service/spec-events.test.ts`, which
 * is one moving part fewer.
 */

let home = "";
let workspace = "";

before(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "shall-http-"));
  home = path.join(workspace, "home");
  await mkdir(home, { recursive: true });
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = path.join(home, ".config");
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});

after(() => closeAllFeeds());

/** Reads the stream until it holds `wanted`, or gives up rather than hanging. */
async function readUntil(
  body: ReadableStream<Uint8Array>,
  wanted: string,
  within = 3_000,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let seen = "";
  const deadline = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`waited for ${wanted}, saw: ${seen}`)),
      within,
    );
    timer.unref();
  });
  try {
    while (!seen.includes(wanted)) {
      const step = (await Promise.race([reader.read(), deadline])) as {
        done: boolean;
        value?: Uint8Array;
      };
      if (step.done) {
        throw new Error(`stream ended, saw: ${seen}`);
      }
      seen += decoder.decode(step.value, { stream: true });
    }
    return seen;
  } finally {
    // Cancelling is what tells the handler its reader has gone, which is what
    // releases the watch — without it the runner would wait on a live feed.
    await reader.cancel();
  }
}

describe("the health route", () => {
  test("carries the bind host and the procedures served, as the build marker", async () => {
    const app = createApp("127.0.0.1");

    const response = await app.request("http://localhost/health");

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      ok: boolean;
      host: string;
      procedures: string[];
    };
    assert.equal(body.ok, true);
    assert.equal(body.host, "127.0.0.1");
    // Non-empty and holding the two the CLI leans on hardest: an empty list
    // here would read as "everything is missing" to a knocking CLI, so a tRPC
    // upgrade that hides the router's record fails HERE and not in the field.
    assert.ok(body.procedures.length > 0);
    assert.ok(body.procedures.includes("spec.status"));
    assert.ok(body.procedures.includes("spec.board"));
    // Sorted, so the marker's bytes are stable across restarts of one build.
    assert.deepEqual(body.procedures, [...body.procedures].sort());
  });
});

describe("the events route", () => {
  test("a project is given a stream, and the first line says it is open", async () => {
    const project = await createProject(
      await mkdtemp(path.join(workspace, "project-")),
    );
    const app = createApp("127.0.0.1");

    const response = await app.request(
      `/api/projects/${encodeURIComponent(project.id)}/events`,
    );

    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-type") ?? "",
      /^text\/event-stream/,
    );
    assert.ok(response.body !== null);
    const opening = await readUntil(response.body, "event: open");
    // The retry is the browser's instruction for a daemon that restarts.
    assert.match(opening, /retry: 1000/);
  });

  test("a file written under .shall arrives as a change", async () => {
    const project = await createProject(
      await mkdtemp(path.join(workspace, "project-")),
    );
    const app = createApp("127.0.0.1");

    const response = await app.request(
      `/api/projects/${encodeURIComponent(project.id)}/events`,
    );
    assert.ok(response.body !== null);

    const folder = path.join(project.path, ".shall", "spec", "intent", "Goal");
    await mkdir(folder, { recursive: true });
    const target = path.join(folder, "G-0001.md");
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, "---\nshort_name: a\nname: a\n---\n", "utf8");
    await rename(temporary, target);

    const seen = await readUntil(response.body, "event: change");
    assert.match(seen, /"at":"\d{4}-\d{2}-\d{2}T/);
  });

  test("an id nobody knows is refused, not opened", async () => {
    const app = createApp("127.0.0.1");

    const response = await app.request(
      "/api/projects/01ABCDEFGHIJKLMNOPQRSTUVWX/events",
    );

    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /Unknown project/);
  });
});
