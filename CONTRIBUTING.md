# Contributing to Shall

Thank you for wanting to make Shall better.

## The CLA, first

Shall is licensed under AGPL-3.0-only, and Nove Lab keeps the right to offer it under other licenses as well.
That dual-licensing premise only works if every contribution arrives with relicensing rights attached, so first-time contributors are asked to sign a short [Contributor License Agreement](./CLA.md) — the CLA Assistant bot will prompt you on your first pull request, and one comment (`I have read the CLA Document and I hereby sign the CLA`) signs it.
You sign once; every later contribution is covered.

## Building and testing

Requires Node.js 22.5+ and Bun.

```bash
bun install
bun run build       # core → daemon → cli → web
bun run typecheck   # every workspace
bun run test        # builds core, runs every workspace's tests, lints the plugin prose
```

Tests are colocated `*.test.ts` files (node:test via tsx) next to the code they test.
The daemon's spec-watcher and feed suites are known to be flaky on macOS fsevents — rerun before reading a watcher failure as yours.

## Running from the checkout

```bash
bun run dev          # daemon (tsx watch) + web (Vite HMR), app at http://localhost:9462
bun run shall …      # the checkout's CLI, aimed at the same place
bun link             # once, at the root — puts the same CLI on your PATH as `shall-dev`
```

Both run against the checkout's own home — `.shall-dev/` in the repo, on port 9462 — never `~/.shall`.
An installed Shall on the same machine keeps its daemon, registry and templates while you develop; the seam is the `SHALL_HOME` environment variable, which `scripts/dev-home.mjs` sets for these two commands and which nothing a user installs ever sets.

## What to know before changing things

- `docs/Project_Structure_and_Architecture.md` says how the pieces fit and which invariants hold — read it first.
- `core` stays pure and browser-safe: no filesystem, network, clock or randomness.
- The agent-side processes are prose in `agents/claude/`; `node scripts/lint-plugin.mjs` holds that prose to the code and runs as part of `bun run test`.
- Every judgement — approve, reject, close — belongs to a person in the browser; nothing you add may decide one in code.

## Pull requests

Branch from `main`, keep the change and its tests in one PR, and make sure `bun run test` is green before asking for review.
