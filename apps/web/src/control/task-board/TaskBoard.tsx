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
import type { TaskBoard as Board } from "@/spec/review";
import { formatStamp } from "@/spec/spec-node";
import type { PanelMeta } from "../panels";
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
 * already learned to look for them. What each row IS lives on the row's own
 * page, which is where a rejection's rationale is read whole.
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
  const base = `/p/${encodeURIComponent(project.id)}/control`;
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBoard(await api.spec.taskBoard.query({ projectId: project.id }));
  }, [project.id]);

  useEffect(() => {
    let live = true;
    setBoard(null);
    setError(null);
    load().catch((loadError: unknown) => {
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
  }, [load]);

  /**
   * THE HEADERS ARE THE PANEL'S AND THE CELLS ARE THIS FILE'S, and they have to
   * stay the same length — the queue's own bargain, for the same reason.
   */
  const columns = panel.columns ?? [];
  const rows = board === null ? [] : boardRows(board);

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
            ) : board === null ? (
              [0, 1, 2].map((row) => (
                <TableRow key={row} className="hover:bg-transparent">
                  <TableCell colSpan={columns.length}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-0">
                  <EmptyState
                    message={panel.empty}
                    hint="Nothing in the spec needs fixing either."
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const since = rowSince(row);
                return (
                  <TableRow key={row.item.key}>
                    <TableCell>
                      <Badge variant="secondary">
                        {BOARD_KIND_LABEL[row.kind]}
                      </Badge>
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
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
