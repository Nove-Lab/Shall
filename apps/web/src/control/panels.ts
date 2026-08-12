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
    summary: "Spec changes waiting on a human decision",
    empty: "Nothing is waiting on a decision",
    columns: ["Title", "Kind", "Proposed by", "Age", "Status"],
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
