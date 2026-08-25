---
description: Write up work already done as one journal with a log per item — reconstructed from git and the specification when the notes are gone — and hand it to the Review Queue.
argument-hint: [a commit range, or a note of what was done]
disable-model-invocation: true
allowed-tools: Bash(shall:*), Bash(git:*), Read, Glob, Grep, Write, Edit, AskUserQuestion, Skill
---

What the user said, in their own words:

$ARGUMENTS

Empty is allowed: the process works out for itself where the last record stopped. When there are words, they are one of two things and usually both — **a commit range**, which replaces the range the process would have computed, and **a note of what was done**, which answers in advance the one question the reconstruction always has to ask: whether anything happened that left no commit behind.

## Step 0 — the gate

Run `shall status --json` in the project directory before anything else. It is the version check and the reading the reconstruction starts from, so nothing further down is decidable without it.

If the call fails, read **both** stdout and stderr, then match what you find:

| What the output holds | What it means | Tell the user, then stop |
|---|---|---|
| `Unknown command:` | the `shall` CLI is older than this plugin | Shall's CLI does not know `status` yet — upgrade Shall and run this again |
| the substring `-procedure on path "spec.status"` | the CLI is current but the running daemon is older | the Shall daemon is out of date — upgrade Shall, let it restart, and run this again |
| any message naming `.shall`, or saying this folder is not a Shall project | there is no `.shall` here | run `shall init` in this folder first |
| anything else | you do not know why the gate failed, and a record written blind is a record nobody can load | the exact output, quoted verbatim, and that `/shall:work.report` cannot start until `shall status` answers |

Match the daemon row on the substring, never on the whole sentence: the router writes the kind of procedure it wanted into the message the CLI hands on unchanged (`No "query"-procedure on path "spec.status"` today), and that verb can change without the fault changing.

Stop in every case. Do not work around any of them by reading the spec folder yourself: a record of work is written against the work items and criteria it names, and those have to be read back.

## Step 1 — load the skills

Load both with the Skill tool, in this order: `shall:shall-authoring`, then `shall:shall-work`. The first is how a node file is written, named and anchored; the second carries the record's own shape.

If those namespaced specifiers are refused, read the two files directly instead and follow them the same way:

- `${CLAUDE_PLUGIN_ROOT}/skills/shall-authoring/SKILL.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/shall-work/SKILL.md`

## Step 2 — entry dispatch

**This command is always the reconstruction, and who called is what decides that.** Inside `/shall:work` the record is reached from the development stretch with the notes still in hand; there is no way into this command from there, so what arrives here is always work whose notes are gone or were never taken. That makes it the recovery path as well: a turn that broke off mid-session is finished from here, because git holds what the notes would have said.

One outcome to have ready: **if nothing has happened since the last record and the user says nothing happened off git either, say there is nothing to report and write nothing.** That is a finished command, not a failure.

## Step 3 — hand over

Enter `shall-work` at its record, at the reconstruction, and follow that file. It has one stop — the draft of what will be written — and after that the files are written, checked and announced. Do not skip the stop, do not write a node before it passes, and do not wait for the Review Queue afterwards.
