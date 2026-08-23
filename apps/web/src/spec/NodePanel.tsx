import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  anchorPhrase,
  type Band,
  BAND_ORDER,
  bandOf,
  closureKindOf,
  columnsInOrder,
  nextIdSuggestion,
  type NodeTypeEntry,
  openingArticleFor,
  sectionGuideFor,
  type SpecEdge,
  type SpecNode,
} from "@shall/core/graph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Markdown } from "@/components/ui/markdown";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RejectionPopover } from "./RejectionPopover";
import {
  deletionSentence,
  firstLine,
  impactSentence,
  judgeable,
  type ApprovedVersion,
  type ReviewStatus,
} from "./review";
import {
  LineDiff,
  Referrers,
  SecondAxisMark,
  StatusDot,
} from "./review-parts";
import { formatStamp } from "./spec-node";
import { lineDiff, wholeFile, type DiffRow } from "./view/diff";

export type NodePanelMode = "create" | "view" | "edit";

const TITLE: Record<NodePanelMode, string> = {
  create: "New node",
  view: "Node details",
  edit: "Edit node",
};

interface TypeGroup {
  band: Band;
  types: readonly NodeTypeEntry[];
}

/**
 * The types as the canvas orders them: the four bands in band order, each
 * holding its own columns in canon order.
 *
 * Both facts are read off the canon rather than written here — `columnsInOrder`
 * is the very list the canvas lays its columns out from — so the dropdown and
 * the board cannot drift apart, and a type added to the roster appears in both
 * without an edit to either. Computed once at module scope, because the canon
 * does not change while the app runs.
 */
const TYPE_GROUPS: readonly TypeGroup[] = BAND_ORDER.map((band) => ({
  band,
  types: columnsInOrder().filter((entry) => bandOf(entry.name) === band),
}));

/**
 * WHAT A COLOUR MEANS AND WHAT TO DO ABOUT IT, in the panel's own words.
 *
 * THE DAEMON SENDS A REASON AND NEVER A SENTENCE, which is the division this
 * function is: the verdict is arithmetic over the file and belongs to
 * `core/arith`, and how it is said to a person belongs to the surface saying it.
 * Every sentence names the node's own id or type where it can, because a person
 * reading a docked panel beside a board of fifty cards should not have to check
 * which one they are looking at.
 *
 * THREE REASONS RETURN NOTHING, AND THAT IS NOT A GAP. `missing` is an id with
 * no node behind it, so there is no panel to open on it; `malformed` is a file
 * that would not read, which never reaches `statuses` at all and is listed under
 * Problems instead; `approved` is green, which draws one muted line and no box.
 * They are spelled out rather than left to a `default` so that a third yellow —
 * or a reason renamed in the canon — is a compile error here. (There WAS a
 * third yellow once, when an approval was a signed block inside the file and
 * its tag could fail to verify; the ledger has no tags, and the arm went with
 * it.)
 *
 * WHO APPROVED IT COMES FROM THE STATUS, NOT THE NODE. The daemon reads the
 * approval ledger and sends `by` and `at` beside the colour; the node's own
 * file says nothing about its approval, and the panel does not pretend it does.
 */
function statusCopy(
  status: ReviewStatus,
  node: SpecNode,
): { title: string; body: string } | null {
  // WHILE A DELETION IS PROPOSED THE BOX MUST NOT PROMISE WHAT IT SUPPRESSES.
  // The diff and the Approve button both stand down then (the card above is
  // the one open question), so a body saying "the lines below are what moved"
  // would point at nothing, and "someone edited this node" would blame a
  // person for the proposal sitting right above. One sentence, pointing up.
  // An orphan's copy stays — the anchor is missing whatever else is asked.
  if (node.deletionProposed !== undefined) {
    switch (status.reason) {
      case "unapproved":
        return {
          title: "Not approved",
          body: "Nobody has approved this node yet, and an agent has proposed deleting it — the card above is the judgement to make first.",
        };
      case "changed":
        return {
          title: "Changed since it was approved",
          body: "What changed is the deletion proposed above — judge it there. Rejecting it brings the approved version back.",
        };
      default:
        break;
    }
  }
  switch (status.reason) {
    case "unapproved":
      return {
        title: "Not approved",
        body: "Nobody has approved this node yet. The specification below is the whole of what approving it signs off.",
      };
    case "changed":
      return {
        title: "Changed since it was approved",
        body:
          status.approval === null
            ? "Someone edited this node after it was approved. The lines below are what moved."
            : `Someone edited this node after ${status.approval.by} approved it on ${formatStamp(status.approval.at)}. The lines below are what moved.`,
      };
    // A PERSON READ THIS AND SAID NO, IN WRITING. The box names who and when;
    // the rationale itself is drawn under it verbatim by the render, because it
    // is the argument and not a summary of one. There is no Approve here — the
    // daemon refuses it while the rejection stands, and the one door out is
    // withdrawing what was said.
    case "rejected":
      return {
        title: "Rejected",
        body:
          status.rejection === null
            ? "Somebody rejected this node — it is the agent's turn, not the reviewer's."
            : `Rejected by ${status.rejection.by} · ${formatStamp(status.rejection.at)}`,
      };
    case "orphan": {
      // WHAT WOULD ANCHOR IT IS THE CANON'S ANSWER AND NOT A LIST KEPT HERE:
      // `anchorPhrase` reads the same grammar the connect dialog offers
      // relations from. `null` is a type the canon anchors no other way, which
      // no orphan can be — the guard says so honestly rather than by printing
      // "anchored by null".
      const phrase = anchorPhrase(node.type);
      const opening = `No relation anchors ${node.id}, so it hangs off the graph and cannot be approved.`;
      return {
        title: "Nothing anchors this node",
        body:
          phrase === null
            ? `${opening} Draw a relation into it from the node it belongs under.`
            : `${opening} ${openingArticleFor(node.type)} ${node.type} is anchored by ${phrase}.`,
      };
    }
    // THE AIM RULE: a work log under a work item submits evidence only for what the
    // work item targets. The daemon composed the sentence — it names the log, the
    // work item, the criteria and the evidence, which is more than this panel holds
    // — so it is quoted whole, from whichever end the person is standing on.
    case "off-target":
      return {
        title: "Outside its work item's aim",
        body:
          status.problem ??
          "This node sits on a seam between a work log, its work item and its claims — the evidence or report claims what the work item does not cover. Fix the ADDRESSES, TARGETS or CLAIMS line first.",
      };
    // A LOOP IN THE PLAN: work waiting on itself through others, or two
    // modules that consume each other's contracts. The sentence recites the
    // way round — every id on the loop and, for modules, the contract each hop
    // runs through — so it is quoted whole, from whichever node the person is
    // standing on.
    case "cyclic":
      return {
        title: "On a loop",
        body:
          status.problem ??
          "This node stands on a loop: following what it waits on comes back here. Nothing on a loop can be first, so remove one of the lines that closes it.",
      };
    // WORK BEFORE ITS TURN. The daemon composed the sentence — it names the
    // blocked work item, which is more than this panel holds — so it is quoted
    // whole, like the aim rule's.
    case "premature":
      return {
        title: "Work before its turn",
        body:
          status.problem ??
          "This work log addresses a work item that is still blocked — its chain is unread, or something it waits on is open. Settle that first.",
      };
    case "missing":
    case "malformed":
    case "approved":
      return null;
  }
}

/**
 * THE NOUNS EACH SUBJECT'S CLOSURE CAPTION IS SAID IN. A criterion is closed on
 * evidence claiming it and a work item on reports claiming it, so the sentence is
 * one sentence with two vocabularies rather than two sentences. Module scope,
 * because the panel re-renders per keystroke and this table never moves.
 */
const CLOSURE_WORDS: Record<
  "criterion" | "workItem",
  { none: string; unread: string; one: string; many: (count: number) => string }
> = {
  criterion: {
    none: "No evidence claims this criterion yet — nothing to close over.",
    unread:
      "Approve this criterion first — until its words are agreed there is nothing for the evidence to be met against.",
    one: "One piece of evidence claims this criterion.",
    many: (count) => `${String(count)} pieces of evidence claim this criterion.`,
  },
  workItem: {
    none: "No completion report claims this work item yet — nothing to close over.",
    unread:
      "Approve this work item first — until what it asks for is agreed there is nothing for the work to be done against.",
    one: "One completion report claims this work item.",
    many: (count) => `${String(count)} completion reports claim this work item.`,
  },
};

/** A row the panel shows but nothing in it can change. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </div>
  );
}

/**
 * A label's text and its required marker as ONE flex item — as two children
 * the Label's own `gap-2` would push the `*` half a rem off the word it marks.
 */
function RequiredLabel({ text }: { text: string }) {
  return (
    <span>
      {text}
      <span className="text-destructive"> *</span>
    </span>
  );
}

/**
 * The starting shape a type's template suggests, as the body the create form
 * prefills — the same headings `~/.shall/templates/<Type>.md` ships, from the
 * same guide. A GUIDE AND NOT A RULE: the person may delete every heading and
 * write the specification any way they like, and the daemon accepts it either
 * way. Empty for no type chosen yet, which is also the honest shape there.
 */
function bodySkeleton(type: string): string {
  return (sectionGuideFor(type) ?? [])
    .map((section) => `## ${section.label}`)
    .join("\n\n");
}

/**
 * What a save carries.
 *
 * `type` and `id` are the node's identity and only a create can choose them; an
 * edit sends the node's own back unchanged and the daemon ignores them, so both
 * modes hand the caller one shape rather than two.
 *
 * `body` IS THE SPECIFICATION AS THE PERSON LEFT IT, one markdown document,
 * sent whole. The daemon settles its edges — line endings, leading and
 * trailing blank lines — and refuses only what no text file can carry, so
 * nothing here narrows or reshapes it.
 */
export interface NodeDraft {
  type: string;
  id: string;
  shortName: string;
  name: string;
  body: string;
  /**
   * A WorkLog's commit shas, present exactly when the form was a WorkLog's —
   * the list is then the whole list, empty for a work log that produced none,
   * and absent for every other type so the daemon carries or omits as its own
   * rule says.
   */
  commits?: readonly string[];
}

/**
 * One row of the commit editor. Kept as text while it is being typed and
 * judged only on the way out — a half-typed sha is not a refusal, it is a
 * person mid-word — and keyed by a number of its own, because two rows may
 * hold the same sha for as long as somebody is fixing one of them.
 */
interface CommitRow {
  key: number;
  sha: string;
}

/** Empty for anything but a WorkLog, whose list the panel edits row by row. */
function rowsOf(node: SpecNode | null): CommitRow[] {
  return (node?.commits ?? []).map((sha, index) => ({ key: index, sha }));
}

interface NodePanelProps {
  mode: NodePanelMode;
  /** Null only while creating — there is no row yet. */
  node: SpecNode | null;
  /** Every node in the project: the id suggestion and its uniqueness check read this. */
  nodes: SpecNode[];
  /** The column the canvas was pointing at, when the request came from the canvas. */
  presetType?: string;
  /** Which create request this is — see the re-aim effect below. */
  request: number;
  /**
   * THE DAEMON'S VERDICT ON THIS NODE, OR `null` FOR A NODE THAT HAS NONE.
   *
   * NULLABLE AND NEVER OPTIONAL, like everything else the plane hands down here:
   * under `exactOptionalPropertyTypes` an absent prop and a prop holding nothing
   * are different asks, and this is the second — the plane always knows, and
   * `null` is one of the answers it knows. ABSENCE FROM THE REVIEW IS ITSELF THE
   * RULE: the execution band has no colour, and this panel draws no section for
   * it rather than working a band out for itself.
   */
  status: ReviewStatus | null;
  /** The relations pointing AT this node — what a deletion would leave drawn to nothing. */
  referrers: SpecEdge[];
  /**
   * The claimants of this criterion nobody has approved yet — ids, in id order,
   * empty for anything that is not a criterion or whose every claimant is
   * green. THE PLANE WORKS IT OUT because only the plane holds the whole
   * review; the panel knows its own status and its own referrers and nothing
   * about the colour of the nodes at the far end of them. It is what keeps the
   * closure switch dark until the last claim has been read: a claim nobody has
   * approved is not yet a claim a person can sign a criterion off on, and the
   * daemon refuses the same door with the same names.
   */
  unapprovedClaimants: readonly string[];
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmit: (draft: NodeDraft) => Promise<void>;
  onDelete: () => Promise<void>;
  /**
   * The review writes. Each REJECTS with the daemon's own sentence and is caught
   * here, beside the button that sent it — the same contract `onSubmit` has, and
   * the reason none of them returns an error instead.
   *
   * THE TWO REJECTION DOORS ARE ABOUT DIFFERENT THINGS AND ARE NOT ONE PROP.
   * `onRejectDeletion` answers an agent's proposal to delete the node;
   * `onReject` is a person refusing the node's own content, and it carries the
   * rationale because the book will not take one without it. `onWithdrawRejection`
   * takes that back.
   */
  onApprove: () => Promise<void>;
  onRejectDeletion: () => Promise<void>;
  onReject: (rationale: string) => Promise<void>;
  onWithdrawRejection: () => Promise<void>;
  /**
   * THE CRITERION'S OTHER AXIS, WHICH IS TWO DOORS AND NOT A FIELD. Closing
   * records an acceptance over EVERY piece of evidence claiming this criterion
   * now — the panel names none of them and the daemon computes the list, which
   * is why this takes nothing. Leaving it open records the opposite word about
   * that same list, with the sentence the person typed; each door removes the
   * other book's record.
   *
   * `onCloseCriterion` AND NOT `onClose`, WHICH IS ALREADY THE PANEL'S OWN DOOR
   * a few lines above: two props called `onClose` meaning "shut this pane" and
   * "sign off this criterion" is one rename away from a bug nobody can see at
   * the call site.
   *
   * LEAVING OPEN IS NOT A REJECTION OF THE NODE. The criterion's words are not
   * what is being refused, so its colour is untouched — the record lands in the
   * rejection ledger under the criterion's id, and `[Withdraw rejection]` is
   * still what takes it back.
   */
  onCloseCriterion: () => Promise<void>;
  onLeaveOpen: (rationale: string) => Promise<void>;
  loadApprovedVersion: (id: string) => Promise<ApprovedVersion>;
}

/**
 * The node inspector: one docked pane for all three states, because a node
 * being written, read and rewritten is the same form each time — the four
 * identity fields, and under them whatever the chosen type carries.
 */
export function NodePanel({
  mode,
  node,
  nodes,
  presetType,
  request,
  status,
  referrers,
  onClose,
  onEdit,
  onCancelEdit,
  onSubmit,
  onDelete,
  onApprove,
  onRejectDeletion,
  onReject,
  onWithdrawRejection,
  onCloseCriterion,
  onLeaveOpen,
  unapprovedClaimants,
  loadApprovedVersion,
}: NodePanelProps) {
  const [type, setType] = useState("");
  const [id, setId] = useState("");
  const [shortName, setShortName] = useState("");
  const [name, setName] = useState("");
  /** The specification, one markdown document — the whole of what a type used to split into fields. */
  const [body, setBody] = useState("");
  /**
   * Whether the id on screen is the person's own rather than the suggestion.
   * Once it is theirs it stays theirs until the form is refilled — including
   * when they clear the box, because someone deleting an id is about to type
   * one and having the suggestion reappear under their cursor is a fight.
   */
  const [idTouched, setIdTouched] = useState(false);
  /**
   * The same rule for the body: the skeleton in it is the template's until the
   * person types, and theirs afterwards — a change of type must not overwrite a
   * half-written specification with fresh headings.
   */
  const [bodyTouched, setBodyTouched] = useState(false);
  /**
   * THE WORK LOG'S COMMITS, EDITED AS ROWS. Only a WorkLog's form shows them
   * and only a WorkLog's save sends them; the rows are kept whatever the type
   * says, so a person who picks WorkLog, types two commits and briefly picks
   * another type does not lose them to the switch. `nextKey` is what keeps a
   * row's identity through a delete above it.
   */
  const [commits, setCommits] = useState<CommitRow[]>([]);
  const [nextKey, setNextKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  /**
   * THE REVIEW ACTIONS HAVE THEIR OWN BUSY FLAG AND THEIR OWN SENTENCE, and that
   * is not tidiness. `busy` gates Save and Delete; a refused approve that took it
   * would disable the editor over a write that changed nothing, and the daemon
   * refuses an approve for reasons — an orphan, a proposal standing — that a
   * person answers by EDITING the node. Same rule the plane's two dialogs follow.
   */
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  /**
   * Whether the rejection popover is open. It is held HERE and not inside the
   * popover because the same component serves the plane's right-click, where
   * there is no trigger element to own the state — one contract, controlled at
   * both doors, rather than a component that is controlled at one and not the
   * other.
   */
  const [rejectOpen, setRejectOpen] = useState(false);
  /**
   * THE CLOSURE AXIS HAS ITS OWN PAIR, FOR THE REASON THE REVIEW PAIR HAS ONE.
   * A refused close is a sentence about the evidence claiming this criterion —
   * "nothing claims it yet", "its wording is rejected" — and it belongs under
   * the switch that sent it, not beside Approve where a reader would take it for
   * a verdict on the words. The busy flag is separate for the same reason: it
   * gates one control.
   */
  const [closureBusy, setClosureBusy] = useState(false);
  const [closureError, setClosureError] = useState<string | null>(null);
  /**
   * Whether the leave-open popover is open, held here beside the rejection's
   * flag and for the same reason: this component owns which door is asking.
   */
  const [leaveOpenAsking, setLeaveOpenAsking] = useState(false);
  /**
   * WHERE THAT POPOVER OPENS. The switch is the control being answered, so the
   * box lands under it — and the switch is the design system's own element, so
   * the anchor is a wrapper this file owns rather than a ref threaded through a
   * component whose props are not ours to add to.
   */
  const closureAnchor = useRef<HTMLSpanElement>(null);
  /** The switch's own id, so the word beside it is its label and not loose text. */
  const closureId = useId();
  /**
   * The approved version beside the current one, KEYED BY WHAT WAS ASKED FOR.
   *
   * The key is the node's id and its stamp together, so the answer to a question
   * about another node — or about this node before the last save — is not shown
   * as the answer to this one. See the guard below the fetch.
   */
  const [version, setVersion] = useState<{
    key: string;
    value: ApprovedVersion;
  } | null>(null);
  const [versionBusy, setVersionBusy] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);

  // Memoised because the panel re-renders per keystroke, and this list only
  // moves when the graph does.
  const existingIds = useMemo(() => nodes.map((existing) => existing.id), [nodes]);

  // Only a different node or a different mode refills the form; a repeat create
  // request re-aims the one already open instead, in the effect below. A reload
  // while someone is typing must not overwrite what they have typed, which is
  // why `node` and `nodes` are read in here and deliberately not depended on.
  /** The bytes the editor was opened over, for the check below. */
  const opened = useRef<{
    shortName: string;
    name: string;
    body: string;
  } | null>(null);

  const nodeId = node?.id ?? null;
  useEffect(() => {
    setError(null);
    setBusy(false);
    setConfirmingDelete(false);
    setIdTouched(false);
    setBodyTouched(false);
    // The review half is refilled with the rest of the form, and for the same
    // reason: a refusal, a busy flag or a fetched diff belongs to the node it
    // was asked about, and a panel that moved to another node carrying any of
    // them would be showing one node's answer over another node's file.
    setReviewBusy(false);
    setReviewError(null);
    setRejectOpen(false);
    setClosureBusy(false);
    setClosureError(null);
    setLeaveOpenAsking(false);
    setVersion(null);
    setVersionBusy(false);
    setVersionError(null);

    const rows = rowsOf(node);
    setCommits(rows);
    setNextKey(rows.length);

    if (node) {
      setType(node.type);
      setId(node.id);
      setShortName(node.shortName);
      setName(node.name);
      setBody(node.body);
      // What the form was filled from, kept so that the same file arriving
      // different can be noticed. It is a ref and not state because nothing is
      // drawn from it directly — see `changedUnderneath` below.
      opened.current = {
        shortName: node.shortName,
        name: node.name,
        body: node.body,
      };
      return;
    }
    opened.current = null;

    const startingType = presetType ?? "";
    setType(startingType);
    setId(nextIdSuggestion(startingType, existingIds));
    setShortName("");
    setName("");
    // The template's starting shape, not an empty page — and only a suggestion:
    // deleting all of it is as good a specification as filling it in.
    setBody(bodySkeleton(startingType));
  }, [mode, nodeId]);

  /**
   * A SECOND "add node here" RE-AIMS THE FORM THAT IS ALREADY OPEN.
   *
   * `presetType` is read once, by the refill above, on the commit that opened
   * the form — and the form is never unmounted, so asking for a node in another
   * column while it stands open would otherwise leave it aimed at the column
   * asked for first. The counter is what makes the second ask a second ask.
   *
   * IT RE-AIMS AND IT DOES NOT CLEAR. Remounting on a `key` would say this in
   * one word and throw away a half-typed draft. The two names stay as typed —
   * they mean the same thing under every type — and the id and the body each
   * follow their own touch rule: still the suggestion, they move with the type;
   * the person's own, they stay the person's.
   *
   * A REQUEST THAT NAMES NO TYPE LEAVES THE FIELD ALONE: the toolbar's Add node
   * has no column and therefore no opinion, and resetting the dropdown there
   * would discard a choice the person made by hand.
   */
  useEffect(() => {
    if (mode !== "create" || presetType === undefined) {
      return;
    }
    setType(presetType);
    if (!idTouched) {
      setId(nextIdSuggestion(presetType, existingIds));
    }
    if (!bodyTouched) {
      setBody(bodySkeleton(presetType));
    }
  }, [request]);

  /**
   * The colour's title and sentence, or `null` where this panel says nothing —
   * green, which gets one muted line instead, and the reasons that cannot reach
   * a panel at all. `statusCopy` carries the reasoning.
   */
  const statusText =
    status === null || node === null ? null : statusCopy(status, node);

  /**
   * A REJECTION THE COLOUR NO LONGER CARRIES, WHICH IS HISTORY AND NOT A STATE.
   *
   * The book keeps the latest rejection whatever the node has done since, so a
   * yellow node can carry a record from before the agent fixed it and a green
   * one a record from before somebody approved it. `reason === "rejected"` is
   * the only thing that says a rejection STANDS — read the record as if it were
   * the verdict and a fixed node looks refused — so when it says otherwise this
   * is a hearing that already happened, and it is worth exactly one line: the
   * reviewer coming back to a resubmitted node wants to know it was here before.
   */
  const lapsedRejection =
    status !== null &&
    status.reason !== "rejected" &&
    status.rejection !== null &&
    judgeable(status)
      ? status.rejection
      : null;

  /**
   * WHETHER THIS NODE CAN BE REFUSED, WHICH INCLUDES ONE THAT IS ALREADY GREEN.
   *
   * Yellow is the ordinary case — somebody read it and it is wrong. GREEN IS THE
   * ONE THAT LOOKS LIKE A MISTAKE AND IS NOT: an approval can turn out to have
   * been wrong, the colour table settles the clash the other way (a rejection
   * beats an approval), and a surface that hid the door would make the only fix
   * an edit to a file nobody wanted edited.
   *
   * RED HAS NO DOOR. A file that will not read, a node nothing anchors and a
   * node already rejected are not judgements waiting to be made — the first two
   * are fixes and the third has been made — and the daemon refuses all three.
   * A node with a deletion proposed over it has its own two buttons, and a third
   * verdict beside them would be two questions in one pane.
   */
  const canReject =
    mode === "view" &&
    node !== null &&
    node.deletionProposed === undefined &&
    status !== null &&
    judgeable(status);

  /**
   * THE DOOR THAT ASKS FOR CHANGES, and it lives on the footer row beside Edit.
   *
   * IT IS THE SAME ACT AS EDITING, POINTED AT SOMEBODY ELSE. A person reading a
   * node either fixes it themselves — Edit — or writes down what is wrong and
   * hands it back, which is what this does: the rejection ledger's record is a
   * work order the agent reads next. Two ways to change the same node belong on
   * the same row; the verdict box above stays about the verdict.
   *
   * "REQUEST CHANGES" AND NOT "REJECT", for the same reason. What the button
   * does to the ledger is a rejection and the sentences everywhere else still
   * say so; what a person is DOING is asking for a different version, and the
   * button is named for the act rather than for the record it leaves.
   */
  const rejectDoor =
    canReject && node !== null ? (
      <RejectionPopover
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        target={{ id: node.id, name: node.name }}
        verb="Reject"
        trigger={
          <Button type="button" variant="outline" className="ml-auto">
            Request changes…
          </Button>
        }
        onConfirm={onReject}
      />
    ) : null;

  /**
   * HOW MUCH CLAIMS THIS CRITERION, COUNTED OFF THE RELATIONS POINTING AT IT.
   *
   * `referrers` is already the edges INTO this node, and a claimant is exactly
   * one of those whose type the closure table names — so the count is read off
   * the graph the
   * panel was handed rather than asked for as a second number that could
   * disagree with the board. EVERY CLAIMANT COUNTS, WHATEVER COLOUR IT WEARS:
   * closing accepts the whole list, so the number is the size of the list and
   * not of its green part — which claimants still WAIT on approval is the
   * caption's next question, not this count's.
   */
  // WHICH RELATION CLAIMS THIS NODE IS THE CANON'S ANSWER: `CLAIMS` into a
  // criterion, `ADDRESSES` into a work item, and nothing into anything else.
  const closureKind = closureKindOf(node?.type ?? "");
  const claimants =
    closureKind === null
      ? 0
      : referrers.filter((edge) => edge.type === closureKind.claim).length;
  const awaiting = unapprovedClaimants.length;

  /**
   * WHY THE SWITCH IS DARK, OR HOW MUCH IS UNDER IT — one caption, because a
   * reader looking at a control they cannot use wants the reason in the place
   * the number would have been rather than beside it.
   *
   * THE REFUSALS ARE THE DAEMON'S OWN AND ARE SAID BEFORE IT SAYS THEM. It
   * refuses a close with nothing claiming the subject, one whose own wording
   * stands rejected, one that is not yet green, and one with claimants nobody
   * has approved — so the surface shuts the door and says which it is.
   */
  const words = CLOSURE_WORDS[closureKind?.kind ?? "criterion"];
  /**
   * WHETHER THE SUBJECT'S OWN WORDS ARE SETTLED — the other half of the gate,
   * and the half that was missing. "Met" is a statement about words somebody
   * agreed to, so an unapproved or edited subject has nothing for its claimants
   * to be measured against; the daemon refuses the same door in the same order,
   * and this is that refusal said before it is reached.
   */
  const subjectUnread = status !== null && status.color !== "green";
  const closureCaption =
    claimants === 0
      ? words.none
      : status?.reason === "rejected"
        ? "Its wording is rejected — closure waits until the words stand."
        : subjectUnread
          ? words.unread
          : awaiting > 0
            ? `${unapprovedClaimants.join(", ")} ${awaiting === 1 ? "is" : "are"} awaiting approval — the switch opens once every claim is approved.`
            : claimants === 1
              ? words.one
              : words.many(claimants);

  /**
   * WHETHER THIS NODE HAS A COMPARISON TO SHOW, WHICH IS ALSO WHETHER ONE IS
   * FETCHED. The approved version is a second file read out of git, so it is
   * asked for only where it is drawn: on a node being READ, that the daemon
   * calls `changed`, with no deletion standing over it — a proposal renders the
   * status quiet, and a diff under a question about removing the node entirely
   * is an answer to a question nobody asked.
   *
   * TWO STAMPS ARE IN THE KEY. The file's, so saving this node asks again: the
   * file moved, and the comparison drawn against the version before the save is
   * stale the moment it lands. And the approval's, because the approval no
   * longer lives in the file — a `git pull` or a hand edit can move the ledger
   * while the node's bytes and mtime stay put, and the version the diff is
   * drawn against is chosen by the record.
   */
  const wantsDiff =
    mode === "view" &&
    node !== null &&
    node.deletionProposed === undefined &&
    status?.reason === "changed";
  const diffKey =
    wantsDiff && node !== null
      ? `${node.id}:${String(node.updatedAt)}:${status?.approval?.at ?? ""}`
      : null;

  /**
   * BOTH THE FLAG AND THE KEY GUARD, BECAUSE THEY GUARD DIFFERENT THINGS. `live`
   * stops a setState after this panel has moved on — React's warning, and a
   * refusal from a node nobody is looking at any more. The key guard below stops
   * a SLOW answer that lands while the panel is on another node from being drawn
   * as that node's diff, which no cleanup can prevent because the fetch that was
   * cancelled is not the one that resolves last.
   *
   * The key is the only dependency: it carries the node and its stamp, which are
   * the whole of what the request is made of.
   */
  useEffect(() => {
    if (diffKey === null || node === null) {
      return;
    }
    let live = true;
    setVersionBusy(true);
    setVersionError(null);
    loadApprovedVersion(node.id)
      .then((value) => {
        if (live) {
          setVersion({ key: diffKey, value });
        }
      })
      .catch((fetchError: unknown) => {
        if (live) {
          setVersionError(
            fetchError instanceof Error
              ? fetchError.message
              : "Could not read the approved version",
          );
        }
      })
      .finally(() => {
        if (live) {
          setVersionBusy(false);
        }
      });
    return () => {
      live = false;
    };
  }, [diffKey]);

  /** The fetched pair, but only while it is the pair this panel is asking about. */
  const shown =
    version !== null && version.key === diffKey ? version.value : null;

  /**
   * WHAT MOVED, or `null` while there is nothing to compare yet.
   *
   * GIT NO LONGER HOLDING THE APPROVED VERSION IS NOT AN ERROR AND NOT AN EMPTY
   * ANSWER. The file as it stands is still what the person came to read, so it is
   * drawn as one unchanged block with a note above it saying why nothing is
   * marked — see the render.
   */
  const rows = useMemo<DiffRow[] | null>(() => {
    if (shown === null) {
      return null;
    }
    return shown.approved === null
      ? wholeFile(shown.current)
      : lineDiff(shown.approved, shown.current);
  }, [shown]);

  /** The dropdown owns the id and the skeleton while each is still a suggestion. */
  function chooseType(next: string) {
    setType(next);
    if (!idTouched) {
      setId(nextIdSuggestion(next, existingIds));
    }
    if (!bodyTouched) {
      setBody(bodySkeleton(next));
    }
  }

  const trimmedId = id.trim();

  /**
   * What is wrong with the id, said while they type rather than after a round
   * trip. The daemon checks the same two things and its refusal is the
   * authority — this is here so a save that could only be refused is not
   * offered, and its wording is its own so nobody has to keep two sentences in
   * step. If another session takes the id first, the daemon's refusal is what
   * arrives and what gets shown.
   */
  const idProblem =
    mode !== "create"
      ? null
      : trimmedId === ""
        ? "An id is required."
        : existingIds.includes(trimmedId)
          ? `${trimmedId} already belongs to a node in this project.`
          : null;

  /**
   * An empty box is only worth a sentence once somebody has emptied it —
   * "required" under a field nobody has reached yet is noise. A box with
   * something in it says its problem either way, including the problem nobody
   * typed: a reload can seat the very id the suggestion offered, and a button
   * that has gone quiet with no sentence beside it is the worst of both.
   */
  const showIdProblem = idProblem !== null && (idTouched || trimmedId !== "");

  // The four identity fields are required of every node, and they are the whole
  // of what is required: the specification below them is free markdown and an
  // empty one is a node with nothing to say yet, not a refusal. The daemon's
  // emptiness rule for the names is the same trim run here, so the button is
  // off exactly when a save would be refused.
  /**
   * Whether the form is a WorkLog's, which is the one type that carries a
   * commit list. Read off the type box rather than the node, so the create
   * form grows the editor the moment WorkLog is picked.
   */
  const isWorkLog = type.trim() === "WorkLog";
  /**
   * THE ONE PLACE A BACKGROUND REFETCH IS ALLOWED TO SPEAK.
   *
   * Everything else on this surface updates in silence, because a person
   * reading a screen that has just become correct does not need telling. This
   * is the exception: the file under an open editor has changed, the form still
   * holds what it was filled with, and saving would write over whatever
   * arrived. That costs something to accept, so it is said — and only said. The
   * save is not blocked, because the person is the one who knows whether their
   * draft or the file is the one worth keeping.
   *
   * It compares the bytes rather than the stamp: a write of identical content
   * moves the mtime, and a warning nobody can act on teaches people to ignore
   * warnings.
   */
  const changedUnderneath =
    mode === "edit" &&
    node !== null &&
    opened.current !== null &&
    (node.shortName !== opened.current.shortName ||
      node.name !== opened.current.name ||
      node.body !== opened.current.body);

  const canSave =
    type.trim() !== "" &&
    trimmedId !== "" &&
    shortName.trim() !== "" &&
    name.trim() !== "" &&
    idProblem === null;

  function addCommit() {
    setCommits((current) => [...current, { key: nextKey, sha: "" }]);
    setNextKey((current) => current + 1);
  }

  /**
   * One row's text — and, WHEN A PASTE BRINGS SEVERAL, several rows. The
   * ordinary way to have a list of shas is `git log --format=%h` in a
   * terminal, and pasting that into one box should not mean retyping it into
   * six; whitespace splits it, the first sha keeps the row being typed in (so
   * focus stays put), and the rest are new rows after it. A sha holds no
   * whitespace, so nothing legitimate is lost to the split.
   */
  function editCommit(key: number, value: string) {
    if (!/\s/.test(value)) {
      setCommits((current) =>
        current.map((row) => (row.key === key ? { ...row, sha: value } : row)),
      );
      return;
    }
    const parts = value.split(/\s+/).filter((part) => part !== "");
    const [first = "", ...rest] = parts;
    setCommits((current) => {
      const at = current.findIndex((row) => row.key === key);
      if (at === -1) {
        return current;
      }
      const extra = rest.map((sha, offset) => ({ key: nextKey + offset, sha }));
      return [
        ...current.slice(0, at),
        { key, sha: first },
        ...extra,
        ...current.slice(at + 1),
      ];
    });
    setNextKey((current) => current + rest.length);
  }

  function removeCommit(key: number) {
    setCommits((current) => current.filter((row) => row.key !== key));
  }

  async function save() {
    if (!canSave || busy) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Trimmed on the way out because the daemon trims before it stores: what
      // is sent is then what lands, and the panel is not showing one string
      // while the file holds another. The body goes whole — the daemon settles
      // its blank-line edges by its own one rule, and a second trim here would
      // be a second rule about the same whitespace. The commits go only from
      // a WorkLog's form, and go whole: the list on screen is the list.
      const draft: NodeDraft = {
        type: type.trim(),
        id: trimmedId,
        shortName: shortName.trim(),
        name: name.trim(),
        body,
      };
      if (isWorkLog) {
        // A row left blank is somebody who clicked Add and changed their
        // mind, dropped on the way out rather than held against them.
        draft.commits = commits
          .map((row) => row.sha.trim())
          .filter((sha) => sha !== "");
      }
      await onSubmit(draft);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save the node",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete the node",
      );
    } finally {
      setConfirmingDelete(false);
      setBusy(false);
    }
  }

  /**
   * The two review writes, which differ only in what they send and what they say
   * when they are refused. Both leave the panel where it is: the plane refetches
   * and the node under it is redrawn with whatever the write actually did.
   */
  async function approve() {
    if (reviewBusy) {
      return;
    }

    setReviewBusy(true);
    setReviewError(null);
    try {
      await onApprove();
    } catch (approveError) {
      // The daemon's own sentence. It refuses an approve for reasons this panel
      // cannot always know it should have hidden the button for — a node that
      // turned orphan under another session, a proposal written since the last
      // read — and its words are the ones that say which.
      setReviewError(
        approveError instanceof Error
          ? approveError.message
          : "Could not approve the node",
      );
    } finally {
      setReviewBusy(false);
    }
  }

  async function reject() {
    if (reviewBusy) {
      return;
    }

    setReviewBusy(true);
    setReviewError(null);
    try {
      await onRejectDeletion();
    } catch (rejectError) {
      setReviewError(
        rejectError instanceof Error
          ? rejectError.message
          : "Could not reject the deletion",
      );
    } finally {
      setReviewBusy(false);
    }
  }

  /**
   * TAKING A REJECTION BACK, which is a write about the BOOK and not about the
   * node — nothing in the file changes, the record leaves, and the colour is
   * whatever the rest of the arithmetic makes it once it is gone. It shares the
   * review pair for the same reason the two above do: it is not a save, and a
   * refusal here must not disable the editor.
   */
  async function withdrawRejection() {
    if (reviewBusy) {
      return;
    }

    setReviewBusy(true);
    setReviewError(null);
    try {
      await onWithdrawRejection();
    } catch (withdrawError) {
      setReviewError(
        withdrawError instanceof Error
          ? withdrawError.message
          : "Could not withdraw the rejection",
      );
    } finally {
      setReviewBusy(false);
    }
  }

  /**
   * CLOSING THE CRITERION, WHICH NAMES NO EVIDENCE. The list judged is every
   * living piece of evidence claiming it, whatever colour each one wears, and
   * the daemon is what reads that list — so there is nothing to pick here and
   * nothing to send but the id the panel is already open on.
   *
   * ITS OWN PAIR AND NOT THE REVIEW ONE: see `closureBusy` above. The daemon
   * refuses this for reasons the panel cannot always know it should have shut
   * the switch for — the last claimant deleted under another session, a
   * rejection written since the last read — and its words are the ones that say
   * which, so they are kept verbatim under the row.
   */
  async function closeCriterion() {
    if (closureBusy) {
      return;
    }

    setClosureBusy(true);
    setClosureError(null);
    try {
      await onCloseCriterion();
    } catch (closeError) {
      setClosureError(
        closeError instanceof Error
          ? closeError.message
          : "Could not close the criterion",
      );
    } finally {
      setClosureBusy(false);
    }
  }

  /** Enter saves from a one-line field. A prose box keeps its newlines. */
  function saveOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    }
  }

  // Deliberately not a <form>: React reuses one <button> element across the
  // three footers, so a submit button appearing under a click that landed on
  // Edit would submit the form the click was never meant to touch.
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <span className="truncate text-sm font-medium">{TITLE[mode]}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label="Close panel"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {mode === "view" && node ? (
          <div className="grid gap-4">
            {/* AN AGENT ASKING FOR THIS NODE TO GO, AT THE TOP OF THE PANEL AND
                ABOVE THE FILE IT IS ABOUT. It is the one thing here that is a
                QUESTION rather than a description, and a question answered at the
                bottom of a long specification is a question people answer without
                reading it.

                THE RATIONALE IS SHOWN VERBATIM AND ITS LINE BREAKS ARE KEPT. It
                is the agent's argument for the deletion and the whole of what the
                person is deciding on; reflowing it would be this panel editing
                evidence. It is deliberately not markdown — see `Markdown`'s note
                on why the body is, and this is not a document.

                BOTH ANSWERS ARE HERE AND NEITHER IS THE DEFAULT. Approving goes
                through the same confirmation the destructive menu item does, so
                the cascade is named once and in one wording wherever a node
                leaves. */}
            {node.deletionProposed === undefined ? null : (
              <div className="border-destructive/40 grid gap-3 rounded-md border p-3">
                <span className="text-sm font-medium">Deletion proposed</span>
                <span className="text-muted-foreground text-xs">
                  Proposed by {node.deletionProposed.by}
                </span>
                <p className="text-sm whitespace-pre-wrap">
                  {node.deletionProposed.rationale}
                </p>
                {referrers.length === 0 ? null : (
                  <div className="grid gap-2">
                    <p className="text-sm">
                      {impactSentence(node.id, referrers.length)}
                    </p>
                    <Referrers edges={referrers} />
                  </div>
                )}
                {/* THE EXECUTION BAND HAS NO APPROVE DELETION. A record is
                    not unhappened by removing it, and the daemon refuses the
                    door either way — so the one honest button is Reject, and
                    the sentence says why the other is not here. */}
                {bandOf(node.type) === "Execution" ? (
                  <p className="text-muted-foreground text-sm">
                    The execution band is append-only, so this record cannot
                    be deleted — reject the proposal to clear it.
                  </p>
                ) : null}
                <div className="flex items-center gap-2">
                  {bandOf(node.type) === "Execution" ? null : (
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={reviewBusy}
                      onClick={() => setConfirmingDelete(true)}
                    >
                      <Trash2 />
                      Approve deletion
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={reviewBusy}
                    onClick={() => void reject()}
                  >
                    {reviewBusy ? "Rejecting…" : "Reject"}
                  </Button>
                </div>
                {reviewError ? (
                  <p className="text-destructive text-sm">{reviewError}</p>
                ) : null}
              </div>
            )}

            {/* THE COLOUR, SAID IN WORDS. The square on the card is the whole of
                what the board can show; this is where the same verdict gets its
                sentence and, where there is one, the button that resolves it.

                NO STATUS IS NO SECTION. A node the review does not mention has
                no verdict to say — the review lists every canon type, the
                execution band included, so in practice that is only the moment
                before it has been read — and the honest answer then is silence,
                not a fourth colour. Nothing here works a verdict out for itself.

                GREEN IS ONE MUTED LINE AND NOT A BOX. A box is a thing to deal
                with, and an approved node is the state everything else is trying
                to reach: it says who approved it and when — read off the
                ledger, not the file — at the weight of a caption, and gets out
                of the way of the specification below.

                WHILE A DELETION IS PROPOSED THE SECTION GOES QUIET — the dot and
                the sentence, no Approve and no diff. There is exactly one
                question open on this node then, it is the card above, and a
                second button offering to sign off the very text somebody is
                asking to remove would be two decisions in one pane.

                A REJECTION IS THAT SAME BOX WITH SOMEBODY'S ARGUMENT INSIDE IT,
                and it is the one verdict here that quotes a person rather than
                describing a state. A rejection the colour no longer carries
                leaves the box entirely and becomes one line under it: history is
                not a state, and drawing it as one would make a fixed node look
                refused. */}
            {status === null ? null : (
              <div className="grid gap-2">
                {/* GREEN SAYS NOTHING HERE ANY MORE, and that is the point of
                    the arrangement rather than an omission. An approved node is
                    the state everything else is trying to reach: it is not a
                    thing to deal with, so it gets no box, no dot and no line
                    above the specification — who approved it and when is a FACT
                    ABOUT THE NODE and now sits with the other facts, in the
                    `Approved` field beside `Updated` at the foot of the pane.
                    The one door it still has is on the footer row beside Edit,
                    where asking for changes sits next to making them. */}
                {status.color === "green" ? null : statusText === null ? null : (
                  <div className="grid gap-2 rounded-md border p-3">
                    <div className="flex items-center gap-1.5">
                      <StatusDot color={status.color} />
                      <span className="text-sm font-medium">
                        {statusText.title}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {statusText.body}
                    </p>
                    {/* THE RATIONALE VERBATIM, LINE BREAKS AND ALL — the same
                        promise the deletion proposal above makes about the same
                        kind of text. It is the argument the agent will read
                        next and the whole of what a person is deciding to take
                        back; reflowing it would be this panel editing evidence.
                        Not markdown, for the reason the proposal's is not: this
                        is a sentence somebody wrote, not a document. */}
                    {status.reason === "rejected" ? (
                      <div className="grid gap-2">
                        {status.rejection === null ? null : (
                          <p className="text-sm whitespace-pre-wrap">
                            {status.rejection.rationale}
                          </p>
                        )}
                        {/* THE ONE DOOR OUT, AND IT IS NOT APPROVE. While the
                            rejection stands the daemon refuses an approval and
                            says so — the honest button is the one that takes
                            back what was said, after which the node is whatever
                            colour the rest of the arithmetic makes it. */}
                        <Button
                          type="button"
                          variant="outline"
                          className="justify-self-start"
                          disabled={reviewBusy}
                          onClick={() => void withdrawRejection()}
                        >
                          {reviewBusy ? "Withdrawing…" : "Withdraw rejection"}
                        </Button>
                        {reviewError ? (
                          <p className="text-destructive text-sm">
                            {reviewError}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {wantsDiff ? (
                      <div className="grid gap-2">
                        {versionBusy ? (
                          <p className="text-muted-foreground text-sm">
                            Reading the approved version…
                          </p>
                        ) : versionError !== null ? (
                          <p className="text-destructive text-sm">
                            {versionError}
                          </p>
                        ) : rows === null ? null : (
                          <>
                            {shown?.approved === null ? (
                              <p className="text-muted-foreground text-sm">
                                Git no longer holds the version this was
                                approved at, so there is nothing to compare
                                against. This is the file as it stands.
                              </p>
                            ) : null}
                            <LineDiff rows={rows} />
                          </>
                        )}
                      </div>
                    ) : null}
                    {/* THE ONE ANSWER THIS BOX CARRIES IS AGREEMENT. Refusing
                        is the other half of the same decision, and it is on the
                        footer row beside Edit — the two ways of changing a node
                        a person has read: do it yourself, or write down what is
                        wrong and hand it back. */}
                    {/* YELLOW IS THE ONE COLOUR APPROVING RESOLVES — the same
                        clause the queue's rows gate their button on. An orphan
                        or a refused node gets the sentence and no button, and
                        the daemon refuses either at the door anyway. */}
                    {node.deletionProposed === undefined &&
                    status.color === "yellow" ? (
                      <div className="grid gap-2">
                        <Button
                          type="button"
                          className="justify-self-start"
                          disabled={reviewBusy}
                          onClick={() => void approve()}
                        >
                          {reviewBusy ? "Approving…" : "Approve"}
                        </Button>
                        {reviewError ? (
                          <p className="text-destructive text-sm">
                            {reviewError}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
                {/* WHAT WAS SAID LAST TIME, IN ONE LINE AND UNDER THE VERDICT.
                    It is history and not a state — the colour above is the
                    state — so it is drawn at the weight of a caption and gets
                    its first line only: a reviewer who wants the whole argument
                    has the card the agent answered it on. */}
                {lapsedRejection === null ? null : (
                  <span className="text-muted-foreground text-xs">
                    {`Previously rejected by ${lapsedRejection.by} · ${formatStamp(lapsedRejection.at)}: ${firstLine(lapsedRejection.rationale)}`}
                  </span>
                )}
              </div>
            )}

            {/* THE SECOND AXIS, AS THE ONE CONTROL THAT MOVES IT — and it is
                under the status box because it is a different question about
                the same node: the box above says whether the words are agreed
                to, this says whether the demand is met.

                A SWITCH AND NOT TWO BUTTONS, BECAUSE THERE ARE TWO STATES AND
                THE QUEUE HAS TWO EXITS. Closing accepts every piece of evidence
                claiming the criterion now; leaving it open refuses that same
                list in writing. Each door removes the other book's word, so the
                honest drawing is one thing with two positions rather than two
                controls that can both look pressed.

                ONLY THE OFF DIRECTION ASKS FOR A SENTENCE, and that asymmetry
                is the whole of why this is not a plain controlled switch. "Met"
                is a signature; "not met" is an argument the agent reads next,
                and the daemon will not take it without one — so the switch does
                not move on the way back, the popover opens on it, and the state
                stays whatever `status` says until a write actually lands.

                A CRITERION AND NOTHING ELSE. `status.closure` is null for every
                other type, which is the daemon saying the question does not
                apply — nothing here works out for itself what can be closed.

                AND IT GOES QUIET UNDER A DELETION PROPOSAL, like the status box
                above it: there is one question open on this node then, it is the
                card at the top, and a switch offering to sign off a criterion
                somebody is asking to remove would be two decisions in one pane. */}
            {status !== null &&
            status.closure !== null &&
            node.deletionProposed === undefined ? (
              <div className="grid gap-2">
                <span className="text-muted-foreground text-xs font-medium">
                  Closure
                </span>
                <div className="flex items-center gap-2">
                  <span ref={closureAnchor} className="flex items-center">
                    <Switch
                      id={closureId}
                      checked={status.closure === "closed"}
                      disabled={
                        closureBusy ||
                        reviewBusy ||
                        claimants === 0 ||
                        awaiting > 0 ||
                        subjectUnread
                      }
                      onCheckedChange={(next: boolean) => {
                        if (next) {
                          void closeCriterion();
                          return;
                        }
                        setLeaveOpenAsking(true);
                      }}
                    />
                  </span>
                  <Label htmlFor={closureId}>
                    {closureBusy
                      ? "Closing…"
                      : status.closure === "closed"
                        ? "Closed"
                        : "Open"}
                  </Label>
                </div>
                <span className="text-muted-foreground text-xs">
                  {closureCaption}
                </span>
                {closureError === null ? null : (
                  <p className="text-destructive text-sm">{closureError}</p>
                )}
                {/* THE STANDING WORD THAT THIS IS NOT MET, DRAWN WHOLE. It is a
                    person's sentence written for the agent — the same kind of
                    text the deletion proposal carries and quoted under the same
                    promise: line breaks and all, not markdown, because it is an
                    argument somebody wrote and not a document. The line above it
                    is who and when, at a caption's weight. */}
                {status.leftOpen === null ? null : (
                  <>
                    <span className="text-muted-foreground text-xs">
                      {`Left open by ${status.leftOpen.by} · ${formatStamp(status.leftOpen.at)}: ${firstLine(status.leftOpen.rationale)}`}
                    </span>
                    <p className="text-sm whitespace-pre-wrap">
                      {status.leftOpen.rationale}
                    </p>
                  </>
                )}
                {/* NO TRIGGER, BECAUSE THE SWITCH IS THE TRIGGER. It opens on
                    the gesture that tried to turn the criterion back to open,
                    anchored to the control that gesture landed on; cancelling
                    writes nothing and the switch — controlled by `status` — has
                    not moved. */}
                <RejectionPopover
                  open={leaveOpenAsking}
                  onOpenChange={setLeaveOpenAsking}
                  target={{ id: node.id, name: node.name }}
                  verb="Leave open"
                  anchor={closureAnchor}
                  onConfirm={onLeaveOpen}
                />
              </div>
            ) : null}

            <Field label="Type">
              <Badge variant="secondary">{node.type}</Badge>
            </Field>
            {/* THE MARK BESIDE THE ID, WHICH IS THE SECOND AXIS'S ANSWER. It is
                drawn in this row in BOTH modes and on the card on the canvas,
                so the three places an id appears give one answer;
                `SecondAxisMark` owns which mark a type wears, and `status` is
                where the answer comes from. Here it also repeats what the
                switch above already says, which is the point: this is the row a
                person reads the id off, and the id and its state belong
                together wherever they are drawn. */}
            <Field label="ID">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs break-all">{node.id}</span>
                <SecondAxisMark
                  closure={status?.closure ?? null}
                  workItemState={status?.workItemState ?? null}
                  satisfaction={status?.satisfaction ?? null}
                />
              </div>
            </Field>
            <Field label="Short name">
              <span className="text-sm">{node.shortName}</span>
            </Field>
            <Field label="Name">
              <span className="text-sm">{node.name}</span>
            </Field>
            {/* THE BODY IS THE NODE'S OWN FILE BELOW THE FENCE, read as the
                markdown it is — whatever headings, lists or fences the author
                chose, in the author's order, because the file is the truth and
                this is the file. An empty one is shown as the dash rather than
                skipped: "this node has no specification yet" is the answer a
                person came for, not a row that quietly is not there. */}
            <Field label="Specification">
              {node.body === "" ? (
                <span className="text-muted-foreground text-sm">—</span>
              ) : (
                <Markdown>{node.body}</Markdown>
              )}
            </Field>
            {/* THE WORK LOG'S COMMITS, in the order the author recorded them.
                It is a WorkLog's key and no other type's, so no other panel
                grows the row; a work log that has none says so with the dash,
                because "this work produced no commit" is an answer too. Shas
                and nothing else — the message is git's to answer for — and
                the sha is the file's own text: a person reading it beside a
                terminal wants the characters, not a link the panel invents. */}
            {node.type === "WorkLog" ? (
              <Field label="Commits">
                {node.commits === undefined || node.commits.length === 0 ? (
                  <span className="text-muted-foreground text-sm">—</span>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {node.commits.map((sha, index) => (
                      <li
                        key={`${sha}:${String(index)}`}
                        className="bg-muted rounded-md border px-1.5 py-0.5 font-mono text-xs"
                      >
                        {sha}
                      </li>
                    ))}
                  </ul>
                )}
              </Field>
            ) : null}
            {/* UPDATED IS METADATA AND NOT AN ATTRIBUTE, which is worth
                recording because the rows above it are exactly what the type
                carries. The daemon sets it and no form offers it — the create
                form is exactly what was asked for — so it is shown for the same
                reason a file's date is shown beside its name. It is the
                modified instant
                and not the created one for that same reason: what a person
                wants from a date beside a document is how current what they are
                reading is, and on a node that has been edited the creation
                instant answers a different question. A node nobody has edited
                shows the instant it was written, which is the true answer. */}
            <Field label="Updated">
              <span className="text-sm">{formatStamp(node.updatedAt)}</span>
            </Field>
            {/* WHO SIGNED THIS OFF, AND WHEN — a fact about the node, filed
                with the other facts rather than announced above the
                specification.

                IT IS READ OUT OF THE LEDGER AND NEVER OFF THE FILE, which is
                the whole arrangement: a node file carries no claim about its own
                approval. The instant leads and the name follows it in brackets,
                because the question a reader has here is "how current is this
                agreement" and the person is the follow-up.

                IT IS SHOWN ONLY WHILE THE APPROVAL STANDS. A node somebody
                edited after it was approved is yellow, and its ledger record is
                history the verdict box above already tells the story of — a
                field reading "Approved …" over a changed node would be the
                panel contradicting its own colour. */}
            {status?.color === "green" && status.approval !== null ? (
              <Field label="Approved">
                <span className="text-sm">
                  {`${formatStamp(status.approval.at)} (${status.approval.by})`}
                </span>
              </Field>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4">
            {mode === "edit" && node ? (
              /* Type and id are settled at create: the id is what every edge
                 names, and the type is what decides which edges are grammatical
                 at all. The daemon refuses to move either, so a form offering
                 them would be lying about what a save can do. */
              <>
                <Field label="Type">
                  <Badge variant="secondary">{node.type}</Badge>
                </Field>
                <Field label="ID">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs break-all">
                      {node.id}
                    </span>
                    <SecondAxisMark
                      closure={status?.closure ?? null}
                      workItemState={status?.workItemState ?? null}
                      satisfaction={status?.satisfaction ?? null}
                    />
                  </div>
                </Field>
              </>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="node-type">
                    <RequiredLabel text="Type" />
                  </Label>
                  <Select
                    value={type}
                    onValueChange={(value) => chooseType(value ?? "")}
                  >
                    {/* No type is preselected: a dropdown showing Term on open
                        would answer a question nobody was asked. */}
                    <SelectTrigger id="node-type" autoFocus className="w-full">
                      <SelectValue placeholder="Choose a type" />
                    </SelectTrigger>
                    {/* Item-aligned positioning would hang the whole roster
                        off the chosen row; in a docked panel a roster this long
                        only fits as a plain drop below the trigger. */}
                    <SelectContent alignItemWithTrigger={false}>
                      {TYPE_GROUPS.map((group) => (
                        <SelectGroup key={group.band}>
                          <SelectLabel>{group.band}</SelectLabel>
                          {group.types.map((entry) => (
                            <SelectItem key={entry.name} value={entry.name}>
                              {entry.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="node-id">
                    <RequiredLabel text="ID" />
                  </Label>
                  <Input
                    id="node-id"
                    className="font-mono"
                    spellCheck={false}
                    value={id}
                    aria-invalid={showIdProblem}
                    onChange={(event) => {
                      setIdTouched(true);
                      setId(event.target.value);
                    }}
                    onKeyDown={saveOnEnter}
                  />
                  <p className="text-muted-foreground text-xs">
                    Suggested from the type. Type over it for an id of your own.
                  </p>
                  {showIdProblem ? (
                    <p className="text-destructive text-xs">{idProblem}</p>
                  ) : null}
                </div>
              </>
            )}

            <div className="grid gap-2">
              <Label htmlFor="node-short-name">
                <RequiredLabel text="Short name" />
              </Label>
              <Input
                id="node-short-name"
                autoFocus={mode === "edit"}
                value={shortName}
                onChange={(event) => setShortName(event.target.value)}
                onKeyDown={saveOnEnter}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="node-name">
                <RequiredLabel text="Name" />
              </Label>
              <Input
                id="node-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={saveOnEnter}
              />
            </div>

            {/* THE SPECIFICATION, AS ONE WIDE BOX. The body is free markdown
                and this is its whole editor: no field per heading, because the
                headings are the template's suggestion and not the format's
                rule, and a form that drew a box per heading would be a form
                that could not hold a body written any other way. Monospace,
                because what is being edited is the markdown source the file
                holds — the reading view above is where it renders. Enter is a
                newline here, never a save. */}
            <div className="grid gap-2">
              <Label htmlFor="node-body">Specification</Label>
              <Textarea
                id="node-body"
                rows={16}
                className="font-mono text-sm"
                spellCheck={false}
                value={body}
                onChange={(event) => {
                  setBodyTouched(true);
                  setBody(event.target.value);
                }}
              />
              <p className="text-muted-foreground text-xs">
                Free markdown. The headings are the template&apos;s suggestion —
                keep, reshape or delete them.
              </p>
            </div>

            {/* THE COMMITS, ROW BY ROW, ON A WORKLOG'S FORM AND NO OTHER. One
                sha per row, in the order the work made them — the order is the
                author's fact, so rows are added at the end and never sorted.
                The same Input the rest of the form uses, mono because that is
                what a person pastes from a terminal; a paste of several shas
                becomes several rows. */}
            {isWorkLog ? (
              <div className="grid gap-2">
                <Label>Commits</Label>
                {commits.length === 0 ? null : (
                  <ul className="grid gap-2">
                    {commits.map((row) => (
                      <li
                        key={row.key}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
                      >
                        <Input
                          aria-label="Commit sha"
                          className="font-mono text-xs"
                          placeholder="sha"
                          spellCheck={false}
                          value={row.sha}
                          onChange={(event) =>
                            editCommit(row.key, event.target.value)
                          }
                          onKeyDown={saveOnEnter}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove commit"
                          onClick={() => removeCommit(row.key)}
                        >
                          <X />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addCommit}
                  >
                    <Plus />
                    Add commit
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  The commits this work produced, one sha per row, in the
                  order they were made. Paste several at once and they split
                  into rows.
                </p>
              </div>
            ) : null}

            {mode === "edit" && node ? (
              <>
                <Field label="Updated">
                  <span className="text-sm">{formatStamp(node.updatedAt)}</span>
                </Field>
                {/* The same pair the reading pane files at its foot, so the two
                    modes say the same things about the node in the same place.
                    Saving will move the bytes and lapse the approval; the field
                    is the state as it stands, and it disappears with it. */}
                {status?.color === "green" && status.approval !== null ? (
                  <Field label="Approved">
                    <span className="text-sm">
                      {`${formatStamp(status.approval.at)} (${status.approval.by})`}
                    </span>
                  </Field>
                ) : null}
              </>
            ) : null}
          </div>
        )}

        {error ? (
          <p className="text-destructive mt-4 text-sm">{error}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t p-3">
        {mode === "view" ? (
          <>
            <Button type="button" onClick={onEdit}>
              <Pencil />
              Edit
            </Button>
            {/* THE OTHER WAY TO CHANGE THIS NODE, pushed to the right of the
                row: `ml-auto` on the trigger, so the two doors sit at the two
                ends of the bar rather than shoulder to shoulder — making the
                change yourself and asking somebody else for it are different
                enough to be told apart at a glance. */}
            {rejectDoor}
          </>
        ) : mode === "create" ? (
          <>
            <Button
              type="button"
              disabled={!canSave || busy}
              onClick={() => void save()}
            >
              {busy ? "Adding…" : "Add node"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              disabled={!canSave || busy}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onCancelEdit}
            >
              Cancel
            </Button>
            {changedUnderneath ? (
              <p className="text-muted-foreground basis-full text-sm">
                This file changed on disk while you were editing it — saving
                writes over that. Cancel to read what arrived.
              </p>
            ) : null}
            {/* THE EXECUTION BAND HAS NO DELETE, because those files record
                what happened and a record's one legitimate end is a retention
                sweep. The daemon refuses the call too — this only spares the
                person a button whose every press is a sentence. */}
            {node !== null && bandOf(node.type) === "Execution" ? null : (
              <Button
                type="button"
                variant="destructive"
                className="ml-auto"
                disabled={busy}
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 />
                Delete
              </Button>
            )}
          </>
        )}
      </div>

      {/* THE ONE CONFIRMATION, AND IT IS REACHED FROM TWO DOORS NOW: the Delete
          button in the editor, and Approve deletion on a node an agent has asked
          to remove. Both are the same act with the same consequences, so both
          read the same sentence — `deletionSentence` is where it is written, and
          the plane's own delete dialog reads it too.

          IT IS MOUNTED ONLY WITH A NODE UNDER IT. The dialog's whole content is
          about that node — its id, and what points at it — and neither door
          exists in the create form, so there is nothing here to draw without one. */}
      {node === null ? null : (
        <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Delete this node?</DialogTitle>
              {/* The cascade is named because it is the part that is not on
                  screen: the card goes, and so does every relation drawn to it. */}
              <DialogDescription>{deletionSentence(node.id)}</DialogDescription>
            </DialogHeader>
            {/* WHAT IS LEFT POINTING AT NOTHING, NAMED ROW BY ROW. The sentence
                counts the relations and the list is those relations, so the
                number is one a person can check against what is under it. */}
            {referrers.length === 0 ? null : (
              <div className="grid gap-2">
                <p className="text-sm">
                  {impactSentence(node.id, referrers.length)}
                </p>
                <Referrers edges={referrers} />
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => void remove()}
              >
                {busy ? "Deleting…" : "Delete node"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
