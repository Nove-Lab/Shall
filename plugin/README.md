# The Shall plugin for Claude Code

Shall keeps a specification as markdown files and asks a person to approve every
one of them. This plugin is the other half of that loop: it gives an agent the
process for producing those files, and it compiles each file the moment the
agent writes it.

It adds two commands. `/shall:specify` is the staged elicitation that fills a
project's intent and domain planes; `/shall:plan` is the design pass one layer
below, turning an approved specification into module designs, the contracts
between them, and the implementation tasks the board hands out. Both run phase
by phase, and both stop at each phase for a person to approve what they wrote
in the Review Queue.

## What it needs

A Shall whose CLI knows `shall status` and `shall board`. Both landed in the
round this plugin was written for, and neither command starts without them. The
first act of each is a `shall status --json` call: an `Unknown command:` there
means the CLI is behind, and the substring `-procedure on path "spec.status"`
means the running daemon is — the router writes the verb it wanted into that
message (`No "query"-procedure on path "spec.status"`), so the substring is what
the commands match on. Either way the answer is to upgrade Shall.

The folder you run in must already be a Shall project. `shall init` makes one.

`/shall:plan` needs one thing more: a specification a person has approved above
whatever it is being asked to plan. It walks the responsibilities the direction
touches, up to the goals and out to the criteria and constraints, and refuses to
start if any of those is not green — naming the ids and sending you to
`/shall:specify`. That set is exactly what a task's readiness is computed over
later, so a plan built on an unread node would produce tasks nobody could start.

## Running it without installing

```bash
claude --plugin-dir /home/yjshin/dev/Shall/plugin
```

After editing any file in here, `/reload-plugins` in the running session picks
the change up; there is no need to restart Claude Code.

Before committing a change to the plugin:

```bash
claude plugin validate ./plugin --strict
node scripts/lint-plugin.mjs
```

The first checks the manifest and the file layout. The second checks the prose:
that every relation the skills name is a relation the canon actually has, that
every `--type` names a canon node type, and that every command the docs tell an
agent to run exists. Prose is this plugin's whole payload, so it gets a compiler
too.

## What each piece does

| Path | What it is |
|---|---|
| `.claude-plugin/plugin.json` | the manifest. `name` is `shall`, which is what puts both commands under `/shall:` |
| `commands/specify.md` | the entry point for the specification. Checks the CLI is current, loads the two skills, works out which phase the request enters at, and hands over |
| `commands/plan.md` | the same, one plane down — and one question more: whether the specification above the direction has been approved |
| `skills/shall-authoring/` | how a spec node file is written: the path, the id, the frontmatter, the relation lines, and what to do when a check refuses one |
| `skills/shall-specify/` | the elicitation process itself, one file per phase |
| `skills/shall-plan/` | the design process: modules, contracts, tasks — one file per phase |
| `hooks/hooks.json` | wires the hook to `Write`, `Edit` and `MultiEdit` |
| `hooks/check-spec.mjs` | runs `shall check --scope <file>` after any write under `.shall/spec/`, and hands the findings back to the agent by exiting 2 |

A command carries no process. It dispatches and delegates, so a change to how a
phase runs is a change to one skill file and to nothing else.

## The hook, and the sentence it will show you

Every write or edit of a `.md` file under a `.shall/spec/` folder is checked at
once. Anything else — source code, notes, a file somewhere else entirely — exits
silently, and the hook costs that write nothing.

A newly written child node reports **no live anchor** until its parent gains the
relation line that reaches it. That is not a failure and it is not fixed by
editing the child: a relation lives in the file of the node it leaves, so a new
Scenario is held to the graph by a line in the UseCase's file. Write the child,
then write the parent's line, and the sentence goes away.

If the hook says the `shall` CLI is not on PATH, nothing was checked. Link the
CLI (`bun link` in `client/cli`) and the loop resumes.

## What this plugin does not do

It never approves anything. There is no `shall approve`, no `shall reject` and no
`shall close`, and there never will be — a judgement is a person's, made in the
browser, and the plugin's job ends at telling the user that cards are waiting.
An agent that could approve its own work would make green mean nothing.

It also does not write ledgers. `.shall/ledger/` belongs to the daemon; the
plugin reads what those books hold through `shall status` and `shall board` and
opens neither.

## Not yet

The execution plane has no command. Journals, work logs, evidence and
verification reports — the records an agent leaves while doing the work
`/shall:plan` laid out, and the claims a person closes a criterion or a task
over — are still written by hand or in the browser. The plane itself is whole:
the canon has the types, the board's Implement half hands out the tasks, and
the aim rule already governs what a record may claim. What is missing is the
process document and the skill that would run it.
