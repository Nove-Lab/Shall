# The Shall plugin for Claude Code

Shall keeps a specification as markdown files and asks a person to approve every one of them. This plugin is the other half of that loop: it gives an agent the process for producing those files, and it compiles each file the moment the agent writes it.

It adds seven commands — two for the specification, four for the work done against it, and one guide.

`/shall:specify` is the staged elicitation that fills a project's intent and domain planes; it runs phase by phase and stops at each phase for a person to approve what it wrote in the Review Queue — or, with `--auto`, runs every phase through and asks for that approval once at the end. `/shall:plan` is the design pass one layer below, in two stages: first it plans the way an agent plans anything — reads the repository, scouts and proposes the stack, draws the module boundaries, cuts the work — and puts the whole plan to you for one yes, writing nothing; then it transcribes the agreed plan into modules, their contracts, the work items the board hands out and the one technology decision, in a single pass, and hands it to the Review Queue once. Its `--auto` skips the yes in the terminal and nothing else. Neither flag moves a browser judgment: what an agent writes is yellow until a person approves it.

`/shall:work` runs one turn of the work cycle: it surveys the board, proposes a bundle of at most three items, leaves the development itself alone, and writes the turn up as one journal for the queue — with `--auto` to run it without stopping and `--dry` to forecast it without writing. Its two parts are commands of their own: `/shall:work.todo` surveys and writes nothing, `/shall:work.report` writes up work already done, reconstructing it from git when the notes are gone. `/shall:raise <question>` is the other door — for a doubt rather than a request: it explores, says what it found, and records a finding, a decision the person dictated, both, or nothing. `/shall:help [question]` is the guide: what Shall is in a screen, where this project stands, and the one or two commands that move it — the one command that answers outside a Shall project. Every process — specify, plan, a turn of work, a landed question — ends by asking the daemon, through `shall log`, to put one line in the project's Activity Feed; a Shall that does not know the word costs the run one sentence and nothing else.

**The four work commands have no phase gate to move.** They finish a turn in one session and hand the record to the queue, because a record is read after the fact rather than agreed to in advance — which is why they need no flag to say so.

## What it needs

A Shall whose CLI knows `shall status` and `shall board`. Both landed in the round this plugin was written for, and neither command starts without them. The first act of each is a `shall status --json` call: an `Unknown command:` there means the CLI is behind, and the substring `-procedure on path "spec.status"` means the running daemon is — the router writes the verb it wanted into that message (`No "query"-procedure on path "spec.status"`), so the substring is what the commands match on. Either way the answer is to upgrade Shall. `shall log` is the third the plugin calls and the one whose absence is tolerated: it is asked for once at the end of a run, and if it fails the run says so in a line and finishes as it would have.

The folder you run in must already be a Shall project. `shall init` makes one.

`/shall:work` needs a board with something on it — a plan whose work items are ready, or a specification with something red in it. An empty board is not an error there: the turn ends before it starts, and what unblocks it is a person judging what is waiting, or `/shall:plan` cutting more work. `/shall:raise` needs neither, only `shall status`. `/shall:help` needs nothing at all: it is the one command that answers in a folder that is not a Shall project, and its first advice there is `shall init`.

`/shall:plan` needs one thing more, and `--auto` does not relax it: a specification a person has approved above whatever it is being asked to plan. It walks the responsibilities the direction touches, up to the goals and out to the criteria and constraints, and refuses to start if any of those is not green — naming the ids and sending you to `/shall:specify`. That set is exactly what a work item's readiness is computed over later, so a plan built on an unread node would produce work items nobody could start.

## Running it without installing

```bash
claude --plugin-dir /Users/yjshin/dev/nove/Shall/plugin
```

A relative path works too, and is resolved against wherever `claude` was started — which is the project you are working in, not this repository.

After editing any file in here, `/reload-plugins` in the running session picks the change up; there is no need to restart Claude Code. A change to the canon needs `bun run build:core` first, or the prose is linted against a stale copy of it.

Before committing a change to the plugin:

```bash
claude plugin validate ./plugin --strict
node scripts/lint-plugin.mjs
```

The first checks the manifest and the file layout. The second checks the prose: that every relation the skills name is a relation the canon actually has, that every `--type` names a canon node type, and that every command the docs tell an agent to run exists. It also asks of every file in `commands/` — not one by name — that the user's own words reach the process through `$ARGUMENTS`, so a command added without that slot fails here rather than in somebody's session. Prose is this plugin's whole payload, so it gets a compiler too.

## What each piece does

| Path | What it is |
|---|---|
| `.claude-plugin/plugin.json` | the manifest. `name` is `shall`, which is what puts every command under `/shall:` |
| `commands/specify.md` | the entry point for the specification. Reads `--auto`, checks the CLI is current, loads the two skills, works out which phase the request enters at, and hands over |
| `commands/plan.md` | the entry point for the plan. Reads `--auto`, checks the CLI, loads the two skills, settles new mode or revision mode — and asks one question more: whether the specification above the direction has been approved, which `--auto` does not excuse |
| `commands/work.md` | one turn of the cycle. Reads `--auto` and `--dry`, checks the CLI, loads the skills, and hands over at the survey |
| `commands/work.todo.md` | the survey alone, with the writing tools refused outright |
| `commands/work.report.md` | the write-up alone, which is always the reconstruction — and the way back after a session broke off mid-turn |
| `commands/raise.md` | a question rather than a request. Refuses to start without one |
| `commands/help.md` | the guide. Answers outside a project, reads two answers, recommends at most two commands and runs none of them; a question about the project is sent to `/shall:raise` unanswered |
| `skills/shall-authoring/` | how a spec node file is written: the path, the id, the frontmatter, the relation lines, what to do when a check refuses one, and when something you noticed is worth a finding |
| `skills/shall-specify/` | the elicitation process itself, one file per phase |
| `skills/shall-plan/` | the design process: the planning stage, its three criteria files — modules, contracts, work items — and the transcription stage |
| `skills/shall-work/` | the work cycle: the survey, the handover into the stretch outside Shall and the self-check on the way back, the record, and the forecast — one file per part |
| `skills/shall-raise/` | the question process, and the mechanics of its four landings |
| `skills/shall-help/` | the guide's own words: what Shall is in a screen, how the project's standing is read out of status and board, and the tree that turns it into a next step |
| `hooks/hooks.json` | wires the hook to `Write`, `Edit` and `MultiEdit` |
| `hooks/check-spec.mjs` | runs `shall check --scope <file>` after any write under `.shall/spec/`, and hands the findings back to the agent by exiting 2 |

A command carries no process. It dispatches and delegates, so a change to how a phase or a stage runs is a change to one skill file and to nothing else — with one stated exception: `shall-help` carries its own part 1 in its body, because for a guide the words are the process.

## The hook, and the sentence it will show you

Every write or edit of a `.md` file under a `.shall/spec/` folder is checked at once. Anything else — source code, notes, a file somewhere else entirely — exits silently, and the hook costs that write nothing.

A `Finding` is the one node this never happens to: nothing has to hold it. One a work log records is read inside that log's report, one nothing records stands alone and reaches the queue as a card of its own, and neither is a hole to fill. A `WorkLog` written together with its own line at the work item it addressed is likewise whole the moment it lands.

A newly written child node reports **no live anchor** until its parent gains the relation line that reaches it. That is not a failure and it is not fixed by editing the child: a relation lives in the file of the node it leaves, so a new Scenario is held to the graph by a line in the UseCase's file. Write the child, then write the parent's line, and the sentence goes away. A node the canon holds by a line it draws itself reads that the other way round: a `Decision` is anchored by its own `AFFECTS`, an `Evidence` and a `CompletionReport` by their own `CLAIMS`, so the line the check asks for belongs in the file just written. A `WorkLog` is held either way — from above, or by its own `ADDRESSES` — so for it the sentence names a choice rather than a wait; a `WorkItem` is held by a module's `ALLOCATES` alone, so for it the sentence names the module's file.

If the hook says the `shall` CLI is not on PATH, nothing was checked. Link the CLI (`bun link` in `client/cli`) and the loop resumes.

## What this plugin does not do

It never approves anything. There is no `shall approve`, no `shall reject` and no `shall close`, and there never will be — a judgment is a person's, made in the browser, and the plugin's job ends at telling the user that cards are waiting. An agent that could approve its own work would make green mean nothing.

It also does not write ledgers, and it does not read them. `.shall/ledger/` belongs to the daemon; the plugin reads what the three books hold through `shall status` and `shall board` and opens none of them. The one line it leaves under that folder — a record in the Activity Feed that a run finished — goes through `shall log`, so the daemon holds the pen, the kinds are the four finished-process kinds and never a judgment — the feed holds what runs logged, and nothing a person did in the Review Queue — and the feed is never read back: it is the person's news page, and nothing the plugin does depends on it.

And it never decides. A `Decision` is a person's judgment, so the place one is written is `/shall:raise`, and only as dictation of a judgment the user has settled — what they decided and what it changes to — with one exception the plan process owns: the project-wide technology choice the user confirmed in `/shall:plan`'s first stage, written as a decision so the modules can refer to it rather than restate it, and under `--auto` the stack the repository or the direction already named, written so a person can judge it. An agent that reached its own conclusion and filed it as a decision would be putting words in somebody's mouth in a file that outlives the conversation.

## Not yet

**Nothing locks on a finding marked as blocking, and nothing is going to.** The mark is the author agent's judgment, written so the next person or session sees it; no gate reads it, the queue does not order by it, and no work item is blocked or freed by one. What happens because of one happens in `shall-work` — the agent stops that item and says so — which is process rather than arithmetic, and deliberately so.

**A turn that breaks off mid-session leaves nothing behind but git.** There is no note file, no scratch state, no resume token: `/shall:work.report` reconstructs the turn from the commits and the specification, and asks about anything that left no commit. That is the whole recovery path, and it was chosen over persisting notes that would go stale the first time somebody edited the code by hand.

**Neither work command has been dogfooded yet.** `/shall:specify` and `/shall:plan` were each run against a weak model on purpose before they were trusted, and what those rounds turned up is folded into the prose the skills carry now. The work cycle has had no such round.

**`/shall:plan`'s two-stage shape has not been dogfooded.** The round that was run saw the earlier, phase-gated version; the two stages, the stack question and the one-pass write are what the next headless round checks.

**The feed has no read path for an agent, and is not going to get one.** `shall log` is write-only and answers yes or no; an agent that needs the past reads the graph and `shall status`. If a reason for reading ever appears it is a new question, not a flag.

**`/shall:help` has not been dogfooded.** Its three probes — an empty folder, a project, a project question — await a headless pass before it is trusted, and a session with a person has not happened.
