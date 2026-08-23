import { Fragment, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api } from "@/api";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { useRevision } from "@/live";
import { useProject } from "@/project-context";
import { formatStamp } from "@/spec/spec-node";
import type { PanelMeta } from "../panels";
import { PanelTable } from "../PanelTable";
import { CAPTION, controlBase, specLink } from "../parts";
import {
  ACTIVITY_KIND_LABEL,
  activityRows,
  type ActivityMonth as Month,
} from "./rows";

/**
 * WHAT EACH RUN DELIVERED, ONE ROW PER LINE AN AGENT LOGGED, NEWEST FIRST.
 *
 * IT IS A SUMMARY FOR A PERSON AND A RECORD OF NOTHING. The feed is the fourth
 * file under `.shall/ledger/` and the odd one out: no colour, gate, board row
 * or queue card reads it, and a month that will not read costs this panel and
 * nothing else. So the rows are not doors — a run that has finished has no
 * page of its own — and the refs on each row are the doors instead, into the
 * node in the Spec plane, with the way back pointing here.
 *
 * STORED FLAT AND SHOWN FLAT. Every line is a run's own finished record with
 * its own sentence, written by the agent at the run's end through `shall log`,
 * and two lines are two things; nothing here folds, counts or ranges. The
 * row is the record, the sentence is the record's summary verbatim, and the
 * only arithmetic is `rows.ts`'s cap on the refs a row shows.
 *
 * THE MONTH IS IN THE URL, `?month=YYYY-MM`, and nowhere else — a link is
 * enough to put someone on the same list, the way it is for every other panel
 * — and the chooser shows only when there is more than one month to choose.
 * Left out, the newest month on disk is the one shown.
 *
 * NOTHING IS CACHED, like every other surface here: the month is read again on
 * every change the watcher sees, and the watcher sees every line the daemon
 * appends.
 */
export function ActivityFeed({ panel }: { panel: PanelMeta }) {
  const project = useProject();
  const [searchParams, setSearchParams] = useSearchParams();
  const month = searchParams.get("month");
  const [feed, setFeed] = useState<Month | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * A PROJECT CHANGE IS A DIFFERENT FEED AND NOT A STALE ONE, AND SO IS A MONTH
   * CHANGE — the fetch is keyed on both. `live` stops an answer for the list
   * somebody has already left from being drawn as this one's; the SUCCESS path
   * is under the latch too, because a slow answer landing after the switch is
   * exactly the drawing this guard exists to stop. The month is sent only when
   * one is chosen: the daemon's "no month" is the newest on disk.
   */
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    api.spec.activity
      .query(
        month === null
          ? { projectId: project.id }
          : { projectId: project.id, month },
      )
      .then((next) => {
        if (live) {
          setFeed(next);
        }
      })
      .catch((loadError: unknown) => {
        if (live) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not read the activity feed",
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
  }, [project.id, month]);
  /**
   * A CHANGE ON DISK RE-READS WHAT IS ALREADY HERE, AND CLEARS NOTHING. The
   * effect above owns the skeleton and the refusal because it owns the mount;
   * this one owns neither, so a line the daemon appended does not blink the
   * table back to skeletons on its way to being right. A failure here keeps
   * the rows that are on screen and says nothing: the next change asks again,
   * and a refusal that outlives the daemon is waiting on the next navigation,
   * where somebody is looking for it.
   */
  const revision = useRevision();
  useEffect(() => {
    if (revision === 0) {
      return;
    }
    let live = true;
    api.spec.activity
      .query(
        month === null
          ? { projectId: project.id }
          : { projectId: project.id, month },
      )
      .then((next) => {
        if (live) {
          setFeed(next);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [revision, project.id, month]);

  const columns = panel.columns ?? [];
  const rows = feed === null ? [] : activityRows(feed.entries);
  const backPath =
    `${controlBase(project.id)}/activity-feed` +
    (month === null ? "" : `?month=${encodeURIComponent(month)}`);

  return (
    <div className="grid gap-3">
      {/* THE CHOOSER SHOWS ONLY WHEN THERE IS A CHOICE — one month on disk is
          no question — and it stays on screen through a month switch, so the
          control just clicked does not vanish under the skeleton; a project
          switch, which starts with no month, hides it until the new project's
          months are known. The values are the files' own names, what a
          person also sees in git, and they come in the daemon's order. */}
      {feed !== null && feed.months.length > 1 && (!loading || month !== null) ? (
        <div className="flex items-center justify-end gap-2">
          <span className={CAPTION}>Month</span>
          <Select
            value={month ?? feed.month ?? ""}
            onValueChange={(value) => {
              if (value !== null && value !== "") {
                setSearchParams({ month: value });
              }
            }}
          >
            <SelectTrigger size="sm" aria-label="Month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {feed.months.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <PanelTable
        columns={columns}
        error={error}
        loading={loading}
        empty={
          feed !== null && rows.length === 0 ? (
            <EmptyState
              message={panel.empty}
              hint="A run's last line lands here when the agent logs it."
            />
          ) : null
        }
      >
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell>
              <Badge variant="secondary">{ACTIVITY_KIND_LABEL[row.kind]}</Badge>
            </TableCell>
            {/* THE SENTENCE IS NOT A DOOR. A run that has finished has no
                page of its own — the sentence is the agent's own account of
                it — so the event is read here and the refs beside it are
                where a person goes next. */}
            <TableCell className="text-sm">{row.sentence}</TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {row.refs.length === 0 ? "—" : null}
              {row.refs.map((id, index) => (
                <Fragment key={id}>
                  {index > 0 ? ", " : null}
                  <Link
                    to={specLink(project.id, id, backPath)}
                    className="text-primary font-mono text-xs underline-offset-4 hover:underline"
                  >
                    {id}
                  </Link>
                </Fragment>
              ))}
              {row.hiddenRefs > 0 ? ` and ${String(row.hiddenRefs)} more` : null}
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {formatStamp(row.at)}
            </TableCell>
          </TableRow>
        ))}
      </PanelTable>
    </div>
  );
}
