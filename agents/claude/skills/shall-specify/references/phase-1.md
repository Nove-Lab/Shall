# Phase 1 — Goals

The spine is [`../SKILL.md`](../SKILL.md), the `shall-specify` skill itself: its two-stage approval and its question rules govern this phase, and every mention of the spine below points there.

## Purpose

Turn the user's statement of need into a hierarchy of `Goal` nodes a person has approved: the ends this project is for, with the large ones decomposed.

## What it needs from above

Nothing — and that is a fact about the canon, not a courtesy. `Goal` is one of the few types the canon holds by no anchor at all, so a top goal is a whole node the moment its file reads. There is nothing to hang it off and nothing to wait for, which is why this phase runs against a project that has never been specified.

If the project is not empty you are in revision mode. Run `shall board --json` and clear Fix Spec first, as the spine says, then revise the goals the request moves and add what it needs. Delete nothing unless the user asks for a deletion in so many words.

## Steps

1. **Lift means-talk to purpose.** A request shaped as a feature — "add a dashboard", "cache the results" — names a means. Ask what is achieved by it, and keep asking until the answer is an end state. A technology named on the way is recorded in the conversation and promoted to nothing here — `/shall:plan` decides the stack; if it turns out to bind requirements it is a Constraint candidate for [phase 5](./phase-5.md).
2. **Write each candidate goal as one sentence.** The statement carries the achieved end state, not the road to it, and the achievement has to be imaginable: if you cannot picture the world in which that sentence is true, it is still a means, or still a slogan. The detail goes below the statement, never inside it.
3. **Draft the success measure** — how achievement would be gauged, said in words. No numbers, no metrics, no targets: the quantity arrives later, in an acceptance criterion's benchmark, and a number written here is a number nobody can judge. If the gauge does not come at once, narrow it with an option question. If it still will not settle, leave it out and settle it at [phase 2](./phase-2.md)'s benchmark check — absent beats invented.
4. **Decompose what is too large**, writing `REFINES` in the parent, then ask the sufficiency question out loud: *if all of these sub-goals are achieved, is the parent achieved?* If the answer is no, a sub-goal is missing and you find it before moving on. If the answer arrives with an "and also…", that clause is the missing sub-goal.
5. **Resolve what is left.** A phase does not close over an open point, and the canon has no node to park one in — every open point is settled inside the phase, by a default recorded as an Assumption or by asking.

## The questions

Ask with AskUserQuestion under the spine's rules. What is worth asking here:

| When | Ask | Options | Header |
|---|---|---|---|
| the request names a means | what does this get you? | 2–4 candidate end states | `Purpose` |
| two candidates overlap | one goal, or is one under the other? | one goal / A under B / B under A | `Goal shape` |
| the gauge will not come | how would you know this was achieved? | 2–4 gauges, none with a number in it | `Measure` |
| the boundary is unclear | is this in the round? | in / out / a later round | `Scope` |

An ambiguity a sensible default carries is not asked about. Write the default as an `Assumption` and anchor it with `ASSUMES` in the **goal's own file**. `Goal` is one of the three types this process lets assume, and Phase 2 has none of them — so a default you leave unrecorded here has nowhere to hang later.

## Authoring mechanics

**This section runs after the terminal yes.** Everything above it is drafted in the conversation; nothing reaches disk until the person has agreed to the whole set.

Follow `shall-authoring` for the file itself. What is this phase's:

1. `shall add-spec-node --type Goal` for each goal. Its first line is the path of the new file, alone.
2. Decomposition edits the **parent**, because a relation is written in the file of the node it leaves:

   ```yaml
   # .shall/spec/intent/Goal/G-0001.md — the parent
   edges:
     - type: REFINES
       to: G-0002
   ```

3. The sub-goal's own file says nothing about its parent. So a decomposition that has not landed is repaired in the parent's file; nothing you add to the child can attach it.
4. An `Assumption` gets its `ASSUMES` line in the goal's file the same way.

Adding a line rewrites the parent, so a goal already approved goes yellow and is read again. That is the graph asking whether the parent still says the right thing now that something hangs off it.

From a goal you write `REFINES` and `ASSUMES` in this phase — and `MENTIONS` only in a revision, once the vocabulary exists: in a new run there is no `Term` to mention until [phase 3](./phase-3.md). `PURSUED_BY` belongs to Phase 2. No phase of this process draws an edge back at a goal: later phases reach one by walking down from it. A `Decision` does revise a goal, through the `AFFECTS` it draws from the plan band, and that reaches this process as a revision to make rather than as a line to write.

## The gate

Close with the spine's two-stage approval. Expect **one card per top-level goal**, not one card for the phase and not one card per goal you wrote. The queue cuts a bundle at the topmost yellow node and walks down every outgoing spec relation from there, and `Goal —REFINES→ Goal` is one of those: a decomposition rides inside its parent's card, however deep it runs. A parent and its three sub-goals are one card carrying four nodes. In a revision where you edited a sub-goal and its parent stayed green, that sub-goal is itself the topmost yellow node and gets a card of its own.

Under `--auto` the card lines below belong to the run's one approval and not to this phase's close; the spine says when they are checked. Everything else here is checked now, as written.

| The line | What proves it |
|---|---|
| Every file reads and every `to:` answers to a file that exists | `shall check` whole — an orphan is filed under the orphan's own file, and a missing id under each file that still points at it, so a scope narrower than the spec hides exactly the findings this line is about |
| Nothing you wrote is red | `shall board --json` — Fix Spec names no goal of yours |
| Each decomposition is written in the parent | `shall status --scope .shall/spec/intent/Goal --json` — the parent's relations carry the `REFINES`. Absent here means you wrote the line in the child |
| Each statement is one sentence with an imaginable end state and no means in it | you read them — no command reads a sentence |
| Each success measure names a gauge and carries no number, or is deliberately left for Phase 2 | you read them |
| Each decomposition has had the sufficiency question asked and answered yes | you asked it |
| Every card from this phase is green | `shall status --json` after the person says they are done |

Then open [phase 2](./phase-2.md).

## When the gate fails

| What happened | Where to go |
|---|---|
| `shall check` names a file | fix that file — its sentence says what is wrong — and re-run |
| terminal approval refused | step 2, with the objection |
| a goal comes back red with a rejection | `shall status --json` gives the rationale whole; it is a work order. Revise the file, and the rejection lapses by itself when the content changes. Never delete a goal to clear one |
| Phase 2 finds a use case whose actor pursues no goal | step 2 — a goal is missing, and there is no edge that would attach the use case instead |
| Phase 2 cannot settle a success measure | step 3, with the user |
