import { useCallback, useEffect, useState } from "react";
import { FolderTree, Globe } from "lucide-react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsNarrow } from "@/hooks/use-narrow";
import { useProjectContext } from "@/project-context";

interface GlobalSettings {
  port: number;
  homePath: string;
  configPath: string;
  registryPath: string;
  projectCount: number;
}

interface ProjectSettings {
  id: string;
  name: string;
  path: string;
  schemaVersion: number;
  shallPath: string;
  specPath: string;
}

const GROUPS = [
  { id: "global", title: "Global settings", icon: Globe },
  { id: "project", title: "Project settings", icon: FolderTree },
] as const;

/** A value Shall reads but nothing in the UI can change. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-muted-foreground font-mono text-xs break-all">
        {value}
      </span>
    </div>
  );
}

function Section({
  id,
  title,
  description,
  source,
  children,
}: {
  id: string;
  title: string;
  description: string;
  source: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`settings-${id}`}
      className="max-w-4xl scroll-mt-[calc(var(--shell-header)+1.5rem)] space-y-3"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
        <p className="text-muted-foreground/70 font-mono text-xs">{source}</p>
      </div>
      <Card>
        <CardContent className="grid gap-6">{children}</CardContent>
      </Card>
    </section>
  );
}

export function SettingsScreen() {
  const { project, refresh } = useProjectContext();

  const [global, setGlobal] = useState<GlobalSettings | null>(null);
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [port, setPort] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const [globalSettings, projectSettings] = await Promise.all([
      api.settings.global.query(),
      api.settings.project.query({ id: project.id }),
    ]);
    setGlobal(globalSettings);
    setSettings(projectSettings);
    setPort(String(globalSettings.port));
    setName(projectSettings.name);
  }, [project.id]);

  useEffect(() => {
    void load().catch((loadError: unknown) =>
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not read settings",
      ),
    );
  }, [load]);

  // Narrow viewports get the icon rail; the rail itself can still override it.
  const isNarrow = useIsNarrow();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => setSidebarOpen(!isNarrow), [isNarrow]);

  const [active, setActive] = useState<string>(GROUPS[0].id);
  const jumpTo = (id: string) => {
    setActive(id);
    document.getElementById(`settings-${id}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const portNumber = Number(port);
  const portValid =
    Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65_535;
  const dirty =
    (global !== null && portValid && portNumber !== global.port) ||
    (settings !== null && name.trim() !== "" && name.trim() !== settings.name);

  async function save() {
    if (!global || !settings) {
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      if (portValid && portNumber !== global.port) {
        setGlobal(await api.settings.updateGlobal.mutate({ port: portNumber }));
      }
      if (name.trim() && name.trim() !== settings.name) {
        setSettings(
          await api.settings.updateProject.mutate({
            id: project.id,
            name: name.trim(),
          }),
        );
        // The header shows the name too, so the shell has to re-read it.
        await refresh();
      }
      setSaved(true);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save settings",
      );
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (global) {
      setPort(String(global.port));
    }
    if (settings) {
      setName(settings.name);
    }
    setError(null);
    setSaved(false);
  }

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      className="min-h-0 flex-1"
    >
      {/* Same rail as the Control plane: collapses to icons when narrow. */}
      <Sidebar
        collapsible="icon"
        className="!top-[var(--shell-header)] h-[calc(100svh-var(--shell-header))]"
      >
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Setting groups</SidebarGroupLabel>
            <SidebarMenu>
              {GROUPS.map((group) => (
                <SidebarMenuItem key={group.id}>
                  <SidebarMenuButton
                    isActive={active === group.id}
                    onClick={() => jumpTo(group.id)}
                    tooltip={group.title}
                  >
                    <group.icon />
                    <span>{group.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0">
        <div className="flex flex-1 flex-col gap-6 p-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Shall Settings
            </h1>
            <p className="text-muted-foreground text-sm">
              Everything Shall reads on start-up, in one place
            </p>
          </div>

          {!global || !settings ? (
            <div className="max-w-4xl space-y-4">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : (
            <>
              <Section
                id="global"
                title="Global settings"
                description="Applies to every project you open in Shall"
                source={global.configPath}
              >
                <div className="grid gap-2">
                  <Label htmlFor="port">Daemon port</Label>
                  <Input
                    id="port"
                    type="number"
                    min={1}
                    max={65535}
                    value={port}
                    onChange={(event) => setPort(event.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    The port <span className="font-mono">shall</span> binds on.
                    Takes effect the next time the daemon starts.
                  </p>
                  {port !== "" && !portValid ? (
                    <p className="text-destructive text-xs">
                      Enter a port between 1 and 65535.
                    </p>
                  ) : null}
                </div>
                <Fact label="Shall home" value={global.homePath} />
                <Fact label="Project registry" value={global.registryPath} />
                <Fact
                  label="Registered projects"
                  value={String(global.projectCount)}
                />
              </Section>

              <Section
                id="project"
                title="Project settings"
                description="Stored with the project and committed with the repo"
                source={`${settings.shallPath}/project.json`}
              >
                <div className="grid gap-2">
                  <Label htmlFor="project-name">Display name</Label>
                  <Input
                    id="project-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    Shown in the header and the project picker.
                  </p>
                  {name.trim() === "" ? (
                    <p className="text-destructive text-xs">
                      A display name is required.
                    </p>
                  ) : null}
                </div>
                <Fact label="Project ID" value={settings.id} />
                <Fact label="Location" value={settings.path} />
                <Fact
                  label="Schema version"
                  value={String(settings.schemaVersion)}
                />
                <Fact label="Spec folder" value={settings.specPath} />
              </Section>

              <div className="flex max-w-4xl items-center gap-3">
                <Button disabled={!dirty || saving} onClick={() => void save()}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
                <Button
                  variant="outline"
                  disabled={!dirty || saving}
                  onClick={discard}
                >
                  Discard
                </Button>
                {error ? (
                  <span className="text-destructive text-sm">{error}</span>
                ) : saved && !dirty ? (
                  <span className="text-muted-foreground text-sm">Saved</span>
                ) : null}
              </div>
            </>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
