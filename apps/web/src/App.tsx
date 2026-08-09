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

function projectIdFromPath(pathname: string): string | null {
  const match = /^\/p\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]!) : null;
}

function projectHref(id: string): string {
  return `/p/${encodeURIComponent(id)}`;
}

export function App() {
  const [projects, setProjects] = useState<RecentProject[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    setError(null);
    try {
      setProjects(await api.projects.recent.query());
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Could not load recent projects",
      );
    }
  }, []);

  const enterProject = useCallback((project: Project, mode: "push" | "replace") => {
    const href = projectHref(project.id);
    if (mode === "push") {
      history.pushState({ kind: "project", id: project.id }, "", href);
    } else {
      history.replaceState({ kind: "project", id: project.id }, "", href);
    }
    setActiveProject(project);
  }, []);

  const leaveProject = useCallback(
    (mode: "push" | "replace" = "push") => {
      if (mode === "push") {
        history.pushState({ kind: "home" }, "", "/");
      } else {
        history.replaceState({ kind: "home" }, "", "/");
      }
      setActiveProject(null);
      void refreshProjects();
    },
    [refreshProjects],
  );

  const restoreProject = useCallback(
    async (id: string, mode: "push" | "replace") => {
      const recent = await api.projects.recent.query();
      setProjects(recent);
      const found = recent.find((project) => project.id === id && project.exists);
      if (!found) {
        leaveProject("replace");
        return;
      }
      const project = await api.projects.open.mutate({ path: found.path });
      enterProject(project, mode);
    },
    [enterProject, leaveProject],
  );

  useEffect(() => {
    async function boot() {
      setLoading(true);
      setError(null);
      try {
        const recent = await api.projects.recent.query();
        setProjects(recent);
        const id = projectIdFromPath(window.location.pathname);
        if (!id) {
          return;
        }
        const found = recent.find((project) => project.id === id && project.exists);
        if (!found) {
          history.replaceState({ kind: "home" }, "", "/");
          return;
        }
        const project = await api.projects.open.mutate({ path: found.path });
        setActiveProject(project);
        history.replaceState({ kind: "project", id: project.id }, "", projectHref(project.id));
      } catch (bootError) {
        setError(
          bootError instanceof Error
            ? bootError.message
            : "Could not load recent projects",
        );
        if (projectIdFromPath(window.location.pathname)) {
          history.replaceState({ kind: "home" }, "", "/");
        }
      } finally {
        setLoading(false);
      }
    }

    void boot();
  }, []);

  useEffect(() => {
    function onPopState() {
      const id = projectIdFromPath(window.location.pathname);
      if (!id) {
        setActiveProject(null);
        void refreshProjects();
        return;
      }
      void restoreProject(id, "replace").catch(() => {
        leaveProject("replace");
      });
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [leaveProject, refreshProjects, restoreProject]);

  async function openProject(path: string) {
    setBusy(true);
    setError(null);
    try {
      const project = await api.projects.open.mutate({ path });
      enterProject(project, "push");
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
      enterProject(project, "push");
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
        onHome={() => leaveProject("push")}
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
