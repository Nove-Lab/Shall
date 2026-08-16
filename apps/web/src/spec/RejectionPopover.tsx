import {
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";

/**
 * SAYING NO, IN WRITING — the one place a word into the rejection ledger is
 * written, wherever it is reached from and whichever of the three verbs it is
 * said in.
 *
 * THE RATIONALE IS REQUIRED AND THE DAEMON REFUSES A BLANK ONE. A rejection is
 * not a verdict a person keeps to themselves: it ends the reviewer's turn and
 * starts the agent's, and the only thing that crosses that hand-over is this
 * text. "No" with nothing after it hands back a node with the same problem it
 * arrived with, so the confirm button is off until there is something to read —
 * the same trim the daemon runs, so the button is dark exactly when the write
 * would be refused.
 *
 * IT IS A POPOVER AND NOT A DIALOG, BECAUSE NOTHING MOVES. The thing being
 * rejected is on the screen behind it — a card in the queue, the panel's own
 * node, the board under a right-click — and it has to stay readable while
 * somebody writes down what is wrong with it. A dialog would dim the one
 * document the sentence is about.
 *
 * ONE COMPONENT, TWO DOORS, AND THAT IS WHY THE ANCHOR IS A PROP. A button says
 * where it is by being an element (`trigger`, rendered as the popover's own
 * trigger); a right-click says where it is with two numbers, and the caller
 * hands those over as a virtual anchor. Everything after the gesture — the
 * words, the rule about a blank rationale, what a refusal looks like — is one
 * piece of behaviour and is written once.
 *
 * THE DAEMON'S SENTENCE IS KEPT VERBATIM AND THE POPOVER STAYS OPEN. It refuses
 * for reasons the caller cannot always know it should have hidden the door for —
 * a node that turned orphan under another session, a file it can no longer read
 * — and its words are the ones that say which. Losing the typed rationale to a
 * refusal would make the second attempt a retyping.
 */

/**
 * WHERE THE POPOVER OPENS WHEN NO ELEMENT TRIGGERED IT, in the design system's
 * own spelling rather than a shape written here. `PopoverContent` passes this
 * through to Base UI's positioner, which takes an element, a ref, a callback or
 * a virtual element — a `{ getBoundingClientRect() }` around a click's client
 * coordinates is how a context menu item opens this at the pointer.
 */
export type PopoverAnchor = ComponentProps<typeof PopoverContent>["anchor"];

export interface RejectionPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * WHAT IS BEING REJECTED, AND `null` FOR NOTHING PENDING — required and
   * nullable like every other answer this surface passes down, because the
   * right-click door genuinely has no target until somebody picks a row.
   * With no target there is nothing to name and nothing is rendered, the
   * trigger included: a button offering to reject nothing is not a button.
   */
  target: { id: string; name: string } | null;
  /**
   * The word this door says. All three write the same record into the same book
   * — "mark insufficient" is a rejection of a piece of evidence, and "leave
   * open" is a refusal of the list of evidence claiming a criterion — so the
   * verb is the only thing that differs, and it is a closed set rather than free
   * text so a fourth door cannot invent a fourth vocabulary.
   *
   * LEAVE OPEN IS THE ONE THAT IS NOT A "NO" ABOUT THE NODE. It says the
   * criterion's words are fine and the evidence does not yet meet them, so the
   * criterion's own colour is untouched by it — which is why it gets its own
   * hint and its own busy word below, and why nothing else about this popover
   * changes for it.
   */
  verb: "Reject" | "Mark insufficient" | "Leave open";
  /** Where to open when there is no trigger element — see `PopoverAnchor`. */
  anchor?: PopoverAnchor;
  /** The button that opens it, rendered AS the trigger (Base UI's `render`). */
  trigger?: ReactElement;
  /**
   * The write, which REJECTS with the daemon's own sentence — the same contract
   * every review write on this surface has, and the reason this takes no error
   * back. The caller refetches; this closes.
   */
  onConfirm: (rationale: string) => Promise<void>;
}

export function RejectionPopover({
  open,
  onOpenChange,
  target,
  verb,
  anchor,
  trigger,
  onConfirm,
}: RejectionPopoverProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * The field's own id. Several of these stand on one page — one per row of a
   * bundle — so a written-out id would tie every label on the page to the first
   * textarea rendered.
   */
  const fieldId = useId();

  /**
   * A NEW TARGET IS A NEW SENTENCE. What was typed about one node is not what
   * anybody means to say about the next, and a refusal from the last one belongs
   * to the write that earned it.
   *
   * CLOSING IS NOT A NEW TARGET, and that is deliberate: cancelling and opening
   * again on the same node keeps the draft, the same way an unsaved node's form
   * survives a click on the canvas. Only a successful write clears it.
   */
  const targetId = target?.id ?? null;
  useEffect(() => {
    setText("");
    setBusy(false);
    setError(null);
  }, [targetId]);

  if (target === null) {
    return null;
  }

  const rationale = text.trim();

  async function confirm() {
    if (rationale === "" || busy) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onConfirm(rationale);
      setText("");
      onOpenChange(false);
    } catch (writeError) {
      setError(
        writeError instanceof Error
          ? writeError.message
          : "Could not record the rejection",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {trigger === undefined ? null : <PopoverTrigger render={trigger} />}
      {/* Off the corner of whatever opened it — the pointer, or the button —
          so the text box lands under the thing being judged rather than over
          it. */}
      <PopoverContent
        side="bottom"
        align="start"
        {...(anchor === undefined ? {} : { anchor })}
      >
        <PopoverHeader>
          <PopoverTitle>{`${verb} ${target.id}`}</PopoverTitle>
          {/* The name and not the id again: the title already carries the id,
              and the name is what says which node this actually is. */}
          <PopoverDescription>{target.name}</PopoverDescription>
        </PopoverHeader>
        <div className="grid gap-2">
          <Label htmlFor={fieldId}>Rationale</Label>
          {/* SEVERAL LINES, BECAUSE ONE IS RARELY THE WHOLE ANSWER. The daemon
              keeps the line breaks — the book stores the text as written — so
              the box that writes it is a prose box and not a one-line input.
              Focused on open: this popover exists to be typed into. */}
          <Textarea
            id={fieldId}
            rows={4}
            autoFocus
            placeholder="What is wrong, and what should it be instead"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          {/* WHO READS THIS NEXT, SAID BEFORE IT IS WRITTEN. The rejection goes
              into the book an agent picks its next task from, so the useful
              rationale is an instruction and not a grade — and for a criterion
              left open the instruction is about the EVIDENCE, because the words
              of the criterion are not what is being refused. */}
          <p className="text-muted-foreground text-xs">
            {verb === "Leave open"
              ? "The agent reads this next — say what the evidence does not show."
              : "The agent reads this next — say what to change."}
          </p>
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {/* ONE BUSY WORD FOR THE TWO REFUSALS, because they are one act:
              marking a piece of evidence insufficient IS rejecting it, and the
              book it lands in is the same book. Leaving a criterion open is a
              record in that book too but is not a "no" about the node, so
              "Rejecting…" would be this button saying something the write does
              not do. */}
          <Button
            type="button"
            size="sm"
            disabled={rationale === "" || busy}
            onClick={() => void confirm()}
          >
            {busy ? (verb === "Leave open" ? "Saving…" : "Rejecting…") : verb}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
