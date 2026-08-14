import { missing } from "./errors.js";
import {
  createProjectMetadata,
  isProjectMetadata,
  normalizeProjectPath,
  toRegistryProject,
} from "./project-model.js";
import type { RecentProject, RegistryProject } from "../types.js";
import {
  assertDirectory,
  ensureProjectSpec,
  getProjectMetadataPath,
  getProjectShallPath,
  pathExists,
  readProjectMetadata,
  writeProjectFiles,
  writeTemplates,
} from "../host/project-files.js";
import { isShallHomePath } from "../host/shall-home.js";
import {
  readRegistry,
  removeRegistryProject,
  upsertRegistryProject,
} from "../host/registry.js";

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

/**
 * Shall's own home is `~/.shall`, the same name a project uses, so the folder
 * holding it reads as a project until this rejects it.
 */
async function assertOpenable(absolutePath: string): Promise<void> {
  const shallPath = getProjectShallPath(absolutePath);
  if (isShallHomePath(shallPath)) {
    throw new Error(
      `${shallPath} is Shall's own home, not a project. Choose a project folder instead.`,
    );
  }
  if (!(await pathExists(shallPath))) {
    throw new Error(`Not a Shall project: ${absolutePath}`);
  }
  if (!(await pathExists(getProjectMetadataPath(absolutePath)))) {
    throw new Error(
      `${absolutePath} has a .shall folder but no project.json, so it is not a Shall project.`,
    );
  }
}

export async function openProject(
  projectPath: string,
): Promise<RegistryProject> {
  const absolutePath = normalizeProjectPath(projectPath);
  await assertDirectory(absolutePath);
  await assertOpenable(absolutePath);
  const metadata = await readProjectMetadata(absolutePath);
  if (!isProjectMetadata(metadata)) {
    throw new Error(`Invalid Shall project: ${absolutePath}`);
  }

  // A project arrives here from a git clone as often as from this machine's own
  // `create`, and a clone carries neither an empty folder nor a guarantee that
  // its templates came from this version of Shall. Both are cheap to settle and
  // quiet when there is nothing to do: the spec folder is made if it is not
  // there, and each template is compared before it is written, so opening a
  // current project leaves `git status` exactly as it found it.
  //
  // NEITHER IS A CONDITION OF OPENING. Both are conveniences — the store makes
  // a type folder on its first write anyway, and the templates are starting
  // points a person copies — so a folder Shall may read but not write into (a
  // read-only mount, a checkout owned by somebody else) opens and serves its
  // graph rather than failing the click with an errno. Reading a project should
  // never require the right to write to it.
  await Promise.all([
    ensureProjectSpec(absolutePath).catch(() => undefined),
    writeTemplates(absolutePath).catch(() => undefined),
  ]);

  const project = toRegistryProject(absolutePath, metadata);
  await upsertRegistryProject(project);
  return project;
}

/**
 * The registry entry behind `/p/:projectId`, for the surfaces that cannot
 * carry on without one — settings and the spec graph both write to files the
 * registry is what points at.
 */
export async function requireRegistryProject(
  id: string,
): Promise<RegistryProject> {
  const registry = await readRegistry();
  const entry = registry.projects.find((project) => project.id === id);
  if (!entry) {
    throw missing(`Unknown project: ${id}`);
  }
  return entry;
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
