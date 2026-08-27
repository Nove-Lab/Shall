# The record — the turn written up

The spine is [`../SKILL.md`](../SKILL.md), the `shall-work` skill itself: its stop, its rule that a record is never revised, and its never-list govern this part, and every mention of the spine below points there.

## Purpose

Turn what happened into a journal a person accepts in one decision — one card, whole and in order, however much the turn produced.

## Two ways in

- **Inside the cycle.** The notes from the development stretch are the material. Go straight to assembling the tree.
- **On its own**, which is what `/shall:work.report` always is. The notes are gone or were never taken, so git and the specification stand in for them. Reconstruct first.

## Reconstructing from git

1. **Find where the last record stopped.** Take the newest journal in `shall status --json`, then the work logs its own relations reach, then the shas in their frontmatter; the newest of those in `git log`'s order is the moment. If none of those logs lists a sha, use the commit that added the journal's file (`git log --diff-filter=A -- <path>`). **If the project has no journal at all, ask the user for the range** — that is a question with no good default.
2. **`git log <moment>..HEAD`, with the files each commit touched — and `git status`, because staged, unstaged and untracked changes are work too**, and what left no commit is what the "Also done" question is for. Read the commits and the changes against the specification and work out which work item or requirement family each belongs to. A mapping you are not sure of is a question, never a guess: a log filed against the wrong work item is a claim about work nobody did. Once each item is named, `shall context --work-item <id> --json` and open what it names — the log's approach section is written on top of what the module already did.
3. **Look past git.** Work leaves other traces: a work item that looks finished, an open criterion with grounds to close it. Check those, and ask **once** whether anything happened that left no commit — a verification run, an investigation, a conversation that settled something. A note in the command's argument answers this in advance.
4. **Draft it**: a log per item, a completion report where the work's definition of done can be shown to hold, an evidence candidate per criterion that looks closable.
5. **Correct it with the user**, then the procedure below.

## Assembling the tree

One journal. A log per item. Under those, only what is true.

| You write | When | Its own line, in words | The line above it |
|---|---|---|---|
| the journal | always, one per turn | reaches each work log | nothing — a journal is where the record starts |
| a work log | one per item | at the work item it addressed, when it addressed one | the journal's, at the log |
| a completion report | only for a work item that passed the self-check — its definition of done observed to hold | its claim, at that one work item | the log's, at the report |
| an evidence | one per criterion you judge closable | its claim, at that one criterion | the log's, at the evidence |
| a finding | only past the threshold — `shall-authoring` §6 | none at all; a finding draws no relation | the log's, at the finding |

The names, the directions and whose file each line goes in are in `shall-authoring/references/relations.md` and in the header of the file `shall add-spec-node --type <Type>` writes. Do not carry them in your head from another project.

**The journal's first body section is the words that opened this turn, copied exactly.** Not summarised, not tidied, not translated into the language the rest of the record is in. Under `--auto` the command line that started the turn is what was said. This is the section a person reads first to know what the turn was even for, and a paraphrase of it is your reading rather than their asking.

**Each work log's first section is the approach** — the shape of what you did, what you leaned on, what you decided on the way — said so that somebody could reconstruct it, and not the procedure in full. Under `/shall:work.report` it is reconstructed from the commits like everything else, and says so.

**Commits are a list of shas in the log's own frontmatter**, in the order they were made. There is no node for a commit.

Three ways a record is refused, worth knowing before you write rather than after:

- **A claim outside its log's reach.** An evidence may claim only the criteria the work items its log addressed were targeting, and a completion report exactly one of those work items. A claim that falls outside belongs under a different log, or does not belong.
- **A log on work whose turn had not come.** A log addressing a work item that is still waiting is refused until the work item is ready, and then turns yellow by itself with nobody told. Inside the cycle this cannot happen — the board only offers ready work items. In a reconstruction it can: say so and ask.
- **A claim on something already closed.** Evidence on a closed criterion, or a report on a work item called done, reopens it and puts somebody's settled judgment back in the queue. `shall-authoring` §7 is the rule: ask first, and if the answer is yes, say plainly that the closure will have to be made again.

Partial progress is written as a narrative and no completion report. A turn that finished nothing still has a journal.

## The questions

{{Ask}} under the spine's rules. What is worth asking here:

| When | Ask | Options | Header |
|---|---|---|---|
| the project has no journal | where the range starts | since the branch began `(Recommended)`, the last few commits, a range they name | Range |
| a commit maps to no obvious item | which work item this was | the candidates, closest first | Which item |
| reconstructing, once | whether anything happened off git | nothing else `(Recommended)`, or they describe it | Also done |
| a claim would reopen something closed | whether to reopen | leave it closed `(Recommended)`, or reopen and judge the list again | Reopen |
| a log's work item is still waiting | what to do | leave the log out `(Recommended)`, or write it knowing it is refused until the work item is ready | Not ready |

## The common procedure

1. **Put the whole draft in the terminal** — the journal, each log with its item, and every report, evidence and finding with what it points at — and quote the opening words you are about to copy in. **This is stop 2.** Under `--auto` there is no stop, but the draft is still written out: it is what the user reads afterwards to see what you decided.
2. **After the yes, write the files** with `shall add-spec-node --type <Type>` under `.shall/spec/execution/`. Order matters only in that a line needs both ends to exist: the journal first so its id is real, then each log written with its own work item line in the same pass, then the journal's lines at the logs, then each claimant with its own claim, then the log's lines at them.
3. **`shall check --scope .shall/spec/execution`**, and fix anything red at once, then run it again until it exits 0. If a Fix Spec item edited files elsewhere this turn, run the check over the whole project once as well.
4. **Log the turn, once.** `shall log work_done "<summary>" --refs <ids>` — the summary is one line saying the turn is written up, its leading phrase in the conversation's language and its type names `shall status`'s, as it reports them, counted from what this turn wrote: `Turn written up — WorkLog 3, Evidence 4, CompletionReport 1` is the shape in an English conversation, and `회전 완료 — WorkLog 3, Evidence 4, CompletionReport 1` the same line in a Korean one. The refs are the journal's id first and then every other id this turn wrote — logs, reports, evidence, findings — as ids separated by commas, so a reader of the Activity Feed can open any of them; the journal goes first because it is the one a reader opens. Once per turn, after the check is clean and before anything is announced — not per log, not per item, not from the development stretch, and never twice because you are unsure the first landed. If the call fails for any reason — the CLI does not know `log`, the daemon refused, the command was not found — say so in one line in the next step ("the Activity Feed did not take this turn's record") and go on exactly as if it had succeeded: the feed is a person's news page, the record is the journal, and nothing in this turn depends on the feed. Never read the feed back.
5. **Say what is waiting and stop.** A Work report card, and a Spec approval card for each spec file this turn edited. Tell the user that running `shall` with no arguments opens the queue — say it, do not run it. Do not wait, do not poll, do not guess that they approved.

## Under `--auto`

Step 1 loses its stop and keeps its draft. Steps 2 to 5 are identical. End with the spine's summary: how many items finished, how many did not and why, how many nodes were written, and where it is read.

## The gate

| The line | What proves it |
|---|---|
| the record holds together | `shall check --scope .shall/spec/execution` exits 0 |
| the journal opens on what was asked | its first section is the user's words, unedited |
| every log says what it worked on | each one that addressed a work item names it in its own file |
| every log opens on its approach | its first section says how the work was done, reconstructibly |
| no report on an item the self-check did not pass | each completion report's item has its definition of done observed in the log |
| every claim is inside its log's reach | the check is silent about aims |
| no finding without a reader | each one passes the threshold in `shall-authoring` §6 |
| nothing settled was disturbed | no approved execution node was edited, and no closure was reopened without being asked for |
| the turn was logged, or its failure was said | the log call in step 4 returned, or the line saying it did not is in what the user was told |

## When the gate fails

| What happened | Where to go |
|---|---|
| a log reports no live anchor | the journal's line at it is missing, or its own work item line is — write whichever is true |
| a claim is refused as outside its aim | move it under the log whose work item it belongs to, or drop it |
| a log is refused as too early | the work item's turn has not come: leave the log out and say why |
| a finding has no reader | fold it into the log's narrative and delete the file you were about to keep |
| a closure came back that nobody asked to reopen | remove the claimant you added and say what happened |
