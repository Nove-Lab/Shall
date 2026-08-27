---
name: shall-work
description: Carries the Shall /work process — the execution-plane cycle that surveys the board, picks a small bundle of items, leaves the development itself to the agent's own judgment, holds each item to its definition of done before anything is called finished, and writes the turn up as one journal with a log per item — plus its two loose parts, the read-only survey and the write-up alone. Loaded by the /shall:work, /shall:work.todo and /shall:work.report commands.
tools: shall-cli
process: true
---

# Shall /work

**This page is the spine.** The four part files hang off it: each carries only what is particular to its own stretch and takes the rest from here. The stops, the picking rules, the handover, the self-check and the never-list below govern every stretch, including one whose file says nothing about them.

## What this is

One turn of work, end to end:

survey → the look back → **stop 1**, the pick → the stretch outside Shall → the self-check → **stop 2**, the write-up → the record → done.

One turn is one journal. One item is one work log. Three commands come in here — `/shall:work` runs the whole cycle, `/shall:work.todo` runs the survey alone, `/shall:work.report` runs the write-up alone — and they are the same parts assembled or loose, which is why they share one page.

**There is no phase gate in this process, and that is not an oversight.** In `/shall:specify` a phase does not open until a person has approved the one above it, and in `/shall:plan` the whole plan is agreed in the terminal before a file is written — unless those runs were asked for with `--auto`, which removes the terminal yes — because each of those is written on top of what came before. A turn of work is not: it is done in one session, written up at the end, and read afterwards. So this process never waits — it writes the record, says a card is waiting, and stops. A queue with records in it is the ordinary state of a healthy project, not a backlog.

## Authoring is delegated

Every file you write follows the **`shall-authoring`** skill. Load it before you write the first file and follow it for the path, the id, the frontmatter and the shape of the body. The language of the spec is settled there too: an existing spec's language is followed, and an empty spec's is asked for once when the conversation is not in English.

Nothing in this skill or in its part files lists a type's fields, its body headings, or the choices a heading offers. `shall add-spec-node --type <Type>` writes a starting file whose commented header carries that vocabulary, and that starting file is the only copy of it. Keep the sections it suggests or reshape them — nothing parses the body.

**Nothing here names a relation, either.** The shapes are said in words — the work log's line at the work item it addressed, the report's claim at the work item it finished, the evidence's claim at the criterion it satisfies — and the name of each, the direction it runs and the file it is written in are in `shall-authoring/references/relations.md` and in the header of the starting file. Two copies of a relation name drift, and the one an agent reads is then a coin toss.

## The common rules

{{ask-mechanics}} A question you could answer correctly yourself is not a question.

**Ask at a stop, not between them.** The two stops are where this process spends the user's attention. In the stretch outside Shall you ask only when you genuinely cannot go on, and that is a narrow door — see the part file.

**A plain exchange stays in the terminal.** What reaches Shall is nodes and nothing else. A question answered in conversation, a decision about how you did something, a thing you looked up: none of that is a node, and writing it as one is how a record stops being worth reading.

**Read what the commands answer with, never what they print.** `shall status --json` and `shall board --json` are the contract; the printed rows are for people. Never work out a colour, a readiness or what is waiting by reasoning about the graph — you will disagree with the screen, and the screen is right.

**A record is never revised.** An execution node a person has approved is what happened, and what happened does not change. A correction is a new record in a new turn, saying what was found and what is true now.

**Fix Spec is a debt, not a choice.** Whatever the board's Fix Spec half holds comes before new work: writing on top of a red graph buries the red and hands a person a card they cannot judge. Which door it is fixed through is the row's `kind`, and for a rejection the node's `band` in `shall status --json`:

| The row | Who fixes it |
|---|---|
| grammar — a seam, an orphan, an id nothing answers to, a file that will not read | you, here, in this turn |
| a person's rejection of an intent or domain node | `/shall:specify <the rationale>` — a change up there stales what hangs under it, and that process walks the reach and reruns the layers below; say so and stop |
| a person's rejection of a plan node | `/shall:plan <the rationale>`, for the same reason; say so and stop |
| a person's rejection of an execution record | nobody edits it — a record is never revised. The item is ready again; a new turn writes a new record |

## The cycle and its two stops

| Stop | What you put to the user | What a "no" means |
|---|---|---|
| 1 — the pick | the ids you mean to take this turn, one line each on why, and one line each on how you mean to approach it, drawn from the look back — and, where you cannot see it finishing this turn, that `/shall:plan` should split it first | they adjust the list or the approach; follow it and go on |
| 2 — the write-up | the record you mean to write, in full: a log per item, and each report, evidence and finding with what it points at | take the objection back into the draft and put it again |

Nothing else stops. Everything up to stop 2 is held in the conversation — no part of the record reaches disk before it passes.

The approach line is the one thing Shall asks about the doing before it starts — enough that the person can redirect you, not a plan. It stands on what the look back showed: the conventions this module's earlier logs settled on, what those logs left behind, and what a person decided. Under `--auto` it is written into the journal instead.

## Picking the bundle

**Fix Spec first, then the ready work items — the board's Implement list is the whole pool.** Every row there has already been judged startable, and an item somebody has reported finished is not on it while a person judges the report — so do not re-check a chain, a wait or a review. A Fix Spec row carries the rationale a person wrote, whole, because it is a work order.

**Three at most, and one is a fine answer.** Which three: an item with a log already against it (`addressedBy`) first — a turn that stopped part-way is carried on before anything new is begun — then the board's own order, then what the look back gives a reason to take together. In what order you do them, and how, is yours. More than three only when the user asks for more in so many words — and then say once that three is the recommended maximum, and follow them.

The user's steering words narrow the candidates and never overrule taking Fix Spec first. If a finding nobody has answered names one of the candidates, say so at stop 1: it may change what is worth starting. That is a reason to look, not a rule that stops anything.

**Once the candidates are chosen, look back before you stand at stop 1** — [references/lookback.md](references/lookback.md). It changes the bundle's shape and your approach, never its eligibility.

## Out of Shall's scope — the handover

Once stop 1 has confirmed the pick, Shall hands over, and this skill is where that is said out loud:

**From here, planning the implementation and implementing it are outside Shall's scope. One premise does not move: everything done in this stretch is for the work items you picked — their scope and their definition of done — and for nothing else. Under that premise, go back to your own base prompt and to this project's conventions — its rules file, its coding standards, how it tests and how it commits — read them again closely, and take them as the standard above this skill. Reading the code, planning at the level of files and functions, writing the code, the method and the quality bar: all of that belongs to that world, and Shall's grammar and procedure do not enter it. An improvement you notice outside the work item, you do not make: note it, with what it concerns, and it is material for a finding at the write-up. When you judge the work done, come back to Shall for the self-check.**

What Shall asks of the stretch is its two ends and nothing between them: one line of approach going in, said at stop 1 beside each pick; and the material coming out — your notes per item, the commits in order, and what you ran to check it and what it said. The part file has both ends in detail.

## Coming back — the self-check

"Done" is a comparison, not a feeling. For each item you judge finished:

1. **Open its definition of done and compare, by running and calling.** A definition of done is observable by construction — what runs, what answers — so observe it: run what it says runs, call what it says answers, and write down what you saw. A part that does not hold sends you back into the stretch; the item is not finished until it holds.
2. **For each criterion the item targets, run the evaluation process the criterion's own file describes**, and keep the result. That result is what the evidence will point at. A process that cannot be run here — it names a screen, a control, a page that this item and its waits did not build — is a fault in the aim and not in the work: the item can still pass on its definition of done, no evidence is written for that criterion, and the aim is a finding for the write-up unless one already says so.
3. **Hold the code to the module.** What the module's Contracts section says at signature level, the code answers as written; a departure the code needed is a finding, never a quiet difference.
4. **Re-run the closed criteria the look back named** — the `criteria` rows with `closure: closed`. One that no longer holds is a finding marked as blocking: a closure that lapsed in the code and not in the graph is the one regression nothing else will show.
5. **If a part of the definition of done cannot be made to hold** — the specification is wrong about something, the work depends on what is not there — stop comparing. The item is unfinished, the reason is a finding for the write-up, and whether it is blocking the work is yours to judge and mark; nothing computed reads the mark.

Only an item that passed this comparison is reported finished, and only that item gets a completion report: the report's claim rests on the comparison, not on the sense that the work went well. Under `--auto` the comparison runs the same; what it finds is written, never asked about.

## When something stops you

| What happened | Normally | Under `--auto` |
|---|---|---|
| you found something that stops this item | stop the item, tell the user what and why, and settle together whether to switch to another item or fold the turn | stop the item, keep it as a finding to write up, and carry on with the rest |
| you need a judgment that is not yours to make | ask, in options | do not decide it — stop the item, keep the reason, and carry on with the rest |

Every item stopping is still a turn: what is unfinished and why is a report.

## Writing the turn up

One journal, a work log per item, and under those only what is true:

- **The journal's first body section holds the words that opened this turn, copied exactly.** Not summarised, not tidied, not translated. When a command opened the turn with nobody speaking, that command line is what was said.
- **Each work log opens on the approach you took** — the shape of the implementation, what you leaned on, what you decided on the way — in enough words that somebody could reconstruct it, and not the procedure in full; the narrative and the outcome follow it.
- **A completion report only for a work item that passed the self-check**, claiming that one work item.
- **One evidence per criterion you judge closable**, claiming that criterion. Never two criteria in one evidence.
- **A finding only past the threshold in `shall-authoring` §6, "A finding needs a reader"** — that page is where the two conditions live, and this one does not restate them. A finding made during the turn is recorded by the log that made it.
- **A criterion whose aims are spent is a finding, once.** The status says `aims: spent` when every work item aiming at a criterion is done and it is still open; the plan has no item left that can judge it, and the answer is a person's, through `/shall:raise` and `/shall:plan`. Never a log addressing a done item so that evidence can be filed under it — and no second finding when one already says so.
- **Commits are a list of shas in the work log's own frontmatter**, in the order they were made. There is no node for a commit.

Adding evidence to a criterion a person has already closed, or a report to a work item already called done, reopens it — `shall-authoring` §7 is the rule and it says to ask first.

## The two overlays

`--auto` removes the two stops and nothing else. You pick under the same rules, alone, and say in the journal what you took, why, and how you meant to approach it; a question you would have asked becomes a stopped item with its reason kept; the self-check runs the same; the record is still written and still checked. End with a summary: how many items finished, how many did not and why, how many nodes you wrote, and that the Review Queue is where it is read — approved, or rejected with a question.

`--dry` replaces the doing and the record with a prediction. Its part file has the whole of it; the one rule from up here is that it writes nothing anywhere.

Each part file says what it does under `--auto`. The two flags never combine, and the command has already refused that pair before you get here.

## Blocking is a word you write, not a lock

A finding may carry a mark saying it is blocking the work that found it. **Nothing computed reads that mark** — no gate consults it, no queue orders by it, no work item is blocked or freed by one. It is your judgment, recorded so the next person or session sees it, and everything that happens because of one happens in this process: you stop the item, you say so, and the two of you decide. Do not tell a user that Shall will stop anything. The self-check is where that judgment is made — an item whose definition of done cannot be made to hold is the case the mark was written for.

## What arrives in the queue

- **One Work report card per journal**, holding its logs, what they submitted and what they recorded. Accepting it approves the whole subtree in one write.
- **One Spec approval card for each piece of specification a Fix Spec item edited**, rooted at the topmost changed node.
- **A Finding card of its own never comes from this process.** A finding written here belongs to the log that found it and is read inside that report; a finding standing alone is what `/shall:raise` leaves behind.
- **Closure cards come later, if at all.** A criterion or a work item is only asked about once the claims on it are approved, so nothing you do this turn puts one in the queue today.

Say "a card is waiting" and where — never "approve the card" when there is more than one, because a person told to look for one card stops after the first.

## What you never do

- Open `.shall/ledger/` — to write in it, or to read a colour out of it. It is Shall's own book, and the Activity Feed under it is too: the one line this process leaves there is asked for through `shall log`, the daemon holds the pen, and you never read it back.
- Remove a spec file, by any means. A node goes by a deletion proposal a person judges — `shall-authoring` §5.
- Approve, accept or close anything. There is no command for it and there never will be: a judgment is a person's, made in the browser.
- Edit an execution record somebody has already approved.
- Write a completion report on an item the self-check did not pass. Partial progress is a narrative.
- Write a `Decision`. It is a person's judgment; `/shall:raise` is where one is dictated. A change to the specification that this turn's work argues for is a finding, and the decision comes after.
- Call `/shall:raise` from inside the cycle. What you found goes in the record.
- Invent a frontmatter key or a body field. The starting file and the files already there are the format.
- Run `shall` with no arguments. It starts the daemon and holds the terminal until it is killed, and you need the terminal to keep talking. Tell the user to run it; do not run it yourself.
- Wait for or poll the queue after the record is written.

## The parts

Read a part's file when you enter that part, and not before.

| Part | What it does | Read |
|---|---|---|
| survey | what needs doing, in five readings, writing nothing | [references/todo.md](references/todo.md) |
| look back | the module's past and the recent turns, read before stop 1, writing nothing | [references/lookback.md](references/lookback.md) |
| develop | the handover, the stretch outside Shall, and the self-check on the way back | [references/develop.md](references/develop.md) |
| record | the turn written up, from notes or from git | [references/report.md](references/report.md) |
| forecast | `--dry`: the turn predicted and nothing written | [references/forecast.md](references/forecast.md) |

**Which entry and which overlay are settled before this skill runs.** The command that loaded you knows whether this is the whole cycle, the survey alone or the write-up alone, and whether a flag is on. Take what you were handed; do not re-derive it.

## The end

- **The cycle, and the write-up alone**: name the journal and its logs, say everything written is yellow, say a Work report card is waiting (and a Spec approval card for each spec file this turn edited), and say that running `shall` with no arguments opens the queue — say it, do not run it. For each item reported finished, say what its closing would let start — the look back's `unblocks` — so the person knows what their judgment opens. The record's procedure has already logged the turn to the Activity Feed — once, and only there; if that log failed, the one line saying so belongs here, and nothing else changes. Then stop. You are not waiting for the review.
- **`--auto`**: the same, with the summary above.
- **`--dry`**: the forecast's own closing line, and nothing written — and nothing logged: a forecast is not a turn, and the feed records turns.
- **The survey**: the five readings and at most one line of suggestion. Nothing is logged here either; a reading is not a doing.

A change to the specification this turn argued for comes back through `/shall:raise <question>` — not through this process.
