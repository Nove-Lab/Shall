import path from "node:path";
import { fileURLToPath } from "node:url";

export * from "./schema.js";

export function getMigrationsPath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
}
