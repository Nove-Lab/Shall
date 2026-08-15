# Shall

Shall is a local, spec-driven control plane for AI coding agents. This M0
contains project initialization, opening and recent-project persistence, plus
the shell the planes fill: Control plane panels, the Spec plane canvas and
Settings. The Spec plane holds real nodes now; the Control plane panels are
still empty — those surfaces are there, the records are not.

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
write lands. `core/arith` holds its first arithmetic now: the colour chain —
red for an error to fix, yellow for a judgement still owed, green for both
settled — computed from the graph on every read and stored nowhere.
`core/exchange` stays an empty frame: the session broker it was to hold is not
being built, because git holds the history, the merges and the review it
existed to provide.

## Routes

Everything inside a project is scoped by its id, so a link is enough to put
someone on the same panel — there is no hidden "current project" state.

```
/                                Project picker
/p/:projectId/control            Overview — four panels
/p/:projectId/control/:panelId   Panel detail
/p/:projectId/spec               Spec plane canvas
/p/:projectId/settings           Settings
```

`panelId` ∈ `review-queue | task-board | activity-feed | vitals`.

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
pull in from a branch shows up on the next refresh with nothing to restart. A
file it cannot read costs only itself: that node and its relations drop out,
the rest of the graph keeps serving, and the sentence against it is what a
check reports.

Nothing stores a node's position, so the canvas lays cards out from the graph
alone — by band and type — and they cannot be dragged. The grid and graph tabs
are two layouts of the same nodes. A relation is drawn by dragging from one
card to another and picking a type the canon allows between them, and removed
from the context menu on the line.

Every card carries a traffic light, computed on read — the execution band
too, because a record is written by an agent and read by a person like any
other node: red is an error to fix (a file that will not read, a node no live anchor
holds, an id that is referenced but gone), yellow is a judgement still owed (no
approval yet, a tag this machine's key did not write, changed since it was
approved), green is both settled. The node panel is where a judgement happens —
a full read for a new node, a line diff against the approved version for a
changed one, and for a deletion an agent proposed (a `deletionProposed:` block
it writes into the file's frontmatter) the rationale, the impact and two
buttons: approve the deletion or reject it. Approving writes an `approval:`
block signed with the machine key at `~/.shall/key`; agents can imitate the
block but not the tag, which is why green has exactly one manufacturer. The
daemon never commits on its own — a **Commit spec** button appears when the
project is a git repository and the spec folder has uncommitted changes, and
makes one commit scoped to `.shall/spec`. A file deleted by hand shows up under
the toolbar's problems dialog with a **Restore** button that brings it back
from git history.

A work log names the commits its work produced in its own frontmatter — a
`commits:` list of `sha` and `message`, in the order they were made. The panel
shows them under the specification, and the edit form adds, changes and
removes them row by row (a row needs both halves; a row left blank is
dropped). There is no Commit node type any more: two lines of fact did not
need a file of their own.

Settings edits real files: the daemon port lives in `~/.shall/config.json` and
the display name in `<project>/.shall/project.json`. Everything else on that
screen is a read-only fact shown next to the file it comes from.

The UI is built with shadcn/ui on Tailwind v4; `apps/web/components.json` is the
registry config, so `npx shadcn add <component>` works from `apps/web`.

## Project files

```
<project>/.shall/
  project.json                 id, display name, schema version
  .gitignore                   the shall.db files and *.tmp — Shall's own leavings
  spec/<band>/<Type>/<id>.md   the graph: one file per node
```

`.shall/spec` belongs in the repository, and that is the whole point of the
arrangement: the spec travels with the code, git holds its history and its
merges, and a fresh clone can be read before anyone has opened it in the UI.
The `.gitignore` Shall writes covers only its own leavings — a `shall.db` left
behind by a version from before the spec moved into files, and the `*.tmp` a
write leaves if it dies between writing and renaming. The 22 reference
templates are not in the project any more: they are the machine's, regenerated
under `~/.shall/templates/`, and a set an older Shall committed into a project
is removed on the next open.

Opening or creating a project also writes one deny rule into the project's
`.claude/settings.json` — `Read(~/.shall/**)`, the approval key's home — and
`shall init` runs `git init` when the folder is in no repository, because git
is the spec's only restoration material.

Three `shall` subcommands go on top of this: `shall init` to write that folder
into the current directory, `shall check` to read the spec back and print what
is wrong with it (one file and one sentence per line — problems that keep a
file out of the graph, gaps where the graph does not hold together, and notes
about non-canonical files; problems and gaps exit 1), and
`shall add-spec-node --type <Type>` to start a new node — the daemon picks the
next free id, writes the starting file at its own path, and the command prints
that path on its first line so an agent knows exactly where to write. One
command for all 22 types; the type argument is resolved case-insensitively.
There is no `shall approve` and never will be: green is made by a person in
the browser.

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
suites — the file format's golden bytes, the loader's refusals, and the door
sentences the panel shows.

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
