import { Link, Navigate, useParams } from "react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { panelById } from "./panels";
import { ReviewQueue } from "./review-queue/ReviewQueue";
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

      {/* ONE PANEL IS BUILT AND THE OTHER THREE ARE STILL THE PLACEHOLDER, and
          the difference is exactly this branch. The header above is shared —
          the crumb, the title and the summary are the panel's own metadata,
          not the queue's — so the built panel takes over from the card down
          and nothing is written twice. */}
      {panel.id === "review-queue" ? (
        <ReviewQueue panel={panel} />
      ) : (
        <Card>
          <CardContent className="p-0">
            {panel.columns ? (
              // The header stays so the panel reads as the table it will be.
              <Table>
                <TableHeader>
                  <TableRow>
                    {panel.columns.map((column) => (
                      <TableHead key={column}>{column}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={panel.columns.length} className="p-0">
                      <EmptyState message={panel.empty} />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            ) : (
              <EmptyState message={panel.empty} />
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
