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
reader and the per-type templates. `core/store` is the folder around them —
what a directory of markdown amounts to when it is read at once, and how a
write lands. `core/arith` and `core/exchange` are still empty frames: the
judgement arithmetic is not written, and `exchange` is a seat kept open rather
than a plan — the session broker it was to hold is not being built, because git
holds the history, the merges and the review it existed to provide.

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

A node is a file, not a row: `.shall/spec/<Type>/<id>.md`, committed alongside
the code it specifies. The folder is the type and the filename is the id, so
neither is written inside the file; an outgoing relation is a line in the
source node's own file and lives nowhere else; the timestamps are the file's
`mtime`. **Add node** opens the detail pane to write one, clicking a node on
the canvas opens the same pane to read it, and **Edit** turns that pane back
into the form with **Delete** beside **Save**. A save rewrites the whole file
canonically — one key order, one edge order, LF, one trailing newline — so the
same graph is always the same bytes and `git diff` says only what changed. It
also drops any comments and custom ordering a hand-edited file was carrying.

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

Settings edits real files: the daemon port lives in `~/.shall/config.json` and
the display name in `<project>/.shall/project.json`. Everything else on that
screen is a read-only fact shown next to the file it comes from.

The UI is built with shadcn/ui on Tailwind v4; `apps/web/components.json` is the
registry config, so `npx shadcn add <component>` works from `apps/web`.

## Project files

```
<project>/.shall/
  project.json          id, display name, schema version
  .gitignore            the shall.db files and *.tmp — Shall's own leavings
  spec/<Type>/<id>.md   the graph: one file per node
  templates/<Type>.md   23 starting files, one per node type in the canon
```

`.shall/spec` and `.shall/templates` belong in the repository, and that is the
whole point of the arrangement: the spec travels with the code, git holds its
history and its merges, and a fresh clone can be read before anyone has opened
it in the UI. The `.gitignore` Shall writes covers only its own leavings — a
`shall.db` left behind by a version from before the spec moved into files, and
the `*.tmp` a write leaves if it dies between writing and renaming.

Two `shall` subcommands go on top of this: `shall init` to write that folder
into the current directory, and `shall check` to read the spec back and print
what is wrong with it, one file and one sentence per line. The daemon answers
both already (`projects.create` and `spec.check`, the latter finding the
project by walking up from a path the way `git` does), but the CLI below is
still only the launcher, so neither subcommand is wired yet.

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
