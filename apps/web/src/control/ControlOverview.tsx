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
import { ACTIVITY_KIND_LABEL, activityRows, rowNote } from "./activity-feed/rows";
import { PANELS, type PanelMeta } from "./panels";
import { controlBase } from "./parts";
import { BOARD_KIND_LABEL, boardRows, rowSummary, rowTitle } from "./work-board/rows";
import { KIND_LABEL, bundleSummary } from "./review-queue/rows";
import { useRevision } from "@/live";
import { useProject } from "@/project-context";

/**
 * How many rows the overview card shows before it says "and N more". A card is
 * a glance and not the panel: three lines say whether there is work and what
 * kind, and the panel behind "View all" says the rest.
 */
const GLANCE = 3;

/**
 * One row of a glance, whatever list it came from — a badge, a door, a note.
 * The door is null where the row has no page of its own: a feed row is an
 * event that happened, not a thing to open, and its refs are doors only on
 * the panel, where there is room for them.
 */
interface GlanceRow {
  key: string;
  label: string;
  title: string;
  summary: string;
  href: string | null;
}

/**
 * THE THREE LIVE CARDS ARE ONE COMPONENT OVER THREE QUESTIONS; Vitals is still
 * its placeholder sentence. Each question here IS THE SAME FETCH ITS PANEL
 * MAKES and not a cheaper summary procedure: the lists are computed on read
 * either way, and a second endpoint counting the same rows would be a second
 * place for them to disagree. What differs between the three — the query, the
 * row's words, the row's door — is this table; the loading, error, empty and
 * "and N more" ladders are the component, written once.
 */
const GLANCE_ROWS: Record<
  "review-queue" | "work-board" | "activity-feed",
  {
    failed: string;
    rows: (projectId: string, base: string) => Promise<GlanceRow[]>;
  }
> = {
  "review-queue": {
    failed: "Could not read the review queue",
    rows: async (projectId, base) => {
      const queue = await api.spec.reviewQueue.query({ projectId });
      return queue.bundles.map((bundle) => ({
        key: bundle.id,
        label: KIND_LABEL[bundle.kind],
        title: bundle.title,
        summary: bundleSummary(bundle),
        href: `${base}/review-queue/${encodeURIComponent(bundle.id)}`,
      }));
    },
  },
  "work-board": {
    failed: "Could not read the work board",
    rows: async (projectId, base) => {
      const board = await api.spec.workBoard.query({ projectId });
      return boardRows(board).map((row) => ({
        key: row.item.key,
        label: BOARD_KIND_LABEL[row.kind],
        title: rowTitle(row),
        summary: rowSummary(row),
        href: `${base}/work-board/${encodeURIComponent(row.item.key)}`,
      }));
    },
  },
  // THE NEWEST MONTH, ROW FOR ROW AS THE PANEL SHOWS IT — the same query with
  // no month named, so the three lines here are the panel's first three rows,
  // each one a line an agent logged at the end of a run, and "and N more"
  // counts the lines behind them. No door: a run that finished is read, not
  // opened, and its refs are doors only on the panel.
  "activity-feed": {
    failed: "Could not read the activity feed",
    rows: async (projectId) => {
      const feed = await api.spec.activity.query({ projectId });
      return activityRows(feed.entries).map((row) => ({
        key: row.key,
        label: ACTIVITY_KIND_LABEL[row.kind],
        title: row.sentence,
        summary: rowNote(row),
        href: null,
      }));
    },
  },
};

function PanelGlance({
  panel,
  source,
}: {
  panel: PanelMeta;
  source: keyof typeof GLANCE_ROWS;
}) {
  const project = useProject();
  const [rows, setRows] = useState<GlanceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null);
    setError(null);
    GLANCE_ROWS[source]
      .rows(project.id, controlBase(project.id))
      .then((next) => {
        if (live) {
          setRows(next);
        }
      })
      .catch((loadError: unknown) => {
        if (live) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : GLANCE_ROWS[source].failed,
          );
        }
      });
    return () => {
      live = false;
    };
  }, [project.id, source]);

  /**
   * A CHANGE ON DISK RE-READS WHAT IS ALREADY HERE, AND CLEARS NOTHING. The
   * effect above owns the skeleton because it owns the mount; this one owns
   * neither it nor the refusal, so a file an agent wrote does not blink the
   * card back to skeletons on its way to being right. A failure here keeps what
   * is on screen and says nothing: the next change asks again.
   */
  const revision = useRevision();
  useEffect(() => {
    if (revision === 0) {
      return;
    }
    let live = true;
    GLANCE_ROWS[source]
      .rows(project.id, controlBase(project.id))
      .then((next) => {
        if (live) {
          setRows(next);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [revision, project.id, source]);

  if (error !== null) {
    return <p className="text-destructive text-sm">{error}</p>;
  }
  if (rows === null) {
    return (
      <div className="grid gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  if (rows.length === 0) {
    return <EmptyState message={panel.empty} />;
  }
  const rest = rows.length - GLANCE;
  return (
    <ul className="grid gap-2">
      {rows.slice(0, GLANCE).map((row) => (
        <li key={row.key} className="flex min-w-0 items-center gap-2">
          <Badge variant="secondary">{row.label}</Badge>
          {/* EVERY ROW THAT HAS A PAGE IS ITS OWN DOOR. A glance that could
              only be entered through "View all" made a person land on the list
              they had just read and find the row again; the title here goes
              where the title in the panel goes. It is why the card is no longer
              one big link — a link inside a link is not a thing a browser can
              honour. A feed row has no page — a judgment made is not a thing to
              open — so it is the same line at the same width, said in plain
              text. */}
          {row.href === null ? (
            <span className="min-w-0 flex-1 truncate text-sm">{row.title}</span>
          ) : (
            <Link
              to={row.href}
              className="text-primary min-w-0 flex-1 truncate text-sm underline-offset-4 hover:underline"
            >
              {row.title}
            </Link>
          )}
          {/* THE SUMMARY YIELDS FIRST, AND NEITHER HALF LEAVES THE CARD. A
              summary that could not shrink took the whole row and left the
              title — the door — at zero width, which is how a Fix Spec row
              lost its name here while the queue's short counts never showed
              it; and whatever still did not fit ran under the card's edge,
              cut flush at the border while the left kept its margin. So the
              title takes the slack and the summary is capped at a share of
              the row, and both end in an ellipsis inside the padding. */}
          <span className="text-muted-foreground max-w-[45%] shrink-0 truncate text-xs">
            {row.summary}
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
  const base = controlBase(project.id);

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
              {panel.id === "review-queue" ||
              panel.id === "work-board" ||
              panel.id === "activity-feed" ? (
                <PanelGlance panel={panel} source={panel.id} />
              ) : (
                <EmptyState message={panel.empty} />
              )}
            </CardContent>
            <Link
              to={`${base}/${panel.id}`}
              className="text-primary flex items-center gap-1 px-(--card-spacing) text-sm underline-offset-4 hover:underline"
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
