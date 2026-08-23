---
description: Ask what Shall is, or what to do next in this project — says what Shall is in a screen, reads where the project stands, and points at the one or two commands that move it. Writes nothing, registers nothing, runs none of them, and answers outside a Shall project too.
argument-hint: [<a question about Shall or about what to do next>]
disable-model-invocation: true
allowed-tools: Bash(shall:*), Read, Skill
disallowed-tools: Write, Edit, MultiEdit, NotebookEdit
---

The question, in the user's own words:

$ARGUMENTS

**Empty is allowed, and it is the ordinary case.** With nothing here the answer is the whole guide: what Shall is, where this project stands, and what to do next. With a question the first two parts do not change — they are short, and they are the ground the answer stands on — and the third part narrows to what was asked. A question never adds a part and never makes this command do anything: it chooses which recommendation is said first and which is left out.

The tools that write are refused for this command, which is the mechanical half of the promise the guide makes in prose: a guide that wrote anything would be a turn of work nobody agreed to.

## Step 0 — the gate, which does not stop

Run `shall status --json` in the current directory before anything else. It is the version check and the whole of part 2's first reading, and it is what tells this command whether it is standing in a Shall project at all.

Every other command stops when this call fails. This one does not, because it is the one command a person runs before they have a project — the first meeting with Shall is usually a folder with nothing in it. So read **both** stdout and stderr, match what you find, and carry on:

| What the output holds | What it means | What you do |
|---|---|---|
| `Unknown command:` | the `shall` CLI is older than this plugin | give part 1, then say Shall's CLI does not know `status` yet, so parts 2 and 3 cannot be read until Shall is upgraded — and stop there |
| the substring `-procedure on path "spec.status"` | the CLI is current but the running daemon is older | give part 1, then say the Shall daemon is out of date — upgrade Shall, let it restart, and ask again — and stop there |
| any message naming `.shall`, or saying this folder is not a Shall project | there is no `.shall` here | give part 1, then say `shall init` makes this folder a Shall project and that parts 2 and 3 begin once it has. Skip those two parts: there is no state to read and no project to recommend a next step for. Say it; do not run it |
| anything else | you do not know why the call failed | give part 1, then the exact output, quoted verbatim, and that parts 2 and 3 wait until `shall status` answers |

Match the daemon row on the substring, never on the whole sentence: the router writes the kind of procedure it wanted into the message the CLI hands on unchanged (`No "query"-procedure on path "spec.status"` today), and that verb can change without the fault changing.

**When `shall status` answered, run `shall board --json` as well**, and only then: the board needs a project the same way status does, so it is not asked until status has proved there is one. If the board fails after status answered, quote its sentence in part 2 and compute the rest from status alone. Those two answers are the whole of what parts 2 and 3 are computed from. Do not read the spec folder, a ledger, or a node file to fill a gap in them: what this command reports is what the project says about itself, and a guide assembled by hand would disagree with the screen.

## Step 1 — load the skill

Load `shall:shall-help` with the Skill tool. One skill and not two: the authoring skill is how a node file is written, and this command writes none.

If the namespaced specifier is refused, read the file directly instead and follow it the same way:

- `${CLAUDE_PLUGIN_ROOT}/skills/shall-help/SKILL.md`

## Step 2 — whose question this is

There are two doors for a question and this command is one of them. Before answering, decide which door the words were meant for:

| The question is about | It sounds like | Where it goes |
|---|---|---|
| Shall — the tool, a command, a flag, a colour, a mark, a card, a word on the screen | "what does yellow mean", "what is Fix Spec", "how is `--auto` different from `--dry`" | here, answered from the skill's part 1 |
| the user's own next step — what to run, whether to wait, whether something is finished | "what do I do now", "is the plan done", "can I start building" | here, as part 3 narrowed to it |
| the project — the thing being specified or built, what a node says, whether some part of the system is right, why it behaves the way it does | "the payment side seems off", "is X wrong", "why does Y do Z", "should we look at the login flow", "what does R-0014 actually say" | `/shall:raise <the question>`, and you do not answer it |

The test is what the answer would be made of. An answer made of Shall's own vocabulary and the two readings from step 0 is this command's. An answer that would need a node's body, the code, git history, or a judgment about whether the specification is right is `/shall:raise`'s — that process explores, diagnoses and lets the person decide, and it is the door built for exactly this. When the words belong there, the redirect is the whole answer: say in one line that this is a question about the project and that `/shall:raise` is where it goes, quote their words back inside that command so they can run it as it stands, and stop — no part 2 and no part 3, because a reading of the project's state offered beside a question about the project is half an answer to it, and a half-answer is the one thing this command must not give. Do not open a node, do not grep the code, do not begin the diagnosis as a courtesy: an answer half-given here is a `/shall:raise` run with its landing missing. If the gate found no project, say that `/shall:raise` is the door for it once `shall init` has run.

A question that mixes both — "the payment side seems off, what should I do" — is answered on the Shall half (what to do with a doubt: `/shall:raise <the doubt>`) and sent on for the project half.

## Step 3 — hand over

Enter `shall-help` with the two answers from step 0 and the question, if there was one, and follow that file: part 1 as it is written there, part 2 computed from those answers and nothing else, part 3 as the tree says. Say the recommended command; never run it and never offer to — the one thing this command does is point. When it is finished, stop: nothing was written, nothing was registered, and nothing is waiting on anyone.
