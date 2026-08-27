import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Closure, Satisfaction, WorkItemState } from "./review";
import type { DiffKind, DiffRow } from "./view/diff";
import type { Signal } from "./view/furniture";

/**
 * THE FOUR THINGS THE REVIEW SURFACE DRAWS IN MORE THAN ONE PLACE: the signal
 * square, the closure mark, the list of relations pointing at a node, and a
 * line diff.
 *
 * THEY ARE HERE BECAUSE THE CARD AND THE PANEL BOTH NEED THEM AND MUST NOT
 * IMPORT EACH OTHER. The dot is on every card on the canvas and at the head of
 * the panel's status box; the referrer list is in two delete confirmations and
 * in the Problems dialog. Left in `canvas-nodes.tsx`, the panel would be
 * importing the canvas — and with it `@xyflow/react` — to draw a 9px square.
 *
 * SO NOTHING HERE MAY IMPORT `canvas-nodes.tsx` OR `@xyflow/react`. That is the
 * one rule this file has, and it is what keeps the direction of the dependency
 * one way round.
 */

/**
 * THE VERDICT'S PAINT. WITH THE `MARK` TABLE BELOW IT, THE TWO PLACES A COLOUR
 * IS NAMED — and there are two rather than one because the second axis is
 * painted too, in these same values.
 *
 * THEY ARE TAILWIND PALETTE VALUES AND NOT THEME TOKENS, which is a departure
 * from the rest of this app and is the same one the card's placeholder square
 * already made: a traffic light is not a semantic role the design system has —
 * `--destructive` is what a dangerous ACTION wears, not what a stale node is —
 * and inventing three tokens would be this feature making up a design system
 * setting. The theme itself reaches for the same palette the same way
 * (`--primary: var(--color-blue-600)`).
 *
 * `Record<Signal, string>` AND NOT A LOOSER MAP: a fourth verdict is a compile
 * error here, one line after it is a compile error in `signalsOf`.
 */
export const SIGNAL_CLASS: Record<Signal, string> = {
  red: "bg-red-500",
  yellow: "bg-amber-500",
  green: "bg-emerald-500",
};

/**
 * ONE SIGNAL SQUARE, at the size the card reserved for it — the card's own
 * arithmetic depends on this box, so it is drawn at `size-2.25` here and in the
 * panel both, and the panel gets the canvas's square rather than a second
 * shape that means the same thing.
 *
 * `shrink-0` because it sits in a flex row beside text that truncates: a
 * verdict squeezed to nothing by a long id would be a verdict nobody can read.
 */
export function StatusDot({ color }: { color: Signal }) {
  return <span className={cn("size-2.25 shrink-0", SIGNAL_CLASS[color])} />;
}

/**
 * THE SECOND-AXIS MARKS SHARE ONE VOCABULARY, and it is two words wide:
 * NOT YET, and DONE.
 *
 * A criterion is open or closed; a work item is blocked, ready, in review or
 * done; a requirement or scenario is sat or unsat. Eight words,
 * but only two STATES a person scans for — the thing has been shown to be met,
 * or it has not — so there are two paints and not seven, and every mark uses
 * them. Before this they disagreed: an open criterion wore red while a blocked
 * work item wore grey, which said that a criterion nobody has closed yet is a defect
 * and a work item nobody can start yet is merely news. Neither is a defect. Red is
 * the traffic light's word for "this is wrong", and it is now only ever that.
 *
 * DONE IS THE FILLED EMERALD, the same one `SIGNAL_CLASS.green` uses, because
 * arriving is the thing the whole board is trying to do and it should read as
 * arrival wherever it happens. NOT YET IS THE DESIGN SYSTEM'S OWN QUIET BADGE —
 * `variant="secondary"`, no colour of ours at all — so an unfinished thing
 * announces itself by its WORD rather than by a hue, and a screen full of
 * unfinished things is not a screen full of alarm.
 *
 * `border-transparent` on the filled one because the base badge carries a
 * border, and a border in the default colour around a filled badge reads as an
 * outline the palette did not ask for.
 */
const MET_CLASS = "bg-emerald-500 text-white border-transparent";

/**
 * THE SEVEN WORDS AND THEIR TWO PAINTS, ONE TABLE. The three unions are
 * disjoint, so one `Record` over all of them keeps the exhaustiveness a
 * `Record` is for — a new word on any axis is a compile error here — while
 * making the sameness visible: `closed`, `done` and `sat` are one row said
 * three times, and the four unfinished words are the design system's own quiet
 * badge with nothing of ours on it.
 *
 * BLOCKED AND READY ARE DELIBERATELY IDENTICAL PAINT: both are states of
 * unfinished work and neither is a defect; what differs is whether this is
 * somebody's turn, and the WORD says that. Colouring "ready" would put a third
 * light on a board that already has one. UNSAT IS THE SAME QUIET BADGE for the
 * same reason: a requirement whose criteria are still open is on its way, not
 * wrong, and a warning colour would say otherwise.
 *
 * SAT IS THE FILLED EMERALD, Done's own paint, because it is the same
 * arrival one level up — every criterion this carrier demands has been shown
 * met — and it is told from the registration green the way Done is: by SHAPE,
 * a pill with a word in it beside the id, never the bare square on the left.
 */
const MARK: Record<
  Closure | WorkItemState | Satisfaction,
  {
    readonly variant: "secondary" | "default";
    readonly className: string;
    readonly label: string;
  }
> = {
  open: { variant: "secondary", className: "", label: "Open" },
  closed: { variant: "default", className: MET_CLASS, label: "Closed" },
  blocked: { variant: "secondary", className: "", label: "Blocked" },
  ready: { variant: "secondary", className: "", label: "Ready" },
  in_review: { variant: "secondary", className: "", label: "In review" },
  done: { variant: "default", className: MET_CLASS, label: "Done" },
  sat: { variant: "default", className: MET_CLASS, label: "Sat" },
  unsat: { variant: "secondary", className: "", label: "Unsat" },
};

function Mark({
  state,
  className,
}: {
  state: Closure | WorkItemState | Satisfaction;
  // `| undefined` because the two named marks forward their own optional prop
  // here under `exactOptionalPropertyTypes`.
  className?: string | undefined;
}) {
  const mark = MARK[state];
  return (
    <Badge variant={mark.variant} className={cn(mark.className, className)}>
      {mark.label}
    </Badge>
  );
}

/**
 * THE WORD IS THE ANNOUNCEMENT AND THERE IS NO SECOND ONE. The badge says
 * "Open" or "Closed" in text a reader lands on directly, so nothing here is
 * hidden behind an sr-only span the way a tick would need — the shape WAS the
 * statement then, and the statement is now the label.
 *
 * `className` IS FOR THE ONE CALLER WITH A HEIGHT BUDGET. The canvas card is
 * 44px with a 16px `text-xs` row in it and the badge's own `h-5` is 20px, so the
 * board passes `h-4 px-1.5` and nothing else does — the panel and the queue rows
 * have the room and take the default, which keeps the badge one size in the
 * places a person reads it slowly.
 */
export function ClosureMark({
  state,
  className,
}: {
  state: Closure;
  className?: string | undefined;
}) {
  return <Mark state={state} className={className} />;
}

/**
 * THE BADGE BESIDE A WORK ITEM'S ID, drawn for reading only — no hover, no click,
 * no tooltip. It answers a question a person asks of the board with their eyes:
 * is this mine to start.
 *
 * `className` IS FOR THE ONE CALLER WITH A HEIGHT BUDGET — the canvas card,
 * exactly as `ClosureMark` above documents.
 */
export function WorkItemStateMark({
  state,
  className,
}: {
  state: WorkItemState;
  className?: string | undefined;
}) {
  return <Mark state={state} className={className} />;
}

/**
 * THE BADGE BESIDE A REQUIREMENT'S OR SCENARIO'S ID, drawn for reading only —
 * the criteria it demands, rolled up: every one of them closed, or not yet. A
 * carrier demanding none wears nothing, and that is the caller's null.
 *
 * `className` IS FOR THE ONE CALLER WITH A HEIGHT BUDGET — the canvas card,
 * exactly as `ClosureMark` above documents.
 */
export function SatisfactionMark({
  state,
  className,
}: {
  state: Satisfaction;
  className?: string | undefined;
}) {
  return <Mark state={state} className={className} />;
}

/**
 * ONE MARK PER SECOND AXIS, AND THE TYPE DECIDES WHICH — the precedence said
 * once for the three places a node's id wears it (the canvas card, and the
 * panel's ID field in both modes). A work item's word wins because it already says
 * whether the work item is closed and what that means for work; a criterion wears
 * its closure mark; a requirement or scenario wears the word for its criteria;
 * everything else wears nothing. The three never meet on one node — no type is
 * two of them — so the order here is for exhaustiveness and not a tie-break.
 */
export function SecondAxisMark({
  closure,
  workItemState,
  satisfaction,
  className,
}: {
  closure: Closure | null;
  workItemState: WorkItemState | null;
  satisfaction: Satisfaction | null;
  className?: string | undefined;
}) {
  if (workItemState !== null) {
    return <WorkItemStateMark state={workItemState} className={className} />;
  }
  if (closure !== null) {
    return <ClosureMark state={closure} className={className} />;
  }
  if (satisfaction !== null) {
    return <SatisfactionMark state={satisfaction} className={className} />;
  }
  return null;
}

/**
 * WHAT POINTS AT A NODE, one row per relation: where it starts, and what kind it
 * is. The node itself is not named — it is what the sentence above the list
 * already named, and repeating it on every row would bury the part that differs.
 *
 * IT IS TYPED BY THE TWO FIELDS IT READS AND NOT AS `SpecEdge`, so the same list
 * serves the Problems dialog. A relation into a missing node never reaches the
 * canvas — the daemon serves only edges with two living ends — so those arrive
 * as `referencedBy` entries with no id of their own, and the rows are keyed by
 * index for that reason. There is ONE list visual on this surface and this is it.
 */
export interface Referrer {
  readonly fromId: string;
  readonly type: string;
}

export function Referrers({ edges }: { edges: readonly Referrer[] }) {
  return (
    <ul className="grid gap-1">
      {edges.map((edge, index) => (
        <li key={index} className="flex items-center gap-1.5">
          <span className="font-mono text-xs break-all">{edge.fromId}</span>
          <Badge variant="secondary">{edge.type}</Badge>
        </li>
      ))}
    </ul>
  );
}

/**
 * A CHANGED LINE IS COLOURED AND IS ALSO SIGNED, and the sign is the load-bearing
 * half. Colour alone fails a reader who cannot separate red from green, and it
 * fails every reader on a line that is empty — a blank row tinted green says
 * nothing about whether it was added. The two-space column on unchanged rows is
 * what keeps all three kinds in one left margin.
 */
const DIFF_ROW: Record<DiffKind, string> = {
  same: "text-muted-foreground",
  add: "bg-emerald-500/10",
  del: "bg-destructive/10 text-destructive",
};

const SIGN: Record<DiffKind, string> = {
  same: "  ",
  add: "+ ",
  del: "- ",
};

/**
 * THE DIFF, AS PLAIN DIVS AND NOT A `<pre>`. Every row has to carry its own
 * background across the full width of the block, and a `<pre>`'s children are
 * inline runs that stop at the end of their text. `whitespace-pre` per row is
 * what keeps the file's own indentation, which is the part `<pre>` was for.
 *
 * IT SCROLLS INSIDE ITSELF, both ways: this sits in a docked panel a few hundred
 * pixels wide, and a long line that widened the block would reflow every field
 * around it. The height cap is so that a diff of a whole file cannot push the
 * fields below it off the screen.
 */
export function LineDiff({ rows }: { rows: readonly DiffRow[] }) {
  return (
    <div className="max-h-72 overflow-auto rounded-md border font-mono text-xs leading-5">
      {rows.map((row, index) => (
        <div
          key={index}
          className={cn("px-2 whitespace-pre", DIFF_ROW[row.kind])}
        >
          {SIGN[row.kind]}
          {row.text}
        </div>
      ))}
    </div>
  );
}
