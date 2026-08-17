import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { useProject } from "@/project-context";
import type { BundleKind, ReviewBundle } from "@/spec/review";
import { formatStamp } from "@/spec/spec-node";
import type { PanelMeta } from "../panels";

/**
 * WHAT IS WAITING ON A PERSON, ONE ROW PER DECISION.
 *
 * A ROW IS A BUNDLE AND NOT A NODE, which is the whole reason this panel is not
 * a list of changed files. Nobody approves a requirement without reading the
 * criteria under it and nobody reads a work log without the evidence it
 * submitted, so the daemon cuts the graph into pieces a person can actually
 * decide and this table shows the pieces. The card behind each title is where
 * the deciding happens.
 *
 * NOTHING IS CACHED, HERE OR ANYWHERE ON THIS SURFACE. The queue is recomputed
 * from the graph and the three ledgers on every read — it is not a table
 * somewhere that a write has to invalidate — so the honest client is one that
 * asks again, and every write on the card page ends in a refetch for the same
 * reason.
 */

/**
 * THE THREE KINDS IN A PERSON'S WORDS, IN ONE PLACE. `Record<BundleKind, …>`
 * and not a loose map: a fourth kind decided in `core/arith/bundles.ts` is a
 * compile error at this table rather than a badge that renders a wire word.
 * The card page reads the same map, so the badge on the row and the badge on
 * the page it opens cannot disagree.
 */
export const KIND_LABEL: Record<BundleKind, string> = {
  "spec-approval": "Spec approval",
  "work-report": "Work report",
  "ac-closure": "AC closure",
  "task-closure": "Task closure",
};

/** "1 node", "3 nodes" — the plural said once rather than at each call. */
function countWord(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * HOW BIG THIS DECISION IS, IN ONE LINE, AND EACH KIND MEASURES ITSELF.
 *
 * A spec approval is counted in nodes, because that is what approving it signs
 * off — and the unchanged ones are counted BESIDE them rather than folded in,
 * since agreeing to a changed requirement is also a statement that the criteria
 * nobody touched still say the right thing. A rejected member is named only
 * when there is one: it is a row that is already the agent's turn, and a "0
 * rejected" on every other line would be noise.
 *
 * A work report is counted by TYPE, because "eleven nodes" says nothing about
 * whether this is one log with ten pieces of evidence or ten logs. An AC
 * closure is counted in CLAIMANTS, all of them and whatever colour each wears:
 * closing accepts the whole list, so the list is what the number has to be.
 */
export function bundleSummary(bundle: ReviewBundle): string {
  switch (bundle.kind) {
    case "spec-approval": {
      const rejected = bundle.members.filter(
        (member) => member.reason === "rejected",
      ).length;
      const aside = [`${String(bundle.unchanged.length)} unchanged`];
      if (rejected > 0) {
        aside.push(`${String(rejected)} rejected`);
      }
      return `${countWord(bundle.members.length, "node")} (${aside.join(", ")})`;
    }
    case "work-report":
      return bundle.counts.length === 0
        ? countWord(bundle.members.length, "node")
        : bundle.counts
            .map((count) => `${count.type} ${String(count.count)}`)
            .join(", ");
    case "ac-closure":
      return `evidence ${String(bundle.evidence.length)}`;
    // A TASK IS COUNTED IN WORK LOGS, for the reason a criterion is counted in
    // evidence: closing accepts the whole list, so the list is the number.
    case "task-closure":
      return `work logs ${String(bundle.workLogs.length)}`;
  }
}

export function ReviewQueue({ panel }: { panel: PanelMeta }) {
  const project = useProject();
  const base = `/p/${encodeURIComponent(project.id)}/control`;
  const [bundles, setBundles] = useState<ReviewBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const queue = await api.spec.reviewQueue.query({ projectId: project.id });
    setBundles(queue.bundles);
  }, [project.id]);

  /**
   * A PROJECT CHANGE IS A DIFFERENT QUEUE AND NOT A STALE ONE, so the fetch is
   * keyed on `load`, which is keyed on the id. `live` stops an answer for the
   * project somebody has already left from being drawn as this one's.
   */
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    load()
      .catch((loadError: unknown) => {
        if (live) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not read the review queue",
          );
        }
      })
      .finally(() => {
        if (live) {
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [load]);

  /**
   * THE HEADERS ARE THE PANEL'S AND THE CELLS ARE THIS FILE'S, and they have to
   * stay the same length. `panel.columns` is where the row's shape is declared
   * — the placeholder panels render the same list — so a column added there is
   * a column that has to be filled here, and the full-width cells below span
   * whatever that list says.
   */
  const columns = panel.columns ?? [];

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {error !== null ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length}>
                  <p className="text-destructive text-sm">{error}</p>
                </TableCell>
              </TableRow>
            ) : loading ? (
              // The table it is about to be, at the height it will have — the
              // shell says "still reading" the same way.
              [0, 1, 2].map((row) => (
                <TableRow key={row} className="hover:bg-transparent">
                  <TableCell colSpan={columns.length}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : bundles.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-0">
                  <EmptyState message={panel.empty} />
                </TableCell>
              </TableRow>
            ) : (
              bundles.map((bundle) => (
                <TableRow key={bundle.id}>
                  <TableCell>
                    <Badge variant="secondary">
                      {KIND_LABEL[bundle.kind]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {/* The title is the door, because it is the thing a person
                        is deciding about — a separate "Open" column would be a
                        second click target for the same row. */}
                    <Link
                      to={`${base}/review-queue/${encodeURIComponent(bundle.id)}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {bundle.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {bundleSummary(bundle)}
                  </TableCell>
                  {/* THE OLDEST THING IN THE BUNDLE, not when the bundle was
                      made: nothing made it, and `since` is the earliest mtime
                      among the files under the decision — which is what "has
                      been waiting" actually means here. */}
                  <TableCell className="text-muted-foreground text-sm">
                    {formatStamp(bundle.since)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
