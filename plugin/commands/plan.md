---
description: Plan or revise the layer below an approved Shall specification — decides the modules, writes their contracts and cuts the work into tasks, handing each phase to the Review Queue for approval.
argument-hint: <the technical direction, or what to change>
disable-model-invocation: true
allowed-tools: Bash(shall:*), Read, Glob, Grep, Write, Edit, AskUserQuestion, Skill
---

The direction, in the user's own words:

$ARGUMENTS

If that is empty, ask the user what direction they want the build to take and stop there. Do not start on a guess: every phase below spends the user's attention, and spending it on the wrong subject costs more than one question.

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

Load both with the Skill tool, in this order: `shall:shall-authoring`, then `shall:shall-plan`. The first is how a node file is written, named and anchored; the second is the process you are about to run.

If those namespaced specifiers are refused, read the two files directly instead and follow them the same way:

- `${CLAUDE_PLUGIN_ROOT}/skills/shall-authoring/SKILL.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/shall-plan/SKILL.md`

## Step 2 — entry dispatch

Read the status you got in step 0. There are three questions here and they are asked in this order: is there unapproved plan work, is the specification above this direction agreed, and where does the direction enter.

### Unapproved plan work comes first

**Yellow in the plan band, a `Decision` aside → work nobody has agreed to, and it comes first.** A new session cannot tell a phase still waiting on a person from one nobody finished, and does not need to: either way nobody has agreed to those nodes. Ask with AskUserQuestion — carry that phase to its approval `(Recommended)`, or leave it standing and enter where this direction lands — then follow the answer.

Two things belong to that work while sitting outside the plan band, and reading them as somebody else's is how a phase gets abandoned half-written:

- **An `Assumption` a module assumes is filed with the intent band**, being the one type the canon gives no layer of its own. If a module hangs off it, it is this process's.
- **A `SystemResponsibility` yellow with the reason `changed`, whose relations now include an `IS_REALIZED_BY`,** is a responsibility this process edited in order to hold a module. A responsibility yellow with the reason `unapproved` is a specification nobody has read yet, and that one is `/shall:specify`'s. The reason word is the whole of the difference; do not guess from the color.

One thing sits inside the plan band and is not this process's:

- **A `Decision` is filed in the plan band, and no phase below writes one.** A yellow decision is a person's rationale waiting on its own approval: leave it standing, and do not offer to carry it. What it `AFFECTS` may well be yours, and that reaches you as a direction in words, not as a node to finish.

### The specification above this direction has to be agreed

The plan plane is written on top of a specification a person approved, and this gate is **local to the subtree the direction touches** — an unrelated corner of the project being unread is not a reason to refuse.

1. **The shortcut.** If nothing in the intent band is any color but green, the gate is passed. Go on.
2. **The walk.** Otherwise, for each `SystemResponsibility` this direction reaches, read its color, then walk out from it and read the color of everything you land on:
   - **up** — the `Scenario` whose `DERIVES_RESPONSIBILITY` reaches it, the `UseCase` whose `DETAILS` reaches that scenario, the `Actor` whose `PERFORMS` reaches the use case, the `Goal` whose `PURSUED_BY` reaches the actor, and any `Goal` whose `REFINES` reaches that goal;
   - **sideways** — the `Requirement`s it `REQUIRES`, each of their `HAS_CRITERION` and `HAS_CONSTRAINT` targets, and the scenario's own `HAS_CRITERION` targets.

   One `shall status --json` for the project holds every relation you need; join them yourself — no command walks the graph for you.
3. **If any of them is not green, stop.** Name those ids, say the specification has to be settled first, and send the user to `/shall:specify`. Do not plan over it: this is exactly the set a task's readiness is computed over later, so a plan built on a yellow node is a plan whose tasks can never be started.

### New, or a revision

**No `SystemResponsibility` in scope has an `IS_REALIZED_BY` → new mode.** The plan does not exist yet. Enter at phase 1 and run the phases in order.

Do not reach for `shall status --scope .shall/spec/plan` to establish this. A band folder nothing has been written into does not exist, and naming a path that is not there is refused rather than answered with an empty list — which is the right behavior and the wrong question. Read the whole status and look at what the responsibilities in scope say.

**Otherwise → revision mode.** Work out the highest layer the direction touches, and enter there:

| The direction is about | Enter at |
|---|---|
| where a boundary falls, what a module is answerable for, or how it is built inside | phase 1 |
| what a module publishes or calls, or the shape of data crossing a boundary | phase 2 |
| what a piece of work is, what it waits on, or which criterion it aims at | phase 3 |

When the direction genuinely fits two rows, ask with AskUserQuestion: one question, the candidate layers as options, the higher layer first with `(Recommended)` suffixed to its label. **Choose the higher layer whenever you are in doubt.** Moving a boundary re-cuts the contracts and the work beneath it, while changing one task never moves a boundary — so entering too high costs one pass over nodes that turn out unchanged, and entering too low leaves a plan whose pieces no longer fit each other.

Revision mode has three standing rules the phases assume:

- **Work out what the change reaches, then narrow to it.** What hangs off a node is found by reading the relations `shall status --json` reports and walking them yourself until nothing new turns up — `--scope` is a path filter and follows no relation, so it cannot do that walk for you. Scope the commands to the paths the walk landed on; nodes outside it are not this run's business.
- **Revise, never replace.** Edit the file that is already there, so the node keeps its id and everything pointing at it keeps pointing. A new file for an old thought orphans the old one's children and leaves two answers in the graph.
- **Delete only when the user asks for it.** A node that has gone quiet is not a node to remove; removing one is a proposal a person judges in the browser like any other.

## Step 3 — hand over

Enter `shall-plan` at the phase you chose and follow that phase's file to the letter — its own page says which file each phase is. From here the process steers and you do not: do not compress two phases into one pass, do not answer on the user's behalf a question the phase puts to them, and do not carry on past a phase's approval gate because the next step looks obvious.
