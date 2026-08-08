import { readFile } from "node:fs/promises";
import type { Registry, RegistryProject } from "../core/types.js";
import {
  ensureShallHome,
  writeJsonAtomic,
} from "./shall-home.js";

function isRegistry(value: unknown): value is Registry {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as Record<string, unknown>).projects)
  );
}

export async function readRegistry(): Promise<Registry> {
  const home = await ensureShallHome();
  const value = JSON.parse(await readFile(home.registryPath, "utf8")) as unknown;
  if (!isRegistry(value)) {
    throw new Error(`Invalid Shall registry: ${home.registryPath}`);
  }
  return value;
}

export async function upsertRegistryProject(
  project: RegistryProject,
): Promise<void> {
  const home = await ensureShallHome();
  const registry = await readRegistry();
  const projects = registry.projects.filter(
    (entry) => entry.id !== project.id && entry.path !== project.path,
  );
  projects.unshift(project);
  await writeJsonAtomic(home.registryPath, { projects });
}

export async function removeRegistryProject(id: string): Promise<void> {
  const home = await ensureShallHome();
  const registry = await readRegistry();
  await writeJsonAtomic(home.registryPath, {
    projects: registry.projects.filter((project) => project.id !== id),
  });
}
