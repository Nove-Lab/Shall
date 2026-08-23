---
name: shall-plan
description: Carries the Shall /plan process — the two-stage design pass that turns an approved specification into a project's plan plane. Stage 1 plans the way an agent plans anything — reads the repository, scouts and proposes the stack, draws the module boundaries, harvests the contracts and cuts the work — and puts the whole plan to the user for one yes, writing nothing. Stage 2 transcribes the agreed plan into modules, interfaces, schemas, work items and the one technology decision in a single pass and hands it to the Review Queue once. --auto skips the yes in the terminal and nothing else. Loaded by the /shall:plan command.
allowed-tools: Bash(shall:*)
user-invocable: false
---

# Shall /plan

**This page is the spine.** The two stage files and the three criteria files hang off it: each carries only what is particular to its own stretch and takes the rest from here. The two stages, the agreement and the question rules below govern every file, including one that says nothing about them.

## What this is

A design pass that fills the plan plane — modules, the contracts between them, and the work cut into work items — in two stages. **The two stages are the whole run, not a thing repeated per layer.**

**Stage 1 is planning, and Shall does not govern it.** You read the repository and whatever code is already there, you scout the stack and put a technology choice to the user, you draw the module boundaries, you harvest the contracts and you cut the work — the way you would plan anything, with your own reading of the code, your own judgment and the user at your side — and you put the whole plan to the user in the terminal and get one yes. **Nothing reaches disk in stage 1.** Not a module, not a work item, not a decision: a boundary is drawn over the whole and agreed as a whole, and a plan agreed in pieces has its boundaries cut wherever the pieces happened to end.

**Stage 2 is transcription, and it is Shall's.** The agreed plan is written into the grammar — `Module`, `Interface`, `DataSchema`, `WorkItem`, and the one `Decision` this process may write — in a single pass, `shall check` is run to zero, and the cards go to the Review Queue once. Everything is yellow until a person approves it in the browser; the yes in the terminal settled what to write, never whether it stands.

The order inside stage 2 is the anchor's: a module is held by the responsibility that `IS_REALIZED_BY` it, an interface by the module that exposes or consumes it, a work item by the module that `ALLOCATES` it, the decision by what it `AFFECTS`. Stage 2 writes so that every anchor's far end exists before `shall check` runs, and that is the only ordering this process keeps.

**This plane is written on top of a specification a person has approved, and the command has already checked that.** It read the color of every node above the responsibilities this direction touches and refused to hand over if any of them was unread — **and `--auto` does not touch that gate**, because it skips this run's own yes in the terminal and never somebody else's judgment. So the specification is settled ground here — and the moment this process finds a gap in it, that is not a failure of either document but the ordinary way a specification gets precise: go through `/shall:specify`, and come back to the step you left.

## Authoring is delegated

Every file you write follows the **`shall-authoring`** skill. Load it before you write the first file and follow it for the path, the id, the frontmatter and the shape of the body. The language of the spec is settled there too: an existing spec's language is followed, and an empty spec's is asked for once when the conversation is not in English.

Nothing in this skill or in its files lists a type's fields, its body headings, or the choices a heading offers. `shall add-spec-node --type <Type>` writes a starting file whose commented header carries that vocabulary, and that starting file is the only copy of it. Keep the sections it suggests or reshape them — nothing parses the body.

## The common rules

**Ask in options.** Questions go through AskUserQuestion: at most four per round, 2–4 options each (a free-text "Other" is added for you), the option you recommend first with `(Recommended)` suffixed to its label, header label 12 characters or fewer. A question you could answer correctly yourself is not a question.

**A default becomes an Assumption, not a question.** Ambiguity a sensible default can carry is recorded as an Assumption node hanging off the node that assumes it. In this plane `ASSUMES` runs from **`Module` alone** — no contract and no work item may assume anything. So a default about a contract or a work item is hung on the module that owns it, and a default with no module to own it is asked about instead, because the alternative is an orphan.

**Everything else is settled inside the stage.** Stage 1 never closes over an open point. If the person defers, narrow the scope until a decision is possible and ask again.

**A change to an approved node is a revision.** Edit that node's file. Do not write a second node saying the newer thing; the old one stays green and the graph then holds two answers.

Six more are this plane's own:

**Read what the project already says, before the first boundary is drawn.** Its readme, a contributing guide, anything under a docs folder, a design record, the rules file it loads into every session. What you find sorts three ways, and none of the three is "note it and move on": a norm that genuinely **binds** is promoted to a `Constraint` through `/shall:specify` in revision mode, in this session, and you come back; a **convention** of arrangement or naming is followed, and the node whose design followed it names the document's path in its own body; a **conflict** with the user's direction is put to the user as an option question and never settled quietly in either direction. The reason a binding norm cannot stay a reference: an outside document can be revised without anything in the graph turning a color, so a plan grounded in one is grounded in a dependency nothing tracks.

**Say what your grounds were, at the moment of agreement.** Where an outside document or a piece of investigation actually decided something, the plan you present at the end of stage 1 says **which decision followed which grounds**, naming the source, so that nobody agrees to a decision without having seen what produced it. The node's body carries that reasoning too, and carries it in full: the terminal explanation is spoken once to the person in the room, and the body is what anybody reads a year from now when the decision is questioned. A rationale reduced to a breadcrumb because it was already said out loud is a rationale that only existed in a conversation nobody kept.

**Decisions and contracts in the spec, bodies in the repo.** That is the whole of what "code detail lives in the repository" means, and it has two halves that pull opposite ways. A module **names** its technology — runtime, language, storage, the core libraries — by the names the world uses, and writes its contracts at signature level: a name, its inputs, its outputs, its errors. localStorage is localStorage, setInterval is setInterval, a table is a table with its columns; a figure of speech standing where a technology should be is a decision somebody will have to make again, unrecorded, on the day the work starts. What a module does **not** carry is the function body, the pseudocode and the list of files — those are what a turn of work turns up, and written into a plan they are wrong before the first turn ends. A work item carries its scope, the criteria it targets, what it waits on and its definition of done, and **no method at all**: no files, no function design, no procedure — the agent who picks it up reads the code first and plans the method then. One exception, and it is the user's: if the direction asks for paths in so many words, confirm it once, record them in the work item's Notes, and say in the plan you present that the rule was relaxed on request.

**Nothing is planned that the specification does not ask for.** Every work item belongs to a module, and `shall check` now says so when one does not. There is no closing pass collecting cross-cutting chores, no list parked for later, and no work item standing on its own. A verification scenario is an acceptance criterion's job, and an end-to-end proof is evidence the execution plane records — neither is a work item you invent here.

**A gap in the specification is the normal path, not an error.** Planning is where a missing responsibility or an unjudgeable criterion is discovered, because planning is the first time anybody reads the specification closely enough to build from it. Take it to `/shall:specify` in revision mode, let it be approved, and resume at the step you left.

**Declare what is visible.** The plan does not have to cut every work item a module will ever need before it is agreed. Write the ones you can see now, and say for a module with none yet that its work is not visible yet; when more come into view, `/shall:plan <direction>` adds them in revision mode, and the module they hang off comes back to the queue because its `ALLOCATES` line moved — that is the graph asking whether the module still says the right thing, not a cost to avoid.

## Technology is decided here

The specification above this plane names no technology, on purpose: `/shall:specify` carries a stack the user mentioned into the conversation and promotes it to nothing. This is where it lands. Early in stage 1, before a boundary is drawn — **scout what the project already runs on**: its manifests and lockfiles, its build and its tests, the rules file it loads into every session, the code that is there. **Propose the stack for what this direction builds**, by the standard names and with the alternatives you weighed, and **put it to the user as an option question** — the `Stack` question in stage-1.md. Under `--auto` that question is not asked: take what the repository already runs on, or what the direction names, say which and why in the plan you write out, and go on.

A choice that holds for the whole project — the runtime, the language, the storage everybody writes to, a framework every module sits in — becomes a `Decision` in stage 2, with `AFFECTS` at every module it binds, and the modules' Technology sections refer to it rather than restating it. A choice that is one module's own — the library it alone parses with, the cache it alone keeps — is written in that module's Technology section and nowhere else.

**This is the one decision this process writes.** Every other decision is a person's, dictated through `/shall:raise`; a revision of the specification that this planning argues for is still a direction in words and a round trip through `/shall:specify`.

## The agreement

Stage 1 ends in the terminal, once. **Put the whole plan in writing** — the stack and what it binds, every module with the responsibilities it realizes and the technology it stands on, every contract, every work item with its module, the criteria it targets, what it waits on and its definition of done, and the relations tying them together, in plain sentences — **and get a yes.** Everything up to that yes is a draft you hold in the conversation; a no is a change to the draft, never to a file: take the objection back into stage 1 and present again. Present the plan once and whole. A boundary agreed before the work items were cut is a boundary the work items then have to live with, and that is the failure the single presentation exists to prevent.

So a gated run stops twice in stage 1 — the stack, early, and the plan, at the end — and neither stop is the browser's. The browser's one judgment comes after stage 2, over everything, and it is a person's and not yours to hurry.

**`--auto` removes the two stops in stage 1, and nothing else.** The exploration, the scouting, the boundaries, the cut: identical. The stack question is not asked — take what the repository runs on, or what the direction names, and say so — and the plan is not put to the user for a yes; it is still **written out in full** before stage 2 begins, because it is what the user reads afterwards to see what you decided. A question that genuinely needs the user — an ambiguity no sensible default carries — is still asked, under the common rules; a default becomes an Assumption hung on the module, as it always was. Stage 2 is unchanged, the queue receives the same cards, and the one browser wait at the end is the same wait: the flag moves nothing a person judges.

## The one browser wait

Stage 2 ends by telling the person that one or more Spec approval cards are waiting in the Review Queue, and how to get there: running `shall` with no arguments opens the app in a browser. Say that sentence; do not run it yourself — it starts the daemon and holds the terminal until it is killed, and you need the terminal to keep talking. Say you will wait until they tell you they are done. Then stop. Do not poll `shall status`, do not guess that they approved, do not start on anything else.

When they come back, run `shall status --json` and read the colour of every id this run wrote or changed. **If any id is still yellow**, nobody has judged it yet: name those ids once, say they are still in the queue, and wait again — a person working through several cards approves a few and comes back before the rest, and that is the ordinary case. **If any id is red with a standing rejection**, read the rationale — `shall status` gives it whole, and it is the work order — revise that node's file, say it is back in the queue, and wait again; the rejection lapses by arithmetic the moment the content changes, so you never ask anyone to withdraw one and never delete a rejected node to clear it. **The run is never closed on a partial pass.** It is finished when every id from this run is green, and not before; then the end.

A rejection of a module costs more than a rejection of a work item — its contracts and its work items were written on top of it — and that is the price of writing the plan in one pass rather than a layer at a time. The repair is the revision path: re-enter stage 1 on that module and what hangs off it, present again, transcribe again.

## What arrives in the queue

The queue cuts a bundle at each topmost yellow node and walks **down the order, never back up it** — an outgoing relation that points at what holds the node is left alone. Stage 2 writes everything at once, so what arrives is one wave:

- **One card per responsibility that gained a module.** `IS_REALIZED_BY` is written in the responsibility's file, so the responsibility is the topmost yellow node and the module rides inside its card, with the assumptions it hangs off, the interfaces it exposes or consumes, the schemas those carry and the work items it allocates — with that responsibility's own untouched requirements and criteria listed underneath as unchanged. A module realizing two responsibilities appears in both, marked as shared. The criteria the work items target do **not** come along: the walk does not follow `TARGETS` forward.
- **One card at the technology decision, when there is one**, and it stands above every other type, `Goal` included: every module its `AFFECTS` reaches rides inside it as well. A node two cards hold is approved once and green on both.
- **A work item alone in a card does not happen any more.** A work item no module allocates is red as an orphan, outside the queue; `shall check` and the board's Fix Spec half are where it is said, and the fix is the module's `ALLOCATES` line.
- **A module nothing anchors has no card at all** — red as an orphan, and a red the grammar found is outside the queue too.

So say "one or more cards are waiting". Never "approve the card" — a person told to look for one card stops after the first and the plan never goes green. In revision mode the same cut puts each changed node's card at the topmost yellow node above it, which may be a responsibility you did not edit.

## The canon, for this plane

Every relation this process uses, and the file each one is written in.

| The process says | The canon has | Written in |
|---|---|---|
| a responsibility gains a module | `SystemResponsibility —IS_REALIZED_BY→ Module` | the responsibility's file |
| a module publishes a contract | `Module —EXPOSES→ Interface` | the module's file |
| a module calls a contract | `Module —CONSUMES→ Interface` | the calling module's file |
| a contract carries data | `Interface —CARRIES→ DataSchema` | the interface's file |
| a schema comes from a concept | `DataSchema —REPRESENTS→ DomainEntity` | the schema's file |
| a module is given a piece of work | `Module —ALLOCATES→ WorkItem` — the one relation that holds a work item | the module's file |
| a work item waits on another | `WorkItem —DEPENDS_ON→ WorkItem` | the **waiting** work item's file |
| a work item aims at criteria | `WorkItem —TARGETS→ AcceptanceCriterion` — none, one or several | the **work item's** file |
| the stack binds a module | `Decision —AFFECTS→ Module` — the technology decision, and the one decision this process writes | the decision's file |
| a default recorded as an assumption | `Module —ASSUMES→ Assumption` — from a module and nothing else | the module's file |
| a term used in prose | `MENTIONS → Term` | the mentioning node's file |
| a module depending on another module | **nothing — no relation joins two modules** | — |
| a module answering to a requirement or a constraint | **nothing — no relation joins them either** | — |

Three consequences worth having in hand:

- **A relation lives in the file of the node it leaves**, so anchoring a child edits the parent. The two exceptions are a work item's own `DEPENDS_ON`, which joins two work items of one rank, and its own `TARGETS`, which runs upward on purpose: planning work must not touch a criterion's file, because that would turn a green criterion yellow and put somebody's settled judgment back in the queue. And `TARGETS` holds nothing: a work item that targets criteria and belongs to no module is an orphan, and the check says so.
- **A module's dependency can only be said as a contract.** There is no line between two modules, so "A depends on B" is written as A consuming what B exposes — and a dependency you cannot name a contract for is a dependency reaching past the boundary into B's internals, which is the thing the boundary was drawn to prevent.
- **The drivers leave no trace.** The non-functional requirements and constraints that decided a boundary are read and never recorded, which is exactly why the grounds duty exists. A module whose only driver is a constraint has nothing to hang off either: go to `/shall:specify` and find the responsibility nobody wrote, and never invent one to hang a module on.

A `Decision` is filed in the plan band. This process writes exactly one kind — the project-wide technology choice confirmed in stage 1, anchored by its own `AFFECTS` at the modules it binds — and no other: every other decision is a person's judgment, dictated through `/shall:raise`, and a revision this plane needs arrives the ordinary way, as a direction in words. A `Finding` starts no relation at all. Anything absent from this table, do not invent: `shall check` refuses a relation the canon does not allow, and the **?** button beside the Spec plane's view tabs draws the whole canon if the person wants to look.

## Fix Spec comes first

At the start of stage 1, at the start of stage 2, and when you resume after the browser wait, run `shall board --json`.

Anything in **Fix Spec** is somebody's turn right now and that somebody is you. Clear it before new work: a person's rejection first — its rationale is given to you whole because it is a work order — then the seams the grammar found, then the ids nothing answers to, then the files that would not read at all.

New nodes written on top of a red graph bury the red and hand the person a card they cannot judge.

## The files

Read a file when you enter the stretch it serves, and not before.

| File | What it carries | Read |
|---|---|---|
| stage 1 | the planning stage as a procedure: survey, code, stack, drivers, boundaries, contracts, the cut, the self-check of the draft, the presentation | [references/stage-1.md](references/stage-1.md) |
| modules | the criteria for a module: responsibility first, the boundary test, what each of its sections is for, the world's names | [references/modules.md](references/modules.md) — at the boundaries step |
| contracts | the criteria for interfaces and schemas, and how the module's Contracts section and the Interface node divide the work | [references/contracts.md](references/contracts.md) — at the contracts step |
| work items | the criteria for work items: what one is, the tests it passes, aiming, order, spanning work, declaring what is visible | [references/work-items.md](references/work-items.md) — at the cut |
| stage 2 | transcription: the order of writing, the mechanics, the check, the cards, the wait | [references/stage-2.md](references/stage-2.md) |

**Where to enter is settled before this skill runs.** `commands/plan.md` step 2 decides new mode or revision mode and what revision mode's stage 1 opens with. Take what you were handed; do not re-derive it. Both modes run stage 1 whole and then stage 2 whole; in revision mode stage 1 is bounded to the reach the command worked out, and stage 2 edits the files that are there, keeping their ids.

## The end

Stage 2's wait closes `/plan`. Check the final gate — every line is answerable from the CLI, and you compute none of them yourself:

| Gate | How you answer it |
|---|---|
| Every criterion in scope is targeted by some work item | `shall status --json` — join each criterion against the `TARGETS` the work items write. `shall check` does not file this: a criterion nobody plans to close is legal in the graph and unfinished in the plan |
| Every module has at least one work item, or the plan said its work is not visible yet | `shall status --json` — every `Module`'s relations include an `ALLOCATES`, or the plan you presented named that module as having no visible work yet |
| Nothing is red | `shall check` — exits 1 on a hole, on a loop, and on a work item no module allocates |
| Something can actually be started | `shall board --json` — the Implement half is not empty |

Then declare it: tell the person `/plan` is finished, the plan plane holds together, and name the work items the board says can be started now. **If a work item you named in the terminal is not on that board, do not explain it away** — something in its chain has not been agreed, and the board is right.

**The board is read after the wait, in both modes.** Readiness is computed over a work item's whole chain, and until the approval lands that chain is this run's own yellow; a board with an empty Implement half before the approval is the right answer, not a fault. So: the first three gates once `shall check` is clean, then the one browser wait, then the board and the declaration.

**The declaration is logged, once.** Right after you have declared, run `shall log plan_done "<summary>" --refs <ids>` exactly once for the whole run. The summary is one line whose leading phrase is in the conversation's language and whose type names are `shall status`'s, as it reports them: `Plan finished — Module 2, Interface 3, WorkItem 6` is the shape in an English conversation, and `플랜 완료 — Module 2, Interface 3, WorkItem 6` the same line in a Korean one — the counts are the ids this run wrote or revised, counted by type, the decision included when there is one. `--refs` is those ids, as ids separated by commas. Never log from inside a stage: the feed records finished runs. If the call fails for any reason — the CLI does not know `log`, the daemon refused, anything at all — say so in one line ("the Activity Feed did not take this run's record") and finish exactly as you would have: the feed is not part of the run and nothing depends on it. Do not run it twice because you are unsure the first landed, and never read the feed back.

**If a run breaks off before the end** — a session that runs out, a terminal that closes — nothing is lost, nothing is announced, and nothing is logged. Before the agreement, nothing is on disk and nothing is owed. After stage 2 began, what is on disk is a plan nobody has been asked about yet: either the person approves what is there, or `/shall:plan <direction>` picks it up again — the entry dispatch names what is yellow and the run carries on from where the writing stopped.

Changes to the plan after that come back through `/shall:plan <request>`, which enters in revision mode: stage 1 over the reach, stage 2 over the files.
