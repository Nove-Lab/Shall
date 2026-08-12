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
        <h1 className="text-2xl font-semibold tracking-tight">{panel.title}</h1>
        <p className="text-muted-foreground text-sm">{panel.summary}</p>
      </div>

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
    </>
  );
}
