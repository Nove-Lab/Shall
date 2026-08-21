---
name: shall-work
description: Carries the Shall /work process — the execution-plane cycle that surveys the board, picks a small bundle of items, leaves the development itself to the agent's own judgment, and writes the turn up as one journal with a log per item — plus its two loose parts, the read-only survey and the write-up alone. Loaded by the /shall:work, /shall:work.todo and /shall:work.report commands.
allowed-tools: Bash(shall:*)
user-invocable: false
---

# Shall /work

**This page is the spine.** The four part files hang off it: each carries only what is particular to its own stretch and takes the rest from here. The stops, the picking rules and the never-list below govern every stretch, including one whose file says nothing about them.

## What this is

One turn of work, end to end:

survey → **stop 1**, the pick → develop → **stop 2**, the write-up → the record → done.

One turn is one journal. One item is one work log. Three commands come in here — `/shall:work` runs the whole cycle, `/shall:work.todo` runs the survey alone, `/shall:work.report` runs the write-up alone — and they are the same parts assembled or loose, which is why they share one page.

**There is no phase gate in this process, and that is not an oversight.** In `/shall:specify` and `/shall:plan` a phase does not open until a person has approved the one above it, because each phase is written on top of the last. A turn of work is not: it is done in one session, written up at the end, and read afterwards. So this process never waits — it writes the record, says a card is waiting, and stops. A queue with records in it is the ordinary state of a healthy project, not a backlog.

## Authoring is delegated

Every file you write follows the **`shall-authoring`** skill. Load it before you write the first file and follow it for the path, the id, the frontmatter and the shape of the body. The language of the spec is settled there too: an existing spec's language is followed, and an empty spec's is asked for once when the conversation is not in English.

Nothing in this skill or in its part files lists a type's fields, its body headings, or the choices a heading offers. `shall add-spec-node --type <Type>` writes a starting file whose commented header carries that vocabulary, and that starting file is the only copy of it. Keep the sections it suggests or reshape them — nothing parses the body.

**Nothing here names a relation, either.** The shapes are said in words — the work log's line at the task it addressed, the report's claim at the task it finished, the evidence's claim at the criterion it satisfies — and the name of each, the direction it runs and the file it is written in are in `shall-authoring/references/relations.md` and in the header of the starting file. Two copies of a relation name drift, and the one an agent reads is then a coin toss.

## The common rules

**Ask in options.** Questions go through AskUserQuestion: at most four per round, 2–4 options each (a free-text "Other" is added for you), the option you recommend first with `(Recommended)` suffixed to its label, header label 12 characters or fewer. A question you could answer correctly yourself is not a question.

**Ask at a stop, not between them.** The two stops are where this process spends the user's attention. In the development stretch you ask only when you genuinely cannot go on, and that is a narrow door — see the part file.

**A plain exchange stays in the terminal.** What reaches Shall is nodes and nothing else. A question answered in conversation, a decision about how you did something, a thing you looked up: none of that is a node, and writing it as one is how a record stops being worth reading.

**Read what the commands answer with, never what they print.** `shall status --json` and `shall board --json` are the contract; the printed rows are for people. Never work out a colour, a readiness or what is waiting by reasoning about the graph — you will disagree with the screen, and the screen is right.

**A record is never revised.** An execution node a person has approved is what happened, and what happened does not change. A correction is a new record in a new turn, saying what was found and what is true now.

**Fix Spec is a debt, not a choice.** Whatever the board's Fix Spec half holds is somebody's turn right now and that somebody is you. It comes before new work: writing on top of a red graph buries the red and hands a person a card they cannot judge.

## The cycle and its two stops

| Stop | What you put to the user | What a "no" means |
|---|---|---|
| 1 — the pick | the ids you mean to take this turn, and one line each on why | they adjust the list; follow it and go on |
| 2 — the write-up | the record you mean to write, in full: a log per item, and each report, evidence and finding with what it points at | take the objection back into the draft and put it again |

Nothing else stops. Everything up to stop 2 is held in the conversation — no part of the record reaches disk before it passes.

## Picking the bundle

**Fix Spec first, then the ready tasks from the top of the board's own order.** The rows there have already been judged startable — a task is on that list only if its prerequisites are closed and everything above it is agreed — so do not re-check a chain or a wait. A Fix Spec row carries the rationale a person wrote, whole, because it is a work order.

**Three at most, and one is a fine answer.** The count is what this page governs and the only thing it governs about the doing: in what order you take them, and how, is yours. More than three only when the user asks for more in so many words — and then say once that three is the recommended maximum, and follow them.

The user's steering words narrow the candidates and never overrule taking Fix Spec first. If a finding nobody has answered names one of the candidates, say so at stop 1: it may change what is worth starting. That is a reason to look, not a rule that stops anything.

## The development stretch is not Shall's

**Shall does not guide how the work is done, and this skill is where that is said out loud.** Your method, your quality bar and your tools are your own best practice and this project's conventions — the rules file it loads into every session, its coding standards, how it tests and how it commits. Shall's grammar and its procedure do not enter the stretch at all. What Shall asks for is its two ends: read the specification going in, and come out holding what the record is written from.

The part file has both ends in detail.

## When something stops you

| What happened | Normally | Under `--auto` |
|---|---|---|
| you found something that stops this item | stop the item, tell the user what and why, and settle together whether to switch to another item or fold the turn | stop the item, keep it as a finding to write up, and carry on with the rest |
| you need a judgment that is not yours to make | ask, in options | do not decide it — stop the item, keep the reason, and carry on with the rest |

Every item stopping is still a turn: what is unfinished and why is a report.

## Writing the turn up

One journal, a work log per item, and under those only what is true:

- **The journal's first body section holds the words that opened this turn, copied exactly.** Not summarised, not tidied, not translated. When a command opened the turn with nobody speaking, that command line is what was said.
- **A completion report only when the item's planned work is actually finished**, claiming the one task it is about.
- **One evidence per criterion you judge closable**, claiming that criterion. Never two criteria in one evidence.
- **A finding only past the threshold in `shall-authoring` §6, "A finding needs a reader"** — that page is where the two conditions live, and this one does not restate them. A finding made during the turn is recorded by the log that made it.
- **Commits are a list of shas in the work log's own frontmatter**, in the order they were made. There is no node for a commit.

Adding evidence to a criterion a person has already closed, or a report to a task already called done, reopens it — `shall-authoring` §7 is the rule and it says to ask first.

## The two overlays

`--auto` removes the two stops and nothing else. You pick under the same rules, alone, and say in the journal what you took and why; a question you would have asked becomes a stopped item with its reason kept; the record is still written and still checked. End with a summary: how many items finished, how many did not and why, how many nodes you wrote, and that the Review Queue is where it is read — approved, or rejected with a question.

`--dry` replaces the doing and the record with a prediction. Its part file has the whole of it; the one rule from up here is that it writes nothing anywhere.

Each part file says what it does under `--auto`. The two flags never combine, and the command has already refused that pair before you get here.

## Blocking is a word you write, not a lock

A finding may carry a mark saying it is blocking the work that found it. **Nothing computed reads that mark** — no gate consults it, no queue orders by it, no task is blocked or freed by one. It is your judgment, recorded so the next person or session sees it, and everything that happens because of one happens in this process: you stop the item, you say so, and the two of you decide. Do not tell a user that Shall will stop anything.

## What arrives in the queue

- **One Work report card per journal**, holding its logs, what they submitted and what they recorded. Accepting it approves the whole subtree in one write.
- **One Spec approval card for each piece of specification a Fix Spec item edited**, rooted at the topmost changed node.
- **A Standalone finding card never comes from this process.** A finding written here belongs to the log that found it and is read inside that report; a finding standing alone is what `/shall:raise` leaves behind.
- **Closure cards come later, if at all.** A criterion or a task is only asked about once the claims on it are approved, so nothing you do this turn puts one in the queue today.

Say "a card is waiting" and where — never "approve the card" when there is more than one, because a person told to look for one card stops after the first.

## What you never do

- Write in `.shall/ledger/`, or read it to work out a colour. It is Shall's own book.
- Remove a spec file, by any means. A node goes by a deletion proposal a person judges — `shall-authoring` §5.
- Approve, accept or close anything. There is no command for it and there never will be: a judgment is a person's, made in the browser.
- Edit an execution record somebody has already approved.
- Write a `Decision`. It is a person's judgment; `/shall:raise` is where one is dictated. A change to the specification that this turn's work argues for is a finding, and the decision comes after.
- Call `/shall:raise` from inside the cycle. What you found goes in the record.
- Invent a frontmatter key or a body field. The starting file and the files already there are the format.
- Run `shall` with no arguments. It starts the daemon and holds the terminal until it is killed, and you need the terminal to keep talking. Tell the user to run it; do not run it yourself.
- Wait for or poll the queue after the record is written.

## The parts

Read a part's file when you enter that part, and not before.

| Part | What it does | Read |
|---|---|---|
| survey | what needs doing, in four readings, writing nothing | [references/todo.md](references/todo.md) |
| develop | the two ends of the stretch Shall does not guide | [references/develop.md](references/develop.md) |
| record | the turn written up, from notes or from git | [references/report.md](references/report.md) |
| forecast | `--dry`: the turn predicted and nothing written | [references/forecast.md](references/forecast.md) |

**Which entry and which overlay are settled before this skill runs.** The command that loaded you knows whether this is the whole cycle, the survey alone or the write-up alone, and whether a flag is on. Take what you were handed; do not re-derive it.

## The end

- **The cycle, and the write-up alone**: name the journal and its logs, say everything written is yellow, say a Work report card is waiting (and a Spec approval card for each spec file this turn edited), and say that running `shall` with no arguments opens the queue — say it, do not run it. Then stop. You are not waiting for the review.
- **`--auto`**: the same, with the summary above.
- **`--dry`**: the forecast's own closing line, and nothing written.
- **The survey**: the four readings and at most one line of suggestion.

A change to the specification this turn argued for comes back through `/shall:raise <question>` — not through this process.
