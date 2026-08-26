# Phase 4 — System responsibilities

The spine is [`../SKILL.md`](../SKILL.md), the `shall-specify` skill itself: its two-stage approval and its question rules govern this phase, and every mention of the spine below points there.

## Purpose

Derive, from each approved scenario, the behaviors and qualities **the system** must guarantee for that scenario's steps to run — a set of `SystemResponsibility` nodes, each hanging off the scenario whose steps demand it.

## What it needs from above

Phase 2's map and Phase 3's dictionary, both green in `shall status --json`. A responsibility derived from a scenario still under judgment is one you will rewrite when the judgment lands, and from here on the dictionary is the controlled vocabulary every statement is written in.

Under `--auto` the phase above is **written and agreed in the terminal** rather than green, and that is not the hazard this line was written against: nobody is mid-judgment on a file you are about to edit, because nobody has been asked yet. The one approval covers it all at the end.

In revision mode, clear Fix Spec first as the spine says, and scope the work to the scenarios the request actually moves.

## The perspective turn

This is why the phase exists, and **restating what the actor does is the failure it exists to catch.** A scenario step has the actor as its subject; a responsibility has the system as its subject. Read the step, then ask what the system had to guarantee for that step to be possible at all.

| The step | Not a responsibility | A responsibility |
|---|---|---|
| The reviewer approves a node in the queue | "The reviewer approves each node of the bundle" — the actor, restated | "The system records an approval against the content the node held at that moment, and recomputes the node's color from it on every read" |

If a candidate reads as a paraphrase of its step, you have not turned it yet.

## The anchor, and what it enforces

`Scenario —DERIVES_RESPONSIBILITY→ SystemResponsibility`, written in the **scenario's** file. That relation is the only thing holding a responsibility to the graph: without one it is an orphan, it is red, and `shall check` exits 1. **There is no relation between a responsibility and a goal in either direction** — do not reach for one when a responsibility feels goal-shaped.

The anchor sits one level below "derived from the use case", and that fineness is the enforcement device: **a responsibility you cannot name a scenario for is a responsibility whose grounding narrative has not been written.** Thin-interaction responsibilities are where this bites — idempotency, reprocessing, a performance contract, a batch run — and their grounding scenario is almost always an exception path nobody wrote: idempotency is a duplicate delivery, reprocessing a retry after failure. Go back to [phase 2](./phase-2.md) step 3, erect that scenario, take it through its own approval, and return. Do not invent a placeholder to hang the responsibility on; the scenario is what was missing, and a stub buries the gap instead of closing it.

## Steps

1. **Walk the steps of each approved scenario** and name what the system must do, and what must hold while it does it. Qualities count, not only actions.
2. **Keep the declaration short**, the detail below it. A declaration that keeps growing clauses is two responsibilities mixed together: split it, and anchor both halves.
3. **Write in the dictionary's words.** Object nouns are approved terms, spelled canonically, and the responsibility's own file draws `MENTIONS` to each term its declaration leans on — sparingly, the way [phase 3](./phase-3.md) step 6 draws it. A concept the dictionary lacks sends you to [phase 3](./phase-3.md) step 1 to register it *before* the statement is written; built on an undefined noun, the statement is one you revise twice.
4. **Classify each responsibility by the removal test**: take it away, and does the scenario above it still stand? A scenario that collapses without it and one that merely degrades are two different answers, and the answer is written in the section the starting file suggests for it — the template carries the words to use.
5. **Merge duplicates.** When several scenarios demand the same guarantee, keep one responsibility and give **each** scenario its own `DERIVES_RESPONSIBILITY` line to it. Two near-identical responsibilities are a merge you did not make.
6. **Check coverage.** Every key use case reaches at least one responsibility, and every goal reaches one, along `Goal —PURSUED_BY→ Actor —PERFORMS→ UseCase —DETAILS→ Scenario —DERIVES_RESPONSIBILITY→ SystemResponsibility`. Nothing computes that chain for you: `shall status --json` prints each file's relations and you join them. A goal that reaches nothing sends you to [phase 2](./phase-2.md) step 2 to reinforce its use cases — the single return path for a coverage hole, because there is no edge upward to draw instead.
7. **Resolve what is left.** A phase does not close over an open point, and the canon has no node to park one in.

## The questions

{{Ask}} under the spine's rules. What is worth asking here:

| When | Ask | Options | Header |
|---|---|---|---|
| a quality's strength is unstated | is this guaranteed, or best effort? | always / under stated conditions / best effort | `Strength` |
| the removal test goes either way | does the scenario still stand without this? | it collapses without it / it degrades without it | `Removal` |
| a thin responsibility has no scenario | which path is this really about? | 2–3 candidate exception paths / none exists yet | `Grounding` |

An ambiguity a sensible default carries is not asked about. Write the default as an `Assumption` and anchor it with `ASSUMES` in the **responsibility's own file**. This is the first phase since Phase 1 with anywhere to put one: Phases 2 and 3 have no assuming node at all, which is why they settle their defaults by asking instead.

## Authoring mechanics

**This section runs after the terminal yes.** Everything above it is drafted in the conversation; nothing reaches disk until the person has agreed to the whole set.

Follow `shall-authoring` for the file itself. What is this phase's: **write the responsibility first**, so its id exists, **then open the scenario and add the line that anchors it**.

| You write | Its anchor line goes in | Written as | Its own file then gains |
|---|---|---|---|
| `SystemResponsibility` | the scenario's file | `DERIVES_RESPONSIBILITY` → the responsibility | `ASSUMES` → an assumption, `MENTIONS` → the terms it leans on |

```yaml
# .shall/spec/intent/Scenario/SC-0004.md — the scenario, gaining a responsibility
edges:
  - type: DERIVES_RESPONSIBILITY
    to: SR-0007
```

A merged responsibility gets one such line in **each** scenario that derives it. The merge lives in those several lines; nothing written in the responsibility records it.

Anchoring edits the parent, so every scenario you touch goes yellow again — the graph asking whether the scenario still says the right thing now that something hangs off it. And because the line lives upstairs, **an orphan responsibility is never repaired in the responsibility's own file.**

## The gate

Close with the spine's two-stage approval. Expect **one card per scenario that gained a responsibility**, not one card for the phase.

Under `--auto` the card lines below belong to the run's one approval and not to this phase's close; the spine says when they are checked. Everything else here is checked now, as written.

| The line | What proves it |
|---|---|
| Nothing is orphaned and no id answers to nothing | `shall check --scope .shall/spec/intent` — gaps exit 1 |
| Nothing you wrote is red | `shall board --json` — Fix Spec names nothing from this phase |
| Every key use case reaches ≥1 responsibility, and every goal reaches one along step 6's chain | `shall status --json`, joining the relations it prints |
| Every declaration has the system as its subject | you read them — no command reads a sentence, and this is the phase's whole point |
| Every declaration carries exactly one responsibility, in the approved vocabulary | you read them |
| No responsibility was derived without a scenario to derive it — idempotency, reprocessing, performance and batch included | `shall check` catches the orphan; only you catch a stub scenario written to avoid one |
| Every responsibility is classified by the removal test, and its file says the answer | you asked it and you read them — `shall status` reports no body |
| Every card from this phase is green | `shall status --json` after the person says they are done |

Then open [phase 5](./phase-5.md).

## When the gate fails

| What happened | Where to go |
|---|---|
| a responsibility restates its actor | step 1, with the perspective turn in hand |
| a responsibility has no scenario to hang on | [phase 2](./phase-2.md) step 3 — write the exception path, approve it, come back |
| a declaration carries two responsibilities, or two say nearly the same thing | step 2 to split, step 5 to merge |
| a statement needs a word the dictionary lacks | [phase 3](./phase-3.md) step 1, then resume here |
| a goal reaches no responsibility | [phase 2](./phase-2.md) step 2 — reinforce its use cases. There is no edge to draw |
| a node red with a rejection | read the rationale whole from `shall status --json` and revise that file; it lapses when the content changes |
