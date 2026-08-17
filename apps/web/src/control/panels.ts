export type PanelId = "review-queue" | "task-board" | "activity-feed" | "vitals";

export interface PanelMeta {
  id: PanelId;
  title: string;
  summary: string;
  /** What the panel says when it has nothing to show. */
  empty: string;
  /**
   * Table headers for the detail page. Omitted where the panel is not a list —
   * Vitals is a computed metric grid, and none of it is computed yet.
   */
  columns?: string[];
}

export const PANELS: PanelMeta[] = [
  {
    id: "review-queue",
    title: "Review Queue",
    // "Bundles", not "spec changes": the queue is not one list of spec diffs
    // any more — a work report and a criterion waiting to be closed are
    // decisions of a different shape, and the kind badge on each row says which.
    summary: "Bundles waiting on a human decision",
    empty: "Nothing is waiting on a decision",
    // The queue's own table renders these, so the headers and the cells under
    // them are decided in one place.
    columns: ["Kind", "Title", "Summary", "Waiting since"],
  },
  {
    id: "task-board",
    title: "Task Board",
    summary: "What the spec needs fixed, and what is ready to work on",
    // "Work on" and not "start": a task somebody is already logging against is
    // on this board too, with the work shown beside it.
    empty: "Nothing is ready to work on — check the Review Queue",
    // ONE TABLE OVER BOTH HALVES, and the Kind column is what tells them apart
    // — the queue's own arrangement, for the same reason: a person scanning
    // this page is asking "what is there", and two tables would ask them to
    // scan twice. What each row IS stays in the row's own page.
    columns: ["Kind", "Item", "Summary", "Since"],
  },
  {
    id: "activity-feed",
    title: "Activity Feed",
    summary: "Everything that touched the graph today",
    empty: "Nothing has touched the graph yet",
    columns: ["Event", "Action", "Actor", "Age"],
  },
  {
    id: "vitals",
    title: "Shall Vitals",
    summary: "Health of the spec graph, computed on read",
    empty: "No graph to measure yet",
  },
];

export function panelById(id: string | undefined): PanelMeta | undefined {
  return PANELS.find((panel) => panel.id === id);
}
