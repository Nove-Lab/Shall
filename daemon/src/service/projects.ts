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
  removeProjectTemplates,
  writeProjectFiles,
  writeSharedTemplates,
} from "../host/project-files.js";
import { readGitBranch } from "../host/git.js";
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
  // `create`. Three tidyings are cheap and quiet when there is nothing to do:
  // the spec folder is made if it is not there, the machine's reference
  // templates under `~/.shall/templates` are brought current, and a template
  // set an older Shall committed into this project is removed — templates live
  // with Shall now, and a stale copy in the repository would teach an agent a
  // format the daemon no longer writes.
  //
  // NONE IS A CONDITION OF OPENING. All three are conveniences — so a folder
  // Shall may read but not write into (a read-only mount, a checkout owned by
  // somebody else) opens and serves its graph rather than failing the click
  // with an errno. Reading a project should never require the right to write
  // to it.
  await Promise.all([
    ensureProjectSpec(absolutePath).catch(() => undefined),
    writeSharedTemplates().catch(() => undefined),
    removeProjectTemplates(absolutePath).catch(() => undefined),
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

/**
 * The branch the project's repository is on, or null when there is no
 * repository — which the header answers by showing nothing, because "not a git
 * project" is an ordinary state and not a gap.
 *
 * IT IS A SEPARATE QUESTION FROM THE PROJECT ITSELF, on purpose: a
 * `RegistryProject` is a record this machine persists, and the branch is a
 * live fact of the working tree that moves under every `git checkout`. Folding
 * it into the registry answer would put a moving fact inside a stored shape.
 * An unknown id answers null rather than a refusal for the same reason the
 * picker tolerates a stale link: the header asking about a project that was
 * just removed is a race, not a mistake.
 */
export async function getProjectGitBranch(
  id: string,
): Promise<{ branch: string | null }> {
  const registry = await readRegistry();
  const entry = registry.projects.find((project) => project.id === id);
  if (!entry) {
    return { branch: null };
  }
  return { branch: await readGitBranch(entry.path) };
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
