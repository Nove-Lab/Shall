import { useCallback, useEffect, useState } from "react";
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import {
  Activity,
  ChartLine,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Settings,
  Shuffle,
} from "lucide-react";
import { api } from "@/api";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PANELS } from "@/control/panels";
import type { PanelId } from "@/control/panels";
import { useIsNarrow } from "@/hooks/use-narrow";
import { cn } from "@/lib/utils";
import { ProjectProvider } from "@/project-context";
import type { Project } from "@/project-context";

const PANEL_ICON: Record<PanelId, typeof ListChecks> = {
  "review-queue": ListChecks,
  "task-board": ScrollText,
  "activity-feed": Activity,
  vitals: ChartLine,
};

function ControlSidebar({ projectId }: { projectId: string }) {
  const { pathname } = useLocation();
  const base = `/p/${encodeURIComponent(projectId)}/control`;

  return (
    // `collapsible="icon"` gives the narrow layout its icon rail. The panel is
    // fixed to the viewport, so it is offset past the two shell rows.
    <Sidebar
      collapsible="icon"
      className="!top-[var(--shell-header)] h-[calc(100svh-var(--shell-header))]"
    >
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Sections</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link to={base} />}
                isActive={pathname === base}
                tooltip="Overview"
              >
                <LayoutDashboard />
                <span>Overview</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {PANELS.map((panel) => {
              const Icon = PANEL_ICON[panel.id];
              return (
                <SidebarMenuItem key={panel.id}>
                  <SidebarMenuButton
                    render={<Link to={`${base}/${panel.id}`} />}
                    isActive={pathname === `${base}/${panel.id}`}
                    tooltip={panel.title}
                  >
                    <Icon />
                    <span>{panel.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

type LoadState = "loading" | "ready" | "missing";

export function ShellLayout() {
  const { projectId = "" } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  const load = useCallback(async () => {
    const found = await api.projects.get.query({ id: projectId });
    if (!found) {
      setState("missing");
      return;
    }
    setProject(found);
    setState("ready");
  }, [projectId]);

  useEffect(() => {
    setState("loading");
    void load().catch(() => setState("missing"));
  }, [load]);

  const base = `/p/${encodeURIComponent(projectId)}`;
  const onControl = pathname.startsWith(`${base}/control`);
  // No matching tab value leaves the row unselected, which is what Settings
  // needs: it is reachable from the shell but is not a plane.
  const plane = onControl
    ? "control"
    : pathname.startsWith(`${base}/spec`)
      ? "spec"
      : "none";

  // Narrow viewports get the icon rail; the rail itself can still override it.
  const isNarrow = useIsNarrow();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => setSidebarOpen(!isNarrow), [isNarrow]);

  if (state === "missing") {
    // A stale link — the project was removed, renamed away or never existed.
    return <Navigate to="/" replace />;
  }

  return (
    // `--shell-header` is the height of the two rows below, which the fixed
    // section sidebars have to clear.
    <div className="flex min-h-svh flex-col [--shell-header:6.25rem]">
      {/* Row 1 — identity and project-level actions. Both shell rows are
          pinned: the section sidebar is fixed under them, so if they scrolled
          away its panel would detach from the top of the page. */}
      <header className="bg-background sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b px-4">
        {/* The wordmark goes home inside the project. Leaving the project is
            the Switch project button's job, and only its job. */}
        <Link
          to={`${base}/control`}
          className="text-base font-semibold tracking-tight"
        >
          Shall
        </Link>
        <Separator orientation="vertical" className="!h-4" />
        {project ? (
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-medium">{project.name}</span>
            <span className="text-muted-foreground truncate font-mono text-xs">
              {project.path}
            </span>
          </span>
        ) : (
          <Skeleton className="h-4 w-56" />
        )}
        {/* THESE TWO NAVIGATE, SO THEY ARE LINKS WEARING THE BUTTON'S LOOK.
            `<Button render={<Link/>}>` renders an `<a>` out of Base UI's button
            primitive, which defaults `nativeButton` to true and said so twice
            on every mount of the shell — the only console errors the app
            produced. The two ways out of that are `nativeButton={false}`, which
            quiets the warning by putting `role="button"` on something that is
            a link and reads as one to a screen reader, and `buttonVariants`,
            which is what the button exports for exactly this case: the anchor
            stays an anchor, keeps its middle-click and its context menu, and
            only borrows the styling. */}
        <Link
          to="/"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "shrink-0",
          )}
        >
          <Shuffle />
          Switch project
        </Link>
        <Link
          to={`${base}/settings`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "ml-auto shrink-0",
          )}
        >
          <Settings />
          Settings
        </Link>
      </header>

      {/* Row 2 — plane switch. This underline is the only "you are here"
          signal, so the planes carry no page title of their own.
          `top-14` is row 1's height, so this pins directly beneath it. */}
      <div className="bg-background sticky top-14 z-20 flex h-11 shrink-0 items-center border-b px-4">
        <Tabs
          value={plane}
          onValueChange={(value) => void navigate(`${base}/${String(value)}`)}
        >
          <TabsList variant="line" aria-label="Planes">
            {/* The active plane carries the accent on both the label and its
                underline — the planes get no other "you are here" signal. */}
            <TabsTrigger
              value="control"
              className="data-active:text-primary data-active:font-semibold after:bg-primary"
            >
              Control plane
            </TabsTrigger>
            <TabsTrigger
              value="spec"
              className="data-active:text-primary data-active:font-semibold after:bg-primary"
            >
              Spec plane
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {state !== "ready" || !project ? (
        <div className="flex flex-1 flex-col gap-4 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <ProjectProvider project={project} refresh={load}>
          {onControl ? (
            // The provider only spans the region under the plane nav, so the
            // section sidebar starts where the header ends.
            <SidebarProvider
              open={sidebarOpen}
              onOpenChange={setSidebarOpen}
              className="min-h-0 flex-1"
            >
              <ControlSidebar projectId={projectId} />
              {/* `min-w-0` lets the content shrink past its own min-content
                  width, so the rail never forces a horizontal scroll. */}
              <SidebarInset className="min-w-0">
                <Outlet />
              </SidebarInset>
            </SidebarProvider>
          ) : (
            <Outlet />
          )}
        </ProjectProvider>
      )}
    </div>
  );
}
