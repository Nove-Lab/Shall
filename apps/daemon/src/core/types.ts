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
