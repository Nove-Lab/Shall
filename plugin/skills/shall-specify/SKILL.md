---
name: shall-specify
description: Carries the Shall /specify elicitation process — the staged, phase-gated interview that fills a project's intent and domain planes with goals, actors, use cases, scenarios, terms, responsibilities, requirements, constraints and acceptance criteria, one approved phase at a time. Loaded by the /shall:specify command.
allowed-tools: Bash(shall:*)
user-invocable: false
---

# Shall /specify

**This page is the spine.** The six phase files hang off it: each carries only what is particular to its own layer and takes the rest from here. The two-stage approval and the question rules below govern every phase, including a phase whose file says nothing about them.

## What this is

A staged elicitation that fills the intent and domain planes, in six phases:

goals → actors, use cases and scenarios → the vocabulary → system responsibilities → requirements, constraints and criteria → a closing domain review.

You run **one phase at a time**, and a phase does not open until the phase above it has been approved by a person in the browser. You never run two phases in one pass and never write a lower layer because you happen to be there already.

The order is not a convention. Each phase's nodes are held to the graph by the phase above: a Scenario by the UseCase that `DETAILS` it, a SystemResponsibility by the Scenario that `DERIVES_RESPONSIBILITY` to it. Write downward before the anchor exists and you have written orphans, and an orphan is red.

## Authoring is delegated

Every file you write follows the **`shall-authoring`** skill. Load it before you write the first file and follow it for the path, the id, the frontmatter and the shape of the body. The language of the spec is settled there too: an existing spec's language is followed, and an empty spec's is asked for once when the conversation is not in English.

Nothing in this skill or in its phase files lists a type's fields, its body headings, or the choices a heading offers. `shall add-spec-node --type <Type>` writes a starting file whose commented header carries that vocabulary, and that starting file is the only copy of it. Keep the sections it suggests or reshape them — nothing parses the body.

## The common rules

**Ask in options.** Questions go through AskUserQuestion: at most four per round, 2–4 options each (a free-text "Other" is added for you), the option you recommend first with `(Recommended)` suffixed to its label, header label 12 characters or fewer. A question you could answer correctly yourself is not a question.

**A default becomes an Assumption, not a question.** Ambiguity a sensible default can carry is recorded as an Assumption node hanging off the node that assumes it. `ASSUMES` runs only from **Goal, SystemResponsibility and Requirement** in this process, so an Assumption needs one of those three present in the phase to hang off. Phases 2, 3 and 6 have no such anchor: there, resolve the point by asking, because the alternative is an orphan.

**Everything else is settled inside the phase.** A phase never closes over an open point. If the person defers, narrow the scope until a decision is possible and ask again.

**Technology is not intent.** A stack, framework, library or implementation approach the user mentions is recorded in the conversation and carried to design later — never promoted to an intent node. One exception: a norm that binds requirements is a **Constraint**, written in Phase 5.

**A change to an approved node is a revision.** Edit that node's file. Do not write a second node saying the newer thing; the old one stays green and the graph then holds two answers.

## The two-stage approval

Follow this literally at the close of every phase.

1. **Explain the whole phase output in the terminal** — every node you mean to write, in plain sentences, and the relations tying them together — and get a yes. Everything up to that yes is a draft you hold in the conversation. The phase files are written as orders ("decompose, writing `REFINES` in the parent") and they mean it, but nothing reaches disk before this step passes: a no is then a change to a draft, not an edit to nodes a person is already judging in the queue. On a no, take the objection back into the phase and repeat.
2. **Write the files and anchor them.** The anchoring relation is written in the file of the node it leaves, so anchoring a new child means editing the parent, and that parent goes yellow again and comes back for review. That is the graph asking whether the parent still says the right thing now that something hangs off it.
3. **Run `shall check`** (`--scope <path>` when you are working inside a subtree — it is a path filter, naming a file, a type folder, a band folder or a spec-relative prefix, and it never follows a relation). It prints a count line, then `file — sentence` per finding. Fix and re-run until it exits 0. A file that will not read is not in the graph at all.
4. **Tell the person that one or more Spec approval cards are waiting** in the Review Queue, and tell them how to get there: running `shall` with no arguments opens the app in a browser. Say that sentence to them and do not run it yourself — it starts the daemon and holds the terminal until it is killed, and you need the terminal to keep talking to them. Say you will wait until they tell you they are done. Then stop. Do not poll `shall status`, do not guess that they approved, do not open the next phase, do not write the next phase's files ahead of time.
5. **When they come back**, run `shall status --json` and read the color of every id this phase wrote or changed.
6. **If any id is still yellow**, nobody has judged it yet. Name those ids to the person, say they are still in the queue, and go back to step 4 and wait again. This is the ordinary case, not an error: a person working through several cards approves a few and comes back before the rest. **A phase is never closed on a partial pass** — count it closed and you open the next phase on nodes nobody has agreed to. Report what is outstanding once and then wait: do not raise it again unprompted, and do not re-explain a card that is already green.
7. **If any id is red with a standing rejection**, read the rationale — `shall status` gives it whole, and it is the work order. Revise that node's file, tell the person it is back in the queue, and return to step 4.
8. **When every id from this phase is green**, the phase is closed. Open the next one.

Why revising is the whole repair: a rejection stands against the content it was written against, so **the moment the file's content changes the rejection lapses by arithmetic** and the node is yellow and back in the queue. You never ask anyone to withdraw a rejection, and you never delete a rejected node to clear it.

## Why the card count varies

The queue cuts a bundle at each topmost yellow node and walks **down every outgoing spec relation** from it, and domain nodes are cut one at a time. A phase therefore arrives as **several cards, not one**:

| Phase | What arrives |
|---|---|
| 1 | one card per **top-level** goal — `Goal —REFINES→ Goal` is one of the relations the walk follows, so a sub-goal rides inside its parent's card instead of arriving as a card of its own |
| 2 | one per goal that gained an actor, carrying the use cases, scenarios and criteria beneath it |
| 3 | one per term and one per domain entity |
| 4 | one per scenario that gained a responsibility |
| 5 | one per responsibility that gained requirements |

So say "one or more cards are waiting". Never "approve the card" — a person told to look for one card stops after the first and the phase never goes green.

## The canon, for these two planes

The process document names four relations that do not exist. Use the middle column, always.

| The process says | The canon has | Written in |
|---|---|---|
| Goal decomposition, `REFINES` | `Goal —REFINES→ Goal`, parent to sub-goal | the parent's file |
| an actor a goal needs | `Goal —PURSUED_BY→ Actor` | the goal's file |
| `ASSIGNED_TO(Actor)` — **no such edge** | `Actor —PERFORMS→ UseCase` | the actor's file |
| `SATISFIES(Goal)` from a use case | **nothing — a use case never touches a goal** | — |
| use case detail | `UseCase —DETAILS→ Scenario` | the use case's file |
| `DERIVED_FROM(UC)` — **no such edge** | `Scenario —DERIVES_RESPONSIBILITY→ SystemResponsibility` | the scenario's file |
| `SATISFIES(SR)` — **no such edge** | `SystemResponsibility —REQUIRES→ Requirement` | the responsibility's file |
| `HAS_CRITERION(Scenario)` | `Scenario —HAS_CRITERION→ AcceptanceCriterion` | the scenario's file |
| `HAS_CRITERION(REQ)` | `Requirement —HAS_CRITERION→ AcceptanceCriterion` | the requirement's file |
| `CONSTRAINS` — **no such edge** | `Requirement —HAS_CONSTRAINT→ Constraint` | the requirement's file |
| a default recorded as an assumption | `ASSUMES → Assumption` — **in this process** from Goal, SystemResponsibility or Requirement; the canon allows other sources this process never reaches | the assuming node's file |
| a term used in prose | `MENTIONS → Term` | the mentioning node's file |
| a term that names a structure | `Term —DENOTES→ DomainEntity` | the term's file |

Two consequences the process never states, because it thought the edges were elsewhere:

- **A relation lives in the file of the node it leaves.** To anchor a child you edit the parent, and to fix an orphan you edit the parent too — never the orphan.
- **Nothing runs upward.** "Which goal does this serve" is answered by walking `Goal —PURSUED_BY→ Actor —PERFORMS→ UseCase —DETAILS→ Scenario —DERIVES_RESPONSIBILITY→ SystemResponsibility`, and coverage is checked along that chain rather than at one edge. A use case that serves no goal means a goal is missing: go back to Phase 1 rather than reaching for an edge upward.

Anything absent from this table, do not invent. `shall check` refuses a relation the canon does not allow, and the **?** button beside the Spec plane's view tabs draws the whole canon if the person wants to look.

## Fix Spec comes first

At the start of every phase, and every time you resume after waiting on the queue, run `shall board --json`.

Anything in **Fix Spec** is somebody's turn right now and that somebody is you. Clear it before new work: a person's rejection first — its rationale is given to you whole because it is a work order — then the seams the grammar found, then the ids nothing answers to, then the files that would not read at all.

New nodes written on top of a red graph bury the red and hand the person a card they cannot judge.

## The phases

Read a phase's file when you enter that phase, and not before.

| Phase | What it fills | Read |
|---|---|---|
| 1 | Goals — the ends the project is for, large ones decomposed with `REFINES` | [references/phase-1.md](references/phase-1.md) |
| 2 | Actors, use cases and scenarios — who pursues the goals, what they do with the system, the narratives that detail it, and a criterion on every scenario | [references/phase-2.md](references/phase-2.md) |
| 3 | The vocabulary — the terms the narratives are written in, and the domain entities those terms denote | [references/phase-3.md](references/phase-3.md) |
| 4 | System responsibilities — what the system must guarantee for each scenario's steps to run | [references/phase-4.md](references/phase-4.md) |
| 5 | Requirements, constraints and criteria — normative sentences under each responsibility, the bounds that bind them, a criterion on every requirement | [references/phase-5.md](references/phase-5.md) |
| 6 | Domain review — a rescan of every phase's prose for terms and entities the vocabulary is missing; cleanup only, no new intent nodes | [references/phase-6.md](references/phase-6.md) |

**Where to enter is settled before this skill runs.** `commands/specify.md` step 2 holds the one table of which request enters at which phase, the rule for a tie, and revision mode's standing rules. Take the phase you were handed; do not restate that table here and do not re-derive it, because two copies of a dispatch rule drift and the one an agent reads is then a coin toss.

What the spine adds to it: a new run starts at Phase 1 and runs the phases in order; a revision runs the phase it entered at **and every phase below it**, because an upper-layer change stales what hangs under it; Phase 6 runs last in both.

## The end

Phase 6 closes `/specify`. Check the final gate first — all three are answerable from the CLI, and you compute none of them yourself:

| Gate | How you answer it |
|---|---|
| No undefined key term | `shall check` files a gap for a `MENTIONS` pointing at an id nothing answers to; the rest is Phase 6's rescan of the prose against the terms `shall status` lists |
| Every requirement has at least one criterion | `shall status --json` — every Requirement's relations must include a `HAS_CRITERION` |
| No orphan nodes | `shall check` — a node no live anchor holds is a gap, and gaps exit 1 |

Then declare loop-ready: tell the person `/specify` is finished, the intent and domain planes hold together, and the specification is ready for the plan layer. If Phase 6 produced no additions and no revisions, skip the queue wait and close on terminal confirmation alone — an empty set is owed no approval.

Intent changes after that come back through `/shall:specify <request>`, which enters in revision mode and runs only the affected layer and below.
