---
description: Survey what a Shall project needs done — the findings nobody has answered, what the specification needs fixed, the tasks ready to start and how much is waiting on a person — and write nothing at all.
argument-hint: (takes no argument)
disable-model-invocation: true
allowed-tools: Bash(shall:*), Read, Skill
disallowed-tools: Write, Edit, MultiEdit, NotebookEdit
---

Anything typed after the command, in the user's own words:

$ARGUMENTS

**This command takes no argument.** Words here start nothing and pick nothing — but they do say what the user wants to see first, so lead the report with whatever they name, say once that the survey takes no argument, and then survey as usual.

The tools that write are refused for this command, which is the mechanical half of the same promise the process makes in prose: a survey that wrote anything would be a turn of work nobody agreed to.

## Step 0 — the gate

Run `shall status --json` in the project directory before anything else. It is the version check and the survey's own second reading at once, so nothing further down is decidable without it.

If the call fails, read **both** stdout and stderr, then match what you find:

| What the output holds | What it means | Tell the user, then stop |
|---|---|---|
| `Unknown command:` | the `shall` CLI is older than this plugin | Shall's CLI does not know `status` yet — upgrade Shall and run this again |
| the substring `-procedure on path "spec.status"` | the CLI is current but the running daemon is older | the Shall daemon is out of date — upgrade Shall, let it restart, and run this again |
| any message naming `.shall`, or saying this folder is not a Shall project | there is no `.shall` here | run `shall init` in this folder first |
| anything else | you do not know why the gate failed, and a survey that guessed would be a report about a project nobody read | the exact output, quoted verbatim, and that `/shall:work.todo` cannot answer until `shall status` does |

Match the daemon row on the substring, never on the whole sentence: the router writes the kind of procedure it wanted into the message the CLI hands on unchanged (`No "query"-procedure on path "spec.status"` today), and that verb can change without the fault changing.

Stop in every case. Do not work around any of them by reading the spec folder yourself: what is red, what is ready and what is waiting are computed, and a survey assembled by hand would disagree with the screen.

## Step 1 — load the skill

Load `shall:shall-work` with the Skill tool. One skill and not two: the authoring skill is how a node file is written, and this command writes none.

If the namespaced specifier is refused, read the file directly instead and follow it the same way:

- `${CLAUDE_PLUGIN_ROOT}/skills/shall-work/SKILL.md`

## Step 2 — entry dispatch

There is one entry and no dispatch: the survey, alone. The status you already have from step 0 is the survey's own second reading — use it rather than asking again.

## Step 3 — hand over

Enter `shall-work` at its survey, follow that file, report, and stop. Suggest a next action in one line at most. Do not pick anything, do not start the cycle, and do not open a file in order to change it.
