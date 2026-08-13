/**
 * What the Spec plane's two views are computed from.
 *
 * The roster itself is canon and lives in `@shall/core/graph`: the twenty-three
 * types, their layers, the band order and the column order. This file re-exports
 * the pieces the views read so a view module has one import, and owns the two
 * things that are *presentation* and therefore not the canon's to hold.
 *
 * Nothing here reads a clock, a random source or the DOM, and nothing iterates an
 * unordered collection. The same graph must draw the same picture on every
 * machine, on every run — that is the property the whole `view/` folder is built
 * to have, and it starts with the ordering rules below.
 */
export {
  BAND_ORDER,
  NODE_TYPES,
  SATELLITE_BAND,
  bandOf,
  columnsInOrder,
  typesInBand,
} from "@shall/core/graph";
export type {
  Band,
  NodeTypeEntry,
  NodeTypeName,
  SpecEdge,
  SpecNode,
} from "@shall/core/graph";

import type { Band, SpecNode } from "@shall/core/graph";

/**
 * How many nodes of one type stack vertically before that type's column widens —
 * one number per band, and this is the only place either number is written.
 *
 * Past the cap a type grows *sideways*: a sixth Requirement doubles the
 * Requirement slot and pushes AcceptanceCriterion and everything right of it in
 * the Intent band across by one column pitch. It never pages and it never
 * truncates.
 *
 * Domain's cap is smaller on purpose — that band holds two types and is meant to
 * stay short, so the rest of the screen belongs to Intent, Plan and Execution.
 * The accepted cost is that a Domain band with many Terms grows very wide for a
 * band only three rows tall; the escape hatch is that changing the number below
 * is a one-line diff, so no other file and no test may restate 3 or 5.
 *
 * FIVE, AND NOT TEN, FOR THE OTHER THREE. A band is as tall as its fullest
 * column now — the canvas no longer hands the bands a share of itself — so the
 * cap is what bounds how far one crowded type can push the three bands below it
 * down the board. Ten rows of Requirement was 562px of Intent band before Plan's
 * label appeared; five is a stack you can still read top to bottom on one
 * screen, and the eleventh node is not lost, it is one column to the right.
 *
 * It is keyed by BAND and not by type: the cap is a property of the zone. There
 * is deliberately no per-type override.
 *
 * THIS IS PRESENTATION, NOT CANON. It says nothing about the graph — only about
 * how much of a screen a column may use before it folds — so it lives beside the
 * layout that reads it rather than in `core/graph`. One home, and this is it.
 */
export const STACK_CAP: Readonly<Record<Band, number>> = {
  Domain: 3,
  Intent: 5,
  Plan: 5,
  Execution: 5,
};

/**
 * The nodes of one type, id-ascending — the order a column is filled in.
 *
 * THE COMPARISON IS A PLAIN BYTE COMPARISON AND NEVER `localeCompare`. Ids are
 * stored and compared as bytes elsewhere in the system, and generated ids are
 * zero-padded to a fixed width, so byte order is also the order they were made
 * in: `R-0002` before `R-0010`. `localeCompare` collates by the machine's locale,
 * which would put a browser's language settings in charge of where a card sits —
 * the same graph would draw two different pictures on two computers.
 *
 * `filter` and `sort` both keep the array's own order for equal keys, and ids are
 * unique, so nothing here depends on the order the rows arrived in.
 */
export function nodesOfType(
  nodes: readonly SpecNode[],
  type: string,
): SpecNode[] {
  return nodes
    .filter((node) => node.type === type)
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}
