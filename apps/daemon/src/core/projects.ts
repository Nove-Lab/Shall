import {
  createProjectMetadata,
  isProjectMetadata,
  normalizeProjectPath,
  toRegistryProject,
} from "./project-model.js";
import type { RecentProject, RegistryProject } from "./types.js";
import {
  assertDirectory,
  getProjectShallPath,
  pathExists,
  readProjectMetadata,
  writeProjectFiles,
} from "../store/project-files.js";
import {
  readRegistry,
  removeRegistryProject,
  upsertRegistryProject,
} from "../store/registry.js";

export async function createProject(
  projectPath: string,
): Promise<RegistryProject> {
  const absolutePath = normalizeProjectPath(projectPath);
  await assertDirectory(absolutePath);

  if (await pathExists(getProjectShallPath(absolutePath))) {
    return openProject(absolutePath);
  }

  const metadata = createProjectMetadata(absolutePath);
  await writeProjectFiles(absolutePath, metadata);
  const project = toRegistryProject(absolutePath, metadata);
  await upsertRegistryProject(project);
  return project;
}

export async function openProject(
  projectPath: string,
): Promise<RegistryProject> {
  const absolutePath = normalizeProjectPath(projectPath);
  await assertDirectory(absolutePath);
  const metadata = await readProjectMetadata(absolutePath);
  if (!isProjectMetadata(metadata)) {
    throw new Error(`Invalid Shall project: ${absolutePath}`);
  }

  const project = toRegistryProject(absolutePath, metadata);
  await upsertRegistryProject(project);
  return project;
}

/**
 * Resolves the id in `/p/:projectId` to a project. Returns null rather than
 * throwing so the SPA can fall back to the picker on a stale link.
 */
export async function getProject(id: string): Promise<RegistryProject | null> {
  const registry = await readRegistry();
  const entry = registry.projects.find((project) => project.id === id);
  if (!entry || !(await pathExists(entry.path))) {
    return null;
  }

  // project.json is the source of truth for the name; the registry can lag.
  const metadata = await readProjectMetadata(entry.path).catch(() => null);
  return isProjectMetadata(metadata)
    ? toRegistryProject(entry.path, metadata)
    : entry;
}

export async function listRecentProjects(): Promise<RecentProject[]> {
  const registry = await readRegistry();
  return Promise.all(
    registry.projects.map(async (project) => ({
      ...project,
      exists: await pathExists(project.path),
    })),
  );
}

export async function removeRecentProject(id: string): Promise<void> {
  await removeRegistryProject(id);
}
