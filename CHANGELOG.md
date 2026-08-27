# Changelog

Every release lists what changed; a release that changes the spec schema — node types, edge grammar, file format — must additionally carry a **Migrating** section saying what an existing `.shall/` tree needs.
Shall never migrates a spec by itself: old nodes read as red, and the notes here say what to do about them.

## Unreleased

- **`shall status` says, per open criterion, whether the plan still holds a work item that can judge it.** Every criterion row carries `aims` — `pending` while a work item aiming at it is not yet done or evidence on it awaits a verdict, `spent` when every work item aiming at it is done and it is still open, `none` when nothing aims at it — and a spent aim carries its own sentence under the row, naming the finished work items: evidence is filed only under a work log addressing a work item that targets the criterion, so nothing left in the plan can reach a verdict on it. The Vitals page and the report say the same word beside each open criterion. `shall check` and `shall board` are unchanged: a spent aim is no red, and the board stays two lists.
- **An aim is a promise of a verdict.** `/shall:plan` now aims a work item only at criteria whose evaluation process can be run, whole, once its definition of done holds — on what the item and its waits supply — and cuts the acceptance pass in stage 1 when only the assembled whole can run a process, instead of aiming module work at criteria it can never judge; a definition of done may name what another item builds only when the item waits on it. `/shall:work` reads the targeted processes at the look back and says what supplies each thing they name, reports the spent aims the status found as a fifth reading of the survey, and writes a spent aim up as one finding rather than a paragraph per turn.

## 0.1.4 — 2026-08-27

- **`shall` works from inside Codex's sandbox without anybody editing a config.** `shall init --agent codex` writes `network_access = true` and a `writable_roots` naming Shall's home into the project's own `.codex/config.toml` — merged into what is there, never over a line a person set. And the CLI no longer mistakes a daemon it may not signal for a dead one: from inside a sandbox it adopts the running daemon when it answers, and otherwise says which process it is and why it cannot be reached, instead of trying to stop it and failing on `rm ~/.shall/daemon.json` with a sentence about nothing.

## 0.1.3 — 2026-08-27

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
