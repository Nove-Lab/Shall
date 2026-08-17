import { taskBoardOf, type TaskBoard } from "@shall/core/arith";
import { loadGraph } from "@shall/core/store";
import { projectSpecFor, type SpecPaths } from "./spec-graph.js";
import { requireLedgers } from "./spec-review.js";

/**
 * The Task Board: what the specification needs fixed, and what is ready to be
 * worked on.
 *
 * IT IS ONE READ AND NO DOORS. Nothing on this surface is a judgement, so
 * nothing here writes: the board is an arrangement of the graph and the three
 * books at the moment of the question, and every button on it leads somewhere
 * that already has a door of its own — the Spec plane to fix a node, the Review
 * Queue to judge one.
 *
 * THE DAEMON ADDS NOTHING TO CORE'S ANSWER, exactly as `reviewQueue` does not:
 * `taskBoardOf` decides what is red, what is startable and in what order, and
 * this function's whole job is to insist that the three books read and hand the
 * graph over. WHICH project it is has been settled before it is called —
 * `taskBoard` below has an id to look up, `boardAt` a path to walk up from —
 * which is why this one takes the addresses and never goes looking for them.
 *
 * A BOOK THAT WILL NOT READ IS A REFUSAL AND NOT A QUIET BOARD. Every column
 * here is counted out of the ledgers — a rejection makes a Fix Spec row, an
 * approval makes a chain green, an acceptance makes a task done — so a board
 * served over an unreadable book would show work as ready that a person has
 * already refused.
 */
export async function boardOver(paths: SpecPaths): Promise<TaskBoard> {
  const ledgers = await requireLedgers(paths, "board");
  return taskBoardOf(await loadGraph(paths.specDir), ledgers);
}

/**
 * The board for a project the registry knows — the web's door onto it.
 *
 * `boardAt` in `spec-status.ts` is the other one, for an agent standing in a
 * checkout. They differ in HOW THEY NAME THE PROJECT and in nothing else,
 * which is why the board itself is the function above and not a body either of
 * them carries.
 */
export async function taskBoard(projectId: string): Promise<TaskBoard> {
  return boardOver(await projectSpecFor(projectId));
}
