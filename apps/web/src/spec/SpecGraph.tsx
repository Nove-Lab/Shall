import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  PanOnScrollMode,
  ReactFlow,
  useReactFlow,
  useStore,
  type Connection,
  type CoordinateExtent,
} from "@xyflow/react";
import { NODE_TYPES, type CanvasNode } from "./canvas-nodes";
import { FloatingConnectionLine } from "./FloatingConnectionLine";
import { ARROW_END, EDGE_TYPES, type FloatingEdge } from "./FloatingEdge";
import {
  READABLE_ZOOM,
  contentExtent,
  openingViewport,
  originViewport,
  revealCenter,
  revealNeeded,
} from "./view/camera";
import { floatingEndpoints } from "./view/edge-geometry";
import { routeAroundCards } from "./view/edge-routing";
import {
  cardNodeId,
  cardPieces,
  furniturePieces,
  graphIdOfCard,
} from "./view/furniture";
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
 * WHAT THE LIBRARY DOES AND IS NOT REIMPLEMENTED: panning, scrolling, zooming,
 * culling, the zoom controls, hit-testing and the connect gesture. What this file
 * does: ask `view/` where everything goes, hand the answer over, and report what
 * the pointer landed on.
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
 * library drops its own changes on that path. What a card looks like is
 * `data.selected`, which is the caller's `selectedId` read per render.
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
  selectedId: string | null;
  onSelect: (id: string) => void;
  onConnect: (sourceId: string, targetId: string) => void;
  onContextTarget: (target: MenuTarget) => void;
}

/**
 * The graph view's pan bounds: React Flow's own default, written out rather than
 * left off.
 *
 * `translateExtent` is what nails the grid to its board, and the graph must not
 * inherit it. Omitting the prop for one view means handing it `undefined`, which
 * `exactOptionalPropertyTypes` refuses, and forking the element into two prop
 * lists would undo the one canvas this file exists to be. This is the same pair
 * the library falls back to — copied rather than imported, because
 * `@xyflow/system` is a transitive dependency this app does not declare.
 */
const UNBOUNDED: CoordinateExtent = [
  [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
];

/**
 * How far out and how far in the GRAPH view may be zoomed, carried over from the
 * board this ports from rather than re-chosen.
 *
 * The floor is for orientation and not for reading: 23 columns at a 188px pitch
 * are 4 324px across, which no window frames at a legible scale, so zooming out
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
  selectedId,
  onSelect,
  onConnect,
  onContextTarget,
}: SpecGraphProps) {
  const { getViewport, screenToFlowPosition, setCenter, setViewport } =
    useReactFlow();

  /**
   * THE CANVAS'S OWN PIXEL SIZE, WHICH IS WHERE THE LIBRARY KEEPS IT — and the
   * grid's layout needs the height, because that is what the four bands share out
   * so an empty grid fills the screen.
   *
   * Both are 0 until React Flow has measured the pane, which is a state this
   * component is in on its first frame and has to survive: `openingViewport`
   * answers `null` there, and the extent below stays unbounded rather than being
   * computed against a zero.
   *
   * THE WIDTH IS DELIBERATELY NOT A LAYOUT INPUT. Opening the detail panel
   * narrows this canvas by a few hundred pixels, and the board's width comes from
   * its own columns, so the panel clips and scrolls the board instead of
   * re-flowing it. The width is read here only for what is genuinely about the
   * screen: how far the grid may be scrolled.
   */
  const canvasWidth = useStore((state) => state.width);
  const canvasHeight = useStore((state) => state.height);

  /**
   * `graphLayout` does not read the canvas at all, so the height is a dependency
   * of the GRID only. Passed unconditionally it would make every window resize in
   * the graph view rebuild every node object for a layout that cannot have
   * changed — and a rebuilt node is one React Flow re-measures.
   */
  const layoutHeight = view === "grid" ? canvasHeight : 0;
  const layout: Layout = useMemo(
    () =>
      view === "grid" ? gridLayout(nodes, layoutHeight) : graphLayout(nodes),
    [view, nodes, layoutHeight],
  );

  const byId = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  /**
   * THE SCENERY, MEMOISED ON EXACTLY WHAT IT IS A FUNCTION OF — `[layout, view]`,
   * and the reason is a library fast path rather than a frame budget.
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
   */
  const furniture = useMemo(() => furniturePieces(layout, view), [layout, view]);

  /** The cards, which are the same call plus the one thing that changes on a click. */
  const cards = useMemo(
    () => cardPieces(layout, view, byId, selectedId),
    [layout, view, byId, selectedId],
  );

  const flowNodes = useMemo<CanvasNode[]>(
    () => [...furniture, ...cards],
    [furniture, cards],
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
   */
  const flowEdges = useMemo<FloatingEdge[]>(() => {
    const geometry = view === "grid" ? GEOMETRY.grid : GEOMETRY.graph;
    const placed = new Map(
      layout.placements.map((placement) => [placement.id, placement]),
    );
    const boxes = layout.placements.map((placement) => ({
      id: placement.id,
      box: {
        x: placement.x,
        y: placement.y,
        width: geometry.cardWidth,
        height: geometry.cardHeight,
      },
    }));

    const built: FloatingEdge[] = [];
    for (const edge of edges) {
      const source = placed.get(edge.fromId);
      const target = placed.get(edge.toId);
      if (source === undefined || target === undefined) continue;

      const ends = floatingEndpoints(source, target, geometry, view);
      const route = routeAroundCards({
        start: { x: ends.sx, y: ends.sy },
        startSide: ends.sourceSide,
        end: { x: ends.tx, y: ends.ty },
        endSide: ends.targetSide,
        offset: ends.offset,
        obstacles: boxes
          .filter((card) => card.id !== edge.fromId && card.id !== edge.toId)
          .map((card) => card.box),
      });

      built.push({
        id: edge.id,
        // The two cards as the CANVAS keys them: React Flow resolves these
        // against its node lookup to find the handles an edge hangs off, and a
        // relation whose ends it cannot find is not drawn at all.
        source: cardNodeId(edge.fromId),
        target: cardNodeId(edge.toId),
        type: "floating",
        // The relation's TYPE travels on `data` rather than in the library's own
        // `label`: in this grammar a relation is its type and its direction, and
        // a line carrying neither is half a statement.
        data: { route, edgeType: edge.type },
        markerEnd: ARROW_END,
      });
    }
    return built;
  }, [edges, layout, view]);

  /**
   * WHAT THE GRID MAY BE SCROLLED OVER — its own board, and never past the edge of
   * it. The geometry is `contentExtent`, where the `max()` that keeps the origin
   * at the origin is explained and can be executed.
   *
   * The two decisions only this component can make are here: the graph view keeps
   * the library's unbounded pair, and so does an UNMEASURED canvas. A `max()`
   * against a zero canvas is the bare board, which d3-zoom then CENTRES and never
   * re-constrains when the extent later grows — so the grid would open translated
   * a few hundred pixels off its own corner and stay there. Unmeasured means no
   * constraint at all until there is a real canvas to compare against.
   */
  const translateExtent = useMemo<CoordinateExtent>(() => {
    if (view !== "grid" || canvasWidth === 0 || canvasHeight === 0) {
      return UNBOUNDED;
    }
    // Re-laid into the library's own mutable pair rather than cast: `contentExtent`
    // answers a `readonly` tuple so that nothing downstream can write into it.
    const [min, max] = contentExtent(layout, {
      width: canvasWidth,
      height: canvasHeight,
    });
    return [
      [min[0], min[1]],
      [max[0], max[1]],
    ];
  }, [view, layout, canvasWidth, canvasHeight]);

  /**
   * EACH VIEW OPENS AT ITS OWN CAMERA, and both cameras are the same scale.
   *
   * The grid opens at its own top-left corner, which is a constant rather than a
   * function of the graph: an empty project opens where a full one does, and
   * coming back from the graph returns here instead of inheriting wherever that
   * view was panned to. The graph opens at `READABLE_ZOOM` anchored
   * `ANCHOR_MARGIN` in from its leftmost column header, in both axes.
   *
   * THE GRID'S ENTRY IS NOT OPTIONAL EVEN THOUGH ITS ZOOM IS PINNED. Changing
   * `minZoom`/`maxZoom` updates d3's scale extent but does not retroactively clamp
   * the transform already in the store, so a graph panned to 0.4 would arrive in
   * the grid still at 0.4 and only snap on the next gesture. Setting the viewport
   * on entry is what corrects it in the same effect.
   *
   * WHICH VIEW WE ARE IN AND WHETHER ITS CAMERA WAS APPLIED ARE TWO FACTS, hence
   * two refs. The canvas is measured after mount, so a view entered inside that
   * window has nothing to aim at yet — `openingViewport` answers `null` and the
   * camera stays OWED, while the view change itself is already spent. Conflated
   * into one flag, the return to the grid would find its entry consumed and never
   * set the origin.
   *
   * `graphCameraOwed` starts at `view === "graph"` so that mounting straight into
   * the graph is an entry too. Mounting into the grid owes nothing: React Flow's
   * own default viewport is the origin at zoom 1, which is exactly what the grid
   * wants.
   */
  const enteredView = useRef(view);
  const graphCameraOwed = useRef(view === "graph");
  useEffect(() => {
    if (enteredView.current !== view) {
      enteredView.current = view;
      graphCameraOwed.current = view === "graph";
      if (view === "grid") void setViewport(originViewport());
    }
    if (!graphCameraOwed.current) return;

    const opening = openingViewport(layout, canvasHeight);
    if (opening === null) return;
    graphCameraOwed.current = false;
    void setViewport(opening);
  }, [view, layout, canvasHeight, setViewport]);

  /**
   * A CARD YOU JUST AUTHORED IS BROUGHT ON SCREEN, and only then.
   *
   * Both layouts place a node by its TYPE, so authoring from the toolbar — which
   * points at no column — can land a card columns away from whatever you were
   * looking at: measured at 1200x800, a card authored into one of the last
   * columns sat near x = 4000 while the canvas pane ended at 834, with the
   * detail panel open on a card nobody could see. `revealNeeded` and
   * `revealCenter` are where that arithmetic lives and can be executed; this
   * effect is the plumbing only a browser can run.
   *
   * IT FIRES ON A CHANGE OF SELECTION AND NOT ON A CHANGE OF VIEWPORT. The
   * viewport is read through `getViewport()` rather than subscribed to, so
   * scrolling away from the open card does not drag the camera back; the ref
   * remembers which id has already been revealed so that a re-render, a refetch
   * or a view switch is not a second reveal of the same card.
   *
   * THE CLAMP IS `revealCenter`'S AND IS THE REASON IT EXISTS: `setCenter` writes
   * the transform straight through d3-zoom without its `constrain()`, so
   * centring on a card near the grid's own corner would paint blank space above
   * and left of the origin the grid scrolls from, and snap back only on the next
   * wheel event. The graph hands in the unbounded pair and gets its target back
   * untouched.
   *
   * AN UNMEASURED CANVAS IS WAITED OUT rather than aimed at: the layout and the
   * canvas size are dependencies, so the effect runs again with real numbers,
   * and the ref is only set once a placement was actually found.
   */
  const revealed = useRef<string | null>(null);
  useEffect(() => {
    if (selectedId === null) {
      revealed.current = null;
      return;
    }
    if (revealed.current === selectedId) return;
    if (canvasWidth === 0 || canvasHeight === 0) return;

    const placement = layout.placements.find(
      (candidate) => candidate.id === selectedId,
    );
    if (placement === undefined) return;
    revealed.current = selectedId;

    const geometry = view === "grid" ? GEOMETRY.grid : GEOMETRY.graph;
    const canvas = { width: canvasWidth, height: canvasHeight };
    const viewport = getViewport();
    if (!revealNeeded(placement, geometry, viewport, canvas)) return;

    const centre = revealCenter(
      placement,
      geometry,
      translateExtent,
      canvas,
      viewport.zoom,
    );
    void setCenter(centre.x, centre.y, { zoom: viewport.zoom });
  }, [
    selectedId,
    layout,
    view,
    canvasWidth,
    canvasHeight,
    translateExtent,
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

  return (
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
      /* THE GRID IS NOT A CAMERA. The requirement is literal — *"grid view에서는
         zoom in/out 기능이 없이 스크롤로 표 형태 배치를 이동한다"* — so scrolling
         pans and never zooms.

         The min/max clamp is the load-bearing half: `zoomOnScroll={false}` alone
         leaves the zoom-activation-key path (Cmd/Ctrl + wheel) open, and pinning
         both ends to `READABLE_ZOOM` neutralises pinch, double-click and that path
         at once. `panOnDrag` is the one that is easy to forget — its default is
         TRUE, so a background drag would still slide the board while the
         requirement says movement is scroll and nothing else. The two `zoomOn*`
         flags below are already dead under the clamp and are set anyway, so the
         intent is legible rather than inferred from a pair of equal numbers. */
      minZoom={view === "grid" ? READABLE_ZOOM : GRAPH_MIN_ZOOM}
      maxZoom={view === "grid" ? READABLE_ZOOM : GRAPH_MAX_ZOOM}
      panOnDrag={view === "graph"}
      zoomOnPinch={view === "graph"}
      zoomOnDoubleClick={view === "graph"}
      /* The grid moves by scroll and the graph zooms by it — both the library's
         own props, neither a hand-written wheel handler. `panOnScrollMode`
         restates the library's own default so that the grid says which of the
         three modes it means; it changes nothing. */
      panOnScroll={view === "grid"}
      panOnScrollMode={PanOnScrollMode.Free}
      zoomOnScroll={view === "graph"}
      translateExtent={translateExtent}
      onConnect={handleConnect}
      onNodeClick={(_event, node) => {
        // Only a card carries the card prefix, and only a card answers to a
        // graph id. The scenery is `pointer-events: none` and cannot reach this
        // handler at all, so both checks are the type telling the truth rather
        // than a case this canvas can be in.
        const id = graphIdOfCard(node.id);
        if (id !== null && byId.has(id)) onSelect(id);
      }}
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
              cannot keep — see `nodesDraggable` above. */}
          <Controls showInteractive={false} />
        </>
      ) : null}
    </ReactFlow>
  );
}
