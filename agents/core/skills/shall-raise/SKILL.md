---
name: shall-raise
description: Carries the Shall /raise process — what an agent does with a question about a project: explore the specification and the code around it without writing anything, report what is actually there, let the person form a judgment in conversation, and land it as a decision they dictated, a finding, both, or nothing at all. Loaded by the /shall:raise command.
tools: shall-cli
process: true
---

# Shall /raise

**This page is the process.** [`references/landing.md`](references/landing.md) hangs off it and carries only what happens after the judgment is settled — the files, their order, and the check.

## What this is

A door for somebody who does not know what to do yet. "Something about the payment side seems off." "Should we look at this?" "Why is it like that?" — a question, not a request.

That is the whole difference from the other two doors. `/shall:specify` and `/shall:plan` are for somebody who knows what they want and needs it written down properly. This is for somebody who has noticed something and wants to find out whether it matters. It can be called at any time and has nothing to do with the work cycle.

Four steps — explore, diagnose, talk, land — and four ways it ends. **One of the four is "nothing was wrong", and that is a finished job, not a failed one.** A question whose answer is reassurance has been answered.

## Authoring is delegated

Anything you write at the end follows the **`shall-authoring`** skill: the path, the id, the frontmatter and the shape of the body. The language of the spec is settled there too.

Nothing here lists a type's fields or its body headings. `shall add-spec-node --type <Type>` writes a starting file whose commented header carries that vocabulary, and that file is the only copy of it.

**Nothing here names a relation either.** The shapes are said in words — the decision's lines at what it revises, and its line at the finding it answers — and their names, directions and files are in `shall-authoring/references/relations.md`.

## The common rules

{{ask-mechanics}}

**The conversation is the body of this process.** Most of what happens here happens in the terminal and stays there. What reaches Shall is what the landing writes, and nothing else.

**A decision is dictation.** You never write one because the situation seems to call for it. You write one when the user has settled both halves — that something changes, and what it changes to — and asks you to record it. Until then there is nothing to dictate.

**A finding needs a reader**, which is `shall-authoring` §6 and is not restated here. A question that turns out to be a known fact, an ordinary implementation detail, or something inside somebody's own discretion is not a finding; it is an answer, given in conversation.

**Revise, never replace, and say what you left alone.** When the landing edits nodes, it edits the files that are there — `shall-authoring` §1 and §8.

## Step 1 — explore, and write nothing

Find out what is actually there.

- `shall status --json` — the nodes the question is about, their colours, and the relations each file draws. Walk those relations yourself to whatever the question reaches.
- The findings, and whether any decision answers each: a finding is answered when some decision's own relations reach it, and unanswered when none does. Join that out of the same status.
- `shall check` — the seams the grammar found. An exit 1 here is information about the project, not a failure of this step.
- `shall board --json` — whether this is already somebody's turn.
- The files themselves, and the code: your file and search tools. `git log` over the spec folder and the code says what changed recently and when.

**Nothing is written in this step. Not a node, not a scratch file, not a note on disk.** The user asked a question; a process that started editing while working out the answer would be answering it by hand.

## Step 2 — the diagnosis

Say what you found: what is in what state, and where things disagree if they do. Name your grounds — node ids, file paths, commits — so the user can look at what you looked at.

Three honest shapes for this, and they are all fine: the specification and the code disagree; the specification does not say; nothing is wrong.

Propose no node yet.

## Step 3 — the conversation

**This is what the command is for.** The user reads the diagnosis and forms a judgment. Your part is to answer follow-up questions, look further where they point, and lay out the options when there are options.

If they lean toward changing something, get to what the change is before anything is written. "This is wrong" is not yet a decision; "this is wrong and here is what it should say instead" is. Do not decide for them, do not drift into building it, and do not start a turn of work.

## Step 4 — landing

| The conversation ended in | What you write |
|---|---|
| **(a) a revision they have settled** | the decision, dictating their judgment and their reasons, with its own lines at everything it revises — and then the minimal edits to those nodes. If the change re-cuts a layer — new modules, new use cases, work that has to be re-planned — write the decision and send them to `/shall:specify <what changed>` or `/shall:plan <direction>` for the rest. That is how a revision is meant to arrive at those processes: as a direction in words |
| **(b) a judgment they are not ready to make** | one finding, standing alone: what you saw, why it has to reach somebody or change something, and enough background that a person can decide over it later. The mark that says it is stopping work goes on only if something is actually stopped now; the ids it concerns are a hint and may be left out |
| **(c) both** | the finding and the decision, with the decision's line at the finding it answers. What was seen goes in the finding; what was decided goes in the decision |
| **(d) nothing wrong** | nothing at all. "Checked, and here is why it is fine" — a result, and the end of the command |

[`references/landing.md`](references/landing.md) has the order the files go in and the check that follows.

## No cycle

Do not offer to implement what was decided. A revised specification makes work through the board, after a person approves it — that is computed, and offering to skip it is offering to do work nobody has agreed to. This process ends at the landing.

## What arrives in the queue

- **(a)** one Spec approval card rooted at the decision, carrying what its revisions reached: a decision stands above every other type in the queue's order, so what it revised rides inside its card rather than heading one of its own.
- **(b)** one Standalone finding card.
- **(c)** both, separately. A decision answering a finding does not pull the finding onto its card — the record and the specification are judged apart.
- **(d)** nothing.

Say which cards are waiting and that running `shall` with no arguments opens the queue. Say it; do not run it — it holds the terminal until it is killed.

## What you never do

- Write anything before the landing.
- Open `.shall/ledger/`, or remove a spec file by any means. The one line a landing leaves in the Activity Feed under that folder is asked for through the daemon at the end, as `## The end` says; you never write there and never read the feed back.
- Approve, accept or close anything.
- Write a decision the user has not settled, or dress your own conclusion as theirs.
- Write a finding that has no reader.
- Edit a finding to record that somebody dealt with it. A decision answers a finding; the finding stays as it was written.
- Invent a frontmatter key or a body field.
- Start a turn of work.
- Run `shall` with no arguments.

## The end

- **(a)** the decision's id, the ids it revised and that they are yellow, and that a Spec approval card is waiting.
- **(b)** the finding's id, that it stands on its own, and that a Standalone finding card is waiting.
- **(c)** both sentences, and that they are two cards.
- **(d)** the diagnosis in one line, and that nothing was recorded.

**In (a), (b) and (c), log the landing, once, before you say those sentences:** `shall log raise_landed "<summary>" --refs <ids>`. The summary is one line saying what landed, its leading phrase in the conversation's language and its type names `shall status`'s, as it reports them: `Question landed — Decision 1`, `Question landed — Finding 1`, or `Question landed — Decision 1, Finding 1` is the shape in an English conversation, and `질문 착지 — Decision 1, Finding 1` the same line in a Korean one. The refs are the decision's id, the finding's id, and then the ids the decision revised, in that order, as ids separated by commas — what the person will want to open. One call for the landing whichever shape it took: (c) is two files and one call. **(d) logs nothing** — nothing was recorded, so there is nothing the feed should say happened; the reassurance stays in the terminal. If the call fails for any reason — the CLI does not know `log`, the daemon refused, anything at all — say so in one line ("the Activity Feed did not take this landing") and end exactly as you would have: the landing is the files and the cards, not the feed line. Do not run it twice because you are unsure the first landed, and never read the feed back.

In every case: you are not waiting for the review.

## The questions

{{Ask}} under the rules above. What is worth asking here:

| When | Ask | Options | Header |
|---|---|---|---|
| the diagnosis found a disagreement | whether it is a mistake or intended | it is wrong `(Recommended)` if the evidence says so, or it is intended and the specification should say so | Mismatch |
| they lean toward changing something | what it should say instead | the candidate wordings, the one the diagnosis supports first | Change |
| a finding is on the table | who needs to read this | whoever works next, a person deciding, nobody `(Recommended)` if it is neither | Reader |
| a finding is being written | whether anything is stopped now | no `(Recommended)`, or yes and say what | Stops work |
| the change reaches new modules or use cases | where the rest is done | through `/shall:plan` or `/shall:specify` `(Recommended)`, or edit only what is here | Re-cut |
