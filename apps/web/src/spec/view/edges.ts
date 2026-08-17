import {
  floatingEndpoints,
  type CardGeometry,
  type SpecView,
} from "./edge-geometry";
import {
  routeAroundCards,
  selfLoopPath,
  type RoutedPath,
} from "./edge-routing";
import { sinksIntoDomain, type Band } from "./model";

/**
 * WHERE EVERY RELATION ON A BOARD RUNS — the geometry half of drawing one, for
 * both canvases that draw them.
 *
 * IT IS THE HALF A CLICK DOES NOT RE-RUN, which is why it is its own module and
 * its own memo at each caller: routing is the most expensive arithmetic on the
 * screen — every relation against every card that is not one of its two ends —
 * while a selection changes only what a line LOOKS like. Whether a relation
 * sinks into Domain rides along here for the same reason: it is a property of
 * the relation and never of the selection, and this is the one place that holds
 * both cards' bands.
 *
 * THE TWO CALLS INSIDE ARE A DIVISION OF LABOUR AND NOT A PIPELINE.
 * `floatingEndpoints` says where a relation MEETS a card — the crossing of the
 * centre-to-centre line with the border, held out of the corners — and
 * `routeAroundCards` says how it gets there, so routing introduces no fixed
 * attachment point and cannot move an endpoint.
 *
 * Pure: no React, no `@xyflow/react`, no DOM. The same cards and the same
 * relations give byte-identical paths on every machine.
 */

/** A card as this module needs it: an id, a band, and where its top-left sits. */
export type RoutableCard = {
  readonly id: string;
  readonly band: Band;
  readonly x: number;
  readonly y: number;
};

/**
 * The two ends of one relation. Declared structurally rather than as `SpecEdge`
 * so the metamodel's own relations — which are types joined by a permitted
 * pair, not nodes joined by a written line — go through the same router.
 */
export type Incidence = {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
};

export type RoutedEdge<E extends Incidence> = {
  readonly edge: E;
  readonly route: RoutedPath;
  readonly dashed: boolean;
};

/**
 * Every relation, routed against every card it is not attached to.
 *
 * AN EDGE WHOSE END HAS NO CARD IS SKIPPED rather than drawn from nowhere — the
 * same answer `cardPieces` gives a placement with no node.
 *
 * A RELATION FROM A THING TO ITSELF IS AN ARCH, not a route: the floating
 * geometry is centre-to-centre and degenerates when the two centres are one
 * point. Today's spec graphs cannot hold one — the daemon refuses a node
 * pointing at itself — and the metamodel is full of them, because the canon has
 * four self-pairs (`REFINES`, two `DEPENDS_ON`, `RELATES_TO`).
 */
export function routedEdges<E extends Incidence>(
  cards: readonly RoutableCard[],
  edges: readonly E[],
  geometry: CardGeometry,
  view: SpecView,
): RoutedEdge<E>[] {
  const placed = new Map(cards.map((card) => [card.id, card]));
  const boxes = cards.map((card) => ({
    id: card.id,
    box: {
      x: card.x,
      y: card.y,
      width: geometry.cardWidth,
      height: geometry.cardHeight,
    },
  }));

  const built: RoutedEdge<E>[] = [];
  for (const edge of edges) {
    const source = placed.get(edge.fromId);
    const target = placed.get(edge.toId);
    if (source === undefined || target === undefined) {
      continue;
    }

    const ends = floatingEndpoints(source, target, geometry, view);
    // The self-loop's box is the source card itself — built here, on the one
    // branch that needs it, rather than found by an O(cards) scan per edge.
    const route =
      edge.fromId === edge.toId
        ? selfLoopPath(
            {
              x: source.x,
              y: source.y,
              width: geometry.cardWidth,
              height: geometry.cardHeight,
            },
            ends.offset,
          )
        : routeAroundCards({
            start: { x: ends.sx, y: ends.sy },
            startSide: ends.sourceSide,
            end: { x: ends.tx, y: ends.ty },
            endSide: ends.targetSide,
            offset: ends.offset,
            obstacles: boxes
              .filter(
                (card) => card.id !== edge.fromId && card.id !== edge.toId,
              )
              .map((card) => card.box),
          });

    built.push({
      edge,
      route,
      dashed: sinksIntoDomain(source.band, target.band),
    });
  }
  return built;
}
