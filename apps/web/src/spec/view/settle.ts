import type { Incidence } from "./edges";

/**
 * WHERE A CARD SETTLES ONCE IT IS ALLOWED TO SEE ITS RELATIONS — the graph
 * view's placement, one arithmetic step past the stack.
 *
 * `graphLayout` fills each type's column from the top at a fixed pitch in
 * byte-order id, and that order knows nothing about the relations: a Task and
 * the Requirement it implements each sit wherever their own column's ordering
 * put them. WHAT THIS STEP REDUCES IS THE VERTICAL DISTANCE BETWEEN THE TWO
 * ENDS OF A RELATION, and that is the claim worth making because it is the one
 * the arithmetic below actually minimises: over the 40-board corpus
 * `edge-routing.test.ts` builds, 3968 relations at a mean of 191.8px between
 * their two cards stacked and 141.3px settled, a quarter closer.
 *
 * WHAT THAT BUYS IS SHORTER LINES, AND WHAT IT COSTS IS CROSSINGS — one
 * sentence for the two, because the trade was accepted with both halves of it
 * in front of us. The routes the router draws do get shorter: a mean of 1198.7
 * stacked against 1144.8 settled, a median 6.2% shorter, and the longest line
 * on any board 8270 down to 5950 — better than a quarter off the worst case,
 * which is the line a reader has to follow furthest. Detours fall 3363 to
 * 3225, and labels do not move either way, 86 relations offering no horizontal
 * run to write a name on before and after. AGAINST THAT, relations cross one
 * another 12934 times over the stacked corpus and 13885 over the settled one,
 * seven per cent the wrong way. One shape of board pays it: a hub, where
 * everything points at one sink, has the cards that point there pulled onto
 * that sink's rows and crossing among themselves (+25.0%), while a chain
 * improves 21.4% and 24 boards of the 40 improve at all. Every number here is
 * `edge-routing.test.ts`'s, printed as a table on every run of it.
 *
 * IT IS SOLVED AND NOT NUDGED, which is why it is worth a file of its own
 * rather than a pass of tweaks. Minimise
 *
 *     Sum over neighbour pairs (u,v) in DIFFERENT columns of (y_u - y_v)^2
 *   + HOME * Sum over cards of (y_i - stacked_i)^2
 *
 * subject to `y_next - y_i >= pitch` inside every column and `top <= y <=
 * bottom` everywhere. A relation is a spring that pulls its two cards level;
 * the second sum is a much weaker spring from every card to where the stack put
 * it. Each column is solved EXACTLY against the others where they stand — and
 * then rounded onto the lattice, so what comes out is the fixed point of a
 * rounded descent and not the minimum itself. Do not call it the minimum.
 *
 * EVERY CARD KEEPS A y OF THE FORM `top + k*pitch` — the lattice the stack
 * already puts them on — AND THAT IS A CONSTRAINT ON THIS STEP RATHER THAN AN
 * ARTEFACT OF IT. The router finds a horizontal channel by merging every card's
 * y-span and taking the gaps that are left. Cards on one lattice leave a gap at
 * every lattice boundary, the same gaps the board has today, so a relation that
 * routes around a card today still routes around it once this step has run. Let
 * a card sit on any whole pixel instead and the columns stagger, the merged
 * spans close over those gaps, and a relation with no channel left is drawn as
 * a straight line through whatever is in the way. THIS WAS MEASURED AND NOT
 * REASONED, THOUGH NOT ON CODE IN THIS TREE: a variant of this file that let a
 * card stop on any whole pixel was routed over the same corpus and 78 of its
 * 3968 relations ended as that straight line, running through 302 cards between
 * them. That variant was discarded and cannot be re-run from here, which is why
 * the count is written down in exactly this one place — beside the constraint
 * it is the reason for, and nowhere else, since nothing can check it. The pull
 * toward a neighbour survives it, quantised to a row.
 *
 * WHAT THE BOARD MAY NOT LOSE, SAID ONCE — `layout.ts` points at this list
 * rather than keeping a copy of it, because a second copy is a copy that
 * drifts. Nothing below checks any of it afterwards, because each of them is a
 * property of the arithmetic rather than a test it passes:
 *
 *   - a card never passes the card above it: that is `>= pitch`, which is an
 *     ORDER constraint before it is a spacing one, and order here is the
 *     column's byte-order id;
 *   - two cards are never closer than the stack had them: the same `>= pitch`,
 *     because the number handed in is the stack's own pitch;
 *   - every card stays on the board: the box, which is the first row to the
 *     fullest column's last;
 *   - every card stays on the row lattice: the write-back rounds to a whole
 *     number of pitches, which is the paragraph above;
 *   - the column with the most nodes keeps exactly the placement it has today:
 *     no rule of its own — it is the column with no slack, see `settleOne`.
 *
 * Pure: no React, no `@xyflow/react`, no DOM, no clock, no randomness. Sums are
 * accumulated in the order the columns and the edge array arrived in, so the
 * same board settles to the same doubles on every machine and every run.
 */

/**
 * A card as this module needs it: an id, and the y the stack gave it.
 *
 * Declared structurally rather than as `Placement` — the move `Incidence` makes
 * for a relation — because nothing here wants a type, a band or an x, and
 * because the layout that will call this must not be imported back by it.
 */
export type StackedCard = {
  readonly id: string;
  readonly y: number;
};

/** One column, top to bottom in the order the stack filled it. */
export type StackedColumn = readonly StackedCard[];

/**
 * WHAT A CARD'S OWN STACKED PLACE IS WORTH AGAINST ONE RELATION — the whole of
 * the anchoring term, and the reason the objective has a minimum at all.
 *
 * IT DECIDES A CARD NOTHING POINTS AT, and it has a say in one the relations
 * leave slack. A card with no relation is held at home, because that term is
 * then the only one acting on it; take the term away and a column of unrelated
 * cards may sit anywhere the constraints allow, and the minimum stops being
 * unique.
 *
 * WHY IT IS THREE TENTHS AND NOT A HUNDREDTH. It was a hundredth while home
 * meant the top of the column, where the only job it had was to break a tie —
 * any weaker and the answer was not unique, any stronger and it dragged the
 * board upward. Home is the middle of the board now, and the middle is
 * something worth a vote rather than something to be overruled: a column the
 * relations pin loosely should drift toward the centre rather than toward
 * whichever end it started at. Measured over a real 66-node project, three
 * tenths puts a four-card Goal column at rows 7..10 of twenty where a hundredth
 * left it at 2..5 — and the mean distance between the two ends of a relation
 * came DOWN, 2.00 rows to 1.85, so the centre is not being bought at the
 * relations' expense. Past one it stops paying: a whole vote gives 1.91 and
 * three gives 1.94, the middle winning arguments it should be losing.
 *
 * IT IS NOT INVISIBLE IN THE ANSWER. The rounding is what shows it: two
 * placements within half a row of each other are decided by this weight and the
 * loser then moves a whole row. Moving it is a change to the board rather than
 * a dial being turned, and what bounds it is the paragraph above.
 */
const HOME = 0.3;

/**
 * SWEEP UNTIL NO CARD CHANGES ROW. THIS IS THE CAP ON THAT, AND NOT A QUALITY
 * KNOB. On the lattice a sweep either moves some card by whole rows or changes
 * nothing whatever, so "nothing moved" is a real fixed point and not a decimal
 * one: solving every column again against a board that did not move reproduces
 * that board, in either sweep direction, for ever. The loop stops there, and
 * the cap is what it is stopped BY only when it does not.
 *
 * WHAT THE CAP IS FOR IS THE ONE THING THE ROUNDING MAKES POSSIBLE — two
 * pictures of equal standing that each round into the other, a cycle no amount
 * of sweeping settles. No board of the corpus is one: all forty reach a fixed
 * point, twenty-nine of them inside eight sweeps and the slowest at sixty-four.
 * A HUNDRED IS THAT WITH ROOM. The number that READS like enough is not enough:
 * capped at four, twenty-six of the forty boards are still moving when the loop
 * stops and twenty-one come back a different picture from the one they settle
 * to.
 */
const SWEEP_CAP = 100;

/**
 * One card while it is being solved: its home, where it is now, which column it
 * is in, and the cards it is related to AS OBJECTS. The neighbour list holds
 * cells and not ids so that a solve reads `other.y` directly — there is no
 * lookup inside the sweeps, and no id can be read whose card was never placed.
 */
type Cell = {
  readonly id: string;
  readonly home: number;
  readonly column: number;
  readonly neighbours: Cell[];
  y: number;
};

/**
 * A run of adjacent rows that pool-adjacent-violators has decided share one z:
 * the sums that define their common value, and how many rows are in it.
 */
type Block = {
  readonly weight: number;
  readonly moment: number;
  readonly value: number;
  readonly rows: number;
};

/**
 * The settled y of every card handed in, by id — including the cards that did
 * not move, so a caller reads one map and never asks whether an id is in it.
 *
 * THE ONE THING THIS ASSUMES ABOUT ITS INPUT: the `y`s are the stack's, so
 * every column starts at the same first row and steps by exactly `pitch`. That
 * assumption is what the lattice this writes back onto IS — take it away and
 * the answer is still on a lattice, just not on the one the cards arrived on.
 *
 * THE BOARD IS READ OFF THE INPUT RATHER THAN PASSED IN. The first row's y is
 * the smallest `y` handed in, and the board is as many rows as the fullest
 * column has cards, so the last row is `top + (rows - 1) * pitch` — which under
 * the assumption above is the largest `y` handed in. That is the box said in
 * the input's own terms rather than recomputed from geometry this file would
 * then have to be kept in step with.
 *
 * THE FULLEST COLUMN NEEDS NO SPECIAL CASE, and that is what pinning it to the
 * placement it has today rests on. A column of n cards may be pushed down at
 * most `rows - n` whole rows, or its last card leaves the board; for the
 * fullest column that number is zero, so every one of its cards stays on the
 * row the stack gave it, to the pixel. Two columns tied for fullest are both
 * pinned, for the one reason.
 *
 * SO A BOARD WHOSE POPULATED COLUMNS ARE ALL THE SAME HEIGHT CANNOT MOVE AT
 * ALL: each of them is a fullest column, each has nought rows of slack, and the
 * step returns the stack it was handed however the relations run. That is not a
 * fault to go looking for — it is a board with no room in it.
 *
 * A YOUNG GRAPH IS NEARLY THAT BOARD, which is worth knowing before wondering
 * why nothing moved. Twenty-nine nodes over twenty columns — measured on a real
 * project — leave a fullest column of three and two rows of slack for
 * everything else, and every relation already within a fraction of a row of
 * level: the step ran and moved not one card. What it is for arrives later,
 * when one type outgrows the rest and its column is the only tall thing on the
 * board.
 *
 * A COLUMN WHOSE CARDS HAVE NO CROSS-COLUMN RELATIONS COMES BACK EXACTLY
 * STACKED — but only because the stack's pitch IS the pitch handed in. Its
 * cards are pulled to their own homes by `HOME` alone, those homes are already
 * a pitch apart, so the order constraint never binds and nothing moves. The
 * day those two numbers stop being one number, this sentence is false.
 *
 * AN EDGE NAMING AN ID WITH NO CARD IS SKIPPED, the way `edges.ts` skips one
 * rather than routing it from nowhere. A RELATION BETWEEN TWO CARDS OF ONE
 * COLUMN IS SKIPPED TOO, and that is a correctness precondition rather than a
 * preference: the column solve below is exact only because no term of the
 * objective couples two variables of the same column. A relation from a card
 * to itself falls out here as well, having both its ends in one column.
 *
 * TWO RELATIONS BETWEEN THE SAME PAIR ARE ONE NEIGHBOUR, which is the rule
 * `highlightFor` already states for the same pair of ids, and its reason there
 * is the reason here — see `view/highlight.ts`. Two springs between one pair
 * would pull twice as hard as a graph that said the same thing once.
 */
export function settleColumns(
  columns: readonly StackedColumn[],
  edges: readonly Pick<Incidence, "fromId" | "toId">[],
  pitch: number,
): Map<string, number> {
  const grid: Cell[][] = [];
  const byId = new Map<string, Cell>();
  let top = Number.POSITIVE_INFINITY;
  let rows = 0;

  for (const column of columns) {
    const cells: Cell[] = [];
    for (const card of column) {
      const cell: Cell = {
        id: card.id,
        // Filled in below: a home cannot be known until the board's own height
        // is, and that is the tallest column, which may be the last one read.
        home: card.y,
        column: grid.length,
        neighbours: [],
        y: card.y,
      };
      cells.push(cell);
      byId.set(card.id, cell);
      if (card.y < top) top = card.y;
    }
    if (cells.length > rows) rows = cells.length;
    grid.push(cells);
  }

  // A CARD NOTHING PULLS ON BELONGS IN THE MIDDLE, NOT AT THE TOP. The stack
  // begins at the first row because a stack has to begin somewhere, and that is
  // a fact about stacking rather than about the graph: nothing says a column of
  // four goals prefers the top of a board twenty rows tall. Reading the stack as
  // the home said exactly that, and it showed — every column the relations left
  // any slack in drifted upward, and the whole intent chain crowded into the top
  // third of a board whose bottom half held two columns.
  //
  // So home is the column standing in the MIDDLE of the board. It is the same
  // arithmetic with a different constant, and it is better on both counts:
  // measured over a real 66-node project, the columns spread across the board
  // instead of hugging its top, AND the mean distance between the two ends of a
  // relation FELL, from 2.00 rows to 1.85. A weak preference for the middle
  // turns out to leave the relations more room than a weak preference for the
  // top, which in hindsight is what "the middle" means.
  for (const column of grid) {
    const centre = top + Math.floor((rows - column.length) / 2) * pitch;
    for (const [row, cell] of column.entries()) {
      (cell as { home: number }).home = centre + row * pitch;
    }
  }

  for (const edge of edges) {
    const from = byId.get(edge.fromId);
    const to = byId.get(edge.toId);
    if (from === undefined || to === undefined) continue;
    if (from.column === to.column) continue;
    if (from.neighbours.includes(to)) continue;
    from.neighbours.push(to);
    to.neighbours.push(from);
  }

  // BLOCK COORDINATE DESCENT: one column at a time, each against the others
  // where they now stand, so a column solved earlier in a sweep is already
  // pulling on the next one. The alternation is why the sweeps are worth
  // running in pairs — a rightward pass carries what the leftmost column
  // learned across the board, and the leftward pass carries the answer back.
  // The `moved` flag is the stopping rule and `SWEEP_CAP` only the guard behind
  // it; it is read off the columns themselves rather than off a tolerance,
  // because on the lattice there is nothing in between moving and not.
  const rightToLeft = [...grid].reverse();
  for (let sweep = 0; sweep < SWEEP_CAP; sweep += 1) {
    let moved = false;
    for (const column of sweep % 2 === 0 ? grid : rightToLeft) {
      if (settleOne(column, pitch, top, rows)) moved = true;
    }
    if (!moved) break;
  }

  return new Map(grid.flat().map((cell) => [cell.id, cell.y]));
}

/**
 * ONE COLUMN, SOLVED EXACTLY AND THEN PUT BACK ON THE LATTICE — the piece that
 * makes the sweeps above a descent rather than a guess, and the rounding that
 * costs the descent its last half-row.
 *
 * IT SEPARATES, and that is the precondition the adjacency build protects. No
 * term of the objective couples two cards of the same column, so with every
 * other column held still this column's share of it is
 *
 *     Sum over rows of w_i * (y_i - d_i)^2 ,
 *     w_i = degree_i + HOME ,
 *     d_i = (Sum of the neighbours' y + HOME * stacked_i) / w_i ,
 *
 * a weighted pull of each row toward one number of its own, with only the
 * constraints joining the rows.
 *
 * SUBSTITUTE `z_i = y_i - row*pitch` IN THE VARIABLE AND `t_i = d_i -
 * row*pitch` IN THE TARGET. The constraint `y_next - y_i >= pitch` becomes `z`
 * NON-DECREASING, the objective is unchanged term by term, and what is left is
 * a weighted isotonic regression of `t` under `w` — pool adjacent violators,
 * linear in the rows, exact.
 *
 * THE BOX IS PER-INDEX IN z AND DECREASING — row `i` may only reach `bottom -
 * i*pitch` — BUT BECAUSE z IS NON-DECREASING IT IS EQUIVALENT TO THE SINGLE
 * COMMON BOX `[top, bottom - (n-1)*pitch]`: the last row's ceiling is the
 * tightest, and a monotone z that clears it clears every looser one above.
 * AND WITH A CONSTANT BOX, THE BOUNDED ISOTONIC SOLUTION IS EXACTLY THE CLAMP
 * OF THE UNBOUNDED ONE. So: pool, round, clamp. A reader who "improves" the
 * common bound into per-index ones breaks two things at once — the exactness
 * that sentence rests on, and the strict increase below, because a per-index
 * `min` can land two rows of one column on the same last row of the board.
 *
 * ROUND TO A WHOLE NUMBER OF PITCHES AND NOT TO A WHOLE PIXEL. `k =
 * round((z - top)/pitch)` and the row is written back at `top + (k + row) *
 * pitch`, so every card lands on the lattice the stack put it on — which is the
 * constraint the module header measures the price of losing. Order and spacing
 * survive that as arithmetic rather than as luck: `Math.round` is monotone, so
 * a non-decreasing z gives a non-decreasing k, `k + row` is therefore strictly
 * increasing, and the gap between two rows is a whole pitch or more. THE BOX
 * DOES NOT SURVIVE IT — rounding can carry a z that was inside the box out of
 * it by half a pitch — so the clamp is applied to `k` AFTERWARDS, in rows,
 * where it is one `min` and one `max` and is exact whether or not the pitch is
 * a whole number of pixels.
 *
 * A CARD STILL LANDS ON A WHOLE PIXEL, and by inheritance rather than by a rule
 * here: `top + (k + row) * pitch` is whole whenever the first row and the pitch
 * handed in are, which `layout.ts` sees to where it would rather round the
 * grid's own pitch up than let a half-pixel gap put a card on a fraction. This
 * step adds no fraction to a stack that had none.
 */
function settleOne(
  column: readonly Cell[],
  pitch: number,
  top: number,
  boardRows: number,
): boolean {
  // Also the guard that keeps an empty BOARD arithmetic-free: `top` is infinite
  // when no card was handed in, and every column is then this one.
  if (column.length === 0) return false;

  const blocks: Block[] = [];
  for (const [row, cell] of column.entries()) {
    let pull = HOME * cell.home;
    for (const other of cell.neighbours) pull += other.y;
    const weight = cell.neighbours.length + HOME;
    const target = pull / weight - row * pitch;

    blocks.push({ weight, moment: weight * target, value: target, rows: 1 });
    while (blocks.length > 1) {
      const lower = blocks[blocks.length - 1] as Block;
      const upper = blocks[blocks.length - 2] as Block;
      if (upper.value <= lower.value) break;
      blocks.pop();
      blocks.pop();
      const weightSum = upper.weight + lower.weight;
      const momentSum = upper.moment + lower.moment;
      blocks.push({
        weight: weightSum,
        moment: momentSum,
        value: momentSum / weightSum,
        rows: upper.rows + lower.rows,
      });
    }
  }

  // The whole rows this column has to give: the board's row count less its own,
  // which is the common ceiling of the paragraph above said in rows. Nought for
  // the fullest column, and that is the entirety of pinning it.
  const slack = boardRows - column.length;
  let moved = false;
  let row = 0;
  for (const block of blocks) {
    const k = Math.min(
      Math.max(Math.round((block.value - top) / pitch), 0),
      slack,
    );
    for (let taken = 0; taken < block.rows; taken += 1) {
      const cell = column[row] as Cell;
      const y = top + (k + row) * pitch;
      if (cell.y !== y) {
        cell.y = y;
        moved = true;
      }
      row += 1;
    }
  }
  return moved;
}
