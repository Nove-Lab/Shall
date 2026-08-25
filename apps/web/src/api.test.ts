import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import { browse, makeDirectory } from "./api";

/**
 * THE TWO REST DOORS THE PICKER KNOCKS ON, and the sentences a person is left
 * with when one of them says no.
 *
 * `fetch` is the whole of the machine here — there is no DOM in either
 * function, no tRPC and no state — so the stand-in below is the only thing a
 * run needs, and every claim is about the request that went out and the
 * sentence that came back.
 */

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** One call: what the door answered, and what it was asked. */
function standingIn(
  reply: { ok: boolean; body: unknown },
): { asked: { url: string; init: RequestInit | undefined }[] } {
  const asked: { url: string; init: RequestInit | undefined }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    asked.push({ url, init });
    return {
      ok: reply.ok,
      json: async () => reply.body,
    };
  }) as unknown as typeof fetch;
  return { asked };
}

describe("browse", () => {
  test("a folder is named in the query, encoded, and its answer comes back whole", async () => {
    const answer = {
      path: "/work/atlas",
      parent: "/work",
      shall: "project",
      directories: [],
    };
    const stub = standingIn({ ok: true, body: answer });

    assert.deepEqual(await browse("/work/my atlas"), answer);
    assert.deepEqual(
      stub.asked.map((call) => call.url),
      ["/api/fs/browse?path=%2Fwork%2Fmy%20atlas"],
    );
  });

  test("no folder at all asks the door for its own default, with no query", async () => {
    const stub = standingIn({
      ok: true,
      body: { path: "/", parent: null, shall: "none", directories: [] },
    });

    await browse();
    assert.deepEqual(
      stub.asked.map((call) => call.url),
      ["/api/fs/browse"],
    );
  });

  // An empty path names nothing, so it is the same ask as no path at all.
  test("an empty folder name is no folder", async () => {
    const stub = standingIn({
      ok: true,
      body: { path: "/", parent: null, shall: "none", directories: [] },
    });

    await browse("");
    assert.deepEqual(
      stub.asked.map((call) => call.url),
      ["/api/fs/browse"],
    );
  });

  test("a door that refuses is one sentence and never a half-read answer", async () => {
    standingIn({ ok: false, body: { error: "no such folder" } });

    await assert.rejects(browse("/nowhere"), {
      message: "Could not browse this folder",
    });
  });
});

describe("makeDirectory", () => {
  test("the parent and the name go as JSON, and the new path comes back", async () => {
    const stub = standingIn({ ok: true, body: { path: "/work/atlas" } });

    assert.equal(await makeDirectory("/work", "atlas"), "/work/atlas");
    assert.deepEqual(
      stub.asked.map((call) => call.url),
      ["/api/fs/mkdir"],
    );
    assert.equal(stub.asked[0]?.init?.method, "POST");
    assert.deepEqual(stub.asked[0]?.init?.body, '{"parent":"/work","name":"atlas"}');
  });

  test("a refusal is said in the door's own words", async () => {
    standingIn({ ok: false, body: { error: "atlas already exists" } });

    await assert.rejects(makeDirectory("/work", "atlas"), {
      message: "atlas already exists",
    });
  });

  // A refusal with nothing said in it, and an answer that carried no path at
  // all, are the same miss: there is no folder to hand back.
  test("a refusal with no words, and an answer with no path, both say so", async () => {
    standingIn({ ok: false, body: {} });
    await assert.rejects(makeDirectory("/work", "atlas"), {
      message: "Could not create folder",
    });

    standingIn({ ok: true, body: {} });
    await assert.rejects(makeDirectory("/work", "atlas"), {
      message: "Could not create folder",
    });
  });
});
