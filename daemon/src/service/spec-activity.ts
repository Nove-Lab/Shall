import { readdir } from "node:fs/promises";
import path from "node:path";
import { compare, judgeNodeId } from "@shall/core/graph";
import {
  activityMonthOf,
  isActivityKind,
  type ActivityRecord,
} from "@shall/core/serialize";
import {
  appendActivity,
  describeFileFailure,
  readActivity,
  RESTORE_THE_BOOK,
} from "@shall/core/store";
import { conflict, invalid, missing } from "./errors.js";
import {
  projectRootAt,
  projectSpecFor,
  requireText,
  served,
  specPathsOf,
} from "./spec-graph.js";

/**
 * The activity feed's two doors: the agent's, which writes, and the web's,
 * which reads.
 *
 * THE FEED IS WHAT AN AGENT LOGGED AT THE END OF A RUN, AND NOTHING ELSE. It is
 * the fourth file under `.shall/ledger/` and the odd one out —
 * `ledger/feed/YYYY-MM.yaml`, one YAML list per month, appended and never
 * edited — and every line in it came through `shall log`: a specification
 * drawn out, modules planned, a turn of work finished, a raise landed. What a
 * person judged is in the three books and is not repeated here; the feed
 * carries no judgment and names nobody.
 *
 * IT IS A SUMMARY FOR A PERSON AND AN INPUT TO NOTHING. No colour, gate, board
 * row or queue card reads it. `requireLedgers` never takes its folder,
 * `checkSpec` never opens it, and a month that will not read costs the panel
 * that shows it and nothing else. The agent's door refuses like any other door
 * all the same, because the line was the whole request.
 *
 * WHO HOLDS THE PEN, AND WHO READS. Only the daemon writes the feed, and only
 * on an agent's word through `shall log`, which asks this service and gets a
 * yes or a no and nothing else: there is no procedure that hands the feed back
 * to an agent, by design, so an agent that wants the past asks `shall status`
 * and `shall board`. The web's reader is the feed's only reader.
 *
 * IT IS NOT NAMED `spec-feed`, although the folder and the panel are called the
 * feed, because `spec-events.ts` already has a `Feed` — the SSE listener feed —
 * and two feeds in one service layer would be two things called by one name.
 */

/** The tail every kind refusal ends in: what `shall log` does take. */
const LOG_TAKES =
  "shall log takes specify_done, plan_done, work_done or raise_landed.";

/** A month file's name, and nothing else in the folder is one. */
const MONTH_FILE = /^\d{4}-\d{2}\.yaml$/;

/** A month as a person asks for it: the same seven characters the file is named by. */
const MONTH = /^\d{4}-\d{2}$/;

/** The month file an instant belongs in, under a project's feed folder. */
function monthFileOf(feedDir: string, at: string): string {
  return path.join(feedDir, `${activityMonthOf(at)}.yaml`);
}

/**
 * The agent's door — `shall log <kind> <summary> [--refs <id,id>]` — in the
 * path family, because the agent stands in a checkout the registry may never
 * have seen.
 *
 * THE REFUSALS COME IN THE ORDER A PERSON CAN ACT ON, and each one says what
 * the door does take. The project first, in the sentence every path-taking
 * door says; then the kind, because a kind decides whether this door is the
 * right one at all — any word but the four is unknown here, and the sentence
 * lists the four; then the summary, held to one line like an id is; then every
 * ref, which must be a node id because the feed's reader refuses anything else
 * and the store's fixpoint would catch it a moment later with a worse
 * sentence.
 *
 * THE RECORD NAMES NOBODY. The agent is not a person and the daemon writes the
 * line on its behalf, so the record is the four keys and no author. The month
 * is the daemon's clock's, in UTC, and the door says nothing about which file
 * it went into: the line landed, or here is why not.
 */
export async function logActivity(input: {
  path: string;
  kind: string;
  summary: string;
  refs?: readonly string[] | undefined;
}): Promise<void> {
  const root = await projectRootAt(input.path);

  const kind = input.kind.trim();
  if (kind === "") {
    throw invalid(`A kind is required. ${LOG_TAKES}`);
  }
  if (!isActivityKind(kind)) {
    throw invalid(`Unknown kind: ${kind}. ${LOG_TAKES}`);
  }

  const summary = requireText("A summary", input.summary);

  // Trimmed, judged, then deduplicated — in that order, so that `R-0001` and
  // ` R-0001` are one ref and a blank entry is refused rather than dropped: a
  // blank is a comma the agent typed twice, and silently losing it would hide
  // the typo that put it there.
  const refs: string[] = [];
  for (const given of input.refs ?? []) {
    const ref = given.trim();
    if (ref === "") {
      throw invalid(
        "A ref names no node id — --refs takes node ids, separated by commas.",
      );
    }
    const judged = judgeNodeId(ref);
    if (judged !== null) {
      throw invalid(`${JSON.stringify(ref)} is not a node id. ${judged}`);
    }
    if (!refs.includes(ref)) {
      refs.push(ref);
    }
  }

  const at = new Date().toISOString();
  await served(
    appendActivity(monthFileOf(specPathsOf(root).feedDir, at), {
      at,
      kind,
      refs,
      summary,
    }),
  );
}

/**
 * The web's reader — the feed's only one — in the id family.
 *
 * THE MONTHS ARE THE FILES THAT EXIST, NEWEST FIRST, and the default month is
 * the newest of them and never the calendar month: a project whose last line
 * was written in June shows June when opened in August, because a panel that
 * opened on an empty month when there was a full one behind it would read as
 * "nothing has happened". The names are fixed-width `YYYY-MM`, so byte order is
 * time order and the sort needs nothing else.
 *
 * THE ENTRIES COME NEWEST FIRST TOO, which is the reverse of the file: the
 * file is appended at the end, and the panel reads from the top.
 *
 * A MONTH THAT IS NOT THERE IS REFUSED AS MISSING, not answered as empty, so
 * that a month picker never holds a value outside its own list — the list is
 * the months, and asking outside it is asking for a file the folder does not
 * have. A month spelled any other way is invalid, and a month file that will
 * not read is a conflict carrying the file's own sentence: the panel has a
 * slot for it, and the repair is the same as a book's.
 *
 * A folder that is not there is no months and no refusal — nothing has been
 * logged yet — and so is a `feed` or a `ledger` that is somehow a file; any
 * other answer from the filesystem is one the person should hear, with the
 * folder named.
 */
export async function activityFeed(input: {
  projectId: string;
  month?: string | undefined;
}): Promise<{
  months: string[];
  month: string | null;
  entries: ActivityRecord[];
}> {
  const { feedDir } = await projectSpecFor(input.projectId);

  let names: string[];
  try {
    names = await readdir(feedDir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      names = [];
    } else {
      throw conflict(
        `The activity feed folder at ${feedDir} could not be listed: ${describeFileFailure(error)}.`,
      );
    }
  }
  const months = names
    .filter((name) => MONTH_FILE.test(name))
    .map((name) => name.slice(0, -".yaml".length))
    .sort((a, b) => compare(b, a));

  let month: string | null;
  if (input.month === undefined) {
    month = months[0] ?? null;
  } else {
    const asked = input.month.trim();
    if (!MONTH.test(asked)) {
      throw invalid("A month is written YYYY-MM, like 2026-08.");
    }
    if (!months.includes(asked)) {
      throw missing(`The activity feed has no month ${asked}.`);
    }
    month = asked;
  }

  if (month === null) {
    return { months, month, entries: [] };
  }
  const file = path.join(feedDir, `${month}.yaml`);
  const reading = await readActivity(file);
  if (reading.problem !== null) {
    throw conflict(
      `Shall could not read the activity feed at ${file} — ${reading.problem} Nothing is lost but this panel: ${RESTORE_THE_BOOK}`,
    );
  }
  return { months, month, entries: [...reading.records].reverse() };
}
