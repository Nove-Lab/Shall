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
