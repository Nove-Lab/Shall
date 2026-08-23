import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "@/api";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Markdown } from "@/components/ui/markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { useProject } from "@/project-context";
import { useRevision } from "@/live";
import { ClosureMark, StatusDot, WorkItemStateMark } from "@/spec/review-parts";
import { nodesById, type FixSpecItem, type ImplementItem, type Ref } from "@/spec/review";
import { formatStamp, type SpecNode } from "@/spec/spec-node";
import { BOX, CAPTION, controlBase, specLink } from "../parts";
import { BOARD_KIND_LABEL, boardRows, rowTitle, type BoardRow } from "./rows";

/**
 * ONE ROW OF THE BOARD, WHOLE — the bundle card's arrangement, over a thing
 * nobody is judging.
 *
 * IT READS AND NEVER WRITES, which is the difference from the review queue's
 * card and is the design rather than an omission: the board says what needs
 * fixing and what is ready, and every act it points at has a door somewhere
 * that already owns it — the Spec plane to change a node, the Review Queue to
 * judge one. A second "withdraw" or "approve" here would be a second place the
 * same decision could be made from.
 *
 * THE RATIONALE IS WHY THIS PAGE EXISTS. A rejection is a work order somebody
 * wrote by hand, and the table can only show its first line; here it is printed
 * whole, with its line breaks, above everything else the row knows.
 */

export function WorkItemPage() {
  const params = useParams();
  const project = useProject();
  const itemKey = params.itemId ?? "";
  const base = controlBase(project.id);
  const boardPath = `${base}/work-board`;
  const backPath = `${boardPath}/${encodeURIComponent(itemKey)}`;

  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [nodes, setNodes] = useState<SpecNode[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null);
    setError(null);
    // The board and the bodies together: the board ships no prose — a card
    // reads `spec.nodes` beside it, exactly as the queue's does. The SUCCESS
    // path sits under the latch with the failure path, so a slow answer for a
    // project somebody left is never drawn as this one's.
    Promise.all([
      api.spec.workBoard.query({ projectId: project.id }),
      api.spec.nodes.query({ projectId: project.id }),
    ])
      .then(([board, nextNodes]) => {
        if (live) {
          setRows(boardRows(board));
          setNodes(nextNodes);
        }
      })
      .catch((loadError: unknown) => {
        if (live) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not read the work board",
          );
        }
      });
    return () => {
      live = false;
    };
  }, [project.id]);
  /**
   * A CHANGE ON DISK RE-READS WHAT IS ALREADY HERE, AND CLEARS NOTHING. The
   * effect above owns the skeleton and the refusal because it owns the mount;
   * this one owns neither, so a file an agent wrote does not blink the table
   * back to skeletons on its way to being right. A failure here keeps the rows
   * that are on screen and says nothing: the next change asks again, and a
   * refusal that outlives the daemon is waiting on the next navigation, where
   * somebody is looking for it.
   */
  const revision = useRevision();
  useEffect(() => {
    if (revision === 0) {
      return;
    }
    let live = true;
    void Promise.all([
      api.spec.workBoard.query({ projectId: project.id }),
      api.spec.nodes.query({ projectId: project.id }),
    ])
      .then(([board, nextNodes]) => {
        if (live) {
          setRows(boardRows(board));
          setNodes(nextNodes);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [revision, project.id]);


  const nodeById = useMemo(() => nodesById(nodes), [nodes]);

  const row = rows?.find((held) => held.item.key === itemKey) ?? null;
  const title = row === null ? itemKey : rowTitle(row);

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
              <BreadcrumbLink render={<Link to={boardPath} />}>
                Work Board
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
          {row === null ? null : (
            <Badge variant="secondary">{BOARD_KIND_LABEL[row.kind]}</Badge>
          )}
        </div>
        {error === null ? null : (
          <p className="text-destructive text-sm">{error}</p>
        )}
      </div>

      {rows === null ? (
        <div className="grid gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : row === null ? (
        /* THE ORDINARY SUCCESSFUL ENDING, SAID AS ONE. A row that is gone is
           usually a row somebody dealt with — the board recomputes and it stops
           existing — so this is not an error page and does not read as one. */
        <div className="grid gap-4">
          <EmptyState
            message="Nothing here any more"
            hint="This row has left the board — it was fixed, finished, or is waiting on something else now."
          />
          <Link
            to={boardPath}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "justify-self-center",
            )}
          >
            Back to the work board
          </Link>
        </div>
      ) : row.kind === "fix" ? (
        <FixDetail
          item={row.item}
          node={row.item.id === null ? null : nodeById.get(row.item.id) ?? null}
          projectId={project.id}
          backPath={backPath}
        />
      ) : (
        <ImplementDetail
          item={row.item}
          node={nodeById.get(row.item.id) ?? null}
          projectId={project.id}
          backPath={backPath}
        />
      )}
    </>
  );
}

function OpenInPlane({
  projectId,
  id,
  backPath,
}: {
  projectId: string;
  id: string;
  backPath: string;
}) {
  return (
    <Link
      to={specLink(projectId, id, backPath)}
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "justify-self-start",
      )}
    >
      Open in Spec plane
    </Link>
  );
}

/**
 * SOMETHING THAT NEEDS FIXING, AND THE WHOLE OF WHAT WAS SAID ABOUT IT.
 *
 * The sentence comes first and at full size, because it is the reason a person
 * opened this page: a rejection's rationale verbatim, or the rule's own words
 * about an orphan, an off-target claim, a hole, a file that would not read.
 */
function FixDetail({
  item,
  node,
  projectId,
  backPath,
}: {
  item: FixSpecItem;
  node: SpecNode | null;
  projectId: string;
  backPath: string;
}) {
  return (
    <div className="grid gap-4">
      <div className={BOX}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusDot color="red" />
          <span className="font-mono text-xs break-all">
            {item.id ?? item.file}
          </span>
          {item.type === null ? null : (
            <Badge variant="secondary">{item.type}</Badge>
          )}
          <Badge variant="outline">{item.reason}</Badge>
        </div>
        {/* `whitespace-pre-wrap` is what keeps a two-paragraph rationale two
            paragraphs. It is deliberately not markdown: this is a sentence
            somebody wrote, not a document. */}
        <p className="text-sm whitespace-pre-wrap select-text">{item.detail}</p>
        {item.by === null || item.at === null ? null : (
          <p className={CAPTION}>
            {`Rejected by ${item.by} · ${formatStamp(item.at)}`}
          </p>
        )}
        {item.id === null ? (
          <p className={CAPTION}>
            {`Fix ${item.file ?? "the file"} in an editor — it does not read as a node.`}
          </p>
        ) : (
          <OpenInPlane projectId={projectId} id={item.id} backPath={backPath} />
        )}
      </div>

      {node === null ? null : (
        <div className={BOX}>
          <p className={CAPTION}>What the node says now</p>
          <Markdown>{node.body}</Markdown>
        </div>
      )}
    </div>
  );
}

/** A list of nodes named as references, each of them a way into the plane. */
function RefList({
  caption,
  refs,
  projectId,
  backPath,
}: {
  caption: string;
  refs: readonly Ref[];
  projectId: string;
  backPath: string;
}) {
  if (refs.length === 0) {
    return null;
  }
  return (
    <div className={BOX}>
      <p className={CAPTION}>{caption}</p>
      {refs.map((ref) => (
        <div key={ref.id} className="flex flex-wrap items-center gap-2">
          <Link
            to={specLink(projectId, ref.id, backPath)}
            className="text-primary font-mono text-xs break-all underline-offset-4 hover:underline"
          >
            {ref.id}
          </Link>
          <span className="text-sm">{ref.name}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * A WORK ITEM SOMEBODY CAN PICK UP, AND EVERYTHING IT IS FOR.
 *
 * Everything here has already passed the gate — the chain above it is read and
 * agreed, and everything it waited on is finished — so the page carries no
 * reasons and no warnings. What it carries is the context an agent needs to
 * start, and every id on it is a way into the plane.
 */
function ImplementDetail({
  item,
  node,
  projectId,
  backPath,
}: {
  item: ImplementItem;
  node: SpecNode | null;
  projectId: string;
  backPath: string;
}) {
  return (
    <div className="grid gap-4">
      <div className={BOX}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusDot color="green" />
          <span className="font-mono text-xs break-all">{item.id}</span>
          <Badge variant="secondary">WorkItem</Badge>
          {/* The same badge the Spec plane draws beside this id, out of the
              same answer — this list IS the ready ones. */}
          <WorkItemStateMark state="ready" />
          <span className={CAPTION}>{`depth ${String(item.depth)}`}</span>
        </div>
        {node === null ? (
          <p className={CAPTION}>
            This work item is no longer in the graph — the board will catch up on the
            next read.
          </p>
        ) : (
          <Markdown>{node.body}</Markdown>
        )}
        <OpenInPlane projectId={projectId} id={item.id} backPath={backPath} />
      </div>

      <RefList
        caption="Allocated by"
        refs={item.modules}
        projectId={projectId}
        backPath={backPath}
      />
      <RefList
        caption="In service of"
        refs={item.requirements}
        projectId={projectId}
        backPath={backPath}
      />

      {item.targets.length === 0 ? (
        <div className={BOX}>
          <p className={CAPTION}>What this work item aims to close</p>
          <p className="text-sm">
            Nothing — this is foundation work, and it is finished when somebody
            says the reports claiming it show enough.
          </p>
        </div>
      ) : (
        <div className={BOX}>
          <p className={CAPTION}>What this work item aims to close</p>
          {item.targets.map((target) => (
            <div key={target.id} className="flex flex-wrap items-center gap-2">
              <Link
                to={specLink(projectId, target.id, backPath)}
                className="text-primary font-mono text-xs break-all underline-offset-4 hover:underline"
              >
                {target.id}
              </Link>
              <span className="text-sm">{target.name}</span>
              {target.closure === null ? null : (
                <ClosureMark state={target.closure} />
              )}
            </div>
          ))}
        </div>
      )}

      {item.addressedBy.length === 0 ? null : (
        <div className={BOX}>
          <p className={CAPTION}>Work already logged against it</p>
          {item.addressedBy.map((log) => (
            <div key={log.id} className="flex flex-wrap items-center gap-2">
              <StatusDot color={log.color} />
              <Link
                to={specLink(projectId, log.id, backPath)}
                className="text-primary font-mono text-xs break-all underline-offset-4 hover:underline"
              >
                {log.id}
              </Link>
              <span className="text-sm">{log.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
