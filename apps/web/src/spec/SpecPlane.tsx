import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  CircleHelp,
  Ban,
  Eye,
  FileText,
  GitCommitVertical,
  LayoutGrid,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Undo2,
  Unlink,
  Waypoints,
} from "lucide-react";
import {
  bandOf,
  closureKindOf,
  permittedEdgeTypes,
} from "@shall/core/graph";
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
import { useRevision } from "@/live";
import { useProject } from "@/project-context";
import { NodePanel, type NodeDraft, type NodePanelMode } from "./NodePanel";
import { MetamodelDialog } from "./metamodel/MetamodelDialog";
import { RejectionPopover } from "./RejectionPopover";
import {
  closuresOf,
  satisfactionsOf,
  workItemStatesOf,
  deletionSentence,
  impactSentence,
  judgeable,
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
 *
 * IT KEEPS ITS OWN WORDS RATHER THAN CORE'S `grammarHint`, which says the same
 * two facts to a file. The screen can do what a file cannot: name the two nodes
 * the person is looking at and offer the gesture that fixes it. Change one and
 * read the other.
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
  /**
   * WHERE THE QUEUE SENT US, AS THE URL AND NOTHING ELSE. A card in the review
   * queue links to `?node=<id>&back=<path>`, which makes the deep link a page a
   * person can bookmark, reload and share rather than a message passed between
   * two mounted components. Read once — see the effect below — because after
   * that the panel is theirs to move.
   */
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
   * A REJECTION BEING WRITTEN FROM THE BOARD ITSELF: which node, and the two
   * numbers the right-click landed on.
   *
   * THE POINT TRAVELS AND NOT THE ELEMENT, because the element is gone. A menu
   * item unmounts the moment it is clicked, so anchoring the popover to it would
   * anchor it to nothing; the click's client coordinates outlive it, and a
   * zero-sized rect at that point is what Base UI takes as a virtual anchor.
   */
  const [rejecting, setRejecting] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  /**
   * A REFUSAL WITH NOWHERE OF ITS OWN TO BE SHOWN. Every other write on this
   * plane is sent from a dialog or a panel that stays on screen to carry the
   * daemon's sentence; the context menu's Withdraw rejection is sent from an
   * item that is gone by the time the answer arrives, so its sentence lands in
   * the toolbar beside the load's — the one line on this plane that is about the
   * board as a whole.
   */
  const [actionError, setActionError] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  /**
   * WHAT THE DAEMON SAYS ABOUT THE GRAPH, WHICH IS NOT PART OF THE GRAPH.
   *
   * The colours are recomputed on every read and stored nowhere, so they are
   * fetched beside the nodes and the relations rather than derived from them:
   * a node's fields say nothing about its approval — that lives in the ledger
   * the daemon reads — so nothing on this plane could work a colour out for
   * itself. `null` is "not read yet", which is why the board does not paint.
   */
  const [review, setReview] = useState<ReviewReport | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  /** The commit dialog, with the pair every dialog on this plane keeps of its own. */
  const [commitOpen, setCommitOpen] = useState(false);
  /**
   * Whether the metamodel reference is open. It is NOT in the project-change
   * reset below: that list is dialogs about a node, a relation or a folder in
   * the project being left, and the canon belongs to no project.
   */
  const [metamodelOpen, setMetamodelOpen] = useState(false);
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

  /**
   * Whether the URL's `?node=` has already been honoured. It is a ref and not
   * state because nothing is drawn from it: every refetch hands this component a
   * new `nodes` array, and without the latch a person who closed the panel — or
   * moved it to another node — would have it dragged back on the next write.
   */
  const deepLinked = useRef(false);

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
    setRejecting(null);
    setActionError(null);
    // Another project is another URL, so its own `?node=` is honoured once too.
    deepLinked.current = false;
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

  /**
   * A CHANGE ON DISK RE-READS THE GRAPH, AND THAT IS ALL IT DOES.
   *
   * It is a second effect and not a dependency of the one above, which is the
   * whole trick: that effect closes every dialog and forgets the deep link
   * because it is about arriving at a project, and a file an agent wrote is not
   * an arrival. Putting the tick in `load` would put it in that effect's
   * dependencies too, and a person would watch their connect dialog shut every
   * time the folder moved.
   *
   * Nothing is cleared and nothing is said. The panel keeps what is typed into
   * it, the camera keeps where it was, and a failure keeps the board that is on
   * screen — the next change asks again.
   */
  const revision = useRevision();
  const lastSeen = useRef(0);
  useEffect(() => {
    if (revision === lastSeen.current) {
      return;
    }
    lastSeen.current = revision;
    void load().catch(() => undefined);
  }, [revision, load]);

  /**
   * THE QUEUE'S LINK, HONOURED ONCE, AFTER THE BOARD HAS ARRIVED.
   *
   * It waits for the graph rather than running beside the fetch, because a panel
   * opened on an id the load has not delivered yet is a panel on nothing — and
   * an id that names no node in this project is a link that has gone stale, which
   * is answered by leaving the board as it is rather than by an error about a URL
   * nobody typed.
   *
   * IT ALWAYS OPENS THE READING PANE, which is what a link to a node means.
   * Nothing in this app links into the editor: a link is handed to somebody so
   * they can read what it names, and the way into editing is the panel's own
   * button, beside the words it would change.
   */
  useEffect(() => {
    if (deepLinked.current) {
      return;
    }
    const wanted = searchParams.get("node");
    if (wanted === null || !nodes.some((node) => node.id === wanted)) {
      return;
    }
    deepLinked.current = true;
    openNode(wanted);
  }, [nodes, searchParams]);

  /**
   * WHERE THE PERSON CAME FROM, AND ONLY IF IT IS A PLACE IN THIS APP. A `back`
   * that does not start with `/` is not a route — it is an absolute URL to
   * somewhere else, and following one because it arrived in a query string is
   * how a page becomes somebody's open redirect. The button is simply not there
   * for a link that says anything else.
   */
  const backTo = searchParams.get("back");
  // One slash and not two: `//host` is a protocol-relative URL that the
  // browser would follow off-site, and `/\` is the same trick spelled for
  // parsers that fold backslashes — neither is a route in this app.
  const backPath =
    backTo !== null &&
    backTo.startsWith("/") &&
    !backTo.startsWith("//") &&
    !backTo.startsWith("/\\")
      ? backTo
      : null;

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
  /**
   * THE SECOND AXIS, MEMOISED BESIDE THE FIRST AND FOR THE SAME REASON — it is a
   * dependency of the canvas's card memo, so a map built inline would rebuild
   * every card on every render of this plane. It holds only the criteria: a node
   * that cannot be met has no entry, and no entry is how a card knows to draw
   * nothing.
   */
  const closureById = useMemo(() => closuresOf(review), [review]);
  /**
   * Blocked, ready or done, per work item — the board's own answer, memoised beside
   * the other two for the reason they are: it is a dependency of the card memo
   * inside the canvas, and a fresh map per render rebuilds every card.
   */
  const workItemStateById = useMemo(() => workItemStatesOf(review), [review]);
  /**
   * Sat or unsat, per requirement and scenario that carries a criterion — the
   * vitals' own answer, memoised beside the other three for the same reason.
   */
  const satisfactionById = useMemo(() => satisfactionsOf(review), [review]);
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
  /**
   * The claimants of the selected criterion nobody has approved yet — the
   * plane's answer, because only the plane holds the review beside the graph.
   * The panel's closure switch stays dark while this is non-empty, and the
   * daemon refuses the same door with the same names.
   */
  const unapprovedClaimants = useMemo(() => {
    // WHICH RELATION CLAIMS THIS NODE IS THE CANON'S ANSWER AND NOT THIS
    // FILE'S: `CLAIMS` into a criterion, `ADDRESSES` into a work item. A node that
    // is neither has no claimants and no switch.
    const claim = closureKindOf(selected?.type ?? "")?.claim;
    if (claim === undefined) {
      return [];
    }
    return selectedReferrers
      .filter(
        (edge) =>
          edge.type === claim && statusById.get(edge.fromId)?.color !== "green",
      )
      .map((edge) => edge.fromId)
      .sort();
  }, [selected, selectedReferrers, statusById]);
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
   * What the review says about the node under the pointer, and the two items it
   * earns — named here rather than spelled inside the menu, where a nested
   * ternary over a union would be three lines of punctuation around one word.
   */
  const menuStatus =
    menuNode === null ? null : (statusById.get(menuNode.id) ?? null);
  const menuRejected = menuStatus?.reason === "rejected";
  const menuJudgeable = menuStatus !== null && judgeable(menuStatus);
  /** The node a right-click asked to reject, resolved against the board as it stands. */
  const rejectingNode =
    rejecting === null
      ? null
      : (nodes.find((node) => node.id === rejecting.id) ?? null);
  /**
   * THE POINTER AS AN ANCHOR — a zero-sized rect where the click landed, which
   * is the shape Base UI's positioner takes when there is no element to hang
   * off. Memoised because the positioner reads it on every measurement: a fresh
   * object per render would be a fresh anchor per render.
   */
  const rejectAnchor = useMemo(
    () =>
      rejecting === null
        ? null
        : {
            getBoundingClientRect: () =>
              new DOMRect(rejecting.x, rejecting.y, 0, 0),
          },
    [rejecting],
  );

  /**
   * THE ONE WAY A NODE'S PANEL OPENS. A click on a card, the menu's Open, the
   * node a save just wrote and the node an edit was cancelled on are all the same
   * act, and a Review Queue that deep-links into this plane is the same act
   * again — one function to call rather than a fifth place spelling the state out.
   */
  function openNode(id: string) {
    setPanel({ mode: "view", id });
  }

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
   * behaviour the requirement rules out: a panel someone is writing or editing
   * in must not close this way. A draft leaves through Cancel or through a save,
   * both of which say so.
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
    // The commits travel only when the form had them — a WorkLog's form. Left
    // off the wire, the daemon carries the file's own list over; sent, the
    // list on screen is the list. Spread rather than passed as `undefined`,
    // because under `exactOptionalPropertyTypes` those are two different asks.
    const commits =
      draft.commits === undefined ? {} : { commits: [...draft.commits] };
    if (panel.mode === "edit") {
      const updated = await api.spec.updateNode.mutate({
        projectId: project.id,
        id: panel.id,
        shortName: draft.shortName,
        name: draft.name,
        body: draft.body,
        ...commits,
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
      ...commits,
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
   * THE OTHER TWO REVIEW WRITES — a person's "no", and taking it back.
   *
   * THEY TAKE THE ID RATHER THAN READING THE PANEL, because both are reached
   * from the board as well as from the panel: a right-click can reject a card
   * nobody has opened. The refusal is left to reject into the caller for the
   * reason `approveNode` gives — the place to read the daemon's sentence is
   * beside the control that sent it, and here that is the popover holding the
   * rationale somebody just typed.
   *
   * A REJECTION NEEDS THE RATIONALE AND A WITHDRAWAL NEEDS NOTHING, which is the
   * whole asymmetry between them: saying no is a statement somebody has to make,
   * and taking it back is only the removal of that statement.
   */
  async function rejectNode(id: string, rationale: string) {
    await api.spec.reject.mutate({ projectId: project.id, id, rationale });
    await load();
  }

  async function withdrawRejection(id: string) {
    await api.spec.withdrawRejection.mutate({ projectId: project.id, id });
    await load();
  }

  /**
   * THE PANEL'S TWO DOORS INTO THE SAME PAIR. They take no id because the panel
   * is open on one node and the `mode` guard is the type saying so — the same
   * shape `approveNode` above has, and the reason the id is not read out of the
   * JSX where the union is not narrowed.
   */
  async function rejectPanelNode(rationale: string) {
    if (panel.mode !== "view") {
      return;
    }

    await rejectNode(panel.id, rationale);
  }

  async function withdrawPanelRejection() {
    if (panel.mode !== "view") {
      return;
    }

    await withdrawRejection(panel.id);
  }

  /**
   * THE CRITERION'S OTHER AXIS — the two exits from the closure queue, sent from
   * the panel and refused into it.
   *
   * NEITHER NAMES ANY EVIDENCE. The list judged is every living claimant of the
   * criterion, and the daemon is what reads that list off the graph — so closing
   * sends an id and nothing else, and this plane never assembles a set of
   * evidence ids that could disagree with the one the write actually covers.
   *
   * CLOSING NEEDS NOTHING AND LEAVING OPEN NEEDS A SENTENCE, which is the same
   * asymmetry `rejectNode` and `withdrawRejection` have and for the same reason:
   * a signature is a signature, and a refusal is an argument the agent reads
   * next. Both refuse into the caller — the panel's switch and the popover
   * holding the typed rationale are where the daemon's own words belong.
   */
  async function closeCriterion(id: string) {
    await api.spec.acceptClosure.mutate({ projectId: project.id, id });
    await load();
  }

  async function leaveOpen(id: string, rationale: string) {
    await api.spec.leaveOpen.mutate({ projectId: project.id, id, rationale });
    await load();
  }

  /** The panel's two doors into that pair — the same shape the rejection has. */
  async function closePanelCriterion() {
    if (panel.mode !== "view") {
      return;
    }

    await closeCriterion(panel.id);
  }

  async function leavePanelOpen(rationale: string) {
    if (panel.mode !== "view") {
      return;
    }

    await leaveOpen(panel.id, rationale);
  }

  /**
   * The same withdrawal sent from the context menu, which has no surface of its
   * own to be refused on — see `actionError`. The panel's own button keeps the
   * rejecting version, because there the sentence belongs under the button.
   */
  function withdrawFromMenu(id: string) {
    setActionError(null);
    void withdrawRejection(id).catch((error: unknown) =>
      setActionError(
        error instanceof Error
          ? error.message
          : `Could not withdraw the rejection on ${id}`,
      ),
    );
  }

  /**
   * WHERE THE POPOVER OPENS, TAKEN OFF THE CLICK THAT ASKED FOR IT. A menu item
   * activated from the KEYBOARD reports no pointer at all — `clientX` and
   * `clientY` are both 0 — and dropping the box in the window's corner is not
   * where that person is looking, so the item's own bottom-left corner stands in
   * for the pointer. The rect is read here, while the item is still mounted.
   */
  function askReject(id: string, event: MouseEvent<HTMLElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const pointed = event.clientX !== 0 || event.clientY !== 0;
    setRejecting({
      id,
      x: pointed ? event.clientX : box.left,
      y: pointed ? event.clientY : box.bottom,
    });
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
   * THE TAB OPENS BEFORE THE ASK, because a popup blocker trusts only the
   * click itself: a `window.open` on the far side of an await is a tab most
   * browsers refuse. So a blank tab is taken synchronously, pointed at the
   * finished report when the daemon says it is there, and closed again when
   * the daemon refuses — the refusal lands on the toolbar's own error line.
   */
  async function runReport() {
    if (reportBusy) {
      return;
    }
    const tab = window.open("about:blank", "_blank");
    setReportBusy(true);
    setActionError(null);
    try {
      await api.spec.generateReport.mutate({ projectId: project.id });
      const target = `/api/projects/${project.id}/report/index.html`;
      if (tab === null) {
        window.location.assign(target);
      } else {
        tab.location.assign(target);
      }
    } catch (error) {
      tab?.close();
      setActionError(
        error instanceof Error ? error.message : "Could not generate the report",
      );
    } finally {
      setReportBusy(false);
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
          {/* THE CANON ITSELF, ONE CLICK AWAY. It sits beside the view tabs
              because it is the other control on this row about READING the
              board, and deliberately not in the right-hand group: everything
              there is about this folder and all but one appears only when it
              has something to say, while this button is always there and says
              nothing about the project. */}
          <Button
            variant="ghost"
            size="icon"
            title="Spec graph metamodel"
            aria-label="Spec graph metamodel"
            onClick={() => setMetamodelOpen(true)}
          >
            <CircleHelp />
          </Button>
          {/* A REFUSAL THE MENU HAD NOWHERE TO PUT, in the row that is about
              the board rather than about any one card. Truncated, because it is
              a sentence sharing a 48px row with four buttons, and pushing them
              off the toolbar would cost more than the tail of it is worth — the
              whole of it is one right-click away, on the node itself. */}
          {actionError ? (
            <p className="text-destructive truncate text-sm">{actionError}</p>
          ) : null}
          {/* THE RIGHT-HAND GROUP, IN THE ORDER OF WHAT IT IS ABOUT: the way
              back to what sent us, what is wrong with the folder, what is
              uncommitted in it, and then the one thing that adds to it. All but
              the last are only there when they have something to say — a
              Problems button reading "0 problems" and a Commit button on a
              folder that is not a repository are both furniture that never does
              anything. */}
          <div className="ml-auto flex items-center gap-2">
            {/* THE WAY BACK, AND ONLY WHEN SOMETHING SENT US. A person who
                arrived from a bundle's card is part way through judging it, and
                the queue is where the rest of that judgement is; a person who
                opened the plane directly came from nowhere and gets no button
                pointing at a page they were not on. It leads the group because
                it is the one control here that is about leaving. */}
            {backPath === null ? null : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigate(backPath);
                }}
              >
                <ArrowLeft />
                Back to review
              </Button>
            )}
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
            {/* THE SPEC AS A DOCUMENT, for whoever never opens Shall: the
                daemon assembles static pages under the project's own shall/
                and the finished index opens in a tab of its own. */}
            <Button
              variant="outline"
              disabled={reportBusy || loading || loadError !== null}
              onClick={() => {
                void runReport();
              }}
            >
              <FileText />
              {reportBusy ? "Generating…" : "Generate report"}
            </Button>
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
                    closureById={closureById}
                    workItemStateById={workItemStateById}
                    satisfactionById={satisfactionById}
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
                    {/* THE JUDGEMENT ITEMS, WHICH ARE THE COLOUR'S AND NOT THE
                        TYPE'S. A yellow or green card can be refused — including
                        a green one, because an approval can turn out to have
                        been wrong — and a card already rejected offers the one
                        door out of that. RED THAT IS NOT A REJECTION GETS
                        NEITHER: a file that will not read and a node nothing
                        anchors are fixes, not judgements, and the daemon refuses
                        both doors anyway.

                        Reject… opens the popover AT THE POINTER rather than in
                        the panel, so the card being judged stays where the
                        person was looking at it. */}
                    {menuRejected ? (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={() => withdrawFromMenu(menuNode.id)}
                        >
                          <Undo2 />
                          Withdraw rejection
                        </ContextMenuItem>
                      </>
                    ) : menuJudgeable ? (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={(event) => askReject(menuNode.id, event)}
                        >
                          <Ban />
                          Reject…
                        </ContextMenuItem>
                      </>
                    ) : null}
                    {/* The execution band records what happened, and a record
                        has no Delete — the daemon refuses the call anyway. */}
                    {bandOf(menuNode.type) === "Execution" ? null : (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          variant="destructive"
                          onClick={() =>
                            askDelete({ kind: "node", node: menuNode })
                          }
                        >
                          <Trash2 />
                          Delete…
                        </ContextMenuItem>
                      </>
                    )}
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
                  /* The panel is open ON a node, so the id is the panel's and
                     the rationale is the popover's — the closure mark it draws
                     beside the id is already inside `status`. */
                  onReject={rejectPanelNode}
                  onWithdrawRejection={withdrawPanelRejection}
                  onCloseCriterion={closePanelCriterion}
                  onLeaveOpen={leavePanelOpen}
                  unapprovedClaimants={unapprovedClaimants}
                  loadApprovedVersion={loadApprovedVersion}
                />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>

      {/* THE BOARD'S OWN REJECTION, MOUNTED ONLY WHILE ONE IS BEING WRITTEN —
          the same rule the dialogs below follow, and here it also settles where
          the popover opens: the anchor is a point that was true at the moment of
          the click, so a stale one held open over a board that has since moved
          would point somewhere nobody clicked.

          IT IS THE SAME COMPONENT THE PANEL USES, opened by an anchor instead of
          by a trigger. What a rejection needs — a rationale, and the daemon's
          sentence when it is refused — does not depend on which door it came
          through, so there is one of it.

          THE NODE IS RESOLVED AGAINST THIS RENDER'S GRAPH, so a refetch that
          removed it closes the popover instead of leaving it open on a name the
          board no longer has. */}
      {rejecting === null || rejectingNode === null ? null : (
        <RejectionPopover
          open
          onOpenChange={(open) => {
            if (!open) setRejecting(null);
          }}
          target={{ id: rejectingNode.id, name: rejectingNode.name }}
          verb="Reject"
          anchor={rejectAnchor}
          onConfirm={(rationale) => rejectNode(rejecting.id, rationale)}
        />
      )}

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

      {/* ONE COMMIT FOR THE WHOLE SPEC FOLDER AND THE BOOKS THAT JUDGE IT.
          The graph is files now: a node is a file, a relation is a line in one,
          and a save writes whichever files that took. Offering to commit a node
          would be offering a half of a change that has no meaning on its own —
          the relation would go without the node it points at, or the spec would
          go without the judgements that colour it — so the unit here is the
          folder and the books beside it, and the person supplies only the
          sentence. */}
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
                Everything under .shall/spec, and the ledgers beside it, goes
                into one commit on the branch you are on.
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

      {metamodelOpen ? (
        <MetamodelDialog onClose={() => setMetamodelOpen(false)} />
      ) : null}
    </main>
  );
}
