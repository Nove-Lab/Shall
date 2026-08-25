# Shall CLI Commands

`shall` is a thin client to the local daemon at `127.0.0.1:9461`.
Any command starts the daemon when it is not already running; the client itself computes and stores nothing, so every answer below is the daemon's reading of your project's spec files at that moment.
Run every command from inside the project folder.

## Opening the app

```
shall
shall --host
```

Opens the project's screen in your browser — the control plane (overview, review queue, work board, activity feed, vitals) and the spec graph.
`--host` additionally lets other machines on your network reach the same screen.

## Setting up a project

```
shall init [--json]
```

Makes the current folder a Shall project and is the whole install: it creates the `.shall/` spec tree and ledgers, registers the project with the daemon, and embeds the agent kit into `.claude/` — the `/shall.…` commands, skills and hook that Claude Code picks up in this project.
In a folder that is not a git repository it asks whether to run `git init` first.
It is idempotent: running it again in an existing project touches nothing you wrote and refreshes the embedded kit.
You end with two ways in — `shall` to open the app, or `claude` and then `/shall.help`.

## Reading the project

```
shall check  [--scope <path>]... [--json]
shall status [--scope <path>]... [--json]
shall board  [--json]
```

`check` reads the spec files and says what is wrong with them — files that will not parse, edges the grammar refuses, anchors that are missing.
`status` lists every node with its colour, plus what is missing or will not read; with `--json` this is the full per-node judgement, satisfaction included.
`board` answers the working question: what the spec needs fixed, and which work items are ready to be implemented.

## Writing

```
shall add-spec-node --type <Type> [--json]
shall log <kind> <summary> [--refs <id,id>] [--json]
```

`add-spec-node` starts a new node file of the given type with a fresh id and tells you where it is; you then write the body yourself.
`log` appends one line to the activity feed — a run finished, and what it finished — with `--refs` naming the nodes it was about.

## Help

```
shall help
```

Prints the same table as this page, one line per command.
An unknown or misspelled command answers with the same screen.

## Options that cross commands

- `--scope` may be given more than once; each one names a file or a folder of `.shall/spec`, narrowing the read to it.
- `--json` writes the answer as one JSON object on stdout and nothing else — for scripts and agents.
- `--refs` (on `log`) names the nodes a log line is about, as ids separated by commas.
