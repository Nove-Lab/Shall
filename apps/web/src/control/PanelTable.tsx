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
 * IT HOLDS NO ROWS OF ITS OWN. The Review Queue and the Work Board are the
 * same table over different questions — that likeness is the design, so a
 * person reads both without relearning either — and this shell is where the
 * likeness lives. What a row IS stays in each panel's file, which is the half
 * that differs.
 *
 * THE HEADERS ARE THE PANEL'S AND THE CELLS ARE THE CALLER'S, and they have to
 * stay the same length: `columns` is where the row's shape is declared, and the
 * full-width state cells span whatever that list says.
 */

/**
 * THE COLUMNS AT ONE WIDTH ON EVERY PANEL, in the order every panel declares
 * them — a kind, the thing itself, a line about it, and a stamp.
 *
 * THEY LIVE HERE FOR THE REASON THE SHELL DOES. A table measured from its own
 * longest cell is a different table on each page: the board's rejection
 * rationales made its Summary column several times the queue's and pushed the
 * stamp off the card into a horizontal scrollbar, so the two lists that are
 * meant to be read the same way were not even the same shape.
 *
 * SO THE TABLE IS FIXED AND THE CELLS CLIP. Only Summary is left unmeasured,
 * which under `table-fixed` means it takes whatever the others leave; anything
 * that does not fit its cell ends in an ellipsis instead of widening the row.
 * The whole of it is on the row's own page, which is where a work order is
 * read anyway.
 */
const COLUMN_WIDTH = ["w-32", "w-[32%]", "", "w-52"];

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
  /** The one branch that draws the caller's rows — and the only one that clips. */
  const showsRows = error === null && !loading && empty === null;
  return (
    <Card>
      <CardContent className="p-0">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              {columns.map((column, index) => (
                <TableHead key={column} className={COLUMN_WIDTH[index] ?? ""}>
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          {/* THE CLIPPING IS ON THE ROWS AND NOT ON THE STATE CELLS: the error,
              the skeleton and the empty sentence each span the whole table and
              are laid out as blocks, and an ellipsis rule over them would
              flatten the empty state to a single line. */}
          <TableBody className={showsRows ? "[&>tr>td]:truncate" : undefined}>
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
