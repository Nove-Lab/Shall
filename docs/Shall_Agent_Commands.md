# Shall Agent Commands

These are the commands an agent session runs inside a Shall project.
`shall init` embeds them into the project itself as `.claude/commands/shall.*.md`, together with the skills they lean on — there is no marketplace and no install step, and a Claude Code session started in the project finds them as `/shall.…`.
Every command that writes does so through spec files, and everything written lands in the Review Queue: nothing becomes approved without a person's yes in the browser.

## `/shall.help`

```
/shall.help [a question about Shall, or about what to do next]
```

Answers what Shall is, or reads where this project stands and points at the one or two commands that would move it.
Writes nothing and runs nothing; it also answers outside a Shall project.

## `/shall.specify`

```
/shall.specify [--auto] <what you need, or what to change>
```

Elicits or revises the specification: it interviews you, writes the spec node files phase by phase, and hands each phase to the Review Queue for approval.
`--auto` runs every phase without stopping and asks for approval once at the end.
You end with a specification graph — goals, actors, use cases, scenarios, requirements, acceptance criteria — waiting in the queue.

## `/shall.plan`

```
/shall.plan [--auto] <the technical direction, or what to change>
```

Plans the layer below an approved specification: it reads the repository, proposes the stack, draws the modules, and cuts the work into work items.
It puts the whole plan to you for one yes, then writes it as one pass for the Review Queue.
`--auto` skips the yes in the terminal and nothing else.

## `/shall.work`

```
/shall.work [--auto | --dry] [what to pick, in your own words]
```

Runs one turn of the work cycle: surveys the board, proposes a small bundle of items, leaves the development to you, holds each item to its definition of done, and writes the turn up as one journal for the Review Queue.
It is the one command that can start from nothing — the board already knows what is red and what is ready.
`--auto` runs the turn without stopping; `--dry` forecasts it and writes nothing.

## `/shall.work.todo`

```
/shall.work.todo
```

The survey alone: the findings nobody has answered, what the specification needs fixed, the work items ready to start, and how much is waiting on a person.
Writes nothing at all.

## `/shall.work.report`

```
/shall.work.report [a commit range, or a note of what was done]
```

Writes up work already done — reconstructed from git and the specification when the notes are gone — as one journal with a log per item, and hands it to the Review Queue.
Use it when the work happened outside a `/shall.work` turn.

## `/shall.raise`

```
/shall.raise <what seems off, or what you are unsure about>
```

Brings a question: it explores and diagnoses without writing anything, then lands whatever the conversation settles — a decision you dictate, a finding, both, or nothing at all.
