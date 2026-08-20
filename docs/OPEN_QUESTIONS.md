# Open questions

Decisions that came up while building and were deliberately not taken. Each one
names where it would land, so taking it later is an edit and not an
investigation.

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
built, which the root `test` script does not do today.

## From the `/plan` round (2026-08-19)

**Should a loop of `REFINES` between goals be red too?** The loop rule catches
what the plan writes down — `DEPENDS_ON` between tasks or between requirements,
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

**Closing a task whose prerequisites are unfinished.** A completion report can
close an ImplementationTask that is green but blocked — nothing consults the
task's state at the closure door. `closureAsks` in `core/arith/closure.ts` is
where the clause would go. Left open deliberately: a person closing a task with
an open prerequisite may know something the graph does not.

**A lapsed rejection overwritten by a leave-open.** The rejection ledger is
keyed by node id and carries both a node's refused wording and a criterion's
"left open" record, so leaving a criterion open writes over the history of a
rejection that has already lapsed. Mirrored deliberately when the second closure
subject landed; the fix is a second key or a second book.
