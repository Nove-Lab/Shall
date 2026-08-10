import { isProjectMetadata } from "./project-model.js";
import type { GlobalSettings, ProjectSettings, RegistryProject } from "./types.js";
import {
  getProjectDatabasePath,
  getProjectShallPath,
  readProjectMetadata,
  writeProjectMetadata,
} from "../store/project-files.js";
import { readRegistry, renameRegistryProject } from "../store/registry.js";
import {
  getShallHome,
  readConfig,
  writeJsonAtomic,
} from "../store/shall-home.js";

/* -------------------------------------------------------------------------- */
/* ~/.shall                                                                    */
/* -------------------------------------------------------------------------- */

export async function readGlobalSettings(): Promise<GlobalSettings> {
  const home = getShallHome();
  const [config, registry] = await Promise.all([readConfig(), readRegistry()]);
  return {
    port: config.port,
    homePath: home.root,
    configPath: home.configPath,
    registryPath: home.registryPath,
    projectCount: registry.projects.length,
  };
}

export async function updateGlobalSettings(input: {
  port: number;
}): Promise<GlobalSettings> {
  const home = getShallHome();
  // Spread the existing config so keys added later are not dropped by an edit
  // that only touches the port.
  const config = await readConfig();
  await writeJsonAtomic(home.configPath, { ...config, port: input.port });
  return readGlobalSettings();
}

/* -------------------------------------------------------------------------- */
/* <project>/.shall                                                            */
/* -------------------------------------------------------------------------- */

async function requireRegistryProject(id: string): Promise<RegistryProject> {
  const registry = await readRegistry();
  const entry = registry.projects.find((project) => project.id === id);
  if (!entry) {
    throw new Error(`Unknown project: ${id}`);
  }
  return entry;
}

export async function readProjectSettings(
  id: string,
): Promise<ProjectSettings> {
  const entry = await requireRegistryProject(id);
  const metadata = await readProjectMetadata(entry.path);
  if (!isProjectMetadata(metadata)) {
    throw new Error(`Invalid Shall project: ${entry.path}`);
  }

  return {
    id: metadata.id,
    name: metadata.name,
    path: entry.path,
    schemaVersion: metadata.schemaVersion,
    shallPath: getProjectShallPath(entry.path),
    databasePath: getProjectDatabasePath(entry.path),
  };
}

export async function updateProjectSettings(input: {
  id: string;
  name: string;
}): Promise<ProjectSettings> {
  const entry = await requireRegistryProject(input.id);
  const metadata = await readProjectMetadata(entry.path);
  if (!isProjectMetadata(metadata)) {
    throw new Error(`Invalid Shall project: ${entry.path}`);
  }

  await writeProjectMetadata(entry.path, { ...metadata, name: input.name });
  await renameRegistryProject(input.id, input.name);
  return readProjectSettings(input.id);
}
