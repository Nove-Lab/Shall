import { createServer, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRequestListener } from "@hono/node-server";
import httpProxy from "http-proxy";
import { createApp } from "./http/app.js";
import { isEmbedded } from "./host/embedded.js";
import { writeSharedTemplates } from "./host/project-files.js";
import {
  ensureShallHome,
  readConfig,
  removeDaemonState,
  writeDaemonState,
} from "./host/shall-home.js";
import { refreshRegisteredKits } from "./service/projects.js";
import { closeAllFeeds } from "./service/spec-events.js";

process.title = "shall";

await ensureShallHome();
// The machine's reference templates, brought current on every start — an agent
// reads them from `~/.shall/templates` without ever opening a project in the
// UI, so the daemon's start is the one moment that reliably precedes that.
await writeSharedTemplates().catch(() => undefined);
const config = await readConfig();
const bindHost =
  process.env.SHALL_HOST === "0.0.0.0" ? "0.0.0.0" : "127.0.0.1";
// THE BINARY IS NEVER IN DEVELOPMENT, and the carry is what says so rather
// than the environment. `bun build` INLINES `process.env.NODE_ENV` AT BUILD
// TIME — it reads "development" inside a compiled executable no matter what the
// parent process exported — so a daemon that trusted the variable alone would
// hand every page to a Vite server that is not there. A Shall that carries its
// own web app has a checkout behind it for exactly nobody.
const isDevelopment =
  process.env.NODE_ENV === "development" && !isEmbedded();
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
// dist/main.js, so the built SPA is two levels up and over in apps/web — the
// path a checkout has. In development Vite serves the pages, and in the single
// binary there is no checkout to point at: the pages are carried, and `spa.ts`
// takes them from there without being told.
const spaRoot = isDevelopment
  ? undefined
  : path.resolve(moduleDirectory, "../../apps/web/dist");
const app = createApp(bindHost, spaRoot);
const honoListener = getRequestListener(app.fetch, { hostname: bindHost });
const viteProxy = isDevelopment
  ? httpProxy.createProxyServer({
      target: "http://127.0.0.1:5173",
      changeOrigin: true,
      ws: true,
    })
  : undefined;

viteProxy?.on("error", (error, _request, response) => {
  console.error("Vite proxy error:", error.message);
  if (response instanceof ServerResponse) {
    if (!response.headersSent) {
      response.writeHead(502, { "content-type": "text/plain" });
    }
    response.end("Vite development server is not ready");
  } else {
    response.destroy();
  }
});

function isDaemonRoute(requestUrl: string | undefined): boolean {
  const pathname = new URL(requestUrl ?? "/", "http://localhost").pathname;
  return (
    pathname === "/health" ||
    pathname.startsWith("/api/") ||
    pathname === "/trpc" ||
    pathname.startsWith("/trpc/")
  );
}

const server = createServer((request, response) => {
  if (viteProxy && !isDaemonRoute(request.url)) {
    viteProxy.web(request, response);
    return;
  }
  void honoListener(request, response);
});

server.on("upgrade", (request, socket, head) => {
  if (viteProxy) {
    viteProxy.ws(request, socket, head);
    return;
  }
  socket.destroy();
});

await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(config.port, bindHost, () => {
    server.off("error", reject);
    resolve();
  });
});

const address = server.address();
if (!address || typeof address === "string") {
  server.close();
  throw new Error("Could not determine Shall daemon port");
}
await writeDaemonState({ pid: process.pid, port: address.port });
console.log(
  `Shall is running at http://localhost:${address.port} (${bindHost})`,
);

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  await removeDaemonState(process.pid);
  // THE FEEDS GO FIRST, because each open one is a response that has not
  // finished and `server.close` waits for every one of those. Without this a
  // browser left open on a project holds the daemon past its own kill, and in
  // development that is a restart that never comes.
  closeAllFeeds();
  viteProxy?.close();
  server.close(() => process.exit(0));
  // And a backstop, because the thing that would hold this open is by
  // definition a connection this process failed to enumerate.
  setTimeout(() => process.exit(0), 2_000).unref();
}

process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});

// EVERY REGISTERED PROJECT'S KIT, ONCE — the half of an upgrade nobody clicks
// for, argued in full over `refreshRegisteredKits`. It runs here, after the port
// is held and a signal would be heard, because a machine with twenty projects
// should not wait on a walk of all of them before its app answers.
await refreshRegisteredKits();
