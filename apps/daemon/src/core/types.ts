export interface ShallConfig {
  port: number;
}

export interface DaemonState {
  pid: number;
  port: number;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  schemaVersion: 1;
}

/** A row of a project's `nodes` table — the Spec plane's whole record. */
export interface SpecNode {
  id: string;
  type: string;
  /** A JSON object, stored as text. */
  attrs: string;
  createdAt: number;
}

export interface RegistryProject {
  id: string;
  path: string;
  name: string;
}

export interface Registry {
  projects: RegistryProject[];
}

export interface RecentProject extends RegistryProject {
  exists: boolean;
}

/** Everything the Settings screen shows for `~/.shall`. */
export interface GlobalSettings {
  /** The only writable key in config.json today. */
  port: number;
  homePath: string;
  configPath: string;
  registryPath: string;
  projectCount: number;
}

/** Everything the Settings screen shows for `<project>/.shall`. */
export interface ProjectSettings {
  id: string;
  /** The only writable key in project.json today. */
  name: string;
  path: string;
  schemaVersion: number;
  shallPath: string;
  databasePath: string;
}
