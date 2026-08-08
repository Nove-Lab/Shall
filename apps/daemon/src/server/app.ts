import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { trpcServer } from "@hono/trpc-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import {
  browseDirectories,
  createDirectory,
} from "../store/filesystem.js";
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
