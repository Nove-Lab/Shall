import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import { connect } from "./client.js";

/**
 * The one thing this file decides: WHERE the terminal client speaks, and that it
 * speaks the same protocol the browser does. A stand-in server answers on the
 * tRPC wire — nothing here needs the daemon, because what is pinned is the
 * address and the shape of the conversation rather than any answer.
 *
 * THE URL IS THE WHOLE CONTRACT. `connect` is handed the daemon's origin and
 * must reach it at `/trpc`; a client that appended nothing, or appended it
 * twice, would fail with a 404 that says nothing about which of the two clients
 * moved, so it is worth a test of its own.
 */

/** Every request that arrived, in order — the only record this stand-in keeps. */
const arrived: { method: string; url: string; body: string }[] = [];

/** The next answer, so one server can play both a result and a refusal. */
let answer: { status: number; body: unknown } = {
  status: 200,
  body: [{ result: { data: { ok: true } } }],
};

const server = createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    arrived.push({
      method: request.method ?? "",
      url: request.url ?? "",
      body: Buffer.concat(chunks).toString("utf8"),
    });
    response.writeHead(answer.status, { "content-type": "application/json" });
    response.end(JSON.stringify(answer.body));
  });
});

let origin = "";

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("where the terminal client speaks", () => {
  test("a query is a GET under /trpc, named by procedure", async () => {
    arrived.length = 0;
    answer = { status: 200, body: [{ result: { data: { root: "/atlas" } } }] };
    const said = await connect(origin).spec.board.query({ path: "/atlas" });

    assert.deepEqual(said, { root: "/atlas" });
    const [request] = arrived;
    assert.ok(request !== undefined, "nothing reached the daemon");
    assert.equal(request.method, "GET");
    assert.ok(
      request.url.startsWith("/trpc/spec.board?"),
      `${request.url} is not the board procedure under /trpc`,
    );
    // The input travels in the query string, one entry per call in the batch.
    assert.equal(
      new URL(request.url, origin).searchParams.get("input"),
      JSON.stringify({ 0: { path: "/atlas" } }),
    );
  });

  test("a mutation is a POST under /trpc, carrying its input as a body", async () => {
    arrived.length = 0;
    answer = { status: 200, body: [{ result: { data: { id: "AF-0001" } } }] };
    const said = await connect(origin).spec.log.mutate({
      path: "/atlas",
      kind: "work_done",
      summary: "Wrote the parser",
    });

    assert.deepEqual(said, { id: "AF-0001" });
    const [request] = arrived;
    assert.ok(request !== undefined, "nothing reached the daemon");
    assert.equal(request.method, "POST");
    assert.ok(
      request.url.startsWith("/trpc/spec.log?"),
      `${request.url} is not the log procedure under /trpc`,
    );
    assert.equal(
      request.body,
      JSON.stringify({
        0: { path: "/atlas", kind: "work_done", summary: "Wrote the parser" },
      }),
    );
  });

  test("a refusal arrives as the sentence the daemon wrote", async () => {
    arrived.length = 0;
    const sentence =
      "kind must be one of specify_done, plan_done, work_done, raise_landed.";
    answer = {
      status: 400,
      body: [
        {
          error: {
            message: sentence,
            code: -32600,
            data: { code: "BAD_REQUEST", httpStatus: 400, path: "spec.log" },
          },
        },
      ],
    };

    // The sentence is what `main.ts` prints, so it has to survive the trip
    // whole rather than arriving as a status code somebody has to translate.
    await assert.rejects(
      connect(origin).spec.log.mutate({
        path: "/atlas",
        kind: "no",
        summary: "Wrote the parser",
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, sentence);
        return true;
      },
    );
  });

  test("an origin with a path keeps it, because /trpc is appended and not assumed", async () => {
    arrived.length = 0;
    answer = { status: 200, body: [{ result: { data: null } }] };
    await connect(`${origin}/behind`).spec.check.query({ path: "/a" });

    const [request] = arrived;
    assert.ok(request !== undefined, "nothing reached the daemon");
    assert.ok(
      request.url.startsWith("/behind/trpc/spec.check?"),
      `${request.url} did not keep the origin's own path`,
    );
  });
});
