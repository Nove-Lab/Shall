# The survey — what needs doing

The spine is [`../SKILL.md`](../SKILL.md), the `shall-work` skill itself: its rules about reading the commands' answers and never working a colour out yourself govern this part, and every mention of the spine below points there.

## Purpose

Say what the project needs done, in four readings, and write nothing. It opens the cycle and it is also a command of its own, and it behaves the same either way: `/shall:work.todo` ends here, the cycle carries what it found into the pick.

## What it needs from above

The gate passed, which means `shall status --json` already answered. Nothing else.

## Steps

1. **`shall board --json`** — the two halves, Fix Spec and the work items ready to start.
2. **Reuse the status from the gate.** It carries every node with its colour and the relations each file draws, which is everything the next step needs.
3. **Work out which findings nobody has answered, yourself.** A finding is answered when some decision's own relations reach it — `shall-authoring/references/relations.md` names the line and says whose file it lives in — and unanswered when none does. Join the two lists out of the status you already have; nothing computes this for you and nothing needs to.
4. **Open the unanswered findings' files, and only those.** The body says what was found, and the frontmatter may carry the mark that says it was stopping the work that found it — a key written only when true, documented in the starting file `shall add-spec-node --type Finding` writes. This is a survey: read those files and no others.
5. **Report four things, in this order.**

| # | What | How to say it |
|---|---|---|
| 1 | findings nobody has answered | the ones marked as stopping work first, then the rest, one line each: the id, what it says, and the ids it names. Say plainly that the mark is the author's judgment and locks nothing — it is a reason to look first, not a gate |
| 2 | Fix Spec | a person's rejection first, with one line of its rationale and a note that the whole of it is the work order when the item is picked; then what the grammar found, each with its own word for what is wrong |
| 3 | ready to start | the board's own order, each with the module it belongs to, the criteria it targets and whether those are open or closed, and any work already logged against it |
| 4 | what is waiting | one line: how many nodes are in the Review Queue |

6. **Stop.** Nothing ran and nothing was written. A suggestion about what to do next is one line at most.

## When the board is empty

Both halves empty is an answer, not a failure. Say so, say what is waiting in the queue, and stop — what unblocks an empty board is a person judging what is there, or `/shall:plan` cutting more work, and neither is this process's.

## Under the overlays

Under `--dry`, every line of the report carries the forecast's prefix. Under `--auto`, the report is still printed — it is what the journal's reasoning is written from — and the pick follows it without stopping.

## The gate

| The line | What proves it |
|---|---|
| nothing was written | `git status` says what it said before, and no file under `.shall/` has moved |
| nothing was computed by hand | every colour, every readiness and every count in the report came out of a command's answer |
| the report is four parts, in order | the table above, top to bottom |
