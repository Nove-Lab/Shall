import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useProject } from "@/project-context";
import type { PanelMeta } from "../panels";
import {
  healthLine,
  isEmptySpec,
  percent,
  progressRows,
  ratioText,
} from "./rows";
import { useVitals } from "./use-vitals";

/**
 * THE VITALS AT A GLANCE — the Overview card's body. Four bars with their
 * counts, in the order the page lists them, and one line about Spec Health;
 * the notes the page prints beside a ratio are left off here, and the card's
 * two doors (the title and "View all", which the Overview draws around every
 * card) lead to the page where they are.
 *
 * IT IS THE SAME FETCH THE PAGE MAKES and not a cheaper summary procedure —
 * the same hook, even — so the card and the page cannot disagree about a
 * number. The loading, error and empty ladder is the one every card has.
 */
export function VitalsGlance({ panel }: { panel: PanelMeta }) {
  const project = useProject();
  const { vitals, error } = useVitals(project.id);

  if (error !== null) {
    return <p className="text-destructive text-sm">{error}</p>;
  }
  if (vitals === null) {
    return (
      <div className="grid gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  if (isEmptySpec(vitals)) {
    return <EmptyState message={panel.empty} />;
  }
  return (
    <ul className="grid gap-2">
      {progressRows(vitals).map((row) => (
        <li key={row.key} className="flex min-w-0 items-center gap-2">
          <span className="w-24 shrink-0 text-sm">{row.short}</span>
          <Progress
            value={percent(row.numerator, row.denominator)}
            className="min-w-0 flex-1"
          />
          <span className="shrink-0 font-mono text-xs">
            {ratioText(row.numerator, row.denominator)}
          </span>
        </li>
      ))}
      <li className="flex min-w-0 items-center gap-2">
        <Badge variant="secondary">Spec Health</Badge>
        <span className="min-w-0 flex-1 truncate text-sm">
          {healthLine(vitals)}
        </span>
      </li>
    </ul>
  );
}
