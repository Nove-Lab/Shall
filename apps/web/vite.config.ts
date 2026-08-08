import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const bindHost =
  process.env.SHALL_HOST === "0.0.0.0" ? "0.0.0.0" : "127.0.0.1";

export default defineConfig({
  plugins: [react()],
  server: {
    host: bindHost,
    port: 5173,
    strictPort: true,
    hmr: {
      clientPort: 9461,
    },
    proxy: {
      "/api": "http://127.0.0.1:9461",
      "/trpc": "http://127.0.0.1:9461",
    },
  },
});
