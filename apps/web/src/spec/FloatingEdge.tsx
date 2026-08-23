import {
  BaseEdge,
  MarkerType,
  type Edge,
  type EdgeMarkerType,
  type EdgeProps,
} from "@xyflow/react";
import { RECEDED } from "./canvas-nodes";
import type { Highlight } from "./view/highlight";
import { Z, cardNodeId } from "./view/furniture";
import {
  labelFits,
  stepPath,
  type RoutedPath,
} from "./view/edge-routing";

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
  /**
   * WHERE THIS RELATION STANDS IN THE ONE-HOP HIGHLIGHT: it touches the selected
   * node, it is pushed back by somebody else's selection, or neither — which is
   * every relation on a board with nothing selected.
   *
   * BOTH ARE LOOKUPS IN AN ANSWER `view/highlight.ts` ALREADY GAVE, not a second
   * opinion about who is adjacent to what. Which relations are incident is
   * decided once, by a pure function over the edge array, and travels here as two
   * booleans for the same reason a card's three do: the component draws what it
   * is handed and computes no membership of its own.
   */
  readonly incident: boolean;
  readonly dimmed: boolean;
  /**
   * A RELATION THAT KEEPS ITS NAME TO ITSELF until somebody asks — drawn, dashed
   * or not, but unlabelled on a board with nothing selected, and named the
   * moment it touches the selection. The Spec plane sets it for every relation
   * that sinks into Domain: a graph of any size writes MENTIONS at nearly every
   * card, and forty copies of one word are not information. Which relations are
   * quiet is the canvas's decision, not this component's — the metamodel, whose
   * whole point is the names, sets it for none.
   */
  readonly quiet: boolean;
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
 * IT NAMES THE LINE'S OWN VARIABLE AND NOT THE TOKEN UNDER IT. This used to be
 * `var(--border)` — the token `spec.css` happened to map `--xy-edge-stroke`
 * onto — which made the head and its line one colour by two agreeing edits
 * rather than by construction, and the first change to the edge's weight broke
 * that agreement. `--xy-edge-stroke` is now a *derivation* of a token rather
 * than a token, so restating it here would be restating an expression; naming
 * the variable leaves one home for the answer. It resolves because the marker
 * `<defs>` are rendered inside `.react-flow__edges`, which is inside the
 * `.spec-canvas` element the variable is declared on.
 *
 * One object, shared by every edge: the library derives a marker's `<defs>` id
 * from its configuration, so identical markers cost one definition between them.
 */
export const ARROW_END = {
  type: MarkerType.ArrowClosed,
  color: "var(--xy-edge-stroke)",
} as const;

/**
 * A RELATION THAT TOUCHES THE SELECTED NODE IS DRAWN IN THE ACCENT, line and
 * head, and these two constants are the whole of that.
 *
 * `--primary` is the token the picked card's own border and ring already wear, so
 * the lit lines read as belonging to the card they leave rather than as a third
 * colour on the canvas. It is also what `spec.css` maps `--xy-edge-stroke-selected`
 * onto — the same choice, made for the library's own selected state, which this
 * board never enters because it holds no React Flow selection.
 *
 * THE HEAD NEEDS ITS OWN OBJECT AND CANNOT BE RECOLOURED BY THE COMPONENT. React
 * Flow resolves an edge's marker into a `<defs>` entry from the marker's own
 * configuration and writes the colour inline there, before any edge component
 * runs — so a lit line whose `markerEnd` was still `ARROW_END` would arrive at
 * its target in the resting grey. Two objects, two definitions in the document,
 * and the canvas picks between them where it builds the edge.
 *
 * IT NAMES THE TOKEN AND NOT `--xy-edge-stroke-selected`, which is the mirror of
 * the choice `ARROW_END` makes just above and not a departure from it. That
 * variable is a mapping this canvas never reaches — the library sets the class
 * behind it on its own selected edges, and this board holds no React Flow
 * selection — so pointing at it would hang the lit relation off a line in
 * `spec.css` that nothing else keeps honest. The accent is a theme token; the
 * resting line is an expression over one, and each is named where it lives.
 *
 * IT IS DRAWN HEAVIER TOO, AND THE WEIGHT IS DERIVED RATHER THAN RE-CHOSEN.
 * `--xy-edge-stroke-width` is the one home for how thick a relation is; a second
 * number here would be a copy of it that drifts on the first edit, so the lit
 * width is a `calc()` OVER that variable — half again, which at today's 1.5 is
 * 2.25 — and follows it wherever it goes. The variable resolves for the same
 * reason `ARROW_END`'s does: `spec.css` declares it on `.spec-canvas`, and every
 * relation on this board is drawn inside that element.
 *
 * THE WEIGHT WAS NOT ALWAYS EARNED AND IS NOW, which is worth saying because the
 * note here used to argue the other way. A lit relation is drawn OVER the cards
 * rather than under them — `Z.litEdge` in `view/furniture.ts`, so that the name
 * it is now allowed to write lands somewhere a person can read it — so its line
 * crosses card faces on the way to its target, and against a `--card` ground at
 * the resting hairline the accent alone was hard to follow across one. It is
 * also the only line on a receded board meant to be traced end to end.
 */
const LIT_STROKE = "var(--primary)";
const LIT_STROKE_WIDTH = "calc(var(--xy-edge-stroke-width) * 1.5)";

export const ARROW_LIT = {
  type: MarkerType.ArrowClosed,
  color: LIT_STROKE,
} as const;

/**
 * WHETHER A RELATION'S NAME FITS IS `view/edge-routing.ts`'S RULE, and it is
 * imported rather than restated: the metamodel canvas SPACES ITS COLUMNS by the
 * same arithmetic, so the estimate is a law about this surface and not a check
 * this component happens to make. `labelFits` carries the measurement and the
 * reason an edge with no room gets no label at all.
 *
 * EXCEPT WHERE THE RELATION TOUCHES THE SELECTION, WHICH IS THE USER'S OWN
 * EXCEPTION. Clicking a card is asking what it touches, and "it touches that one
 * somehow" is not the answer — so `labelFits` is not consulted for an incident
 * relation; see `FloatingEdgePath` below, where the two are `||`-ed. Two things
 * make that tolerable and neither is optional: the name has no plate under it,
 * so an overrun covers the ink it crosses and not the picture, and the lit
 * relation is lifted above the cards, so the name is not printed underneath one.
 */

/**
 * THE TWO DASHES ON THIS CANVAS, WRITTEN TOGETHER BECAUSE THEY MUST NOT BE
 * CONFUSABLE. One says something about the RELATION and the other says something
 * about the DRAWING, so a reader who cannot tell them apart is being told a
 * falsehood about the graph — which is the whole reason they share a paragraph
 * rather than sitting at opposite ends of the file.
 *
 *   · `DOMAIN_DASH`, a long stroke with a wide gap — 8 on, 5 off. An
 *     EXPLANATORY relation: one that sinks into the Domain band from outside it,
 *     which the Spec plane draws quieter than the engineering ones — dashed, and
 *     unnamed until it touches the selection (`quiet`). See `sinksIntoDomain`
 *     in `view/model.ts` for why it is a band crossing and not a list of edge
 *     types.
 *   · `UNROUTED_DASH`, a tight stipple — 2 on, 3 off. A route the router could
 *     NOT clear: `routeAroundCards` answers `fallback: true` with the bare line
 *     between the endpoints and says in as many words that it may cross a card,
 *     so it must not be drawn as an ordinary relation. Today's two layouts
 *     cannot produce one — it is latent, not live — and this is the cheapest way
 *     to keep the canvas honest if one ever appears.
 *
 * THEY READ APART AT A GLANCE AND NOT ONLY SIDE BY SIDE, which matters because
 * you will almost never see both at once. The dash lengths are 8 against 2 and
 * the pitches 13 against 5, so one is a line with gaps cut into it and the other
 * is a row of dots — different KINDS of mark rather than two lengths of the same
 * mark. `UNROUTED_DASH` was `4 3` before there was a second dash to be mistaken
 * for; at that length it read as a styled line, which is exactly the wrong thing
 * for a drawing defect to look like.
 *
 * Geometry rather than colour, so neither depends on the theme, and neither
 * touches the weight or the ink the line is otherwise drawn in.
 */
export const DOMAIN_DASH = "8 5";
const UNROUTED_DASH = "2 3";

export function FloatingEdgePath({
  data,
  style,
  markerEnd,
}: EdgeProps<FloatingEdge>) {
  const { d, label } = stepPath(data.route.waypoints);
  /**
   * WHEN A RELATION WRITES ITS NAME — three clauses, and the selection decides
   * two of them.
   *
   * AN INCIDENT RELATION IS NAMED UNCONDITIONALLY, and that is the user's own
   * exception: `labelFits` is asked whether the route has room, and here it is
   * not asked at all. The reasoning is in `labelFits` above, together with the
   * two things that make an overrun tolerable — no plate under the name, and
   * `Z.litEdge` over the cards. `labelFits` is CALLED and never restated: which
   * routes have room is one rule with one home, and this line decides only
   * whether that rule is the one that applies.
   *
   * A DIMMED RELATION LOSES ITS NAME, and it is the one place where this
   * highlight takes something away rather than fading it.
   *
   * It is forced rather than chosen. `BaseEdge` draws the label as a SIBLING of
   * the path — an `EdgeText` group of its own — so neither the class nor the
   * style below reaches it: a faded line would keep a full-strength name over
   * it. Twenty of them on a receded board would be the loudest thing on a canvas
   * whose point is that the neighbourhood is the loud thing — and more so now
   * that the name has no plate under it and is the darkest ink an unselected
   * relation carries.
   *
   * NOTHING IS FABRICATED BY DROPPING IT. The relation is still drawn, still hit
   * tested and still names itself in the context menu, exactly as it does for
   * every route too short to hold a label — which is most of them.
   *
   * A QUIET RELATION LOSES ITS NAME TOO, on the resting board as well as the
   * receded one — and gets it back the same way a dimmed one never does: by
   * touching the selection. That is the fourth clause and the one the user asked
   * for in as many words: the explanatory lines into Domain are a dashed hint
   * that something is named there, and the name is read by clicking the card it
   * leaves. `quiet` is decided by the canvas, not here — see `FloatingEdgeData`.
   *
   * THE OTHER ORDER OF THE SAME TEST WOULD BE WRONG. `incident` and `dimmed` are
   * built as complements of one another by the canvas, so no relation is both
   * and the `||` cannot light a receded name; writing the exception as a third
   * arm of the fade would say that it could.
   */
  const named =
    data.incident ||
    (!data.dimmed && !data.quiet && labelFits(label, data.edgeType));

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
      /* NO PLATE UNDER THE NAME. `EdgeText` renders its background `<rect>` only
         when `labelShowBg` is true — it defaults to true — and that rect was an
         opaque `--card` box wide enough to hide whatever the label happened to
         be drawn over: a neighbouring card's face, another relation, a lane's
         ruling. Off, the name sits on the canvas and the board shows through it.

         THIS IS NOT THE SAME DECISION AS `labelFits` AND DOES NOT REPLACE IT. A
         name is still only drawn where the route has room for one; what changes
         is that having room no longer costs a rectangle of the picture. The two
         together are the whole answer to "when may a relation write its name" —
         when there is space, and even then without clearing any. */
      labelShowBg={false}
      /* THE FADE IS A CLASS AND THE ACCENT IS A STYLE, which is not a taste: the
         path is an SVG element `BaseEdge` puts `className` and `style` on
         alike, and each of the two goes where its value already lives. The fade
         is a utility the card is drawn with too and is imported from it, so the
         cards and the lines this selection pushes back recede together and
         cannot drift apart. The accent is a token in a `stroke`, which no
         utility can spell for a `<path>` the library owns the class of. */
      {...(data.dimmed ? { className: RECEDED } : {})}
      style={{
        ...style,
        ...(data.route.fallback ? { strokeDasharray: UNROUTED_DASH } : {}),
        ...(data.incident
          ? { stroke: LIT_STROKE, strokeWidth: LIT_STROKE_WIDTH }
          : {}),
      }}
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

/**
 * ONE ROUTED RELATION AS THE LIBRARY WANTS IT, painted for this selection.
 *
 * THE THREE LOAD-BEARING CHOICES LIVE HERE AND NOWHERE ELSE, which is why both
 * canvases build their edges through this rather than each spelling them out:
 *
 *   · THE ARROWHEAD OBJECT. React Flow builds a marker's `<defs>` from the edge
 *     object's own `markerEnd` before any edge component runs, so a lit line
 *     whose marker was still `ARROW_END` would arrive at its target in the
 *     resting grey.
 *   · THE Z. The library reads it off the object and writes it onto the `<svg>`
 *     wrapper around the whole edge, so a component cannot change it — and the
 *     lift is what makes the label exception worth anything: an incident
 *     relation writes its name even where the route has no room, and at the
 *     resting z that name would be printed UNDER a card.
 *   · `incident` AND `dimmed` ARE COMPLEMENTS, computed together here so they
 *     cannot drift into a state where a receded relation is also lit.
 *
 * The dash goes on `style` because a `stroke-dasharray` has to land on the
 * `<path>`; `FloatingEdgePath` spreads it first so that `UNROUTED_DASH` — a
 * defect in the DRAWING — can outrank a statement about the graph.
 *
 * `quiet` IS THE CALLER'S AND NOT DERIVED FROM `dashed` HERE, although the Spec
 * plane passes the one as the other: the dash says what KIND of relation this is
 * and the quiet says whether THIS CANVAS writes its name unasked, and the two
 * canvases answer that differently — the board hides the explanatory names
 * because there are too many to read, the metamodel keeps them because the
 * names are what it is for.
 */
export function floatingEdgeOf(
  edge: { id: string; fromId: string; toId: string },
  name: string,
  route: RoutedPath,
  dashed: boolean,
  highlight: Highlight,
  quiet: boolean,
): FloatingEdge {
  const incident = highlight.edges.has(edge.id);
  return {
    id: edge.id,
    // The two cards as the CANVAS keys them: React Flow resolves these against
    // its node lookup to find the handles an edge hangs off, and a relation
    // whose ends it cannot find is not drawn at all.
    source: cardNodeId(edge.fromId),
    target: cardNodeId(edge.toId),
    type: "floating",
    data: {
      route,
      edgeType: name,
      incident,
      dimmed: highlight.selected !== null && !incident,
      quiet,
    },
    markerEnd: incident ? ARROW_LIT : ARROW_END,
    zIndex: incident ? Z.litEdge : Z.edge,
    // Spread rather than passed: `exactOptionalPropertyTypes` will not give
    // `undefined` to an optional `style`, and "no style" and "an empty style"
    // are different asks.
    ...(dashed ? { style: { strokeDasharray: DOMAIN_DASH } } : {}),
  };
}
