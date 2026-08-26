import { readFile } from "node:fs/promises";
import path from "node:path";
import { trpcServer } from "@hono/trpc-server";
import { SHALL_VERSION } from "@shall/core/version";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  browseDirectories,
  createDirectory,
} from "../host/filesystem.js";
import { isRefusal } from "../service/errors.js";
import { subscribe } from "../service/spec-events.js";
import { projectSpecFor } from "../service/spec-graph.js";
import { reportDirOf } from "../service/spec-report.js";
import { appRouter, SERVED_PROCEDURES } from "./router.js";
import { contentTypeOf, keyOf, mountSpa } from "./spa.js";

export function createApp(bindHost: string, spaRoot?: string): Hono {
  const app = new Hono();

  // `version` and `procedures` are the two build markers, and the CLI reads
  // both before adopting a running daemon: the version catches an install that
  // moved at all, in either direction, and the procedure list still catches a
  // daemon whose calls this client does not have — so one left over from an
  // older install is restarted instead of answering every call with a sentence
  // about a missing path.
  app.get("/health", (context) =>
    context.json({
      ok: true,
      host: bindHost,
      version: SHALL_VERSION,
      procedures: SERVED_PROCEDURES,
    }),
  );

  // TODO: a local token — browse and mkdir answer without one for now.
  app.get("/api/fs/browse", async (context) => {
    const requestedPath = context.req.query("path");
    return context.json(await browseDirectories(requestedPath));
  });

  // TODO: a local token — browse and mkdir answer without one for now.
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
          const written = stream.writeSSE({
            event,
            data: JSON.stringify(
              event === "over"
                ? { reason: reason ?? "" }
                : { at: new Date().toISOString() },
            ),
          });
          // The frame has to have landed before the writer is closed: a close
          // asked for while a write is still pending is queued ahead of it and
          // the write is dropped, which would end the stream without the one
          // sentence saying why — and that sentence is what `over` is for.
          if (event === "over") {
            void written.then(() => {
              void stream.close();
              finish();
            });
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

  /**
   * A generated report, handed back out — so the web's "Generate report" can
   * open a tab on the same files a manager would get off disk. Under `/api/`
   * for the same reason the event stream is: in development everything else
   * belongs to Vite.
   *
   * TWO LOCKS ON THE PATH. `keyOf` drops `..` and empty segments the way the
   * SPA's table does, and the resolved target is then required to still stand
   * inside the report folder — the folder holds only generator output, and
   * nothing outside it is this route's to hand out.
   */
  app.get("/api/projects/:id/report/*", async (context) => {
    const projectId = context.req.param("id");
    let projectPath: string;
    try {
      projectPath = (await projectSpecFor(projectId)).projectPath;
    } catch (reason) {
      const message = isRefusal(reason)
        ? reason.message
        : `Shall could not find ${projectId}.`;
      return context.json({ error: message }, isRefusal(reason) ? 404 : 500);
    }
    const reportRoot = path.resolve(reportDirOf(projectPath));
    const marker = "/report/";
    const at = context.req.path.indexOf(marker);
    const key = keyOf(at === -1 ? "" : context.req.path.slice(at + marker.length));
    const relative = key === "" ? "index.html" : key;
    const target = path.resolve(path.join(reportRoot, ...relative.split("/")));
    if (target !== reportRoot && !target.startsWith(reportRoot + path.sep)) {
      return context.notFound();
    }
    const bytes = await readFile(target).catch(() => null);
    if (bytes === null) {
      return context.json(
        {
          error:
            "No report has been generated for this project yet — press Generate report in the app, or run shall report in the project folder.",
        },
        404,
      );
    }
    return context.body(new Uint8Array(bytes), 200, {
      "content-type": contentTypeOf(target),
    });
  });

  app.use(
    "/trpc/*",
    trpcServer({
      endpoint: "/trpc",
      router: appRouter,
    }),
  );

  // Last, and after everything this daemon claims for itself: the catch-all
  // that hands out the web app belongs to `spa.ts`, which knows whether the
  // pages come off disk or out of the binary.
  mountSpa(app, spaRoot);

  app.onError((error, context) => {
    console.error(error);
    return context.json({ error: error.message }, 500);
  });

  return app;
}
