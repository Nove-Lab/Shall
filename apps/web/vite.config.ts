import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const bindHost =
  process.env.SHALL_HOST === "0.0.0.0" ? "0.0.0.0" : "127.0.0.1";
// The dev daemon's port — `scripts/dev.mjs` exports it from the checkout's own
// home, and 9462 is that home's default. Never the installed Shall's 9461.
const daemonPort = Number(process.env.SHALL_DAEMON_PORT ?? "9462");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
  server: {
    host: bindHost,
    port: 5173,
    strictPort: true,
    hmr: {
      clientPort: daemonPort,
    },
    proxy: {
      "/api": `http://127.0.0.1:${daemonPort}`,
      "/trpc": `http://127.0.0.1:${daemonPort}`,
    },
  },
});
