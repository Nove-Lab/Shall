import path from "node:path";
import { ulid } from "ulid";
import type { ProjectMetadata, RegistryProject } from "./types.js";

export function normalizeProjectPath(projectPath: string): string {
  return path.resolve(projectPath);
}

export function createProjectMetadata(
  projectPath: string,
  id: string = ulid(),
): ProjectMetadata {
  return {
    id,
    name: path.basename(normalizeProjectPath(projectPath)),
    schemaVersion: 1,
  };
}

export function toRegistryProject(
  projectPath: string,
  metadata: ProjectMetadata,
): RegistryProject {
  return {
    id: metadata.id,
    path: normalizeProjectPath(projectPath),
    name: metadata.name,
  };
}

export function isProjectMetadata(value: unknown): value is ProjectMetadata {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    candidate.schemaVersion === 1
  );
}
