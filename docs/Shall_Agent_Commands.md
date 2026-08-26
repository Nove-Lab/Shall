# Shall Agent Commands

These are the processes an agent session runs inside a Shall project.
`shall init` wires them into the project itself for the agents you choose — there is no marketplace and no install step.
Every process is the same across agents; only the way you invoke it wears each agent's own grammar, so each section below names the process once and then gives the spelling per agent.
Everything a process writes lands in the Review Queue: nothing becomes approved without a person's yes in the browser.

## specify

**Claude Code** `/shall.specify [--auto] <what you need>` — **Codex** `$shall:specify [--auto] <what you need>`

Elicits or revises the specification: it interviews you, writes the spec node files phase by phase, and hands each phase to the Review Queue for approval.
`--auto` runs every phase without stopping and asks for approval once at the end.
You end with a specification graph — goals, actors, use cases, scenarios, requirements, acceptance criteria — waiting in the queue.

## plan

**Claude Code** `/shall.plan [--auto] <the direction>` — **Codex** `$shall:plan [--auto] <the direction>`

Plans the layer below an approved specification: it reads the repository, proposes the stack, draws the modules, and cuts the work into work items.
It puts the whole plan to you for one yes, then writes it as one pass for the Review Queue.
`--auto` skips the yes in the terminal and nothing else.

## work

**Claude Code** `/shall.work [--auto | --dry] [what to pick]` — **Codex** `$shall:work [--auto | --dry] [what to pick]`

Runs one turn of the work cycle: surveys the board, proposes a small bundle of items, leaves the development to you, holds each item to its definition of done, and writes the turn up as one journal for the Review Queue.
It is the one process that can start from nothing — the board already knows what is red and what is ready.
`--auto` runs the turn without stopping; `--dry` forecasts it and writes nothing.

## work.todo

**Claude Code** `/shall.work.todo` — **Codex** `$shall:work:todo`

The survey alone: the findings nobody has answered, what the specification needs fixed, the work items ready to start, and how much is waiting on a person.
Writes nothing at all.

## work.report

**Claude Code** `/shall.work.report [a commit range, or a note]` — **Codex** `$shall:work:report [a commit range, or a note]`

Writes up work already done — reconstructed from git and the specification when the notes are gone — as one journal with a log per item, and hands it to the Review Queue.
Use it when the work happened outside a work turn.

## raise

**Claude Code** `/shall.raise <what seems off>` — **Codex** `$shall:raise <what seems off>`

Brings a question: it explores and diagnoses without writing anything, then lands whatever the conversation settles — a decision you dictate, a finding, both, or nothing at all.

## help

**Claude Code** `/shall.help [a question]` — **Codex** `$shall:help [a question]`

Answers what Shall is, or reads where this project stands and points at the one or two processes that would move it.
Writes nothing and runs nothing; it also answers outside a Shall project.
