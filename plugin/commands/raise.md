---
description: Bring a question about a Shall project — explores and diagnoses without writing anything, then lands what the conversation settles: a decision you dictate, a finding, both, or nothing at all.
argument-hint: <what seems off, or what you are unsure about>
disable-model-invocation: true
allowed-tools: Bash(shall:*), Bash(git:*), Read, Glob, Grep, Write, Edit, AskUserQuestion, Skill
---

The question, in the user's own words:

$ARGUMENTS

If that is empty, ask what seems off or what they are unsure about, and stop there. A question is the whole subject of this process, and without one there is nothing to look into. `/shall:work` can start from nothing because the board supplies its subject; this cannot, and picking a subject on the user's behalf would be answering a question nobody asked.

## Step 0 — the gate

Run `shall status --json` in the project directory before anything else. It is the version check and the first reading of what the question is about, so nothing further down is decidable without it.

If the call fails, read **both** stdout and stderr, then match what you find:

| What the output holds | What it means | Tell the user, then stop |
|---|---|---|
| `Unknown command:` | the `shall` CLI is older than this plugin | Shall's CLI does not know `status` yet — upgrade Shall and run this again |
| the substring `-procedure on path "spec.status"` | the CLI is current but the running daemon is older | the Shall daemon is out of date — upgrade Shall, let it restart, and run this again |
| any message naming `.shall`, or saying this folder is not a Shall project | there is no `.shall` here | run `shall init` in this folder first |
| anything else | you do not know why the gate failed, and a diagnosis over a project Shall cannot read is a guess with citations | the exact output, quoted verbatim, and that `/shall:raise` cannot start until `shall status` answers |

Match the daemon row on the substring, never on the whole sentence: the router writes the kind of procedure it wanted into the message the CLI hands on unchanged (`No "query"-procedure on path "spec.status"` today), and that verb can change without the fault changing.

Stop in every case. Do not work around any of them by reading the spec folder yourself: what this process reports is what the project says about itself, and the colours are half of that.

## Step 1 — load the skills

Load both with the Skill tool, in this order: `shall:shall-authoring`, then `shall:shall-raise`. The first is how a node file is written, named and anchored — needed only at the end, and loaded first so the end is not where you go looking for it; the second is the process you are about to run.

If those namespaced specifiers are refused, read the two files directly instead and follow them the same way:

- `${CLAUDE_PLUGIN_ROOT}/skills/shall-authoring/SKILL.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/shall-raise/SKILL.md`

## Step 2 — entry dispatch

There is one entry and no dispatch beyond the empty check above. Do not read the board to decide anything here: this process sits outside the work cycle, and what is ready to start says nothing about whether a question is worth looking into.

## Step 3 — hand over

Enter `shall-raise` at its first step with the question and follow that file. Write nothing until the conversation has landed — not a node, not a scratch file, not a note. Write a decision only as dictation of a judgment the user has confirmed, and do not carry on into building whatever was decided because the next step looks obvious: what the revised specification makes into work is computed, after somebody approves it.
