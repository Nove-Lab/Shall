import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router";
import { Ban, ChevronDown, ChevronRight, Eye, Undo2 } from "lucide-react";
import { api } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { RejectionPopover } from "@/spec/RejectionPopover";
import { ClosureMark, LineDiff, StatusDot } from "@/spec/review-parts";
import {
  approvable,
  firstLine,
  judgeable,
  type ApprovedVersion,
  type BundleMember,
} from "@/spec/review";
import { formatStamp, type SpecNode } from "@/spec/spec-node";
import { lineDiff, wholeFile, type DiffRow } from "@/spec/view/diff";
import { controlBase, specLink } from "../parts";

/**
 * ONE NODE INSIDE A BUNDLE, AND THE SAME ROW FOR ALL THREE KINDS.
 *
 * A spec approval's requirement, a work report's log and a criterion's claimant
 * are the same object being looked at — a node with a colour, a history in two
 * books and a file somebody can read — so they are one component. What differs
 * between the three cards is WHICH DOORS ARE OPEN, and that arrives as flags
 * rather than as three near-identical rows drifting apart: a Finding is not
 * approved from here, a Question is answered rather than read, and A CLAIMANT
 * IS NOT JUDGED AT ALL — the closure card decides over the whole list of them
 * at once, so its rows are here to be read and opened and carry no verdict.
 *
 * THE ROW NEVER WRITES. Every verdict goes up to the page through a callback,
 * because the page is what refetches — the queue is recomputed from the graph
 * on every read, so a row that wrote and re-rendered itself would be a row
 * telling a different story from the bundle around it. What the row DOES own is
 * the sentence the daemon refuses with: it belongs beside the control that sent
 * it, which is here.
 *
 * THE COMPARISON IS FETCHED ONLY WHEN SOMEBODY ASKS FOR IT. A bundle can be
 * twenty nodes and the approved version of each is a second file read out of
 * git; twenty of those on open would make the card slower than the plane it is
 * summarising. So the collapsible is the request, and it is made once per
 * version of the file.
 *
 * TWO DOORS TO THE SAME REFUSAL, AS ON THE PLANE: the button, and the row's own
 * context menu, which opens the popover at the pointer so the row being judged
 * stays where the person was looking at it. `RejectionPopover` is one piece of
 * behaviour with two ways in, and this file supplies both anchors.
 */
export interface MemberRowProps {
  member: BundleMember;
  /**
   * THE NODE BEHIND THE ROW, WHICH THE QUEUE DOES NOT SHIP. The bundle carries
   * no bodies — the card reads `spec.nodes` beside it — and `null` is the
   * honest answer for a row whose file left the graph between the two reads.
   */
  node: SpecNode | null;
  projectId: string;
  /** Where the Spec plane sends the person back to — this card's own path. */
  backPath: string;
  /** The word this row's refusal is said in; both write the same record. */
  verb: "Reject" | "Mark insufficient";
  canApprove: boolean;
  canReject: boolean;
  /** The root of a spec approval opens showing its diff — it is what the card is about. */
  defaultOpen?: boolean;
  /** A Question is answered rather than read, so its one door opens the editor. */
  answer?: boolean;
  /** One line under the top line: who submitted this, or why this row has no buttons. */
  caption?: ReactNode;
  showLabel?: string;
  hideLabel?: string;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, rationale: string) => Promise<void>;
  onWithdraw: (id: string) => Promise<void>;
}

/**
 * A BUNDLE ID READS AS ITS ROOT ON A BADGE. `spec:R-0001` is the queue's key
 * and says which of three cards it is; on a row that already sits inside a
 * card, the prefix is the half the reader knows and the id is the half they
 * need. The link still carries the whole key.
 */
export function rootLabel(bundleId: string): string {
  const colon = bundleId.indexOf(":");
  return colon === -1 ? bundleId : bundleId.slice(colon + 1);
}

export function MemberRow({
  member,
  node,
  projectId,
  backPath,
  verb,
  canApprove,
  canReject,
  defaultOpen = false,
  answer = false,
  caption = null,
  showLabel = "Show changes",
  hideLabel = "Hide changes",
  onApprove,
  onReject,
  onWithdraw,
}: MemberRowProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [version, setVersion] = useState<{
    key: string;
    value: ApprovedVersion;
  } | null>(null);
  const [versionBusy, setVersionBusy] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);

  const base = controlBase(projectId);
  const rejected = member.reason === "rejected";
  const showApprove = canApprove && approvable(member);
  const showReject = canReject && judgeable(member) && !member.deletionProposed;

  /**
   * WHICH VERSION OF THIS FILE THE COMPARISON IS OF, and it is two stamps for
   * the reason `NodePanel` gives: the file's, because a save makes the drawing
   * stale, and the approval's, because the version being compared against is
   * chosen by a ledger that a `git pull` can move while the file's bytes sit
   * still.
   */
  const diffKey = `${member.id}:${String(member.updatedAt)}:${member.approval?.at ?? ""}`;
  /**
   * The version already asked for, as a ref and not state: it decides whether
   * to fetch and is drawn from nowhere, so putting it in state would be a
   * render for a fact nobody can see. Closing and reopening the panel on an
   * unchanged file asks nothing.
   */
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (!open || asked.current === diffKey) {
      return;
    }
    asked.current = diffKey;
    let live = true;
    setVersionBusy(true);
    setVersionError(null);
    api.spec.approvedVersion
      .query({ projectId, id: member.id })
      .then((value) => {
        if (live) {
          setVersion({ key: diffKey, value });
        }
      })
      .catch((fetchError: unknown) => {
        // A read that failed is not a read that happened: let the latch go, so
        // the next open asks again instead of showing the old sentence forever.
        asked.current = null;
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
  }, [open, diffKey, projectId, member.id]);

  /** The fetched pair, and only while it is the pair this row is asking about. */
  const shown = version !== null && version.key === diffKey ? version.value : null;

  /**
   * WHAT TO DRAW UNDER "SHOW CHANGES", WHICH IS NOT ALWAYS A DIFF.
   *
   * A node nobody has approved has no earlier version to move from, so the
   * whole file IS the change — that is what approving it signs off. `changed`
   * is the one reason with two sides to compare, and even there git can have
   * lost the version the approval named, which is not an error: the file as it
   * stands is still what the person came to read.
   */
  const rows = useMemo<DiffRow[] | null>(() => {
    if (shown === null) {
      return null;
    }
    return member.reason === "changed" && shown.approved !== null
      ? lineDiff(shown.approved, shown.current)
      : wholeFile(shown.current);
  }, [shown, member.reason]);

  /**
   * THE POINTER AS AN ANCHOR — a zero-sized rect where the click landed, which
   * is what Base UI's positioner takes when there is no element to hang off.
   * Memoised because the positioner reads it on every measurement.
   */
  const pointerAnchor = useMemo(
    () =>
      pointer === null
        ? undefined
        : {
            getBoundingClientRect: () => new DOMRect(pointer.x, pointer.y, 0, 0),
          },
    [pointer],
  );

  /**
   * WHERE THE POPOVER OPENS WHEN A MENU ITEM ASKED FOR IT. A menu item
   * activated from the keyboard reports no pointer at all, and dropping the box
   * in the window's corner is not where that person is looking — so the item's
   * own bottom-left corner stands in. Read here, while the item is mounted.
   */
  function askReject(event: MouseEvent<HTMLElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const pointed = event.clientX !== 0 || event.clientY !== 0;
    setPointer({
      x: pointed ? event.clientX : box.left,
      y: pointed ? event.clientY : box.bottom,
    });
  }

  /**
   * THE TWO WRITES THE ROW SENDS ITSELF. The refusal is caught HERE rather than
   * left to the page, because the sentence names this node and belongs beside
   * the button that earned it. The rejection is not among them: its refusal
   * belongs inside the popover, holding the rationale somebody just typed.
   */
  const run = useCallback(
    async (act: () => Promise<void>, fallback: string) => {
      setBusy(true);
      setError(null);
      try {
        await act();
      } catch (writeError) {
        setError(writeError instanceof Error ? writeError.message : fallback);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  /**
   * THE WAY OUT OF THE QUEUE AND INTO THE FILE. `back` is this card's path, so
   * the plane can offer the way home; `mode=edit` is the door a Question needs,
   * because a question with no answer in it is routed here to be answered and
   * landing in the reading pane would make that one more click on every row.
   */
  const planeLink = specLink(projectId, member.id, backPath, { edit: answer });
  const openLabel = answer ? "Answer" : "Open in Spec plane";

  return (
    <ContextMenu>
      {/* `select-text` puts back what the design system's trigger takes away:
          this row is a document to read and copy from — an id, a rationale, a
          sha — where the canvas that shares the trigger is a surface to click.
          A stock utility, so no new style is invented. */}
      <ContextMenuTrigger className="grid gap-2 rounded-md border p-3 select-text">
        <div className="flex flex-wrap items-center gap-2">
          <StatusDot color={member.color} />
          <span className="font-mono text-xs break-all">{member.id}</span>
          <Badge variant="secondary">{member.type}</Badge>
          <span className="text-sm">{member.name}</span>
          {member.closure === null ? null : (
            <ClosureMark state={member.closure} />
          )}
          {/* THE SAME NODE UNDER ANOTHER DECISION. A requirement can be reached
              from two yellow roots and a satellite can hang off both, so a
              verdict here moves a bundle over there — the badge is the only
              warning of that, and it is a link because the other card is where
              the rest of the story is. */}
          {member.sharedWith.map((other) => (
            <Badge
              key={other}
              variant="outline"
              render={
                <Link
                  to={`${base}/review-queue/${encodeURIComponent(other)}`}
                />
              }
            >
              {`also in ${rootLabel(other)}`}
            </Badge>
          ))}
          {member.deletionProposed ? (
            <span className="text-muted-foreground text-xs">
              Deletion proposed — decide in the Spec plane
            </span>
          ) : null}
        </div>

        {caption}

        {/* WHAT THE SECOND BOOK SAYS, AND THE TWO READINGS OF IT ARE NOT THE
            SAME FACT. `rejected` is a verdict that STANDS: the rationale is the
            argument in full, verbatim, and the one door is taking it back. A
            record on a row that is not red is a hearing that already happened —
            worth one line, because a reviewer coming back to a resubmitted node
            wants to know it was here before. */}
        {rejected ? (
          member.rejection === null ? null : (
            <>
              <p className="text-sm whitespace-pre-wrap">
                {member.rejection.rationale}
              </p>
              <p className="text-muted-foreground text-xs">
                {`Rejected by ${member.rejection.by} · ${formatStamp(member.rejection.at)}`}
              </p>
            </>
          )
        ) : member.rejection !== null ? (
          <p className="text-muted-foreground text-xs">
            {`Previously rejected by ${member.rejection.by} · ${formatStamp(member.rejection.at)}: ${firstLine(member.rejection.rationale)}`}
          </p>
        ) : null}

        {node === null ? (
          // The queue named a node the graph no longer has. Nothing here can be
          // judged, and the next read of the card will not show the row at all.
          <p className="text-muted-foreground text-xs">
            This node is no longer in the graph — the queue will catch up on the
            next read.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {showApprove ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => onApprove(member.id),
                      `Could not approve ${member.id}`,
                    )
                  }
                >
                  {busy ? "Approving…" : "Approve"}
                </Button>
              ) : null}
              {showReject ? (
                <RejectionPopover
                  open={rejectOpen}
                  onOpenChange={setRejectOpen}
                  target={{ id: member.id, name: member.name }}
                  verb={verb}
                  trigger={
                    <Button type="button" variant="outline" size="sm">
                      {verb === "Reject" ? "Reject…" : "Insufficient…"}
                    </Button>
                  }
                  onConfirm={(rationale) => onReject(member.id, rationale)}
                />
              ) : null}
              {rejected ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => onWithdraw(member.id),
                      `Could not withdraw the rejection on ${member.id}`,
                    )
                  }
                >
                  {busy ? "Withdrawing…" : "Withdraw"}
                </Button>
              ) : null}
              <Link
                to={planeLink}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                {openLabel}
              </Link>
            </div>
            {error === null ? null : (
              <p className="text-destructive text-sm">{error}</p>
            )}

            <Collapsible open={open} onOpenChange={setOpen}>
              <CollapsibleTrigger
                render={<Button type="button" variant="ghost" size="sm" />}
              >
                {open ? <ChevronDown /> : <ChevronRight />}
                {open ? hideLabel : showLabel}
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                {versionBusy ? (
                  <p className="text-muted-foreground text-sm">
                    Reading the approved version…
                  </p>
                ) : versionError !== null ? (
                  <p className="text-destructive text-sm">{versionError}</p>
                ) : rows === null ? null : (
                  <div className="grid gap-2">
                    {member.reason === "changed" && shown?.approved === null ? (
                      <p className="text-muted-foreground text-sm">
                        Git no longer holds the version this was approved at, so
                        there is nothing to compare against. This is the file as
                        it stands.
                      </p>
                    ) : null}
                    <LineDiff rows={rows} />
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </ContextMenuTrigger>

      {/* THE SAME THREE ANSWERS AS THE PLANE'S OWN MENU, in the same order and
          under the same rule: a yellow or green row can be refused, a rejected
          one offers the door out of that, and every row can be opened where the
          file is. Nothing else — approving from a menu is a verdict made
          without the diff open. */}
      <ContextMenuContent>
        <ContextMenuItem onClick={() => void navigate(planeLink)}>
          <Eye />
          {openLabel}
        </ContextMenuItem>
        {rejected ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={busy}
              onClick={() =>
                void run(
                  () => onWithdraw(member.id),
                  `Could not withdraw the rejection on ${member.id}`,
                )
              }
            >
              <Undo2 />
              Withdraw rejection
            </ContextMenuItem>
          </>
        ) : showReject ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={(event) => askReject(event)}>
              <Ban />
              {verb === "Reject" ? "Reject…" : "Insufficient…"}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>

      {/* THE RIGHT-CLICK'S OWN POPOVER, WHICH HAS NO TRIGGER ELEMENT. It is a
          second mount of the same component rather than a shared one, because
          the two doors carry two anchors and only one of them can be open. With
          nothing pending the target is null and it renders nothing at all. */}
      <RejectionPopover
        open={pointer !== null}
        onOpenChange={(next) => {
          if (!next) {
            setPointer(null);
          }
        }}
        target={pointer === null ? null : { id: member.id, name: member.name }}
        verb={verb}
        {...(pointerAnchor === undefined ? {} : { anchor: pointerAnchor })}
        onConfirm={(rationale) => onReject(member.id, rationale)}
      />
    </ContextMenu>
  );
}
