---
description: Run one turn of Shall's work cycle — surveys the board, proposes a small bundle, leaves the development to you, and writes the turn up as one journal for the Review Queue. --auto runs it without stopping; --dry forecasts it and writes nothing.
argument-hint: [--auto | --dry] [what to pick, in your own words]
disable-model-invocation: true
allowed-tools: Bash(shall:*), Bash(git:*), Read, Glob, Grep, Write, Edit, AskUserQuestion, Skill
---

What the user said, in their own words:

$ARGUMENTS

**Empty is allowed here, and that is the one way this command differs from `/shall:specify` and `/shall:plan`.** Those two need a subject and this one has the board: what is red and what is ready to start is already computed, so a turn can begin with nobody naming anything. Words, when there are any, steer which items get picked and are carried into the record of this turn.

Read them for two flags before anything else:

| What you find | What it means |
|---|---|
| `--auto` | run the whole cycle without stopping — the two stops below are removed and nothing is asked |
| `--dry` | forecast the turn and write nothing at all: no node, no commit, no file anywhere |
| both | say that a forecast and a run without stops contradict each other — one predicts a turn and the other finishes one — and stop. Do not pick one for the user |
| anything else | the user's steer on what to pick this turn. It narrows the candidates and never removes a stop, and never overrules taking Fix Spec first unless the words say so outright |

## Step 0 — the gate

Run `shall status --json` in the project directory before anything else. It is the version check and the survey's own second reading at once, so nothing further down is decidable without it.

If the call fails, read **both** stdout and stderr, then match what you find:

| What the output holds | What it means | Tell the user, then stop |
|---|---|---|
| `Unknown command:` | the `shall` CLI is older than this plugin | Shall's CLI does not know `status` yet — upgrade Shall and run this again |
| the substring `-procedure on path "spec.status"` | the CLI is current but the running daemon is older | the Shall daemon is out of date — upgrade Shall, let it restart, and run this again |
| any message naming `.shall`, or saying this folder is not a Shall project | there is no `.shall` here | run `shall init` in this folder first |
| anything else | you do not know why the gate failed, and guessing is how a broken install turns into a record nobody can load | the exact output, quoted verbatim, and that `/shall:work` cannot start until `shall status` answers |

Match the daemon row on the substring, never on the whole sentence: the router writes the kind of procedure it wanted into the message the CLI hands on unchanged (`No "query"-procedure on path "spec.status"` today), and that verb can change without the fault changing.

Stop in every case. Do not work around any of them by reading the spec folder yourself: work done against a Shall that cannot read the specification back is work nobody has checked.

## Step 1 — load the skills

Load both with the Skill tool, in this order: `shall:shall-authoring`, then `shall:shall-work`. The first is how a node file is written, named and anchored; the second is the process you are about to run.

If those namespaced specifiers are refused, read the two files directly instead and follow them the same way:

- `${CLAUDE_PLUGIN_ROOT}/skills/shall-authoring/SKILL.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/shall-work/SKILL.md`

## Step 2 — entry dispatch

**Every mode starts at the survey.** What differs is what happens after it:

| Mode | What runs |
|---|---|
| no flag | the whole cycle, with both stops — the pick, then the record |
| `--auto` | the whole cycle with the stops removed, ending after the record is written |
| `--dry` | the forecast alone: the survey, the bundle the cycle would have picked, and the record it would have produced. Nothing else runs |

Two things the survey may turn up, and what each means here:

- **Both halves of the board are empty → this turn is over before it starts.** Say so, say how many nodes are waiting in the Review Queue, and stop. It is not an error and not something to work around: what unblocks the board is a person judging what is waiting, or `/shall:plan` cutting more work — neither is this command's to do.
- **Yellow execution records from earlier turns are not this run's business.** The queue is asynchronous by design: a report is written and the command stops, so records waiting on a person are the ordinary state of a healthy project. Do not offer to carry them, and do not treat them as unfinished work.

## Step 3 — hand over

Enter `shall-work` at the survey in the mode you chose and follow its reference files to the letter. From here the process steers and you do not: do not skip a stop because the pick looks obvious, do not write any part of the record before the second stop has passed (unless this is `--auto`, which removes the stop and not the order), do not answer on the user's behalf a question the process puts to them, and do not wait for the Review Queue once the record is written.
