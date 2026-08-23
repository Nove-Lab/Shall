import { Link, Navigate, useParams } from "react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ActivityFeed } from "./activity-feed/ActivityFeed";
import { panelById } from "./panels";
import { ReviewQueue } from "./review-queue/ReviewQueue";
import { Vitals } from "./vitals/Vitals";
import { WorkBoard } from "./work-board/WorkBoard";
import { useProject } from "@/project-context";

export function PanelDetail() {
  const { panelId } = useParams();
  const project = useProject();
  const panel = panelById(panelId);
  const base = `/p/${encodeURIComponent(project.id)}/control`;

  if (!panel) {
    return <Navigate to={base} replace />;
  }

  return (
    <>
      <div className="space-y-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to={base} />}>
                Control plane
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{panel.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        {/* Title and its one-line summary on one baseline — the Overview's
            arrangement, kept the same on every panel. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{panel.title}</h1>
          <p className="text-muted-foreground text-sm">{panel.summary}</p>
        </div>
      </div>

      {/* FOUR PANELS, ONE HEADER. The crumb, the title and the summary above
          are the panel's own metadata and are drawn once for all of them; the
          built panel takes over from the card down, and this branch is the
          whole of what differs between the four. Every id is matched by name,
          so a fifth panel is a compile error here and not a blank card. */}
      {panel.id === "review-queue" ? (
        <ReviewQueue panel={panel} />
      ) : panel.id === "work-board" ? (
        <WorkBoard panel={panel} />
      ) : panel.id === "activity-feed" ? (
        <ActivityFeed panel={panel} />
      ) : (
        <Vitals panel={panel} />
      )}
    </>
  );
}
