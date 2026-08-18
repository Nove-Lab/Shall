import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EDGE_GRAMMAR,
  NODE_TYPES,
  isPermittedTriple,
} from "@shall/core/graph";
import type { CardBox, Point } from "./edge-geometry";
import { routedEdges, type RoutableCard } from "./edges";
import { stepPath } from "./edge-routing";
import { GEOMETRY, graphLayout, gridLayout, type Layout } from "./layout";
import type { SpecEdge, SpecNode } from "./model";

/**
 * THE WITNESS THAT THE SETTLE STEP DID NOT BREAK ROUTING, AND THE LEDGER OF
 * WHAT IT BOUGHT — a corpus of boards the canon would accept, laid out three
 * ways and routed, checked for the defect the router exists to remove and then
 * measured stacked against settled.
 *
 * IT IS A CORPUS AND NOT A WORKED EXAMPLE, and that is the point. The claim
 * under test is about the SHAPE of a board — "no lane survives the merge here",
 * "this endpoint can only be reached from a side that is walled off" — and a
 * hand-built fixture can only ever contain the shapes whoever built it thought
 * of. Forty boards of twenty to a hundred and fifty nodes, at three densities,
 * contain the ones nobody thought of.
 *
 * NO CASE ASSERTS A COORDINATE, AND THE NUMBERS ARE PRINTED RATHER THAN
 * BOUNDED. Each case is a property that has to hold of any answer; the
 * measurements the round was run to get — length, crossings, labels, how far a
 * card moved — are written out by the last case as a table, because a bound on
 * a measurement is a number somebody would have had to invent, and the only
 * honest thing to do with a measurement is read it. The one measurement that IS
 * asserted is the one the settle step exists to make, and it says so where it
 * is made.
 *
 * THE RANDOMNESS IS THE TEST'S AND NEVER THE MODULES', which is why the
 * generator is written out here rather than reached for from a package. Every
 * module it drives promises a byte-identical picture on the same input, so the
 * input has to be the same on every machine and every run: `random` below is a
 * seeded integer generator, the seed is the board's own index, and the whole
 * corpus is therefore a constant that happens to be computed.
 *
 * THE CANON DECIDES WHAT A BOARD MAY CONTAIN. Types come from `NODE_TYPES` and
 * relations from `EDGE_GRAMMAR`, both read straight from `@shall/core/graph`
 * rather than through `view/model`'s re-export: the corpus is standing in for a
 * project, not for a view, and a board holding a relation the daemon would
 * refuse would be testing the router against a picture it will never be handed.
 */

/**
 * A seeded generator — `mulberry32`, which is thirty-two bits of state and four
 * mixing steps. It is here because a corpus needs an arbitrary spread and not
 * because anything about it is subtle; the one property being used is that the
 * same seed gives the same sequence on every engine, which integer arithmetic
 * through `Math.imul` and `>>>` guarantees and `Math.random` cannot.
 */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let word = state;
    word = Math.imul(word ^ (word >>> 15), word | 1);
    word ^= word + Math.imul(word ^ (word >>> 7), word | 61);
    return ((word ^ (word >>> 14)) >>> 0) / 4294967296;
  };
}

/** One of `list`. The cast is the empty case, which no caller reaches. */
function pick<T>(rand: () => number, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)] as T;
}

/**
 * THE THREE SHAPES A REAL PROJECT COMES IN, because one density would only ever
 * exercise one half of the router.
 *
 *   - `chain` is the sparsely related board: most cards have one relation or
 *     none, so most routes are clear and the few that are not are long.
 *   - `hub` is the board with a sink in it — half the relations of a type point
 *     at that type's first node, which is what a Term everything MENTIONS or a
 *     Requirement everything DEPENDS_ON actually looks like. It is the densest
 *     of the three and it is where the router is asked the hardest questions.
 *   - `board` is the lopsided one: three nodes in five are of a single type, so
 *     one column runs the height of the canvas while its neighbours hold two
 *     cards each. That is the board the settle step changes most.
 */
const SHAPES = ["chain", "hub", "board"] as const;
type Shape = (typeof SHAPES)[number];

/** Relations per node, by shape. */
const DENSITY: Readonly<Record<Shape, number>> = {
  chain: 0.6,
  hub: 1.6,
  board: 1.1,
};

/** How many boards the corpus holds, and how big one may be. */
const BOARDS = 40;
const SMALLEST = 20;
const LARGEST = 150;

type Fixture = {
  readonly name: string;
  readonly shape: Shape;
  readonly nodes: readonly SpecNode[];
  readonly edges: readonly SpecEdge[];
};

/**
 * One board, from its index alone.
 *
 * THE IDS ARE THE CANON'S OWN — a type's prefix and a number, which is what
 * `formatNodeId` writes — because the column order inside a type is the byte
 * order of its ids and a corpus with ids of another shape would be laying its
 * columns out in an order no project produces.
 *
 * THE RELATIONS ARE DRAWN FROM `EDGE_GRAMMAR` AND NOT FROM A PAIR OF CARDS.
 * Picking two nodes and asking whether the canon joins them would spend most of
 * its attempts on a refusal and would skew the corpus toward whichever types
 * happen to be joined most ways; picking a permitted ROW first and then a node
 * at each end gives every allowed relation a turn. A row whose types are both
 * populated is the only kind the filter keeps, so no attempt is wasted.
 *
 * A NODE POINTING AT ITSELF IS SKIPPED. The daemon refuses one, so a board
 * holding one is not a board this router will ever be handed — and it is the
 * one case that is not routed at all but arched (`selfLoopPath`).
 */
function boardAt(index: number): Fixture {
  const rand = random(0x5a11 ^ Math.imul(index + 1, 0x9e3779b1));
  const shape = SHAPES[index % SHAPES.length] as Shape;
  const size = SMALLEST + Math.floor(rand() * (LARGEST - SMALLEST + 1));
  const dominant = pick(rand, NODE_TYPES);

  const counted = new Map<string, number>();
  const byType = new Map<string, SpecNode[]>();
  const nodes: SpecNode[] = [];
  for (let made = 0; made < size; made += 1) {
    const entry =
      shape === "board" && rand() < 0.6 ? dominant : pick(rand, NODE_TYPES);
    const seq = (counted.get(entry.name) ?? 0) + 1;
    counted.set(entry.name, seq);
    const id = `${entry.prefix}-${String(seq).padStart(4, "0")}`;
    const node: SpecNode = {
      id,
      type: entry.name,
      shortName: id,
      name: id,
      body: "",
      createdAt: 0,
      updatedAt: 0,
    };
    nodes.push(node);
    const column = byType.get(entry.name);
    if (column === undefined) byType.set(entry.name, [node]);
    else column.push(node);
  }

  const rows = EDGE_GRAMMAR.filter(
    (row) => byType.has(row.fromType) && byType.has(row.toType),
  );
  const edges: SpecEdge[] = [];
  const seen = new Set<string>();
  const wanted = Math.round(size * DENSITY[shape]);
  // The attempt cap is what stops a board whose every permitted pair is already
  // drawn from spinning; it is generous enough that no board reaches it with
  // relations left to draw.
  for (
    let attempt = 0;
    rows.length > 0 && edges.length < wanted && attempt < wanted * 6;
    attempt += 1
  ) {
    const row = pick(rand, rows);
    const sources = byType.get(row.fromType) ?? [];
    const targets = byType.get(row.toType) ?? [];
    const from = pick(rand, sources);
    const to =
      shape === "hub" && rand() < 0.5
        ? (targets[0] as SpecNode)
        : pick(rand, targets);
    if (from.id === to.id) continue;
    const id = `${from.id} ${row.edgeType} ${to.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ id, type: row.edgeType, fromId: from.id, toId: to.id });
  }

  return { name: `${shape}-${String(size)}`, shape, nodes, edges };
}

const CORPUS: readonly Fixture[] = Array.from({ length: BOARDS }, (_, index) =>
  boardAt(index),
);

/**
 * THE ROW LATTICE, IN THE TWO NUMBERS THE PROMISE WAS MADE IN.
 *
 * They are read out of `GEOMETRY.graph` rather than typed in, so a view that
 * respaces its rows respaces this file with it — and the case below pins them
 * to 46 and 62 in one line, so that the sentence a person reads about the
 * lattice and the arithmetic a machine runs over it cannot part company.
 */
const LATTICE_TOP = GEOMETRY.graph.topPadding + GEOMETRY.graph.headerHeight;
const LATTICE_PITCH = GEOMETRY.graph.cardHeight + GEOMETRY.graph.rowGap;

/** A layout's cards as `routedEdges` wants them. */
function cardsOf(layout: Layout): RoutableCard[] {
  return layout.placements.map((card) => ({
    id: card.id,
    band: card.band,
    x: card.x,
    y: card.y,
  }));
}

/**
 * DOES THIS SEGMENT ENTER THIS CARD — the check written here rather than taken
 * from the router, because a router graded by its own collision test is graded
 * by the half of itself most likely to be wrong.
 *
 * IT IS ALLOWED TO BE SIMPLER THAN THE ROUTER'S, and a case below pays for it:
 * every segment of a routed path is axis-aligned, which that case asserts
 * outright, so a segment IS its own bounding box — a span in one axis and a
 * point in the other. Two boxes overlap in the open when they overlap in both
 * axes by more than nothing, and that is the whole function. A path running
 * exactly along a border is therefore legal, which it must be: it is what the
 * corner-inset clamp produces at an endpoint's own card.
 */
function entersCard(from: Point, to: Point, card: CardBox): boolean {
  const left = Math.max(Math.min(from.x, to.x), card.x);
  const right = Math.min(Math.max(from.x, to.x), card.x + card.width);
  const top = Math.max(Math.min(from.y, to.y), card.y);
  const bottom = Math.min(Math.max(from.y, to.y), card.y + card.height);
  return right - left > 0 && bottom - top > 0;
}

/**
 * THE THREE BOARDS ONE FIXTURE MAKES, and the third is why this is an enum
 * rather than the view name it used to be.
 *
 *   - `grid` is the other canvas, which the settle step does not touch.
 *   - `graph` is the settled board: the graph view as it now draws.
 *   - `stacked` is that same view with the relations WITHHELD FROM THE LAYOUT
 *     but still routed over it — today's placement, and the column the ledger
 *     compares against.
 *
 * TODAY'S PLACEMENT IS `graphLayout` WITH AN EMPTY EDGE LIST, WHICH IS AN
 * IDENTITY AND NOT A SECOND COPY OF THE STACKING LOOP. A board with no
 * cross-column relation settles to exactly the stack it was handed —
 * `settle.ts` says why, under the column that comes back exactly stacked — so
 * withholding the relations from the LAYOUT while handing those same relations
 * to the ROUTER asks the only question worth asking: the same lines, over the
 * two placements. Restating the stacking loop here would be a second layout to
 * keep in step with the first, and the case below checks the identity against
 * the lattice arithmetic rather than trusting it.
 */
type BoardView = "grid" | "graph" | "stacked";

/** What one board's relations came back as, plus the boxes they ran between. */
type Routed = ReturnType<typeof routeBoard>;

function routeBoard(fixture: Fixture, view: BoardView) {
  const geometry = view === "grid" ? GEOMETRY.grid : GEOMETRY.graph;
  const layout =
    view === "grid"
      ? gridLayout(fixture.nodes)
      : graphLayout(fixture.nodes, view === "graph" ? fixture.edges : []);
  const cards = cardsOf(layout);
  const boxes = new Map<string, CardBox>(
    cards.map((card) => [
      card.id,
      {
        x: card.x,
        y: card.y,
        width: geometry.cardWidth,
        height: geometry.cardHeight,
      },
    ]),
  );
  // THE CLOCK IS AROUND `routedEdges` AND NOTHING ELSE, because the number the
  // ledger prints is the routing's and laying a board out is work every view
  // does whether or not it draws a relation. It is a wall time on one machine
  // on one run and it is reported rather than asserted; nothing here fails
  // because a laptop was busy. READ THE TWO COLUMNS AS ONE NUMBER: the settled
  // corpus is routed first and pays the engine's warm-up for the two after it,
  // and successive runs of this file disagree with each other by more than the
  // two placements disagree.
  const started = performance.now();
  const routed = routedEdges(
    cards,
    fixture.edges,
    geometry,
    view === "grid" ? "grid" : "graph",
  );
  const millis = performance.now() - started;
  return { fixture, view, geometry, layout, cards, boxes, routed, millis };
}

/**
 * ROUTED ONCE, AT MODULE SCOPE, AND READ BY EVERY CASE BELOW. Routing the
 * corpus is the expensive arithmetic in this file — every relation against
 * every card that is not one of its two ends, over four thousand relations —
 * and a case that re-routed would pay for it again for nothing: the answer is a
 * pure function of a corpus that is itself a constant.
 */
const SETTLED: readonly Routed[] = CORPUS.map((fixture) =>
  routeBoard(fixture, "graph"),
);
const STACKED: readonly Routed[] = CORPUS.map((fixture) =>
  routeBoard(fixture, "stacked"),
);
const GRID: readonly Routed[] = CORPUS.map((fixture) =>
  routeBoard(fixture, "grid"),
);

/** Every relation of every board, as one list, so a case can read it flat. */
function everyRoute(boards: readonly Routed[]) {
  return boards.flatMap((board) =>
    board.routed.map((relation) => ({ board, relation })),
  );
}

/** One card as this file reads a column: enough to check a row against. */
type Row = { readonly id: string; readonly y: number };

/**
 * A board's cards by column, in the order the stack filled them.
 *
 * `graphLayout` pushes its placements one whole column at a time and each
 * column top row first, so grouping them by type in arrival order recovers the
 * stack's own rows — no sort, and in particular no sort by y, which is the one
 * key the settle step is allowed to change.
 */
function columnsOf(layout: Layout): (readonly Row[])[] {
  const columns = new Map<string, Row[]>();
  for (const card of layout.placements) {
    const column = columns.get(card.type);
    if (column === undefined) columns.set(card.type, [card]);
    else column.push(card);
  }
  return [...columns.values()];
}

test("the corpus is a graph Shall could hold", () => {
  assert.equal(CORPUS.length, BOARDS);
  const types = new Set<string>(NODE_TYPES.map((entry) => entry.name));
  let relations = 0;
  for (const fixture of CORPUS) {
    assert.ok(
      fixture.nodes.length >= SMALLEST && fixture.nodes.length <= LARGEST,
      `${fixture.name} has ${String(fixture.nodes.length)} nodes`,
    );
    const byId = new Map(fixture.nodes.map((node) => [node.id, node]));
    for (const node of fixture.nodes) {
      assert.ok(types.has(node.type), `${node.id} is a ${node.type}`);
    }
    for (const edge of fixture.edges) {
      const from = byId.get(edge.fromId);
      const to = byId.get(edge.toId);
      assert.ok(
        from !== undefined && to !== undefined,
        `${edge.id} is stranded`,
      );
      // THE CANON'S OWN DOOR, asked of the finished board rather than trusted
      // from the way it was built: the generator picks a permitted row and then
      // two nodes, and this is the independent check that it did.
      assert.ok(
        isPermittedTriple(from.type, to.type, edge.type),
        `${edge.id} is not a triple the canon allows`,
      );
      assert.notEqual(edge.fromId, edge.toId, `${edge.id} points at itself`);
    }
    relations += fixture.edges.length;
  }
  // The corpus is big enough to be worth the wall time it costs, and this is
  // the line that says so out loud.
  assert.ok(relations > 3000, `only ${String(relations)} relations`);
});

test("the columns fill unevenly, the way a real project's do", () => {
  // WITHOUT THIS THE WHOLE CORPUS COULD BE FLAT and every case below would be
  // testing one shape of board twenty-two columns wide. A `board` fixture puts
  // three nodes in five into a single type, so its fullest column dwarfs the
  // rest — which is the case the settle step moves furthest and the case where
  // a merged y-span swallows the lanes.
  const lopsided = CORPUS.filter((fixture) => {
    const counted = new Map<string, number>();
    for (const node of fixture.nodes) {
      counted.set(node.type, (counted.get(node.type) ?? 0) + 1);
    }
    return Math.max(...counted.values()) * 3 >= fixture.nodes.length;
  });
  assert.ok(lopsided.length >= 10, `${String(lopsided.length)} lopsided`);
});

test("the same corpus comes back twice", () => {
  // The modules under test all promise the same picture on the same input, and
  // that promise is worth nothing if the input is not the same input.
  assert.deepStrictEqual(
    Array.from({ length: BOARDS }, (_, index) => boardAt(index)),
    CORPUS,
  );
});

test("every routed segment is axis-aligned", () => {
  // THE PRECONDITION OF `entersCard` AND OF `crossingsOn`, asserted before
  // anything relies on it. The router turns at right angles by construction; if
  // that ever stopped being true the simpler collision test below would start
  // answering a question nobody asked, and the crossing count would quietly
  // drop every segment it could no longer classify.
  const boards = [
    ...everyRoute(SETTLED),
    ...everyRoute(STACKED),
    ...everyRoute(GRID),
  ];
  for (const { relation } of boards) {
    if (relation.route.fallback) continue;
    const points = relation.route.waypoints;
    for (let index = 0; index + 1 < points.length; index += 1) {
      const from = points[index] as Point;
      const to = points[index + 1] as Point;
      assert.ok(
        from.x === to.x || from.y === to.y,
        `${relation.edge.id} runs diagonally`,
      );
    }
  }
});

/** The defect this module exists to remove, asked of one board's answer. */
function assertNothingCrossed(boards: readonly Routed[]): void {
  for (const { board, relation } of everyRoute(boards)) {
    // A FALLBACK IS EXEMPT AND SAYS SO ITSELF. `RoutedPath.fallback` documents
    // the straight line it returns as one that may cross a card, which is why
    // the canvas stipples it; holding it to this rule would be holding it to
    // the promise it is there to break honestly. The cases below assert there
    // are none, so on today's corpus this exemption is never taken.
    if (relation.route.fallback) continue;
    const points = relation.route.waypoints;
    for (const [id, card] of board.boxes) {
      if (id === relation.edge.fromId || id === relation.edge.toId) continue;
      for (let index = 0; index + 1 < points.length; index += 1) {
        const from = points[index] as Point;
        const to = points[index + 1] as Point;
        assert.ok(
          !entersCard(from, to, card),
          `${board.view} ${board.fixture.name}: ${relation.edge.id} runs ` +
            `through ${id}`,
        );
      }
    }
  }
}

test("no relation enters a card it is not attached to — graph view", () => {
  assertNothingCrossed(SETTLED);
});

test("no relation enters a card it is not attached to — grid view", () => {
  assertNothingCrossed(GRID);
});

test("no relation enters a card it is not attached to — stacked", () => {
  // THE BASELINE IS HELD TO THE SAME RULE AS THE ANSWER, because every figure
  // the ledger quotes is quoted against it. A stacked board that crossed cards
  // would make the left-hand column a measurement of a picture nobody would
  // ship, and "shorter, and fewer detours, than a board that runs lines through
  // cards" is not a comparison worth printing.
  assertNothingCrossed(STACKED);
});

test("the grid refuses nothing, on any board in the corpus", () => {
  // THE GRID IS THE HALF THE SETTLE STEP DID NOT TOUCH, and this is the case
  // that says so: its cards still share a row, so a gap in the merged y-spans
  // is still a gap everywhere, and the gap lanes `laneCentres` derives still
  // answer every board. Measured at lane budgets of 12, 24 and 48, it draws the
  // identical picture — the budget is not a term in this answer at all.
  const refused = everyRoute(GRID).filter(
    ({ relation }) => relation.route.fallback,
  );
  assert.deepStrictEqual(
    refused.map(
      ({ board, relation }) => `${board.fixture.name} ${relation.edge.id}`,
    ),
    [],
  );
});

test("the settled graph refuses nothing either", () => {
  // THE HARD CONSTRAINT, AND THE CASE THAT PUT THE SETTLE STEP ON WHOLE ROWS
  // RATHER THAN WHOLE PIXELS. The case above says the grid routes around every
  // card on every board of the corpus; a settled column may not buy its pull by
  // giving that up here.
  //
  // A CARD FREE TO STOP ON ANY PIXEL MERGES THE LANES AWAY. `laneCentres`
  // crosses the board on the gaps left once every card's y-span is merged, so
  // two cards in different columns whose tops differ by less than a grown card
  // height leave no gap between them at all, and on the densest boards nothing
  // survives the merge. What that cost when it was tried is counted once, in
  // `settle.ts` beside the lattice constraint, and not again here: it was
  // measured on a variant of that file which is not in this tree, so this
  // corpus cannot check the number and has no business repeating it.
  //
  // ON THE LATTICE THE QUESTION DOES NOT ARISE, and the reason is the settle
  // module's own — every card at `top + k*pitch`, so every merged span begins
  // and ends on a lattice boundary and the 14px gap stands at every one of them
  // however hard the relations pulled.
  //
  // SO IT IS A PROPERTY AND NOT A COUNT, and the empty list is the whole of it.
  // Whoever lets a card off the lattice will find a number to write down here
  // instead, and the paragraph above is what it will cost.
  const refused = everyRoute(SETTLED).filter(
    ({ relation }) => relation.route.fallback,
  );
  assert.deepStrictEqual(
    refused.map(
      ({ board, relation }) => `${board.fixture.name} ${relation.edge.id}`,
    ),
    [],
  );
});

test("today's placement is the stack itself", () => {
  // WHAT LICENSES THE LEDGER'S LEFT-HAND COLUMN. `BoardView` says why the
  // baseline is `graphLayout` with its relations withheld rather than a second
  // stacking loop; this is that identity checked instead of assumed, against
  // the lattice arithmetic and not against the layout that produced it. If it
  // ever fails, every comparison the last case prints is between a settled
  // board and something that is not the board we have today.
  for (const board of STACKED) {
    for (const column of columnsOf(board.layout)) {
      for (const [row, card] of column.entries()) {
        assert.equal(
          card.y,
          LATTICE_TOP + LATTICE_PITCH * row,
          `${board.fixture.name}: ${card.id} is not stacked`,
        );
      }
    }
  }
});

test("the graph view's lattice is `46 + 62*row`", () => {
  // THE TWO NUMBERS THE PROMISE WAS MADE IN, pinned in one place so that the
  // sentence a person reads about this lattice and the arithmetic every case
  // below runs over it cannot part company. Nothing else in this file writes
  // either literal down.
  assert.equal(LATTICE_TOP, 46);
  assert.equal(LATTICE_PITCH, 62);
});

test("every settled card is on the row lattice", () => {
  // THE CONSTRAINT THE WHOLE CORRECTION IS. `settle.ts` explains what the
  // router loses when a card leaves this lattice; the case above measures the
  // loss in refusals, and this one checks the property that prevents it — asked
  // of the finished board, so it covers the rounding, the clamp and the sweeps
  // at once.
  for (const board of SETTLED) {
    for (const card of board.layout.placements) {
      const rows = (card.y - LATTICE_TOP) / LATTICE_PITCH;
      assert.ok(
        Number.isInteger(rows) && rows >= 0,
        `${board.fixture.name}: ${card.id} sits at y=${String(card.y)}`,
      );
    }
  }
});

test("the fullest column keeps the placement it has today", () => {
  // NO RULE OF ITS OWN — it is the column with no slack, and `settle.ts` says
  // so where the slack is computed. What is worth asserting is that the
  // arithmetic really does come out that way on forty boards, to the pixel and
  // not to the row: the fullest column is the one a person's eye reads the
  // board against, and if it drifted the whole view would have moved while
  // every other case here still passed. Two columns tied for fullest are both
  // checked, for the one reason.
  for (const board of SETTLED) {
    const columns = columnsOf(board.layout);
    const tallest = Math.max(...columns.map((column) => column.length));
    for (const column of columns.filter((one) => one.length === tallest)) {
      for (const [row, card] of column.entries()) {
        assert.equal(
          card.y,
          LATTICE_TOP + LATTICE_PITCH * row,
          `${board.fixture.name}: ${card.id} left the fullest column's stack`,
        );
      }
    }
  }
});

test("the same board draws the same `d` twice", () => {
  // The router's total orders — fewest turns, then shortest, then
  // lexicographically smallest — exist so that this holds across a refactor, a
  // re-ordered obstacle list or another engine's sort. One board is enough to
  // catch a comparison that stopped being total; a whole second corpus would
  // buy nothing but wall time.
  const fixture = CORPUS[7] as Fixture;
  const first = routeBoard(fixture, "graph").routed.map((relation) =>
    stepPath(relation.route.waypoints),
  );
  const second = routeBoard(fixture, "graph").routed.map((relation) =>
    stepPath(relation.route.waypoints),
  );
  assert.deepStrictEqual(first, second);
});

/**
 * HOW LONG THE DRAWN LINE IS — Manhattan, because every segment is axis-aligned
 * and the sum of the two spans is therefore the run of the polyline itself.
 * Written here rather than imported because the router keeps its own `length`
 * private, and a measurement taken with the measured module's own ruler is
 * worth less than four lines of arithmetic.
 */
function walk(points: readonly Point[]): number {
  let total = 0;
  for (let index = 0; index + 1 < points.length; index += 1) {
    const from = points[index] as Point;
    const to = points[index + 1] as Point;
    total += Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  }
  return total;
}

/** One axis-aligned run: where it sits, and the span it covers. */
type Run = {
  readonly at: number;
  readonly lo: number;
  readonly hi: number;
  readonly relation: number;
};

/**
 * HOW MANY TIMES ONE RELATION JUMPS ANOTHER ON THIS BOARD — the number the
 * whole round was run to move, so it is worth being exact about what is
 * counted.
 *
 * A CROSSING IS A TRANSVERSAL AND STRICT ON BOTH SIDES: a horizontal run of one
 * relation and a vertical run of another meeting at a point INTERIOR to each.
 * Two consequences, both wanted. Two relations that leave the same card and run
 * side by side never cross, however long they share a lane — a shared lane is
 * not a jump, and counting it would make a tidy board look like a scribble.
 * And a T-junction, where one relation's corner lands exactly on another's run,
 * is not counted either: nothing is jumped there, the two lines meet and part.
 *
 * IT COUNTS POINTS AND NOT PAIRS, because what a reader sees is every place one
 * line hops another, and a pair of relations that weaves across each other
 * three times is three of those. Runs of the same relation are skipped by index
 * — a path crossing itself is a bend budget question, not a legibility one.
 */
function crossingsOn(board: Routed): number {
  const horizontal: Run[] = [];
  const vertical: Run[] = [];
  for (const [index, relation] of board.routed.entries()) {
    const points = relation.route.waypoints;
    for (let step = 0; step + 1 < points.length; step += 1) {
      const from = points[step] as Point;
      const to = points[step + 1] as Point;
      if (from.y === to.y && from.x !== to.x) {
        horizontal.push({
          at: from.y,
          lo: Math.min(from.x, to.x),
          hi: Math.max(from.x, to.x),
          relation: index,
        });
      } else if (from.x === to.x && from.y !== to.y) {
        vertical.push({
          at: from.x,
          lo: Math.min(from.y, to.y),
          hi: Math.max(from.y, to.y),
          relation: index,
        });
      }
    }
  }

  let crossings = 0;
  for (const across of horizontal) {
    for (const down of vertical) {
      if (down.relation === across.relation) continue;
      if (
        down.at > across.lo &&
        down.at < across.hi &&
        across.at > down.lo &&
        across.at < down.hi
      ) {
        crossings += 1;
      }
    }
  }
  return crossings;
}

/** Every number the ledger prints for one placement of the whole corpus. */
type Ledger = {
  readonly relations: number;
  readonly refused: number;
  readonly detoured: number;
  readonly lengths: readonly number[];
  readonly homeless: number;
  readonly crossings: number;
  /** Crossings board by board, in corpus order — the two columns, compared. */
  readonly perBoard: readonly number[];
  readonly byShape: ReadonlyMap<Shape, number>;
  readonly gaps: readonly number[];
  readonly level: number;
  readonly millis: number;
};

/**
 * The corpus measured, in one pass over the routed answer.
 *
 * STACKED AND SETTLED GO THROUGH THIS SAME FUNCTION, which is the only reason
 * the two columns of the table may be subtracted from one another: a comparison
 * between two placements measured two ways is a comparison of the two ways.
 *
 * A RELATION WITH NO HORIZONTAL LEG IS A LABEL WITH NOWHERE TO GO, and it is
 * asked of `stepPath`'s own answer rather than of the waypoints — `labelSlot`
 * is the rule for where a name may be written and `room: 0` is its way of
 * saying the route offers no run to write one on. Counting the horizontal
 * segments here instead would be a second opinion about the same thing.
 *
 * THE CROSSINGS ARE KEPT THREE WAYS — the total, the board-by-board list and
 * the sum per shape — because the total alone hid the answer. It is one number
 * moving in one direction over forty boards that are moving in both, and which
 * boards those are is the whole of what the last case has to say.
 */
function ledgerOf(boards: readonly Routed[]): Ledger {
  const lengths: number[] = [];
  const gaps: number[] = [];
  const perBoard: number[] = [];
  const byShape = new Map<Shape, number>();
  let refused = 0;
  let detoured = 0;
  let homeless = 0;
  let crossings = 0;
  let level = 0;
  let millis = 0;

  for (const board of boards) {
    millis += board.millis;
    const jumps = crossingsOn(board);
    crossings += jumps;
    perBoard.push(jumps);
    const shape = board.fixture.shape;
    byShape.set(shape, (byShape.get(shape) ?? 0) + jumps);
    for (const relation of board.routed) {
      if (relation.route.fallback) refused += 1;
      if (relation.route.detoured) detoured += 1;
      lengths.push(walk(relation.route.waypoints));
      if (stepPath(relation.route.waypoints).label.room === 0) homeless += 1;
      const from = board.boxes.get(relation.edge.fromId);
      const to = board.boxes.get(relation.edge.toId);
      // `routedEdges` drops a relation whose end has no card, so both boxes are
      // always found; the guard is what keeps the read total.
      if (from === undefined || to === undefined) continue;
      const gap = Math.abs(from.y - to.y);
      gaps.push(gap);
      if (gap === 0) level += 1;
    }
  }

  return {
    relations: lengths.length,
    refused,
    detoured,
    lengths,
    homeless,
    crossings,
    perBoard,
    byShape,
    gaps,
    level,
    millis,
  };
}

function mean(list: readonly number[]): number {
  if (list.length === 0) return 0;
  let total = 0;
  for (const value of list) total += value;
  return total / list.length;
}

/** The lower of the two middles on an even count — one convention, stated. */
function median(list: readonly number[]): number {
  if (list.length === 0) return 0;
  const sorted = [...list].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)] as number;
}

function highest(list: readonly number[]): number {
  let top = 0;
  for (const value of list) if (value > top) top = value;
  return top;
}

/** How far every card moved, in rows, over the whole corpus. */
function movement(): {
  readonly cards: number;
  readonly moved: number;
  readonly furthest: number;
  readonly byRows: ReadonlyMap<number, number>;
} {
  const byRows = new Map<number, number>();
  let cards = 0;
  let moved = 0;
  let furthest = 0;
  for (const [index, settled] of SETTLED.entries()) {
    const before = new Map(
      (STACKED[index] as Routed).cards.map((card) => [card.id, card.y]),
    );
    for (const card of settled.cards) {
      const was = before.get(card.id) ?? card.y;
      const rows = Math.abs(card.y - was) / LATTICE_PITCH;
      cards += 1;
      if (rows === 0) continue;
      moved += 1;
      if (rows > furthest) furthest = rows;
      byRows.set(rows, (byRows.get(rows) ?? 0) + 1);
    }
  }
  return { cards, moved, furthest, byRows };
}

/** The board the wall time is worst on: the one with the most cards. */
function biggest(): number {
  let at = 0;
  for (const [index, fixture] of CORPUS.entries()) {
    if (fixture.nodes.length > (CORPUS[at] as Fixture).nodes.length) at = index;
  }
  return at;
}

/** One row of the table: the two placements and what moved between them. */
function line(
  label: string,
  stacked: number,
  settled: number,
  digits = 0,
): string {
  const change = settled - stacked;
  const shift =
    stacked === 0
      ? change === 0
        ? "—"
        : "+∞"
      : `${change >= 0 ? "+" : ""}${((change / stacked) * 100).toFixed(1)}%`;
  return (
    label.padEnd(28) +
    stacked.toFixed(digits).padStart(10) +
    settled.toFixed(digits).padStart(10) +
    shift.padStart(10)
  );
}

/**
 * THE LEDGER — what the lattice step cost and what it bought, printed, and the
 * one line of it that is asserted.
 *
 * WHY A CASE PRINTS AT ALL. Everything above is a property that either holds or
 * does not; these are the round's measurements, and there is no threshold any
 * of them could be held to that would not have been invented on the spot.
 * Whoever changes the settle step reads this table, decides whether the trade
 * is still the one that was accepted, and writes down what they found — which
 * is what was done here.
 *
 * WHAT WAS FOUND, ON THE DAY. Both hard constraints hold: nought relations
 * refused in either view or either placement, and no routed segment enters a
 * card that is not one of its two ends. What the pull bought: the vertical
 * distance between a relation's two cards fell from a mean of 191.8px to
 * 141.3px, and the drawn lines got SHORTER with it — a mean of 1198.7 to
 * 1144.8, a median of 844.2 to 792.0 and a longest of 8270 to 5950, which is
 * the finding that sent `settle.ts`'s own header back to be rewritten. Detours
 * fell 3363 to 3225. The routing's wall time
 * did not move: the two columns land within a few per cent of each other and
 * two runs of this file disagree by more than that, so it is a nil and not a
 * win. Labels did not move either: 86 relations had no horizontal run to write
 * a name on before, and 86 after — the count, which is what the trade is
 * counted in; whether they are the same 86 was not asked.
 *
 * AND THE CROSSINGS WENT UP: 12934 to 13885, seven per cent the wrong way. That
 * is the number this round was run to move and it moved against us, so it is
 * written here in full rather than left to a reader to notice. It is not spread
 * evenly — 24 boards of the 40 improved, 11 worsened, 5 did not change — and it
 * is one shape that pays: the `hub` boards go 6688 to 8359 while `chain` goes
 * 1324 to 1041 and `board` 4922 to 4485. THE SHAPE EXPLAINS IT. A sink pulls
 * every card that points at it toward its own row, so relations that fanned
 * across the height of the board now converge into a few rows and cross one
 * another there; the pull that levels a pair levels its neighbours onto the
 * same lane. Pairs landing exactly level fall for the same reason and in the
 * same breath — 996 to 923 — because the stack's own accidental alignments, two
 * columns' row 3 being one line, are exactly what a column shifted by a whole
 * number of rows breaks.
 *
 * THIS COUNT IS NOT THE ONE THE PREVIOUS ROUND QUOTED, and no one should
 * subtract the two. That round reported 27205 crossings for the stacked board;
 * this counter answers 12934 for the same forty boards, so whatever it counted
 * — touches, shared lanes, ordered pairs — it was not this. `crossingsOn` says
 * exactly what a crossing is here, and the only comparison this file offers is
 * between its own two columns, which are one function of two placements.
 *
 * ONE LINE IS ASSERTED AND IT IS THE STEP'S OWN CLAIM: the vertical distance
 * between a relation's two cards. `settle.ts` names that as the claim worth
 * making because it is the one that was measured, and it is the objective the
 * arithmetic actually minimises — if it ever stopped falling, the step would be
 * doing nothing at all and should say so as a failure rather than as a
 * diagnostic nobody reads. The crossing count is NOT asserted, and deliberately
 * so: it is an outcome of the router run over a placement, not something the
 * placement solves for, and a test that pinned it would be pinning today's
 * router to today's corpus.
 */
test("the ledger: what the lattice step cost and what it bought", (t) => {
  const before = ledgerOf(STACKED);
  const after = ledgerOf(SETTLED);
  const cards = movement();
  const at = biggest();
  const board = CORPUS[at] as Fixture;

  let better = 0;
  let worse = 0;
  let same = 0;
  for (const [index, was] of before.perBoard.entries()) {
    const now = after.perBoard[index] ?? was;
    if (now < was) better += 1;
    else if (now > was) worse += 1;
    else same += 1;
  }

  t.diagnostic(
    `corpus: ${String(BOARDS)} boards, ` +
      `${String(CORPUS.reduce((sum, one) => sum + one.nodes.length, 0))} ` +
      `cards, ${String(after.relations)} relations`,
  );
  t.diagnostic(
    "".padEnd(28) +
      "stacked".padStart(10) +
      "settled".padStart(10) +
      "change".padStart(10),
  );
  t.diagnostic(line("fallback (straight line)", before.refused, after.refused));
  t.diagnostic(line("relations detoured", before.detoured, after.detoured));
  t.diagnostic(
    line("length mean", mean(before.lengths), mean(after.lengths), 1),
  );
  t.diagnostic(
    line("length median", median(before.lengths), median(after.lengths), 1),
  );
  t.diagnostic(
    line("length max", highest(before.lengths), highest(after.lengths), 1),
  );
  t.diagnostic(line("no horizontal leg", before.homeless, after.homeless));
  t.diagnostic(line("relation crossings", before.crossings, after.crossings));
  for (const shape of SHAPES) {
    t.diagnostic(
      line(
        `  of those, ${shape}`,
        before.byShape.get(shape) ?? 0,
        after.byShape.get(shape) ?? 0,
      ),
    );
  }
  t.diagnostic(
    `  boards: ${String(better)} better, ${String(worse)} worse, ` +
      `${String(same)} unchanged`,
  );
  t.diagnostic(line("|Δy| mean", mean(before.gaps), mean(after.gaps), 1));
  t.diagnostic(line("|Δy| max", highest(before.gaps), highest(after.gaps), 1));
  t.diagnostic(line("pairs exactly level", before.level, after.level));
  t.diagnostic(line("routing ms, corpus", before.millis, after.millis, 1));
  t.diagnostic(
    line(
      `routing ms, ${board.name}`,
      (STACKED[at] as Routed).millis,
      (SETTLED[at] as Routed).millis,
      1,
    ),
  );
  t.diagnostic(
    `cards moved: ${String(cards.moved)} of ${String(cards.cards)}, ` +
      `furthest ${String(cards.furthest)} rows`,
  );
  for (const rows of [...cards.byRows.keys()].sort((one, two) => one - two)) {
    t.diagnostic(
      `  moved ${String(rows).padStart(3)} row(s)`.padEnd(28) +
        String(cards.byRows.get(rows) ?? 0).padStart(10),
    );
  }

  assert.ok(
    mean(after.gaps) < mean(before.gaps),
    `|Δy| mean ${mean(after.gaps).toFixed(1)} settled against ` +
      `${mean(before.gaps).toFixed(1)} stacked — the settle step is not ` +
      `pulling`,
  );
});
