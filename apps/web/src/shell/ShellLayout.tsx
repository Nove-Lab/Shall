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
  GitBranch,
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
  SidebarMenuBadge,
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
import { LiveProvider, useRevision } from "@/live";
import { cn } from "@/lib/utils";
import { ProjectProvider } from "@/project-context";
import type { Project } from "@/project-context";

const PANEL_ICON: Record<PanelId, typeof ListChecks> = {
  "review-queue": ListChecks,
  "task-board": ScrollText,
  "activity-feed": Activity,
  vitals: ChartLine,
};

/**
 * HOW MANY THINGS ARE WAITING, FOR THE TWO PANELS THAT KEEP A QUEUE.
 *
 * It asks the panels' OWN procedures rather than a summary one, for the reason
 * the overview's cards do (see `ControlOverview`): both lists are computed on
 * read either way, and a second endpoint counting the same rows would be a
 * second place for them to disagree. One `Promise.all` is one request, since
 * the client batches.
 *
 * A FAILURE KEEPS THE LAST NUMBER RATHER THAN SHOWING NOTHING. A badge is a
 * pointer at a panel, not a place a fact lives; the panel behind it is where a
 * refusal gets said properly.
 */
function useWaitingCounts(
  projectId: string,
  enabled: boolean,
): { queue: number; board: number } {
  const revision = useRevision();
  const [counts, setCounts] = useState({ queue: 0, board: 0 });

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let live = true;
    void Promise.all([
      api.spec.reviewQueue.query({ projectId }),
      api.spec.taskBoard.query({ projectId }),
    ])
      .then(([queue, board]) => {
        if (live) {
          setCounts({
            queue: queue.bundles.length,
            board: board.fixSpec.length + board.implement.length,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [projectId, enabled, revision]);

  return counts;
}

function ControlSidebar({ projectId }: { projectId: string }) {
  const { pathname } = useLocation();
  const base = `/p/${encodeURIComponent(projectId)}/control`;
  // Only asked while this sidebar is on screen, which is only on the control
  // plane: a person reading the graph has not asked for the queue to be counted
  // every time a file moves.
  const waiting = useWaitingCounts(projectId, true);

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
              const count =
                panel.id === "review-queue"
                  ? waiting.queue
                  : panel.id === "task-board"
                    ? waiting.board
                    : 0;
              return (
                <SidebarMenuItem key={panel.id}>
                  <SidebarMenuButton
                    render={<Link to={`${base}/${panel.id}`} />}
                    // A panel owns the pages beneath it too — a review bundle
                    // at `/control/review-queue/<id>` is still the Review
                    // Queue — so the match is on the prefix, with the slash
                    // so that no panel id can be a prefix of another's.
                    isActive={
                      pathname === `${base}/${panel.id}` ||
                      pathname.startsWith(`${base}/${panel.id}/`)
                    }
                    tooltip={panel.title}
                  >
                    <Icon />
                    <span>{panel.title}</span>
                  </SidebarMenuButton>
                  {/* A SIBLING OF THE BUTTON AND NOT A CHILD: the badge is
                      positioned against the item and takes its offset from the
                      button beside it. Nothing at zero — an empty queue is a
                      state worth reading as quiet, not as a nought. The icon
                      rail hides it, which is the component's own doing and
                      right: there is no room to read a number there. */}
                  {count > 0 ? (
                    <SidebarMenuBadge>{count}</SidebarMenuBadge>
                  ) : null}
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
  /**
   * The branch the project's repository is on — null while unknown and for a
   * project that is not a repository, and the header shows nothing for both,
   * because "not a git project" is an ordinary state and not a gap. The spec
   * is committed files now, so which branch is checked out is which spec is
   * on screen; that is why it earns a place beside the path.
   */
  const [branch, setBranch] = useState<string | null>(null);

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

  // Asked on its own cadence: the branch moves under `git checkout` in some
  // terminal, and coming back to this window is the moment that happens, so a
  // focus is the refetch and there is no polling loop to keep warm.
  useEffect(() => {
    let alive = true;
    const ask = () =>
      void api.projects.gitBranch
        .query({ id: projectId })
        .then((answer) => {
          if (alive) {
            setBranch(answer.branch);
          }
        })
        .catch(() => undefined);
    ask();
    window.addEventListener("focus", ask);
    return () => {
      alive = false;
      window.removeEventListener("focus", ask);
    };
  }, [projectId]);

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
            {/* The branch is which spec is on screen, now that the spec is
                committed files — shown only when there is a repository, and
                kept whole (`shrink-0`) while the path beside it truncates.

                DRAWN AS A BADGE WHOSE BASELINE IS ITS TEXT'S. A flex row takes
                its baseline from its first item, and an icon has none — its
                bottom edge stands in, which is what floated this label off the
                path's baseline. So the row aligns its items by BASELINE (the
                branch name participates, and the container inherits its
                baseline) while the icon alone opts out with `self-center` to
                sit mid-text. The badge box then hangs its padding around that
                shared baseline, which is how a chip sits in a line of text. */}
            {branch !== null ? (
              <span className="text-muted-foreground bg-muted flex shrink-0 items-baseline gap-1 rounded-md border px-1.5 py-0.5 font-mono text-xs">
                <GitBranch className="size-3 self-center" aria-hidden />
                {branch}
              </span>
            ) : null}
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
          {/* Inside the project and outside every surface: one stream per
              project, and every page under it reads the same tick. */}
          <LiveProvider projectId={projectId}>
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
          </LiveProvider>
        </ProjectProvider>
      )}
    </div>
  );
}
