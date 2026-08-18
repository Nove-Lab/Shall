import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { trpcServer } from "@hono/trpc-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  browseDirectories,
  createDirectory,
} from "../host/filesystem.js";
import { isRefusal } from "../service/errors.js";
import { subscribe } from "../service/spec-events.js";
import { appRouter } from "./router.js";

export function createApp(bindHost: string, spaRoot?: string): Hono {
  const app = new Hono();

  app.get("/health", (context) => context.json({ ok: true, host: bindHost }));

  // TODO: local token — browse/mkdir이 무인증인 임시 상태
  app.get("/api/fs/browse", async (context) => {
    const requestedPath = context.req.query("path");
    return context.json(await browseDirectories(requestedPath));
  });

  // TODO: local token — browse/mkdir이 무인증인 임시 상태
  app.post("/api/fs/mkdir", async (context) => {
    const body = (await context.req.json()) as {
      parent?: unknown;
      name?: unknown;
    };
    if (typeof body.parent !== "string" || typeof body.name !== "string") {
      return context.json({ error: "parent and name are required" }, 400);
    }
    const directoryPath = await createDirectory(body.parent, body.name);
    return context.json({ path: directoryPath }, 201);
  });

  /**
   * A project's folder, as it changes — the one thing this daemon streams.
   *
   * IT IS A PLAIN ROUTE AND NOT A tRPC SUBSCRIPTION because the browser needs
   * nothing to read it. `EventSource` is in every browser Shall runs in, it
   * reconnects by itself when the daemon restarts, and it costs the web app no
   * dependency and no second link beside the one it already has.
   *
   * IT LIVES UNDER `/api/` BECAUSE OF THE DEV PROXY. In development everything
   * that is not `/health`, `/api/…` or `/trpc/…` is handed to Vite, so a route
   * anywhere else would be answered by the wrong server; under `/api/` it needs
   * nothing said about it in either place. A websocket would need more than
   * that — the upgrade path exists only while the Vite proxy does.
   *
   * THE PROJECT IS RESOLVED BEFORE THE STREAM OPENS, and that is the difference
   * between a refusal and a loop: `EventSource` retries a connection that
   * opened and closed, for ever, but gives up on one that was refused. So an id
   * nobody knows is a 404 with a sentence, and a stream is only ever opened
   * over a folder that is genuinely being watched.
   */
  app.get("/api/projects/:id/events", async (context) => {
    const projectId = context.req.param("id");
    // The listener is made before the stream so that a change arriving in the
    // gap between subscribing and the first write is not dropped: it is held
    // here and said as soon as there is somewhere to say it.
    let deliver: ((event: "change" | "over", reason?: string) => void) | null =
      null;
    let pending: "change" | null = null;
    let ended: string | null = null;
    const listener = {
      changed: () => {
        if (deliver === null) {
          pending = "change";
          return;
        }
        deliver("change");
      },
      failed: (reason: string) => {
        if (deliver === null) {
          ended = reason;
          return;
        }
        deliver("over", reason);
      },
    };

    let unsubscribe: () => void;
    try {
      unsubscribe = await subscribe(projectId, listener);
    } catch (reason) {
      const message = isRefusal(reason)
        ? reason.message
        : `Shall could not watch ${projectId}.`;
      return context.json({ error: message }, isRefusal(reason) ? 404 : 500);
    }

    return streamSSE(context, async (stream) => {
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) {
            return;
          }
          done = true;
          clearInterval(beat);
          unsubscribe();
          resolve();
        };
        // A comment every twenty-five seconds, so a proxy that times a quiet
        // connection out never gets the chance to.
        const beat = setInterval(() => {
          void stream.writeSSE({ event: "beat", data: "" });
        }, 25_000);
        beat.unref();
        // The abort is the only signal that the reader has gone: a write to a
        // client that has left is swallowed rather than thrown.
        stream.onAbort(finish);
        deliver = (event, reason) => {
          void stream.writeSSE({
            event,
            data: JSON.stringify(
              event === "over"
                ? { reason: reason ?? "" }
                : { at: new Date().toISOString() },
            ),
          });
          if (event === "over") {
            void stream.close();
            finish();
          }
        };
        // The first line says the connection is up before anything has changed,
        // and tells the browser how long to wait before trying again.
        void stream.writeSSE({ event: "open", data: "{}", retry: 1_000 });
        if (ended !== null) {
          deliver("over", ended);
          return;
        }
        if (pending !== null) {
          pending = null;
          deliver("change");
        }
      });
    });
  });

  app.use(
    "/trpc/*",
    trpcServer({
      endpoint: "/trpc",
      router: appRouter,
    }),
  );

  if (spaRoot && existsSync(path.join(spaRoot, "index.html"))) {
    app.use("*", serveStatic({ root: spaRoot }));
    app.get("*", async (context) => {
      const html = await readFile(path.join(spaRoot, "index.html"), "utf8");
      return context.html(html);
    });
  }

  app.onError((error, context) => {
    console.error(error);
    return context.json({ error: error.message }, 500);
  });

  return app;
}
