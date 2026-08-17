# Phase 6 — The closing domain review

The spine is [`../SKILL.md`](../SKILL.md), the `shall-specify` skill itself: its two-stage approval and its question rules govern this phase, and every mention of the spine below points there.

## Purpose

Rescan the prose of everything this run wrote — goals, actors, use cases, scenarios, responsibilities, requirements, constraints, criteria — for the terms and concept entities the dictionary lacks, close those gaps, and finish `/specify`.

**This is cleanup, not derivation. No intent node is created here.** If the rescan makes you want a new responsibility or a new requirement, that is not this phase's work: it means [phase 4](./phase-4.md) or [phase 5](./phase-5.md) is unfinished. Go back, run that phase to its own gate, and come to 6 again.

## What it needs from above

Phases 1 through 5 green, and Fix Spec cleared first as the spine says — a red node's prose is prose somebody is about to rewrite, and rescanning it now is scanning a draft.

In a revision run the scan covers only what this run wrote or changed, not the whole project. `shall status --scope <path> --json` over the subtree you worked in gives you that list.

## Steps

1. **Collect the prose and read the bodies**, not the names. A term hides in a sentence, and `short_name` will not show it to you. Reach the prose the way [phase 3](./phase-3.md) step 1 reaches it — `shall status` reports no body, so the files are opened with Glob and Read — over everything this run wrote or changed.
2. **Extract what the dictionary lacks** — a word used as if everyone already agreed what it means, and a concept with structure behind it. Compare against the terms `shall status --json` lists; a word you had to explain inside a body is a word that belongs in the dictionary.
3. **Register them under Phase 3's rules**: one term one definition, spelling variants settled the three ways, entities kept implementation-agnostic. Those rules live in [phase 3](./phase-3.md) — read them there. One term, one definition; the rule about that has one home too.
4. **Correct usage that conflicts with a definition. The term wins and the statement is revised.** Only when the definition itself is wrong do you revise the term, and only with the user's confirmation: a definition is what every statement above it leans on, so moving it moves them all.
5. **Resolve what is left by asking.** This phase has nothing that may assume — `ASSUMES` runs from a goal, a responsibility or a requirement, and Phase 6 writes none of the three — so a default here has nowhere to hang and would land as an orphan. Ask instead.

## The questions

Ask through AskUserQuestion under the spine's rules. What is worth asking here:

| When | Ask | Options | Header |
|---|---|---|---|
| a statement contradicts a definition | is the statement wrong, or the definition? | the statement — revise it / the definition — revise the term | `Definition` |
| a candidate may not carry weight | does this word need a definition of its own? | register it / it is a synonym of an existing term / plain English, leave it | `Register?` |
| two new entities blur | where does one stop and the other begin? | 2–4 dividing rules | `Boundary` |

## Authoring mechanics

**This section runs after the terminal yes.** Everything above it is drafted in the conversation; nothing reaches disk until the person has agreed to the whole set.

Follow `shall-authoring` for the file itself. What is this phase's:

| You write | The line goes in | Written as |
|---|---|---|
| `Term` | nowhere — a Term is rootless, and whole the moment its file reads | — |
| `DomainEntity` | nowhere either — a DomainEntity is rootless in exactly the same way | — |
| a term that names the structure | the term's file | `DENOTES` → the entity |
| a relation between two entities | the source entity's file | `RELATES_TO` → the other |
| a term a statement leans on | the mentioning node's file | `MENTIONS` → the term |

**`DENOTES` is not an anchor.** It is written in the term's file because a relation is written in the file of the node it leaves and the term is what names the structure — not because anything holds the entity to the graph. Nothing does: an entity no term denotes is not an orphan and is not red, and `shall check` will never file it. So a `DENOTES` you forgot to write is invisible to every command, and you and the reviewer catch it by reading, the way a missing definition is caught.

Draw `MENTIONS` the way Phase 3 draws it: sparingly, only where the term is load-bearing in what that node says, and **never to keep a term alive** — nothing holds a Term, so nothing can drop it. Every `MENTIONS` line lands in a file that is already green and sends that node back to the queue, which is why you **make all of one node's edits in a single pass**: the new relations and the step 4 revisions together, so it is reviewed once instead of five times.

## The gate

This is the run's final gate, not only this phase's. Close with the spine's two-stage approval — expect one card per term and one per domain entity, since domain nodes are cut one at a time and come last, plus one spec bundle for each intent node step 4 made you revise.

| The line | What proves it |
|---|---|
| No key term is left undefined | your rescan of the prose against the terms `shall status --json` lists. No command substitutes for reading: a term nothing mentions is legal, and what `shall check` does catch is a `MENTIONS` pointing at an id nothing answers to |
| Every requirement has ≥1 criterion | `shall status --json` — each Requirement's relations include a `HAS_CRITERION` |
| No orphan nodes anywhere, and every file reads | `shall check` exits 0 |
| Nothing red is left | `shall board --json` — Fix Spec is empty |
| Every conflict between a statement and a definition is settled, the term winning unless the user said otherwise | you asked, and you read the revisions |
| Everything this phase wrote or revised is green | `shall status --json` after the person says they are done |

**If the rescan produced no additions and no revisions**, there is nothing to approve: say so in the terminal — the rescan found nothing missing, the dictionary already covers the run — run the gate above, and finish. An empty set is owed no approval rite; do not manufacture a card and do not send the person to an empty queue.

Then declare loop-ready: `/specify` is finished, the intent and domain planes hold together, and the specification is ready for the plan layer. A later change to intent comes back through `/shall:specify <request>`, which enters in revision mode, finds the highest layer the request touches, and runs that phase and every phase below it, scoped to the affected subtree.

## When the gate fails

| What happened | Where to go |
|---|---|
| the rescan wants a new responsibility or requirement | [phase 4](./phase-4.md) or [phase 5](./phase-5.md) — that phase is unfinished; finish it and return here |
| a candidate turns out to be a variant of an existing term | [phase 3](./phase-3.md) step 4 — settle it as a synonym, a deprecated spelling, or a split |
| a definition is genuinely wrong | ask, get the user's confirmation, revise the term, then revise every statement leaning on it |
| `shall check` names a statement you revised | you broke that file while correcting it — fix it, then re-run |
| a term or entity red with a rejection | read the rationale whole from `shall status --json` and revise that file; it lapses when the content changes |
