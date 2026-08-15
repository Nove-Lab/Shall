import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  BAND_ORDER,
  anchorPhrase,
  bandOf,
  columnsInOrder,
  nextIdSuggestion,
  sectionGuideFor,
  type Band,
  type NodeCommit,
  type NodeTypeEntry,
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
import { Textarea } from "@/components/ui/textarea";
import {
  deletionSentence,
  impactSentence,
  type ApprovedVersion,
  type ReviewStatus,
  type StatusReason,
} from "./review";
import { LineDiff, Referrers, StatusDot } from "./review-parts";
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
 * The twenty-two types as the canvas orders them: the four bands in band
 * order, each holding its own columns in canon order.
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
 * They are spelled out rather than left to a `default` so that a fourth yellow —
 * or a reason renamed in the canon — is a compile error here.
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
      case "forged":
        return {
          title: "Approval could not be verified",
          body: "This node claims an approval this machine's key did not write, and an agent has proposed deleting it — the card above is the judgement to make first.",
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
    case "forged":
      return {
        title: "Approval could not be verified",
        body: "This node claims an approval this machine's key did not write. Read it again and approve it yourself.",
      };
    case "changed":
      return {
        title: "Changed since it was approved",
        body: "Someone edited this node after it was approved. The lines below are what moved.",
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
            : `${opening} A ${node.type} is anchored by ${phrase}.`,
      };
    }
    case "missing":
    case "malformed":
    case "approved":
      return null;
  }
}

/**
 * THE THREE STATES APPROVING RESOLVES. An orphan is the one colour a signature
 * cannot fix — the graph has to change first — so it gets the sentence and no
 * button, and the daemon refuses it at the door either way.
 */
const APPROVABLE: ReadonlySet<StatusReason> = new Set<StatusReason>([
  "unapproved",
  "forged",
  "changed",
]);

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
   * A WorkLog's commits, present exactly when the form was a WorkLog's — the
   * list is then the whole list, empty for a work log that produced none, and
   * absent for every other type so the daemon carries or omits as its own rule
   * says.
   */
  commits?: readonly NodeCommit[];
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
  message: string;
}

/** Empty for anything but a WorkLog, whose list the panel edits row by row. */
function rowsOf(node: SpecNode | null): CommitRow[] {
  return (node?.commits ?? []).map((commit, index) => ({
    key: index,
    sha: commit.sha,
    message: commit.message,
  }));
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
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmit: (draft: NodeDraft) => Promise<void>;
  onDelete: () => Promise<void>;
  /**
   * The three review writes. Each REJECTS with the daemon's own sentence and is
   * caught here, beside the button that sent it — the same contract `onSubmit`
   * has, and the reason neither of them returns an error instead.
   */
  onApprove: () => Promise<void>;
  onRejectDeletion: () => Promise<void>;
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

  const existingIds = nodes.map((existing) => existing.id);

  // Only a different node or a different mode refills the form; a repeat create
  // request re-aims the one already open instead, in the effect below. A reload
  // while someone is typing must not overwrite what they have typed, which is
  // why `node` and `nodes` are read in here and deliberately not depended on.
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
      return;
    }

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
   * WHETHER THIS NODE HAS A COMPARISON TO SHOW, WHICH IS ALSO WHETHER ONE IS
   * FETCHED. The approved version is a second file read out of git, so it is
   * asked for only where it is drawn: on a node being READ, that the daemon
   * calls `changed`, with no deletion standing over it — a proposal renders the
   * status quiet, and a diff under a question about removing the node entirely
   * is an answer to a question nobody asked.
   *
   * THE STAMP IS IN THE KEY, so saving this node asks again: the file moved, and
   * the comparison drawn against the version before the save is stale the moment
   * it lands.
   */
  const wantsDiff =
    mode === "view" &&
    node !== null &&
    node.deletionProposed === undefined &&
    status?.reason === "changed";
  const diffKey =
    wantsDiff && node !== null ? `${node.id}:${String(node.updatedAt)}` : null;

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
   * A row half filled blocks the save the way a blank name does — the daemon
   * would refuse it by name over the bytes, and the button should be off
   * exactly then. A row left wholly blank is not a commit at all; it is a
   * person who clicked Add and changed their mind, and it is dropped on the
   * way out rather than held against them.
   */
  const halfFilledCommit =
    isWorkLog &&
    commits.some(
      (row) =>
        (row.sha.trim() === "") !== (row.message.trim() === ""),
    );
  const canSave =
    type.trim() !== "" &&
    trimmedId !== "" &&
    shortName.trim() !== "" &&
    name.trim() !== "" &&
    idProblem === null &&
    !halfFilledCommit;

  function addCommit() {
    setCommits((current) => [
      ...current,
      { key: nextKey, sha: "", message: "" },
    ]);
    setNextKey((current) => current + 1);
  }

  function editCommit(key: number, patch: Partial<Pick<CommitRow, "sha" | "message">>) {
    setCommits((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
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
        draft.commits = commits
          .filter((row) => row.sha.trim() !== "" || row.message.trim() !== "")
          .map((row) => ({ sha: row.sha.trim(), message: row.message.trim() }));
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
                to reach: it says who signed it and when, at the weight of a
                caption, and gets out of the way of the specification below.

                WHILE A DELETION IS PROPOSED THE SECTION GOES QUIET — the dot and
                the sentence, no Approve and no diff. There is exactly one
                question open on this node then, it is the card above, and a
                second button offering to sign off the very text somebody is
                asking to remove would be two decisions in one pane. */}
            {status === null ? null : status.color === "green" ? (
              <div className="flex items-center gap-1.5">
                <StatusDot color="green" />
                <span className="text-muted-foreground text-sm">
                  {node.approval === undefined
                    ? "Approved"
                    : `Approved by ${node.approval.by} · ${formatStamp(node.approval.at)}`}
                </span>
              </div>
            ) : statusText === null ? null : (
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
                {wantsDiff ? (
                  <div className="grid gap-2">
                    {versionBusy ? (
                      <p className="text-muted-foreground text-sm">
                        Reading the approved version…
                      </p>
                    ) : versionError !== null ? (
                      <p className="text-destructive text-sm">{versionError}</p>
                    ) : rows === null ? null : (
                      <>
                        {shown?.approved === null ? (
                          <p className="text-muted-foreground text-sm">
                            Git no longer holds the version this was approved at,
                            so there is nothing to compare against. This is the
                            file as it stands.
                          </p>
                        ) : null}
                        <LineDiff rows={rows} />
                      </>
                    )}
                  </div>
                ) : null}
                {node.deletionProposed === undefined &&
                APPROVABLE.has(status.reason) ? (
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
                      <p className="text-destructive text-sm">{reviewError}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            <Field label="Type">
              <Badge variant="secondary">{node.type}</Badge>
            </Field>
            <Field label="ID">
              <span className="font-mono text-xs break-all">{node.id}</span>
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
                because "this work produced no commit" is an answer too. The
                sha is the file's own text — a person reading it beside a
                terminal wants the characters, not a link the panel invents. */}
            {node.type === "WorkLog" ? (
              <Field label="Commits">
                {node.commits === undefined || node.commits.length === 0 ? (
                  <span className="text-muted-foreground text-sm">—</span>
                ) : (
                  <ul className="grid gap-1.5">
                    {node.commits.map((commit, index) => (
                      <li
                        key={`${commit.sha}:${String(index)}`}
                        className="flex items-baseline gap-2"
                      >
                        <span className="bg-muted shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-xs">
                          {commit.sha}
                        </span>
                        <span className="text-sm">{commit.message}</span>
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
                  <span className="font-mono text-xs break-all">{node.id}</span>
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
                    {/* Item-aligned positioning would hang a twenty-two row
                        list off the chosen row; in a docked panel this many
                        rows only fit as a plain drop below the trigger. */}
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

            {/* THE COMMITS, ROW BY ROW, ON A WORKLOG'S FORM AND NO OTHER. A
                sha and a message per row, in the order the work made them —
                the order is the author's fact, so rows are added at the end
                and never sorted. The same two Inputs the rest of the form
                uses, mono for the sha because that is what a person pastes
                from a terminal. */}
            {isWorkLog ? (
              <div className="grid gap-2">
                <Label>Commits</Label>
                {commits.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    The commits this work produced, in the order they were
                    made. None recorded yet.
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {commits.map((row) => (
                      <li
                        key={row.key}
                        className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-2"
                      >
                        <Input
                          aria-label="Commit sha"
                          className="font-mono text-xs"
                          placeholder="sha"
                          spellCheck={false}
                          value={row.sha}
                          onChange={(event) =>
                            editCommit(row.key, { sha: event.target.value })
                          }
                          onKeyDown={saveOnEnter}
                        />
                        <Input
                          aria-label="Commit message"
                          placeholder="message"
                          value={row.message}
                          onChange={(event) =>
                            editCommit(row.key, { message: event.target.value })
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
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addCommit}
                  >
                    <Plus />
                    Add commit
                  </Button>
                  {halfFilledCommit ? (
                    <p className="text-destructive text-xs">
                      Each commit needs both a sha and a message.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {mode === "edit" && node ? (
              <Field label="Updated">
                <span className="text-sm">{formatStamp(node.updatedAt)}</span>
              </Field>
            ) : null}
          </div>
        )}

        {error ? (
          <p className="text-destructive mt-4 text-sm">{error}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t p-3">
        {mode === "view" ? (
          <Button type="button" onClick={onEdit}>
            <Pencil />
            Edit
          </Button>
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
