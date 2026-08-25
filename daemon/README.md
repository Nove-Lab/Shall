# daemon

The one Shall process that writes spec files — but not those files' only writer.
Agents, a person's editor and `git checkout` all write into the same `.shall/spec/` folder.
Every line that touches the host (OS, network, git) lives in here, and `core`
knows nothing of what sits below it.

- `http/` — the surface. `app.ts` opens one port for the web (tRPC), the CLI and
  the static SPA, and `router.ts` gathers the procedures the screens call
- `service/` — the thin layer joining requests to `core` and `host`: opening and
  configuring projects, the doors to spec nodes and edges, and `spec.check`,
  which reads a whole folder at once
- `host/` — where the host is touched. `~/.shall` (settings, registry, daemon
  state), a project's `.shall` folder (`project.json`, `.gitignore`, `spec/`,
  the per-type templates), the walk up to find a project root, folder browsing

`types.ts` is what the daemon knows — host state and the shapes the screens read.
Graph values live in `@shall/core/graph`.

The direction is `http → service → host·core` and nothing else. An import that
calls back up means a layer was drawn wrong.
