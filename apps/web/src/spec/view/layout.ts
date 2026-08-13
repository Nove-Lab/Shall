import {
  BAND_ORDER,
  SATELLITE_BAND,
  STACK_CAP,
  bandOf,
  columnsInOrder,
  nodesOfType,
  typesInBand,
  type Band,
  type NodeTypeEntry,
  type SpecNode,
} from "./model";

/**
 * Both Spec-plane layouts, as pure functions of `(band, type ordinal, id)`.
 *
 * POSITIONS ARE NEVER STORED AND CARDS ARE NEVER DRAGGABLE. A moved card would
 * show a position the graph does not hold, so there is nowhere to keep one. What
 * that buys is a picture you can reason about and test: the same graph is the
 * same picture, every time. No heuristic to tune, no seed, no layout cache to
 * invalidate, and nothing computed here that could be persisted by accident.
 *
 * THE CANVAS IS NOT AN INPUT TO EITHER LAYOUT, in either axis. It used to be, in
 * one: the grid divided the canvas HEIGHT between its four bands so that an empty
 * board filled the screen. The cost was a board whose top strip was empty, a
 * Domain band that claimed three rows before anything was authored into it, and
 * a set of positions that moved when the window did. A band is now as tall as its
 * own fullest column and no taller, which makes the whole picture a function of
 * the graph alone — an empty band and a band with one card are the same height,
 * and resizing the window moves nothing.
 *
 * POSITIONS ARE STILL NOT STABLE UNDER INSERTION, and that is the intended
 * behaviour rather than a side effect: a sixth Requirement shifts every Intent
 * column to its right by one pitch, and a fourth card in any column pushes the
 * bands below it down by one row pitch.
 *
 * THERE IS NO CANVAS *WIDTH* EITHER. The board's width is set by its content alone: the
 * widest band's columns at a fixed card width. Nothing here reads how wide the
 * viewport is, so opening or collapsing a side panel cannot re-flow the board —
 * it clips and scrolls. On a narrow screen the grid scrolls horizontally from
 * zero nodes, which is accepted: no legible card width fits the Intent band's
 * eleven columns into a small viewport.
 *
 * THERE IS NO RANK SOLVER for the graph view, and there is not meant to be one.
 * One type is one column, id-ascending inside it.
 *
 * This module says where things go. Something else does the drawing.
 */

/** One card, and the band it was drawn in — the band is on it so the drawing side needs no second lookup. */
export interface Placement {
  id: string;
  type: string;
  band: Band;
  x: number;
  y: number;
}

export interface ColumnHeader {
  type: string;
  band: Band;
  /** What the header draws. Today it is the type as the canon spells it. */
  label: string;
  count: number;
  x: number;
  /**
   * WHERE THE LABEL BLOCK IS DRAWN, which is not the band's top: in the grid it
   * is `bandY + GEOMETRY.bandGap`, so the clear space between the band's own top
   * rule and this label is the same 15 as between the band's closing rule and the
   * next band's top rule. `BandHeader.y` is the band's top and nothing else should
   * be read as it.
   *
   * IN THE GRAPH VIEW EVERY HEADER SITS ON ONE LINE AT 0 — not at `topPadding`,
   * even though that view's cards are placed at `topPadding + headerHeight + …`.
   * The header therefore floats above the padding the cards were given rather
   * than inside it, which is what leaves 25px of clear space between the header's
   * rule and the first card. It looks like an inconsistency and reads like one;
   * it is the behaviour being carried over, and the camera depends on it —
   * `openingViewport` anchors the leftmost header at `ANCHOR_MARGIN` in both
   * axes, so moving this to 16 would move every graph card 16px up the screen and
   * shrink that clearance to 9.
   */
  y: number;
  /**
   * How wide this type's slot is — one card, or N cards and the gaps between them
   * once the type has outgrown its band's stack cap. The header spans the whole
   * slot, so a widened type reads as one wider column rather than as two columns
   * of the same name.
   */
  width: number;
}

/** A band's own strip of the board. It spans the full board width, gutter included. */
export interface BandHeader {
  band: Band;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * ONE RULED LANE — a single sub-column's worth of empty slots, drawn so that a
 * grid with nothing in it is still a grid.
 *
 * It is a lane and not a row of outlined boxes: one box per empty cell is
 * hundreds of boxes on a large screen, and hundreds of boxes read as hundreds of
 * clickable slots, which is false — you author from a menu, never by clicking a
 * cell. A lane is card-wide, starts under its column header, and carries one
 * hairline at each row pitch.
 *
 * `rows` IS THE BAND'S ROW COUNT AND EVERY LANE IN A BAND HAS IT. The band is as
 * tall as its fullest column, so a band whose busiest type holds four cards rules
 * four cells under every one of its types, and an empty band rules exactly one
 * under each. That count can never exceed the stack cap, because a fifth card in
 * a five-capped band starts a sub-column rather than a fifth row — so no lane is
 * ever ruled below a slot a node could reach.
 *
 * IT CARRIES ITS OWN RULING and does not leave the drawing side to re-derive it.
 * `height`, `rowPitch` and `ruleOffset` are three views of the same arithmetic;
 * computed here they agree by construction, and computed again next to the
 * gradient they would agree only until someone edited one of them.
 */
export interface LaneRun {
  /** Unique and stable across renders, for a keyed list. */
  key: string;
  band: Band;
  type: string;
  x: number;
  y: number;
  width: number;
  /** `rows * rowPitch`, computed once here so the drawn box and the ruling agree. */
  height: number;
  rows: number;
  /** One cell: a card, the gap under it, its rule, and the gap under that. */
  rowPitch: number;
  /** How far into a cell that cell's hairline starts — `cardHeight + stackGap`. */
  ruleOffset: number;
  /** How thick it is drawn. One pixel, and the layout has to know: see `GEOMETRY`. */
  ruleThickness: number;
}

export interface Layout {
  /**
   * Which layout this is. The two views differ in more than their gaps — the grid
   * has bands and lanes and a per-band column cursor, the graph has none of that —
   * so `typeAtPoint` reads this rather than inferring the view from an empty array.
   */
  view: "grid" | "graph";
  placements: Placement[];
  columns: ColumnHeader[];
  bands: BandHeader[];
  /** Empty-slot furniture. The grid draws it; the graph has no fixed rows to rule and gets none. */
  lanes: LaneRun[];
  width: number;
  height: number;
}

/**
 * The numbers the grid's vertical arithmetic is computed from, hoisted out of
 * the object below only because an object literal cannot reference its own
 * siblings. Their published home is still `GEOMETRY`; nothing outside this file
 * reads these names.
 */
const BAND_GAP = 16;
const STACK_GAP = 3;
const RULE = 1;

/**
 * The column header block, written as the sum it is rather than as the 21 it
 * comes to: a `text-xs` label is a 12px font in a 16px line box, the `pb-1`
 * under it is 4, and the block ends in the rule that starts the stack.
 *
 * THAT LAST TERM IS `RULE` AND NOT A THIRD 1. The component draws that border at
 * `GEOMETRY.ruleThickness`, and the block declares this height, so a rule drawn
 * thicker has to make the block taller — `box-sizing` is `border-box`, so
 * otherwise the extra pixel comes out of the label's own line box while the grid
 * below goes on believing the old height.
 */
const COLUMN_HEADER_HEIGHT = 16 + 4 + RULE;

/**
 * The dead space between one card's bottom and the next card's top: a gap, the
 * hairline that separates the two slots, and a second gap. It is DERIVED and
 * never chosen, because the number anyone actually has an opinion about is
 * `STACK_GAP` — see the symmetry derivation in `GEOMETRY`.
 */
const GRID_ROW_GAP = 2 * STACK_GAP + RULE;

/**
 * The geometry, in one object.
 *
 * THE RULE THIS OBJECT EXISTS TO ENFORCE: every number that decides where
 * something is drawn lives here, and every component that draws one reads it from
 * here. A component that draws a column header must take its height from
 * `GEOMETRY.columnHeaderHeight` — the same number `grid.headerHeight` reserved
 * space for — because if the drawn header and the reserved header disagree by a
 * pixel, nothing errors and the picture is quietly wrong: the label sits closer to
 * one row than to the other in every band on the board. Same for the card box, the
 * lane width and the band gutter. A second copy of any of these is a bug waiting
 * for a stylesheet edit.
 *
 * ONE CARD BOX FOR BOTH VIEWS. The graph opens at the grid's card size, which only
 * has an answer while the two boxes are the same box; unify them and switching
 * views is zoom 1 with no camera arithmetic of its own.
 *
 * CARD HEIGHT 44 — two text rows, not one:
 *
 *     1px top border
 *       + 5px padding-top
 *       + 16px text row     line 1: the 9x9 signal square and the id
 *       + 16px text row     line 2: the short name
 *       + 5px padding-bottom
 *       + 1px bottom border   =  44
 *
 * Everything below that is a function of the card is recomputed from this 44 and
 * not carried over: the grid's row pitch is 51 (was 30 at a one-line card), a
 * full Domain band is 205 tall (was 141 at that card and the 9px header this
 * repo does not draw), and the graph's row pitch is 62.
 *
 * CARD WIDTH 148 — the widest band is Intent (eight core types plus the three
 * satellites parked there, eleven columns), so the board is
 * `104 + 10 * (148 + 16) + 148 + 16 = 1908` across: a 1920px screen with 12px to
 * spare. Of the 148, about 85 is chrome and reserved id — a 9px signal square, the
 * gaps around it, and room for an id of at most seven mono glyphs — which leaves
 * roughly 63px of short name on the second line.
 *
 * THE GAPS STAY DIFFERENT BETWEEN THE VIEWS, and only the gaps. A gap changes no
 * apparent card size: the graph needs room to route a relation between columns,
 * the grid wants density.
 *
 * THE STACK'S ONE GAP, AND THE INVARIANT EVERY NUMBER BELOW EXISTS TO SATISFY:
 *
 *     Everywhere in a stack, the gap between a rule and the card below it equals
 *     the gap between a card and the rule below it. The column header's bottom
 *     border is the stack's first rule and obeys the same gap. The rule closing
 *     the stack obeys it too.
 *
 * Call that gap g — `grid.stackGap`, 3. A stack is then literally alternating:
 * rule, g, card, g, rule, g, card, … from the header's border down to the rule
 * that closes the last row. Before this, the lane's hairline was drawn flush
 * against the bottom of each card and the whole 6px gap sat above the next one,
 * so every card in the grid was 0px from the rule over it and 5 from the rule
 * under it. Nothing errored; it just read as a list of cards hanging off rules
 * rather than as ruled paper.
 *
 * THE RULE'S OWN PIXEL IS A TERM, which is why `RULE` is in this file at all. A
 * hairline is 1px of the pitch, and the invariant is about the gaps ON EITHER
 * SIDE of it, so where a card goes now depends on how thick a rule is drawn. It
 * used to be a private constant beside the component that paints it — correctly,
 * while nothing about placement depended on it. That is no longer true, so it
 * moved here and the component reads it back as `GEOMETRY.ruleThickness`.
 *
 *     grid.rowGap   = 2g + RULE = 7
 *     grid.rowPitch = cardHeight + rowGap = 44 + 7 = 51
 *
 * `rowGap` keeps its meaning exactly — the dead space between one card's bottom
 * and the next card's top, which is what `cardHeight + rowGap` being the pitch
 * has always meant — but it is now DERIVED from g rather than chosen, because g
 * is the number the invariant is written in. g is 3 and not 2.5 because a card
 * must land on a whole pixel: an exact 50px pitch needs a half-pixel gap on each
 * side of the rule, so the pitch rounds to 51 and the board grows by one pixel
 * per row. g = 2 would have squeezed instead, at 49.
 *
 * A GRID BAND BREATHES THE SAME GAP TOP AND BOTTOM — call it G, `bandGap`, 16,
 * and it is a different and larger gap than g on purpose: g separates two rows of
 * one stack, G separates one band from the next. The two constants under it are
 * derived from G rather than chosen beside it, because the mistake this replaces
 * was placing the column label at the band's own top: the label then sat flush
 * under the band's rule with nothing above it, while the bottom carried
 * `rowGap + bandPadding` of clear space. The label's height had been counted as
 * if it were padding.
 *
 * G is 16 because 16 is already the grid's breathing space sideways — the lane
 * between two columns (`grid.columnGap`). It is set *equal* to it and never
 * computed *from* it, because `columnGap`'s value is load-bearing for edge
 * routing and has to stay independently movable.
 *
 *     grid.headerHeight = ceil(G + columnHeaderHeight + g)
 *                       = ceil(16 + 21 + 3) = 40
 *
 * — the distance from a band's top to the top of its first card. Its last term is
 * g and not `rowGap` because `columnHeaderHeight` ENDS IN THE HEADER'S OWN
 * BORDER: that border is the stack's first rule, so what follows it is one gap,
 * exactly as after every other rule. Taken to a whole pixel so that every card
 * still lands on one; the `ceil` has nothing to absorb at these three terms and
 * is kept anyway, because the header's height is a line box and a line box is a
 * fraction the moment a font size or a line height stops dividing evenly. It is
 * written as that expression and not as the literal 40, so raising
 * `columnHeaderHeight` moves the grid instead of leaving a hand-typed number
 * standing beside a paragraph that claims otherwise.
 *
 *     grid.bandPadding  = G - RULE - g = 12
 *
 * THE CLOSING RULE IS WHY THIS IS THREE TERMS AND NOT TWO. A band's last cell is
 * a full pitch — it ends g BELOW its own closing rule, not at the card — so the
 * clear space under that rule is `g + bandPadding`, and setting it to `G - RULE`
 * makes it exactly the clear space under the band's own top border, which is what
 * the label above sits below. Two hairlines, the same 15px of air under each.
 *
 * WHERE THE SYMMETRY IS EXACT: everywhere, now. It used to be a promise the
 * arithmetic kept only in Domain, because a band was given a share of the canvas
 * and whatever the row count's floor division left over was dumped at the bottom.
 * Bands are content-sized, so there is no remainder to leave over and no band
 * with a strip of nothing under its last ruled row.
 *
 * THE GRAPH VIEW'S `headerHeight: 30` IS NOT PART OF THAT DERIVATION. That view
 * spaces with its own gaps, draws no bands and rules no lanes, so it has no
 * `stackGap` — there is no rule there for a card to be spaced against. Its
 * `bandPadding` is 10, reached independently: it is the clearance under the
 * tallest column when the pannable extent is computed, and deriving it from a
 * grid constant would make the grid's row gap a term in the graph's extent — a
 * coupling neither view asked for.
 */
export const GEOMETRY = {
  /**
   * `grid.columnGap` has a dependant one module away: the 16px lane between two
   * columns is where a relation between adjacent columns (and, more to the point,
   * between two cards in the *same* column) is routed and clicked. Narrowing this
   * gap narrows that lane. The grid is drawn at scale 1, so these canvas units are
   * screen pixels.
   */
  grid: {
    cardWidth: 148,
    cardHeight: 44,
    columnGap: 16,
    /** The dead space between two stacked cards — `2 * stackGap + ruleThickness`. */
    rowGap: GRID_ROW_GAP,
    /** g — the one gap the stack is spaced with, on both sides of every rule. */
    stackGap: STACK_GAP,
    headerHeight: Math.ceil(BAND_GAP + COLUMN_HEADER_HEIGHT + STACK_GAP),
    /** Space below a band's closing rule, before the next band's rule. See the derivation above. */
    bandPadding: BAND_GAP - RULE - STACK_GAP,
    /**
     * NOTHING ABOVE THE FIRST BAND. The board's top edge is the Domain band's
     * own top rule, which is what a scroll to the top of the grid now reaches;
     * a strip of empty canvas above it read as a rendering slip rather than as
     * breathing space, because the band below it supplies its own.
     *
     * It is written as a zero rather than dropped so that the decision is where
     * a reader looks for it, beside the graph view's 16.
     */
    topPadding: 0,
  },
  /**
   * The graph view's own gaps, its own bottom clearance and its own top padding.
   * `headerHeight` and `bandPadding` are literals on purpose — see the note above
   * on why the grid's derivation is not extended to a view that draws no bands.
   */
  graph: {
    cardWidth: 148,
    cardHeight: 44,
    columnGap: 40,
    rowGap: 18,
    headerHeight: 30,
    bandPadding: 10,
    /**
     * Space above this view's row of column headers — except that the headers
     * themselves sit at y = 0 and only the CARDS reserve it. That is stated at
     * `ColumnHeader.y`, and `openingViewport` depends on it.
     */
    topPadding: 16,
  },
  /**
   * The column header block's own height — label line, its padding and its rule.
   *
   * It is load-bearing three times over: `grid.headerHeight` above is literally
   * `bandGap + this + stackGap`, so every card in the grid is placed by it; the
   * header component is sized from it rather than being left to size itself; and
   * the 1px it ends in is the stack's FIRST RULE, which is why the term after it
   * is one `stackGap` and not a whole row gap. That is the rule at the top of this
   * object in its sharpest form — the drawn header and the reserved header must be
   * the one number.
   *
   * The 21 is what the header this repo draws actually occupies, and it is
   * written as that block's own sum — a 16px `text-xs` line box, 4px of `pb-1`,
   * and `ruleThickness` — so the header's rule and the grid's spacing move
   * together instead of each holding a private 1.
   *
   * IT WAS 18.5 AND THAT NUMBER CAME FROM A STYLESHEET THIS REPO DOES NOT HAVE:
   * a 9px label at a 1.5 line height, a 13.5px line box the browser does not
   * round up, plus the same 4 and 1. There is no 9px type in the shadcn scale,
   * the header is drawn at the smallest size there is, and reserving 18.5 for a
   * block that draws 21 would push the label 2.5px into the clearance above the
   * band's first row — in every band, with nothing to error. The drawn header
   * and the reserved header are one number, so the number moved.
   *
   * A whole one, today. Anything that has to declare an INTEGER height for this
   * block should still round it rather than assume: `offsetHeight` rounds, a
   * line box is a fraction as soon as a font size or a line height stops
   * dividing evenly, and a declaration the DOM can never report is held in the
   * library's store for the life of the screen.
   */
  columnHeaderHeight: COLUMN_HEADER_HEIGHT,
  /** The left gutter the grid's band label sits in. No column starts inside it. */
  bandGutter: 104,
  /**
   * HOW THICK A HAIRLINE IS DRAWN — the band's top border, the column header's
   * bottom border, and the lane's ruling, all one pixel.
   *
   * It is in `GEOMETRY` because the grid's symmetric spacing is defined around
   * it: `grid.rowGap` is `2 * stackGap + this` and `grid.bandPadding` pays for
   * the closing rule out of the band's own gap, so a rule drawn two pixels thick
   * would leave every card in the grid one pixel nearer the rule under it than
   * the rule over it.
   *
   * EVERY RULE ON THE CANVAS IS DRAWN AT THIS NUMBER and none of them at a
   * stylesheet's own hairline: the band and the column header set a border width
   * from `GEOMETRY.ruleThickness` where a Tailwind `border-t`/`border-b` would
   * have hardcoded 1px beside it, and the lane reads it off its own `LaneRun`,
   * which this file filled in from the same constant. `columnHeaderHeight` above
   * counts it too, because that block ends in one.
   */
  ruleThickness: RULE,
  /** G — the grid band's one symmetric gap. `grid.headerHeight` and `grid.bandPadding` derive from it. */
  bandGap: BAND_GAP,
} as const;

/**
 * The bands that have at least one type, in order. A band with no column is not
 * drawn. The roster is static, so this is settled once at module load rather than
 * recomputed per layout — and it is a `filter` over `BAND_ORDER`, never over an
 * unordered collection.
 */
const BANDS_PRESENT: readonly Band[] = BAND_ORDER.filter(
  (band) => typesInBand(band).length > 0,
);

/**
 * The band a roster row is drawn in.
 *
 * `bandOf` is the canon's one home for this mapping; it answers `null` only for a
 * type outside the roster, and `entry` came *from* the roster, so the fallback is
 * unreachable and exists to keep the function total rather than to decide
 * anything.
 */
function bandOfEntry(entry: NodeTypeEntry): Band {
  return bandOf(entry.name) ?? SATELLITE_BAND;
}

/**
 * HOW TALL A GRID BAND HOLDING `rows` STACKED CARDS IS, column header, ruling and
 * padding included — and it is the band's whole height, not a floor under some
 * share of the screen.
 *
 * There is no `MIN_BAND_HEIGHT` beside it any more and no canvas split above it.
 * A band is asked for `max(1, rows)` rows, so the least it is ever given is one
 * row — 40 + 51 + 12 = 103 — and an empty band is exactly as tall as a band
 * holding one card. That is the whole of the rule the deleted floor used to
 * state, minus the arithmetic that made it necessary.
 */
function bandHeightFor(rows: number): number {
  const { cardHeight, rowGap, headerHeight, bandPadding } = GEOMETRY.grid;
  return headerHeight + rows * (cardHeight + rowGap) + bandPadding;
}

/**
 * GRID VIEW — bands stacked top to bottom, type columns inside a band, nodes
 * id-ascending down a column until the band's stack cap, then sideways into the
 * next sub-column.
 *
 * THE COLUMN CURSOR IS THE WHOLE ALGORITHM. A type's x is not `index * pitch`,
 * which would assume every column is one card wide; it is a running cursor per
 * band, advanced by each type's own slot width. That is what makes the widening
 * work — a sixth Requirement doubles the Requirement slot and pushes
 * AcceptanceCriterion and everything right of it across by one pitch — and it is
 * BAND-LOCAL: widening Intent moves nothing in Domain, Plan or Execution, because
 * every band starts its own cursor at the same gutter.
 *
 * THE FILL IS COLUMN-MAJOR AND FILLS TO THE CAP. Six nodes at a cap of five are
 * 5 + 1, never 3 + 3: a stack you are reading does not re-balance under you when
 * you author into it.
 *
 * A BAND IS AS TALL AS ITS FULLEST COLUMN, and at least one row. Nothing here
 * reads a canvas, so the four bands are stacked at their own heights from y = 0
 * and the board is whatever that sums to — taller than the screen when the graph
 * is full, which the grid scrolls, and 412 tall when it is empty, which is four
 * bands of one row each.
 *
 * A TYPE WITH NO NODES KEEPS ITS COLUMN, ITS HEADER AND ITS LANE — `subcols` is at
 * least 1 at n = 0. An empty column means "this type has no nodes", which is a
 * fact worth drawing; the ruled lanes go over every column and never only over the
 * populated ones, or an absence stops being readable.
 */
export function gridLayout(nodes: readonly SpecNode[]): Layout {
  const {
    cardWidth,
    cardHeight,
    columnGap,
    rowGap,
    stackGap,
    headerHeight,
    topPadding,
  } = GEOMETRY.grid;
  const columnPitch = cardWidth + columnGap;
  const rowPitch = cardHeight + rowGap;

  const placements: Placement[] = [];
  const columns: ColumnHeader[] = [];
  const bands: BandHeader[] = [];
  const lanes: LaneRun[] = [];

  let y = topPadding;
  let widest = 0;

  for (const band of BANDS_PRESENT) {
    const cap = STACK_CAP[band];
    const slots: { type: string; x: number; subcols: number }[] = [];
    let cursor = GEOMETRY.bandGutter;
    let fullest = 0;

    for (const entry of typesInBand(band)) {
      const ofType = nodesOfType(nodes, entry.name);
      const subcols = Math.max(1, Math.ceil(ofType.length / cap));
      const slotWidth = subcols * cardWidth + (subcols - 1) * columnGap;

      // `y + bandGap`, not `y`: the label block gets the same clear space under
      // the band's own rule that the band's closing rule gets under it.
      // `ColumnHeader.y` is therefore the label's y and not the band's top.
      columns.push({
        type: entry.name,
        band,
        label: entry.name,
        count: ofType.length,
        x: cursor,
        y: y + GEOMETRY.bandGap,
        width: slotWidth,
      });
      slots.push({ type: entry.name, x: cursor, subcols });

      for (const [index, node] of ofType.entries()) {
        placements.push({
          id: node.id,
          type: entry.name,
          band,
          x: cursor + Math.floor(index / cap) * columnPitch,
          y: y + headerHeight + (index % cap) * rowPitch,
        });
      }

      fullest = Math.max(fullest, Math.min(cap, ofType.length));
      cursor += slotWidth + columnGap;
    }

    // ONE ROW FOR AN EMPTY BAND, and the fullest column's rows for any other.
    // `fullest` is already clamped to the cap by the loop above, so this can
    // never ask for a row past the cap — a card past it starts a sub-column.
    const rows = Math.max(1, fullest);
    const height = bandHeightFor(rows);
    // `width` is patched below, once every band has been measured and the board's
    // own width is known — a band's strip spans the whole board, gutter included.
    bands.push({ band, label: band, x: 0, y, width: 0, height });

    // Every lane in the band is ruled to the band's own row count, so a column
    // with nothing in it shows the same ruled cells as its busiest neighbour and
    // the band has no unruled strip under its last row.
    for (const slot of slots) {
      for (let sub = 0; sub < slot.subcols; sub += 1) {
        lanes.push({
          key: `${band}:${slot.type}:${String(sub)}`,
          band,
          type: slot.type,
          x: slot.x + sub * columnPitch,
          y: y + headerHeight,
          width: cardWidth,
          height: rows * rowPitch,
          rows,
          rowPitch,
          ruleOffset: cardHeight + stackGap,
          ruleThickness: GEOMETRY.ruleThickness,
        });
      }
    }

    y += height;
    widest = Math.max(widest, cursor);
  }

  for (const band of bands) {
    band.width = widest;
  }

  return { view: "grid", placements, columns, bands, lanes, width: widest, height: y };
}

/**
 * GRAPH VIEW — no bands. One type, one column, left to right across the whole
 * graph; id-ascending inside a column.
 *
 * The column order is still `columnsInOrder`, so Domain's types are leftmost. The
 * bands themselves are not drawn, and that is the whole difference between the two
 * views: the same ordering, one grouping fewer.
 *
 * NO STACK CAP AND NO RULED LANES HERE. Both belong to the grid — the cap is keyed
 * by band and this view draws no bands, and a lane is a picture of the fixed slots
 * a grid has and a free canvas does not. This view pans and zooms, so a long
 * column is scrolled to rather than folded sideways.
 *
 * IT KEEPS ITS TOP PADDING WHERE THE GRID DROPPED ITS OWN. The grid's board now
 * starts at its first band's rule; here the headers sit at y = 0 and the cards
 * hang `topPadding` below them, which is the clearance `openingViewport` anchors
 * against. The two views' paddings were one shared number and are now one each,
 * so the grid's zero cannot travel.
 */
export function graphLayout(nodes: readonly SpecNode[]): Layout {
  const {
    cardWidth,
    cardHeight,
    columnGap,
    rowGap,
    headerHeight,
    bandPadding,
    topPadding,
  } = GEOMETRY.graph;
  const placements: Placement[] = [];
  const columns: ColumnHeader[] = [];

  let widest = 0;
  let tallest = 0;

  for (const [index, entry] of columnsInOrder().entries()) {
    const x = index * (cardWidth + columnGap);
    const band = bandOfEntry(entry);
    const ofType = nodesOfType(nodes, entry.name);
    columns.push({
      type: entry.name,
      band,
      label: entry.name,
      count: ofType.length,
      x,
      // 0, not `topPadding` — see `ColumnHeader.y`. The cards below reserve the
      // padding; the header sits above it.
      y: 0,
      width: cardWidth,
    });

    for (const [row, node] of ofType.entries()) {
      placements.push({
        id: node.id,
        type: entry.name,
        band,
        x,
        y: topPadding + headerHeight + row * (cardHeight + rowGap),
      });
    }
    widest = Math.max(widest, x + cardWidth);
    tallest = Math.max(tallest, ofType.length);
  }

  return {
    view: "graph",
    placements,
    columns,
    bands: [],
    lanes: [],
    width: widest + columnGap,
    height:
      topPadding + headerHeight + tallest * (cardHeight + rowGap) + bandPadding,
  };
}

/**
 * WHICH TYPE'S SLOT A POINT IS IN — the layout read backwards, so that "create a
 * node here" can mean *here*: a right-click pre-selects the type of the column it
 * landed in.
 *
 * The point arrives in the canvas's own coordinates. This module knows nothing
 * about a viewport, a scroll offset or a zoom, so the caller converts.
 *
 * THE ORDER IS THE WHOLE TRICK: THE BAND BY y FIRST, THEN THE COLUMN BY x INSIDE
 * IT. The grid's column cursor restarts at the gutter in every band, so the same x
 * is a different type one band down — a rule that read x alone would answer the
 * wrong type in three bands out of four. The graph view has one row of columns and
 * no bands, so there x alone answers, at any y.
 *
 * A WIDENED COLUMN'S WHOLE SLOT MAPS TO ITS TYPE, because `ColumnHeader.width` is
 * the slot: a Requirement column grown to two sub-columns answers `Requirement`
 * across both.
 *
 * THE SLOT'S RIGHT EDGE IS OPEN. The interval is `[x, x + width)`, so the last
 * pixel of a slot is the slot and the first pixel past it is the gap between two
 * columns and belongs to no type.
 *
 * THE REGION IS THE BAND, NOT THE DRAWN LANE. A band is its rows plus its header
 * and its bottom padding, so between a band's closing rule and the next band's
 * top there is a strip with nothing drawn in it that is still inside the band,
 * and a click there answers that column's type. That is deliberate: the strip is
 * inside the type's own slot, and a node authored "here" does land in that
 * column.
 *
 * `null` MEANS NO PRE-SELECTION, and it is a decision rather than a gap. Over the
 * band gutter, past the last band, between two columns, or outside the board
 * entirely, the answer is null and the create form opens with no type chosen.
 * Snapping to the nearest column would make "here" mean somewhere the person did
 * not click, which is worse than meaning nothing.
 */
export function typeAtPoint(
  layout: Layout,
  point: { x: number; y: number },
): string | null {
  const withinX = (columns: readonly ColumnHeader[]): string | null =>
    columns.find(
      (column) => point.x >= column.x && point.x < column.x + column.width,
    )?.type ?? null;

  if (layout.view === "graph") return withinX(layout.columns);

  const band = layout.bands.find(
    (entry) => point.y >= entry.y && point.y < entry.y + entry.height,
  );
  if (band === undefined) return null;
  return withinX(layout.columns.filter((column) => column.band === band.band));
}
