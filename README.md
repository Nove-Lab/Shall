# Shall

Shall is a local, spec-driven control plane for AI coding agents. This M0
contains project initialization, opening and recent-project persistence, plus
the shell the planes fill: Control plane panels, the Spec plane canvas and
Settings. The Spec plane holds real nodes, and the Control plane's Review Queue
is filled — bundles of what a person still has to decide, computed from the
graph and three ledgers on every read. The other three panels are still empty.

## Layout

The folders are the modules in [`ARCHITECTURE.md`](./ARCHITECTURE.md), one for
one.

```
core/       graph store arith serialize exchange   — no host underneath
daemon/     http service host                      — the only Shall process that writes spec files
apps/web/   control spec settings shell home       — the localhost screen
client/cli/                                        — the `shall` command
```

`core/serialize` is the file format itself: the canonical emitter, the lenient
reader and the per-type starting files (the reference templates and the
scaffolds `shall add-spec-node` writes). `core/store` is the folder around them —
what a directory of markdown amounts to when it is read at once, and how a
write lands. `core/arith` holds the arithmetic: the colour chain — red for an
error to fix or a standing rejection, yellow for a judgement still owed, green
for both settled — the open/closed mark on a criterion, and the review queue's
bundles, all computed from the graph and the ledgers on every read and stored
nowhere.
`core/exchange` stays an empty frame: the session broker it was to hold is not
being built, because git holds the history, the merges and the review it
existed to provide.

## Routes

Everything inside a project is scoped by its id, so a link is enough to put
someone on the same panel — there is no hidden "current project" state.

```
/                                        Project picker
/p/:projectId/control                    Overview — four panels
/p/:projectId/control/:panelId           Panel detail
/p/:projectId/control/review-queue/:id   One review bundle — the card
/p/:projectId/spec                       Spec plane canvas
/p/:projectId/spec?node=<id>&back=<path> The same canvas, opened on one node
/p/:projectId/settings                   Settings
```

`panelId` ∈ `review-queue | task-board | activity-feed | vitals`. A bundle id is
`spec:<root>`, `report:<journal>` or `closure:<criterion>` — the node the bundle
hangs off, so the link says what it is about. `?node=` opens the node's panel
(add `&mode=edit` to land in the form) and `?back=` puts a **Back to review**
button in the toolbar, which is how a card sends you to the canvas and gets you
back.

## Spec plane

A node is a file, not a row: `.shall/spec/<band>/<Type>/<id>.md`, committed
alongside the code it specifies. The band folder — `domain`, `intent`, `plan`
or `execution` — is derived from the type and keeps the spec fanned out over
four drawers; the type folder is the type and the filename is the id, so
neither is written inside the file; an outgoing relation is a line in the
source node's own file and lives nowhere else; the timestamps are the file's
`mtime`. **Add node** opens the detail pane to write one, clicking a node on
the canvas opens the same pane to read it, and **Edit** turns that pane back
into the form with **Delete** beside **Save**. The specification itself is the
file's body: free markdown, edited as one wide field and rendered back exactly
as written — the `##` headings a template ships are a starting shape, not a
rule. A save rewrites the frontmatter canonically — one key order, one edge
order, LF, one trailing newline — so the same graph is always the same bytes
and `git diff` says only what changed. It also drops any comments and custom
ordering a hand-edited frontmatter was carrying; the body is kept as written.

The daemon re-reads the folder on every query, so a file you edit by hand or
pull in from a branch shows up with nothing to restart — and it watches the
folder too, so it shows up without being asked. A page left open sees an agent's
writes as they land: the queue rearranges, a colour moves, a badge counts one
more. Nothing is announced, because the alternative is a banner interrupting a
person to tell them the truth they were already reading. The one thing that does
speak up is a node changed underneath somebody who is editing it, where saving
would write over that change.

A file it cannot read costs only itself: that node and its relations drop out,
the rest of the graph keeps serving, and the sentence against it is what a
check reports.

Nothing stores a node's position, so the canvas lays cards out from the graph
alone — by band and type, and in the graph tab a card then slides down its own
column toward the cards it is related to — and they cannot be dragged. The grid
and graph tabs are two layouts of the same nodes. A relation is drawn by
dragging from one card to another and picking a type the canon allows between
them, and removed from the context menu on the line.

Every card carries a traffic light, computed on read — the execution band
too, because a record is written by an agent and read by a person like any
other node: red is an error to fix (a file that will not read, a node no live anchor
holds, an id that is referenced but gone, a claim outside its work log's
aim, or work logged under a task that is still blocked) or a rejection that still stands,
yellow is a judgement still owed (no approval yet, or changed since it was
approved), green is both settled. The
node panel is where a judgement happens — a full read for a new node, a line
diff against the approved version for a changed one, and for a deletion an
agent proposed (a `deletionProposed:` block it writes into the file's
frontmatter) the rationale, the impact and two buttons: approve the deletion
or reject it. Approving writes nothing into the node's file: it puts one record
— the hash of the node's content, who approved it and when — into the project's
approval ledger, `.shall/ledger/approvals.yaml`, which the daemon alone writes.
**Reject** (a button in the panel, or right-click on any yellow or green card)
asks for a rationale — what is wrong, and what it should be instead — and puts
the same kind of record into `.shall/ledger/rejections.yaml`; the node turns
red, the agent reads the sentence, and the moment the file changes the
rejection lapses by arithmetic and the node is yellow again. Withdrawing a
rejection removes its line. Approvals and rejections never erase each other; a
standing rejection outranks an approval. A colour is then arithmetic over the
spec and the ledgers: what the file says now against what the books remember,
so a node file carries no claim about its own approval and green has exactly
one manufacturer. Two types carry a second badge beside their id, independent of their colour.
An acceptance criterion wears a red **Open** or a green **Closed** — whether a
person has closed it over the evidence claiming it — and an implementation task
wears **Blocked**, **Ready** or **Done**: whether the chain above it is read and
everything it waits on is finished, which is exactly the Task Board's Implement
column, or whether a person has called the work done. The node panel has the
toggle for both: on once at least one claimant is attached and every one of them
is approved, it closes the subject over everything claiming it now — evidence
for a criterion, verification reports for a task; off asks for a reason and leaves it open
(see the Review Queue below). The daemon never commits on its
own — a **Commit spec** button appears when the project is a git repository and
the spec folder or a ledger has uncommitted changes, and makes one commit
scoped to `.shall/spec` and `.shall/ledger`. A file deleted by hand shows up
under the toolbar's problems dialog with a **Restore** button that brings it
back from git history — and if the ledger still holds its record, it comes back
green.

The lower node names what it aims at in its own file: a task targets the
criterion it means to close (`TARGETS`), a work log names the task it addresses
(`ADDRESSES`), an evidence claims the criterion it satisfies and a verification
report claims the one task it verifies (`CLAIMS`) — so
planning, starting work or making a claim never touches the criterion's or the
task's file, and never moves their approval. The claim is also what holds an
evidence to the graph at all: an evidence that claims nothing is an orphan,
red, whoever submitted it. One rule of grammar then ties the three files
together: a work log's evidence may claim only what the tasks that log
addresses target, and its verification report exactly one of the addressed
tasks themselves — a log under no task targets nothing, so any claim under it
breaks the rule too. Break it and both the work log and the claimant are red
— an error to fix, before anybody is asked to approve — with one sentence
naming the log, the task and the claims, under either node. The same rule is
asked of the aim itself one step earlier: **a task targets one criterion at
most**, because a task with two aims closes neither on its own and the board
could never call it done.

And **the plan may not wait on itself**. Two tasks that each wait on the other
are both red (`cyclic`) — no task on a loop can ever be called ready, so the
loop is a hole in the plan rather than a slow start — and so are two modules
that consume each other's contracts, which is the same fact one layer up:
neither can be built, read or replaced without the other, which is the whole of
what a module boundary promises. Every node on the loop carries the sentence,
each starting from itself, because the line to cut may be in any of their
files. Contracts themselves stay out of it: a loop runs *through* an interface
and there is nothing in that file to remove.

One more rule reads across the axes: **work is logged only under a task whose
turn has come**. A work log addressing a *blocked* task — its chain unread, or
something it waits on still open — is red (`premature`), and turns yellow again
by itself the moment the task becomes ready. Approve the chain first, then the
record.

A **?** button beside the view tabs opens the canon itself: every node type the
canon has, laid out in its four bands, and every relation it allows between
them, drawn in the same cards and lines as the board it explains. Click a type
and it lights what it touches. It is read-only, remembers nothing, and is
generated from `EDGE_GRAMMAR` and the type roster rather than transcribed — so
a relation added or turned around appears there with nobody editing the picture.

A work log names the commits its work produced in its own frontmatter — a
`commits:` list of shas, in the order they were made — the sha and nothing
else, because the message and the author are git's to answer for. The panel
shows them under the specification, and the edit form adds, changes and
removes them row by row (paste several and they split into rows; a row left
blank is dropped). There is no Commit node type any more: one line of fact
did not need a file of its own.

## Review queue

The Control plane's Review Queue shows what is waiting on a person, cut into
bundles. Nothing about a bundle is stored: every load recomputes them from the
graph and the three ledgers, so a save, a hand edit or a `git checkout` moves
the queue with nobody told. Four kinds:

- **Spec approval** — a subgraph of yellow nodes in the Intent and Plan layers,
  rooted at the topmost yellow node the scan meets (Goal → Actor → UseCase →
  Scenario → SystemResponsibility → Requirement → AcceptanceCriterion →
  Constraint → the Plan types; a satellite follows what it hangs off). The card
  shows the root's diff or full text, the members with their own diffs, a
  count per type, the green nodes in the same subgraph under "unchanged —
  confirm this is intended", and a cross-reference on any node another bundle
  also holds. Terms and domain entities come last, one bundle each.
- **Work report** — a Journal's subtree (`LOGS` → work logs → `SUBMITS`
  evidence and reports, `RECORDS` findings, plus the assumptions and questions
  a work log raised), with the journal's text in front and **Accept report**
  approving every yellow node under it in one write.
- **Task closure** — an implementation task that verification reports claim,
  every one of them approved, about whose current list nobody has said a word.
  The card shows the task, the reports claiming it (each with the work log that
  submitted it and its commits), and — as context, never as buttons — the
  criteria the task targets with their own marks. The two words are the
  criterion's two words, written under the task's id with `taskHash` and a
  `reports` map.
- **AC closure** — a criterion that something claims, every claim of it
  approved, about whose current list of evidence nobody has said a word (while
  a claim is still unapproved the criterion is simply open, and waits). Two
  words take it out of the queue:
  **Close** writes one record into `.shall/ledger/acceptances.yaml` — the
  criterion's hash and the hash of every piece of evidence claiming it now —
  and **Leave open…** asks for a reason and writes the same list, with the
  reason, into `.shall/ledger/rejections.yaml` under the criterion's id. Either
  record stands while the criterion and the list are what they were; a claimant
  added, withdrawn or rewritten, or a reworded criterion, lapses it and the card
  is back. Closing removes a standing "left open"; leaving open removes the
  acceptance — a criterion is in one book or the other, never both. Colour is
  no part of it: an unapproved claimant is on the list, shown yellow so you can
  see it, and a left-open criterion stays whatever colour its own books make it.

A spec-approval or work-report card has **Approve** and **Reject…** on every
node; a closure card lists what claims the subject and has **Close** and **Leave
open…**. Every row has **Open in Spec plane** (a question's says **Answer**),
and every card has one bundle-wide button. Approving or rejecting recomputes the queue at once: a
bundle whose members are all green is gone, and yellow that is left regroups
into new bundles. A rejected node stays listed, red with its rationale, while a
yellow root still reaches it; a rejection on its own leaves the queue — that is
the agent's turn — and the row you just wrote keeps an **Undo** until you leave
the page.

## Task board

The Control plane's Task Board is the other surface computed on read: what the
specification needs fixed, and what is ready to be worked on. Nothing about it
is stored, and nothing that fails a condition is listed with a reason — it is
absent, and it turns up of its own accord once the thing above it is settled.

- **Fix Spec** — every red node, in the order somebody would take them: a
  person's rejection first, with the rationale WHOLE (it is a work order, so it
  is never summarised), then the seams the grammar found — an orphan, a work
  log whose evidence claims a criterion its task does not target — then the ids
  nothing answers to, then the files that would not read at all.
- **Implement** — every implementation task that is not finished, whose
  prerequisites are all closed, and whose whole chain upwards is green: the
  task, its module, its responsibility and the goal above it, together with the
  requirements, criteria and constraints hanging off that chain. The gate is
  local — a yellow node in an unrelated part of the graph hides nothing here —
  and each row names the module it belongs to, the requirement it serves, the
  criteria it targets and any work already logged against it.

Settings edits real files: the daemon port lives in `~/.shall/config.json` and
the display name in `<project>/.shall/project.json`. Everything else on that
screen is a read-only fact shown next to the file it comes from.

The UI is built with shadcn/ui on Tailwind v4; `apps/web/components.json` is the
registry config, so `npx shadcn add <component>` works from `apps/web`.

## Project files

```
<project>/.shall/
  project.json                 id, display name, schema version
  .gitignore                   *.tmp — the only leaving Shall can make
  spec/<band>/<Type>/<id>.md   the graph: one file per node
  ledger/approvals.yaml        the approvals: node id → {approvedHash, by, at}
  ledger/rejections.yaml       the rejections: node id → {rejectedHash, by, at, rationale}
  ledger/acceptances.yaml      the closures: criterion id → {acHash, evidence: {id → hash}, by, at}
                               and task id → {taskHash, reports: {id → hash}, by, at}
```

`.shall/spec` and `.shall/ledger` both belong in the repository, and that is
the whole point of the arrangement: the spec and its judgements travel with the
code, git holds their history and their merges, and a fresh clone can be read
— and shows the same greens, reds and closed marks — before anyone has opened
it in the UI. Each ledger appears with its first record; a project that has
judged nothing has none. A ledger that will not read is a refusal, not a
screenful of yellow: the review says which book and why.
The `.gitignore` Shall writes covers one thing: the `*.tmp` a write leaves if
it dies between writing and renaming. It also ignored a `shall.db` for as long
as any folder still held one from before the spec moved into files; those files
are gone and the lines went with them. The 22 reference
templates are not in the project any more: they are the machine's, regenerated
under `~/.shall/templates/`, and a set an older Shall committed into a project
is removed on the next open.

Opening or creating a project also writes two deny rules into the project's
`.claude/settings.json` — `Read(~/.shall/**)`, Shall's own home, and
`Edit(/.shall/ledger/**)`, the books only the daemon writes — and `shall init`
runs `git init` when the folder is in no repository, because git is the spec's
only restoration material.

It writes one more file, and this one is Shall's own: `.claude/rules/shall.md`,
half a page an agent reads at the start of every session. What is on it is the
handful of things the files cannot say about themselves — that writing a spec
file is a proposal and not a decision, that a node is retired by proposing its
deletion rather than by deleting it, that the ledgers are nobody's to open, and
that a colour is asked for rather than worked out. It is generated output, kept
current on every open the way the reference templates are, so a hand edit to it
is lost; anything of your own belongs in another file beside it. There is one
adapter today, which is why the page lands under `.claude`.

## The `shall` command

Five subcommands go on top of `.shall/`, and between them they are what an
agent sees of a project without opening the browser. None of them reads a spec
file: each starts or reuses the daemon and asks it, because the daemon is the
one process that reads spec files for Shall — and a terminal that worked out a
colour for itself would be a second implementation of the colour chain, stale
the day a rule moves. The four that need a project already there find it by
walking up from the directory you are standing in, the way `git` does.

- `shall init` writes that folder into the current directory.
- `shall check [--scope <path>]…` reads the spec back and says how much the
  folder holds, then what is wrong with it, one file and one line each —
  problems that keep a file out of the graph, a ledger of the three that will
  not read, gaps where the graph does not hold together, and notes about
  non-canonical files. Problems and gaps exit 1. It still says nothing about who
  approved what: that is the review's, and `shall status` is why it can stay
  that way. One gap turns on a judgement all the same — a work log filed under a
  task that is still blocked, and a chain nobody has agreed to yet is one of the
  ways a task stays blocked.
- `shall status [--scope <path>]…` counts the reds, yellows and greens and then
  gives the colour node by node — why it is that colour in one word, the
  sentence a rule of the graph wrote against it, a standing rejection's
  rationale whole, the reason a subject was left open, a criterion's open or
  closed mark, a task's blocked, ready or done — and ends with the ids nothing
  answers to and the files that would not read. A deletion an agent proposed and
  the relations a file writes ride in the `--json` answer rather than the
  printed rows. It reads the ledgers' verdict and manufactures none of it, and
  when one of the three books will not read it refuses the whole run and names
  the book: `check` can report that as a row and go on counting, but every
  colour here is counted out of the books, and a screenful of yellow that is
  really an unreadable ledger is a lie with a colour.
- `shall board` is the Task Board in a terminal: Fix Spec and Implement, the
  same two lists the panel draws, computed from the graph and the ledgers on
  every read — and refused outright, like `status`, when a book will not read.
- `shall add-spec-node --type <Type>` starts a new node — the daemon picks the
  next free id, writes the starting file at its own path, and the command prints
  that path on its first line so an agent knows exactly where to write. One
  command for all 22 types; the type argument is resolved case-insensitively,
  and one the canon does not have is refused with the whole list.

A scope is a file, a folder, or the spec-relative prefix the rows are printed in
(`intent/Goal`), given as many times as there are places you care about, and it
narrows what is reported and nothing else. The graph is read whole either way,
because an anchor or the far end of a relation is usually in some other folder
and a narrowed read would answer a different question in the same words; a
check's counts stay whole-project for the same reason — the count is what the
folder holds, the lists are what you asked about. The exit code is decided after
the narrowing, so a scoped check passes or fails on that scope's account:
`shall check --scope intent` exits 0 while another band is full of gaps, which
is what a build script pointed at one folder is asking for. A ledger that will
not read is reported whatever the scope, because it sits beside the spec folder
rather than inside it and a book nobody can read poisons every judgement in the
project. A scope also carries the rows filed against the folders ABOVE it: a
folder that would not list, or one whose name is no type, is the answer to why
nothing is there, and it would be a strange narrowing that hid it.

Each of the five takes `--json`, and then stdout is exactly one object and
nothing else: the answer, or `{"error": …}` carrying the sentence the call was
refused with. The exit code is 1 only when the call itself failed or `check`
found problems or gaps — a red node, a standing refusal and an empty board are
answers, not errors, so a caller branches on the content and never on the code.
That is the machine-readable contract an agent's tooling consumes.

`shall help` is the sixth command and the one that starts nothing: it prints to
stdout the screen those five shapes are quoted from, and `shall --help` is the
same command. The contract above begins once the words parse, and a line this
client cannot read never gets that far — an option a command does not take, a
`--scope` with no path after it, a word that is no command at all. Each is
answered on stderr with the one shape that would have worked, or with that whole
screen for a name nothing answers to, and exits 1 before a daemon is started or
a folder is read, whatever `--json` was in the line.

There is no `shall approve`, `shall reject` or `shall close` and never will be:
a judgement is made by a person in the browser.

## Development

Requires Node.js 22.5+ and Bun.

```bash
bun install
bun run dev
```

The app is available at `http://localhost:9461`. In development, the daemon
proxies page and HMR WebSocket traffic to Vite on port 5173.

To expose both development servers outside WSL's loopback interface:

```bash
bun run dev --host
```

`bun run typecheck` builds `core` first, because cross-package imports resolve
through built `dist/`. `bun run test` does the same and then runs the package
suites — the file format's golden bytes, the loader's refusals, the door
sentences the panel shows, and the words the command line reads before any of it
is started.

## Production-shaped local run

```bash
bun run build
cd client/cli
bun link
shall
```

`shall` reuses a running daemon when possible and opens
`http://localhost:9461`. Use `shall --host` to bind the daemon to `0.0.0.0`;
without the flag, both development and production default to `127.0.0.1`.
Project data lives in each project's `.shall/` directory; the local registry
and daemon state live in `~/.shall/`. The active daemon writes its PID and
bound port to `~/.shall/daemon.json`; stale state is replaced on the next
`shall` launch.
