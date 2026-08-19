---
name: shall-plan
description: Carries the Shall /plan process — the phase-gated design pass that turns an approved specification into a project's plan plane: module designs and the decisions they hide, the contracts between them, and the implementation tasks the board hands out, one approved phase at a time. Loaded by the /shall:plan command.
allowed-tools: Bash(shall:*)
user-invocable: false
---

# Shall /plan

**This page is the spine.** The three phase files hang off it: each carries only what is particular to its own layer and takes the rest from here. The two-stage approval and the question rules below govern every phase, including a phase whose file says nothing about them.

## What this is

A design pass that fills the plan plane, in three phases:

module designs → the contracts between them → the work, cut into tasks.

You run **one phase at a time**, and a phase does not open until the phase above it has been approved by a person in the browser. You never run two phases in one pass and never write a lower layer because you happen to be there already.

The order is not a convention. Each phase's nodes are held to the graph by the phase above: an `Interface` by the `ModuleDesign` that `EXPOSES` or `CONSUMES` it, an `ImplementationTask` by the `ModuleDesign` that `ALLOCATES` it. Write downward before the anchor exists and you have written orphans, and an orphan is red.

**This plane is written on top of a specification a person has approved, and the command has already checked that.** It read the colour of every node above the responsibilities this direction touches and refused to hand over if any of them was unread. So the specification is settled ground here — and the moment this process finds a gap in it, that is not a failure of either document but the ordinary way a specification gets precise: go through `/shall:specify`, and come back to the step you left.

## Authoring is delegated

Every file you write follows the **`shall-authoring`** skill. Load it before you write the first file and follow it for the path, the id, the frontmatter and the shape of the body.

Nothing in this skill or in its phase files lists a type's fields, its body headings, or the choices a heading offers. `shall add-spec-node --type <Type>` writes a starting file whose commented header carries that vocabulary, and that starting file is the only copy of it. Keep the sections it suggests or reshape them — nothing parses the body.

## The common rules

**Ask in options.** Questions go through AskUserQuestion: at most four per round, 2–4 options each (a free-text "Other" is added for you), the option you recommend first with `(Recommended)` suffixed to its label, header label 12 characters or fewer. A question you could answer correctly yourself is not a question.

**A default becomes an Assumption, not a question.** Ambiguity a sensible default can carry is recorded as an Assumption node hanging off the node that assumes it. In this plane `ASSUMES` runs from **`ModuleDesign` alone** — no contract and no task may assume anything. So a default about a contract or a task is hung on the module that owns it, and a default with no module to own it is asked about instead, because the alternative is an orphan.

**Everything else is settled inside the phase.** A phase never closes over an open point. If the person defers, narrow the scope until a decision is possible and ask again.

**A change to an approved node is a revision.** Edit that node's file. Do not write a second node saying the newer thing; the old one stays green and the graph then holds two answers.

Five more are this plane's own:

**Read what the project already says, before the first boundary is drawn.** Its readme, a contributing guide, anything under a docs folder, a design record, the rules file it loads into every session. What you find sorts three ways, and none of the three is "note it and move on": a norm that genuinely **binds** is promoted to a `Constraint` through `/shall:specify` in revision mode, in this session, and you come back; a **convention** of arrangement or naming is followed, and the node whose design followed it names the document's path in its own body; a **conflict** with the user's direction is put to the user as an option question and never settled quietly in either direction. The reason a binding norm cannot stay a reference: an outside document can be revised without anything in the graph turning a colour, so a plan grounded in one is grounded in a dependency nothing tracks.

**Say what your grounds were, at the moment of approval.** Where an outside document or a piece of investigation actually decided something, the terminal explanation of that phase says **which decision followed which grounds**, naming the source. The line in the node's body is for tracing it back afterwards; this is so that nobody approves a decision without having seen what produced it.

**Modules and components, and no further.** Classes, functions, file layouts and paths are not written in this plane — they are what the work turns up while it is being done, and a plan naming them is wrong before the first turn of work ends. One exception, and it is the user's: if the direction asks for paths in so many words, confirm it once in phase 3, record them in the task's own body, and say in the terminal explanation that the level rule was relaxed on request.

**Nothing is planned that the specification does not ask for.** Every task belongs to a module. There is no closing phase collecting cross-cutting chores, no list parked for later, and no task standing on its own. A verification scenario is an acceptance criterion's job, and an end-to-end proof is evidence the execution plane records — neither is a task you invent here.

**A gap in the specification is the normal path, not an error.** Planning is where a missing responsibility or an unjudgeable criterion is discovered, because planning is the first time anybody reads the specification closely enough to build from it. Take it to `/shall:specify` in revision mode, let it be approved, and resume at the step you left.

## The two-stage approval

Follow this literally at the close of every phase.

1. **Explain the whole phase output in the terminal** — every node you mean to write, in plain sentences, and the relations tying them together — and get a yes. Everything up to that yes is a draft you hold in the conversation. The phase files are written as orders ("assign, writing `IS_REALIZED_BY` in the responsibility") and they mean it, but nothing reaches disk before this step passes: a no is then a change to a draft, not an edit to nodes a person is already judging in the queue. On a no, take the objection back into the phase and repeat.
2. **Write the files and anchor them.** The anchoring relation is written in the file of the node it leaves, so anchoring a new child means editing the parent, and that parent goes yellow again and comes back for review. That is the graph asking whether the parent still says the right thing now that something hangs off it.
3. **Run `shall check`** (`--scope <path>` when you are working inside a subtree — it is a path filter, naming a file, a type folder, a band folder or a spec-relative prefix, and it never follows a relation). It prints a count line, then `file — sentence` per finding. Fix and re-run until it exits 0. A file that will not read is not in the graph at all.
4. **Tell the person that one or more Spec approval cards are waiting** in the Review Queue, and tell them how to get there: running `shall` with no arguments opens the app in a browser. Say that sentence to them and do not run it yourself — it starts the daemon and holds the terminal until it is killed, and you need the terminal to keep talking to them. Say you will wait until they tell you they are done. Then stop. Do not poll `shall status`, do not guess that they approved, do not open the next phase, do not write the next phase's files ahead of time.
5. **When they come back**, run `shall status --json` and read the colour of every id this phase wrote or changed.
6. **If any id is still yellow**, nobody has judged it yet. Name those ids to the person, say they are still in the queue, and go back to step 4 and wait again. This is the ordinary case, not an error: a person working through several cards approves a few and comes back before the rest. **A phase is never closed on a partial pass** — count it closed and you open the next phase on nodes nobody has agreed to. Report what is outstanding once and then wait: do not raise it again unprompted, and do not re-explain a card that is already green.
7. **If any id is red with a standing rejection**, read the rationale — `shall status` gives it whole, and it is the work order. Revise that node's file, tell the person it is back in the queue, and return to step 4.
8. **When every id from this phase is green**, the phase is closed. Open the next one.

**Phase 1 asks for two terminal yeses and writes once.** Its first is on the decomposition alone — the module list, the boundaries, what each one hides — and nothing goes to disk on it, because a boundary error caught in the conversation costs a conversation and caught after the design costs the design. The second is step 1 above, on the finished modules, and step 2 follows it. A module reaches the queue once, complete, and is never asked for twice.

Why revising is the whole repair: a rejection stands against the content it was written against, so **the moment the file's content changes the rejection lapses by arithmetic** and the node is yellow and back in the queue. You never ask anyone to withdraw a rejection, and you never delete a rejected node to clear it.

## Why the card count varies

The queue cuts a bundle at each topmost yellow node and walks **down every outgoing spec relation** from it. A phase therefore arrives as **several cards, not one**:

| Phase | What arrives |
|---|---|
| 1 | one card per **responsibility** that gained a module — `IS_REALIZED_BY` is written in the responsibility's file, so the responsibility is the topmost yellow node and the module rides inside its card. A module realising two responsibilities appears in both, marked as shared |
| 2 | one per module that gained a contract line, carrying the interfaces beneath it and the schemas those interfaces carry |
| 3 | one per module that gained a task line. A task that waits on another module's task pulls that one in as a shared member; the criterion it aims at does **not** come along, because the walk does not follow a task's `TARGETS` forward |

So say "one or more cards are waiting". Never "approve the card" — a person told to look for one card stops after the first and the phase never goes green.

Two corrections to the count, both worth predicting rather than discovering:

- **A task no module allocates arrives as a card of its own, holding one node.** Its own `TARGETS` line anchors it, so it is a whole node and it is yellow, and being the topmost yellow node it roots a bundle. That lone card is what a dropped task looks like in the queue — if one turns up, the module's `ALLOCATES` line is missing.
- **A module nothing anchors has no card at all.** It is red as an orphan, and a red the grammar found is outside the queue: `shall check` and the board's Fix Spec half are the only places it is said.

## The canon, for this plane

Every relation this process uses, and the file each one is written in.

| The process says | The canon has | Written in |
|---|---|---|
| a responsibility gains a module | `SystemResponsibility —IS_REALIZED_BY→ ModuleDesign` | the responsibility's file |
| a module publishes a contract | `ModuleDesign —EXPOSES→ Interface` | the module's file |
| a module calls a contract | `ModuleDesign —CONSUMES→ Interface` | the calling module's file |
| a contract carries data | `Interface —CARRIES→ DataSchema` | the interface's file |
| a schema comes from a concept | `DataSchema —REPRESENTS→ DomainEntity` | the schema's file |
| a module is given a piece of work | `ModuleDesign —ALLOCATES→ ImplementationTask` | the module's file |
| a task waits on another | `ImplementationTask —DEPENDS_ON→ ImplementationTask` | the **waiting** task's file |
| a task aims at a criterion | `ImplementationTask —TARGETS→ AcceptanceCriterion` | the **task's** file |
| a default recorded as an assumption | `ModuleDesign —ASSUMES→ Assumption` — in this process from a module and nothing else | the module's file |
| a term used in prose | `MENTIONS → Term` | the mentioning node's file |
| a module depending on another module | **nothing — no relation joins two modules** | — |
| a module answering to a requirement or a constraint | **nothing — no relation joins them either** | — |

Three consequences worth having in hand:

- **A relation lives in the file of the node it leaves**, so anchoring a child edits the parent. The two exceptions are a task's own `DEPENDS_ON` and `TARGETS`, which run upward on purpose: planning work must not touch a criterion's file, because that would turn a green criterion yellow and put somebody's settled judgement back in the queue.
- **A module's dependency can only be said as a contract.** There is no line between two modules, so "A depends on B" is written as A consuming what B exposes — and a dependency you cannot name a contract for is a dependency reaching past the boundary into B's internals, which is the thing the boundary was drawn to prevent.
- **The drivers leave no trace.** The non-functional requirements and constraints that decided a boundary are read and never recorded, which is exactly why the grounds duty exists. A module whose only driver is a constraint has nothing to hang off either: go to `/shall:specify` and find the responsibility nobody wrote, and never invent one to hang a module on.

`Decision —AFFECTS→` and `Finding —ESCALATES→` reach into this plane from elsewhere. This process writes neither. Anything absent from this table, do not invent: `shall check` refuses a relation the canon does not allow, and the **?** button beside the Spec plane's view tabs draws the whole canon if the person wants to look.

## Fix Spec comes first

At the start of every phase, and every time you resume after waiting on the queue, run `shall board --json`.

Anything in **Fix Spec** is somebody's turn right now and that somebody is you. Clear it before new work: a person's rejection first — its rationale is given to you whole because it is a work order — then the seams the grammar found, then the ids nothing answers to, then the files that would not read at all.

New nodes written on top of a red graph bury the red and hand the person a card they cannot judge.

## The phases

Read a phase's file when you enter that phase, and not before.

| Phase | What it fills | Read |
|---|---|---|
| 1 | Module designs — which modules there are, what each is answerable for, what decision each one hides, and how it is built inside | [references/phase-1.md](references/phase-1.md) |
| 2 | Contracts — the obligations modules owe each other at their boundaries, and the shape of the data that crosses | [references/phase-2.md](references/phase-2.md) |
| 3 | The work — implementation tasks under their modules, what waits on what, and which criterion each one closes | [references/phase-3.md](references/phase-3.md) |

**Where to enter is settled before this skill runs.** `commands/plan.md` step 2 holds the one table of which direction enters at which phase, the rule for a tie, and revision mode's standing rules. Take the phase you were handed; do not restate that table here and do not re-derive it, because two copies of a dispatch rule drift and the one an agent reads is then a coin toss.

What the spine adds to it: a new run starts at Phase 1 and runs the phases in order; a revision runs the phase it entered at **and every phase below it**, because an upper-layer change re-cuts what hangs under it; Phase 2 may pass on an empty set when every module in scope is internal, and an empty set is owed no approval; Phase 3 runs last in both.

## The end

Phase 3 closes `/plan`. Check the final gate first — every line is answerable from the CLI, and you compute none of them yourself:

| Gate | How you answer it |
|---|---|
| Every criterion in scope is aimed at by some task | `shall status --json` — join each criterion against the `TARGETS` the tasks write. `shall check` does not file this: a criterion nobody plans to close is legal in the graph and unfinished in the plan |
| Every task belongs to a module | `shall status --json` — scan every module's `ALLOCATES`. **`shall check` does not file this either**: the task's own `TARGETS` anchors it, so a dropped task is a whole node nothing complains about |
| Every module has at least one task | `shall status --json` — every `ModuleDesign`'s relations include an `ALLOCATES` |
| Nothing is red | `shall check` — exits 1 on a hole, on a loop, and on a task with two aims |
| Something can actually be started | `shall board --json` — the Implement half is not empty |

Then declare it: tell the person `/plan` is finished, the plan plane holds together, and name the tasks the board says can be started now. **If a task you named in the terminal is not on that board, do not explain it away** — something in its chain has not been agreed, and the board is right.

Changes to the plan after that come back through `/shall:plan <request>`, which enters in revision mode and runs only the affected layer and below.
