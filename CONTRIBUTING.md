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

## What to know before changing things

- `docs/Project_Structure_and_Architecture.md` says how the pieces fit and which invariants hold — read it first.
- `core` stays pure and browser-safe: no filesystem, network, clock or randomness.
- The agent-side processes are prose in `agents/claude/`; `node scripts/lint-plugin.mjs` holds that prose to the code and runs as part of `bun run test`.
- Every judgement — approve, reject, close — belongs to a person in the browser; nothing you add may decide one in code.

## Pull requests

Branch from `main`, keep the change and its tests in one PR, and make sure `bun run test` is green before asking for review.
