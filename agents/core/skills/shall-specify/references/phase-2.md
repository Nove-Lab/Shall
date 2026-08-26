# Phase 2 — Actors, use cases, scenarios, criteria

The spine is [`../SKILL.md`](../SKILL.md), the `shall-specify` skill itself: its two-stage approval and its question rules govern this phase, and every mention of the spine below points there.

## Purpose

Derive who acts, what each actor pursues through the system, how each pursuit goes step by step, and the criterion that judges every telling. The output is `Actor`, `UseCase`, `Scenario` and `AcceptanceCriterion` nodes.

## What it needs from above

Phase 1's goals, green — confirm with `shall status --json`, and clear Fix Spec first as the spine says. An actor is held to the graph by a line written into a **goal's** file, so a goal that does not exist is an actor you cannot anchor, and a goal still yellow is a file you would be rewriting under a person's open judgment.

Under `--auto` the phase above is **written and agreed in the terminal** rather than green, and that is not the hazard this line was written against: nobody is mid-judgment on a file you are about to edit, because nobody has been asked yet. The one approval covers it all at the end.

## The chain, and the edge that does not exist

**There is no relation from a use case to a goal, and there never will be.** A use case is tied to its goal through the actor, so "which goal does this serve" is answered by walking `Goal —PURSUED_BY→ Actor —PERFORMS→ UseCase`.

That has one consequence you will meet in this phase: a use case whose actor pursues no goal is **not a missing edge, it is a missing goal**. Go back to [phase 1](./phase-1.md) step 2, get the goal written and taken through its own approval, and resume here. Do not reach upward for an edge; the canon has none, and `shall check` refuses what the canon does not allow.

## Steps

1. **Derive the actors from the approved goals** — who or what interacts with the system in order that a goal be achieved. One actor stands for the system acting on its own behalf: keep at most one per project, and use it only as the subject of work the system starts itself. **Say in each actor's file which kind of actor it is**, in the section the starting file suggests for it — the template carries the words to use. Nothing parses that section, and the gate below leans on it: "every user actor has a use case" is a line nobody can check against a file that never said which actors are users. If no person interacts with the system at all, confirm that once, in plain words. If confirmed, carry on with external-system and time-triggered actors as the subjects — callbacks, partner APIs, scheduled runs. **A project with no use cases cannot exist**, because every responsibility in [phase 4](./phase-4.md) is derived from a scenario and every scenario details a use case.
2. **Derive each actor's use cases**: what that actor pursues through the system, and the value it gets. A use case is what the actor does with the system, not what the system does inside — that turn comes in Phase 4.
3. **Derive the scenarios of each use case.** One main scenario is **mandatory**, and it is filled all the way through: the state it starts from, the ordered steps with each action and its result, and the state of the world once it is done. Then interrogate every branch and every failure point in those steps. What you find are scenarios of the same rank — each its own file with its own `DETAILS` line, never a section tucked inside the main one. They differ only in the kind of scenario each says it is, and Phase 4 will come looking for exactly these: an idempotency responsibility has a duplicate-delivery exception under it, or it has nothing.
4. **Give every scenario at least one integrative criterion** — whatever priority the use case above it carries, and the branches and failure paths included. It judges the scenario end to end: what to check across the starting state, the steps and the finishing state. Write it at spec level, general enough that several test cases could later be cut from it; not a script, not a fixture, not an input table.
   * A scenario nobody can write a judgeable criterion for **has vague postconditions**. Return to step 3 and rewrite the scenario. Do not water the criterion down to fit it — the criterion is the instrument that found the fault.
   * **The benchmark check.** Every goal carrying a success measure needs at least one criterion with a benchmark under it. Walk it down: `Goal —PURSUED_BY→ Actor —PERFORMS→ UseCase —DETAILS→ Scenario —HAS_CRITERION→ AcceptanceCriterion`. Nothing computes that chain for you; `shall status --json` prints the relations written in each file and you join them. A goal whose whole subtree carries no quantity anywhere is a goal nobody will be able to say has been reached. If a success measure was left unsettled in Phase 1, settle it with the user now.
5. **Resolve what is left by asking.** This process records assumptions only under a goal, a responsibility or a requirement — the three whose statements carry defaults — and this phase writes none of the three, so the point is settled in the conversation instead. If the default genuinely belongs to a goal, that is a Phase 1 revision: take it there rather than smuggling it in.

## The questions

{{Ask}} under the spine's rules. What is worth asking here:

| When | Ask | Options | Header |
|---|---|---|---|
| no human actor appears | is there really nobody who interacts with this system? | nobody, systems call it / nobody yet / there is a person | `Actors` |
| a use case serves no approved goal | which goal is this for — or is one missing? | 2–3 approved goals / a goal is missing | `Goal fit` |
| a step could go two ways | what happens when this branches or fails? | 2–4 outcomes | `Branch` |
| a postcondition is soft | what would you look at to say this went right? | 2–4 observable outcomes | `Judgment` |

## Authoring mechanics

**This section runs after the terminal yes.** Everything above it is drafted in the conversation; nothing reaches disk until the person has agreed to the whole set.

Follow `shall-authoring` for the file itself. What is this phase's: **write the child first**, so its id exists, **then open the parent and add the line that anchors it**.

| You write | Its anchor line goes in | Written as | Its own file then gains |
|---|---|---|---|
| `Actor` | the goal's file | `PURSUED_BY` → the actor | `PERFORMS` → each of its use cases |
| `UseCase` | the actor's file | `PERFORMS` → the use case | `DETAILS` → each of its scenarios |
| `Scenario` | the use case's file | `DETAILS` → the scenario | `HAS_CRITERION` → each of its criteria |
| `AcceptanceCriterion` | the scenario's file | `HAS_CRITERION` → the criterion | nothing but `MENTIONS` |

```yaml
# .shall/spec/intent/Goal/G-0001.md — the goal, gaining an actor
edges:
  - type: PURSUED_BY
    to: A-0001
```

One goal may pursue several actors and several goals may pursue the same actor: one line per pair, each written in the goal's own file. The same holds for a use case several actors perform — a `PERFORMS` line in each of their files.

Anchoring edits the parent, so every goal you touch goes yellow again along with everything you wrote this phase. **An orphan here is never repaired in the orphan's own file** — an actor no goal pursues, a use case no actor performs, a scenario no use case details, a criterion no scenario has: `shall check` names the orphan, and the line that would hold it lives upstairs.

## The gate

Close with the spine's two-stage approval. Expect **one card per goal that gained an actor**, each carrying the use cases, scenarios and criteria beneath it.

Under `--auto` the card lines below belong to the run's one approval and not to this phase's close; the spine says when they are checked. Everything else here is checked now, as written.

| The line | What proves it |
|---|---|
| Nothing is orphaned and no id answers to nothing | `shall check --scope .shall/spec/intent` — gaps exit 1 |
| Nothing you wrote is red | `shall board --json` — Fix Spec names nothing from this phase |
| Every user actor has ≥1 use case, every use case ≥1 scenario, every scenario ≥1 criterion | `shall status --scope .shall/spec/intent --json` — the relations are printed per file and you join them. Which actors are users you read from their files: `shall status` reports no body |
| Every use case's actor is pursued by a goal | the same walk, from the goal end |
| Every goal with a success measure has a benchmark somewhere under it | the same walk, plus reading the criteria — no command reads a benchmark |
| Every use case has a **main** scenario, filled all the way through | you read them |
| No criterion has descended to a test case | you read them |
| Every card from this phase is green | `shall status --json` after the person says they are done |

Then open [phase 3](./phase-3.md).

## When the gate fails

Return by the layer of the objection.

| What was objected to | Where to go |
|---|---|
| the actors | step 1 — and if the goal behind an actor is what is wrong, [phase 1](./phase-1.md) step 2 |
| a use case that serves nothing | [phase 1](./phase-1.md) step 2. There is no edge to draw |
| the use cases themselves | step 2 |
| thin scenarios, unexplored branches, a scenario no criterion can judge | step 3 |
| criteria too concrete, or a goal's subtree with no benchmark | step 4 |
| a node red with a rejection | read the rationale whole from `shall status --json` and revise that file; it lapses when the content changes |
