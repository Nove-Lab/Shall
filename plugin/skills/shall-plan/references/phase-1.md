# Phase 1 — Module design

The spine is [`../SKILL.md`](../SKILL.md), the `shall-plan` skill itself: its two-stage approval and its question rules govern this phase, and every mention of the spine below points there.

## Purpose

Decide which modules this system is made of and design each one: a set of `ModuleDesign` nodes, each hanging off a responsibility it realises, each naming the one decision it keeps to itself, and each carrying a design in four parts.

## What it needs from above

Everything the command walked — the responsibilities in scope, the scenarios, use cases, actors and goals above them, and the requirements, criteria and constraints beside them — green in `shall status --json`. It checked that before handing over, so nothing here re-derives it.

In revision mode, clear Fix Spec first as the spine says, and narrow the work to the modules the direction actually moves.

## Responsibility first, structure second

This is why the phase exists, and **drawing a structure and then fitting responsibilities into it is the failure it exists to catch.** Start from the set of responsibilities and ask where each one is answerable for; do not start from a diagram of parts.

| The system | Not a module | A module |
|---|---|---|
| records focus sessions and reports on them | "the input stage", "the processing stage", "the output stage" — a cut along the way data flows | "the store of recorded sessions" — a cut around the decision of how a session is kept |

A cut along input → processing → output hides nothing: every stage is exposed to every change in the shape of the data flowing through it, so a change to how a session is stored reaches all three. If a candidate module is named after a step in a sequence, you have not made a cut yet.

## What a module hides

The question every candidate must answer, in the module's own words: **what design decision does this module keep to itself, so that changing that decision changes nothing outside it?** How something is stored, which outside system is spoken to, which algorithm is used, which format is parsed — one such decision each.

If the answer is "because it is this step of the processing", that is not a hidden decision and the decomposition is wrong. If two modules would have to change together whenever one decision changes, the decision is not hidden by either of them and the boundary is in the wrong place.

## Every module hangs off a responsibility

`SystemResponsibility —IS_REALIZED_BY→ ModuleDesign`, written in the **responsibility's** file. That relation is the only thing holding a module to the graph: without one it is an orphan, it is red, and `shall check` exits 1.

**There is no relation between a module and a requirement, and none between a module and a constraint.** Non-functional requirements and constraints are drivers — they are read while the boundaries are being cut and they leave no trace in the graph. Two things follow. The reasoning that used one has to be written into the module's own rationale or it is lost, which is the whole reason for the grounds duty. And a module whose only justification is a quality requirement or a constraint has **nothing to hang off**: that means a responsibility nobody wrote, so go to `/shall:specify`, get it written and approved, and come back. Never invent a responsibility to hang a module on; the missing responsibility is the finding, and a stub buries it.

## The survey, and what it binds

Before the first boundary is drawn, read what the project already says about itself and sort it three ways — the spine's rule, and here is what each way costs. A binding norm is a round trip through `/shall:specify` in this session, because a reference to an outside document is a dependency nothing tracks: that document can be rewritten and no node in the graph turns a colour. A convention of arrangement is followed and its source path written into the body of the node that followed it. A conflict between the direction and a convention is a question, never a quiet decision either way. If the project says nothing about itself at all, say so once, ask once whether there is an unwritten convention worth honouring, and go on.

## Steps

Steps 1–10 happen **in the conversation**. Nothing reaches disk until step 13.

1. **Survey the project's own documents** and sort what you find three ways. Finish any promotion round-trip before the decomposition leans on it.
2. **Collect the drivers**: every green responsibility in scope, plus the non-functional requirements and the constraints that bind them. A structure cut from functional responsibilities alone splits again the first time a quality requirement is put to it.
3. **Assign responsibilities to modules**, in that direction and never the reverse.
4. **Answer the hiding question for each candidate** — what decision it keeps to itself. An answer naming a step of the processing sends you back to 3.
5. **Test each assignment twice.** Do the responsibilities in one module **change for the same reason**? If not, that is a split. Does every dependency between modules run through something one publishes and another calls? Reaching past that into another module's internals is not allowed. The contracts themselves are phase 2's; here you **mark the hand-over points** — where one module asks something of another — because those marks are what phase 2 harvests.
6. **Settle a contested responsibility by information**: it sits in the module that holds what is needed to carry it out.
7. **Let a purely technical module stand.** A storage adapter, a transport, a thing that exists to hide a mechanism corresponds to no concept in the domain and does not have to. Do not force one.
8. **If one `Term` is asked to mean two things in two modules, stop.** That is a term to split (through `/shall:specify`) or a boundary to reconsider, and the user decides which. Do not proceed with the word meaning two things.
9. **Check yourself**: every key responsibility in scope reaches ≥1 module ∧ no module hangs off no responsibility ∧ no cycle among module dependencies ∧ nothing breaks a constraint.
10. **Get terminal approval of the decomposition** — the modules, their boundaries, what is assigned to each and what each hides. **Write nothing.** A boundary error caught here costs a conversation; caught after the design, it costs the design. On a no, take the objection back to step 3.
11. **Design each module in four parts.** Structure and behaviour are derived from the approved scenarios and responsibilities, not invented on a blank screen.
    1. **Role** — one sentence naming the single charge this module answers for. If you cannot write it without "and", two roles are mixed: back to step 3. Six kinds of role help start the sentence — a keeper of information, a provider of a service, a coordinator, a controller of flow, a connector to something outside, an organiser of structure — as a way in to the wording, never a classification to enforce.
    2. **Structural design** — name the arrangement the module's insides follow (layered, a pipeline of stages, a mediated set of parts, a store at the centre with its users around it), say why that one, and say where this module departs from it. Components only: no classes, no functions, no files.
    3. **Behavioural design** — **walk the scenarios through.** For each key scenario this module takes part in, follow the steps: who acts, what is asked of whom, what is handed back. **Mark every hand-over between modules** — phase 2 lives on those marks. A module holding state adds what states there are, what moves between them, and what triggers each move, at the level of the specification and not of code.
    4. **Rationale** — for each choice that is not self-evident: what was decided, what else was weighed, and which driver settled it. The survey's source paths land here.
12. **Check the design against the assignment.** Every responsibility a module realises has to appear in at least one walkthrough — one that appears in none is a responsibility the design has not absorbed yet. A walkthrough that contradicts the decomposition (a flow reaching past a module, a different actor doing the work) means fixing the design, or going back to step 3 if the boundary is what is wrong.
13. Close with the spine's two-stage approval — the second terminal yes, then the writing.

## The questions

Ask through AskUserQuestion under the spine's rules. What is worth asking here:

| When | Ask | Options | Header |
|---|---|---|---|
| two modules could both own a responsibility | which one holds what this needs? | the candidate modules | `Owner` |
| the direction and a convention disagree | the project already does it this way — which wins here? | follow the convention / follow the direction / a third way | `Conflict` |
| one term is pulling two ways | is this one concept or two? | one, and the boundary moves / two, and the term splits | `One term?` |
| a decision could be hidden in either place | which of these is likelier to change on its own? | the candidate decisions | `Where?` |
| a module answers to no domain concept | is this a module of its own, or part of one? | its own, hiding a mechanism / folded into the candidate | `Technical?` |

An ambiguity a sensible default carries is not asked about. Write the default as an `Assumption` and anchor it with `ASSUMES` in the **module's own file**. This is the only phase of the three with anywhere to put one — a contract and a task may not assume — so a default you leave unrecorded here has nowhere to hang later.

## Authoring mechanics

**This section runs after the second terminal yes.** Everything above it is drafted in the conversation; nothing reaches disk until the person has agreed to the decomposition and then to the finished modules.

Follow `shall-authoring` for the file itself. What is this phase's: **write the module first**, so its id exists, **then open the responsibility and add the line that anchors it**.

| You write | Its anchor line goes in | Written as | Its own file then gains |
|---|---|---|---|
| `ModuleDesign` | the responsibility's file | `IS_REALIZED_BY` → the module | `ASSUMES` → an assumption, `MENTIONS` → the terms it leans on |

```yaml
# .shall/spec/intent/SystemResponsibility/SR-0004.md — the responsibility, gaining a module
edges:
  - type: IS_REALIZED_BY
    to: MD-0002
  - type: REQUIRES
    to: R-0012
```

A module realising several responsibilities gets one such line in **each** of them. The merge lives in those several lines; nothing written in the module records it.

Anchoring edits the parent, so every responsibility you touch goes yellow again — the graph asking whether it still says the right thing now that something hangs off it. And because the line lives upstairs, **an orphan module is never repaired in the module's own file.**

## The gate

Close with the spine's two-stage approval. Expect **one card per responsibility that gained a module**, not one card for the phase.

| The line | What proves it |
|---|---|
| Nothing is orphaned and no id answers to nothing | `shall check` — gaps exit 1. A module nothing anchors is red and has no card at all, so the check is the only place it is said |
| Nothing you wrote is red | `shall board --json` — Fix Spec names nothing from this phase |
| Every key responsibility in scope reaches ≥1 module | `shall status --json`, joining the relations it prints. The check does not file this |
| No module hangs off no responsibility | `shall check` — that is the orphan above, said the other way round |
| No cycle among module dependencies | **you read it, off the hand-overs you drafted.** Nothing computes it yet: a module's dependency is a contract, and the contracts are not written until phase 2 — from then on `shall check` says it |
| Every module names the decision it hides, in words that are not a step of the processing | you read them — no command reads a sentence |
| Every role is one sentence with no "and" in it | you read them |
| Every structural design names the arrangement it follows and where it departs | you read them |
| Every responsibility a module realises appears in ≥1 walkthrough, and no walkthrough contradicts the assignment | you read them |
| Every choice that is not self-evident has its rationale, with the source path where a convention decided it | you read them, and you said it out loud in the terminal explanation |
| Every card from this phase is green | `shall status --json` after the person says they are done |

Then open [phase 2](./phase-2.md).

## When the gate fails

| What happened | Where to go |
|---|---|
| a module hides a step of the processing rather than a decision | step 3, with the hiding question in hand |
| a role will not go into one sentence | step 3 to split the module, or step 11 if the sentence is merely badly written |
| a walkthrough contradicts the decomposition | step 12 — and step 3 if the boundary is what is wrong |
| a module has no responsibility to hang off | `/shall:specify` — the responsibility was never written. Do not invent one |
| one term means two things | `/shall:specify` to split it, then step 3 |
| a constraint cannot be kept | `/shall:specify`. A constraint is a person's to relax, and never yours |
| terminal approval refused | step 3 for a boundary or an assignment, step 11 for one of the four parts |
| a node red with a rejection | read the rationale whole from `shall status --json` and revise that file; it lapses when the content changes |
