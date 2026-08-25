---
description: Elicit or revise a Shall specification — interviews the user, writes the spec node files, and hands each phase to the Review Queue for approval. --auto runs every phase without stopping between them and asks for approval once at the end.
argument-hint: [--auto] <what you need, or what to change>
disable-model-invocation: true
allowed-tools: Bash(shall:*), Read, Glob, Grep, Write, Edit, AskUserQuestion, Skill
---

The request, in the user's own words:

$ARGUMENTS

If that is empty, ask the user what they need specified and stop there. Do not start on a guess: every phase below spends the user's attention, and spending it on the wrong subject costs more than one question.

Read it for one flag before anything else:

| What you find | What it means |
|---|---|
| `--auto` | run the phases without stopping for the browser between them, and ask for approval once at the end. **Everything you would have asked the user is still asked** — the questions inside each phase, the explanation of what that phase means to write, and the yes before anything reaches disk. What moves is the browser judgment, and only that |
| the flag and nothing else | still ask what they need and stop. The flag settles how the run is judged, never what it is about |
| anything else | the request itself |

## Step 0 — the gate

Run `shall status --json` in the project directory before anything else. It is the version check and the entry dispatch at once, so nothing further down is decidable without it.

If the call fails, read **both** stdout and stderr, then match what you find:

| What the output holds | What it means | Tell the user, then stop |
|---|---|---|
| `Unknown command:` | the `shall` CLI is older than this plugin | Shall's CLI does not know `status` yet — upgrade Shall and run this again |
| the substring `-procedure on path "spec.status"` | the CLI is current but the running daemon is older | the Shall daemon is out of date — upgrade Shall, let it restart, and run this again |
| any message naming `.shall`, or saying this folder is not a Shall project | there is no `.shall` here | run `shall init` in this folder first |
| anything else | you do not know why the gate failed, and guessing is how a broken install turns into a spec nobody can load | the exact output, quoted verbatim, and that `/shall:specify` cannot start until `shall status` answers |

Match the daemon row on the substring, never on the whole sentence: the router writes the kind of procedure it wanted into the message the CLI hands on unchanged (`No "query"-procedure on path "spec.status"` today), and that verb can change without the fault changing.

Stop in every case. Do not work around any of them by reading the spec folder yourself: a specification written against a Shall that cannot read it back is a specification nobody has checked.

## Step 1 — load the skills

Load both with the Skill tool, in this order: `shall:shall-authoring`, then `shall:shall-specify`. The first is how a node file is written, named and anchored; the second is the process you are about to run.

If those namespaced specifiers are refused, read the two files directly instead and follow them the same way:

- `${CLAUDE_PLUGIN_ROOT}/skills/shall-authoring/SKILL.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/shall-specify/SKILL.md`

## Step 2 — entry dispatch

Read the status you got in step 0.

**Yellow in the intent or domain band → unapproved work, and it comes first.** A new session cannot tell a phase still waiting on a person from one nobody finished, and does not need to: either way nobody has agreed to those nodes, and the ids and their types name the phase they belong to. Ask with AskUserQuestion — carry that phase to its approval `(Recommended)`, or leave it standing and enter where this request lands — then follow the answer to a phase.

**Under `--auto` there is nothing to ask here.** Carrying a phase to its approval is what the end of this run does anyway, and it does it for everything at once. So name what is yellow, enter where the request lands, and say that the one approval at the end covers the older work as well as this run's.

One node sits in the intent band and is not this process's: **an `Assumption` a `Module` hangs off.** The canon gives an assumption no layer of its own and files every one of them with intent, so the band does not say whose it is — what it hangs off does, and a module's belongs to `/shall:plan`. Leave it standing.

**No nodes in the intent band → new mode.** The specification does not exist yet. Enter at phase 1 and run the phases in order.

**Nothing yellow, and nodes already there → revision mode.** Work out the highest layer the request touches, and enter there:

| The request is about | Enter at |
|---|---|
| what the product is for, who it is for, or what counts as success — a goal | phase 1 |
| an actor, a use case, or a scenario | phase 2 |
| a term, or a concept the vocabulary has to name | phase 3 |
| a system responsibility | phase 4 |
| a requirement, a constraint, or an acceptance criterion | phase 5 |

When the request genuinely fits two rows, ask with AskUserQuestion: one question, the candidate layers as options, the higher layer first with `(Recommended)` suffixed to its label. **Choose the higher layer whenever you are in doubt.** A change above stales what hangs below it and a change below never touches what is above, so entering too high costs one pass over nodes that turn out unchanged, while entering too low leaves the graph saying two things at once.

Revision mode has three standing rules the phases assume:

- **Work out what the change reaches, then narrow to it.** What hangs off a node is found by reading the relations `shall status --json` reports and walking them yourself until nothing new turns up — `--scope` is a path filter and follows no relation, so it cannot do that walk for you. Scope the commands to the paths the walk landed on; nodes outside it are not this run's business.
- **Revise, never replace.** Edit the file that is already there, so the node keeps its id and everything pointing at it keeps pointing. A new file for an old thought orphans the old one's children and leaves two answers in the graph.
- **Delete only when the user asks for it.** A node that has gone quiet is not a node to remove; removing one is a proposal a person judges in the browser like any other.

## Step 3 — hand over

Enter `shall-specify` at the phase you chose and follow that phase's file to the letter — its own page says which file each phase is. From here the process steers and you do not: do not compress two phases into one pass, do not answer on the user's behalf a question the phase puts to them, and do not carry on past a phase's approval gate because the next step looks obvious *(unless this is `--auto`, which moves the wait and not the order)*.
