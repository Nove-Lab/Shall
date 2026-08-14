import { createServer, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRequestListener } from "@hono/node-server";
import httpProxy from "http-proxy";
import { createApp } from "./http/app.js";
import { ensureApprovalKey } from "./host/approval-key.js";
import { writeSharedTemplates } from "./host/project-files.js";
import {
  ensureShallHome,
  readConfig,
  removeDaemonState,
  writeDaemonState,
} from "./host/shall-home.js";

process.title = "shall";

await ensureShallHome();
// The machine's reference templates, brought current on every start — an agent
// reads them from `~/.shall/templates` without ever opening a project in the
// UI, so the daemon's start is the one moment that reliably precedes that.
await writeSharedTemplates().catch(() => undefined);
// The approval key, minted before the first approve could ask for it. A start
// that cannot write it is not a start that fails — the approve door says what
// is wrong in its own sentence when the moment comes.
await ensureApprovalKey().catch(() => undefined);
const config = await readConfig();
const bindHost =
  process.env.SHALL_HOST === "0.0.0.0" ? "0.0.0.0" : "127.0.0.1";
const isDevelopment = process.env.NODE_ENV === "development";
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
// dist/main.js, so the built SPA is two levels up and over in apps/web.
const spaRoot =
  !isDevelopment
    ? path.resolve(moduleDirectory, "../../apps/web/dist")
    : undefined;
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
  viteProxy?.close();
  server.close(() => process.exit(0));
}

process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
