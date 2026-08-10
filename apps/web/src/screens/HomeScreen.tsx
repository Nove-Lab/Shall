import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { FolderOpen, Trash2 } from "lucide-react";
import { api } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ProjectPicker } from "@/components/ProjectPicker";

interface RecentProject {
  id: string;
  path: string;
  name: string;
  exists: boolean;
}

export function HomeScreen() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<RecentProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
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

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const enter = useCallback(
    (id: string) => navigate(`/p/${encodeURIComponent(id)}/control`),
    [navigate],
  );

  async function open(path: string) {
    setBusy(true);
    setError(null);
    try {
      const project = await api.projects.open.mutate({ path });
      setPickerOpen(false);
      void enter(project.id);
    } catch (openError) {
      setError(
        openError instanceof Error ? openError.message : "Could not open project",
      );
    } finally {
      setBusy(false);
    }
  }

  async function choose(path: string, hasShall: boolean) {
    if (!hasShall && !window.confirm("Initialize this folder as a Shall project?")) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const project = hasShall
        ? await api.projects.open.mutate({ path })
        : await api.projects.create.mutate({ path });
      setPickerOpen(false);
      void enter(project.id);
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

  async function remove(id: string) {
    await api.projects.remove.mutate({ id });
    await refresh();
  }

  return (
    <main className="bg-muted/30 flex min-h-svh items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Shall</h1>
          <p className="text-muted-foreground text-sm">
            Spec-driven control plane for AI coding agents
          </p>
        </div>

        <Button
          size="lg"
          disabled={busy}
          onClick={() => {
            setError(null);
            setPickerOpen(true);
          }}
        >
          <FolderOpen />
          Open Project
        </Button>

        {/* Card supplies its own symmetric padding and slot gap, so nothing
            here hand-rolls spacing around the title. */}
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Recent projects
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {loading ? (
              <div className="space-y-3 px-(--card-spacing)">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : projects.length === 0 ? (
              <EmptyState message="No projects yet — open a folder to get started" />
            ) : (
              <ul>
                {projects.map((project, index) => (
                  <li key={project.id}>
                    {index > 0 ? <Separator /> : null}
                    <div className="flex items-center gap-3 px-(--card-spacing) py-3">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left disabled:opacity-50"
                        disabled={!project.exists}
                        // Goes through `open` rather than straight to the id:
                        // that validates the folder and bumps recency.
                        onClick={() =>
                          project.exists ? void open(project.path) : undefined
                        }
                      >
                        <span className="block truncate text-sm font-medium">
                          {project.name}
                        </span>
                        <span className="text-muted-foreground block truncate font-mono text-xs">
                          {project.path}
                        </span>
                      </button>
                      {project.exists ? null : (
                        <>
                          <Badge variant="destructive">Folder not found</Badge>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${project.name}`}
                            onClick={() => void remove(project.id)}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {error && !pickerOpen ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : null}
      </div>

      <ProjectPicker
        open={pickerOpen}
        busy={busy}
        actionError={pickerOpen ? error : null}
        onOpenChange={setPickerOpen}
        onChoose={(path, hasShall) => void choose(path, hasShall)}
      />
    </main>
  );
}
