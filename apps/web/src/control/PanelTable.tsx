import type { ReactNode } from "react";
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

/**
 * THE CONTROL-PLANE LIST, AS ONE SHELL: a card holding a table, with the four
 * states every panel list passes through said the same way — an error row, the
 * skeleton of the table it is about to be, the panel's own empty sentence, and
 * the rows.
 *
 * IT HOLDS NO ROWS OF ITS OWN. The Review Queue and the Task Board are the
 * same table over different questions — that likeness is the design, so a
 * person reads both without relearning either — and this shell is where the
 * likeness lives. What a row IS stays in each panel's file, which is the half
 * that differs.
 *
 * THE HEADERS ARE THE PANEL'S AND THE CELLS ARE THE CALLER'S, and they have to
 * stay the same length: `columns` is where the row's shape is declared, and the
 * full-width state cells span whatever that list says.
 */
export function PanelTable({
  columns,
  error,
  loading,
  empty,
  children,
}: {
  columns: readonly string[];
  error: string | null;
  loading: boolean;
  /** One full-width cell for a list with nothing in it — null when there are rows. */
  empty: ReactNode;
  children: ReactNode;
}) {
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
            ) : empty !== null ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-0">
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              children
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
