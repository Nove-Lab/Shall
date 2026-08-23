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
    // A PERSON'S SUMMARY OF WHAT HAPPENED, not a record anything depends on:
    // one line per run, logged by the agent at the run's end through
    // `shall log`, newest first, one month at a time. Nothing on it is waiting
    // on anyone, which is why the sidebar badge for it stays at zero.
    summary: "What each run delivered, newest first",
    empty: "Nothing has been logged yet",
    // THE QUEUE'S FOUR COLUMNS OVER A THIRD QUESTION — a kind, the thing
    // itself, a line about it, and a stamp (PanelTable's widths) — so the
    // third control-plane list is read the way the first two are. The thing
    // itself is the run's own sentence; the line about it is the nodes the
    // run touched; the stamp is the instant the line was logged. Nothing
    // folds: a row is a line of the file and the file is shown flat.
    columns: ["Kind", "Event", "Refs", "When"],
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
