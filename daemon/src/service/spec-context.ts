import { workContextOf, type WorkContext } from "@shall/core/arith";
import { compare } from "@shall/core/graph";
import { loadGraph } from "@shall/core/store";
import { invalid, missing } from "./errors.js";
import { recentActivity } from "./spec-activity.js";
import { fileOf, projectRootAt, requireText, specPathsOf } from "./spec-graph.js";
import { requireLedgers } from "./spec-review.js";

/**
 * The look back, from wherever the caller is standing — `shall context`.
 *
 * IT IS THE ONE PROCEDURE THAT READS THE FEED FOR AN AGENT, and it reads it
 * for one thing only: the order of the recent turns. The feed is never handed
 * back — what comes back is the journals the feed named, in the feed's order,
 * as files to open — so the rule that an agent never reads the feed holds as
 * it always did: the daemon read it, and said which files are newest.
 *
 * `workContextOf` is the whole of it; finding the project, reading the books
 * and reading the feed is all this adds. The root travels back so that a
 * caller printing the list can say which folder the paths are under.
 */
export async function contextAt(
  startPath: string,
  workItemId: string,
  recent?: number | undefined,
): Promise<{ root: string } & WorkContext> {
  const id = requireText("A work item id", workItemId);
  const root = await projectRootAt(startPath);
  const paths = specPathsOf(root);
  const graph = await loadGraph(paths.specDir);
  const ledgers = await requireLedgers(paths, "context");
  const feed = await recentActivity(paths.feedDir, "work_done", recent ?? 3);
  const found = workContextOf(graph, ledgers, feed, id, {
    fileOf,
    ...(recent === undefined ? {} : { recent }),
  });
  if (found === null) {
    const workItems = graph.nodes
      .filter((node) => node.type === "WorkItem")
      .map((node) => node.id)
      .sort(compare);
    throw graph.nodes.some((node) => node.id === id)
      ? invalid(`${id} is not a work item, and the look back is a work item's.`)
      : missing(
          workItems.length === 0
            ? `No work item ${id} — this project has no work items yet.`
            : `No work item ${id}. The work items there are: ${workItems.join(", ")}.`,
        );
  }
  return { root, ...found };
}
