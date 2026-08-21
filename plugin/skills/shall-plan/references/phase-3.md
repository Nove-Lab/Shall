# Phase 3 — The work

The spine is [`../SKILL.md`](../SKILL.md), the `shall-plan` skill itself: its two-stage approval and its question rules govern this phase, and every mention of the spine below points there.

## Purpose

Cut the designed modules into work a person can pick up: `ImplementationTask` nodes under the modules they belong to, with what waits on what, and with the criterion each one closes.

## What it needs from above

Every module and contract green in `shall status --json`, and every criterion in scope green too. A task's readiness is computed over its whole upward chain — its modules, the responsibility above them, the requirements and criteria beside it — so a yellow criterion anywhere in that chain is a task that will sit blocked however well it is written.

**Under `--auto` this line splits in two.** The modules and contracts above are this run's own, written and agreed in the terminal and not yet judged — that is the flag working, and nothing here is waiting on them. The criteria are the specification's, and they are green or the command never handed over. So the tasks you write here are correct and **blocked**, every one of them, until the run's one approval lands: see the gate below.

In revision mode, clear Fix Spec first, and narrow to the tasks the direction moves.

## Every task has a module

`ModuleDesign —ALLOCATES→ ImplementationTask`, written in the **module's** file.

And here is the one thing in this plane nothing will tell you about. A task is anchored by that line **or** by its own `TARGETS` line — an OR, not an AND — so a task that aims at a criterion and belongs to no module is a **whole node**: `shall check` says nothing, no door refuses it, and the board will offer it to somebody the moment its chain goes green. It is still wrong. Work with no design behind it is a backlog somebody stored, not a plan, and nobody can say which module's code it is meant to change.

In the queue it shows up as **a card of its own carrying one node** — being yellow and topmost, it roots a bundle nothing else is in. If one of those appears, the module's line is what is missing.

## When work spans modules

Ask first what it really spans. If what the work has in common is not a task but a **structure** — a shared bus, the build and its tooling, the scaffolding every module sits on — then a module is missing: a purely technical one whose hidden decision is exactly that structure. Go back to [phase 1](./phase-1.md), erect it, and hang the work off it with one parent. **Work that seems to span nearly every module is always this signal**, never a genuine spanning task.

Work that genuinely spans — integration, the wiring between two modules — takes **all** of them as parents, and not one chosen arbitrarily. Readiness is computed over the union of every parent's chain, so a spanning task cannot start before all the specifications it touches are agreed. The order takes care of itself; there is nothing to sequence by hand.

## Aiming

`ImplementationTask —TARGETS→ AcceptanceCriterion`, written in the **task's own** file — because planning work must not touch a criterion's file and put somebody's settled judgment back in the queue.

**Zero or one, never two.** `shall check` reports a task with two aims as a hole to fix, and the reason is arithmetic: a person closes a task over the completion reports claiming it, so a task pointing at two criteria closes neither on its own, and coverage counted over it counts one turn of work twice.

The other direction is one-to-many: several tasks may share a criterion between them. And the coverage that has to hold at the end runs that way — **every criterion in scope is aimed at by at least one task**, scenario-attached and requirement-attached alike. A criterion nothing aims at is a plan that is not finished.

A task aiming at nothing is allowed — preparation, internal tidying — with one consequence to say out loud: its completion cannot be read off a criterion closing. It is done when a person closes the completion reports claiming it, and evidence cannot be filed under it at all, because evidence is shown against a criterion and this task names none.

## No order is stored

Write the precedences as `DEPENDS_ON` in the waiting task's own file, and nothing else. What can be started, what can run alongside what, and what stands first are all computed from those lines by the board. Do not invent classifications — "foundation work", "phase A" — and do not write a sequence anywhere: a task many others wait on stands first in the graph without being told to.

`DEPENDS_ON` must not come back round to where it started. A loop is red under every task on it, because no task on a loop can ever be called ready — each is waiting on something waiting on it.

## Steps

1. **Cover both directions**: every module gets ≥1 task, and every task gets ≥1 module.
2. **For anything that spans, ask whether it is a structure**, and go back to [phase 1](./phase-1.md) if it is.
3. **Give a genuinely spanning task all its parents.**
4. **Hold every task to four tests.**
   - **Independent** — as few dependencies as the work allows, the necessary ones written as `DEPENDS_ON`, and no loop.
   - **Method-free** — what is finished when it is done, never how, and never which files. If the direction explicitly asked for paths, confirm it once with the `Paths?` question below, record them in the task's own body, and say in the terminal explanation that the level rule was relaxed on request.
   - **Traceable** — zero or one criterion aimed at.
   - **Sized** — finishable in one turn of work. Bigger than that, split it. Do not go smaller than that: chopping finer only lengthens the chain of things waiting on each other.
   - **Stated as work** — a task names something to be done, not something that exists. What the reader has to be able to see in it is the act somebody performs; a noun phrase naming a part of the design is that part's name, and the module already has one. Name a task after its module and the board hands a person a list of what the project contains instead of a list of what they can pick up.
   - **Written out** — the starting file suggests seven sections for a reason: what is finished, what it is for, what it is not, how far it reaches, what it leaves behind, how a verifier agrees it is done, and what could go wrong. Somebody who was not in this conversation picks the task up off the board and has only this file. Give each section what it asks for.
5. **Store no order and no labels.**
6. **Close the coverage.** Find every criterion in scope that no task aims at, and derive the task that will close it — the walkthroughs say which module it belongs to.
7. Close with the spine's two-stage approval.
8. **Declare the plan finished**, and name the tasks the board says can be started now.

## The questions

Ask through AskUserQuestion under the spine's rules. What is worth asking here:

| When | Ask | Options | Header |
|---|---|---|---|
| work touches several modules | is this one job across them, or a piece of shared machinery? | one job, allocated to all of them / machinery, which is a module we have not drawn | `Spanning` |
| a task could close either of two criteria | which criterion does finishing this close? | the candidate criteria / neither — it is preparation | `Aim` |
| a task will not fit one turn of work | where does it split? | 2–4 splits | `Split` |
| an order is implied but not obvious | does this really have to wait for that? | yes, it cannot start until then / no, they are independent | `Waits?` |
| the direction asks for file paths | should the tasks name paths? | no — a path is found while working `(Recommended)` / yes, name them | `Paths?` |

An ambiguity a sensible default carries is not asked about — but **a task may not assume anything**. `ASSUMES` runs from a module alone. Hang the default on the module the task belongs to, or ask.

## Authoring mechanics

**This section runs after the terminal yes.** Everything above it is drafted in the conversation; nothing reaches disk until the person has agreed to the whole set.

Follow `shall-authoring` for the file itself. What is this phase's: **write the task first**, so its id exists, **then open each parent module and add the line that allocates it**.

| You write | Its anchor line goes in | Written as | Its own file then gains |
|---|---|---|---|
| `ImplementationTask` | each parent module's file | `ALLOCATES` → the task | `DEPENDS_ON` → the tasks it waits on, `TARGETS` → the one criterion it closes, `MENTIONS` |

```yaml
# .shall/spec/plan/ImplementationTask/IT-0007.md — the task, waiting on one and aiming at one
edges:
  - type: DEPENDS_ON
    to: IT-0004
  - type: TARGETS
    to: AC-0031
```

Both of those are the task's own lines, and that is the point: writing them touches neither the criterion's file nor the other task's, so nobody's approval moves because work got planned.

A spanning task gets its `ALLOCATES` line in **each** parent module's file. Anchoring edits the parent, so every module you touch goes yellow again.

## The gate

Close with the spine's two-stage approval. Expect **one card per module that gained a task line**. A task that waits on another module's task pulls that one in as a shared member; the criterion it aims at does not come along, because the walk does not follow `TARGETS` forward.

Under `--auto` the card lines below belong to the run's one approval and not to this phase's close; the spine says when they are checked. Everything else here is checked now, as written.

| The line | What proves it |
|---|---|
| Nothing is orphaned and no id answers to nothing | `shall check --scope .shall/spec/plan` — gaps exit 1 |
| No task waits on itself through others | `shall check` — a loop is red under every task on it |
| No task aims at two criteria | `shall check` — it names both and says which line to remove |
| Every module has ≥1 task | `shall status --json` — every `ModuleDesign`'s relations include an `ALLOCATES` |
| Every task belongs to ≥1 module | `shall status --json`, scanning every module's `ALLOCATES` for it. **`shall check` does not file this** — its own `TARGETS` anchors it, so a dropped task is a whole node nothing complains about, and it arrives as a card of one |
| Every criterion in scope is aimed at | `shall status --json`, joining the criteria against the tasks' `TARGETS`. The check does not file this either |
| No task names a path, a file, a class or a function | you read them — and if the user asked for paths, you said so in the terminal explanation |
| Every task is one turn of work | you read them |
| Every task reads as work to be done, not as a part that exists | you read them — no command reads a sentence |
| Every task says enough that somebody who was not here could pick it up | you read them |
| Something can be started | `shall board --json` — the Implement half is not empty. **Under `--auto` this one is read after the run's approval and not before**: readiness runs over a task's whole chain, and until then that chain is this run's own unjudged work |
| Every card from this phase is green | `shall status --json` after the person says they are done |

## When the gate fails

| What happened | Where to go |
|---|---|
| work spans nearly every module | [phase 1](./phase-1.md) — a module is missing, and this is what its absence looks like |
| a task belongs to no module | write the module's line; if there is no module it belongs to, [phase 1](./phase-1.md) |
| a criterion nothing aims at | step 6 — derive the task that closes it |
| a criterion nobody could judge | `/shall:specify` — the criterion is the problem, and it is a person's to fix |
| a task that will not fit one turn | step 4, and split it |
| a task that names a part of the design rather than the work | step 4 — say the act, and check the module is not simply being named twice |
| the board is empty after approval | step 4's first test was broken: something every task waits on is not agreed, or the tasks wait on each other in a chain with no beginning. Do not explain it away — the board is right. **Before** the approval, under `--auto`, an empty board is the right answer and not this row |
| a node red with a rejection | read the rationale whole from `shall status --json` and revise that file; it lapses when the content changes |
