import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DiffKind, DiffRow } from "./view/diff";
import type { Signal } from "./view/furniture";

/**
 * THE THREE THINGS THE REVIEW SURFACE DRAWS IN MORE THAN ONE PLACE: the signal
 * square, the list of relations pointing at a node, and a line diff.
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
 * THE VERDICT'S PAINT, AND IT IS THE ONLY PLACE A COLOUR IS NAMED.
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
