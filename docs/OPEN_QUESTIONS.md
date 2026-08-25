# Open questions

Decisions that came up while building and were deliberately not taken. Each one
names where it would land, so taking it later is an edit and not an
investigation.

## From the vitals round (2026-08-24)

**Should there be a `shall vitals [--json]`?** Not this round, on purpose. The
Vitals spec names the control plane and nothing else, the help skill fixes an
agent's material at two answers — `shall status --json` and `shall board
--json` — and the linter still hand-keeps the subcommand list, which a third
command would pay for a third time. The ratios an agent might want are already
countable from `shall status --json` (`closure`, `workItemState`, and now
`satisfaction`) and the board. If the command is wanted, the recipe is the
feed's in reverse order of refusal: the spec's §0 first, then a path-taking
procedure beside `spec.board` in `daemon/src/http/router.ts` wrapping the same
`vitalsOver` the web's `spec.vitals` calls, a `SHAPES` entry in
`client/cli/src/args.ts`, a `SUBCOMMANDS` entry in `scripts/lint-plugin.mjs`,
and the README's subcommand count. Where it lands: those four files and
`daemon/src/service/spec-vitals.ts`.

**The "main scenario" rule cannot be checked, and was weakened rather than
dropped.** The spec's fourth health rule asks for a use case with no *main*
scenario, and which scenario is the main one lives in a heading inside the
scenario's body, which the graph does not read by design. The shipped rule is
"a use case no scenario details" — computable from the `DETAILS` lines, still
residual, still one of seven. Making "main" a fact would mean a structured key
on the scenario: `SpecNode` in `core/graph/node.ts`, the closed frontmatter key
set in `core/serialize/parse.ts` and `emit.ts`, the template, and the approval
payload hash — a canon change, not a vitals change. Where it lands: those
files, then one row of `RULES` in `core/arith/vitals.ts`.

**A work item left open shows no rationale on the Vitals page.** A person who
refuses to call a work item done over its current reports writes a left-open
record, and `ReviewStatus.leftOpen` carries it — but the work item then reads
`ready`, not `blocked` (its chain may well be green), so the WorkItem row's
drill-down, which lists the blocked ones, never shows that word. The criterion
row does show its left-open reasons inline. Whether the work item row should
carry the same treatment — a row of its own beside the blocked list — is
undecided. Where it lands: `CompletionRow` in `core/arith/vitals.ts` and the
WorkItem drill-down in `apps/web/src/control/vitals/Vitals.tsx`.

**Should the help guide read `satisfaction`?** `shall status --json` rows now
carry it, because `NodeStatus` spreads `ReviewStatus`, so the guide's material
has a word it did not have when its table was written. `plugin/skills/shall-help/SKILL.md`
counts criteria and work items by hand from `closure` and `workItemState` and
says outright that neither answer carries a phase or a gate; a satisfaction
ratio is a progress figure, and the skill currently forbids stating one. Left
alone this round — new panels do not earn plugin prose, and the guide is about
what an agent should do next, which a ratio does not say. Where it lands: that
skill's "Say | Count it from" table and its "A phase or a gate" bullet.

**No sidebar count for Vitals.** The Review Queue and the Work Board carry a
count because something there waits on a person; the Activity Feed carries none
because nothing does, and Vitals follows the feed: a violated health rule is
not an error and not anybody's turn. If that reading changes — if a violation
should wait on someone — the count would come from the panel's own procedure
and not a summary one, for the reason `ShellLayout.tsx` gives. Where it lands:
`useWaitingCounts` in `apps/web/src/shell/ShellLayout.tsx`.

**One root cause can be said twice.** An actor that performs no use case is a
row under the actor rule and leaves its goal unreached under the goal rule; a
hole in the chain is a Fix Spec row and an unreached goal at once. The spec's
exclusivity is against the other two layers, not between the seven rules, and
the overlap is accepted and written down rather than deduplicated — a rule that
hid its row because another rule had the same cause would be a second place for
the two to disagree. Where it lands: `RULES` in `core/arith/vitals.ts`, if a
dedupe is ever wanted.

## From the plan-layer refactor round (2026-08-23)

**Does the `Interface` node survive as a type of its own?** A `Module` now
carries its contracts at signature level in its own body — name, inputs,
outputs, errors — and the `Interface` node carries the obligations:
preconditions, postconditions, invariants, protocol. Two homes for one boundary
is the shape this round chose deliberately (the spec was silent on Interface and
DataSchema, so both were left as they were), and whether agents keep the two in
step is unmeasured. If they drift, the candidate moves are the obligations into
the module's Contracts section with `Interface` retired, or the signatures out of
the module and into the interface. Where it lands: `core/graph/canon.ts`,
`grammar.ts`, `anchors.ts`, `guide.ts`, and the plan skill's stage files.

**Should the technology decision be mandatory?** Stage 1 of `/shall:plan` lands
a project-level `Decision` only when the stack is a project-wide choice; a
single-module project, or one whose stack the intent already pinned as a
Constraint, writes none. A plan with no decision and thin Technology sections is
then legal and hollow, and nothing computed says so. Where it lands: the plan
skill's end gate, as a prose line — or a check rule over `Module` bodies, which
`shall check` does not read today by design.

**Should the linter ban "task" as a type word?** Rule (f) in
`scripts/lint-plugin.mjs` bans the three retired names; the bare word "task" is
not banned because it is ordinary English. A skill that drifts back to "the
task" for a work item would pass. Where it lands: the same file, as a rule that
fails "task" only inside a code span or beside a type name.

**A module's hidden decision has no home.** The old "Hidden Decision" section
was abolished because it sheltered vagueness; the hiding question survives in
stage 1 as a boundary test only, and what a module keeps to itself is meant to
show in its Technology and its Decisions. Whether a module body that never says
what it hides still makes a good boundary is the thing to watch in the next
dogfood.

## From the help-and-feed round (2026-08-23)

**The linter still hand-keeps the subcommand list, and this round paid for it
a second time.** `log` went into `SHAPES` in `client/cli/src/args.ts` and into
`SUBCOMMANDS` in `scripts/lint-plugin.mjs` by hand — the drift the entry under
the `/specify` round names. Not closed here: the cheapest closing is the lint
reading `args.ts` as text and taking the `SHAPES` keys, which needs no build,
but it is a change to the linter for its own sake and belongs to a round that
is about the linter. Recorded so the third payment is the last.

**The feed has no read path from the CLI, and the absence is deliberate.**
The feed's charter forbids any agent-facing read, and
`spec.activity` takes a project id, which the CLI never has. Written down so
nobody adds `shall feed` as the obvious completion: if it were ever reversed,
this entry changes first, then a path-taking procedure beside `spec.board`
in `daemon/src/http/router.ts`, a `SHAPES` entry, and a lint entry.

## From the batched-approval round (2026-08-22)

**What does a person actually see when the board is blank?** `--auto` writes a
whole run before anybody judges it, and between the writing and the one approval
`shall board` is empty on both halves — nothing red to fix, and every work item
blocked because its chain is this run's own unjudged work. That is the correct
computed answer and the skills now say so, but nobody has watched a person meet
it. Partly moot since 2026-08-23: `/shall:plan` writes the whole plan in one pass
in both modes, so the board is blank until the one approval either way, and the
phase-gated experience — green accumulating band by band — no longer exists for
the plan. Whether the blank board reads as "wait" or as "broken" is still
unmeasured.

**How many cards does a whole run actually produce?** Both dogfood logs already
name that measurement as the thing Round 2 exists to take — one card per top-level
thing changed, per phase. `--auto` changes exactly that number: the waves merge
into one card per top-level goal, and one per responsibility that gained a
module. The prediction is written into both spines from a simulation over
`core/arith`; the observation is still owed, and the two logs are where it goes.

**Is a rejection at the end as expensive as the flag's own warning says?** The
spines tell an agent to say the cost out loud when offering `--auto`, and the
repair is the revision path from the rejected layer down. Nobody has run that
repair. If it turns out cheap in practice the warning is over-stated; if it
turns out to cost the run, the flag wants a narrower default than "offer it".

One thing this round resolved rather than deferred: the `MENTIONS` re-approval
cost recorded below does not bind during an `--auto` run at all, because the
nodes a term would be mentioned from are already yellow when the vocabulary is
harvested. It is a cost of the gated rhythm, not of the relation.

## From the `/specify` plugin round (2026-08-18)

**Should a stale daemon be recognised rather than adopted?** The CLI reuses
whatever is listening on the configured port after checking only that the pid is
alive, the port matches and the bind host agrees — so a daemon left running from
an older install serves a newer CLI, and `spec.status` comes back as tRPC's "no
procedure on path" instead of as "your Shall is out of date". The plugin's
step-0 gate reads that message and stops, so nothing breaks silently; it is just
a worse sentence than it could be. The fix is a build marker in `/health` and one
more clause where `ensureDaemon` already compares the bind host
(`client/cli/src/main.ts`). What a build marker should BE — the package version,
a hash of the router, something else — is the part worth deciding rather than
guessing.

The same function believes the state file over the port. Observed once, with no
reproduction: `~/.shall/daemon.json` was gone while a healthy daemon held 9461.
The CLI coped — with no state to read it spawns a second daemon, that one loses
the bind and exits, and `/health` is answered by the first — so every call pays
for a process that was never going to live. Knocking on `/health` before
spawning would settle both this and the marker above in one place.

**Should the ledger folder be denied to reading as well as writing?** Shall
writes two deny rules into a project's Claude settings, and only the write is
denied. Not reading is now a convention, stated in `.claude/rules/shall.md` and
in the authoring skill, on the grounds that a colour worked out by hand will
disagree with the screen. Adding `Read(/.shall/ledger/**)` would make it a rule
instead of a request. Against it: the books are committed beside the spec, a
person reading their own repository sees them, and a deny rule that fires on an
honest `cat` is noise. The line is one entry in
`daemon/src/host/agent-settings.ts`.

**Where does a `MENTIONS` relation come from?** The domain phase harvests terms
from prose, and the canon lets fifteen types point at a term — but drawing that
relation edits a node that may already be green, which sends it back for
approval for a reason nobody asked about. The plugin's rule is to draw MENTIONS
only from a node it is already writing. The alternative is a pass that anchors
the vocabulary properly and accepts the re-approvals; it needs somebody to say
the re-approval is worth it.

**Should there be an adapter for agents that read `AGENTS.md`?** The always-on
page lands at `.claude/rules/shall.md` because that is the one place loaded into
every session without being asked for. An agent reading `AGENTS.md` is not
covered. The generated text is already a constant in
`daemon/src/host/agent-rules.ts`; a second adapter is a second writer over the
same string, plus a decision about what to do when the project already has an
`AGENTS.md` somebody else owns.

**Should the plugin linter read the CLI's command list instead of keeping its
own?** `scripts/lint-plugin.mjs` reads the canon out of core's built `dist` but
hand-keeps the list of `shall` subcommands, which `client/cli/src/args.ts` calls
its own single home. Importing it would mean the lint depends on the CLI being
built, which the root `test` script does not do today. Paid a second time on
2026-08-23, for `log`.

## From the `/plan` round (2026-08-19)

**Should a loop of `REFINES` between goals be red too?** The loop rule catches
what the plan writes down — `DEPENDS_ON` between work items or between requirements,
and the module graph derived from `EXPOSES`/`CONSUMES` pairs. A goal that
refines itself through others is the same defect wearing intent's clothes, and
`upwardChainOf` already has a comment about terminating on one. It was left out
because this round is the plan's and because the sentence would have to be a
third one, in the intent plane's words. `planCyclesOf` in
`core/arith/plan-seams.ts` would gain one adjacency and one arm; the module is
named for the plan, so taking this would mean renaming it.

**Should a node on a loop be a member of somebody's review bundle?** Today it is
not: `isMember` in `core/arith/bundles.ts` carries yellow, plus the two reds a
reviewer must see beside what they are judging (a standing rejection, and work
that jumped its turn). A loop is a seam like an orphan and the aim rule, so it
stays out and `shall check` is where it is said. The argument the other way is
that a person looking at the card for the module above a looping pair sees
nothing about them at all. Against it: nothing on that card can be approved into
existence, so showing the loop there would be showing a person a problem with no
door.

**`RELATES_TO` is deliberately not a candidate.** Two domain entities that
relate to each other are describing the world, not declaring an order, so a
cycle in them is not a defect. Written down because it is the third self-loop in
the canon and the question will be asked again.

## From the decision-and-finding round (2026-08-21)

**Should the review queue and `shall status` order by an unanswered blocking
`Finding`?** A finding now carries `blocking`, and the specification that added
it draws the upper bound in the same breath — display and ordering material,
never a lock. This round stopped at the field. The ordering half is small:
`byScan` and the queue comparator in `core/arith/bundles.ts` are where a bundle
gets its place, and `NodeStatus` in `daemon/src/service/spec-status.ts` would
have to carry the flag to the wire before a row could be ordered by it.
"Unanswered" is the larger half and is not a field at all: a finding is answered
when some `Decision` `RESOLVES` it and unanswered when none does, so it wants a
name and a home in `core/arith` first. Left out deliberately — the completion
criterion asked for the field and no further, and the two halves are worth
taking together rather than the cheap one now.

Asked again in the execution-plane round and answered the same way, this time
on purpose rather than for want of time: the round's own specification asked
for blocking findings to be surfaced first, and the answer was that `blocking`
is the author agent's judgement and not a property any arithmetic reads. So
nothing was hung on it — no order, no badge, no field on the wire — and what
the round did build instead is the card: a yellow `Finding` no work log records
is its own bundle kind, `standalone-finding`, last in the queue. An agent that
wants to read the blocking ones first joins the answering decisions itself out
of `shall status --json` and opens the findings' files, which is what the
`shall-work` skill's survey does. This question stays open as written; what
closed is the pretence that it was nearly done.

**Should `AFFECTS` reach an `Assumption`, and should a `Decision` affect another
`Decision`?** Settled by hand while the rows were being written — assumption
yes, decision no — and recorded because the second half is a gap somebody will
propose closing. `AFFECTS` is what anchors a `Decision`, so two decisions naming
each other would hold each other to the graph while revising nothing, and no
loop rule catches it: `planCyclesOf` in `core/arith/plan-seams.ts` reads
`DEPENDS_ON` and the `EXPOSES`/`CONSUMES` pair and deliberately nothing else. The
assumption arm was taken with one consequence accepted: an `Assumption` hanging
off a `WorkLog` sits on the report side of the bundle walk, so a `Decision` that
affects it is legal and passes check and still does not gather it onto its card.
The rows are in `EDGE_GRAMMAR` (`core/graph/grammar.ts`); a `Decision` row there
would need a cycle rule or a cardinality that does not exist today.

## Older, still open

**Closing a work item whose prerequisites are unfinished.** A completion report
can close a WorkItem that is green but blocked — nothing consults the work
item's state at the closure door. `closureAsks` in `core/arith/closure.ts` is
where the clause would go. Left open deliberately: a person closing a work item
with an open prerequisite may know something the graph does not.

**A lapsed rejection overwritten by a leave-open.** The rejection ledger is
keyed by node id and carries both a node's refused wording and a criterion's
"left open" record, so leaving a criterion open writes over the history of a
rejection that has already lapsed. Mirrored deliberately when the second closure
subject landed; the fix is a second key or a second book.
