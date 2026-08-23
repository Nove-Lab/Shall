import { vitalsOf, type Vitals } from "@shall/core/arith";
import { loadGraph } from "@shall/core/store";
import { projectSpecFor, type SpecPaths } from "./spec-graph.js";
import { requireLedgers } from "./spec-review.js";

/**
 * The Vitals: how far the specification has come, and what it still lacks.
 *
 * IT IS ONE READ AND NO DOORS, like the board. Nothing on this surface is a
 * judgement and nothing here writes: four ratios and seven rows are an
 * arrangement of the graph and the three books at the moment of the question,
 * and every node they name leads to the Spec plane, where the doors are.
 *
 * THE DAEMON ADDS NOTHING TO CORE'S ANSWER, exactly as the board and the queue
 * do not: `vitalsOf` decides what is satisfied, what is open and why, what is
 * blocked and by what, and which rows stand violated. This function's whole job
 * is to insist that the three books read and hand the graph over. Not even a
 * clock is added — the page stamps the moment its answer arrived, and since
 * every ask is computed afresh that moment is the computation's own.
 *
 * A BOOK THAT WILL NOT READ IS A REFUSAL AND NOT A QUIET PAGE. Every figure
 * here is counted out of the ledgers — an acceptance closes a criterion and
 * finishes a work item, an approval turns a chain green, a left-open word is a
 * whole row of the page — so vitals served over an unreadable book would show
 * progress nobody has made.
 */
export async function vitalsOver(paths: SpecPaths): Promise<Vitals> {
  const ledgers = await requireLedgers(paths, "vitals");
  return vitalsOf(await loadGraph(paths.specDir), ledgers);
}

/** The vitals for a project the registry knows — the web's door onto them, and the only one. */
export async function vitals(projectId: string): Promise<Vitals> {
  return vitalsOver(await projectSpecFor(projectId));
}
