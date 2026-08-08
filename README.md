# Shall

Shall is a local, spec-driven control plane for AI coding agents. This M0
contains only project initialization, opening, and recent-project persistence.

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

