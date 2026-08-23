# Shall

Shall is a local, spec-driven control plane for AI coding agents. This M0
contains project initialization, opening and recent-project persistence, plus
the shell the planes fill: Control plane panels, the Spec plane canvas and
Settings. The Spec plane holds real nodes, and the Control plane's Review Queue
is filled — bundles of what a person still has to decide, computed from the
graph and three ledgers on every read. The Work Board and the Vitals are
filled the same way, and the Activity Feed from a file of its own.

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

`panelId` ∈ `review-queue | work-board | activity-feed | vitals`. A bundle id is
`spec:<root>`, `report:<journal>`, `finding:<finding>`, `closure:<criterion>` or
`completion:<workItem>` — the node the bundle hangs off, so the link says what it is
about (the last one keeps its prefix because the card is about completion
reports). `?node=` opens
the node's panel — the reading pane, always — and `?back=` puts a
**Back to review** button in the toolbar, which is how a card sends you to the
canvas and gets you back. `/p/:projectId/control/activity-feed?month=YYYY-MM`
opens the Activity Feed on one month; without it the newest month on disk is
shown. The month is in the URL and nowhere else, for the reason above — a link
to a month is a link to that month — and the picker appears only when there is
more than one month file to pick from.

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
aim, or work logged under a work item that is still blocked) or a rejection that still stands,
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
one manufacturer. Four types carry a second badge beside their id, independent of their colour.
An acceptance criterion wears **Open** or **Closed** — whether a
person has closed it over the evidence claiming it — and a work item
wears **Blocked**, **Ready** or **Done**: whether the chain above it is read and
everything it waits on is finished, which is exactly the Work Board's Implement
column, or whether a person has called the work done. A requirement and a
scenario — the two types that carry criteria — wear **Sat** or **Unsat**: every
criterion the file demands is closed, or one of them is not. A carrier that
demands no criterion wears nothing, because unspecified is not unmet; and
since closure is a person's word over the evidence and reads no colour, a
criterion whose wording was later refused still counts as closed, so a carrier
can read **Sat** beside a red criterion. The finished words — **Closed**,
**Done**, **Sat** — are the filled emerald pill, the same hue as the green
square and a different shape; the rest are the design system's own quiet
badge, so an unfinished thing announces itself by its word and not by a
colour. The node panel has the
toggle for the two closure subjects: on once at least one claimant is attached and every one of them
is approved, it closes the subject over everything claiming it now — evidence
for a criterion, completion reports for a work item; off asks for a reason and leaves it open
(see the Review Queue below). The daemon never commits on its
own — a **Commit spec** button appears when the project is a git repository and
the spec folder or a ledger has uncommitted changes, and makes one commit
scoped to `.shall/spec` and `.shall/ledger`. A file deleted by hand shows up
under the toolbar's problems dialog with a **Restore** button that brings it
back from git history — and if the ledger still holds its record, it comes back
green.

The lower node names what it aims at in its own file: a work item targets the
criteria it means to close (`TARGETS` — none, one or several), a work log names
the work item it addresses (`ADDRESSES`), an evidence claims the criterion it
satisfies and a completion report claims the one work item it is filed about
(`CLAIMS`) — so planning, starting work or making a claim never touches the
criterion's or the work item's file, and never moves their approval. The claim
is also what holds an evidence to the graph at all: an evidence that claims
nothing is an orphan, red, whoever submitted it. A work item, likewise, is held
only by the module that `ALLOCATES` it — one no module allocates is an orphan,
red, however many criteria it targets. One rule of grammar then ties the three
files together: a work log's evidence may claim only what the work items that
log addresses target — the union of their `TARGETS` — and its completion report
exactly one of the addressed work items themselves — a log under no work item
targets nothing, so any claim under it breaks the rule too. Break it and both
the work log and the claimant are red — an error to fix, before anybody is
asked to approve — with one sentence naming the log, the work item and the
claims, under either node. A work item may target several criteria; it is
finished when a person closes it over the completion reports claiming it, not
when a criterion closes, so the count of its aims is the plan's to choose.

And **the plan may not wait on itself**. Two work items that each wait on the other
are both red (`cyclic`) — no work item on a loop can ever be called ready, so the
loop is a hole in the plan rather than a slow start — and so are two modules
that consume each other's contracts, which is the same fact one layer up:
neither can be built, read or replaced without the other, which is the whole of
what a module boundary promises. Every node on the loop carries the sentence,
each starting from itself, because the line to cut may be in any of their
files. Contracts themselves stay out of it: a loop runs *through* an interface
and there is nothing in that file to remove.

One more rule reads across the axes: **work is logged only under a work item
whose turn has come**. A work log addressing a *blocked* work item — its chain
unread, or something it waits on still open — is red (`premature`), and turns
yellow again by itself the moment the work item becomes ready. Approve the chain first, then the
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
the queue with nobody told. Five kinds:

- **Spec approval** — a subgraph of yellow nodes outside the execution record,
  rooted at the topmost yellow node the scan meets (Decision → Goal → Actor →
  UseCase → Scenario → SystemResponsibility → Requirement →
  AcceptanceCriterion → Constraint → the rest of the Plan types; an assumption
  follows what it hangs off). A decision is filed in the Plan band and still
  heads the order: it is the reason a revision was made, so everything it
  affects — a goal and a term as readily as a module — is one thing to judge,
  and only a type above all of them gathers that into one card. The card shows
  the root's diff or full text, the members with their own diffs, a
  count per type, the green nodes in the same subgraph under "unchanged —
  confirm this is intended", and a cross-reference on any node another bundle
  also holds. Terms and domain entities come last, one bundle each: a mention
  is a reference, and following those would put the vocabulary in every
  bundle. A decision's `AFFECTS` is the one edge that crosses into them,
  because a revision is not a reference — the term a decision is rewriting
  rides on the card that says why. One step, and no further.
- **Work report** — a Journal's subtree (`LOGS` → work logs → `SUBMITS`
  evidence and reports, `RECORDS` findings, plus the assumptions a work log
  raised), with the journal's text in front and **Accept report** approving
  every yellow node under it in one write.
- **Standalone finding** — a yellow `Finding` no living work log `RECORDS`:
  something brought between turns of work rather than found inside one, so
  there is no report for it to be read as part of. One card each, last in the
  queue because it decides nothing — reading it is the whole of what happens,
  and what answers it is a `Decision` somebody writes afterwards. **Accept
  finding** makes the same approval write the other two do.
- **Work item closure** — a work item that completion reports claim, every one
  of them approved, about whose current list nobody has said a word. The card
  shows the work item, the reports claiming it (each with the work log that
  submitted it and its commits), and — as context, never as buttons — the
  criteria the work item targets with their own marks. The two words are the
  criterion's two words, written under the work item's id with `taskHash` and a
  `reports` map — the two keys keep the names they were frozen under.
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

A spec-approval, work-report or standalone-finding card has **Approve** and
**Reject…** on every node; a closure card lists what claims the subject and has
**Close** and **Leave open…**. Every row has **Open in Spec plane**, and every card has one
bundle-wide button. Approving or rejecting recomputes the queue at once: a
bundle whose members are all green is gone, and yellow that is left regroups
into new bundles. A rejected node stays listed, red with its rationale, while a
yellow root still reaches it; a rejection on its own leaves the queue — that is
the agent's turn — and the row you just wrote keeps an **Undo** until you leave
the page.

## Work board

The Control plane's Work Board is the other surface computed on read: what the
specification needs fixed, and what is ready to be worked on. Nothing about it
is stored, and nothing that fails a condition is listed with a reason — it is
absent, and it turns up of its own accord once the thing above it is settled.

- **Fix Spec** — every red node, in the order somebody would take them: a
  person's rejection first, with the rationale WHOLE (it is a work order, so it
  is never summarised), then the seams the grammar found — an orphan, a work
  log whose evidence claims a criterion its work item does not target, a work
  item no module allocates — then the ids nothing answers to, then the files
  that would not read at all.
- **Implement** — every work item that is not finished, whose prerequisites
  are all closed, and whose whole chain upwards is green: the work item, its
  module, its responsibility and the goal above it, together with the
  requirements, criteria and constraints hanging off that chain. The gate is
  local — a yellow node in an unrelated part of the graph hides nothing here —
  and each row names the module it belongs to, the requirement it serves, the
  criteria it targets and any work already logged against it.

## Activity feed

The Control plane's Activity Feed is the third list, and the one that is read
rather than computed: what the agents have finished, newest first — kept in a
file of its own and an input to nothing. No colour, gate, board row or queue
card reads it; delete the folder and every colour, mark and board row is what
it was. One line is one finished run, and only an agent writes one, through
`shall log` at the run's end — `specify_done`, `plan_done`, `work_done` or
`raise_landed`, the four ends of a run — as the agent's own sentence, with the
ids the run was about. Nothing a person does in the Review Queue is written
here: an approval, a rejection or a closure goes into its book and nowhere
else, and the feed never says how anything was judged. The file is
`.shall/ledger/feed/YYYY-MM.yaml`, one per month of the daemon's UTC clock,
appended and never edited, and the panel shows one month at a time.

The table has four columns — Kind, Event, Refs, When — and one row per line,
newest first; nothing folds, because every line is one run and a run is its
own event. A ref is a link into the Spec plane, and **Back to review** returns
to the feed and its month. The Overview card shows the newest month's first
three rows. The sidebar badge stays at zero: nothing on this list is waiting
on anyone.

There is no command that reads the feed back, by design — an agent that wants
the past asks `shall status` and `shall board` — and the web's query is its
only reader. A month file that will not read costs this panel and nothing
else, and is never written over: the repair is the same as a book's, restore it
from git or move it aside. Because the folder sits under `.shall/ledger`, every
`shall log` lights **Commit spec** like a book would, and the commit carries
the feed with the books.

Settings edits real files: the daemon port lives in `~/.shall/config.json` and
the display name in `<project>/.shall/project.json`. Everything else on that
screen is a read-only fact shown next to the file it comes from.

The UI is built with shadcn/ui on Tailwind v4; `apps/web/components.json` is the
registry config, so `npx shadcn add <component>` works from `apps/web`.

## Vitals

The Control plane's Vitals say how far the specification has come and what it
still lacks — two groups, computed from the graph and the three ledgers on
every read and stored nowhere, exactly as the board is. The Overview card
shows four bars with their counts and one line about the checks; the page
shows the same four rows in full with what each one is made of, then the
checks one by one. Card and page ask the daemon the same question,
`spec.vitals`, so they cannot disagree, and the page's "Computed" stamp is the
moment that answer arrived — the daemon computes afresh on every ask and adds
no clock of its own.

**Progress** is four ratios, each a count of a word the review already wrote.
Scenario satisfaction and requirement satisfaction count the carriers wearing
**Sat** over the carriers that demand at least one criterion; a carrier that
demands none stays out of the ratio and is said beside it, "n unspecified",
never hidden. AC closure counts the criteria wearing **Closed** over every
criterion. Work item completion counts the work items wearing **Done** over
every work item, blocked ones included — a ratio over the ready ones alone
would rise as the work above them stalled — with "n blocked" beside it. Each
row opens: the unsat carriers with how many of their criteria are still open;
the open criteria in three reasons — nothing claims it, something claims it and
nobody has judged the list (with a link to its Review Queue card when that card
exists; evidence not yet approved means no card yet), or a person left it open,
with the rationale whole; and the blocked work items with what blocks each —
an unfinished prerequisite, an id nothing answers to, or a node of the chain
above it that is not green, itself included. Every node named is a link into
the Spec plane.

**Spec Health** is the residual layer: seven absences that are neither red
nor yellow — not a grammar fault, which is the Fix Spec board's, and not a
judgement waiting, which is the Review Queue's, but a thing that is not wrong
and not waiting and still not done. A requirement with no criterion; a scenario
with no criterion; an actor that performs no use case; a use case no scenario
details; a goal that reaches no responsibility along the chain (through its
sub-goals, if it has them); a module that allocates no work item; a criterion
no work item targets. Every rule is always a row, the violated ones first, each
with its nodes and the command that fills the gap; a clean one says it passed,
so "checked and clean" can be told from "nothing to check". Every living node
of a rule's type is examined whatever colour it wears, and the rows carry no
colour — a specification still being drafted is yellow all over, and that is
when "a requirement with no criterion" is worth saying. A violation is never
painted red. What a file wrote is what it has, and what lives and is closed is
what is met: a carrier whose criterion no file answers to is unsat rather than
unspecified, and the hole itself is the Fix Spec board's row, said once there.
Nodes in files that would not read are in no count at all; the Fix Spec board
owns them. A project with nothing living and nothing refused shows the start
here message in place of the figures. There is no score over the whole and
there will not be one — each figure stands on its own.

## Project files

```
<project>/.shall/
  project.json                 id, display name, schema version
  .gitignore                   *.tmp — the only leaving Shall can make
  spec/<band>/<Type>/<id>.md   the graph: one file per node
  ledger/approvals.yaml        the approvals: node id → {approvedHash, by, at}
  ledger/rejections.yaml       the rejections: node id → {rejectedHash, by, at, rationale}
  ledger/acceptances.yaml      the closures: criterion id → {acHash, evidence: {id → hash}, by, at}
                               and work item id → {taskHash, reports: {id → hash}, by, at} — the key names are frozen, the type was renamed
  ledger/feed/YYYY-MM.yaml     the activity feed: a month of {at, kind, refs, summary}, appended and never edited
```

`.shall/spec` and `.shall/ledger` both belong in the repository, and that is
the whole point of the arrangement: the spec and its judgements travel with the
code, git holds their history and their merges, and a fresh clone can be read
— and shows the same greens, reds and closed marks — before anyone has opened
it in the UI. Each ledger appears with its first record; a project that has
judged nothing has none. A ledger that will not read is a refusal, not a
screenful of yellow: the review says which book and why.

The feed under `ledger/feed/` is the fourth file there and the odd one out: a
YAML list rather than a map, one line per finished run (written by the daemon
when an agent asks through `shall log`, and by nothing else) for a person
skimming the Activity Feed panel — an input to nothing: no colour, gate, board
row or queue card reads it, and deleting it changes only the panel. It appears
with its first line like a book does, a month file that will not read is never
written over — `shall log` is refused with the sentence — and it is committed
beside the books because it is Shall's own: every `shall log` lights
**Commit spec**, and the commit carries the feed with them.

The `.gitignore` Shall writes covers one thing: the `*.tmp` a write leaves if
it dies between writing and renaming. It also ignored a `shall.db` for as long
as any folder still held one from before the spec moved into files; those files
are gone and the lines went with them. The reference templates are not in the
project any more: they are the machine's, regenerated under
`~/.shall/templates/`, and a set an older Shall committed into a project is
removed on the next open.

Three types were renamed on 2026-08-23 — the table is in
`docs/Shall_Plan_Layer_Refactor_Spec.md` §1 — and nothing migrates a project
that still has the old drawers: their files read as an unknown type and turn up
under problems. Moving them by hand is three `git mv` of the old type folders to
their new names under the same band folders — `plan/Module`, `plan/WorkItem`,
`execution/CompletionReport`. Ids stay as they were — a prefix is only what
Shall suggests for a new id, never a rule about an old one — so every relation
still resolves; the approvals of exactly those nodes lapse, because the approval
payload carries `<type>/<id>`, and they come back yellow to be read once more.
Bodies are free markdown, so a module still written in the old sections reads as
it did.

Opening or creating a project also writes two deny rules into the project's
`.claude/settings.json` — `Read(~/.shall/**)`, Shall's own home, and
`Edit(/.shall/ledger/**)`, the books and the feed beside them that only the
daemon writes — and `shall init` runs `git init` when the folder is in no
repository, because git is the spec's only restoration material.

It writes one more file, and this one is Shall's own: `.claude/rules/shall.md`,
half a page an agent reads at the start of every session. What is on it is the
handful of things the files cannot say about themselves — that writing a spec
file is a proposal and not a decision, that a node is retired by proposing its
deletion rather than by deleting it, that the ledgers are nobody's to open and
the one line a run leaves there goes through `shall log`, that a colour is
asked for rather than worked out, that a node is started with
`shall add-spec-node` because its commented header is the only place a type's
own keys and relations are written down, and that a work item hangs off a module and
`shall check` says so when it does not. It is generated output, kept
current on every open the way the reference templates are, so a hand edit to it
is lost; anything of your own belongs in another file beside it. There is one
adapter today, which is why the page lands under `.claude`.

## The `shall` command

Six subcommands go on top of `.shall/`, and between them they are what an
agent sees of a project without opening the browser, and the one line it
leaves. None of them reads a spec file, and only one of them — `shall log` —
writes anything, and not a spec file either: each starts or reuses the daemon
and asks it, because the daemon is the one process that reads spec files for
Shall — and a terminal that worked out a colour for itself would be a second
implementation of the colour chain, stale the day a rule moves. The five that
need a project already there find it by walking up from the directory you are
standing in, the way `git` does.

- `shall init` writes that folder into the current directory.
- `shall check [--scope <path>]…` reads the spec back and says how much the
  folder holds, then what is wrong with it, one file and one line each —
  problems that keep a file out of the graph, a ledger of the three that will
  not read, gaps where the graph does not hold together, and notes about
  non-canonical files. Problems and gaps exit 1. It still says nothing about who
  approved what: that is the review's, and `shall status` is why it can stay
  that way. One gap turns on a judgement all the same — a work log filed under a
  work item that is still blocked, and a chain nobody has agreed to yet is one of
  the ways a work item stays blocked.
- `shall status [--scope <path>]…` counts the reds, yellows and greens and then
  gives the colour node by node — why it is that colour in one word, the
  sentence a rule of the graph wrote against it, a standing rejection's
  rationale whole, the reason a subject was left open, a criterion's open or
  closed mark, a work item's blocked, ready or done — and ends with the ids nothing
  answers to and the files that would not read. A deletion an agent proposed and
  the relations a file writes ride in the `--json` answer rather than the
  printed rows. It reads the ledgers' verdict and manufactures none of it, and
  when one of the three books will not read it refuses the whole run and names
  the book: `check` can report that as a row and go on counting, but every
  colour here is counted out of the books, and a screenful of yellow that is
  really an unreadable ledger is a lie with a colour.
- `shall board` is the Work Board in a terminal: Fix Spec and Implement, the
  same two lists the panel draws, computed from the graph and the ledgers on
  every read — and refused outright, like `status`, when a book will not read.
- `shall add-spec-node --type <Type>` starts a new node — the daemon picks the
  next free id, writes the starting file at its own path, and the command prints
  that path on its first line so an agent knows exactly where to write. One
  command for every type in the canon; the type argument is resolved
  case-insensitively, and one the canon does not have is refused with the
  whole list.
- `shall log <kind> <summary> [--refs <id,id>]` writes one line into the
  activity feed — the daemon writes it, under `.shall/ledger/feed/`, at its own
  clock. The kind is one of `specify_done`, `plan_done`, `work_done` and
  `raise_landed`, the four ends of a run, and any other word is refused with
  that list. The summary is one word to the shell — quote it — and one line to
  the daemon; `--refs` names the nodes the line is about, as ids separated by
  commas, in either spelling (`--refs a,b` or `--refs=a,b`), given as often as
  you like, and every id is checked for shape before anything is written. It
  answers `Logged <kind>.` or the refusal and nothing else — no command reads
  the feed back, by design; an agent that wants the past asks `status` and
  `board`.

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

Each of the six takes `--json`, and then stdout is exactly one object and
nothing else: the answer — for `log`, `{"ok": true}` — or `{"error": …}`
carrying the sentence the call was refused with. The exit code is 1 only when
the call itself failed or `check` found problems or gaps — a red node, a
standing refusal and an empty board are answers, not errors, so a caller
branches on the content and never on the code. That is the machine-readable
contract an agent's tooling consumes.

`shall help` is the seventh command and the one that starts nothing: it prints
to stdout the screen those six shapes are quoted from, and `shall --help` is
the same command. The contract above begins once the words parse, and a line
this client cannot read never gets that far — an option a command does not
take, a `--scope` with no path or a `--refs` with no ids after it, a third word
after `shall log`'s two, a word that is no command at all. Each is
answered on stderr with the one shape that would have worked, or with that whole
screen for a name nothing answers to, and exits 1 before a daemon is started or
a folder is read, whatever `--json` was in the line.

There is no `shall approve`, `shall reject` or `shall close` and never will be:
a judgement is made by a person in the browser. `shall log` is not one of those
by another name: it cannot write a judgment, and what it writes — a line of
the feed — is read by nothing that decides a colour.

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
