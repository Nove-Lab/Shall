import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  PanOnScrollMode,
  ReactFlow,
  useReactFlow,
  useStore,
  type Connection,
} from "@xyflow/react";
import { House } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NODE_TYPES, type CanvasNode } from "./canvas-nodes";
import { FloatingConnectionLine } from "./FloatingConnectionLine";
import {
  EDGE_TYPES,
  floatingEdgeOf,
  type FloatingEdge,
} from "./FloatingEdge";
import {
  READABLE_ZOOM,
  cardCenter,
  openingViewport,
  originViewport,
  revealNeeded,
  revealScroll,
  scrolledViewport,
} from "./view/camera";
import { routedEdges } from "./view/edges";
import {
  cardPieces,
  furniturePieces,
  graphIdOfCard,
  type Closure,
  type TaskState,
  type Signal,
} from "./view/furniture";
import { highlightFor } from "./view/highlight";
import {
  GEOMETRY,
  graphLayout,
  gridLayout,
  typeAtPoint,
  type Layout,
} from "./view/layout";
import type { SpecEdge, SpecNode } from "./view/model";

/**
 * THE SPEC CANVAS: one React Flow instance, two layout functions.
 *
 * The grid view and the graph view differ in exactly one thing — which layout
 * function produced the positions — so selection, the connect gesture, the
 * context targets, the relations and every card are written once here and are
 * the same code in both. The alternative, a hand-built table beside a React Flow
 * graph, duplicates all five and lets them drift; the grid is not a table, it is
 * the same canvas with the cards laid out in bands.
 *
 * THE TWO VIEWS ARE HUNG DIFFERENTLY AND THAT IS THE ONE OTHER DIFFERENCE. The
 * graph is a camera over an unbounded plane and fills the pane. The grid is a
 * DOCUMENT: `gridLayout(nodes)` no longer consults the canvas, so the board's
 * size is a pure function of the graph, and the canvas is simply given that size
 * inside a `ScrollArea` and scrolled by the browser. It is why the grid has real
 * scrollbars and no camera state at all — see the return statement, which is the
 * only place the two shapes are told apart.
 *
 * WHAT THE LIBRARY DOES AND IS NOT REIMPLEMENTED: panning, zooming, culling, the
 * zoom controls, hit-testing and the connect gesture. What this file does: ask
 * `view/` where everything goes, hand the answer over, and report what the
 * pointer landed on.
 *
 * NOTHING IS DECIDED HERE THAT `view/` COULD DECIDE. Every coordinate on this
 * screen comes from a pure function next door that can be executed without a
 * browser — the layouts, the endpoints, the routes, the cameras and the node
 * objects themselves. A number built inside this component would be reachable
 * only by a person looking at a screen.
 *
 * THIS COMPONENT IS CONTROLLED AND STORES NOTHING. It holds no nodes, no edges
 * and no selection; React Flow's own selection machinery is left running but
 * never consulted, because `nodes` is passed without an `onNodesChange` and the
 * library drops its own changes on that path. What a card and a relation look
 * like is the `Highlight` computed below from the caller's `selectedId`, read
 * per render and stored nowhere.
 */

/** What a right-click landed on. `nodeType` is `null` over no column at all. */
export type MenuTarget =
  | { kind: "pane"; nodeType: string | null }
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string };

interface SpecGraphProps {
  view: "grid" | "graph";
  nodes: SpecNode[];
  edges: SpecEdge[];
  /**
   * The daemon's verdict per node, for the square on each card. A node with no
   * entry has none and draws none — see `cardPieces`.
   *
   * IT ARRIVES MEMOISED FROM THE PLANE, which is not a preference: it is a
   * dependency of the `cards` memo below, so a map rebuilt on every render of the
   * plane would rebuild every card object and take React Flow's per-node rebuild
   * arm for a board nothing changed on.
   */
  signalById: ReadonlyMap<string, Signal>;
  /**
   * The mark beside a criterion's id — open or closed — for the nodes that have
   * one. A node with no entry is not a criterion and draws none.
   *
   * IT ARRIVES MEMOISED FROM THE PLANE for the reason `signalById` does: it is a
   * dependency of the `cards` memo below, and a map rebuilt per render of the
   * plane rebuilds every card object with it.
   */
  closureById: ReadonlyMap<string, Closure>;
  /**
   * The word each implementation task wears — blocked, ready or done. A node
   * with no entry is not a task and draws no badge.
   *
   * IT ARRIVES MEMOISED FROM THE PLANE for the reason the two maps above do:
   * it is a dependency of the `cards` memo below.
   */
  taskStateById: ReadonlyMap<string, TaskState>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /**
   * A LEFT CLICK THAT LANDED ON NOTHING — the board's own ground, in either view.
   *
   * IT IS REPORTED AND NEVER ACTED ON HERE, like every other gesture on this
   * canvas. What a click on nothing MEANS is the plane's: it holds the panel, and
   * a panel with a half-written node in it must survive a stray click while a
   * panel that is only being read must not. This component has no way to tell
   * those two apart and no business knowing.
   */
  onBackgroundClick: () => void;
  onConnect: (sourceId: string, targetId: string) => void;
  onContextTarget: (target: MenuTarget) => void;
}

/**
 * THE ELEMENT THE GRID SCROLLS, as the design system names its parts.
 *
 * `ScrollArea` keeps its scrolling element to itself — the shadcn wrapper
 * renders the Base UI `Viewport` inside, and exposes no ref to it — and
 * `data-slot` is the handle shadcn puts on every part for exactly this kind of
 * reach. Asking the board to find its own scroller upwards is cheaper than
 * threading a prop through a component the design system owns, and it cannot
 * name the wrong element: the board is inside the viewport by construction.
 *
 * `null` is the graph view, where there is no scroll area at all.
 */
function scrollerOf(board: HTMLElement | null): HTMLElement | null {
  return (
    board?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null
  );
}

/**
 * How far out and how far in the GRAPH view may be zoomed, carried over from the
 * board this ports from rather than re-chosen.
 *
 * The floor is for orientation and not for reading: 22 columns at a 188px pitch
 * are 4 136px across, which no window frames at a legible scale, so zooming out
 * is how you find the far side of the board and zooming back in is how you read
 * it. The ceiling is a little over `READABLE_ZOOM` because the card is drawn to
 * be read at 1 and there is nothing above it to reveal.
 *
 * The GRID has no pair of its own: it is pinned to `READABLE_ZOOM` at both ends.
 */
const GRAPH_MIN_ZOOM = 0.18;
const GRAPH_MAX_ZOOM = 1.4;

export function SpecGraph({
  view,
  nodes,
  edges,
  signalById,
  closureById,
  taskStateById,
  selectedId,
  onSelect,
  onBackgroundClick,
  onConnect,
  onContextTarget,
}: SpecGraphProps) {
  const { getViewport, screenToFlowPosition, setCenter, setViewport } =
    useReactFlow();

  /**
   * THE PANE'S OWN PIXEL SIZE, WHICH IS WHERE THE LIBRARY KEEPS IT.
   *
   * ONE CALLER ONLY: the graph view's reveal, which needs the box a card has to
   * be inside to count as on screen. Nothing else on this component asks — where
   * a view opens is declared through `defaultViewport` and `openingViewport` no
   * longer takes a canvas, so the pane's size is not on the path to the first
   * paint at all.
   *
   * BOTH ARE 0 UNTIL REACT FLOW HAS MEASURED THE PANE, which is the state this
   * component is in on its first frame, and the reveal effect below simply
   * declines to answer while they are — it re-runs with real numbers, because
   * both are dependencies of it.
   *
   * THIS IS THE GRAPH VIEW'S WINDOW AND, IN THE GRID, IT IS THE BOARD. The grid
   * gives React Flow a container the size of the whole board, so these two report
   * the board and not what a person can see; the visible box there is the scroll
   * area's viewport, measured off the element. Reading these for the grid's own
   * reveal is the mistake this note exists to stop.
   *
   * NEITHER IS A LAYOUT INPUT. The board's width comes from its own columns and
   * its height from its own bands, so opening the detail panel or resizing the
   * window clips and scrolls the board instead of re-flowing it — and no window
   * resize can rebuild a node object for a layout that cannot have changed.
   */
  const canvasWidth = useStore((state) => state.width);
  const canvasHeight = useStore((state) => state.height);

  const layout: Layout = useMemo(
    () => (view === "grid" ? gridLayout(nodes) : graphLayout(nodes)),
    [view, nodes],
  );

  const byId = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  /**
   * THE SCENERY, MEMOISED ON EXACTLY WHAT IT IS A FUNCTION OF — the layout, and
   * the reason is a library fast path rather than a frame budget.
   *
   * React Flow keeps an internal node verbatim when the object handed to it is
   * the same OBJECT it already holds, and rebuilds it when it is not — per node,
   * not per array. The cards below depend on the selection, so with one memo over
   * the whole array every band, every ruled lane and every column header would be
   * a new object on every click and all fifty would take the rebuild arm for
   * nothing.
   *
   * IT IS NOT AN ALTERNATIVE TO THE `measured` EACH PIECE DECLARES, and that
   * distinction is worked through in `view/furniture.ts`: the memo makes selection
   * cheap, the declaration makes the first paint correct.
   *
   * THE VIEW IS NOT A SECOND KEY, because the scenery is not a function of it: a
   * new view is a new layout, and every piece's box is that layout's own number.
   */
  const furniture = useMemo(() => furniturePieces(layout), [layout]);

  /**
   * WHAT IS LIT: the selected node, the nodes one hop from it, and the relations
   * between them — decided once here and read by both layers below.
   *
   * IT IS COMPUTED FROM THE RELATIONS AND NOT FROM THE CANVAS. `view/highlight.ts`
   * walks the edge array the daemon returned; nothing asks React Flow what it
   * believes is connected to what, so the rule survives a version of the library
   * and can be executed without a browser.
   *
   * ONE MEMO FEEDS BOTH THE CARDS AND THE LINES, which is what keeps them
   * agreeing: a card is a neighbour exactly when one of the lit relations reaches
   * it, because both answers come out of the same pass over the same array.
   */
  const highlight = useMemo(
    () => highlightFor(edges, selectedId),
    [edges, selectedId],
  );

  /** The cards, which are the same call plus the two things a click or a refetch moves. */
  const cards = useMemo(
    () =>
      cardPieces(
        layout,
        view,
        byId,
        signalById,
        closureById,
        taskStateById,
        highlight,
      ),
    [layout, view, byId, signalById, closureById, taskStateById, highlight],
  );

  const flowNodes = useMemo<CanvasNode[]>(
    () => [...furniture, ...cards],
    [furniture, cards],
  );

  /**
   * THE BOARD'S BOX, WHICH ONLY THE GRID HANGS ANYTHING ON — and which exists at
   * all because `gridLayout` no longer asks how big the canvas is. The board's
   * size is a pure function of the graph, so it can simply BE that size in the
   * DOM and be scrolled, instead of being panned under a fixed-size window.
   *
   * The two `min*` are the floor, and they are measured against the PANE rather
   * than against a number this component read off the DOM: see the return
   * statement for what they are protecting and why they are container units.
   */
  const boardStyle = useMemo<CSSProperties>(
    () => ({
      width: layout.width,
      height: layout.height,
      minWidth: "100cqw",
      minHeight: "100cqh",
    }),
    [layout],
  );

  /**
   * THE RELATIONS, WITH BOTH ENDS AND THE PATH BETWEEN THEM COMPUTED HERE.
   *
   * The endpoints come from the same placements that positioned the cards, so a
   * line cannot disagree with the boxes it joins — which is also why this memo
   * depends on the layout: a relation moves when either of its cards moves, and
   * cards move when the layout re-runs and at no other time.
   *
   * THE TWO CALLS ARE A DIVISION OF LABOUR AND NOT A PIPELINE STAGE.
   * `floatingEndpoints` says where a relation MEETS a card — the crossing of the
   * centre-to-centre line with the border, held out of the corners — and
   * `routeAroundCards` says how it gets there. Routing therefore introduces no
   * fixed attachment point and cannot move an endpoint.
   *
   * EVERY OTHER CARD IS AN OBSTACLE. The two this relation is attached to are
   * dropped: they are what it is for, not what it must avoid. The box list is
   * built once for the whole memo rather than per relation.
   *
   * An edge whose endpoint has no placement is skipped rather than drawn from
   * nowhere — the same answer `cardPieces` gives a placement with no node.
   *
   * THE HIGHLIGHT IS NOT A DEPENDENCY OF THIS MEMO, and the split below is what
   * that buys. A click changes what a relation LOOKS like and never where it
   * goes, while routing is the most expensive arithmetic on this screen — every
   * relation against every card that is not one of its two ends. Keyed on the
   * highlight as well, the whole board would be re-routed to change a colour.
   *
   * `dashed` RIDES ALONG HERE FOR THE SAME REASON, and it is the one thing on
   * this tuple that is not geometry. Whether a relation sinks into Domain is a
   * property of the RELATION and never of the selection, so it belongs on the
   * side of the split a click does not re-run — and this is the only scope that
   * holds both placements, which is where the two bands are. Computing it next
   * door would mean looking both cards up a second time to learn something
   * neither the click nor the camera can change.
   */
  const routed = useMemo(
    () =>
      routedEdges(
        layout.placements,
        edges,
        view === "grid" ? GEOMETRY.grid : GEOMETRY.graph,
        view,
      ),
    [edges, layout, view],
  );

  /**
   * THE SAME RELATIONS, PAINTED FOR THIS SELECTION — the second half of the
   * split above, and the only part a click re-runs. What each edge object
   * carries, and why the marker, the z and the dash are decided on the OBJECT
   * rather than inside the component, is written on `floatingEdgeOf`.
   */
  const flowEdges = useMemo<FloatingEdge[]>(
    () =>
      routed.map(({ edge, route, dashed }) =>
        floatingEdgeOf(edge, edge.type, route, dashed, highlight),
      ),
    [routed, highlight],
  );

  /**
   * WHERE THIS VIEW OPENS — DECLARED, NOT APPLIED AFTERWARDS.
   *
   * The grid opens at the top-left of its board; the graph opens at
   * `READABLE_ZOOM` anchored `ANCHOR_MARGIN` in from its leftmost column header,
   * in both axes. Both go to React Flow as `defaultViewport`, which it reads when
   * it builds its zoom behaviour — and a view is BUILT on entry now, because the
   * two branches of the return statement are different elements and React drops
   * one subtree to mount the other.
   *
   * THIS WAS AN EFFECT AND THE EFFECT WAS WRONG, which is worth recording so that
   * nobody restores it. Setting the camera on entry means calling `setViewport`,
   * which goes through the pan-zoom instance the store is holding — and on the
   * render that swaps the views, this component's effect runs BEFORE the newly
   * mounted `ZoomPane`'s does. The store is still holding the OUTGOING instance,
   * whose `destroy()` has already unhooked its transform listener and whose DOM
   * node is detached: the write lands on nothing, `getViewport()` cheerfully
   * reports the value that was requested, and the pane paints at the origin.
   * Measured in Chromium: the graph opened at 0,0 on every entry while the effect
   * believed it had aimed at 24,24. `defaultViewport` has no such window — the
   * mount that builds the instance is the mount that applies it.
   *
   * `null` is a layout with no columns to anchor against, and it is the reason
   * this is a prop object rather than a value: `exactOptionalPropertyTypes`
   * refuses `defaultViewport={undefined}`, and it is right to — "open here" and
   * "open wherever the library would" are different asks. Absent means absent.
   */
  const opening = useMemo(
    () => (view === "grid" ? originViewport() : openingViewport(layout)),
    [view, layout],
  );
  const openingProps = opening === null ? {} : { defaultViewport: opening };

  /**
   * THE HOME BUTTON'S DESTINATION IS THE ENTRY'S, and deliberately the same
   * value: a button that landed anywhere else would be a second opinion about
   * where this view begins. It is where the leftmost column header — Term,
   * today — sits `ANCHOR_MARGIN` in from the corner.
   *
   * It moves without a transition for the same reason: this is the view resetting
   * to its opening, not the camera travelling somewhere. Here `setViewport` is
   * the right instrument and not the wrong one described above — a click happens
   * long after the pane is built, so the store is holding the instance that is
   * actually on screen.
   */
  const goHome = useCallback(() => {
    if (opening === null) return;
    void setViewport(opening);
  }, [opening, setViewport]);

  /**
   * A CARD YOU JUST AUTHORED IS BROUGHT ON SCREEN, and only then.
   *
   * Both layouts place a node by its TYPE, so authoring from the toolbar — which
   * points at no column — can land a card columns away from whatever you were
   * looking at: measured at 1200x800, a card authored into one of the last
   * columns sat near x = 4000 while the canvas pane ended at 834, with the
   * detail panel open on a card nobody could see. `revealNeeded`, `cardCenter`
   * and `revealScroll` are where that arithmetic lives and can be executed; this
   * effect is the plumbing only a browser can run.
   *
   * IT FIRES ON A CHANGE OF SELECTION AND NOT ON A CHANGE OF POSITION. Neither
   * the viewport nor the scroll offset is subscribed to — both are read at the
   * moment the question is asked — so scrolling away from the open card does not
   * drag it back; the ref remembers which id has already been revealed so that a
   * re-render, a refetch or a view switch is not a second reveal of the same card.
   *
   * THE TWO VIEWS DIFFER ONLY IN WHAT MOVES. The question is one function over a
   * viewport and a visible box, and the grid supplies both from the element the
   * browser scrolls: `scrolledViewport` turns its offset into the same shape the
   * camera has, and `clientWidth`/`clientHeight` are the visible box that
   * `canvasWidth`/`canvasHeight` are NOT there — those two are the board.
   *
   * AN UNMEASURED VIEW IS WAITED OUT rather than aimed at: the layout and the
   * pane's size are dependencies, so the effect runs again with real numbers, and
   * the ref is only set once there was something to measure against.
   */
  const boardRef = useRef<HTMLDivElement | null>(null);
  const revealed = useRef<string | null>(null);
  useEffect(() => {
    if (selectedId === null) {
      revealed.current = null;
      return;
    }
    if (revealed.current === selectedId) return;

    const placement = layout.placements.find(
      (candidate) => candidate.id === selectedId,
    );
    if (placement === undefined) return;

    if (view === "grid") {
      const scroller = scrollerOf(boardRef.current);
      if (scroller === null) return;
      const visible = {
        width: scroller.clientWidth,
        height: scroller.clientHeight,
      };
      if (visible.width === 0 || visible.height === 0) return;
      revealed.current = selectedId;

      const viewport = scrolledViewport(
        scroller.scrollLeft,
        scroller.scrollTop,
      );
      if (!revealNeeded(placement, GEOMETRY.grid, viewport, visible)) return;
      // `scrollTo` and not `scrollIntoView`: the card is a React Flow node this
      // component never holds an element for, and the browser would scroll every
      // ancestor of it — including the app shell — to satisfy the request.
      scroller.scrollTo(revealScroll(placement, GEOMETRY.grid, visible));
      return;
    }

    if (canvasWidth === 0 || canvasHeight === 0) return;
    revealed.current = selectedId;

    const viewport = getViewport();
    const canvas = { width: canvasWidth, height: canvasHeight };
    if (!revealNeeded(placement, GEOMETRY.graph, viewport, canvas)) return;

    const centre = cardCenter(placement, GEOMETRY.graph);
    void setCenter(centre.x, centre.y, { zoom: viewport.zoom });
  }, [
    selectedId,
    layout,
    view,
    canvasWidth,
    canvasHeight,
    getViewport,
    setCenter,
  ]);

  /**
   * A CONNECT GESTURE IS TWO IDS AND NOTHING ELSE. Which relation types the canon
   * permits between them, whether the person meant the other direction, and what
   * to say when it permits none are all the caller's — this canvas has no opinion
   * about the grammar and no way to ask about it.
   *
   * The two ids arrive as the canvas keys them and leave as the graph knows them.
   * Only a card carries a handle, so a connection with an end this cannot name is
   * the type telling the truth rather than a case this canvas can be in.
   */
  const handleConnect = useCallback(
    (connection: Connection) => {
      const from = graphIdOfCard(connection.source);
      const to = graphIdOfCard(connection.target);
      if (from === null || to === null) return;
      onConnect(from, to);
    },
    [onConnect],
  );

  const canvas = (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      /* THE CONNECT GESTURE HAS NO DOT TO AIM AT, which these three props are the
         rest of.

         `connectionLineComponent` — the drag's origin is the handle's centre, and
         the handle is the whole card, so the library's own line would begin under
         the card and appear only once the pointer had cleared it. Ours starts on
         the border facing the pointer.

         `connectOnClick={false}` — the library's click-then-click connect defaults
         to ON, and with a full-card handle every click on a card would arm it: the
         next click anywhere would complete a relation, colliding with
         `onNodeClick`, which opens the panel.

         `connectionDragThreshold={4}` — how far the pointer must travel before a
         press becomes a connection. The default of 1px turns a hand tremor on a
         card into a flashed connection line now that the whole card is the
         origin. */
      connectionLineComponent={FloatingConnectionLine}
      connectOnClick={false}
      connectionDragThreshold={4}
      nodesConnectable
      /* NO CARD IS DRAGGABLE, and it is not a restriction — it is the absence of
         somewhere to put the answer. No position is stored anywhere in this
         system, so a card that stayed where it was dropped would be showing a fact
         the graph does not hold, and the next reload would move it back. */
      nodesDraggable={false}
      proOptions={{ hideAttribution: true }}
      /* THE GRID IS NOT A CAMERA AT ALL, and these seven say so. The requirement
         is literal — *"grid view에서는 zoom in/out 기능이 없이 스크롤로 표 형태
         배치를 이동한다"* — and now that the board is a document of its own size,
         the movement is the browser's and React Flow is asked to sit still.

         The min/max clamp is the load-bearing half: with `panOnScroll` off, a
         Cmd/Ctrl + wheel still reaches the library's zoom handler, and pinning
         both ends to `READABLE_ZOOM` neutralises that path along with pinch and
         double-click. `panOnDrag` is the one that is easy to forget — its default
         is TRUE, so a background drag would still slide the board out from under
         a scrollbar that had not moved.

         `panOnScroll={false}` AND `preventScrolling={false}` ARE ONE DECISION.
         The first stops the library panning on the wheel; the second stops it
         calling `preventDefault` on wheel events it is not using — which it does
         by default, and which would leave the grid's scroll area receiving
         nothing at all. Either one alone is a grid that does not scroll.

         THE TWO `autoPan*` ARE THE SAME CLAIM ABOUT THE GESTURES THAT MOVE THE
         CANVAS WITHOUT BEING ASKED. Both default to TRUE and neither is reached
         by any of the props above: hold a connect drag or a selection box within
         20px of the pane's edge and the library pans the canvas itself, on a
         frame loop, for as long as you hold it there. In a view whose position
         IS its scroll offset, that write lands somewhere nothing reads and
         nothing resets. Measured in Chromium at 1280x800: a connect drag from
         the first card, held two pixels inside the top edge for half a second,
         left the canvas at `translate(0px, 489px)` with the scroll still at 0,0
         — the board sat 489px below its own scrollbars, scrolling did not bring
         it back, and only a view switch, which remounts, did. `autoPanOnNodeDrag`
         needs nothing: `nodesDraggable={false}` means there is no node drag to
         pan for. `autoPanOnNodeFocus` needs nothing either — tabbing to a card
         off to the right scrolled the scroll area to 711 and left the transform
         at the identity.

         The graph takes the other side of all seven: it pans on scroll in both
         axes and keeps the wheel to itself, zooms by pinch, double-click and the
         Controls buttons instead, and auto-pans on both gestures because there
         the camera IS the position.

         THE GRAPH'S WHEEL CHANGED HERE, AND ON PURPOSE — it used to zoom. The
         grid's requirement is what decides it: there the wheel MUST scroll, and
         a graph that scaled on the same gesture would make the view tabs a mode
         switch for the hand as well as for the eye. Now a wheel MOVES the board
         in both views and never scales it, and zoom is the gesture it always
         also was: Cmd/Ctrl + wheel, pinch, double-click, and the Controls. */
      minZoom={view === "grid" ? READABLE_ZOOM : GRAPH_MIN_ZOOM}
      maxZoom={view === "grid" ? READABLE_ZOOM : GRAPH_MAX_ZOOM}
      panOnDrag={view === "graph"}
      zoomOnPinch={view === "graph"}
      zoomOnDoubleClick={view === "graph"}
      panOnScroll={view === "graph"}
      panOnScrollMode={PanOnScrollMode.Free}
      zoomOnScroll={false}
      preventScrolling={view === "graph"}
      autoPanOnConnect={view === "graph"}
      autoPanOnSelection={view === "graph"}
      {...openingProps}
      onConnect={handleConnect}
      onNodeClick={(_event, node) => {
        // Only a card carries the card prefix, and only a card answers to a
        // graph id. The scenery is `pointer-events: none` and cannot reach this
        // handler at all, so both checks are the type telling the truth rather
        // than a case this canvas can be in.
        const id = graphIdOfCard(node.id);
        if (id !== null && byId.has(id)) onSelect(id);
      }}
      /* A CLICK ON THE BOARD'S GROUND, WHICH IS THE LIBRARY'S OWN `pane` AND NOT
         AN ELEMENT THIS FILE PUTS DOWN. It fires only when nothing above the pane
         took the click, and the scenery is what makes that the right test: bands,
         lanes and column headers all carry `pointerEvents: "none"` from
         `view/furniture.ts`, so a click on a band's ground or on an empty ruled
         slot falls through to the pane and counts as a click on nothing —
         which is what a person means by it.

         IT CANNOT FIRE AT THE END OF A CONNECT DRAG. `Pane`'s own click handler
         swallows the event when a connection ended on it or is still in progress
         (12.11.2), so releasing a relation over empty canvas does not read as a
         click on the background. */
      onPaneClick={onBackgroundClick}
      /* THE THREE CONTEXT HANDLERS ONLY REPORT. Each says what the pointer was
         over and returns; the menu is a shadcn ContextMenu wrapped around this
         canvas, and it opens on the SAME contextmenu event as it bubbles on up to
         its trigger.

         SO NOTHING HERE TOUCHES THE EVENT. Not `stopPropagation`, which would
         take that event away from the trigger and leave the menu never opening —
         that is the one that actually breaks it. And not `preventDefault` either,
         even though on its own it is harmless: the trigger's own handler does
         both when it opens, so suppressing the browser's menu here would be a
         second home for a decision that already has one, and it would suppress it
         on a right-click the trigger declined to open on.

         React Flow itself never calls either one on these three — checked in
         12.11.2 rather than assumed — except when `panOnDrag` is given the right
         button, which this canvas does not do. */
      onPaneContextMenu={(event) => {
        // The point arrives in CLIENT coordinates and `typeAtPoint` reads the
        // board's own. `screenToFlowPosition` is the only thing that knows the
        // viewport's pan and scale, and the grid's clamped scroll offset is
        // exactly where doing this arithmetic by hand goes subtly wrong.
        const nodeType = typeAtPoint(
          layout,
          screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        );
        onContextTarget({ kind: "pane", nodeType });
      }}
      onNodeContextMenu={(_event, node) => {
        const id = graphIdOfCard(node.id);
        if (id !== null && byId.has(id)) onContextTarget({ kind: "node", id });
      }}
      onEdgeContextMenu={(_event, edge) => {
        onContextTarget({ kind: "edge", id: edge.id });
      }}
    >
      {/* THE FURNITURE IS THE GRAPH VIEW'S. The dot lattice belongs to a canvas
          you pan freely over; the zoom controls operate a camera the grid does not
          have, and a button that changes nothing is worse than no button. The
          dots take their colour from `--xy-background-pattern-color`, which
          `spec.css` maps onto the theme's border token — passing a `color` prop
          here would overrule that and put a raw value on the canvas. */}
      {view === "graph" ? (
        <>
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          {/* `showInteractive={false}`: that button toggles `nodesDraggable` and
              `nodesConnectable` together, and half of it is a promise this canvas
              cannot keep — see `nodesDraggable` above.

              HOME IS A CHILD AND THAT IS WHY IT IS LAST. `Controls` renders its
              own buttons and then whatever it was given, so a child lands under
              fit-view without this file re-declaring the three above it. The icon
              is `spec.css`'s one exemption: the library fills every svg inside a
              control button, because its own three are solid shapes, and lucide
              draws in strokes on a transparent one. */}
          <Controls showInteractive={false}>
            <ControlButton
              onClick={goHome}
              title="Home"
              aria-label="Back to the opening view"
            >
              <House />
            </ControlButton>
          </Controls>
        </>
      ) : null}
    </ReactFlow>
  );

  /**
   * THE GRAPH IS THE PANE AND THE GRID IS A DOCUMENT INSIDE ONE.
   *
   * The board element is the layout's own size, floored at the visible box so a
   * board shorter than the window still fills it: an element that stopped at the
   * last band would end the scrollable area there, and the strip below it would
   * behave differently from the strip above — a seam where the requirement asks
   * for one continuous plane. `minWidth`/`minHeight` do that flooring in CSS
   * rather than against a measured number, so there is no frame in which the
   * board is sized against a canvas nobody has measured yet.
   *
   * THE FLOOR IS IN CONTAINER UNITS AND THE WRAPPER IS WHAT THEY NAME, which is
   * the one thing here that looks ornamental and is not. It was `100%` until the
   * scroll area grew a `Content` wrapper — the part that watches the board's own
   * size, without which a board that gets taller after mount never gets a
   * vertical scrollbar. That wrapper's height is `auto`, and a percentage
   * min-height against an auto-height parent resolves to nothing: measured in
   * Chromium, the empty board went straight back to its own 412px inside a 602px
   * pane. `100cqw`/`100cqh` ask the nearest SIZE container instead, which
   * `[container-type:size]` here makes this wrapper — an element whose `inset-0`
   * already fixes it to the pane, so the units are the pane's own box and nothing
   * in between can absorb them. Sizing the `Content` wrapper instead was tried
   * and rejected: `min-height` there does not reach the board either, and a
   * height that would has to stop growing, which is exactly what stops the
   * scrollbar appearing again.
   *
   * IT CARRIES NO SURFACE OF ITS OWN — no background, no border, no rounding, no
   * shadow. Everything visible on it is furniture the layout placed, and the
   * canvas paints `--card` because `spec.css` maps `--xy-background-color` onto
   * the same token the frame around it uses. Where the board ends is therefore
   * not a thing you can see, which is the point.
   *
   * THE SCROLL AREA IS TAKEN OUT OF FLOW, and that is not a positioning
   * preference — it is what stops the board resizing the app. The shell's root is
   * `min-h-svh`: a floor and not a ceiling, so the page grows to fit whatever is
   * in it, and every frame between here and there is `flex-1`, which shrinks only
   * inside a container that has a size of its own. An in-flow child asking for
   * 718px of height therefore does not scroll — it pushes, and the whole app
   * scrolls instead of the grid. Measured in Chromium: a 718px board in a 700px
   * window gave a 916px document and a scroll area that never overflowed at all.
   * Out of flow, the board fills the pane the layout gave it and overflows inside
   * it, and the page stays the size of the window.
   *
   * THE POSITIONING IS A WRAPPER AND NOT A CLASS ON THE SCROLL AREA, because Base
   * UI writes `position: relative` INLINE on that root — it is what its scrollbars
   * anchor against — and no utility class outranks an inline style. Passing
   * `absolute` there is silently ignored; the div is the honest way to say it.
   *
   * THE GRAPH IS NOT WRAPPED, and the difference is deliberate rather than
   * incidental. A scroll area around an unbounded plane would be claiming an edge
   * that is not there, and a sized container would clip it. Because the two
   * branches return different elements, switching views drops one subtree and
   * builds the other: the grid cannot arrive holding the graph's transform, and
   * the graph cannot arrive inside a scroll offset left over from the grid. The
   * opening viewport above depends on exactly that.
   */
  if (view === "graph") return canvas;

  return (
    <div className="absolute inset-0 [container-type:size]">
      <ScrollArea className="size-full">
        <div ref={boardRef} style={boardStyle}>
          {canvas}
        </div>
      </ScrollArea>
    </div>
  );
}
