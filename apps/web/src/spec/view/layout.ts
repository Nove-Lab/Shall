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
 * Both Spec-plane layouts, as pure functions of `(band, type ordinal, id)` — and,
 * for the grid, of the canvas height.
 *
 * POSITIONS ARE NEVER STORED AND CARDS ARE NEVER DRAGGABLE. A moved card would
 * show a position the graph does not hold, so there is nowhere to keep one. What
 * that buys is a picture you can reason about and test: the same graph on the
 * same canvas is the same picture, every time. No heuristic to tune, no seed, no
 * layout cache to invalidate, and nothing computed here that could be persisted
 * by accident.
 *
 * THE CANVAS HEIGHT IS AN ARGUMENT AND IT COSTS SOMETHING, so it is stated rather
 * than slipped in. The grid must fill the screen when it is empty, and "the
 * screen" is not a property of the graph. Two things it does not cost: the
 * positions are still deterministic and still unstored. One thing it does: they
 * are no longer stable under insertion — an eleventh Requirement shifts every
 * Intent column to its right by one pitch. That shift is the intended behaviour,
 * not a side effect.
 *
 * THERE IS NO CANVAS *WIDTH*. The board's width is set by its content alone: the
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
   * is `bandY + GEOMETRY.bandGap`, so the label has the same clear space above it
   * that the band's last row has below it. `BandHeader.y` is the band's top and
   * nothing else should be read as it.
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
 * `rows` is capped at the band's stack cap, because past the cap a type grows
 * sideways: a lane drawn below the cap line would be a slot no node can ever
 * occupy. Surplus band height becomes the band's bottom padding instead.
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
 * The three numbers `grid.headerHeight` is computed from, hoisted out of the
 * object below only because an object literal cannot reference its own siblings.
 * Their published home is still `GEOMETRY`; nothing outside this file reads these
 * names.
 */
const BAND_GAP = 16;
const GRID_ROW_GAP = 6;
const COLUMN_HEADER_HEIGHT = 21;

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
 * not carried over: the grid's row pitch is 50 (was 30 at a one-line card), a
 * full Domain stack is 203 tall (was 141 at that card and the 9px header this
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
 * A GRID BAND BREATHES THE SAME GAP TOP AND BOTTOM — call it G, `bandGap`, 16. The
 * two constants under it are derived from G rather than chosen beside it, because
 * the mistake this replaces was placing the column label at the band's own top:
 * the label then sat flush under the band's rule with nothing above it, while the
 * bottom carried `rowGap + bandPadding` of clear space. The label's height had
 * been counted as if it were padding.
 *
 * G is 16 because 16 is already the grid's breathing space in both other
 * directions — the lane between two columns (`grid.columnGap`) and the space above
 * the first band (`topPadding`). It is set *equal* to them and never computed
 * *from* `columnGap`, whose value is load-bearing for edge routing and has to stay
 * independently movable.
 *
 *     grid.headerHeight = ceil(G + columnHeaderHeight + rowGap)
 *                       = ceil(16 + 21 + 6) = 43
 *
 * taken to a whole pixel so that every card still lands on one. The `ceil` has
 * nothing to absorb at these three terms and is kept anyway: the header's height
 * is a line box, and a line box is a fraction the moment a font size or a line
 * height stops dividing evenly. With nothing to round away, the label-to-card
 * clearance is exactly `rowGap` — 6, and no longer the 6.5 the old fractional
 * header left. It is written as that expression and not as the literal 43, so
 * raising `columnHeaderHeight` moves the grid instead of leaving a hand-typed
 * number standing beside a paragraph that claims otherwise. None of its three
 * terms is the card height, so this number is unchanged by the two-line card —
 * recomputed, not copied.
 *
 *     grid.bandPadding  = G - rowGap = 10
 *
 * so the clear space under a band's last row is `rowGap + bandPadding` = G again.
 * It sits inside `grid` because every term of it is the grid's; the graph view
 * carries its own.
 *
 * WHERE THE SYMMETRY IS EXACT AND WHERE IT IS ONLY IMPROVED, because "16 in every
 * band" is a promise the arithmetic does not keep. The bottom gap is
 * `rowGap + bandPadding + r`, where `r` is what the lane count's floor division
 * leaves over of the band's share. Domain's height *is* its cap-row height, so
 * r = 0 and its two gaps are exactly 16 and 16; a flexible band whose share
 * exceeds its content keeps the surplus at the bottom.
 *
 * THE GRAPH VIEW'S `headerHeight: 30` IS NOT PART OF THAT DERIVATION. That view
 * spaces with its own gaps and draws no bands, and the symmetric-gap reasoning has
 * not been worked through for it. Its `bandPadding` is 10 as well, reached
 * independently: it is the clearance under the tallest column when the pannable
 * extent is computed, and deriving it from a grid constant would make the grid's
 * row gap a term in the graph's extent — a coupling neither view asked for.
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
    rowGap: GRID_ROW_GAP,
    headerHeight: Math.ceil(BAND_GAP + COLUMN_HEADER_HEIGHT + GRID_ROW_GAP),
    /** Space below a band's last row, before the next band's rule. See the derivation above. */
    bandPadding: BAND_GAP - GRID_ROW_GAP,
  },
  /**
   * The graph view's own gaps and its own bottom clearance. `headerHeight` and
   * `bandPadding` are literals on purpose — see the note above on why the grid's
   * derivation is not extended to a view that draws no bands.
   */
  graph: {
    cardWidth: 148,
    cardHeight: 44,
    columnGap: 40,
    rowGap: 18,
    headerHeight: 30,
    bandPadding: 10,
  },
  /**
   * The column header block's own height — label line, its padding and its rule.
   *
   * It is load-bearing twice: `grid.headerHeight` above is literally
   * `bandGap + this + rowGap`, so every card in the grid is placed by it, and the
   * header component is sized from it rather than being left to size itself. That
   * is the rule at the top of this object in its sharpest form — the drawn header
   * and the reserved header must be the one number.
   *
   * The 21 is what the header this repo draws actually occupies: a `text-xs`
   * label, which is a 12px font in a 16px line box, plus `pb-1` — 4px — plus the
   * 1px `border-b` under it.
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
  /** Space above the first band, and above the graph view's row of headers. */
  topPadding: 16,
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

/** How tall a grid band holding `rows` stacked cards is, column header and padding included. */
function bandHeightFor(rows: number): number {
  const { cardHeight, rowGap, headerHeight, bandPadding } = GEOMETRY.grid;
  return headerHeight + rows * (cardHeight + rowGap) + bandPadding;
}

/**
 * THE LEAST A BAND MAY BE GIVEN: its header, one row, and its bottom padding —
 * 43 + 50 + 10 = 103, and it is written as `bandHeightFor(1)` so that it stays
 * one row exactly when the card, the header or the padding moves.
 *
 * IT IS A DEVIATION FROM LEGACY, AND IT IS DELIBERATE. That board split the
 * canvas and let the flexible bands take whatever the split gave them, which on
 * a short canvas was less than one row: `gridLayout`'s lane count floors to 0,
 * and Intent, Plan and Execution drew as bare header strips over an empty board
 * while Domain — the band the split calls the smallest — took half the screen
 * for its two columns. The requirement is that an empty grid never looks
 * shrunken, so the floor wins and the board is allowed to exceed the canvas: the
 * grid then scrolls, and scrolling is honest where collapsing is not.
 *
 * WHAT IT COSTS, stated rather than hidden: below a canvas of 528 the four bands
 * no longer sum to the canvas height, so the board has a strip of its own below
 * the fold. Above 528 nothing here changes anything — every share is already
 * over the floor and the `max()` is the share.
 *
 * AND IT ONLY EVER REACHES AN EMPTY BAND, which is the narrowest way to say what
 * it does. `gridLayout` takes `max(bandHeightFor(fullest), share)`, and a band
 * holding even one node has a dense height of at least `bandHeightFor(1)` — this
 * same 103 — so it was already floored. The rule this adds is that a band with
 * nothing in it is given the row a band with one thing in it would have had.
 * Measured over both layouts, five node sets and twelve canvas heights: six
 * snapshot keys moved, all six the EMPTY grid under 528, and nothing in the graph
 * view, in any populated grid, or in `typeAtPoint`'s answers.
 */
const MIN_BAND_HEIGHT = bandHeightFor(1);

/**
 * HOW MUCH VERTICAL ROOM EACH BAND IS ALLOTTED — a function of the canvas height
 * alone, and never of what a sibling band contains.
 *
 * Domain is expected to be the smallest of the four and Intent, Plan and Execution
 * to hold about the same amount, so the screen is divided that way and the empty
 * grid fills it: Domain takes its own full-stack height — derived from the cap
 * table, so changing that cap moves this with it — and the other three split what
 * is left equally. The last of the three absorbs the rounding remainder, so on any
 * canvas tall enough to give each band a row the four fill it exactly instead of
 * leaving a sliver of page under the bottom one. On a canvas that is not, the
 * one-row floor below wins and the board overruns; see `MIN_BAND_HEIGHT`.
 *
 * THERE IS DELIBERATELY NO SECOND PASS. Redistributing share from siblings'
 * content — giving a full band more of the screen and a sparse one less — was
 * tried and rejected: authoring the seventh Intent node shrank Plan and Execution
 * and deleted drawn lanes in bands nothing had been authored into. With a plain
 * `max(dense, share)` per band, authoring in band b changes b's height and the y
 * of the bands below it, and nothing else at all.
 *
 * A CONSEQUENCE WORTH SAYING OUT LOUD: a band's dense height can never exceed its
 * own cap-row height, and Domain's share *is* its cap-row height — so the `max()`
 * always picks the share and the Domain band's HEIGHT is constant forever. Only
 * its WIDTH grows. That holds at any cap, not only at 3.
 *
 * NO BAND IS EVER GIVEN LESS THAN ONE ROW, and 528 is the canvas height at which
 * that promise starts costing something. Domain's share is fixed at
 * `bandHeightFor(STACK_CAP.Domain)` = 43 + 3 * 50 + 10 = 203 whatever the canvas
 * does, while a flexible band needs `MIN_BAND_HEIGHT` = 103 before `gridLayout`
 * can rule its first lane row. Three of those plus Domain plus `topPadding` is
 * 16 + 203 + 309 = 528. At or above that the split fills the canvas exactly and
 * the `max()` below never fires; under it every flexible band is lifted to 103
 * and the board overruns the canvas by the difference — 128px at a 400px canvas,
 * where the alternative was three header strips with no lanes under them and
 * Domain holding 50.8% of the board for its two columns.
 *
 * THAT NUMBER MOVES WITH THE CARD AND WITH THE HEADER. The same arithmetic at the
 * legacy one-line card and its 9px header (row pitch 30, Domain 141, one row 81)
 * put the threshold at 400, which is why the board this ports from could leave
 * the floor out and still rule a row on every screen anyone tried. The two-line
 * card raised it by 120px and the header this repo actually draws by a further 8,
 * so the case that was theoretical there is the common one here — a 500px canvas
 * is an ordinary window with a panel open.
 */
function bandShares(
  present: readonly Band[],
  canvasHeight: number,
): Readonly<Record<Band, number>> {
  const domain = bandHeightFor(STACK_CAP.Domain);
  const flexible = present.filter((band) => band !== "Domain");
  const remaining = Math.max(
    0,
    canvasHeight -
      GEOMETRY.topPadding -
      (present.includes("Domain") ? domain : 0),
  );
  const each = flexible.length === 0 ? 0 : Math.floor(remaining / flexible.length);

  // The `max()` is the one-row floor, applied to every band and not only to the
  // flexible three: Domain's own share is `bandHeightFor(STACK_CAP.Domain)` and
  // therefore already over it at any cap above zero, so this changes nothing
  // there and makes the floor a property of the function rather than of three of
  // its four answers.
  const shares: Record<Band, number> = {
    Domain: Math.max(MIN_BAND_HEIGHT, domain),
    Intent: 0,
    Plan: 0,
    Execution: 0,
  };
  for (const [index, band] of flexible.entries()) {
    const share = index === flexible.length - 1 ? remaining - each * index : each;
    shares[band] = Math.max(MIN_BAND_HEIGHT, share);
  }
  return shares;
}

/**
 * GRID VIEW — bands stacked top to bottom, type columns inside a band, nodes
 * id-ascending down a column until the band's stack cap, then sideways into the
 * next sub-column.
 *
 * THE COLUMN CURSOR IS THE WHOLE ALGORITHM. A type's x is not `index * pitch`,
 * which would assume every column is one card wide; it is a running cursor per
 * band, advanced by each type's own slot width. That is what makes the widening
 * work — an eleventh Requirement doubles the Requirement slot and pushes
 * AcceptanceCriterion and everything right of it across by one pitch — and it is
 * BAND-LOCAL: widening Intent moves nothing in Domain, Plan or Execution, because
 * every band starts its own cursor at the same gutter.
 *
 * THE FILL IS COLUMN-MAJOR AND FILLS TO THE CAP. Eleven nodes at a cap of ten are
 * 10 + 1, never 6 + 5: a stack you are reading does not re-balance under you when
 * you author into it.
 *
 * A TYPE WITH NO NODES KEEPS ITS COLUMN, ITS HEADER AND ITS LANE — `subcols` is at
 * least 1 at n = 0. An empty column means "this type has no nodes", which is a
 * fact worth drawing; the ruled lanes go over every column and never only over the
 * populated ones, or an absence stops being readable.
 */
export function gridLayout(
  nodes: readonly SpecNode[],
  canvasHeight: number,
): Layout {
  const { cardWidth, cardHeight, columnGap, rowGap, headerHeight, bandPadding } =
    GEOMETRY.grid;
  const columnPitch = cardWidth + columnGap;
  const rowPitch = cardHeight + rowGap;

  const placements: Placement[] = [];
  const columns: ColumnHeader[] = [];
  const bands: BandHeader[] = [];
  const lanes: LaneRun[] = [];

  const shares = bandShares(BANDS_PRESENT, canvasHeight);

  let y = GEOMETRY.topPadding;
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

      // `y + bandGap`, not `y`: the label block gets the same clear space above it
      // that the band's last row gets below it. `ColumnHeader.y` is therefore the
      // label's y and not the band's top.
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

    const height = Math.max(bandHeightFor(fullest), shares[band]);
    // `width` is patched below, once every band has been measured and the board's
    // own width is known — a band's strip spans the whole board, gutter included.
    bands.push({ band, label: band, x: 0, y, width: 0, height });

    // The lanes fill the band's own height and stop at the cap: below it a drawn
    // row would be a slot no node could reach, because the next node past the cap
    // starts a sub-column instead.
    const laneRows = Math.min(
      cap,
      Math.max(0, Math.floor((height - headerHeight - bandPadding) / rowPitch)),
    );
    for (const slot of slots) {
      for (let sub = 0; sub < slot.subcols; sub += 1) {
        lanes.push({
          key: `${band}:${slot.type}:${String(sub)}`,
          band,
          type: slot.type,
          x: slot.x + sub * columnPitch,
          y: y + headerHeight,
          width: cardWidth,
          height: laneRows * rowPitch,
          rows: laneRows,
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
 */
export function graphLayout(nodes: readonly SpecNode[]): Layout {
  const { cardWidth, cardHeight, columnGap, rowGap, headerHeight, bandPadding } =
    GEOMETRY.graph;
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
        y: GEOMETRY.topPadding + headerHeight + row * (cardHeight + rowGap),
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
      GEOMETRY.topPadding +
      headerHeight +
      tallest * (cardHeight + rowGap) +
      bandPadding,
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
 * THE REGION IS THE BAND, NOT THE DRAWN LANE. A band keeps its share of the canvas
 * whether or not it has rows to fill it — the lanes stop at the stack cap and the
 * surplus becomes bottom padding — so under a column's last ruled row there is a
 * strip with nothing drawn in it that is still inside the band, and a click there
 * answers that column's type. That is deliberate: the strip is inside the type's
 * own slot, and a node authored "here" does land in that column.
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
