# Changelog

Every release lists what changed; a release that changes the spec schema — node types, edge grammar, file format — must additionally carry a **Migrating** section saying what an existing `.shall/` tree needs.
Shall never migrates a spec by itself: old nodes read as red, and the notes here say what to do about them.

## 0.1.0 — 2026-08-26

The first release.

- One self-contained binary per platform (`darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`), the web app and the agent kit embedded — installed with `curl -fsSL https://shall.sh/install | sh`, `brew install nove-lab/tap/shall`, or from the Releases page.
- `shall init` is the whole setup: the `.shall/` spec tree, the ledgers, and the `/shall.…` Claude Code commands, skills and compile hook written into the project itself.
- The spec graph: 21 node types across the domain, intent, plan and execution planes, computed colour and closure on every read, stored nowhere.
- The app at `localhost:9461`: Review Queue, Work Board, Activity Feed, Vitals, and the spec plane — every judgement a person's.
- The agent processes: `/shall.specify`, `/shall.plan`, `/shall.work` (with `.todo` and `.report`), `/shall.raise`, `/shall.help`.
- `shall upgrade` replaces the binary with the newest release, checksum-verified, and the restarted daemon rewrites every registered project's agent kit.
