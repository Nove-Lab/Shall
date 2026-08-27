# Changelog

Every release lists what changed; a release that changes the spec schema — node types, edge grammar, file format — must additionally carry a **Migrating** section saying what an existing `.shall/` tree needs.
Shall never migrates a spec by itself: old nodes read as red, and the notes here say what to do about them.

## Unreleased

- **The board keeps a work item off the Implement list while its report is judged.** A completion report puts the item `in_review` until a person closes it or refuses the report; a work log alone leaves it ready, so a turn that stopped part-way is carried on rather than begun again. `shall status` and the Spec plane wear the new word.
- **`shall context --work-item <id>`** — the look back before a turn: the files to open, computed by the daemon — the module's siblings and their logs, the reports, findings and every decision whose lines reach them, the criteria with their closure, the newest turns in the feed's order, and what finishing the item would let start. `/shall:work` reads it before stop 1, holds the code to the module's contracts and re-runs the closed criteria on the way back, and routes a person's rejection of a spec node to the process that owns its band.
- **A guard hook before the tool runs.** `guard-paths.mjs` joins the compile hook in every kit: a write under `.shall/ledger/`, or the removal of a file under `.shall/spec/` — named outright, in a patch, or in a shell line — is refused with one sentence before it happens. Claude keeps its deny rule as well; Codex gets its first mechanical wall. `shall init` says when a project's `AGENTS.md` is past the 32 KiB Codex reads by default.

## 0.1.2 — 2026-08-27

- **`shall init` asks which agent the project is for, and wires it.** Claude Code as before, Codex as of now, or both: in a terminal the question is a list you arrow through, and on the command line it is `--agent <claude|codex|all>`. A Codex project gets the seven processes as skills under `.agents/skills/`, the compile hook under `.codex/` wired from `.codex/hooks.json`, and a fenced block inside its own `AGENTS.md` — generated, rewritten on every open, and with nothing outside the fences ever touched. Naming an agent adds it and never takes one away, so running `init` again in a wired project offers to refresh what is there or to add what is missing. The daemon's start sweep refreshes each project for what it is wired for and never widens it.
- Codex's default sandbox blocks the loopback connection every `shall` call needs, so wiring for it prints one line saying to approve those commands or add an execpolicy rule. That is measured, and unfixed.

- One prose, per-agent coats: the agent processes now live once in `agents/core` and are generated per agent, so a process fixed once is fixed for every agent.
- Shall wears its snail: the logo on the front page, and a favicon in the app.

**Breaking:** `shall init --json` now requires `--agent`. `--json` promises a run with no questions in it, and which agent to wire is a question — a scripted `init` that named none would have Shall choosing for a caller it cannot ask. Scripts that ran `shall init --json` should run `shall init --agent claude --json` to keep exactly today's behaviour.

## 0.1.1 — 2026-08-26

- `shall report`, and a **Generate report** button on the spec plane: the whole spec assembled into static HTML under the project's own `shall/report/`, for a reader who never opens Shall. Seven chapters of tables built from the graph and the ledgers, a page per node carrying its relations and its body verbatim, and a progress chapter of four bars — scenarios, requirements, criteria, work items — each leading to its full listing. Status is said in plain words (`Approved`, `Awaiting review`, `Met`, `Blocked`…), the figures are the Vitals' own, links work from disk with no server, and every page prints. The folder ignores itself in git; regeneration replaces it whole; nothing is ever written into `.shall/`.
- The help screen says `shall [--host]` on one line — one command, one line.
- `SHALL_HOME` relocates Shall's home folder. Nothing an installed Shall runs sets it; the checkout's dev scripts do, which keeps developing Shall entirely off the installed Shall's `~/.shall`.

## 0.1.0 — 2026-08-26

The first release.

- One self-contained binary per platform (`darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`), the web app and the agent kit embedded — installed with `curl -fsSL https://shall.sh/install | sh`, `brew install nove-lab/tap/shall`, or from the Releases page.
- `shall init` is the whole setup: the `.shall/` spec tree, the ledgers, and the `/shall.…` Claude Code commands, skills and compile hook written into the project itself.
- The spec graph: 21 node types across the domain, intent, plan and execution planes, computed colour and closure on every read, stored nowhere.
- The app at `localhost:9461`: Review Queue, Work Board, Activity Feed, Vitals, and the spec plane — every judgement a person's.
- The agent processes: `/shall.specify`, `/shall.plan`, `/shall.work` (with `.todo` and `.report`), `/shall.raise`, `/shall.help`.
- `shall upgrade` replaces the binary with the newest release, checksum-verified, and the restarted daemon rewrites every registered project's agent kit.
