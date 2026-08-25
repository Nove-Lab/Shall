# Shall

**Spec as the control plane for your agents.**

## Principles Shall stands on

**1. Intent engineering is the last work you'll never delegate.**
So we made the spec the control plane for your agents — carrying your intent, enforcing direction, handing out work.

**2. A spec is not a pile of flat documents.**
So we structured the spec as an interrelated graph across four planes — domain, intent, plan, and execution.

**3. The spec lives, and keeps changing, until your software dies.**
So change is the normal case, not waterfall reborn — every revision reaches both you and your agents.

## What you get, working with Shall

**1. Talk through what you want — get a structured spec.**
Tell your agent what you're building. It asks the right questions and turns your answers into a structured graph of goals, requirements, and plans.

**2. Approve or reject agent work in one place.**
Everything an agent produces shows up for your review — with diffs and evidence attached. Click approve, or reject with a note.

**3. Agents always know what to work on next.**
The board shows what's ready for your agents. Agents pick up work and run — on the specs you approved.

**4. Every change traceable, nothing drifts unseen.**
Spec changes are always traceable. Agents always know the blast radius of their work. And you always understand where the project stands — and where it's drifting.

## Getting started

### 1. Install

Requires Node.js 22.5+ and Bun.

```bash
git clone https://github.com/Nove-Lab/Shall.git && cd Shall
bun install && bun run build
cd client/cli && bun link   # puts `shall` on your PATH
```

To give your agent the commands below, start Claude Code with the plugin:

```bash
claude --plugin-dir /path/to/Shall/plugin
```

### 2. `shall init`

Run it in your project's folder. It creates `.shall/` — the spec tree the
graph is read from and the ledgers your approvals are written to — and
registers the project. The spec is markdown in your repository: version it,
diff it, review it like code.

### 3. Open the app

```bash
shall
```

Starts (or reuses) the local daemon and opens `http://localhost:9461` — the
Control plane for governing the project and the Spec plane for reading and
editing the graph. Everything stays on your machine.

### 4. `/shall:help`

Ask it in Claude Code any time. It says what Shall is in a screen, reads
where this project stands, and names the one or two commands that move it —
the only command that also answers outside a Shall project.

## Working with Shall

### Driving your agents using Shall

#### Specify — `/shall:specify`

The staged elicitation that fills the domain and intent planes: goals, actors,
use cases, scenarios, responsibilities, requirements, acceptance criteria and
the project's own vocabulary. Each stage is drafted with you in the terminal,
written once agreed, and lands in the Review Queue for your approval;
`--auto` runs the stages through and asks once at the end.

#### Plan — `/shall:plan`

The design pass one layer below, in two stages. First it plans the way an
agent plans anything — reads the repository, proposes the stack, draws module
boundaries, cuts the work — and puts the whole plan to you for one yes,
writing nothing. Then it transcribes the agreed plan in one pass: modules,
their contracts, the work items the board will hand out, and the technology
decision. `--auto` skips the terminal yes and nothing else.

#### Work — `/shall:work`

One turn of the work cycle: survey the board, pick a small bundle, do the
development itself outside Shall, self-check the result against each item's
definition of done and the criteria it targets, and write the turn up as one
journal for the queue. `--auto` runs without stopping, `--dry` forecasts
without writing; `/shall:work.todo` is the survey alone and
`/shall:work.report` writes up work already done.

#### Anytime — `/shall:raise`

The door for a doubt rather than a request. It explores, says what it found,
and leaves behind a finding, a decision you dictated, both — or nothing at
all.

### Governing your project on Shall

Judgements are yours and are made in the browser; no command approves,
rejects or closes anything.

#### Review & approve

The Review Queue holds everything waiting on you as cards — spec approvals,
work reports, criterion closures, work item completions, standing findings —
each with diffs, evidence and context in front. Approve, reject with a
rationale that becomes the agent's work order, close a criterion over its
evidence or leave it open with your reason.

#### Explore the spec plane

The whole graph on one canvas, grid or graph view, banded domain → intent →
plan → execution. Every node wears its state: red for something to fix,
yellow for a judgement still owed, green for settled — plus the second-axis
words, Open/Closed on criteria, Blocked/Ready/Done on work items, Sat/Unsat
on requirements and scenarios. Read any node, edit it, or propose its
deletion right there.

#### Watch the vitals

How far the spec has come and what it still lacks, computed on every read and
stored nowhere: satisfaction, closure and completion ratios with drill-downs
into what is open and why, and seven spec-health checks for the gaps that are
neither errors nor waiting on anyone — every rule always shown, violated ones
first.

---

Design and invariants live in [`ARCHITECTURE.md`](./ARCHITECTURE.md); the
agent plugin is documented in [`plugin/README.md`](./plugin/README.md).
