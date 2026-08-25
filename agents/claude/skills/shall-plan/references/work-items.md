# Work items — the criteria

The spine is [`../SKILL.md`](../SKILL.md), the `shall-plan` skill itself. This file carries no step and no stop: it is what a work item has to be, read at the cut in [stage 1](stage-1.md) and again when the draft is checked against itself.

## What a work item is

An independent unit of work whose aim is a structure or a function that completes a module. It belongs to a module — one by rule, several only when it is the wiring between them — and it is independent: once what it `DEPENDS_ON` is done, it can be started and called finished without reference to any other work item. If you cannot say "done" of it alone, the cut is in the wrong place.

Its aim is the module's **structure** — the skeleton, the storage, the wiring — or the module's **function** — a behaviour a criterion closes. There is no field for which: the name and the scope say it.

## Hold every work item to these

- **Belongs** — one module by rule, several only for work that genuinely lies between them: integration, the wiring of both sides of a contract. Work that seems to touch nearly every module is a common module nobody has drawn — go back to the boundaries and draw it. A work item no module allocates is an orphan, and the check says so.
- **Independent** — as few waits as the work allows, the necessary ones written as `DEPENDS_ON`, and no loop.
- **Sized** — one turn of work; a functional item targets one criterion or a few. Bigger than that, split it. Smaller only lengthens the chain of waits.
- **Aimed, or not** — a functional item targets the criteria its definition of done makes judgeable, as many as it genuinely closes; a structural or maintenance item targets none, and its completion is the report a person closes.
- **Has a definition of done** — every item, targeted or not: what is built and what it does when it is done, observably — what runs, what answers when called — and never the criterion's sentence copied in. The criterion is the specification's verdict; the definition of done is the work's finish line; they are different sentences about different things, and a definition of done that re-quotes the criterion has said nothing about the work.
- **Method-free** — scope, not method. No files, no functions, no procedure. The agent who picks it up reads the code first and plans the method then; a method written here is wrong before then. The one exception is the user asking for paths in so many words — confirmed once with the `Paths?` question, recorded in the item's Notes, and said out loud in the plan.
- **Stated as work** — the name says what is done, and whether it is structure or function shows in the name. A noun phrase naming a part of the design is that part's name, and the module already has one. Name a work item after its module and the board hands a person a list of what the project contains instead of a list of what they can pick up.
- **Visible now** — declare the items you can see. A module whose later work you cannot yet see is not unfinished planning; `/shall:plan <direction>` adds the rest when they come into view.

## Aiming

`WorkItem —TARGETS→ AcceptanceCriterion`, written in the **work item's own** file — because planning work must not touch a criterion's file and put somebody's settled judgment back in the queue. None, one or several: a work item aims at as many criteria as its definition of done genuinely makes judgeable, and `shall check` says nothing about the count.

The coverage that has to hold at the end runs the other way — **every criterion in scope is aimed at by at least one work item**, scenario-attached and requirement-attached alike. A criterion nothing aims at is a plan that is not finished: derive the work item that makes it judgeable, and let the walkthroughs say which module it belongs to.

A work item aiming at nothing is allowed — structure, preparation, internal tidying — with one consequence to say out loud: its completion cannot be read off a criterion closing. It is done when a person closes the completion report claiming it, and evidence cannot be filed under it at all, because evidence is shown against a criterion and this item names none.

`TARGETS` holds nothing. A work item that targets criteria and belongs to no module is an orphan — red, named by `shall check` under the work item's file with the module's `ALLOCATES` line as the fix.

## When work spans modules

Ask first what it really spans. If what the work has in common is not a work item but a **structure** — a shared bus, the build and its tooling, the scaffolding every module sits on — then a module is missing: a purely technical one whose boundary is exactly that structure. Go back to the boundaries, erect it, and hang the work off it with one parent. **Work that seems to span nearly every module is always this signal**, never a genuine spanning item.

Work that genuinely spans — integration, the wiring between two modules — takes **all** of them as parents, and not one chosen arbitrarily. Readiness is computed over the union of every parent's chain, so a spanning item cannot start before all the specifications it touches are agreed. The order takes care of itself; there is nothing to sequence by hand.

## No order is stored

Write the precedences as `DEPENDS_ON` in the waiting work item's own file, and nothing else. What can be started, what can run alongside what, and what stands first are all computed from those lines by the board. Do not invent classifications — "foundation work", "phase A" — and do not write a sequence anywhere: a work item many others wait on stands first in the graph without being told to.

`DEPENDS_ON` must not come back round to where it started. A loop is red under every work item on it, because no item on a loop can ever be called ready — each is waiting on something waiting on it.

## The three sections, and what each is for

The starting file suggests three sections. **Scope** is the state that exists, or is different, when the work is done — briefly, and without the way there. **Definition of Done** is what can be observed of that state — what runs, what answers when called — said as the thing the work builds so that a criterion can be judged, and never as the criterion's own sentence. **Notes** is optional: the context and the risk whoever picks this up should have in hand, as a hint and not a plan. Give each what it asks for; somebody who was not in this conversation picks the item up off the board and has only this file.

## The gate

| The line | What proves it |
|---|---|
| every work item belongs to a module | the plan names the module or modules for each — and in stage 2 `shall check` files an orphan when the line is missing |
| every module has at least one work item, or the plan said its work is not visible yet | you read the cut against the module list |
| every work item has a definition of done that is not the criterion re-quoted | you read them — no command reads a sentence |
| no work item names a path, a class, a function or a procedure | you read them — and if the user asked for paths, you said so in the plan |
| every work item is one turn of work | you read them |
| every work item reads as work to be done, not as a part that exists | you read them |
| every criterion in scope is aimed at | the plan's list, joined against the criteria — and after stage 2, `shall status --json` joined against the work items' `TARGETS` |
| no work item waits on itself through others | you read the `DEPENDS_ON` chains — and after stage 2, `shall check` says so |
