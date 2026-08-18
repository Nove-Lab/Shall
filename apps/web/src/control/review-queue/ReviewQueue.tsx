import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "@/api";
import { Badge } from "@/components/ui/badge";
import {
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { useProject } from "@/project-context";
import type { ReviewBundle } from "@/spec/review";
import { formatStamp } from "@/spec/spec-node";
import type { PanelMeta } from "../panels";
import { PanelTable } from "../PanelTable";
import { controlBase } from "../parts";
import { KIND_LABEL, bundleSummary } from "./rows";
import { useRevision } from "@/live";

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
export function ReviewQueue({ panel }: { panel: PanelMeta }) {
  const project = useProject();
  const base = controlBase(project.id);
  const [bundles, setBundles] = useState<ReviewBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * A PROJECT CHANGE IS A DIFFERENT QUEUE AND NOT A STALE ONE, so the fetch is
   * keyed on the project id. `live` stops an answer for the project somebody
   * has already left from being drawn as this one's — the SUCCESS path is under
   * the latch too, because a slow answer landing after the switch is exactly
   * the drawing this guard exists to stop.
   */
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    api.spec.reviewQueue
      .query({ projectId: project.id })
      .then((queue) => {
        if (live) {
          setBundles(queue.bundles);
        }
      })
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
  }, [project.id]);
  /**
   * A CHANGE ON DISK RE-READS WHAT IS ALREADY HERE, AND CLEARS NOTHING. The
   * effect above owns the skeleton and the refusal because it owns the mount;
   * this one owns neither, so a file an agent wrote does not blink the table
   * back to skeletons on its way to being right. A failure here keeps the rows
   * that are on screen and says nothing: the next change asks again, and a
   * refusal that outlives the daemon is waiting on the next navigation, where
   * somebody is looking for it.
   */
  const revision = useRevision();
  useEffect(() => {
    if (revision === 0) {
      return;
    }
    let live = true;
    api.spec.reviewQueue
      .query({ projectId: project.id })
      .then((queue) => {
        if (live) {
          setBundles(queue.bundles);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [revision, project.id]);


  const columns = panel.columns ?? [];

  return (
    <PanelTable
      columns={columns}
      error={error}
      loading={loading}
      empty={
        bundles.length === 0 ? <EmptyState message={panel.empty} /> : null
      }
    >
      {bundles.map((bundle) => (
        <TableRow key={bundle.id}>
          <TableCell>
            <Badge variant="secondary">{KIND_LABEL[bundle.kind]}</Badge>
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
      ))}
    </PanelTable>
  );
}
