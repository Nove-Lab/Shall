import { useCallback, useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Eye,
  LayoutGrid,
  Pencil,
  Plus,
  Trash2,
  Unlink,
  Waypoints,
} from "lucide-react";
import { permittedEdgeTypes } from "@shall/core/graph";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { useProject } from "@/project-context";
import { NodePanel, type NodeDraft, type NodePanelMode } from "./NodePanel";
import { SpecGraph, type MenuTarget } from "./SpecGraph";
import type { SpecEdge, SpecNode } from "./spec-node";
import "./spec.css";

/**
 * Closed, writing a new node, or sitting on one the graph already has.
 *
 * `presetType` is the column a right-click landed in, and `request` is which
 * ask this is. The counter exists because the form is not remounted between two
 * asks: `NodePanel` reads `presetType` once when it fills the form, so a second
 * "add node here" in another column has to be distinguishable from the first or
 * the open form stays aimed where it was first pointed. Its own re-aim effect
 * carries the rest of the reason.
 */
type PanelState =
  | { mode: "closed" }
  | { mode: "create"; presetType?: string; request: number }
  | { mode: "view" | "edit"; id: string };

/**
 * A connect gesture waiting on the person: which relation did they mean, or —
 * when the canon has none this way round — the sentence saying so.
 *
 * Both answers are read off the canon here rather than asked of the daemon,
 * because a dialog that lists the wrong relations is worse than a round trip is
 * slow. The daemon settles it again on the way in and its refusal is the
 * authority; this decides only what the screen offers.
 */
interface Connect {
  from: SpecNode;
  to: SpecNode;
  /** What the canon allows this way round, in canon order. Empty is the refusal. */
  types: string[];
  /** What it allows the other way round. Only read when `types` is empty. */
  reverse: string[];
}

/** A destructive menu item waiting on its confirmation. */
type PendingDelete =
  | { kind: "node"; node: SpecNode }
  | { kind: "edge"; edge: SpecEdge };

/**
 * WHAT A RIGHT-CLICK IS OVER UNTIL THE CANVAS SAYS OTHERWISE — the gutter, which
 * is the honest answer for a pointer that is inside the canvas and on nothing in
 * particular. See the capture handler on the trigger for why this is a reset
 * value and not only an initial one.
 */
const GUTTER: MenuTarget = { kind: "pane", nodeType: null };

/**
 * A node the panel points at can be gone — someone deleted it, or the project
 * reloaded under it — and a pane with nothing to show closes instead.
 */
function detailMode(
  panel: PanelState,
  selected: SpecNode | null,
): NodePanelMode | null {
  if (panel.mode === "create") {
    return "create";
  }
  if (panel.mode === "closed" || !selected) {
    return null;
  }
  return panel.mode;
}

/**
 * The create form's preselected type, as a prop object rather than a value.
 *
 * `exactOptionalPropertyTypes` will not take `presetType={undefined}` for a prop
 * declared `presetType?: string`, and it is right not to: "no column" and "the
 * column named undefined" are different asks, and the panel distinguishes them.
 * An absent column is therefore an absent prop.
 */
function presetProps(panel: PanelState): { presetType?: string } {
  return panel.mode === "create" && panel.presetType !== undefined
    ? { presetType: panel.presetType }
    : {};
}

/**
 * What to say when the canon has no relation the way the arrow was drawn.
 *
 * THE SECOND SENTENCE IS THE USEFUL ONE. Dragging from the wrong end is the
 * common mistake, and a person who reads which relation runs the other way
 * fixes it in one gesture instead of going to look for a grammar table. It is
 * left out when the reverse is empty as well, because then "no relation either
 * way" is the whole answer and a clause about a direction that has none too is
 * noise — which is also the case whenever the two nodes share a type, since
 * there the reverse IS this direction.
 */
function refusalSentence(connect: Connect): string {
  const none = `The canon has no relation from ${connect.from.type} to ${connect.to.type}.`;
  if (connect.reverse.length === 0) {
    return `${none} It has none the other way round either.`;
  }
  return `${none} The other direction allows ${connect.reverse.join(", ")} — drag from ${connect.to.id} to ${connect.from.id} instead.`;
}

/**
 * The graph frame is the whole plane: no page title, because the plane row
 * already says where you are. Its toolbar picks the view and adds nodes, and
 * a node's detail pane docks inside the frame as a second resizable panel.
 *
 * EVERY MUTATION IS FOLLOWED BY A REFETCH AND THERE IS NO QUERY CACHE. One
 * `load()` reads the whole graph, every write calls it again, and what is on
 * screen is therefore always what the daemon last answered. It is more traffic
 * than a cache would be and it cannot go stale, which is the trade this file
 * has already made everywhere else.
 */
export function SpecPlane() {
  const project = useProject();
  const [nodes, setNodes] = useState<SpecNode[]>([]);
  const [edges, setEdges] = useState<SpecEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * THE PLANE OPENS ON THE GRID. It is the view that shows the whole canon at
   * once — every type has a lane whether or not anything is in it — so arriving
   * here answers "what can this hold" before "what is in it", and it is the one
   * that reads at a glance on a project with three nodes in it.
   */
  const [view, setView] = useState<"graph" | "grid">("grid");
  const [panel, setPanel] = useState<PanelState>({ mode: "closed" });
  const [menuTarget, setMenuTarget] = useState<MenuTarget>(GUTTER);
  /**
   * The two dialogs, each with its own busy flag and its own refusal line: a
   * write that is refused leaves its dialog open carrying the daemon's sentence,
   * so the person reads why beside the thing they were doing. Sharing one pair
   * between them would let a stale sentence from the other dialog arrive with it.
   */
  const [connect, setConnect] = useState<Connect | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /**
   * The whole graph in one round trip, and the two halves land together.
   *
   * `Promise.all` is not about latency here: set one at a time, there is a
   * render in between holding the new nodes against the old relations, and an
   * edge whose endpoint has not arrived yet is silently dropped by the canvas.
   * React batches both setters inside this callback, so no render sees a mixed
   * pair.
   */
  const load = useCallback(async () => {
    const [nextNodes, nextEdges] = await Promise.all([
      api.spec.nodes.query({ projectId: project.id }),
      api.spec.edges.query({ projectId: project.id }),
    ]);
    setNodes(nextNodes);
    setEdges(nextEdges);
  }, [project.id]);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    // A dialog is about a node or a relation in the project being left, so it
    // does not survive the move to another one.
    setPanel({ mode: "closed" });
    setConnect(null);
    setPendingDelete(null);
    void load()
      .catch((error: unknown) =>
        setLoadError(
          error instanceof Error
            ? error.message
            : "Could not read the spec graph",
        ),
      )
      .finally(() => setLoading(false));
  }, [load]);

  const selected =
    panel.mode === "view" || panel.mode === "edit"
      ? (nodes.find((node) => node.id === panel.id) ?? null)
      : null;
  const mode = detailMode(panel, selected);

  /**
   * The menu's target resolved against the graph as it stands this render, so
   * an item can never name a node the last refetch removed.
   */
  const menuNode =
    menuTarget.kind === "node"
      ? (nodes.find((node) => node.id === menuTarget.id) ?? null)
      : null;
  const menuEdge =
    menuTarget.kind === "edge"
      ? (edges.find((edge) => edge.id === menuTarget.id) ?? null)
      : null;

  /**
   * Open the create form, aimed at a column or at nothing.
   *
   * The counter only has to differ from the value the open form is holding, so
   * it is derived from the previous state rather than kept in a ref: a create
   * that follows a closed panel starts again at 1, and the panel it is arriving
   * at was just refilled anyway.
   */
  function openCreate(presetType: string | null) {
    setPanel((current) => ({
      mode: "create",
      request: (current.mode === "create" ? current.request : 0) + 1,
      ...(presetType === null ? {} : { presetType }),
    }));
  }

  /**
   * A CLICK ON THE CANVAS'S BACKGROUND CLOSES A PANEL YOU WERE READING, AND ONLY
   * ONE YOU WERE READING.
   *
   * A `view` panel holds nothing that is not already in the graph — it is the
   * node the last click opened — so dismissing it costs the person one click to
   * get back and is the ordinary way to put the board down. Closing it also
   * clears the selection, because on this plane those are one fact: `selected` is
   * derived from `panel` a few lines up, so a closed panel is a board with
   * nothing lit and there is no second piece of state to keep in step.
   *
   * A `create` OR `edit` PANEL IS UNTOUCHED, AND THAT IS THE WHOLE POINT OF THE
   * BRANCH. There is a draft in there — a type, an id, a name, a body someone is
   * part way through typing — none of it stored anywhere yet, and a canvas click
   * is trivially easy to make while reaching for the panel. The board this ports
   * from cleared the panel unconditionally on a pane click, which is exactly the
   * behaviour the requirement rules out: *"노드 패널 작성/수정시에는 이렇게 닫히면
   * 안됨"*. A draft leaves through Cancel or through a save, both of which say so.
   *
   * `closed` FALLS THROUGH THE SAME BRANCH and closes nothing, which is the only
   * honest answer for a click on an empty board.
   *
   * IT RETURNS `current` RATHER THAN A FRESH EQUAL OBJECT on the arms that decline:
   * React bails out of a re-render when a setter is handed the state it already
   * holds, so a click on the background while a form is open re-renders neither
   * the form nor the canvas under it.
   */
  function closeReadPanel() {
    setPanel((current) =>
      current.mode === "view" ? { mode: "closed" } : current,
    );
  }

  /**
   * A CONNECT GESTURE IS ANSWERED HERE AND NOT ON THE CANVAS. The canvas reports
   * two ids; which relations the canon permits between the types they carry, and
   * what to say when it permits none, is the grammar's answer and the grammar is
   * this file's dependency.
   */
  function beginConnect(sourceId: string, targetId: string) {
    const from = nodes.find((node) => node.id === sourceId);
    const to = nodes.find((node) => node.id === targetId);
    if (from === undefined || to === undefined) {
      return;
    }
    setConnectError(null);
    setConnectBusy(false);
    setConnect({
      from,
      to,
      types: permittedEdgeTypes(from.type, to.type),
      reverse: permittedEdgeTypes(to.type, from.type),
    });
  }

  async function addRelation(type: string) {
    if (connect === null || connectBusy) {
      return;
    }

    setConnectBusy(true);
    setConnectError(null);
    try {
      await api.spec.createEdge.mutate({
        projectId: project.id,
        type,
        fromId: connect.from.id,
        toId: connect.to.id,
      });
      await load();
      setConnect(null);
    } catch (error) {
      // The daemon's own words: a duplicate, an off-grammar triple and a node
      // pointed at itself each arrive as a sentence written for the person, and
      // rewording them here would only lose what they say.
      setConnectError(
        error instanceof Error ? error.message : "Could not add the relation",
      );
    } finally {
      setConnectBusy(false);
    }
  }

  function askDelete(target: PendingDelete) {
    setDeleteError(null);
    setDeleteBusy(false);
    setPendingDelete(target);
  }

  async function runDelete() {
    if (pendingDelete === null || deleteBusy) {
      return;
    }

    setDeleteBusy(true);
    setDeleteError(null);
    try {
      if (pendingDelete.kind === "node") {
        await api.spec.removeNode.mutate({
          projectId: project.id,
          id: pendingDelete.node.id,
        });
      } else {
        await api.spec.removeEdge.mutate({
          projectId: project.id,
          id: pendingDelete.edge.id,
        });
      }
      await load();
      setPendingDelete(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : pendingDelete.kind === "node"
            ? "Could not delete the node"
            : "Could not delete the relation",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  /**
   * A save, in whichever of its two shapes this mode can send.
   *
   * A create carries all five fields; an edit carries the three that can change,
   * because the daemon will not move a node's type or its id — the id is what
   * every relation names, and the type is what decides which relations are
   * grammatical at all. `NodeDraft` is one shape for both, so the panel does not
   * have to know which of the two it is filling.
   */
  async function submitNode(draft: NodeDraft) {
    if (panel.mode === "edit") {
      const updated = await api.spec.updateNode.mutate({
        projectId: project.id,
        id: panel.id,
        shortName: draft.shortName,
        name: draft.name,
        content: draft.content,
      });
      await load();
      setPanel({ mode: "view", id: updated.id });
      return;
    }

    const created = await api.spec.createNode.mutate({
      projectId: project.id,
      type: draft.type,
      id: draft.id,
      shortName: draft.shortName,
      name: draft.name,
      content: draft.content,
    });
    await load();
    setPanel({ mode: "view", id: created.id });
  }

  async function deleteNode() {
    if (panel.mode !== "edit") {
      return;
    }

    await api.spec.removeNode.mutate({ projectId: project.id, id: panel.id });
    await load();
    setPanel({ mode: "closed" });
  }

  /**
   * WHAT IS SAID OVER THE CANVAS WHEN THERE IS NOTHING ON IT.
   *
   * THE EMPTY STATE IS THE GRAPH'S ALONE. The grid draws every column the canon
   * has, ruled and empty, which already says the board is empty and says it in
   * the place a person would go to fix it; a sentence floating over those lanes
   * says it a second time and covers the columns while doing so. The graph has no
   * such furniture — an empty one is a bare dot lattice — so there the message is
   * the only thing that speaks.
   *
   * THE FAILURE IS BOTH VIEWS'. A canvas that could not be read is not empty, it
   * is unknown, and neither view's furniture can say so.
   */
  const overlay = loading ? null : loadError ? (
    <p className="text-destructive text-sm">{loadError}</p>
  ) : nodes.length === 0 && view === "graph" ? (
    <EmptyState
      message="No spec nodes yet"
      hint="Add node puts the first one on the canvas"
    />
  ) : null;

  return (
    <main aria-label="Spec plane" className="flex min-h-0 flex-1 flex-col p-6">
      <div className="bg-card flex min-h-128 flex-1 flex-col overflow-hidden rounded-xl border">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
          <Tabs
            value={view}
            onValueChange={(value) =>
              setView(value === "grid" ? "grid" : "graph")
            }
          >
            <TabsList aria-label="Spec plane view">
              <TabsTrigger value="grid">
                <LayoutGrid />
                Grid view
              </TabsTrigger>
              <TabsTrigger value="graph">
                <Waypoints />
                Graph view
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {/* The toolbar points at no column, so it preselects no type. */}
          <Button
            className="ml-auto"
            disabled={loading || loadError !== null}
            onClick={() => openCreate(null)}
          >
            <Plus />
            Add node
          </Button>
        </div>

        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
        >
          <ResizablePanel id="spec-canvas" minSize={240}>
            {/* THE MENU IS DISABLED BY THE LIBRARY'S OWN PROP while the graph is
                unread, which is the same condition the Add node button is off
                under: a create route offered over a canvas that could not be
                loaded leads to a form whose save has nowhere to land. */}
            <ContextMenu disabled={loading || loadError !== null}>
              <ContextMenuTrigger
                /* THE BOARD IS A STEP BELOW THE CARDS, and this element is what
                   paints it. A card is `--card`; if the board were too, a card
                   would be legible only by its border and the graph would read
                   as text floating on a page rather than as objects on a plane.

                   THE TWO THEMES REACH THAT STEP FROM OPPOSITE SIDES, which is
                   why there is a `dark:` here and not one token. In light,
                   `--card` is white and `--background` is white with it, so the
                   step down has to be `--muted`. In dark, `--muted` is LIGHTER
                   than `--card` — it would put the board above the cards — and
                   `--background` is the darker surface the theme already uses
                   under raised things. Both are the theme's own tokens; the
                   choice between them is which one is actually below `--card`.

                   IT IS HALF A STEP AND NOT A WHOLE ONE. `--muted` outright was
                   a shade further from the cards than the board wants to be —
                   the point is to put the cards on something, not to make the
                   board a second object. The opacity modifier composites the
                   token over the `--card` this panel already paints, which
                   lands exactly between the two, and is the theme's own way of
                   asking for a lighter version of a colour rather than a new
                   value invented for the occasion.

                   It goes on the wrapper and not on the canvas because in the
                   grid the canvas is only as big as the board — see the note in
                   `spec.css`. */
                className="spec-canvas bg-muted/50 dark:bg-background/50 relative size-full"
                /* THE TARGET IS CLEARED ON THE WAY IN, IN THE CAPTURE PHASE, and
                   the phase is the whole point.

                   `SpecGraph`'s three handlers sit on elements INSIDE this div,
                   so they run as the event bubbles up and are finished by the
                   time the trigger below opens the menu. What they cannot do is
                   run for a right-click React Flow does not report — the zoom
                   controls are a panel of its own, and neither the pane, the
                   node nor the edge handler fires over one. Without a reset the
                   menu would open there still holding whatever was under the
                   pointer last time, offering to delete a node nobody is
                   pointing at.

                   Capture runs outermost-first, so this lands BEFORE the canvas
                   reports and never overwrites what it reported. The gutter is
                   the right thing to fall back to: it is literally true — the
                   pointer is inside the canvas and on nothing the graph owns —
                   and it offers the one item that is always safe. */
                onContextMenuCapture={() => setMenuTarget(GUTTER)}
              >
                <ReactFlowProvider>
                  <SpecGraph
                    view={view}
                    nodes={nodes}
                    edges={edges}
                    selectedId={selected?.id ?? null}
                    onSelect={(id) => setPanel({ mode: "view", id })}
                    onBackgroundClick={closeReadPanel}
                    onConnect={beginConnect}
                    onContextTarget={setMenuTarget}
                  />
                </ReactFlowProvider>
                {overlay ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    {overlay}
                  </div>
                ) : null}
              </ContextMenuTrigger>
              {/* Base UI anchors this popup to the pointer itself — the trigger
                  hands the positioner a zero-sized rect at the click's client
                  coordinates — so nothing here has to be told where the menu
                  goes, and the shadcn defaults (`side="right"`,
                  `align="start"`) drop it off the cursor's corner. */}
              <ContextMenuContent>
                {menuTarget.kind === "pane" ? (
                  /* RIGHT-CLICKING INSIDE A COLUMN PRE-PICKS THAT COLUMN'S TYPE,
                     and right-clicking a gutter deliberately does not. `null`
                     means the pointer was over no column at all, and snapping to
                     the nearest one would seat a node somewhere the person did
                     not point. */
                  <ContextMenuItem
                    onClick={() => openCreate(menuTarget.nodeType)}
                  >
                    <Plus />
                    {menuTarget.nodeType === null
                      ? "Add node"
                      : `Add ${menuTarget.nodeType} node here`}
                  </ContextMenuItem>
                ) : menuNode ? (
                  <>
                    <ContextMenuItem
                      onClick={() =>
                        setPanel({ mode: "view", id: menuNode.id })
                      }
                    >
                      <Eye />
                      Open
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() =>
                        setPanel({ mode: "edit", id: menuNode.id })
                      }
                    >
                      <Pencil />
                      Edit
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      variant="destructive"
                      onClick={() => askDelete({ kind: "node", node: menuNode })}
                    >
                      <Trash2 />
                      Delete…
                    </ContextMenuItem>
                  </>
                ) : menuEdge ? (
                  /* The relation is named by its type rather than by its two
                     ends: the ends are the two cards the line is drawn between
                     and are already on screen, and the type is the half of the
                     statement a person cannot see from the arrow alone. */
                  <ContextMenuItem
                    variant="destructive"
                    onClick={() => askDelete({ kind: "edge", edge: menuEdge })}
                  >
                    <Unlink />
                    {`Delete ${menuEdge.type} relation…`}
                  </ContextMenuItem>
                ) : null}
              </ContextMenuContent>
            </ContextMenu>
          </ResizablePanel>
          {mode ? (
            <>
              {/* `withHandle` is the grip: the border moves, and without one
                  nothing says so until a cursor happens to cross it. */}
              <ResizableHandle withHandle aria-label="Resize the node panel" />
              <ResizablePanel
                id="spec-detail"
                defaultSize={340}
                minSize={280}
                maxSize={520}
              >
                <NodePanel
                  mode={mode}
                  node={selected}
                  nodes={nodes}
                  request={panel.mode === "create" ? panel.request : 0}
                  {...presetProps(panel)}
                  onClose={() => setPanel({ mode: "closed" })}
                  onEdit={() => {
                    if (selected) {
                      setPanel({ mode: "edit", id: selected.id });
                    }
                  }}
                  onCancelEdit={() => {
                    if (selected) {
                      setPanel({ mode: "view", id: selected.id });
                    }
                  }}
                  onSubmit={submitNode}
                  onDelete={deleteNode}
                />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>

      {/* BOTH DIALOGS ARE MOUNTED ONLY WHILE THERE IS SOMETHING TO ASK. Their
          whole content is the gesture they are about — two ids, or the row that
          is going — so a closed one has nothing to draw and an emptied one open
          would draw a blank box. */}
      {connect === null ? null : (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setConnect(null);
          }}
        >
          {/* The footer's Close is the only way out that needs to be spelled,
              so the corner X would be a second one saying the same thing. */}
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              {/* The two ids, in the order the arrow was drawn. */}
              <DialogTitle>
                {connect.from.id} → {connect.to.id}
              </DialogTitle>
              <DialogDescription>
                {connect.types.length === 0
                  ? refusalSentence(connect)
                  : connect.types.length === 1
                    ? `The canon allows one relation from ${connect.from.type} to ${connect.to.type}.`
                    : `The canon allows ${connect.types.length} relations from ${connect.from.type} to ${connect.to.type}. Pick the one you mean.`}
              </DialogDescription>
            </DialogHeader>
            {/* ONE BUTTON PER PERMITTED RELATION, full width so that the single
                case reads as a confirmation of the arrow just drawn and the
                several case reads as the choice it is. The name on the button is
                the name that will be stored. */}
            {connect.types.length > 0 ? (
              <div className="grid gap-2">
                {connect.types.map((type) => (
                  <Button
                    key={type}
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={connectBusy}
                    onClick={() => void addRelation(type)}
                  >
                    {type}
                  </Button>
                ))}
              </div>
            ) : null}
            {connectError ? (
              <p className="text-destructive text-sm">{connectError}</p>
            ) : null}
            <DialogFooter showCloseButton />
          </DialogContent>
        </Dialog>
      )}

      {pendingDelete === null ? null : (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
        >
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>
                {pendingDelete.kind === "node"
                  ? `Delete ${pendingDelete.node.id}?`
                  : "Delete this relation?"}
              </DialogTitle>
              {/* THE CASCADE IS NAMED because it is the part that is not on
                  screen: the daemon takes every incident relation with the node,
                  and finding that out afterwards is finding out too late. The
                  relation's own sentence says the opposite half for the same
                  reason — what stays is what a person is afraid of losing. */}
              <DialogDescription>
                {pendingDelete.kind === "node"
                  ? `${pendingDelete.node.id} and every relation that touches it leave the graph. This cannot be undone.`
                  : `The ${pendingDelete.edge.type} relation from ${pendingDelete.edge.fromId} to ${pendingDelete.edge.toId} leaves the graph. Both nodes stay.`}
              </DialogDescription>
            </DialogHeader>
            {deleteError ? (
              <p className="text-destructive text-sm">{deleteError}</p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={deleteBusy}
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteBusy}
                onClick={() => void runDelete()}
              >
                {deleteBusy
                  ? "Deleting…"
                  : pendingDelete.kind === "node"
                    ? "Delete node"
                    : "Delete relation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </main>
  );
}
