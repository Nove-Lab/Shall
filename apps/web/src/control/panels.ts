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
    summary: "Work agents have picked up from the spec graph",
    empty: "No agent has picked up work yet",
    columns: ["Task", "Status", "Assignee", "Note"],
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
