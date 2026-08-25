---
name: shall-help
description: Carries the Shall /help guide — what Shall is in a screen, the command map, the colours and marks; then where this project stands, read out of shall status and shall board; then the one or two commands that move it next. Reads two answers, writes nothing, runs nothing, and lives outside a project too. Loaded by the /shall:help command.
allowed-tools: Bash(shall:*)
user-invocable: false
---

# Shall /help

**This page is the guide.** The other process skills carry a procedure and leave the words to the starting files; this one carries its own words, because for a guide the words are the product. Three parts, in this order, and the whole of it fits on one screen: part 1 as written here, part 2 in three to five sentences, part 3 in one recommendation or two. Say all three in the conversation's language; command names, flags and the colour words stay as they are.

## Part 1 — what Shall is

Say this as it is written here, and do not lengthen it.

Shall keeps a project's specification as a graph of markdown files — one file per node, from goals down to acceptance criteria, modules, work items and the journals of work done — and asks a person to approve every one of them in the browser. Agents run the processes that write the files; a person judges them in the Review Queue; `shall status` and `shall board` report what the judgments add up to, and the agents ask rather than work it out. Nothing is built on a node nobody has approved.

| Command | What it does |
|---|---|
| `/shall:specify <what you need>` | the staged interview that writes the intent and domain planes, one approved phase at a time; `--auto` runs every phase through and asks for approval once at the end |
| `/shall:plan <direction>` | one plane down — modules, contracts and work items, from an approved specification, after a plan you agree to in the terminal; `--auto` skips that yes |
| `/shall:work` | one turn of work from the board, written up as a journal for the queue; `--auto` runs it without stopping, `--dry` forecasts it and writes nothing. `/shall:work.todo` is its survey alone, `/shall:work.report` its write-up alone |
| `/shall:raise <question>` | a doubt about the project: explores, says what it found, and lands a finding, a decision you dictated, both, or nothing |
| `/shall:help [question]` | this guide. `shall help` on the command line is its machine-side twin: the CLI's own usage screen, for an agent rather than for you |

| Mark | Meaning |
|---|---|
| red | something is wrong — a rejection standing, or a rule of the graph broken. It sits on the board's Fix Spec half and comes before new work |
| yellow | written and not yet judged — waiting on a person in the Review Queue |
| green | approved as it stands |
| open, closed | a criterion or a work item: closed once a person accepts the claims made on it |
| blocked, ready, done | a work item's standing: ready is what `/shall:work` can take today |

## Part 2 — where this project stands

Computed from the two answers the command handed you — `shall status --json` and `shall board --json` — and from nothing else. Count what they say; never decide anything they did not.

| Say | Count it from |
|---|---|
| what has been written, per band — "the intent plane holds 14 nodes, the domain plane 6, the plan plane 9, nothing in execution yet" | `nodes[].band` — `Domain`, `Intent`, `Plan`, `Execution`; a band with no rows is "nothing yet". There is no phase or gate field anywhere in the answer, so progress is said per band and never as a phase number |
| how much of it is judged — "5 are red, 3 yellow, 21 green" | `nodes[].color`; name a zero only when it is the whole story |
| what a person refused — "2 of the red carry a rejection somebody wrote" | `nodes[].rejection` is not null |
| criteria and work items — "8 criteria open and 4 closed; 2 work items ready, 3 blocked, 1 done" | `closure` on rows whose `type` is `AcceptanceCriterion`; `workItemState` on rows whose `type` is `WorkItem` |
| the board — "Fix Spec has 2 items; 2 work items are ready to start" | `fixSpec.length`, `implement.length` |
| what will not read — "1 file the graph refused, 1 id nothing answers to" | `broken.length`, `missing.length`; said only when not zero |

Three things the two answers do not carry, and what you say instead:

- **The Review Queue's cards.** A card is a bundle computed in the browser; neither answer lists them. So say "n yellow nodes are waiting to be judged", never "n cards".
- **A phase or a gate.** Neither answer has one. Progress is per band: which bands hold nodes, and how much of each is green.
- **A node's body, or any mark inside a finding.** Not in the answers, and not opened. If a count you want is not in the two answers, say it is not known; do not open a file to find it.

You never decide a colour, a readiness or a closure yourself — not from the relations, not from the file, not from what seems reasonable. If the status says a node is yellow, it is yellow. You never open `.shall/spec/`, `.shall/ledger/`, or a node file to improve a count: this command reads two answers and no file, and a number you worked out by hand would disagree with the screen.

## Part 3 — what to do next

Walk this table from the top; the first row that matches is the recommendation. If a second row also matches it may be said after the first, as the second thing, and nothing after that. Three choices is a menu, and a guide that hands out a menu has stopped guiding.

| # | The state | Read it as | Say |
|---|---|---|---|
| 1 | the gate found no project | nothing to read | "`shall init` makes this folder a Shall project — run it, then ask again." Parts 2 and 3 are otherwise skipped |
| 2 | no row in `nodes` has `band` `Intent` | nothing has been specified | "Start with `/shall:specify <what you need>` — what to build comes before everything else." |
| 3 | any row's `color` is `red` | something needs fixing, and the board's Fix Spec half holds it | "There is something to fix — `/shall:work` takes Fix Spec before anything new." If any red row's `rejection` is not null, add: "n of them a person rejected and wrote why; the rationale is the work order." |
| 4 | any row's `color` is `yellow` | judging is waiting on a person | "n nodes are waiting to be approved in the browser — `shall` with no arguments opens the Review Queue, and approval is what lets things move." |
| 5 | `implement` is not empty | work can start | "n work items are ready — `/shall:work` runs a turn of implementation. The first time, `/shall:work --dry` shows the forecast before anything is written." |
| 6 | every row green and no row has `band` `Plan` | approved, and nothing planned against it | "The specification is approved and nothing is planned against it yet — `/shall:plan <direction>` turns it into modules and work items." |
| 7 | every row green, no `AcceptanceCriterion` row has `closure` `open`, and both halves of the board are empty | this stretch is finished | "This stretch is complete — when there is a next intent, `/shall:specify <what you need>` is where it starts." |
| 8 | anything else — green, a criterion still open, an empty board | what is left is judged in the browser | "Nothing is red, nothing is yellow and no work item is ready; what remains is waiting on a person in the browser — a closure to accept, or a work item whose prerequisite is not closed yet. `shall` with no arguments opens it." |

**A question focuses this part.** When the user asked something, answer it with the rows that bear on it — still from the top, still at most two. "Can I start building?" is row 5 when it matches and, when it does not, the first row that does, said as the reason not yet. A question about a word or a command ("what is Fix Spec") is answered from part 1 in a sentence or two, and part 3 is then the tree as usual, short.

**Say the command; never run it, never offer to.** The recommendation is the name of a door. "Shall I run it for you?" is not a sentence this guide says — the survey's rule is the rule here: say it, do not run it. Do not pick anything, do not start anything, and do not open a file in order to change it.

## Discipline

- **Writes nothing.** Not a node, not a note, not a scratch file. The tools that write are refused by the command, and this page says it again so it holds when the command is not the one that loaded you.
- **Registers nothing.** No `shall log` from here: a guide is not an activity, and the feed records activities. A reading that logged itself would be a reading in the book of doings.
- **Runs nothing.** Not the command it recommends, not `shall init`, not `shall` with no arguments — that one starts the daemon and holds the terminal until it is killed.
- **Reads two answers and no file.** `shall status --json` and `shall board --json` are the whole of its material. No spec file, no ledger, no node body.
- **Lives outside a project.** Part 1 is true in an empty folder. When the gate said there is no project, part 1 and the `shall init` line are the whole answer, and that is a finished job and not a failed one.
