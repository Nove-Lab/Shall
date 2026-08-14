import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Eye,
  GitCommitVertical,
  LayoutGrid,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { useProject } from "@/project-context";
import { NodePanel, type NodeDraft, type NodePanelMode } from "./NodePanel";
import {
  deletionSentence,
  impactSentence,
  problemCount,
  referrersOf,
  signalsOf,
  statusesById,
  type GitStatus,
  type ReviewReport,
} from "./review";
import { Referrers } from "./review-parts";
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
   * WHAT THE DAEMON SAYS ABOUT THE GRAPH, WHICH IS NOT PART OF THE GRAPH.
   *
   * The colours are recomputed on every read and stored nowhere, so they are
   * fetched beside the nodes and the relations rather than derived from them:
   * nothing on this plane can work out from a node's fields whether its approval
   * verifies. `null` is "not read yet", which is why the board does not paint.
   */
  const [review, setReview] = useState<ReviewReport | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  /** The commit dialog, with the pair every dialog on this plane keeps of its own. */
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  /**
   * The Problems dialog, and the one write it offers. `restoringId` is which row
   * is in flight rather than a bare flag — several restores in a row are the
   * ordinary way through that list, so the dialog stays open and only the row
   * being restored says so. The refusal carries its id for the same reason: it is
   * drawn under the row that earned it.
   */
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<{
    id: string;
    message: string;
  } | null>(null);

  /**
   * The whole board in one round trip, and every part of it lands together.
   *
   * `Promise.all` is not about latency here: set one at a time, there is a
   * render in between holding the new nodes against the old relations, and an
   * edge whose endpoint has not arrived yet is silently dropped by the canvas.
   * React batches all four setters inside this callback, so no render sees a
   * mixed board.
   *
   * THE REVIEW IS IN THE SAME ALL-OR-NOTHING AS THE GRAPH, and that is the one
   * thing about this call worth arguing. A board whose colours failed to arrive
   * is not a board with no colours — it is a board whose colours are unknown, and
   * fifty cards drawn without a square say the opposite of that. So a review that
   * will not read fails the whole load and the canvas says so in one sentence,
   * rather than painting a graph nobody has told the truth about.
   */
  const load = useCallback(async () => {
    const [nextNodes, nextEdges, nextReview, nextGitStatus] = await Promise.all([
      api.spec.nodes.query({ projectId: project.id }),
      api.spec.edges.query({ projectId: project.id }),
      api.spec.review.query({ projectId: project.id }),
      api.spec.gitStatus.query({ projectId: project.id }),
    ]);
    setNodes(nextNodes);
    setEdges(nextEdges);
    setReview(nextReview);
    setGitStatus(nextGitStatus);
  }, [project.id]);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    // A dialog is about a node, a relation or a spec folder in the project being
    // left, so it does not survive the move to another one.
    setPanel({ mode: "closed" });
    setConnect(null);
    setPendingDelete(null);
    setCommitOpen(false);
    setProblemsOpen(false);
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
   * THE COLOURS, AS ONE MAP, AND THE MEMO IS LOAD-BEARING. Every card on the
   * canvas is built against this map: written inline it would be a new object on
   * every render of this component, every card object would be new with it, and
   * React Flow would take its per-node rebuild arm for a board on which nothing
   * changed. `signalsOf` hands back one shared empty map before the first review
   * lands, so even that case is identity-stable.
   */
  const signalById = useMemo(() => signalsOf(review), [review]);
  /** The same answers keyed for the panel, which wants the reason rather than the colour. */
  const statusById = useMemo(() => statusesById(review), [review]);
  /** Missing nodes and unreadable files together — the button and the dialog count once. */
  const problems = problemCount(review);
  const selectedStatus =
    selected === null ? null : (statusById.get(selected.id) ?? null);
  /**
   * What points at the node the panel is on, and at the node a confirmation is
   * about. Two lists rather than one because they are two different questions:
   * the panel is open on a node while a right-click asks to delete another.
   */
  const selectedReferrers = useMemo(
    () => (selected === null ? [] : referrersOf(edges, selected.id)),
    [edges, selected],
  );
  const pendingReferrers = useMemo(
    () =>
      pendingDelete === null || pendingDelete.kind !== "node"
        ? []
        : referrersOf(edges, pendingDelete.node.id),
    [edges, pendingDelete],
  );

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
  /**
   * THE ONE WAY A NODE'S PANEL OPENS. A click on a card, the menu's Open, the
   * node a save just wrote and the node an edit was cancelled on are all the same
   * act, and a Review Queue that deep-links into this plane will be the same act
   * again — one function to call rather than a fifth place spelling the state out.
   */
  function openNode(id: string) {
    setPanel({ mode: "view", id });
  }

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
   * A create carries the identity fields as well; an edit carries only what can
   * change, because the daemon will not move a node's type or its id — the id is
   * what every relation names, and the type is what decides which relations are
   * grammatical at all. `NodeDraft` is one shape for both, so the panel does not
   * have to know which of the two it is filling.
   *
   * THE BODY GOES AS THE PERSON LEFT IT. It is one free markdown document, and
   * the daemon's door is where its edges are settled — a reshape here would be
   * a second rule about the same text.
   */
  async function submitNode(draft: NodeDraft) {
    if (panel.mode === "edit") {
      const updated = await api.spec.updateNode.mutate({
        projectId: project.id,
        id: panel.id,
        shortName: draft.shortName,
        name: draft.name,
        body: draft.body,
      });
      await load();
      openNode(updated.id);
      return;
    }

    const created = await api.spec.createNode.mutate({
      projectId: project.id,
      type: draft.type,
      id: draft.id,
      shortName: draft.shortName,
      name: draft.name,
      body: draft.body,
    });
    await load();
    openNode(created.id);
  }

  /**
   * THE PANEL'S DELETE, WHICH IS NOW REACHED FROM BOTH OF ITS MODES. The editor's
   * Delete button is one door; approving an agent's deletion proposal is the
   * other, and that one is pressed while the node is being READ. The guard used
   * to name `edit` alone, so the second door did nothing at all — no write, no
   * refusal, no console line — which is why it names both.
   */
  async function deleteNode() {
    if (panel.mode !== "edit" && panel.mode !== "view") {
      return;
    }

    await api.spec.removeNode.mutate({ projectId: project.id, id: panel.id });
    await load();
    setPanel({ mode: "closed" });
  }

  /**
   * THE TWO REVIEW WRITES, AND THE REFUSAL IS DELIBERATELY NOT CAUGHT HERE. The
   * daemon refuses an approve in sentences written for a person — a node nothing
   * anchors, a proposal standing over it — and the place to read one is beside
   * the button that sent it, so it is left to reject into the panel exactly as
   * `submitNode` does. The `mode` guard is the type telling the truth: both
   * buttons live in the view panel, which is a panel open on a node.
   */
  async function approveNode() {
    if (panel.mode !== "view") {
      return;
    }

    await api.spec.approve.mutate({ projectId: project.id, id: panel.id });
    await load();
  }

  async function rejectDeletion() {
    if (panel.mode !== "view") {
      return;
    }

    await api.spec.rejectDeletion.mutate({
      projectId: project.id,
      id: panel.id,
    });
    await load();
  }

  /**
   * The approved version of one node's file beside the current one, fetched by
   * the panel when it has a diff to draw.
   *
   * IT IS PASSED DOWN AS A FUNCTION AND NOT FETCHED HERE, because it is the one
   * read on this plane that is not part of the board: it is two whole files, it
   * is wanted for one node at a time, and only while somebody is looking at a
   * node the daemon calls `changed`. `useCallback` because the panel keys an
   * effect on it — a new function per render would refetch on every keystroke in
   * another field.
   */
  const loadApprovedVersion = useCallback(
    (id: string) =>
      api.spec.approvedVersion.query({ projectId: project.id, id }),
    [project.id],
  );

  /**
   * A FILE PUT BACK UNDER `.shall/spec`, AND THE DIALOG STAYS OPEN. A folder that
   * lost one node usually lost several — a bad merge, a branch switched with work
   * in the tree — and closing the list after each one would make the third
   * restore a matter of finding the button again. Only the row being written says
   * it is busy; the list itself is redrawn by `load()` and the entry that was
   * restored simply is not in it any more.
   */
  async function restoreNode(id: string) {
    if (restoringId !== null) {
      return;
    }

    setRestoringId(id);
    setRestoreError(null);
    try {
      await api.spec.restoreNode.mutate({ projectId: project.id, id });
      await load();
    } catch (error) {
      setRestoreError({
        id,
        message:
          error instanceof Error ? error.message : `Could not restore ${id}`,
      });
    } finally {
      setRestoringId(null);
    }
  }

  async function runCommit() {
    const message = commitMessage.trim();
    if (message === "" || commitBusy) {
      return;
    }

    setCommitBusy(true);
    setCommitError(null);
    try {
      await api.spec.commitSpec.mutate({ projectId: project.id, message });
      // The board does not change, but whether there is anything left to commit
      // does — and that is a button on this toolbar.
      await load();
      setCommitOpen(false);
    } catch (error) {
      setCommitError(
        error instanceof Error ? error.message : "Could not commit the spec",
      );
    } finally {
      setCommitBusy(false);
    }
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
          {/* THE RIGHT-HAND GROUP, IN THE ORDER OF WHAT IT IS ABOUT: what is
              wrong with the folder, what is uncommitted in it, and then the one
              thing that adds to it. The first two are only there when they have
              something to say — a Problems button reading "0 problems" and a
              Commit button on a folder that is not a repository are both
              furniture that never does anything. */}
          <div className="ml-auto flex items-center gap-2">
            {problems > 0 ? (
              <Button
                variant="outline"
                onClick={() => {
                  // Every dialog on this plane opens clean: a refusal from the
                  // last time it was open belongs to that visit.
                  setRestoreError(null);
                  setProblemsOpen(true);
                }}
              >
                <TriangleAlert />
                {problems === 1 ? "1 problem" : `${String(problems)} problems`}
              </Button>
            ) : null}
            {/* A CLEAN TREE LEAVES THE BUTTON THERE AND OFF, which is the answer
                to "is there anything to commit" — dropping it would make a
                committed spec look like a project without git. */}
            {gitStatus?.repo ? (
              <Button
                variant="outline"
                disabled={!gitStatus.dirty || loading || loadError !== null}
                onClick={() => {
                  setCommitError(null);
                  setCommitBusy(false);
                  setCommitMessage("Update the spec graph");
                  setCommitOpen(true);
                }}
              >
                <GitCommitVertical />
                Commit spec
              </Button>
            ) : null}
            {/* The toolbar points at no column, so it preselects no type. */}
            <Button
              disabled={loading || loadError !== null}
              onClick={() => openCreate(null)}
            >
              <Plus />
              Add node
            </Button>
          </div>
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
                className="spec-canvas bg-muted/30 dark:bg-background/30 relative size-full"
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
                    signalById={signalById}
                    selectedId={selected?.id ?? null}
                    onSelect={openNode}
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
                    <ContextMenuItem onClick={() => openNode(menuNode.id)}>
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
                  /* A NODE BEING WRITTEN HAS NO VERDICT AND NO REFERRERS, and
                     `selectedStatus` is already null there — this says so at the
                     call site as well, because "create" is the one mode where the
                     panel is not about a node the daemon has ever seen. */
                  status={mode === "create" ? null : selectedStatus}
                  referrers={selectedReferrers}
                  onClose={() => setPanel({ mode: "closed" })}
                  onEdit={() => {
                    if (selected) {
                      setPanel({ mode: "edit", id: selected.id });
                    }
                  }}
                  onCancelEdit={() => {
                    if (selected) {
                      openNode(selected.id);
                    }
                  }}
                  onSubmit={submitNode}
                  onDelete={deleteNode}
                  onApprove={approveNode}
                  onRejectDeletion={rejectDeletion}
                  loadApprovedVersion={loadApprovedVersion}
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
                  screen: the daemon takes every relation that STARTS at the node
                  with it, and leaves the ones that point AT it drawn to nothing.
                  Finding either out afterwards is finding out too late. The
                  relation's own sentence says the opposite half for the same
                  reason — what stays is what a person is afraid of losing.

                  THE NODE'S HALF IS `deletionSentence` AND NOT A STRING HERE,
                  because the panel asks the same question about the same act and
                  two wordings of it would be two promises. */}
              <DialogDescription>
                {pendingDelete.kind === "node"
                  ? deletionSentence(pendingDelete.node.id)
                  : `The ${pendingDelete.edge.type} relation from ${pendingDelete.edge.fromId} to ${pendingDelete.edge.toId} leaves the graph. Both nodes stay.`}
              </DialogDescription>
            </DialogHeader>
            {/* WHAT IS LEFT POINTING AT NOTHING, COUNTED AND THEN NAMED. It is
                outside the description because the description is a `<p>` and
                this is a list — and because a person deciding this reads the
                sentence first and the rows only if the number surprises them. */}
            {pendingDelete.kind === "node" && pendingReferrers.length > 0 ? (
              <div className="grid gap-2">
                <p className="text-sm">
                  {impactSentence(
                    pendingDelete.node.id,
                    pendingReferrers.length,
                  )}
                </p>
                <Referrers edges={pendingReferrers} />
              </div>
            ) : null}
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

      {/* ONE COMMIT FOR THE WHOLE SPEC FOLDER, WHICH IS WHAT THE SPEC IS. The
          graph is files now: a node is a file, a relation is a line in one, and
          a save writes whichever files that took. Offering to commit a node
          would be offering a half of a change that has no meaning on its own —
          the relation would go without the node it points at — so the unit here
          is the folder, and the person supplies only the sentence. */}
      {commitOpen ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setCommitOpen(false);
          }}
        >
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Commit the spec</DialogTitle>
              {/* THE BRANCH IS NAMED BUT NOT CHOSEN. Which branch is checked out
                  is which spec is on screen — the shell's header says which —
                  and a dialog that offered to move it would be a git client
                  growing inside a spec board. */}
              <DialogDescription>
                Everything under .shall/spec goes into one commit on the branch
                you are on.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="commit-message">Message</Label>
              {/* Prefilled rather than placeheld: the ordinary commit here says
                  the ordinary thing, and a message nobody has to write is a
                  message nobody skips the dialog to avoid writing. */}
              <Input
                id="commit-message"
                autoFocus
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void runCommit();
                  }
                }}
              />
            </div>
            {commitError ? (
              <p className="text-destructive text-sm">{commitError}</p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={commitBusy}
                onClick={() => setCommitOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={commitMessage.trim() === "" || commitBusy}
                onClick={() => void runCommit()}
              >
                {commitBusy ? "Committing…" : "Commit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* WHAT IS IN THE FOLDER AND NOT ON THE BOARD. Both lists are files the
          canvas cannot draw — one because the file is gone and something still
          points at where it was, one because the file will not read — so neither
          can be a card with a red square on it, and a board that simply did not
          mention them would be smaller than the folder with nothing saying so.

          IT IS THE ONE WIDTH OVERRIDE ON THIS PLANE. Every other dialog here is
          the design system's `sm:max-w-sm`; this one lists file paths, which do
          not wrap and do not fit. */}
      {problemsOpen ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setProblemsOpen(false);
          }}
        >
          <DialogContent showCloseButton={false} className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Problems in the spec folder</DialogTitle>
              <DialogDescription>
                These files are in .shall/spec and not in the graph. Until they
                read, the board is smaller than the folder.
              </DialogDescription>
            </DialogHeader>
            <div className="grid max-h-96 gap-4 overflow-y-auto">
              {(review?.missing ?? []).length === 0 ? null : (
                <div className="grid gap-3">
                  <span className="text-sm font-medium">Missing nodes</span>
                  {(review?.missing ?? []).map((entry) => (
                    <div key={entry.id} className="grid gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-xs break-all">
                          {entry.id}
                        </span>
                        {/* RESTORE IS THE ONLY WRITE IN THIS DIALOG, and it is
                            offered per row because each missing id is its own
                            file with its own history to be brought back from. */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={restoringId !== null}
                          onClick={() => void restoreNode(entry.id)}
                        >
                          <RotateCcw />
                          {restoringId === entry.id ? "Restoring…" : "Restore"}
                        </Button>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        Referred to by
                      </span>
                      <Referrers edges={entry.referencedBy} />
                      {restoreError?.id === entry.id ? (
                        <p className="text-destructive text-sm">
                          {restoreError.message}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
              {(review?.broken ?? []).length === 0 ? null : (
                <div className="grid gap-3">
                  {/* NO ACTION ON THIS HALF, AND THAT IS THE HONEST OFFER. A file
                      that will not parse is fixed in an editor by whoever can
                      read the sentences against it; a button here could only
                      guess at what was meant. */}
                  <span className="text-sm font-medium">
                    Files that will not read
                  </span>
                  {(review?.broken ?? []).map((entry) => (
                    <div key={entry.file} className="grid gap-1">
                      <span className="font-mono text-xs break-all">
                        {entry.file}
                      </span>
                      {entry.problems.map((problem, index) => (
                        <span
                          key={index}
                          className="text-muted-foreground text-xs"
                        >
                          {problem}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter showCloseButton />
          </DialogContent>
        </Dialog>
      ) : null}
    </main>
  );
}
