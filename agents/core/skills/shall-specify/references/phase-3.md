# Phase 3 — The vocabulary

The spine is [`../SKILL.md`](../SKILL.md), the `shall-specify` skill itself: its two-stage approval and its question rules govern this phase, and every mention of the spine below points there.

## Purpose

Harvest the project's terms from the approved prose and give the structured ones an entity, so that every normative statement written after this phase is written in one vocabulary. The output is `Term` and `DomainEntity` nodes.

## What it needs from above

Phase 2's map, green — confirm with `shall status --json`, and clear Fix Spec first as the spine says.

Under `--auto` the phase above is **written and agreed in the terminal** rather than green, and that is not the hazard this line was written against: nobody is mid-judgment on a file you are about to edit, because nobody has been asked yet. The one approval covers it all at the end.

The phase stands here for one reason: **terms are harvested from narrative, not squeezed out of a blank page.** The approved use-case and scenario prose is the harvest ground and the goal statements are the second pass. Run this before the narratives exist and you write a dictionary nobody speaks.

## Steps

1. **Read the approved prose and pull the terms that carry weight** — the nouns a reader would already have to know to read a scenario correctly. Register each as a `Term`. The prose is reached with the file tools, not with the CLI: `shall status` reports color, relations and the rest of a node's standing and **never a body**. List `.shall/spec/intent/**/*.md` with your file tools and read what comes back. Read the existing `.shall/spec/domain/Term/*.md` bodies in the same pass — a term's aliases live in its body, so a spelling somebody already settled is invisible until you open the file, and unopened it becomes a second term for a word that has one.
2. **One term, one definition, in one place.** The term's file is the only home of its definition; a scenario, a criterion or a responsibility that restates it is a second home, and a second home drifts. Where a definition already exists, extend the term that exists rather than writing a second one.
3. **A term that names something with structure also gets a `DomainEntity`**, and the term's file gains `DENOTES`. Keep the entity implementation-agnostic: what the domain has, not what a table or a payload has. Structural detail belongs to the Plan band later, and an entity written as a schema will have to be written twice. Where two entities are related in the domain itself, write `RELATES_TO` in the source entity's file.
4. **Settle every spelling variant by what the variant IS.** Three handlings, and they are not interchangeable:
   1. **Synonym** — a legitimate alternate spelling of the same concept. Record it as an alias of the canonical term, and **leave the prose alone**. Navigability survives through the alias.
   2. **Deprecated spelling** — a misuse, or a notation that invites confusion. Record it as an alias marked deprecated **and** correct the prose that used it. To deprecate is to weed out; an alias on its own leaves the weed standing. The correction rewrites approved scenario files, so those scenarios go yellow and come back through the queue — that is the price, and it is cheaper here than in Phase 5, when responsibilities and requirements are already written on top of them.
   3. **Two spellings you suspect name different things** — not an alias matter but a **definition conflict**. Ask, and expect to split into two terms with two definitions and two names.

   An alias is written in the canonical term's **body**, in the section the starting file suggests for it, and its deprecation is said there in words. Nothing new goes above the fence: frontmatter carries `short_name`, `name` and `edges`, and a key the format does not carry refuses the **whole file** — so a term you tried to give an `aliases:` field to does not arrive with an extra field, it drops out of the graph altogether.
5. **From here on, normative statements use the canonical term only** — responsibilities, requirements, criteria, constraints, in every phase below this one. Narrative prose may keep a synonym; that is what an alias is for.
6. **Draw `MENTIONS` sparingly.** It is a line in the *mentioning* node's file, so it is written where the term is load-bearing in what that node says — not everywhere the word appears, and never across nodes you were not already editing. A `Term` needs no anchor, so a `MENTIONS` is never what keeps a term alive.

## The questions

{{Ask}} under the spine's rules. What is worth asking here:

| When | Ask | Options | Header |
|---|---|---|---|
| two spellings, unclear | the same thing under two names, or two things? | the same / two different things / one is a spelling to retire | `Same word?` |
| a definition is contested | which of these is what the word means here? | 2–4 definitions | `Definition` |
| two entities blur | where does one stop and the other begin? | 2–4 dividing rules | `Boundary` |
| an alias may be a weed | should this spelling be retired from the prose? | retire it and correct the prose / keep it as a synonym | `Alias` |

This phase writes nothing that may assume — nothing in the domain band draws `ASSUMES`, and the three types this process hangs assumptions on are not written here. So a point that a default would have carried is asked instead.

## Authoring mechanics

**This section runs after the terminal yes.** Everything above it is drafted in the conversation; nothing reaches disk until the person has agreed to the whole set.

Follow `shall-authoring` for the file itself. What is this phase's:

1. `shall add-spec-node --type Term`, and `--type DomainEntity` for the structured ones. The first line of output is the path, alone.
2. The term's file gains the tie:

   ```yaml
   # .shall/spec/domain/Term/T-0001.md
   edges:
     - type: DENOTES
       to: DE-0001
   ```

   `DENOTES` is the only relation that leaves a `Term`.
3. Step 4.2 edits files you did not write: the approved scenarios and use cases whose prose carried the deprecated spelling. Change the spelling and nothing else — a drive-by rewording costs a second reading of a node that was already settled.

**`Term` and `DomainEntity` are rootless.** The canon holds neither by an anchor, because a vocabulary word is worth having before anything points at it. That cuts both ways: `shall check` will never tell you a term is undefined or unused, since nothing was supposed to hold it. **The undefined-term gate is yours and the reviewer's**, and no command substitutes for reading the prose against the terms `shall status` lists.

## The gate

Close with the spine's two-stage approval, and expect the shape of it to be different here. **Domain nodes are cut into the queue one at a time and come last**, so a dictionary of nine terms and three entities is twelve cards — plus one spec bundle for every approved scenario you corrected under step 4.2. Say cards are waiting, expect the approvals piecemeal, and do not treat a first yes as the phase.

Under `--auto` the card lines below belong to the run's one approval and not to this phase's close; the spine says when they are checked. Everything else here is checked now, as written.

| The line | What proves it |
|---|---|
| Every file reads and every `to:` answers to a file that exists | `shall check` whole — this phase edits intent prose as well as domain files, and a scope naming a band folder refuses until that band holds something |
| Nothing you wrote or corrected is red | `shall board --json` — Fix Spec names nothing from this phase |
| Every structured concept has an entity, and its term carries the `DENOTES` | `shall status --json` — the relations each term reports |
| No key term is left undefined | you read the approved prose against the terms `shall status` lists; nothing computes this, because a term needs no anchor |
| Every definition lives in exactly one place | you read them |
| Every variant is settled one of the three ways, and every prose file that used a deprecated spelling is corrected | you read them |
| Every card from this phase is green, the corrected scenarios included | `shall status --json` after the person says they are done |

Then open [phase 4](./phase-4.md). From that point the dictionary is the controlled vocabulary responsibilities and requirements are written in.

## When the gate fails

| What happened | Where to go |
|---|---|
| terminal approval refused | step 1, with the objection |
| a term or entity comes back red with a rejection | read the rationale whole from `shall status --json` and revise that file; it lapses when the content changes |
| `shall check` names a scenario you corrected | you broke it while changing a spelling — fix that file and re-run |
| Phase 4 or 5 needs a concept the dictionary lacks | come back to step 1, register it, then resume where you were. A statement written around an unregistered noun is a statement you will revise twice |
| a normative statement contradicts a definition | the term wins: revise the statement. Only when the definition itself is wrong do you confirm with the user and revise the term |
