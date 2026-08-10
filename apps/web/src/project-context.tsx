import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export interface Project {
  id: string;
  path: string;
  name: string;
}

interface ProjectContextValue {
  project: Project;
  /** Re-reads the project. Settings calls this after renaming it. */
  refresh: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({
  project,
  refresh,
  children,
}: ProjectContextValue & { children: ReactNode }) {
  return <ProjectContext value={{ project, refresh }}>{children}</ProjectContext>;
}

export function useProject(): Project {
  return useProjectContext().project;
}

export function useProjectContext(): ProjectContextValue {
  const value = useContext(ProjectContext);
  if (!value) {
    throw new Error("useProject must be used inside ProjectProvider");
  }
  return value;
}
