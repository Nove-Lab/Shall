import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useProject } from "@/project-context";
import { WorkItemStateMark } from "@/spec/review-parts";
import { formatStamp } from "@/spec/spec-node";
import type { PanelMeta } from "../panels";
import { BOX, CAPTION, controlBase, countWord, specLink } from "../parts";
import {
  BLOCKER_WORD,
  OPEN_REASONS,
  OPEN_REASON_LABEL,
  RULE_HINT,
  RULE_LABEL,
  isEmptySpec,
  isViolated,
  openByReason,
  percent,
  progressRows,
  ratioText,
  type BlockedWorkItem,
  type HealthRule,
  type OpenCriterion,
  type ProgressRow,
  type Vitals as VitalsReport,
} from "./rows";
import { useVitals } from "./use-vitals";

/**
 * HOW FAR THE SPECIFICATION HAS COME, AND WHAT IT STILL LACKS — two sections,
 * one under the other, never side by side.
 *
 * PROGRESS IS FOUR RATIOS, each a bar with its two counts and, where the
 * denominator left something out, a note saying what. Under each row the
 * things behind the number fold open: the carriers not yet satisfied, the open
 * criteria with the three reasons a criterion is open, the blocked work items
 * with what blocks each. SPEC HEALTH IS SEVEN ROWS, ALWAYS SEVEN — a violated
 * rule names its nodes and the process that resolves it, a clean one says it
 * passed, so a clean page reads as checked and not as blank. Nothing here is a
 * fault and nothing here is red: a violated rule wears the design system's
 * quiet badge, the same one an unfinished thing wears everywhere else.
 *
 * EVERY NODE NAMED HERE IS A WAY INTO THE SPEC PLANE, the reading pane, with
 * this page as the way back; the one other door is the Review Queue card an
 * open criterion is waiting on, when the queue holds one.
 *
 * NOTHING IS COMPUTED HERE AND NOTHING IS CACHED. Core counted every figure
 * from the graph and the books on this read; the card on the Overview asked
 * the same question through the same hook, so the two cannot disagree; and the
 * line under the title says when the answer arrived, which — the daemon adding
 * no cache — is when it was computed.
 */
export function Vitals({ panel }: { panel: PanelMeta }) {
  const project = useProject();
  const base = controlBase(project.id);
  const backPath = `${base}/vitals`;
  const { vitals, error, computedAt } = useVitals(project.id);

  if (error !== null) {
    return (
      <Card>
        <CardContent>
          <p className="text-destructive text-sm">{error}</p>
        </CardContent>
      </Card>
    );
  }
  if (vitals === null) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (isEmptySpec(vitals)) {
    // A folder with no specification in it yet: the start-here sentence takes
    // the place of both sections rather than four bars at nought.
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState message={panel.empty} hint="Start with /shall:specify" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {computedAt === null ? null : (
        <p className={CAPTION}>{`Computed ${formatStamp(computedAt)}`}</p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {progressRows(vitals).map((row) => (
            <div key={row.key} className={BOX}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="w-48 shrink-0 text-sm font-medium">
                  {row.label}
                </span>
                <Progress
                  value={percent(row.numerator, row.denominator)}
                  className="min-w-32 flex-1"
                />
                <span className="shrink-0 font-mono text-sm">
                  {ratioText(row.numerator, row.denominator)}
                </span>
                {row.note === null ? null : (
                  <span className={CAPTION}>{row.note}</span>
                )}
              </div>
              <Drilldown
                row={row}
                vitals={vitals}
                base={base}
                projectId={project.id}
                backPath={backPath}
              />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Spec Health</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {vitals.health.map((rule) => (
            <HealthRow
              key={rule.id}
              rule={rule}
              projectId={project.id}
              backPath={backPath}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * A list folded under its row, closed until asked for — the bundle page's own
 * disclosure, one trigger with the count in it. Nothing to fold is nothing
 * drawn, so a row with an empty list under it has no trigger to open onto
 * nothing.
 */
function Fold({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (count === 0) {
    return null;
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        render={<Button type="button" variant="ghost" size="sm" />}
      >
        {open ? <ChevronDown /> : <ChevronRight />}
        {`${label} (${String(count)})`}
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-2 pt-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** A node's id as the way into the plane — the board page's spelling of it. */
function NodeLink({
  id,
  projectId,
  backPath,
}: {
  id: string;
  projectId: string;
  backPath: string;
}) {
  return (
    <Link
      to={specLink(projectId, id, backPath)}
      className="text-primary font-mono text-xs break-all underline-offset-4 hover:underline"
    >
      {id}
    </Link>
  );
}

/** One row naming a node: its id as the door, its name, and whatever the caller says beside them. */
function NodeRow({
  id,
  name,
  projectId,
  backPath,
  children,
}: {
  id: string;
  name: string;
  projectId: string;
  backPath: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NodeLink id={id} projectId={projectId} backPath={backPath} />
      <span className="text-sm">{name}</span>
      {children}
    </div>
  );
}

/** What folds under each Progress row: the things behind the number, each a way into the plane. */
function Drilldown({
  row,
  vitals,
  base,
  projectId,
  backPath,
}: {
  row: ProgressRow;
  vitals: VitalsReport;
  base: string;
  projectId: string;
  backPath: string;
}) {
  switch (row.key) {
    case "scenarios":
    case "requirements": {
      const held =
        row.key === "scenarios"
          ? vitals.progress.scenarios
          : vitals.progress.requirements;
      return (
        <Fold label={`Unsat ${row.key}`} count={held.unsat.length}>
          {held.unsat.map((carrier) => (
            <NodeRow
              key={carrier.id}
              id={carrier.id}
              name={carrier.name}
              projectId={projectId}
              backPath={backPath}
            >
              <span className={CAPTION}>
                {countWord(carrier.openCriteria, "open criterion", "open criteria")}
              </span>
            </NodeRow>
          ))}
        </Fold>
      );
    }
    case "criteria":
      return (
        <OpenCriteria
          vitals={vitals}
          base={base}
          projectId={projectId}
          backPath={backPath}
        />
      );
    case "work-items":
      return (
        <Fold
          label="Blocked work items"
          count={vitals.progress.workItems.blocked.length}
        >
          {vitals.progress.workItems.blocked.map((item) => (
            <BlockedRow
              key={item.id}
              item={item}
              projectId={projectId}
              backPath={backPath}
            />
          ))}
        </Fold>
      );
  }
}

/**
 * THE OPEN CRITERIA, IN THREE GROUPS, AND ALL THREE ALWAYS SHOWN — a reason
 * with nobody under it says so with its nought, the way a clean rule says it
 * passed. An awaiting criterion is a door onto its queue card when the queue
 * holds one; when it does not — the evidence is not all agreed yet — it says
 * so instead. A left-open criterion carries the person's word whole: line
 * breaks and all, because it is an argument somebody wrote for the agent and
 * not a document.
 */
function OpenCriteria({
  vitals,
  base,
  projectId,
  backPath,
}: {
  vitals: VitalsReport;
  base: string;
  projectId: string;
  backPath: string;
}) {
  const groups = openByReason(vitals);
  return (
    <Fold label="Open criteria" count={vitals.progress.criteria.open.length}>
      {OPEN_REASONS.map((reason) => (
        <div key={reason} className="grid gap-1">
          <p className={CAPTION}>
            {`${OPEN_REASON_LABEL[reason]} (${String(groups[reason].length)})`}
          </p>
          {groups[reason].map((open) => (
            <OpenRow
              key={open.id}
              open={open}
              base={base}
              projectId={projectId}
              backPath={backPath}
            />
          ))}
        </div>
      ))}
    </Fold>
  );
}

function OpenRow({
  open,
  base,
  projectId,
  backPath,
}: {
  open: OpenCriterion;
  base: string;
  projectId: string;
  backPath: string;
}) {
  return (
    <div className="grid gap-1">
      <NodeRow
        id={open.id}
        name={open.name}
        projectId={projectId}
        backPath={backPath}
      >
        {open.reason === "awaiting-review" ? (
          open.bundleId === null ? (
            <span className={CAPTION}>evidence awaiting approval</span>
          ) : (
            <Link
              to={`${base}/review-queue/${encodeURIComponent(open.bundleId)}`}
              className="text-primary text-xs underline-offset-4 hover:underline"
            >
              Review Queue card
            </Link>
          )
        ) : null}
      </NodeRow>
      {open.leftOpen === null ? null : (
        <>
          <span className={CAPTION}>
            {`Left open by ${open.leftOpen.by} · ${formatStamp(open.leftOpen.at)}`}
          </span>
          <p className="text-sm whitespace-pre-wrap">{open.leftOpen.rationale}</p>
        </>
      )}
    </div>
  );
}

/**
 * A blocked work item and what blocks it — a prerequisite unfinished, a node
 * of the chain above it not yet green, or an id no file answers to, which has
 * nothing to open and is said as plain text.
 */
function BlockedRow({
  item,
  projectId,
  backPath,
}: {
  item: BlockedWorkItem;
  projectId: string;
  backPath: string;
}) {
  return (
    <div className="grid gap-1">
      <NodeRow
        id={item.id}
        name={item.name}
        projectId={projectId}
        backPath={backPath}
      >
        <WorkItemStateMark state="blocked" />
      </NodeRow>
      <div className="grid gap-1 pl-4">
        <p className={CAPTION}>Blocked by</p>
        {item.blockers.map((blocker) => (
          <div key={blocker.id} className="flex flex-wrap items-center gap-2">
            {blocker.why === "missing" || blocker.name === null ? (
              <span className="font-mono text-xs break-all">{blocker.id}</span>
            ) : (
              <NodeLink id={blocker.id} projectId={projectId} backPath={backPath} />
            )}
            {blocker.name === null ? null : (
              <span className="text-sm">{blocker.name}</span>
            )}
            <Badge variant="outline">{BLOCKER_WORD[blocker.why]}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * One rule of Spec Health. Violated, it counts its nodes in the quiet badge and
 * folds them open with the one line that says which process resolves it;
 * clean, it says it passed. The order is core's — violated first — kept as it
 * arrived.
 */
function HealthRow({
  rule,
  projectId,
  backPath,
}: {
  rule: HealthRule;
  projectId: string;
  backPath: string;
}) {
  const violated = isViolated(rule);
  return (
    <div className={BOX}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">{RULE_LABEL[rule.id]}</span>
        {violated ? (
          <Badge variant="secondary">{countWord(rule.nodes.length, "node")}</Badge>
        ) : (
          <Badge variant="outline">passed</Badge>
        )}
      </div>
      {violated ? (
        <Fold label="Show nodes" count={rule.nodes.length}>
          {rule.nodes.map((node) => (
            <NodeRow
              key={node.id}
              id={node.id}
              name={node.name}
              projectId={projectId}
              backPath={backPath}
            />
          ))}
          <p className={CAPTION}>{RULE_HINT[rule.id]}</p>
        </Fold>
      ) : null}
    </div>
  );
}
