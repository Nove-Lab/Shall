import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { ProjectPicker } from "./components/ProjectPicker";
import { HomeScreen } from "./screens/HomeScreen";
import { ProjectScreen } from "./screens/ProjectScreen";

interface Project {
  id: string;
  path: string;
  name: string;
}

interface RecentProject extends Project {
  exists: boolean;
}

export function App() {
  const [projects, setProjects] = useState<RecentProject[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await api.projects.recent.query());
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Could not load recent projects",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  async function openProject(path: string) {
    setBusy(true);
    setError(null);
    try {
      const project = await api.projects.open.mutate({ path });
      setActiveProject(project);
      setPickerOpen(false);
      await refreshProjects();
    } catch (openError) {
      setError(
        openError instanceof Error ? openError.message : "Could not open project",
      );
    } finally {
      setBusy(false);
    }
  }

  async function chooseProject(path: string, hasShall: boolean) {
    if (!hasShall) {
      const confirmed = window.confirm(
        "Initialize this folder as a Shall project?",
      );
      if (!confirmed) {
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      const project = hasShall
        ? await api.projects.open.mutate({ path })
        : await api.projects.create.mutate({ path });
      setActiveProject(project);
      setPickerOpen(false);
      await refreshProjects();
    } catch (projectError) {
      setError(
        projectError instanceof Error
          ? projectError.message
          : "Could not open project",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeProject(id: string) {
    await api.projects.remove.mutate({ id });
    await refreshProjects();
  }

  if (activeProject) {
    return (
      <ProjectScreen
        name={activeProject.name}
        onHome={() => {
          setActiveProject(null);
          void refreshProjects();
        }}
      />
    );
  }

  return (
    <>
      <HomeScreen
        loading={loading}
        projects={projects}
        onOpenPicker={() => {
          setError(null);
          setPickerOpen(true);
        }}
        onOpenProject={(path) => void openProject(path)}
        onRemoveProject={(id) => void removeProject(id)}
      />
      {error && !pickerOpen && <p className="global-error">{error}</p>}
      {pickerOpen && (
        <ProjectPicker
          actionError={error}
          busy={busy}
          onCancel={() => setPickerOpen(false)}
          onChoose={(path, hasShall) => void chooseProject(path, hasShall)}
        />
      )}
    </>
  );
}
