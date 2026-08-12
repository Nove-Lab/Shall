import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./store/schema.ts",
  out: "./store/migrations",
  dbCredentials: {
    url: "./store/schema-preview.db",
  },
});
