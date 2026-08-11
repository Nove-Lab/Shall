# Shall

Shall is a local, spec-driven control plane for AI coding agents. This M0
contains project initialization, opening and recent-project persistence, plus
the shell the planes fill: Control plane panels, the Spec plane canvas and
Settings. The Spec plane holds real nodes now; the Control plane panels are
still empty — those surfaces are there, the records are not.

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

A node is a row of the project's `nodes` table: a `type` and a JSON `attrs`
object, plus an id and a creation time the editor cannot reach. **Add node**
opens the detail pane to write one, clicking a node on the canvas opens the
same pane to read it, and **Edit** turns that pane back into the form with
**Delete** beside **Save**. Nothing stores a node's position, so the canvas
lays nodes out in creation order and they cannot be dragged.

Two things above the canvas are still seats rather than features: edges have
no UI, and the grid/graph toggle renders the graph either way.

Settings edits real files: the daemon port lives in `~/.shall/config.json` and
the display name in `<project>/.shall/project.json`. Everything else on that
screen is a read-only fact shown next to the file it comes from.

The UI is built with shadcn/ui on Tailwind v4; `apps/web/components.json` is the
registry config, so `npx shadcn add <component>` works from `apps/web`.

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

## Production-shaped local run

```bash
bun run build
cd apps/daemon
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

