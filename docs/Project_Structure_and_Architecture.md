# Shall — Project Structure and Architecture

Shall is a local, spec-driven control plane for AI coding agents.
The specification is a graph of markdown files inside the project's own repository; every metric, colour and queue is computed from those files and three ledgers on each read, and stored nowhere; every judgement — approve, reject, close — is a person's, made in the browser.

## Layout

```
core/        graph · arith · serialize · store   — pure, browser-safe; no filesystem, clock or crypto
daemon/      http · service · host               — the one process that writes spec files
apps/web/    control · spec · settings · shell   — the localhost screen
client/cli/  the `shall` command                 — a thin client; computes and serialises nothing
agents/      claude/ — the Claude Code plugin    — the agent-side processes, prose only; one folder per agent
scripts/     lint-plugin.mjs                     — checks the plugin prose against core and the CLI
```

## The graph

**Node types** — 21, in four bands, each type a folder under `.shall/spec/<band>/<Type>/<ID>.md`:

| Band | Types |
|---|---|
| Domain | Term, DomainEntity |
| Intent | Goal, Actor, UseCase, Scenario, SystemResponsibility, Requirement, AcceptanceCriterion, Constraint |
| Plan | Module, Interface, DataSchema, WorkItem, Decision |
| Execution | Journal, WorkLog, Evidence, CompletionReport, Finding |
| Satellite | Assumption (drawn in the Intent band) |

**Edges** live in the source node's file and nowhere else.
The grammar (`core/graph/grammar.ts`) is the one table of allowed triples; the main families:

- The intent chain: Goal —REFINES→ Goal, —PURSUED_BY→ Actor —PERFORMS→ UseCase —DETAILS→ Scenario —DERIVES_RESPONSIBILITY→ SystemResponsibility —REQUIRES→ Requirement; Requirement and Scenario —HAS_CRITERION→ AcceptanceCriterion.
- The plan: SystemResponsibility —IS_REALIZED_BY→ Module —EXPOSES/CONSUMES→ Interface —CARRIES→ DataSchema; Module —ALLOCATES→ WorkItem (the work item's only anchor); WorkItem —TARGETS→ AcceptanceCriterion (0..N, aims without holding); DEPENDS_ON between work items and between requirements.
- The execution record: Journal —LOGS→ WorkLog —ADDRESSES→ WorkItem, —SUBMITS→ Evidence/CompletionReport; Evidence —CLAIMS→ AcceptanceCriterion; CompletionReport —CLAIMS→ WorkItem; WorkLog —RECORDS→ Finding.
- Satellites and revision: every Intent type and Module —HAS_CONSTRAINT→ Constraint and —ASSUMES→ Assumption; Decision —AFFECTS→ any living-band type (its anchor) and —RESOLVES→ Finding.
- The domain sink: MENTIONS → Term from the Intent and Plan bands (plus Assumption and Decision) — never from the Execution band; Term —DENOTES→ DomainEntity; DataSchema —REPRESENTS→ DomainEntity.

**Anchors** (`core/graph/anchors.ts`): each type names the relations that hold it to the graph; a node with none standing is an orphan and red.
Goal, Journal, Finding, Term and DomainEntity are rootless.

## The arithmetic (`core/arith`)

All of it pure functions over `(graph, ledgers)`; the sha256 arrives injected so the browser can run the same code.

- **Colour** — red (missing, malformed, orphan, off-target, cyclic, premature, rejected), yellow (unapproved, changed), green (approved at the current content hash). One priority chain, `colorOf`.
- **Loops** (`seams.ts`) — strongly-connected components over three derived graphs: written DEPENDS_ON, the module graph (A CONSUMES what B EXPOSES), and Goal REFINES. Every node on a loop is red with the loop recited from its own file.
- **The aim rule** — a work log's evidence claims only criteria its addressed work items target; a completion report claims exactly one addressed work item.
- **The premature rule** — work logged under a work item whose turn has not come is red.
- **Closure** (`closure.ts`) — a criterion or work item is closed when a person's acceptance record still matches the subject's and every claimant's bytes; editing any of them reopens it.
- **Work item state** (`work-item-state.ts`) — done (closed), ready (prerequisites closed and the whole upward chain green), blocked (the rest).
- **Satisfaction** (`satisfaction.ts`) — a Requirement or Scenario is sat when every criterion it demands is closed, unsat otherwise, unspecified when it demands none.
- **The review** (`review.ts`) — one pass that stamps every node's colour, closure, work item state and satisfaction; the board, the queue, the vitals and every badge read this one answer.
- **The board** (`board.ts`) — Fix Spec (a person's rejections first, then grammar seams) and Implement (ready work items, id order).
- **The queue** (`bundles.ts`) — what waits on a person, cut into bundles: spec approvals, work reports, criterion closures (`closure:<id>`), work item completions (`completion:<id>`), standing findings.
- **The vitals** (`vitals.ts`) — four progress ratios and seven spec-health absence checks, colour-blind, violated rules first.

## Files on disk

```
<project>/.shall/
  project.json               id, name, schema version
  spec/<band>/<Type>/*.md    the nodes: closed frontmatter (short_name, name, edges, per-type keys) + free body
  ledger/approvals.yaml      id → approved content hash, by, at
  ledger/rejections.yaml     id → rejected hash, rationale, optional left-open record
  ledger/acceptances.yaml    id → closure record (criterion: acHash + evidence; work item: taskHash + reports)
  ledger/feed/YYYY-MM.yaml   the Activity Feed, one line per finished run
~/.shall/                    registry.json, daemon.json (pid + port), config.json, templates/
```

The node body is opaque: nothing computed reads it.
A frontmatter key outside the closed set refuses the file; a refused node is invisible to every count and shows on Fix Spec.

## The daemon

One process, Hono + tRPC at `127.0.0.1:9461`, serving the built web app and `/trpc`.

- Read doors (per project id): nodes, edges, review, workBoard, reviewQueue, vitals, activity, gitStatus.
- Write doors: node/edge create-update-remove, approve, reject, withdraw, acceptClosure, leaveOpen, commitSpec — each recomputes from disk, writes canonically, never stores a result.
- Path-family doors for a folder nobody registered: check, status, board, scaffold, log — what the CLI calls.
- `/health` carries `procedures`, the sorted list of served procedure paths; the CLI compares it against what it needs and restarts an out-of-date daemon it owns.
- A filesystem watcher raises one SSE `change` tick per project; the web refetches silently on it.
- On init and on every open the daemon writes the agent-facing statics: the rules page `.claude/rules/shall.md`, the deny rules and the compile hook in `.claude/settings.json`, and the agent kit — the plugin's commands, skills and hook copied into `.claude/{commands,skills,hooks}` in the project-command dialect (`/shall.specify` and kin), marker-guarded and rewritten whenever they drift.

## The web

Two planes under `/p/:projectId`, plus Settings.

- **Control plane** — Overview (four equal cards), Review Queue, Work Board, Activity Feed, Vitals. Each panel asks its own procedure; the Overview cards ask the same ones, so numbers cannot disagree.
- **Spec plane** — the whole graph, grid and graph views, banded columns. Each card wears the colour square, and beside the id one second-axis badge: Open/Closed, Blocked/Ready/Done, Sat/Unsat — quiet badge for not-yet, filled emerald for arrived. The metamodel popup draws the same type-and-relation table the grammar is.
- Reading, editing, approving, rejecting, closing and deletion proposals all live here; the daemon never commits on its own.

## The CLI

`shall` opens the app (starting or adopting the daemon); subcommands `init`, `check`, `status`, `board`, `add-spec-node`, `log`, `help` — reads and scaffolds only.
`--json` answers carry the daemon's computed words verbatim; no judgement can be made from a terminal.

## The plugin

Seven commands: specify, plan, work (+ work.todo, work.report), raise, help.
Prose only — no hooks beyond the spec compiler, no state.
The `agents/claude/` folder is the one source: `shall init` embeds it into each project as `/shall.…` commands — no install step, no marketplace; the colon namespace is the plugin form and only appears when developing the plugin with `--plugin-dir`.
It sits under `agents/` because Claude Code is the first agent Shall drives, not the last: a kit for another agent would be its sibling folder, embedded the same way.
`scripts/lint-plugin.mjs` holds the prose to the code: canon names from core's build, the subcommand list read from the CLI's own `SHAPES` table, no retired vocabulary, no template-hint quotes.

## Invariants

- Computed results are never stored; every answer is recomputed from the files and the ledgers on each read.
- No AI in judgement: colours, closures, states and ratios are arithmetic; approving is a person's act, in the browser only.
- Frozen bytes: the node file format and approval payload; the three ledgers' formats — including the acceptance keys `acHash` and `taskHash`; the directions of TARGETS, ADDRESSES and CLAIMS; a node's path as its identity.
- Not frozen: procedure names and response shapes, `--json` fields, panel and badge vocabulary.
