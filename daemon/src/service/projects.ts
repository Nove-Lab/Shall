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
import { writeAgentKit } from "../host/agent-kit.js";
import { writeAgentRules } from "../host/agent-rules.js";
import { writeAgentDenyRules } from "../host/agent-settings.js";
import { initRepository, repositoryRoot } from "../host/git-cli.js";
import { readGitBranch } from "../host/git.js";
import { isShallHomePath } from "../host/shall-home.js";
import {
  readRegistry,
  removeRegistryProject,
  upsertRegistryProject,
} from "../host/registry.js";

export async function createProject(
  projectPath: string,
  options: { initGit?: boolean | undefined } = {},
): Promise<RegistryProject> {
  const absolutePath = normalizeProjectPath(projectPath);
  await assertDirectory(absolutePath);

  if (await pathExists(getProjectShallPath(absolutePath))) {
    return openProject(absolutePath);
  }

  const metadata = createProjectMetadata(absolutePath);
  await writeProjectFiles(absolutePath, metadata);
  // The spec's restoration material is git and nothing else, so a folder that
  // is in no repository gets one at the moment it becomes a project — unless
  // the caller asked to proceed without one: the CLI puts that question to the
  // person, and this door honours the answer. Failure is swallowed on purpose —
  // a machine without git still gets a project, and every door that actually
  // needs history says so in its own sentence.
  if (
    options.initGit !== false &&
    (await repositoryRoot(absolutePath)) === null
  ) {
    await initRepository(absolutePath);
  }
  // The same conveniences an open runs — see openProject for why they are quiet.
  await Promise.all([
    writeAgentDenyRules(absolutePath),
    writeAgentRules(absolutePath),
    writeAgentKit(absolutePath),
  ]);
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
  // `create`. Five tidyings are cheap and quiet when there is nothing to do:
  // the spec folder is made if it is not there, the machine's reference
  // templates under `~/.shall/templates` are brought current, a template set
  // an older Shall committed into this project is removed — templates live
  // with Shall now, and a stale copy in the repository would teach an agent a
  // format the daemon no longer writes — the agent settings gain the two deny
  // rules that keep Shall's own home out of an agent's reading and the ledgers
  // out of its pen, and the page under `.claude/rules` is brought current the
  // way the templates are: half a page saying what this project is and which
  // doors are not an agent's.
  //
  // NONE IS A CONDITION OF OPENING. All five are conveniences — so a folder
  // Shall may read but not write into (a read-only mount, a checkout owned by
  // somebody else) opens and serves its graph rather than failing the click
  // with an errno. Reading a project should never require the right to write
  // to it.
  await Promise.all([
    ensureProjectSpec(absolutePath).catch(() => undefined),
    writeSharedTemplates().catch(() => undefined),
    removeProjectTemplates(absolutePath).catch(() => undefined),
    writeAgentDenyRules(absolutePath),
    writeAgentRules(absolutePath),
    writeAgentKit(absolutePath),
  ]);

  const project = toRegistryProject(absolutePath, metadata);
  await upsertRegistryProject(project);
  return project;
}

/**
 * EVERY REGISTERED PROJECT'S AGENT KIT AND RULES PAGE, BROUGHT CURRENT — once,
 * when the daemon starts.
 *
 * IT IS WHAT MAKES AN UPGRADE REACH THE PROJECTS. Both files are written out of
 * the daemon that is running and stamped with its version, so a Shall that was
 * replaced under a person's feet would otherwise leave every project carrying
 * the old release's commands until somebody happened to open it. `shall upgrade`
 * swaps the binary and restarts the daemon; this sweep is the other half, and
 * together they are an upgrade nobody has to click through project by project.
 *
 * IT IS DELIBERATELY THE SAME PAIR AN OPEN WRITES, and not the whole of what an
 * open does. The agent settings are somebody else's file and are merged into
 * only when a project is actually opened; the spec folder and the shared
 * templates are made where they are needed. What this sweep owns is the prose
 * Shall generates and re-generates, which is exactly the prose a new version
 * changes.
 *
 * NOTHING HERE IS A CONDITION OF STARTING, and nothing here throws. A registry
 * that will not read, a folder somebody deleted, a checkout mounted read-only:
 * each is skipped in silence, for the same reason an open's conveniences are —
 * the right to write into a project is not the price of running Shall. A PATH
 * WHOSE `.shall` IS GONE IS NO LONGER A PROJECT and is skipped too, because a
 * `.claude` kit written into a folder that stopped being one is litter left by a
 * daemon nobody asked to visit.
 */
export async function refreshRegisteredKits(): Promise<void> {
  const registry = await readRegistry().catch(() => null);
  if (registry === null) {
    return;
  }
  await Promise.all(
    registry.projects.map(async (project) => {
      if (!(await pathExists(getProjectShallPath(project.path)))) {
        return;
      }
      await Promise.all([
        writeAgentRules(project.path),
        writeAgentKit(project.path),
      ]);
    }),
  );
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
