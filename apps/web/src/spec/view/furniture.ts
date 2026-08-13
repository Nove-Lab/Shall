import type { SpecView } from "./edge-geometry";
import type { Highlight } from "./highlight";
import { GEOMETRY, type Layout } from "./layout";
import type { Band, SpecNode } from "./model";

/**
 * EVERYTHING REACT FLOW IS HANDED AS A NODE — every band, every ruled lane,
 * every column header and every card — built by pure functions of the layout,
 * the view and the graph.
 *
 * THE SCENERY IS NODES AND NOT A BACKGROUND LAYER, which is the decision the
 * rest of this file follows from. Bands, lanes and headers are handed to the
 * library like anything else, so it pans, zooms and culls them in the same
 * coordinate space as the cards: there is no second transform to keep in step,
 * and a card can never slide off its own lane.
 *
 * It lives in `view/` for the reason everything else here does — it is
 * arithmetic, and arithmetic can be run and checked without a browser. Built
 * inside the component, these objects were reachable only by a person looking
 * at a screen, which is how the two defects recorded below stayed invisible for
 * so long.
 *
 * THE CARDS ARE HERE FOR EXACTLY THAT REASON AND FOR NO OTHER. Left in the
 * component when the furniture moved out, the card's own `measured`
 * declaration — the one thing keeping the edge layer mounted across a click —
 * could be deleted with every check still green. One builder, one witness, and
 * no declared size on this canvas without one.
 *
 * WHAT IS NOT HERE: how a piece is DRAWN. The components are React and live
 * beside the plane; what is here is the object handed to the library.
 *
 * NO COLOUR TRAVELS AS DATA. The components style themselves from the theme's
 * own tokens, so there is no band ground, no rule colour and no per-node accent
 * in any of the data types below. A hex in this file would be a second home for
 * a colour whose first home is the stylesheet, and it would not follow the
 * theme when the theme changes.
 *
 * Pure: no React, no `@xyflow/react`, no DOM, no clock, no randomness, and no
 * iteration over an unordered collection. The same graph must hand the library
 * the same objects every time.
 */

/**
 * What one card is drawn from.
 *
 * THE CARD'S WHOLE STATE IS THREE BOOLEANS, AND THEY ARE THE SELECTION'S — the
 * node the panel is open on, the nodes one hop from it, and everything else. All
 * three are computed per render from the `Highlight` the caller holds and none is
 * a stored field: no position, no state and no relation of this graph says
 * anything about what is lit.
 *
 * EXACTLY ONE OF THEM IS TRUE WHILE SOMETHING IS SELECTED, and all three are
 * false when nothing is — which is why the component can chain them and why
 * "nothing selected" cannot arrive as a board where every card is dimmed.
 *
 * THEY ARE COMPUTED HERE AND NEVER IN THE COMPONENT. Membership in the
 * neighbourhood is a rule (`view/highlight.ts` owns it), and a rule evaluated
 * inside a React component is a rule nothing can execute without a browser. What
 * crosses into the component is the answer, per card, already decided.
 */
export type CardNodeData = {
  readonly node: SpecNode;
  /** The node that was clicked — one card on the board, or none. */
  readonly picked: boolean;
  /** One hop from the picked card, whichever way the relation points. */
  readonly neighbour: boolean;
  /** Outside the neighbourhood while something else is picked. Faded, never hidden. */
  readonly dimmed: boolean;
  readonly width: number;
  readonly height: number;
};

/** A column header draws a name, a count, and spans the type's whole slot. */
export type ColumnNodeData = {
  readonly label: string;
  readonly count: number;
  readonly width: number;
};

/** A band's strip: which band it is, and the box it fills. */
export type BandNodeData = {
  readonly band: Band;
  readonly width: number;
  readonly height: number;
  /**
   * Whether this band draws the rule across its top.
   *
   * A rule separates two bands, so the first one has nothing to separate itself
   * from and draws none — the board opens on content and ends on content, with
   * no line closing either end. It is decided here rather than in the component
   * because which band is first is a fact about the layout, and the component's
   * job is only to draw what it is handed.
   */
  readonly ruled: boolean;
};

export type LaneNodeData = {
  readonly width: number;
  /**
   * The lane's drawn height — `rows * rowPitch`, computed once by the layout
   * and read here rather than multiplied out a second time.
   *
   * It used to be `rows`, with the component multiplying by the pitch while
   * the declaration multiplied by it here: two expressions equal by arithmetic
   * rather than by construction, so a trailing rule added to the lane would
   * have made the declared height a lie with nothing to notice.
   */
  readonly height: number;
  /**
   * ONE CELL AND WHERE ITS HAIRLINE SITS IN IT: the pitch, how far down the
   * cell the rule starts, and how thick it is drawn. All three are the
   * LAYOUT'S — it is the module that spaced the card against the rule — and
   * they are handed over rather than looked up, so the component draws the
   * ruling the layout placed the cards against and cannot arrive at its own.
   *
   * The card's own height is deliberately NOT here any more. The rule used to
   * be drawn flush at `cardHeight`, which made the card's box the offset by
   * coincidence; it is `cardHeight + stackGap` now, and a component handed the
   * card height would have to know the gap to find the rule.
   */
  readonly rowPitch: number;
  readonly ruleOffset: number;
  readonly ruleThickness: number;
};

/**
 * THE CANVAS'S IDS, AND WHY EVERY ONE OF THEM CARRIES A PREFIX.
 *
 * React Flow keys its node lookup by id, so two nodes handed in under one id
 * are one node — the later wins and the earlier is dropped, with nothing logged
 * and nothing red. The scenery's ids are built from the layout (`band:Domain`,
 * `column:Domain:Term`, `lane:…`), and a card's used to be the graph id
 * verbatim; a graph id is free text the person types, so typing `band:Domain`
 * into the id box deleted the Domain band's ground from the board. Reproduced:
 * a Term with that id took the band's place, the count of band pieces fell from
 * 4 to 3, and the console said nothing.
 *
 * THE FIX IS THE CARD'S PREFIX, NOT A RULE ABOUT WHAT MAY BE TYPED. `ids.ts`
 * says in as many words that `nextIdSuggestion` is a suggestion and that no
 * reader may assume an id has its shape, so the canon is not the place to close
 * this — and a client-side blacklist of three words would have to be kept in
 * step with a naming scheme that lives here. With `card:` on every card, the two
 * namespaces cannot meet whatever anyone types, because one is what this file
 * writes and the other is what this file writes.
 *
 * THE PREFIX IS THE CANVAS'S AND STOPS AT ITS EDGE. Nothing outside React Flow
 * ever sees it: the layout, the panel, the menus and the daemon all speak graph
 * ids, so a canvas id is converted back by `graphIdOfCard` at the three handlers
 * that receive one. It is visible in the DOM as `data-id="card:R-0001"`, which
 * is worth knowing if you are probing the board from a browser.
 */
const CARD_PREFIX = "card:";

/** A graph node's id as this canvas keys it. */
export function cardNodeId(graphId: string): string {
  return `${CARD_PREFIX}${graphId}`;
}

/** The graph id inside a canvas id, or `null` when the canvas id is scenery. */
export function graphIdOfCard(canvasId: string): string | null {
  return canvasId.startsWith(CARD_PREFIX)
    ? canvasId.slice(CARD_PREFIX.length)
    : null;
}

/**
 * THE PAINT ORDER, in one table.
 *
 * React Flow draws the edge layer and the node layer as siblings inside the
 * viewport's stacking context, edges first. A node at `z-index: 0` therefore
 * paints OVER every relation — and a band was once an opaque rectangle covering
 * the entire laid-out area, so with the default z the relations were neither
 * visible nor clickable: hit-testing along an edge's path answered the band,
 * the counter said "8 relations", and the canvas showed none.
 *
 * Bands and column headers are decoration for the cards, so they belong BELOW
 * the relations they were hiding. A negative z-index keeps them inside the
 * viewport's own stacking context — it is created by the viewport's transform —
 * so they still pan and zoom with everything else instead of sinking behind the
 * canvas.
 *
 * THE BAND HAS SINCE LOST ITS GROUND AND THE TABLE STILL STANDS. It paints only
 * a rule and a label now — the grid and the graph had to be one surface, and the
 * wash was the seam — so it could no longer hide a relation by being opaque. The
 * ORDER is what this table is for, not the opacity that made one entry urgent:
 * the lane below still paints a ruling across the whole of every empty column,
 * a header still paints a rule and a name, and either at `z: 0` would be drawn
 * over the relations that cross it.
 *
 * THE LANE SITS BETWEEN THE BAND AND THE HEADER: above the band, so that a band
 * which ever gets a ground again cannot paint over the ruling, and below the
 * relations, or the empty grid hides the edges the band used to hide — the same
 * defect arriving a second time by a different door.
 *
 * `card` is in the same table rather than in the component, because a stacking
 * order split across two files is a stacking order with no single reader.
 *
 * THE TWO RELATION ROWS ARE IN IT FOR THAT REASON AND NOT BECAUSE THIS FILE
 * BUILDS A RELATION — it does not; `SpecGraph.tsx` does, and it reads them from
 * here. `edge` is the number the library would have used anyway, written down
 * so the order can be read in one place instead of inferred from a default.
 * `litEdge` is the one entry that is a decision: a relation incident to the
 * selection writes its NAME even where the route has no room for one, and a
 * name drawn under a card is a name nobody can read — so the exception buys
 * nothing unless the whole relation is lifted over the cards it crosses.
 *
 * ALL SIX RESOLVE IN ONE STACKING CONTEXT, which is the only reason the node
 * rows and the relation rows are comparable at all. React Flow writes a node's
 * z inline on `.react-flow__node` and an edge's inline on the `<svg>` it wraps
 * that edge in; `.react-flow__edges` is positioned at `z-index: auto` and
 * `.react-flow__nodes` is not positioned at all, so neither opens a context of
 * its own and both sets are resolved against the viewport's — the element whose
 * transform creates the one context on this canvas. Read in 12.11.2 rather than
 * assumed, along with the other half: `getElevatedEdgeZIndex` hands `edge.zIndex`
 * back untouched while `zIndexMode` is `basic` and neither end is a child node or
 * a selected one, which is every relation this canvas draws.
 */
export const Z = {
  band: -3,
  lane: -2,
  column: -1,
  edge: 0,
  card: 2,
  litEdge: 3,
} as const;

/**
 * THE POINTER GOES THROUGH THE SCENERY, and the context menu depends on it.
 *
 * Bands, lanes and headers answer to no graph id, so every gesture that landed
 * on one died on the way: the node context-menu handler fired with `band:Intent`,
 * the lookup found nothing, and the pane handler never ran. Right-click inside a
 * band gave an empty menu, right-click on a column header the same — and the
 * bands cover the whole board, which is to say the create route was silent
 * exactly where a person aims it. A left click was lost the same way, where a
 * click on the true pane clears the selection.
 *
 * IT HAS TO BE AN INLINE STYLE, NOT A STYLESHEET RULE. React Flow writes
 * `pointer-events` inline on every node wrapper (`all` whenever the flow carries
 * any node click or context-menu handler at all), and an inline declaration
 * beats any class. The node's own `style` is spread after the library's, so this
 * is the one place that can say otherwise — and it sits next to the z-index it
 * travels with rather than a file away.
 */
const SCENERY = { pointerEvents: "none" } as const;

/**
 * One piece of furniture, in the shape React Flow's `nodes` prop takes.
 *
 * It is spelled structurally rather than as the library's own `Node<…>` because
 * this file must not import `@xyflow/react`: it produces data, the component
 * consumes it. The component assigns the result to the library's node array, so
 * the two shapes are checked against each other at that one line, and a field
 * this type gets wrong is a compile error rather than a silent divergence.
 */
type Piece<Kind extends string, Data> = {
  readonly id: string;
  readonly type: Kind;
  readonly position: { readonly x: number; readonly y: number };
  readonly measured: { readonly width: number; readonly height: number };
  readonly data: Data;
  readonly draggable: false;
  readonly selectable: false;
  readonly connectable: false;
  readonly zIndex: number;
  readonly style: { readonly pointerEvents: "none" };
};

export type FurniturePiece =
  | Piece<"band", BandNodeData>
  | Piece<"lane", LaneNodeData>
  | Piece<"column", ColumnNodeData>;

/**
 * ONE CARD, in the same prop's shape. Spelled structurally for the same reason,
 * and it is NOT a `Piece`: a card is pointer-live, it anchors relations, and it
 * carries three spellings of its box rather than one.
 */
export type CardPiece = {
  readonly id: string;
  readonly type: "spec";
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly measured: { readonly width: number; readonly height: number };
  readonly data: CardNodeData;
  readonly draggable: false;
  readonly zIndex: number;
};

/**
 * EVERY BAND, EVERY LANE AND EVERY COLUMN HEADER — the scenery that makes an
 * empty grid legible, as one array in the library's own shape.
 *
 * IT IS A PURE FUNCTION OF THE LAYOUT AND THE VIEW, and that is a contract and
 * not an accident: the caller memoizes this call on `[layout, view]`, so
 * reading anything else here — a selection, a hover, a clock — would hand back
 * a stale board with no way to notice.
 *
 * EVERY PIECE DECLARES ITS OWN SIZE, and the reason is a defect that stayed
 * invisible until a probe watched one node for twenty seconds:
 *
 *   · React Flow rebuilds its internal node whenever the object it is handed is
 *     not the same OBJECT it already holds — per node, not per array. On that
 *     rebuild arm `measured` is re-derived FROM THE USER NODE ALONE, with no
 *     fallback to the internal node it replaces, so a piece carrying none ends
 *     up with none however recently the library measured it.
 *   · The wrapper is then painted `visibility: hidden` while it has no
 *     dimensions, by the library itself.
 *   · And a fresh measurement is only requested when the initialised flag
 *     changes between two COMMITTED renders. The store is mutable and read at
 *     render time, so a measurement that arrives and is discarded before React
 *     renders is a state no render ever saw: the flag does not flip, no new
 *     observation is issued, the element's box never changes again, and the
 *     observer stays silent for the life of the screen. Measured before the
 *     fix: 17 stuck opens in 760 — about one in forty — with every piece of
 *     scenery on the board painted `hidden` and staying that way, while the
 *     cards, which had always declared their size, drew normally.
 *
 * MEMOIZING IS COMPLEMENTARY TO THE DECLARATION, NOT AN ALTERNATIVE TO IT. The
 * memo helps on selection, where the same objects go back in and take the
 * library's identity fast path. The defect fires on OPEN, where the canvas
 * height comes from the library's own store and feeds `gridLayout` — so the
 * pane's first measurement produces a new layout, and therefore genuinely new
 * objects that no memo can make old, at exactly the moment the observer is
 * delivering its first measurements. On that path the rebuild arm is taken
 * however the memo is cut, and only a declared `measured` survives it.
 *
 * Each piece's numbers are already known, and where each comes from differs:
 * the band declares `layout.width` by its own height, the same box its
 * component draws; the lane declares the height the layout computed once; and
 * the column header's height is not set by this program at all — the drawn
 * block is as tall as its own line box, and `GEOMETRY.columnHeaderHeight` is
 * the copy of that arithmetic that the layout reserved space with.
 *
 * IT TAKES NO `view` ARGUMENT, and `cardPieces` below still does. The scenery
 * is now entirely the layout's own numbers — a band's box, a lane's box AND
 * its ruling, a header's slot width — while a card is drawn at the view's card
 * size. The lane was the last piece that needed to know which view it was in,
 * and it stopped needing to when its ruling moved onto `LaneRun`: only the grid
 * rules lanes, so a `view === "grid" ? … : …` on that path was choosing between
 * one real answer and one that could never be reached.
 */
export function furniturePieces(layout: Layout): FurniturePiece[] {
  const pieces: FurniturePiece[] = [];

  for (const [index, band] of layout.bands.entries()) {
    pieces.push({
      id: `band:${band.band}`,
      type: "band",
      position: { x: band.x, y: band.y },
      measured: { width: band.width, height: band.height },
      data: {
        band: band.band,
        width: band.width,
        height: band.height,
        ruled: index > 0,
      },
      draggable: false,
      selectable: false,
      connectable: false,
      zIndex: Z.band,
      style: SCENERY,
    });
  }

  /**
   * THE EMPTY GRID, one lane per sub-column. It is furniture and never content:
   * it carries the same `SCENERY` pointer style the bands do, so a right-click
   * on an empty slot reaches the pane's create menu instead of dying in a node
   * lookup with no graph id to find, and nothing about it is selectable,
   * connectable or draggable.
   *
   * The id is the layout's own lane key, which is already unique and stable per
   * band, type and sub-column — there is no second naming scheme for the same
   * thing.
   */
  for (const lane of layout.lanes) {
    pieces.push({
      id: `lane:${lane.key}`,
      type: "lane",
      position: { x: lane.x, y: lane.y },
      measured: { width: lane.width, height: lane.height },
      data: {
        width: lane.width,
        height: lane.height,
        rowPitch: lane.rowPitch,
        ruleOffset: lane.ruleOffset,
        ruleThickness: lane.ruleThickness,
      },
      draggable: false,
      selectable: false,
      connectable: false,
      zIndex: Z.lane,
      style: SCENERY,
    });
  }

  for (const column of layout.columns) {
    pieces.push({
      id: `column:${column.band}:${column.type}`,
      type: "column",
      position: { x: column.x, y: column.y },
      // The header spans the type's whole SLOT — one card wide until the type
      // outgrows its band's stack cap, and N cards plus their gaps after that —
      // so a widened column reads as one wide column with one name over it
      // rather than as an unnamed second column beside it.
      //
      // ITS HEIGHT IS ROUNDED HERE AND IS NOT ROUNDED IN THE LAYOUT, AND THE
      // ROUND IS A NO-OP TODAY. `columnHeaderHeight` is 21 — a 16px `text-xs`
      // line box, 4px of padding and a 1px rule — so nothing is lost. It was
      // 18.5 when this was written, and the library reads `offsetHeight`, an
      // INTEGER, so the browser answered 19 for a block drawn 18.5 tall while a
      // declaration of 18.5 was a number the DOM can never report, held in the
      // store for the life of the screen because nothing re-measures a box that
      // never changes.
      //
      // IT STAYS, BECAUSE A LINE BOX IS A FRACTION AS SOON AS A FONT SIZE OR A
      // LINE HEIGHT STOPS DIVIDING EVENLY, and this is the one line that has to
      // hand the library a whole number. ROUND, and not `ceil`: `ceil` is "what
      // the browser would have written" only when the fraction is at least a
      // half — at a 16.25 block it declares 17 against a reported 16, and the
      // store lies by a whole pixel with nothing red.
      //
      // The layout keeps the unrounded number, because `grid.headerHeight` is
      // derived from it and rounding before that sum would move every card in
      // the grid by whatever the fraction was.
      measured: {
        width: column.width,
        height: Math.round(GEOMETRY.columnHeaderHeight),
      },
      data: { label: column.label, count: column.count, width: column.width },
      draggable: false,
      selectable: false,
      connectable: false,
      zIndex: Z.column,
      style: SCENERY,
    });
  }

  return pieces;
}

/**
 * EVERY CARD ON THE BOARD, one per placement the layout made — the content half
 * of the canvas, and the reason the furniture above has a file to live in.
 *
 * THE CARD'S TWO NUMBERS ARE WRITTEN THREE TIMES BELOW, AND EACH SPELLING
 * ANSWERS A DIFFERENT READER:
 *
 *   · `width`/`height` are what React Flow writes onto the wrapper as an INLINE
 *     BOX. It reads them off the node itself and never looks at `measured`, so
 *     these two are why the card's element is 148 x 44 before anything measures
 *     it.
 *   · `measured` is what keeps the RELATIONS mounted across a rebuild. The
 *     library rebuilds an internal node whenever the object handed to it is not
 *     the object it holds — for a card that is every change of the highlight,
 *     because `data` carries it, and the highlight moves on every click of a
 *     card — and on that arm it re-parses the handle bounds, whose first rule is
 *     that a node with no `measured` gets none so that it will be re-measured.
 *     A node with no handle bounds is not initialised, its edge
 *     positions resolve to null, and the edge wrapper returns before any edge
 *     component runs: the WHOLE edge layer blanked for a painted frame on every
 *     click and healed itself once the observer caught up. Declaring it keeps
 *     the bounds alive instead.
 *   · `data.width`/`data.height` are what the card component draws its own box
 *     with. The component reads no node field, so it is handed them.
 *
 * WHAT KEEPS A BAND FROM ANCHORING A RELATION IS THAT IT RENDERS NO HANDLE —
 * not that it lacks a size. Once the scenery declares `measured`, handle bounds
 * could be derived from it just as well; the band, lane and header components
 * render no handle at all, so a connection has nothing to attach to whatever the
 * library knows about their boxes.
 *
 * A PLACEMENT WHOSE NODE IS NOT IN THE MAP IS SKIPPED rather than drawn from
 * nothing — the same answer the relation builder gives an endpoint it cannot
 * find.
 *
 * THE HIGHLIGHT ARRIVES WHOLE AND THERE IS NO `selectedId` BESIDE IT. It used to
 * take the id, and the two together would be two sources of truth for one
 * question: `highlight.selected` is that id, and a caller that could pass a
 * different one would light a card the neighbourhood was not computed for. One
 * argument, one answer — `NOTHING_SELECTED` is how a caller says nobody clicked.
 *
 * IT IS THE ONE INPUT `furniturePieces` DOES NOT TAKE, and that asymmetry is the
 * point of having two builders: the scenery is a function of the layout alone and
 * memoises on it, so a click rebuilds the cards and leaves all fifty bands, lanes
 * and headers as the objects React Flow already holds.
 */
export function cardPieces(
  layout: Layout,
  view: SpecView,
  byId: ReadonlyMap<string, SpecNode>,
  highlight: Highlight,
): CardPiece[] {
  const geometry = view === "grid" ? GEOMETRY.grid : GEOMETRY.graph;
  const cards: CardPiece[] = [];

  for (const placement of layout.placements) {
    const node = byId.get(placement.id);
    if (node === undefined) continue;
    cards.push({
      // The canvas's own id, not the graph's — see `CARD_PREFIX` above for the
      // scenery a raw graph id could displace.
      id: cardNodeId(node.id),
      type: "spec",
      position: { x: placement.x, y: placement.y },
      width: geometry.cardWidth,
      height: geometry.cardHeight,
      measured: { width: geometry.cardWidth, height: geometry.cardHeight },
      data: {
        node,
        // The three questions the highlight answers, asked once per card here so
        // that no component has to know how membership is decided. `dimmed` is
        // the complement of the neighbourhood and not of the two flags above it:
        // with nothing selected there is nothing to be outside of, so a board at
        // rest is drawn at full strength.
        picked: highlight.selected === node.id,
        neighbour:
          highlight.selected !== null &&
          highlight.selected !== node.id &&
          highlight.nodes.has(node.id),
        dimmed: highlight.selected !== null && !highlight.nodes.has(node.id),
        width: geometry.cardWidth,
        height: geometry.cardHeight,
      },
      draggable: false,
      zIndex: Z.card,
    });
  }

  return cards;
}
