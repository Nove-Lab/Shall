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
from prose, and the canon lets sixteen types point at a term — but drawing that
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

## Older, still open

**Closing a task whose prerequisites are unfinished.** A verification report can
close an ImplementationTask that is green but blocked — nothing consults the
task's state at the closure door. `closureAsks` in `core/arith/closure.ts` is
where the clause would go. Left open deliberately: a person closing a task with
an open prerequisite may know something the graph does not.

**A lapsed rejection overwritten by a leave-open.** The rejection ledger is
keyed by node id and carries both a node's refused wording and a criterion's
"left open" record, so leaving a criterion open writes over the history of a
rejection that has already lapsed. Mirrored deliberately when the second closure
subject landed; the fix is a second key or a second book.
