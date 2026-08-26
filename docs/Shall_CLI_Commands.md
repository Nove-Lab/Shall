# Shall CLI Commands

`shall` is a thin client to the local daemon at `127.0.0.1:9461`.
Any command starts the daemon when it is not already running; the client itself computes and stores nothing, so every answer below is the daemon's reading of your project's spec files at that moment.
Run every command from inside the project folder.

The first three groups are the ones you type yourself.
The rest are what the embedded `/shall.…` agent processes run — you can type them too, but everything they answer, the browser already shows you.

## Opening the app

**For you.**

```
shall [--host]
```

Opens the project's screen in your browser — the control plane (overview, review queue, work board, activity feed, vitals) and the spec graph.
`--host` additionally lets other machines on your network reach the same screen.
Run from a folder that is not inside a Shall project and it says so, names `shall init`, and opens the app anyway — the picker is there and your other projects are in it.

## Setting up a project

**For you.** Once per project.

```
shall init [--json]
```

Makes the current folder a Shall project and is the whole install: it creates the `.shall/` spec tree and ledgers, registers the project with the daemon, and embeds the agent kit into `.claude/` — the `/shall.…` commands, skills and hook that Claude Code picks up in this project.
In a folder that is not a git repository it asks whether to run `git init` first.
It is idempotent: running it again in an existing project touches nothing you wrote and refreshes the embedded kit.
You end with two ways in — `shall` to open the app, or `claude` and then `/shall.help`.

## Upgrading

**For you.** On an installed binary.

```
shall upgrade
```

Fetches the newest published release, checks the download against the `SHA256SUMS` published beside it, and puts it where the running `shall` stands — one file, because Shall is one file.
Anything that goes wrong before that check passes leaves the binary exactly as it was.
It then restarts the daemon on the new binary, and a daemon rewrites every registered project's agent kit as it starts, so an upgrade reaches your projects without you opening any of them.
Run on the newest release it says so and changes nothing, so running it twice is safe.
A Shall running from a checkout refuses: there is no single file to swap there, and `git` is the upgrade.

`shall` and `shall init` also ask which release is newest — briefly, and silently when the question cannot be answered — and print one line when there is a newer one.
No other command asks, nothing is cached between runs, and no failure to ask is ever reported.

## Reading the project

**For agents.** These are how an agent orients itself before touching the spec; the browser says the same things on the Vitals, Work Board and spec plane pages.

```
shall check  [--scope <path>]... [--json]
shall status [--scope <path>]... [--json]
shall board  [--json]
```

`check` reads the spec files and says what is wrong with them — files that will not parse, edges the grammar refuses, anchors that are missing.
`status` lists every node with its colour, plus what is missing or will not read; with `--json` this is the full per-node judgement, satisfaction included.
`board` answers the working question: what the spec needs fixed, and which work items are ready to be implemented.

## Writing

**For agents.** The agent processes use these while carrying out a turn; what they write shows up in the app for you to review.

```
shall add-spec-node --type <Type> [--json]
shall log <kind> <summary> [--refs <id,id>] [--json]
```

`add-spec-node` starts a new node file of the given type with a fresh id and tells you where it is; you then write the body yourself.
`log` appends one line to the activity feed — a run finished, and what it finished — with `--refs` naming the nodes it was about.

## Help, and which Shall this is

**For either.** It is the screen whoever typed — you or an agent — meets after a typo.

```
shall help
shall --version
```

`help` prints the same table as this page, one line per command.
An unknown or misspelled command answers with the same screen.
`--version` answers with the semver alone, on one line, and starts nothing to say it.
There is one number for the whole install — this client, the daemon it starts and the agent kit that daemon writes into `.claude/` all ride it — so a daemon already running under a different one is restarted rather than adopted, and a daemon that starts rewrites the kit of every project the registry knows.

## Options that cross commands

- `--scope` may be given more than once; each one names a file or a folder of `.shall/spec`, narrowing the read to it.
- `--json` writes the answer as one JSON object on stdout and nothing else — for scripts and agents.
- `--refs` (on `log`) names the nodes a log line is about, as ids separated by commas.
