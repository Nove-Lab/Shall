import type { FixSpecItem, ImplementItem, TaskBoard } from "@/spec/review";
import { firstLine } from "@/spec/review";

/**
 * THE BOARD AS ONE LIST, because the page that shows it is one table.
 *
 * THE WIRE KEEPS TWO ARRAYS AND THE SCREEN KEEPS ONE ORDER. Fix Spec is above
 * Implement — a red node is somebody's turn right now, a ready task is merely
 * available — and inside each half the arithmetic has already sorted the rows.
 * Flattening here rather than in `core/arith/board.ts` keeps the two halves
 * separately countable, which the glance and the empty states both want.
 */

export type BoardRow =
  | { readonly kind: "fix"; readonly item: FixSpecItem }
  | { readonly kind: "implement"; readonly item: ImplementItem };

/**
 * THE TWO KINDS IN A PERSON'S WORDS, IN ONE PLACE — `Record` and not a loose
 * map, so a third half of the board is a compile error at every badge.
 */
export const BOARD_KIND_LABEL: Record<BoardRow["kind"], string> = {
  fix: "Fix Spec",
  implement: "Implement",
};

/** Fix Spec first, then Implement; each half in the order core put it in. */
export function boardRows(board: TaskBoard): BoardRow[] {
  return [
    ...board.fixSpec.map((item) => ({ kind: "fix" as const, item })),
    ...board.implement.map((item) => ({ kind: "implement" as const, item })),
  ];
}

/** The row's name in a URL — core's, so a link and a lookup cannot disagree. */
export function rowKey(row: BoardRow): string {
  return row.item.key;
}

/** What the row is about: an id where there is one, a path where there is not. */
export function rowTitle(row: BoardRow): string {
  return row.kind === "implement"
    ? `${row.item.id} ${row.item.name}`
    : row.item.id === null
      ? (row.item.file ?? "a file that would not read")
      : `${row.item.id}${row.item.name === null ? "" : ` ${row.item.name}`}`;
}

/** "1 criterion", "2 criteria" — the plural said once rather than at each call. */
function countWord(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/**
 * WHAT THIS ROW IS, IN ONE LINE, AND EACH KIND MEASURES ITSELF.
 *
 * A fix is measured by what is wrong — the rule's own word, and the FIRST LINE
 * of what was said. The whole of a rejection's rationale is the row's page:
 * it is a work order, and a table cell is not where a person reads one.
 *
 * A task is measured by what it is for and what is already on it: the module
 * it belongs to, the criteria it aims to close, and any work already logged
 * against it.
 */
export function rowSummary(row: BoardRow): string {
  if (row.kind === "fix") {
    return `${row.item.reason} · ${firstLine(row.item.detail)}`;
  }
  const parts = [
    row.item.modules.map((ref) => ref.id).join(", "),
    row.item.targets.length === 0
      ? null
      : countWord(row.item.targets.length, "criterion", "criteria"),
    row.item.addressedBy.length === 0
      ? null
      : countWord(row.item.addressedBy.length, "work log", "work logs"),
  ].filter((part): part is string => part !== null && part !== "");
  return parts.length === 0 ? "nothing attached yet" : parts.join(" · ");
}

/**
 * WHEN THIS ROW STARTED WAITING, or null when nothing can say.
 *
 * A rejection is dated by the hearing, everything else by the file's own mtime
 * — and an id nothing answers to, or a file that would not read, has neither.
 */
export function rowSince(row: BoardRow): number | string | null {
  if (row.kind === "implement") {
    return row.item.updatedAt;
  }
  return row.item.at ?? row.item.updatedAt;
}
