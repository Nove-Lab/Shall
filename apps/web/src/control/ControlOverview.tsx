import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { PANELS } from "./panels";
import { useProject } from "@/project-context";

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
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-muted-foreground text-sm">
          Four surfaces, summarised — open any panel for the full record
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {PANELS.map((panel) => (
          <Link
            key={panel.id}
            to={`${base}/${panel.id}`}
            className="focus-visible:ring-ring rounded-xl focus-visible:ring-2 focus-visible:outline-none"
          >
            <Card className="hover:border-primary/40 h-full transition-colors">
              <CardHeader>
                <CardTitle>{panel.title}</CardTitle>
                <CardDescription>{panel.summary}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <EmptyState message={panel.empty} />
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
