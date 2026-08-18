import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "@/api";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { useRevision } from "@/live";
import { useProject } from "@/project-context";
import type { TaskBoard as Board } from "@/spec/review";
import { formatStamp } from "@/spec/spec-node";
import type { PanelMeta } from "../panels";
import { PanelTable } from "../PanelTable";
import { controlBase } from "../parts";
import {
  BOARD_KIND_LABEL,
  boardRows,
  rowSince,
  rowSummary,
  rowTitle,
} from "./rows";

/**
 * WHAT THE SPECIFICATION NEEDS FIXED, AND WHAT IS READY TO BE WORKED ON —
 * one row per thing somebody could pick up.
 *
 * IT IS THE REVIEW QUEUE'S TABLE OVER A DIFFERENT QUESTION, deliberately: the
 * two control-plane lists are read the same way, so the kind badge, the title
 * as the door, the one-line summary and the stamp all sit where a person has
 * already learned to look for them — `PanelTable` is that likeness, held in
 * one place. What each row IS lives on the row's own page, which is where a
 * rejection's rationale is read whole.
 *
 * WHAT IS HERE IS WHAT SOMEBODY CAN ACT ON NOW. A task whose chain is unread,
 * or whose prerequisite is unfinished, is not dimmed and not listed with a
 * reason — it is absent, and it turns up of its own accord the moment the thing
 * above it is settled.
 *
 * NOTHING IS CACHED, like every other surface here: the board is recomputed
 * from the graph and the three books on every read.
 */
export function TaskBoard({ panel }: { panel: PanelMeta }) {
  const project = useProject();
  const base = controlBase(project.id);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * The queue's own fetch bargain: keyed on the project id, and the success
   * path under the `live` latch with the failure path, so a slow answer for a
   * project somebody has left is never drawn as this one's.
   */
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
    api.spec.taskBoard
      .query({ projectId: project.id })
      .then((next) => {
        if (live) {
          setBoard(next);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [revision, project.id]);


  const columns = panel.columns ?? [];
  const rows = board === null ? [] : boardRows(board);

  return (
    <PanelTable
      columns={columns}
      error={error}
      loading={board === null}
      empty={
        rows.length === 0 && board !== null ? (
          <EmptyState
            message={panel.empty}
            hint="Nothing in the spec needs fixing either."
          />
        ) : null
      }
    >
      {rows.map((row) => {
        const since = rowSince(row);
        return (
          <TableRow key={row.item.key}>
            <TableCell>
              <Badge variant="secondary">{BOARD_KIND_LABEL[row.kind]}</Badge>
            </TableCell>
            <TableCell>
              {/* The title is the door, because it is the thing the row
                  is about — a separate "Open" column would be a second
                  click target for the same row. */}
              <Link
                to={`${base}/task-board/${encodeURIComponent(row.item.key)}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {rowTitle(row)}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {rowSummary(row)}
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {since === null ? "—" : formatStamp(since)}
            </TableCell>
          </TableRow>
        );
      })}
    </PanelTable>
  );
}
