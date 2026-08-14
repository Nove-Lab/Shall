/**
 * What the daemon knows that the graph does not: the host's `~/.shall`, the
 * project registry, and the shapes the screens read. Graph values live in
 * `@shall/core/graph`.
 */
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
  /** Where the graph itself is: the committed markdown under `.shall/spec`. */
  specPath: string;
}
