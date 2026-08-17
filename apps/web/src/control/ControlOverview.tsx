import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { api } from "@/api";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { PANELS, type PanelMeta } from "./panels";
import {
  BOARD_KIND_LABEL,
  boardRows,
  rowSummary,
  rowTitle,
} from "./task-board/rows";
import { KIND_LABEL, bundleSummary } from "./review-queue/ReviewQueue";
import { useProject } from "@/project-context";
import type { ReviewBundle, TaskBoard } from "@/spec/review";

/**
 * How many rows the overview card shows before it says "and N more". A card is
 * a glance and not the panel: three lines say whether there is work and what
 * kind, and the panel behind "View all" says the rest.
 */
const GLANCE = 3;

/**
 * THE REVIEW QUEUE'S CARD IS LIVE; the other three are still their placeholder
 * sentence. It reads the same `spec.reviewQueue` the panel reads — computed on
 * every ask, stored nowhere — so the overview cannot say "nothing is waiting"
 * while the panel behind it holds bundles. Loading, a refusal and an empty
 * queue each have their own honest shape: a skeleton, the daemon's sentence,
 * the panel's own empty line.
 */
function ReviewQueueGlance({ panel }: { panel: PanelMeta }) {
  const project = useProject();
  const base = `/p/${encodeURIComponent(project.id)}/control`;
  const [bundles, setBundles] = useState<ReviewBundle[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setBundles(null);
    setError(null);
    api.spec.reviewQueue
      .query({ projectId: project.id })
      .then((queue) => {
        if (live) setBundles(queue.bundles);
      })
      .catch((loadError: unknown) => {
        if (live) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not read the review queue",
          );
        }
      });
    return () => {
      live = false;
    };
  }, [project.id]);

  if (error !== null) {
    return <p className="text-destructive text-sm">{error}</p>;
  }
  if (bundles === null) {
    return (
      <div className="grid gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  if (bundles.length === 0) {
    return <EmptyState message={panel.empty} />;
  }
  const rest = bundles.length - GLANCE;
  return (
    <ul className="grid gap-2">
      {bundles.slice(0, GLANCE).map((bundle) => (
        <li key={bundle.id} className="flex min-w-0 items-center gap-2">
          <Badge variant="secondary">{KIND_LABEL[bundle.kind]}</Badge>
          {/* EVERY ROW IS ITS OWN DOOR. A glance that could only be entered
              through "View all" made a person land on the list they had just
              read and find the row again; the title here goes where the title
              in the panel goes. It is why the card is no longer one big link —
              a link inside a link is not a thing a browser can honour. */}
          <Link
            to={`${base}/review-queue/${encodeURIComponent(bundle.id)}`}
            className="text-primary truncate text-sm underline-offset-4 hover:underline"
          >
            {bundle.title}
          </Link>
          <span className="text-muted-foreground shrink-0 text-xs">
            {bundleSummary(bundle)}
          </span>
        </li>
      ))}
      {rest > 0 ? (
        <li className="text-muted-foreground text-xs">
          {`and ${String(rest)} more`}
        </li>
      ) : null}
    </ul>
  );
}

/**
 * THE BOARD AT A GLANCE — the same three rows the queue's card shows, over the
 * other list, and each of them its own door.
 *
 * IT IS THE SAME FETCH THE PANEL MAKES and not a cheaper summary procedure: the
 * board is computed on read either way, and a second endpoint counting the same
 * rows would be a second place for them to disagree.
 */
function TaskBoardGlance({ panel }: { panel: PanelMeta }) {
  const project = useProject();
  const base = `/p/${encodeURIComponent(project.id)}/control`;
  const [board, setBoard] = useState<TaskBoard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setBoard(null);
    setError(null);
    api.spec.taskBoard
      .query({ projectId: project.id })
      .then((next) => {
        if (live) {
          setBoard(next);
        }
      })
      .catch((loadError: unknown) => {
        if (live) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not read the task board",
          );
        }
      });
    return () => {
      live = false;
    };
  }, [project.id]);

  if (error !== null) {
    return <p className="text-destructive text-sm">{error}</p>;
  }
  if (board === null) {
    return (
      <div className="grid gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  const rows = boardRows(board);
  if (rows.length === 0) {
    return <EmptyState message={panel.empty} />;
  }
  const rest = rows.length - GLANCE;
  return (
    <ul className="grid gap-2">
      {rows.slice(0, GLANCE).map((row) => (
        <li key={row.item.key} className="flex min-w-0 items-center gap-2">
          <Badge variant="secondary">{BOARD_KIND_LABEL[row.kind]}</Badge>
          <Link
            to={`${base}/task-board/${encodeURIComponent(row.item.key)}`}
            className="text-primary truncate text-sm underline-offset-4 hover:underline"
          >
            {rowTitle(row)}
          </Link>
          <span className="text-muted-foreground shrink-0 truncate text-xs">
            {rowSummary(row)}
          </span>
        </li>
      ))}
      {rest > 0 ? (
        <li className="text-muted-foreground text-xs">
          {`and ${String(rest)} more`}
        </li>
      ) : null}
    </ul>
  );
}

export function ControlOverview() {
  const project = useProject();
  const base = `/p/${encodeURIComponent(project.id)}/control`;

  return (
    <>
      <div className="space-y-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>Control plane</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Overview</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        {/* THE SENTENCE SITS BESIDE THE TITLE, on its baseline, at a caption's
            weight — one line that says what the page is, read in the same
            glance as its name. It wraps under the title only when the row runs
            out of room. Same arrangement on every Control plane page. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-muted-foreground text-sm">
            Four surfaces, summarised — open any panel for the full record
          </p>
        </div>
      </div>

      {/* THE CARD IS NO LONGER ONE BIG LINK, and its rows are why: a glance
          whose items each open their own page cannot be wrapped in an anchor —
          a link inside a link is not a thing a browser can honour, and the
          inner one silently loses. So the card keeps two doors of its own, the
          title at the top and "View all" at the foot, and everything between
          them is the panel's own rows with their own destinations. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {PANELS.map((panel) => (
          <Card key={panel.id} className="h-full">
            <CardHeader>
              <CardTitle>
                <Link
                  to={`${base}/${panel.id}`}
                  className="hover:text-primary underline-offset-4 hover:underline"
                >
                  {panel.title}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              {panel.id === "review-queue" ? (
                <ReviewQueueGlance panel={panel} />
              ) : panel.id === "task-board" ? (
                <TaskBoardGlance panel={panel} />
              ) : (
                <EmptyState message={panel.empty} />
              )}
            </CardContent>
            <Link
              to={`${base}/${panel.id}`}
              className="text-primary flex items-center gap-1 px-6 text-sm underline-offset-4 hover:underline"
            >
              View all
              <ArrowRight className="size-4" />
            </Link>
          </Card>
        ))}
      </div>
    </>
  );
}
