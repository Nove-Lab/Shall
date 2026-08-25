import { useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  PanOnScrollMode,
  ReactFlow,
} from "@xyflow/react";
import { isNodeType } from "@shall/core/graph";
import { NODE_TYPES, type CanvasNode } from "../canvas-nodes";
import {
  EDGE_TYPES,
  floatingEdgeOf,
  type FloatingEdge,
} from "../FloatingEdge";
import { routedEdges } from "../view/edges";
import { bandPieces, graphIdOfCard, typeCardPieces } from "../view/furniture";
import { highlightFor } from "../view/highlight";
import { METAMODEL, metamodelBoard } from "./layout";
import { metamodelRelations } from "./relations";
import "@xyflow/react/dist/style.css";
import "../spec.css";

/**
 * THE CANON, DRAWN IN THE SAME LANGUAGE AS THE BOARD IT EXPLAINS.
 *
 * IT IS A MANUAL AND NOT A VIEW OF A PROJECT. Every node here is a TYPE and
 * every line a relation the canon ALLOWS, so nothing on it is coloured, nothing
 * is judged and nothing can be edited — the one gesture is a click, which lights
 * what a type touches.
 *
 * IT NAMES ITSELF, AND THAT PROP IS NOT DECORATION. React Flow derives every
 * document-scoped id it writes from `rfId` — the `<Background>` pattern is
 * `pattern-${rfId}`, and a `<rect>` asks for it by `url(#…)`, which resolves to
 * the FIRST match in the document. The Spec plane's own flow passes no id, so it
 * takes the library's default `"1"`, and this dialog is portalled to
 * `document.body` — after `#root` — while the plane stays mounted behind it.
 * Unnamed, the dots in here would be painted with the PLANE's pattern: they
 * would sit still while this canvas pans, at the plane's zoom. It only happens
 * while the plane is on its Graph tab, which is exactly the shape of bug that
 * gets called a flicker and never found.
 *
 * THE WRAPPER CARRIES `spec-canvas` FOR THE SAME KIND OF REASON. Every `--xy-*`
 * mapping — the edge stroke the arrowheads take their colour from, the dot
 * colour, the controls — is scoped to that class in `spec.css`, and a portalled
 * dialog is not inside the plane's copy of it.
 *
 * NOTHING IS PERSISTED. The board is a pure function of the canon, the camera
 * fits it on mount, and closing the dialog unmounts the lot.
 */

/** The whole board in a narrow pane, and the graph view's own ceiling. */
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 1.4;

export function MetamodelGraph() {
  const [selected, setSelected] = useState<string | null>(null);

  // The board and its relations are the canon and nothing else, so they are
  // computed once for the life of the dialog.
  const board = useMemo(() => metamodelBoard(), []);
  const relations = useMemo(() => metamodelRelations(), []);
  const bands = useMemo(() => bandPieces(board.bands), [board]);

  /**
   * ROUTING IS NOT KEYED ON THE SELECTION, the split the Spec plane makes for
   * the same reason: a click changes what a line looks like and never where it
   * goes, and routing is the expensive half.
   */
  const routed = useMemo(
    () => routedEdges(board.placements, relations, METAMODEL, "graph"),
    [board, relations],
  );

  const highlight = useMemo(
    () => highlightFor(relations, selected),
    [relations, selected],
  );
  const cards = useMemo(
    () => typeCardPieces(board.placements, METAMODEL, highlight),
    [board, highlight],
  );
  const flowNodes = useMemo<CanvasNode[]>(
    () => [...bands, ...cards],
    [bands, cards],
  );
  const flowEdges = useMemo<FloatingEdge[]>(
    () =>
      routed.map(({ edge, route, dashed }) =>
        // EVERYTHING IS QUIET ON THE LEGEND. Seventy-odd relations naming
        // themselves at once is ink, not information — the fan-in families
        // pile their words into one smear — so an edge here says its name
        // only while it touches the clicked type, where the highlight has
        // already thinned the picture down to what one type touches.
        floatingEdgeOf(edge, edge.label, route, dashed, highlight, true),
      ),
    [routed, highlight],
  );

  return (
    <div className="spec-canvas bg-muted/30 dark:bg-background/30 relative h-[70vh] overflow-hidden rounded-lg border">
      <ReactFlow
        id="metamodel"
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        connectOnClick={false}
        // A modal that traps focus and eighty stops in it is a keyboard trap;
        // the plane is not modal and keeps its own answer.
        nodesFocusable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: true }}
        panOnDrag
        zoomOnPinch
        zoomOnDoubleClick
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        zoomOnScroll={false}
        preventScrolling
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        // `fitView` and not a `defaultViewport`: this board's size is known
        // before it mounts but the pane's is not, and the whole picture at
        // whatever size the dialog got is the only useful opening.
        fitView
        fitViewOptions={{ padding: "24px" }}
        onNodeClick={(_event, node) => {
          const type = graphIdOfCard(node.id);
          if (type !== null && isNodeType(type)) {
            setSelected(type);
          }
        }}
        onPaneClick={() => setSelected(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
