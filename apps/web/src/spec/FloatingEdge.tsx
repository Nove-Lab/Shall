import {
  BaseEdge,
  MarkerType,
  type Edge,
  type EdgeMarkerType,
  type EdgeProps,
} from "@xyflow/react";
import { stepPath, type LabelSlot, type RoutedPath } from "./view/edge-routing";

/**
 * One relation, drawn between two points this program chose rather than between
 * two handles.
 *
 * The library's built-in edges run handle to handle, which is why a card would
 * have to wear a visible dot for a person to aim at. Here the endpoints come
 * from `view/edge-geometry.ts` — the crossing of the centre-to-centre line with
 * each card's border, so the attachment slides as the board re-lays itself —
 * and the path between them from `view/edge-routing.ts`. Both are pure, both
 * have already run by the time this component does, and both read the same
 * placements that positioned the cards, so a line cannot disagree with the
 * boxes it joins.
 *
 * This component therefore computes no geometry and reads no store. It turns a
 * finished polyline into a `d` string and hands it to the library.
 */

/**
 * What one relation is drawn from.
 *
 * The relation's type name travels here rather than in React Flow's own `label`
 * field so that a floating edge cannot be built without it: in this grammar a
 * relation is its type and its direction, and a line carrying neither is half a
 * statement. `label` stays free for a caller that wants to overlay something
 * else one day.
 */
export type FloatingEdgeData = {
  readonly route: RoutedPath;
  readonly edgeType: string;
};

/**
 * The edge object the canvas builds, with two of the library's optional fields
 * made mandatory.
 *
 * `Edge`'s own `data` is optional, so a component built on it would have to
 * answer "what does a floating edge with no geometry draw?" — a question with
 * no honest answer. `markerEnd` is required for the same reason one step up:
 * the arrowhead is what says which way the relation points, and an edge built
 * without one loses that silently, with nothing red anywhere. Use `ARROW_END`.
 */
export type FloatingEdge = Edge<FloatingEdgeData, "floating"> & {
  readonly data: FloatingEdgeData;
  readonly markerEnd: EdgeMarkerType;
};

/**
 * The arrowhead every relation ends in, in the same token as the line it ends.
 *
 * IT HAS TO CARRY THE COLOUR ITSELF, and the note that used to be here said the
 * opposite. `.react-flow__arrowhead` carries no rule in the library's own
 * stylesheet — the selector is not in it — so `--xy-edge-stroke` cannot reach
 * the head the way it reaches the line. What paints the head is the marker's
 * own `<defs>`: React Flow builds one polyline per distinct marker object and
 * writes `stroke` and `fill` onto it INLINE, from this `color` or, with none,
 * from its own `#b1b1b7` default. Left off, the head was a raw vendor grey on a
 * canvas that is otherwise all tokens, and in the dark theme it was a solid mid
 * grey terminating a 10%-white hairline.
 *
 * `var(--border)` and not a value: it is the same token `spec.css` maps
 * `--xy-edge-stroke` onto, so the head and its line stay one colour through a
 * theme change rather than by coincidence.
 *
 * One object, shared by every edge: the library derives a marker's `<defs>` id
 * from its configuration, so identical markers cost one definition between them.
 */
export const ARROW_END = {
  type: MarkerType.ArrowClosed,
  color: "var(--border)",
} as const;

/**
 * WHETHER THE RELATION'S NAME FITS WHERE THE ROUTE CAN PUT IT.
 *
 * `LabelSlot` is the middle of the longest horizontal run and the room that run
 * has; this is the other half of the comparison, and it is an ESTIMATE because
 * the decision has to be made before the text has a box to measure. The label is
 * drawn at `var(--text-xs)` — 12px — in the app's sans face, where the canon's
 * upper-case relation names run about 7px a character, and the library's own
 * `EdgeText` pads its background by 4px each side. Measured against the drawn
 * box: HAS_CRITERION is 13 characters, this answers 99, the browser drew 98.
 *
 * AN EDGE WITH NO ROOM GETS NO LABEL AT ALL, which is a deliberate loss. Two
 * cards in adjacent columns are 16px apart in the grid and 40px in the graph,
 * and nothing true can be written in that space: the old label covered its own
 * line, its arrowhead and both of its neighbours' faces to print four legible
 * characters of a name. The line and the arrow are the half of the statement
 * only the canvas can make; the type is a right-click away, where the delete
 * item already names it in full.
 */
const LABEL_CHARACTER_WIDTH = 7;
const LABEL_PADDING = 8;

function labelFits(slot: LabelSlot, text: string): boolean {
  return slot.room >= text.length * LABEL_CHARACTER_WIDTH + LABEL_PADDING;
}

/**
 * How a route the router could not clear is drawn.
 *
 * `routeAroundCards` answers `fallback: true` with the bare line between the
 * endpoints and says in as many words that the line may cross a card, so it
 * must not be drawn as an ordinary relation. Today's two layouts cannot produce
 * one — it is latent, not live — and a dash is the cheapest way to keep the
 * canvas honest if one ever appears. Geometry rather than colour, so nothing
 * about it depends on the theme.
 */
const UNROUTED_DASH = "4 3";

export function FloatingEdgePath({
  data,
  style,
  markerEnd,
}: EdgeProps<FloatingEdge>) {
  const { d, label } = stepPath(data.route.waypoints);
  const named = labelFits(label, data.edgeType);

  return (
    /* It has to be `BaseEdge` and never a bare `<path>`. BaseEdge draws two
       paths: the visible one, and a transparent ~20px
       `react-flow__edge-interaction` stroke that is the whole hit target.
       Right-click is the only way to delete a relation, so a hand-rolled path
       would take the delete route away while the picture looked identical. */
    <BaseEdge
      path={d}
      /* The name goes in the middle of the route's longest horizontal run, and
         only when that run is long enough to hold it — see `labelFits`. Spread
         rather than passed for `exactOptionalPropertyTypes`, and as three props
         together because a label with no coordinates is drawn at the origin. */
      {...(named
        ? { label: data.edgeType, labelX: label.x, labelY: label.y }
        : {})}
      style={
        data.route.fallback
          ? { ...style, strokeDasharray: UNROUTED_DASH }
          : style
      }
      /* React Flow resolves the edge's marker object into a `url(#…)` of its
         own making and hands it back through the props; an edge component that
         does not forward it draws no arrowhead at all.

         Spread rather than passed: `exactOptionalPropertyTypes` refuses to give
         a `string | undefined` to a prop declared `markerEnd?: string`. Every
         edge of this type sets one, so the empty branch is unreachable — it is
         the type telling the truth about the props the library hands over, not
         a case this program can be in. */
      {...(markerEnd === undefined ? {} : { markerEnd })}
    />
  );
}

/**
 * Defined once at module scope, like the node type map: React Flow rebuilds its
 * internals whenever this object's identity changes, so a literal written
 * inside the canvas component would rebuild them on every render.
 */
export const EDGE_TYPES = { floating: FloatingEdgePath };
