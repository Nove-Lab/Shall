import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useParams } from "react-router";
import { isNodeType, type NodeTypeName } from "@shall/core/graph";
import { api } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Markdown } from "@/components/ui/markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { useProject } from "@/project-context";
import { useRevision } from "@/live";
import { RejectionPopover } from "@/spec/RejectionPopover";
import { ClosureMark, StatusDot } from "@/spec/review-parts";
import {
  approvable,
  firstLine,
  nodesById,
  type AcClosureBundle,
  type WorkItemClosureBundle,
  type BundleMember,
  type EvidenceMember,
  type ReviewBundle,
  type SpecApprovalBundle,
  type StandaloneFindingBundle,
  type WorkReportBundle,
} from "@/spec/review";
import { formatStamp, type SpecNode } from "@/spec/spec-node";
import { ChevronDown, ChevronRight } from "lucide-react";
import { BOX, CAPTION, controlBase } from "../parts";
import { MemberRow, rootLabel } from "./MemberRow";
import { KIND_LABEL } from "./rows";

/**
 * ONE BUNDLE, AS THE CARD SOMEBODY DECIDES IT ON.
 *
 * THE PAGE IS THE UNIT OF JUDGEMENT AND THE QUEUE IS ONLY THE WAY IN. What is
 * under the decision is here in full — the changed file, the nodes nobody
 * touched, the evidence and who submitted it — because a verdict made off a
 * summary line is a verdict made without reading. Every kind shares everything
 * above the fold: the crumb, the title, the primary button, the strip of what
 * has already been decided; below it they are different documents, and each is
 * written out rather than abstracted into one that fits none of them.
 *
 * EVERY WRITE ENDS IN A REFETCH AND NOTHING IS CACHED. The queue is recomputed
 * from the graph and the three ledgers on every read, so a verdict rearranges
 * the queue with nobody told about it — including making THIS BUNDLE VANISH,
 * which is the ordinary successful outcome and not an error. The page says so
 * in those words and keeps the strip.
 *
 * THE STRIP IS THE ONE THING THAT SURVIVES ALL OF THAT. A rejection ends the
 * reviewer's turn and starts the agent's, so the bundle it was made in is gone
 * on the next read — and with it the only place to take it back. The strip
 * holds that door open for as long as the person is on this page, which is
 * exactly as long as they might change their mind about what they just typed.
 * When there is a work board the line becomes the link to the envelope.
 */

/** One thing decided on this page, kept until the person leaves it. */
interface Verdict {
  key: number;
  id: string;
  sentence: string;
  busy: boolean;
  error: string | null;
}

export function ReviewBundlePage() {
  const params = useParams();
  const project = useProject();
  /**
   * REACT ROUTER HAS ALREADY DECODED THE SEGMENT, so nothing here decodes it a
   * second time: `spec:R-0001` survives a round trip either way, and a second
   * `decodeURIComponent` is a throw waiting for the first id with a `%` in it.
   * The links encode, the router decodes, and this is the id the daemon sent.
   */
  const bundleId = params.bundleId ?? "";
  const base = controlBase(project.id);
  const queuePath = `${base}/review-queue`;
  const backPath = `${queuePath}/${encodeURIComponent(bundleId)}`;

  const [bundles, setBundles] = useState<ReviewBundle[]>([]);
  const [nodes, setNodes] = useState<SpecNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const nextKey = useRef(0);

  /**
   * THE QUEUE AND THE GRAPH TOGETHER, because the card needs both and neither
   * is worth drawing without the other: the bundle says what is under the
   * decision and carries no bodies, and `spec.nodes` is where the document a
   * person is being asked to read actually lives.
   */
  const fetchCard = useCallback(async () => {
    const [queue, nextNodes] = await Promise.all([
      api.spec.reviewQueue.query({ projectId: project.id }),
      api.spec.nodes.query({ projectId: project.id }),
    ]);
    return { bundles: queue.bundles, nodes: nextNodes };
  }, [project.id]);

  /** A write's own refetch — the component is still on the card it wrote from. */
  const load = useCallback(async () => {
    const next = await fetchCard();
    setBundles(next.bundles);
    setNodes(next.nodes);
  }, [fetchCard]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    // The SUCCESS path is under the latch with the failure path: this route
    // keeps its component across a project switch, and a slow answer for the
    // project somebody left must not be drawn as this one's.
    fetchCard()
      .then((next) => {
        if (live) {
          setBundles(next.bundles);
          setNodes(next.nodes);
        }
      })
      .catch((loadError: unknown) => {
        if (live) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not read the review queue",
          );
        }
      })
      .finally(() => {
        if (live) {
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [fetchCard]);

  /**
   * A CHANGE ON DISK RE-READS WHAT IS ALREADY HERE, AND CLEARS NOTHING. The
   * effect above owns the skeleton and the refusal because it owns the mount;
   * this one owns neither, so an agent's write does not blink the card back to
   * skeletons on its way to being right. A failure here keeps what is on screen
   * and says nothing: the next change asks again. The bundle vanishing under
   * this is the ordinary successful outcome, said where it already was.
   */
  const revision = useRevision();
  useEffect(() => {
    if (revision === 0) {
      return;
    }
    let live = true;
    fetchCard()
      .then((next) => {
        if (live) {
          setBundles(next.bundles);
          setNodes(next.nodes);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [revision, fetchCard]);

  /**
   * A DIFFERENT CARD IS A DIFFERENT REFUSAL. This route keeps its component
   * across a change of `:bundleId`, and the sentence the daemon said names ids
   * from the card that earned it — carried over, it would sit under another
   * card's button as if that one said it. The strip deliberately does NOT
   * reset: it is the door back out of what was already written, and that door
   * belongs to the person and not to the card they are looking at.
   */
  useEffect(() => {
    setError(null);
  }, [bundleId]);

  const bundle = bundles.find((entry) => entry.id === bundleId) ?? null;
  const nodeById = useMemo(() => nodesById(nodes), [nodes]);

  /* ---------------------------------------------------------------- *
   * The writes
   * ---------------------------------------------------------------- */

  /**
   * WHAT WAS JUST DECIDED, REMEMBERED BY THE PAGE AND NOT BY THE BUNDLE. The
   * bundle is about to stop existing; the sentence and the door out of it have
   * to outlive it.
   */
  function remember(id: string, sentence: string) {
    const key = nextKey.current;
    nextKey.current += 1;
    setVerdicts((current) => [
      ...current.filter((verdict) => verdict.id !== id),
      { key, id, sentence, busy: false, error: null },
    ]);
  }

  /** A rejection taken back anywhere is a strip line that no longer means anything. */
  function forget(id: string) {
    setVerdicts((current) => current.filter((verdict) => verdict.id !== id));
  }

  /**
   * THE ROW'S THREE WRITES. They reject into the row, which is where the
   * daemon's sentence belongs — beside the control that earned it. The refetch
   * is here because the whole card is what a verdict changes.
   */
  async function approveMember(id: string) {
    await api.spec.approve.mutate({ projectId: project.id, id });
    await load();
  }

  async function withdrawMember(id: string) {
    await api.spec.withdrawRejection.mutate({ projectId: project.id, id });
    await load();
    forget(id);
  }

  async function rejectMember(id: string, rationale: string, verb: string) {
    await api.spec.reject.mutate({ projectId: project.id, id, rationale });
    await load();
    remember(id, `${id} ${verb}`);
  }

  const rejectNode = (id: string, rationale: string) =>
    rejectMember(id, rationale, "rejected → agent's turn");

  /**
   * THE OTHER EXIT FROM THE CLOSURE QUEUE, AND IT LEAVES A STRIP LINE LIKE A
   * REFUSAL DOES — because it IS a record in the rejection ledger, written
   * under the criterion's own id. That is what makes `undo` above the honest
   * door out of it: the same `withdrawRejection` that takes back a "no" takes
   * back a "left open", and the strip needs no second kind of line.
   *
   * IT IS NOT A "NO" ABOUT THE CRITERION, though, and the sentence says so:
   * "left open" and not "rejected", because the criterion's words still stand
   * and its colour does not move.
   *
   * IT REFUSES INTO THE POPOVER rather than through `runPrimary`, which is the
   * whole reason it is written out here: the daemon's sentence belongs beside
   * the rationale somebody just typed, and losing that text to a refusal would
   * make the second attempt a retyping.
   */
  async function leaveOpenAc(acId: string, rationale: string) {
    await api.spec.leaveOpen.mutate({
      projectId: project.id,
      id: acId,
      rationale,
    });
    await load();
    remember(acId, `${acId} left open`);
  }

  /** Taking back a rejection from the strip, which is the same write the row makes. */
  async function undo(verdict: Verdict) {
    setVerdicts((current) =>
      current.map((entry) =>
        entry.key === verdict.key
          ? { ...entry, busy: true, error: null }
          : entry,
      ),
    );
    try {
      await api.spec.withdrawRejection.mutate({
        projectId: project.id,
        id: verdict.id,
      });
      await load();
      setVerdicts((current) =>
        current.filter((entry) => entry.key !== verdict.key),
      );
    } catch (writeError) {
      const sentence =
        writeError instanceof Error
          ? writeError.message
          : `Could not withdraw the rejection on ${verdict.id}`;
      setVerdicts((current) =>
        current.map((entry) =>
          entry.key === verdict.key
            ? { ...entry, busy: false, error: sentence }
            : entry,
        ),
      );
    }
  }

  /**
   * THE BUNDLE-WIDE WRITE, WHOSE REFUSAL BELONGS TO THE PAGE. `approveNodes` is
   * all or nothing and the daemon names every id it stopped on, so the sentence
   * is about the bundle rather than about any row in it.
   */
  async function runPrimary(act: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await act();
      await load();
    } catch (writeError) {
      setError(writeError instanceof Error ? writeError.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  /* ---------------------------------------------------------------- *
   * The card
   * ---------------------------------------------------------------- */

  const title = bundle === null ? rootLabel(bundleId) : bundle.title;

  const rowProps = {
    projectId: project.id,
    backPath,
    onApprove: approveMember,
    onWithdraw: withdrawMember,
  };

  return (
    <>
      <div className="space-y-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to={base} />}>
                Control plane
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to={queuePath} />}>
                Review Queue
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {bundle === null ? null : (
            <Badge variant="secondary">{KIND_LABEL[bundle.kind]}</Badge>
          )}
        </div>
        {bundle === null ? null : (
          <PrimaryAction
            bundle={bundle}
            busy={busy}
            onApproveAll={(ids) =>
              void runPrimary(
                () =>
                  api.spec.approveNodes.mutate({
                    projectId: project.id,
                    ids,
                  }),
                "Could not record the approvals",
              )
            }
            onClose={(acId) =>
              void runPrimary(
                () =>
                  api.spec.acceptClosure.mutate({
                    projectId: project.id,
                    id: acId,
                  }),
                `Could not close ${acId}`,
              )
            }
            onLeaveOpen={leaveOpenAc}
          />
        )}
        {error === null ? null : (
          <p className="text-destructive text-sm">{error}</p>
        )}
      </div>

      {/* WHAT HAS ALREADY BEEN DECIDED HERE, AND THE WAY BACK OUT OF IT. It
          stands above the card because it outlives the card: the bundle a
          rejection was made in is gone on the very next read, and this is the
          only place that still knows what was said. */}
      {verdicts.length === 0 ? null : (
        <div className={BOX}>
          <p className={CAPTION}>Decided here</p>
          {verdicts.map((verdict) => (
            <div key={verdict.key} className="grid gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">{verdict.sentence}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={verdict.busy}
                  onClick={() => void undo(verdict)}
                >
                  {verdict.busy ? "Undoing…" : "Undo"}
                </Button>
              </div>
              {verdict.error === null ? null : (
                <p className="text-destructive text-sm">{verdict.error}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : bundle === null ? (
        <div className="grid gap-4">
          {/* THE ORDINARY SUCCESSFUL ENDING, SAID AS ONE. A bundle that is gone
              is a bundle whose nodes have all been answered — the queue
              recomputes and this piece stops existing — so this is not an
              error page and does not read as one. */}
          <EmptyState
            message="Nothing left to judge here"
            hint="Every node in this bundle has been decided — the queue recomputed."
          />
          <Link
            to={queuePath}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "justify-self-center",
            )}
          >
            Back to the review queue
          </Link>
        </div>
      ) : bundle.kind === "ac-closure" ? (
        <ClosureCard
          bundle={bundle}
          nodeById={nodeById}
          onReject={rejectNode}
          {...rowProps}
        />
      ) : bundle.kind === "work-item-closure" ? (
        <TaskClosureCard
          bundle={bundle}
          nodeById={nodeById}
          onReject={rejectNode}
          {...rowProps}
        />
      ) : bundle.kind === "work-report" ? (
        <ReportCard
          bundle={bundle}
          nodeById={nodeById}
          onReject={rejectNode}
          {...rowProps}
        />
      ) : bundle.kind === "standalone-finding" ? (
        <FindingCard
          bundle={bundle}
          nodeById={nodeById}
          onReject={rejectNode}
          {...rowProps}
        />
      ) : (
        <ApprovalCard
          bundle={bundle}
          nodeById={nodeById}
          onReject={rejectNode}
          {...rowProps}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * The primary button, which is one decision per kind
 * ------------------------------------------------------------------ */

/**
 * THE ONE BUTTON THE WHOLE CARD IS FOR — except on the closure card, where it is
 * two, because that queue has two exits.
 *
 * The three walked kinds send the same write under three names — a bundle's
 * yellow members, approved in one turn, all or nothing — because "accept this
 * report", "accept this finding" and "approve this subgraph" are the same act
 * on different documents and a second procedure would be a second thing to keep
 * in step.
 *
 * THE CLOSURES ARE A PAIR AND NEITHER HALF NAMES ANY EVIDENCE. Closing records an
 * acceptance over EVERY piece of evidence claiming the criterion now, whatever
 * colour each one wears, and the daemon computes that list off the graph;
 * leaving it open refuses the same list in writing. There is nothing to pick, so
 * there is no state up here to pick it in, and the two doors sit side by side
 * because they are the same size of decision about the same list.
 *
 * A DELETION PROPOSED OVER A NODE TAKES IT OUT OF THE BATCH. That row is a
 * different question — the Spec plane's — and the daemon refuses the whole
 * turn if one is in it, so the button sends what it can and the row says where
 * the rest of the decision is.
 */
function PrimaryAction({
  bundle,
  busy,
  onApproveAll,
  onClose,
  onLeaveOpen,
}: {
  bundle: ReviewBundle;
  busy: boolean;
  onApproveAll: (ids: string[]) => void;
  onClose: (acId: string) => void;
  onLeaveOpen: (acId: string, rationale: string) => Promise<void>;
}) {
  /**
   * Whether the leave-open popover is asking. Declared before the branch below
   * because a hook cannot sit under a condition — the other two kinds simply
   * never open it.
   */
  const [leaveOpenAsking, setLeaveOpenAsking] = useState(false);

  if (bundle.kind === "ac-closure" || bundle.kind === "work-item-closure") {
    // THE TWO SUBJECTS SHARE THE PAIR OF DOORS. What is closed differs — a
    // criterion on its evidence, a work item on the reports that claim it — and
    // both are one id and one word, so the buttons are the same buttons.
    const subject =
      bundle.kind === "ac-closure"
        ? { id: bundle.acId, name: bundle.ac.name }
        : { id: bundle.workItemId, name: bundle.workItem.name };
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() => onClose(subject.id)}
        >
          {busy ? "Closing…" : "Close"}
        </Button>
        {/* THE REFUSAL IS ASKED FOR IN WRITING AND THE SIGNATURE IS NOT, which
            is the whole asymmetry between these two: "met" is a signature, and
            "not met" is an argument the agent reads next. So the second door is
            the same popover the rest of the surface refuses through, and its
            refusal is shown holding the rationale somebody just typed. */}
        <RejectionPopover
          open={leaveOpenAsking}
          onOpenChange={setLeaveOpenAsking}
          target={subject}
          verb="Leave open"
          trigger={
            <Button type="button" variant="outline">
              Leave open…
            </Button>
          }
          onConfirm={(rationale) => onLeaveOpen(subject.id, rationale)}
        />
      </div>
    );
  }

  const ids = bundle.members.filter(approvable).map((member) => member.id);
  // ONE VERB PER KIND, AND THE VERB IS WHAT THE PERSON IS DOING. "Approve all"
  // over a piece of the specification, "Accept report" over a turn of work
  // somebody wrote down, "Accept finding" over one thing somebody noticed —
  // and the last two are acceptances rather than approvals because a record is
  // not agreed with, it is taken.
  const label =
    bundle.kind === "work-report"
      ? "Accept report"
      : bundle.kind === "standalone-finding"
        ? "Accept finding"
        : "Approve all";
  return (
    <Button
      type="button"
      className="justify-self-start"
      disabled={busy || ids.length === 0}
      onClick={() => onApproveAll(ids)}
    >
      {busy ? "Approving…" : label}
    </Button>
  );
}

/* ------------------------------------------------------------------ *
 * The pieces the five cards share
 * ------------------------------------------------------------------ */

/** What every card hands its rows, so the five are written once. */
interface RowWiring {
  projectId: string;
  backPath: string;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, rationale: string) => Promise<void>;
  onWithdraw: (id: string) => Promise<void>;
}

/**
 * THE HALF OF THE PICTURE THAT IS EASY TO FORGET, and it is closed by default
 * for exactly that reason — it is context, not a queue of things to do.
 * Approving a changed requirement is also a statement that the criteria under
 * it, which nobody touched, still say the right thing, and the only way to
 * make that statement honestly is to have been shown the list.
 */
function Unchanged({
  nodes,
}: {
  nodes: readonly { id: string; type: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  if (nodes.length === 0) {
    return null;
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        render={<Button type="button" variant="ghost" size="sm" />}
      >
        {open ? <ChevronDown /> : <ChevronRight />}
        {`Related to this change but not changed themselves — confirm this is intended (${String(nodes.length)})`}
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-2 pt-2">
        {nodes.map((node) => (
          <div key={node.id} className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs break-all">{node.id}</span>
            <Badge variant="secondary">{node.type}</Badge>
            <span className="text-sm">{node.name}</span>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** A node's own document, under the line that says which node it is. */
function NodeDocument({
  heading,
  node,
}: {
  heading: ReactNode;
  node: SpecNode | null;
}) {
  return (
    <div className={BOX}>
      {heading}
      {node === null ? (
        <p className={CAPTION}>
          This node is no longer in the graph — the queue will catch up on the
          next read.
        </p>
      ) : (
        <Markdown>{node.body}</Markdown>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Spec approval
 * ------------------------------------------------------------------ */

function ApprovalCard({
  bundle,
  nodeById,
  ...wiring
}: {
  bundle: SpecApprovalBundle;
  nodeById: ReadonlyMap<string, SpecNode>;
} & RowWiring) {
  const root = bundle.members.find((member) => member.id === bundle.rootId);
  const rest = bundle.members.filter((member) => member.id !== bundle.rootId);
  return (
    <div className="grid gap-4">
      {/* THE ROOT OPENS SHOWING WHAT MOVED, because it is what the card is
          about: the highest changed node in the piece is the one a person came
          to read, and one click between them and it would be a click on every
          bundle in the queue. */}
      {root === undefined ? null : (
        <MemberRow
          member={root}
          node={nodeById.get(root.id) ?? null}
          verb="Reject"
          canApprove
          canReject
          defaultOpen
          {...wiring}
        />
      )}
      {rest.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          node={nodeById.get(member.id) ?? null}
          verb="Reject"
          canApprove
          canReject
          {...wiring}
        />
      ))}
      <Unchanged nodes={bundle.unchanged} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Work report
 * ------------------------------------------------------------------ */

/**
 * A FINDING IS NOT APPROVED ONE AT A TIME — INSIDE A REPORT. It is a thing an
 * agent noticed while doing something else, not a claim about the specification
 * that a person signs off in isolation, so it rides along in the report being
 * accepted. What it DOES get is the door to the file, because reading it is the
 * whole of what happens here: what answers a finding is a `Decision` written
 * afterwards that `RESOLVES` it, and that is somebody else's card.
 *
 * A FINDING NO WORK LOG RECORDED HAS NO REPORT TO RIDE IN, and it gets a card
 * of its own where both doors are open — see `FindingCard`. The difference is
 * not about the type but about what is being judged: there, the finding IS the
 * decision in front of the person.
 *
 * TYPED AGAINST THE CANON, so a type renamed there is a compile error on this
 * line rather than a set that quietly matches nothing.
 */
const RIDES_ALONG: ReadonlySet<NodeTypeName> = new Set(["Finding"]);

function ReportCard({
  bundle,
  nodeById,
  ...wiring
}: {
  bundle: WorkReportBundle;
  nodeById: ReadonlyMap<string, SpecNode>;
} & RowWiring) {
  const rootNode = nodeById.get(bundle.rootId) ?? null;
  /** The types in the order the members arrived, which is the canon's own. */
  const types: string[] = [];
  for (const member of bundle.members) {
    if (!types.includes(member.type)) {
      types.push(member.type);
    }
  }

  return (
    <div className="grid gap-4">
      <NodeDocument
        heading={
          <p className="text-sm font-medium">
            {rootNode === null
              ? bundle.rootId
              : `${bundle.rootId} · ${rootNode.name}`}
          </p>
        }
        node={rootNode}
      />
      {/* ONE SECTION PER TYPE, ALL OPEN. A report is read top to bottom — the
          logs, then what they submitted, then what they noticed — and a
          section somebody has to open first is a section that gets skipped. */}
      {types.map((type) => (
        <TypeSection
          key={type}
          type={type}
          members={bundle.members.filter((member) => member.type === type)}
          nodeById={nodeById}
          {...wiring}
        />
      ))}
      <Unchanged nodes={bundle.unchanged} />
    </div>
  );
}

function TypeSection({
  type,
  members,
  nodeById,
  ...wiring
}: {
  type: string;
  members: readonly BundleMember[];
  nodeById: ReadonlyMap<string, SpecNode>;
} & RowWiring) {
  const [open, setOpen] = useState(true);
  // A member wears whatever type its file claimed, so the canon's own guard
  // narrows the string before the set is asked about it.
  const judged = !(isNodeType(type) && RIDES_ALONG.has(type));
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        render={<Button type="button" variant="ghost" size="sm" />}
      >
        {open ? <ChevronDown /> : <ChevronRight />}
        {`${type} (${String(members.length)})`}
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-4 pt-2">
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            node={nodeById.get(member.id) ?? null}
            verb="Reject"
            canApprove={judged}
            canReject={judged}
            {...wiring}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ------------------------------------------------------------------ *
 * Standalone finding
 * ------------------------------------------------------------------ */

/**
 * ONE FINDING NOBODY'S WORK LOG RECORDED, WHICH IS WHY IT IS A CARD.
 *
 * The report card exists because a journal gathers a turn of work into one
 * thing a person reads at once. Here there is no turn: somebody brought this
 * between them, so the finding is the whole of what is waiting and both doors
 * belong on its row — approving says it has been read, rejecting says what is
 * wrong with how it was written. Neither answers it. What answers a finding is
 * a `Decision` somebody writes afterwards, and that arrives as its own card.
 */
function FindingCard({
  bundle,
  nodeById,
  ...wiring
}: {
  bundle: StandaloneFindingBundle;
  nodeById: ReadonlyMap<string, SpecNode>;
} & RowWiring) {
  return (
    <div className="grid gap-4">
      {bundle.members.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          node={nodeById.get(member.id) ?? null}
          verb="Reject"
          canApprove
          canReject
          defaultOpen
          {...wiring}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * AC closure
 * ------------------------------------------------------------------ */

/**
 * WHO SUBMITTED THIS CLAIM AND WHAT IT CAME OUT OF. The work log is the thread
 * back to the work, and its commits are the thread back to git — where a sha
 * means something and this app is not the place it is explained. THE SHAS ARE
 * ABBREVIATED TO SEVEN, which is git's own short form and what a person pastes
 * into a `git show`; the full forty would wrap the caption twice and say
 * nothing more.
 */
function SubmittedBy({ member }: { member: EvidenceMember }) {
  if (member.submittedBy.length === 0) {
    return null;
  }
  return (
    <div className={cn(CAPTION, "grid gap-1")}>
      {member.submittedBy.map((entry) => (
        <p key={entry.workLogId}>
          {`submitted by ${entry.workLogId}`}
          {entry.commits.length === 0 ? null : (
            <>
              {" · commits "}
              <span className="font-mono">
                {entry.commits
                  .map((commit) => commit.slice(0, 7))
                  .join(", ")}
              </span>
            </>
          )}
        </p>
      ))}
    </div>
  );
}

/**
 * THE CRITERION AND EVERYTHING CLAIMING IT — AND THE LIST IS NOT A CHOICE.
 *
 * There is no picking evidence here any more. The two doors above act on the
 * WHOLE list — close over all of it, or say in writing why it is not enough —
 * so the rows carry no ticks and no verdicts of their own: a row that could be
 * refused one at a time would be offering a third decision beside two that are
 * already about the same list. What a row still is, is the way to READ the
 * claim, and to open the file it came out of.
 *
 * EVERY COLOUR IS ON THE LIST. Green, yellow and red claimants are all what the
 * criterion is being closed over, because that is the list the daemon judges —
 * showing only the approved ones would be this card drawing a different set
 * from the one the button writes about.
 */
function ClosureCard({
  bundle,
  nodeById,
  ...wiring
}: {
  bundle: AcClosureBundle;
  nodeById: ReadonlyMap<string, SpecNode>;
} & RowWiring) {
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="grid gap-4">
      <NodeDocument
        heading={
          <div className="flex flex-wrap items-center gap-2">
            <StatusDot color={bundle.ac.color} />
            <span className="font-mono text-xs break-all">{bundle.acId}</span>
            <Badge variant="secondary">{bundle.ac.type}</Badge>
            <span className="text-sm">{bundle.ac.name}</span>
            {bundle.ac.closure === null ? null : (
              <ClosureMark state={bundle.ac.closure} />
            )}
          </div>
        }
        node={nodeById.get(bundle.acId) ?? null}
      />

      <p className={CAPTION}>
        Everything claiming this criterion — closing accepts the whole list
      </p>
      {bundle.evidence.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          node={nodeById.get(member.id) ?? null}
          verb="Reject"
          canApprove={false}
          canReject={false}
          showLabel="Show claim"
          hideLabel="Hide claim"
          caption={
            <>
              <SubmittedBy member={member} />
              {/* A YELLOW CLAIMANT IS ON THE LIST LIKE THE REST AND IS STILL
                  WORTH A WORD: nobody has read it yet, and a person closing
                  over it should know they are signing off something the
                  specification has not agreed to. It does not change what the
                  close covers. */}
              {member.color === "yellow" ? (
                <p className={CAPTION}>awaiting approval</p>
              ) : null}
            </>
          }
          {...wiring}
        />
      ))}

      {/* WHAT WAS SAID ABOUT THIS EVIDENCE BEFORE, AND ONLY THE LAST WORD PER
          PIECE. The book keeps one rejection per node, so "the history" is
          honestly the latest hearing of each claimant and the title says so
          rather than promising a record it does not have. */}
      {bundle.history.length === 0 ? null : (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <CollapsibleTrigger
            render={<Button type="button" variant="ghost" size="sm" />}
          >
            {historyOpen ? <ChevronDown /> : <ChevronRight />}
            {`History (latest hearing per evidence) (${String(bundle.history.length)})`}
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-1 pt-2">
            {bundle.history.map((entry) => (
              <p key={`${entry.evidenceId}:${entry.at}`} className={CAPTION}>
                <span className="font-mono">{entry.evidenceId}</span>
                {` · ${entry.by} · ${formatStamp(entry.at)} · ${firstLine(entry.rationale)}`}
              </p>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

/**
 * A WORK ITEM WAITING TO BE CALLED DONE — the criterion card asked about work.
 *
 * IT IS THE SAME DECISION IN THE SAME SHAPE, which is why this reads as a
 * mirror rather than as a second design: the subject at the top, the list it is
 * closed over beneath, the hearings under that, and the same two doors. What it
 * adds is the strip of criteria the work item aimed at, because "is this done" is a
 * question a person answers partly by looking at whether what it was for has
 * closed — and those marks are context and never buttons: closing a criterion
 * is its own card in this queue.
 *
 * THE THREAD BACK TO THE WORK IS THE EVIDENCE CARD'S OWN: each report row says
 * which log submitted it and that log's commits, because the claimant here is
 * the completion report and the log is its provenance — exactly the
 * arrangement the criterion's card keeps.
 */
function TaskClosureCard({
  bundle,
  nodeById,
  ...wiring
}: {
  bundle: WorkItemClosureBundle;
  nodeById: ReadonlyMap<string, SpecNode>;
} & RowWiring) {
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="grid gap-4">
      <NodeDocument
        heading={
          <div className="flex flex-wrap items-center gap-2">
            <StatusDot color={bundle.workItem.color} />
            <span className="font-mono text-xs break-all">{bundle.workItemId}</span>
            <Badge variant="secondary">{bundle.workItem.type}</Badge>
            <span className="text-sm">{bundle.workItem.name}</span>
          </div>
        }
        node={nodeById.get(bundle.workItemId) ?? null}
      />

      <p className={CAPTION}>
        Every report claiming this work item — closing accepts the whole list
      </p>
      {bundle.reports.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          node={nodeById.get(member.id) ?? null}
          verb="Reject"
          canApprove={false}
          canReject={false}
          showLabel="Show the report"
          hideLabel="Hide the report"
          caption={<SubmittedBy member={member} />}
          {...wiring}
        />
      ))}

      {/* WHAT THE WORK ITEM WAS FOR, AND WHERE EACH OF THOSE STANDS. Read-only: a
          criterion is closed on its own card, over its own evidence. */}
      {bundle.targets.length === 0 ? null : (
        <div className={BOX}>
          <p className={CAPTION}>What this work item aimed to close</p>
          {bundle.targets.map((target) => (
            <div key={target.id} className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs break-all">{target.id}</span>
              <span className="text-sm">{target.name}</span>
              {target.closure === null ? null : (
                <ClosureMark state={target.closure} />
              )}
            </div>
          ))}
        </div>
      )}

      {bundle.history.length === 0 ? null : (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <CollapsibleTrigger
            render={<Button type="button" variant="ghost" size="sm" />}
          >
            {historyOpen ? <ChevronDown /> : <ChevronRight />}
            {`History (latest hearing per report) (${String(bundle.history.length)})`}
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-1 pt-2">
            {bundle.history.map((entry) => (
              <p key={`${entry.reportId}:${entry.at}`} className={CAPTION}>
                <span className="font-mono">{entry.reportId}</span>
                {` · ${entry.by} · ${formatStamp(entry.at)} · ${firstLine(entry.rationale)}`}
              </p>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
