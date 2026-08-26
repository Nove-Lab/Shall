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
  findProjectRootAbove,
  getProjectMetadataPath,
  getProjectShallPath,
  pathExists,
  readProjectMetadata,
  removeProjectTemplates,
  writeProjectFiles,
  writeSharedTemplates,
} from "../host/project-files.js";
import type { AgentId } from "../host/adapters/ids.js";
import {
  adapterOf,
  agentsToWire,
  detectWiredAgents,
} from "../host/adapters/registry.js";
import { initRepository, repositoryRoot } from "../host/git-cli.js";
import { readGitBranch } from "../host/git.js";
import { isShallHomePath } from "../host/shall-home.js";
import {
  readRegistry,
  removeRegistryProject,
  upsertRegistryProject,
} from "../host/registry.js";

/**
 * A project, and WHICH AGENTS IT IS WIRED FOR — the second half computed rather
 * than stored.
 *
 * IT IS NOT PART OF THE REGISTRY RECORD, on purpose and for the reason the
 * branch is not: a registry entry is a fact this machine persists, and what a
 * project is wired for is a fact of the working tree that a `git clone`, a
 * hand-deleted folder or somebody else's `shall init` moves underneath it. The
 * files are the record; this is what they said at the moment of the answer.
 */
export interface WiredProject extends RegistryProject {
  agents: AgentId[];
}

/**
 * Wires a project for the union of what was asked for and what is already
 * there, and answers with the set that was written — see `agentsToWire` for
 * why the union and why the Claude fallback.
 */
async function wireAgents(
  absolutePath: string,
  requested: readonly AgentId[] | undefined,
): Promise<AgentId[]> {
  const wired = agentsToWire(
    requested ?? [],
    await detectWiredAgents(absolutePath),
  );
  await Promise.all(wired.map((id) => adapterOf(id).wire(absolutePath)));
  return wired;
}

export async function createProject(
  projectPath: string,
  options: {
    initGit?: boolean | undefined;
    agents?: readonly AgentId[] | undefined;
  } = {},
): Promise<WiredProject> {
  const absolutePath = normalizeProjectPath(projectPath);
  await assertDirectory(absolutePath);

  if (await pathExists(getProjectShallPath(absolutePath))) {
    return openProject(absolutePath, { agents: options.agents });
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
  const agents = await wireAgents(absolutePath, options.agents);
  const project = toRegistryProject(absolutePath, metadata);
  await upsertRegistryProject(project);
  return { ...project, agents };
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
  options: { agents?: readonly AgentId[] | undefined } = {},
): Promise<WiredProject> {
  const absolutePath = normalizeProjectPath(projectPath);
  await assertDirectory(absolutePath);
  await assertOpenable(absolutePath);
  const metadata = await readProjectMetadata(absolutePath);
  if (!isProjectMetadata(metadata)) {
    throw new Error(`Invalid Shall project: ${absolutePath}`);
  }

  // A project arrives here from a git clone as often as from this machine's own
  // `create`. Four tidyings are cheap and quiet when there is nothing to do:
  // the spec folder is made if it is not there, the machine's reference
  // templates under `~/.shall/templates` are brought current, a template set
  // an older Shall committed into this project is removed — templates live
  // with Shall now, and a stale copy in the repository would teach an agent a
  // format the daemon no longer writes — and every agent this project is wired
  // for is wired again: the generated commands and skills, the compile hook,
  // the rules an agent reads before it does anything, and the two deny rules
  // that keep Shall's own home out of its reading and the ledgers out of its
  // pen. Which agents those are is the union of what the caller asked for and
  // what the files already show, and `agentsToWire` says why.
  //
  // NONE IS A CONDITION OF OPENING. All four are conveniences — so a folder
  // Shall may read but not write into (a read-only mount, a checkout owned by
  // somebody else) opens and serves its graph rather than failing the click
  // with an errno. Reading a project should never require the right to write
  // to it.
  const [, , , agents] = await Promise.all([
    ensureProjectSpec(absolutePath).catch(() => undefined),
    writeSharedTemplates().catch(() => undefined),
    removeProjectTemplates(absolutePath).catch(() => undefined),
    wireAgents(absolutePath, options.agents),
  ]);

  const project = toRegistryProject(absolutePath, metadata);
  await upsertRegistryProject(project);
  return { ...project, agents };
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
 * IT IS `refresh` AND NOT `wire`, and not the whole of what an open does. An
 * adapter's `refresh` is the prose Shall generates and regenerates; its `wire`
 * additionally merges into files that are somebody else's — the deny rules
 * above all — and those are merged into only when a person actually opens
 * their project. The spec folder and the shared templates are made where they
 * are needed. What this sweep owns is exactly the prose a new version changes.
 *
 * IT REFRESHES WHAT EACH PROJECT IS WIRED FOR AND NEVER WIDENS IT. A Codex-only
 * project is swept as a Codex-only project; a project wired for neither — a
 * kit somebody deleted — falls back to Claude, which is the standing policy and
 * is argued over `agentsToWire`.
 *
 * NOTHING HERE IS A CONDITION OF STARTING, and nothing here throws. A registry
 * that will not read, a folder somebody deleted, a checkout mounted read-only:
 * each is skipped in silence, for the same reason an open's conveniences are —
 * the right to write into a project is not the price of running Shall. A PATH
 * WHOSE `.shall` IS GONE IS NO LONGER A PROJECT and is skipped too, because a
 * kit written into a folder that stopped being one is litter left by a daemon
 * nobody asked to visit.
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
      const wired = agentsToWire([], await detectWiredAgents(project.path));
      await Promise.all(
        wired.map((id) => adapterOf(id).refresh(project.path)),
      );
    }),
  );
}

/**
 * WHAT A FOLDER IS, AND WHAT IT IS WIRED FOR — the question `shall init` asks
 * before it asks a person anything.
 *
 * IT IS A READING AND NOT A DOOR. Nothing is made, nothing is written and
 * nothing is registered: a terminal standing in an unknown folder needs to know
 * whether it is about to make a project or refresh one, and whether the agent
 * picker should offer everything or only what is missing.
 *
 * `isProject` WALKS UP, the way `shall check` does, because a person runs
 * `init` from wherever they are standing. `wired` does NOT walk up: a kit is
 * written into the project root and the answer is about that root, so it is
 * read there — and it is the RAW detection, with no Claude fallback in it,
 * because the caller is about to decide what to ask for and a fallback would
 * put words in the files' mouth.
 */
export async function projectWiring(
  projectPath: string,
): Promise<{ isProject: boolean; wired: AgentId[] }> {
  const root = await findProjectRootAbove(
    normalizeProjectPath(projectPath),
  ).catch(() => null);
  if (root === null) {
    return { isProject: false, wired: [] };
  }
  return { isProject: true, wired: await detectWiredAgents(root) };
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
