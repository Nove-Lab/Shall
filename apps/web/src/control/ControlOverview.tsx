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
import { KIND_LABEL, bundleSummary } from "./review-queue/ReviewQueue";
import { useProject } from "@/project-context";
import type { ReviewBundle } from "@/spec/review";

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
          <span className="truncate text-sm">{bundle.title}</span>
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

      <div className="grid gap-4 lg:grid-cols-2">
        {PANELS.map((panel) => (
          <Link
            key={panel.id}
            to={`${base}/${panel.id}`}
            className="focus-visible:ring-ring rounded-xl focus-visible:ring-2 focus-visible:outline-none"
          >
            <Card className="hover:border-primary/40 h-full transition-colors">
              {/* The title alone: the summary sentence belongs to the panel's
                  own page, beside its title there, and the card is a glance. */}
              <CardHeader>
                <CardTitle>{panel.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                {panel.id === "review-queue" ? (
                  <ReviewQueueGlance panel={panel} />
                ) : (
                  <EmptyState message={panel.empty} />
                )}
              </CardContent>
              <div className="text-primary flex items-center gap-1 px-6 text-sm">
                View all
                <ArrowRight className="size-4" />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
