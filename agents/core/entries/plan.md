---
description: Plan or revise the layer below an approved Shall specification — reads the repository, proposes the stack, draws the modules, cuts the work into work items, puts the whole plan to you for one yes, then writes it as one pass for the Review Queue. --auto skips the yes in the terminal and nothing else.
argument-hint: [--auto] <the technical direction, or what to change>
summary: Plan or revise the layer below an approved specification.
tools: spec
---

The direction, in the user's own words:

{{args}}

If that is empty, ask the user what direction they want the build to take and stop there. Do not start on a guess: the planning stage below spends the user's attention, and spending it on the wrong subject costs more than one question.

Read it for one flag before anything else:

| What you find | What it means |
|---|---|
| `--auto` | run stage 1 without its two stops — the stack question and the yes on the plan — and go straight on to writing. **Everything else is as it is without the flag**: the exploration, the questions a default cannot carry, the check, and the one approval in the browser at the end |
| the flag and nothing else | still ask for the direction and stop. The flag settles how the run is agreed, never what it is about |
| anything else | the direction itself |

**The flag does not reach the gate in step 2.** `--auto` skips this run's own yes in the terminal; the browser approval at the end is the same approval either way, and it moves nobody else's judgment: the specification above the direction was another round's judgment, and the gate below reads it exactly as it reads it today. So a `/shall:specify --auto` that has just finished leaves a specification nobody has approved yet, and `/shall:plan` — with the flag or without it — will refuse to start until somebody does.

## Step 0 — the gate

Run `shall status --json` in the project directory before anything else. It is the version check and the entry dispatch at once, so nothing further down is decidable without it.

If the call fails, read **both** stdout and stderr, then match what you find:

| What the output holds | What it means | Tell the user, then stop |
|---|---|---|
| `Unknown command:` | the `shall` CLI is older than this plugin | Shall's CLI does not know `status` yet — upgrade Shall and run this again |
| the substring `-procedure on path "spec.status"` | the CLI is current but the running daemon is older | the Shall daemon is out of date — upgrade Shall, let it restart, and run this again |
| any message naming `.shall`, or saying this folder is not a Shall project | there is no `.shall` here | run `shall init` in this folder first |
| anything else | you do not know why the gate failed, and guessing is how a broken install turns into a plan nobody can load | the exact output, quoted verbatim, and that `/shall:plan` cannot start until `shall status` answers |

Match the daemon row on the substring, never on the whole sentence: the router writes the kind of procedure it wanted into the message the CLI hands on unchanged (`No "query"-procedure on path "spec.status"` today), and that verb can change without the fault changing.

Stop in every case. Do not work around any of them by reading the spec folder yourself: a plan written against a Shall that cannot read it back is a plan nobody has checked.

## Step 1 — load the skills

{{load-skills shall-authoring shall-plan}} The first is how a node file is written, named and anchored; the second is the process you are about to run.

{{load-skills-fallback shall-authoring shall-plan}}

## Step 2 — entry dispatch

Read the status you got in step 0. There are three questions here and they are asked in this order: is there unapproved plan work, is the specification above this direction agreed, and is this a new plan or a revision.

### Unapproved plan work comes first

**Yellow in the plan band, a `Decision` aside → work nobody has agreed to, and it comes first.** A new session cannot tell a run still waiting on a person from one nobody finished, and does not need to: either way nobody has agreed to those nodes. {{Ask}} — carry that work to its approval `(Recommended)`, or leave it standing and plan this direction on top — then follow the answer.

**Under `--auto` there is nothing to ask here.** Carrying the older work to its approval is what the end of this run does anyway, and it does it for everything at once. So name what is yellow, go on, and say that the one approval at the end covers the older work as well as this run's.

Two things belong to that work while sitting outside the plan band, and reading them as somebody else's is how a run gets abandoned half-written:

- **An `Assumption` a module assumes is filed with the intent band**, being the one type the canon gives no layer of its own. If a module hangs off it, it is this process's.
- **A `SystemResponsibility` yellow with the reason `changed`, whose relations now include an `IS_REALIZED_BY`,** is a responsibility this process edited in order to hold a module. A responsibility yellow with the reason `unapproved` is a specification nobody has read yet, and that one is `/shall:specify`'s. The reason word is the whole of the difference; do not guess from the color.

One thing sits inside the plan band and is left standing whichever process wrote it:

- **A yellow `Decision`** is a person's rationale waiting on its own approval — dictated through `/shall:raise`, or the technology decision a broken-off `/shall:plan` run wrote, which the one approval at the end of this run covers. Do not edit it and do not offer to carry it on its own. What it `AFFECTS` may well be yours, and that reaches you as a direction in words, not as a node to finish.

### The specification above this direction has to be agreed

The plan plane is written on top of a specification a person approved, and this gate is **local to the subtree the direction touches** — an unrelated corner of the project being unread is not a reason to refuse.

1. **The shortcut.** If nothing in the intent band is any color but green, the gate is passed. Go on.
2. **The walk.** Otherwise, for each `SystemResponsibility` this direction reaches, read its color, then walk out from it and read the color of everything you land on:
   - **up** — the `Scenario` whose `DERIVES_RESPONSIBILITY` reaches it, the `UseCase` whose `DETAILS` reaches that scenario, the `Actor` whose `PERFORMS` reaches the use case, the `Goal` whose `PURSUED_BY` reaches the actor, and any `Goal` whose `REFINES` reaches that goal;
   - **sideways** — the `Requirement`s it `REQUIRES`, each of their `HAS_CRITERION` and `HAS_CONSTRAINT` targets, and the scenario's own `HAS_CRITERION` targets.

   One `shall status --json` for the project holds every relation you need; join them yourself — no command walks the graph for you.
3. **If any of them is not green, stop.** Name those ids, say the specification has to be settled first, and send the user to `/shall:specify`. Do not plan over it: this is exactly the set a work item's readiness is computed over later, so a plan built on a yellow node is a plan whose work items can never be started.

### New, or a revision

**No `SystemResponsibility` in scope has an `IS_REALIZED_BY` → new mode.** The plan does not exist yet. Enter stage 1 from its first step.

Do not reach for `shall status --scope .shall/spec/plan` to establish this. A band folder nothing has been written into does not exist, and naming a path that is not there is refused rather than answered with an empty list — which is the right behavior and the wrong question. Read the whole status and look at what the responsibilities in scope say.

**Otherwise → revision mode.** There is no layer to enter at: stage 1 opens with the reach. From the status you already have, walk the relations out from what the direction names until nothing new turns up — the modules, their contracts, the work items they allocate, the criteria those target, the responsibilities above — and that set is what stage 1 redesigns, as a whole, and what stage 2 rewrites. A direction about one work item still runs the whole of stage 1 over that reach; what is small is the reach, not the procedure.

Revision mode has three standing rules the stages assume:

- **Work out what the change reaches, then narrow to it.** What hangs off a node is found by reading the relations `shall status --json` reports and walking them yourself until nothing new turns up — `--scope` is a path filter and follows no relation, so it cannot do that walk for you. Scope the commands to the paths the walk landed on; nodes outside it are not this run's business.
- **Revise, never replace.** Edit the file that is already there, so the node keeps its id and everything pointing at it keeps pointing. A new file for an old thought orphans the old one's children and leaves two answers in the graph.
- **Delete only when the user asks for it.** A node that has gone quiet is not a node to remove; removing one is a proposal a person judges in the browser like any other.

## Step 3 — hand over

Enter `shall-plan` at stage 1 and follow its files to the letter. From here the process steers and you do not: write no node in stage 1, do not begin stage 2 before the plan has had its yes *(unless this is `--auto`, which removes the yes and not the order)*, do not answer on the user's behalf a question the process puts to them, and do not carry on past the browser wait because the next step looks obvious.
