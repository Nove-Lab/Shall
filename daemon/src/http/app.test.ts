import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { createProject } from "../service/projects.js";
import { closeAllFeeds } from "../service/spec-events.js";
import { createApp } from "./app.js";

/**
 * The one route that streams rather than answers, and the doors beside it.
 *
 * WHAT IS TESTED THROUGH HTTP IS WHAT ONLY HTTP CAN SAY: that a browser is
 * given a stream and not a document, and that an id nobody knows is REFUSED
 * rather than opened — because `EventSource` retries a connection that opened
 * and closed for ever, and gives up on one that was refused. The feed's own
 * behaviour is tested where it lives, in `service/spec-events.test.ts`, which
 * is one moving part fewer.
 *
 * The rest of what is held here is the same shape of fact: the status a body
 * or a refusal leaves with, since a status is the one thing the service does
 * not decide and cannot be tested for anywhere else.
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

/**
 * A fault is printed before it is answered, and the run reads better without
 * the stack — so the tests that ask for one borrow the console back.
 */
async function quietly(
  work: () => Response | Promise<Response>,
): Promise<Response> {
  const spoke = console.error;
  console.error = () => undefined;
  try {
    return await work();
  } finally {
    console.error = spoke;
  }
}

/** A POST with a JSON body, which is how both write doors are reached. */
function posting(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

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

  test("a feed closed under an open stream says why before it ends", async () => {
    const project = await createProject(
      await mkdtemp(path.join(workspace, "project-")),
    );
    const app = createApp("127.0.0.1");

    const response = await app.request(
      `/api/projects/${encodeURIComponent(project.id)}/events`,
    );
    assert.ok(response.body !== null);
    // Read first, close second: the frame is written into a stream nobody has
    // pulled from yet, and it has to survive the close that follows it — a
    // stream that ends with no `over` is a browser reconnecting for ever with
    // nothing said to it.
    const reading = readUntil(response.body, "event: over");
    closeAllFeeds();

    assert.match(await reading, /"reason":"Shall is shutting down\."/);
  });

  test("a registry that cannot be read is a fault, not a refusal", async () => {
    const registryPath = path.join(home, ".shall", "registry.json");
    const written = await readFile(registryPath, "utf8");
    const app = createApp("127.0.0.1");

    await writeFile(registryPath, "{", "utf8");
    try {
      const response = await quietly(() =>
        app.request("/api/projects/01ABCDEFGHIJKLMNOPQRSTUVWX/events"),
      );

      // 500 and not 404: the id may well be a good one, and the sentence must
      // not tell the person to fix something that is not theirs to fix.
      assert.equal(response.status, 500);
      const body = (await response.json()) as { error: string };
      assert.match(
        body.error,
        /Shall could not watch 01ABCDEFGHIJKLMNOPQRSTUVWX/,
      );
    } finally {
      await writeFile(registryPath, written, "utf8");
    }
  });
});

describe("the folder picker's routes", () => {
  test("browse answers the visible children, and which of them are projects", async () => {
    const root = await mkdtemp(path.join(workspace, "browse-"));
    await mkdir(path.join(root, "plain"));
    await mkdir(path.join(root, ".hidden"));
    const opened = path.join(root, "opened");
    await mkdir(opened);
    await createProject(opened);
    const app = createApp("127.0.0.1");

    const response = await app.request(
      `/api/fs/browse?path=${encodeURIComponent(root)}`,
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      path: string;
      parent: string | null;
      shall: string;
      directories: { name: string; shall: string }[];
    };
    assert.equal(body.path, root);
    assert.equal(body.parent, path.dirname(root));
    assert.equal(body.shall, "none");
    assert.deepEqual(
      body.directories.map((entry) => [entry.name, entry.shall]),
      [
        ["opened", "project"],
        ["plain", "none"],
      ],
    );
  });

  test("with no path in the query, browse starts at home", async () => {
    const app = createApp("127.0.0.1");

    const response = await app.request("/api/fs/browse");

    assert.equal(response.status, 200);
    const body = (await response.json()) as { path: string; shall: string };
    assert.equal(body.path, home);
    // Shall's own home wears the same `.shall` name a project does, and the
    // picker has to be told it is not one.
    assert.equal(body.shall, "root");
  });

  test("a path that is not a folder leaves as one sentence", async () => {
    const file = path.join(workspace, "not-a-folder.txt");
    await writeFile(file, "", "utf8");
    const app = createApp("127.0.0.1");

    const response = await quietly(() =>
      app.request(`/api/fs/browse?path=${encodeURIComponent(file)}`),
    );

    assert.equal(response.status, 500);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /Not a directory/);
  });

  test("mkdir makes the folder and answers its path", async () => {
    const parent = await mkdtemp(path.join(workspace, "mkdir-"));
    const app = createApp("127.0.0.1");

    const response = await app.request(
      "/api/fs/mkdir",
      posting({ parent, name: "made" }),
    );

    assert.equal(response.status, 201);
    const body = (await response.json()) as { path: string };
    assert.equal(body.path, path.join(parent, "made"));
    assert.ok(existsSync(body.path));
  });

  test("mkdir refuses a body with no parent", async () => {
    const app = createApp("127.0.0.1");

    const response = await app.request(
      "/api/fs/mkdir",
      posting({ name: "made" }),
    );

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, "parent and name are required");
  });

  test("mkdir refuses a body whose name is not a string", async () => {
    const parent = await mkdtemp(path.join(workspace, "mkdir-"));
    const app = createApp("127.0.0.1");

    const response = await app.request(
      "/api/fs/mkdir",
      posting({ parent, name: 7 }),
    );

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, "parent and name are required");
  });
});

/**
 * The router is mounted here and nowhere else, so this is the only place the
 * status a refusal leaves with can be read. Every procedure's own answer is
 * tested in the service that computes it; what is held here is the mapping —
 * and that a fault does NOT pick one up, because a 400 on a broken daemon
 * would send a person looking for a typo they did not make.
 */
describe("the tRPC surface", () => {
  test("a query answers over http", async () => {
    const app = createApp("127.0.0.1");

    const response = await app.request("/trpc/settings.global");

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      result: { data: { registryPath: string } };
    };
    assert.equal(
      body.result.data.registryPath,
      path.join(home, ".shall", "registry.json"),
    );
  });

  test("a missing refusal is a 404 and keeps its sentence", async () => {
    const app = createApp("127.0.0.1");
    const input = encodeURIComponent(
      JSON.stringify({ id: "01ABCDEFGHIJKLMNOPQRSTUVWX" }),
    );

    const response = await quietly(() =>
      app.request(`/trpc/settings.project?input=${input}`),
    );

    assert.equal(response.status, 404);
    const body = (await response.json()) as {
      error: { message: string; data: { code: string } };
    };
    assert.equal(body.error.data.code, "NOT_FOUND");
    assert.match(body.error.message, /Unknown project/);
  });

  test("an invalid refusal is a 400 and keeps its sentence", async () => {
    const project = await createProject(
      await mkdtemp(path.join(workspace, "project-")),
    );
    const app = createApp("127.0.0.1");

    const response = await quietly(() =>
      app.request(
        "/trpc/spec.createNode",
        posting({
          projectId: project.id,
          type: "Nonsense",
          id: "G-0001",
          shortName: "a",
          name: "a",
          body: "",
        }),
      ),
    );

    assert.equal(response.status, 400);
    const body = (await response.json()) as {
      error: { message: string; data: { code: string } };
    };
    assert.equal(body.error.data.code, "BAD_REQUEST");
    assert.match(body.error.message, /Unknown node type: Nonsense/);
  });

  test("a fault stays a fault, and leaves as a 500", async () => {
    const app = createApp("127.0.0.1");

    const response = await quietly(() =>
      app.request("/trpc/projects.open", posting({ path: workspace })),
    );

    assert.equal(response.status, 500);
    const body = (await response.json()) as {
      error: { data: { code: string } };
    };
    assert.equal(body.error.data.code, "INTERNAL_SERVER_ERROR");
  });
});

/**
 * In production one process answers both the api and the built web app; in
 * development the SPA is Vite's and this daemon is handed no root at all. Both
 * shapes are one argument apart, which is why both are held here.
 */
describe("the built web app", () => {
  test("a root with an index serves its files and every deep link", async () => {
    const spaRoot = await mkdtemp(path.join(workspace, "spa-"));
    await writeFile(
      path.join(spaRoot, "index.html"),
      "<!doctype html><title>Shall</title>",
      "utf8",
    );
    await writeFile(
      path.join(spaRoot, "app.js"),
      "export const built = 1;\n",
      "utf8",
    );
    const app = createApp("127.0.0.1", spaRoot);

    const asset = await app.request("/app.js");
    assert.equal(asset.status, 200);
    assert.match(await asset.text(), /export const built/);

    // A path only the router in the browser knows is still the index: the
    // person reloaded on it, and there is no file behind it.
    const deepLink = await app.request("/p/01ABCDEFGHIJKLMNOPQRSTUVWX/spec");
    assert.equal(deepLink.status, 200);
    assert.match(deepLink.headers.get("content-type") ?? "", /text\/html/);
    assert.match(await deepLink.text(), /<title>Shall<\/title>/);

    // The daemon's own routes are answered by the daemon, index or no index.
    const health = await app.request("/health");
    assert.equal(health.status, 200);
  });

  test("a root with no index is not served at all", async () => {
    const spaRoot = await mkdtemp(path.join(workspace, "unbuilt-spa-"));
    const app = createApp("127.0.0.1", spaRoot);

    const response = await app.request("/p/01ABCDEFGHIJKLMNOPQRSTUVWX/spec");

    assert.equal(response.status, 404);
  });
});
