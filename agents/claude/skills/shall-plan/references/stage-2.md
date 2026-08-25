# Stage 2 — Transcription

The spine is [`../SKILL.md`](../SKILL.md), the `shall-plan` skill itself: its agreement, its one browser wait and its account of what arrives in the queue govern this stage, and every mention of the spine below points there.

## Purpose

Write what was agreed, in one pass, and hand it to the queue. This stage runs only after the yes — or, under `--auto`, after the plan was written out in full — and it writes nothing the presented plan did not contain.

## What it needs from above

The plan, agreed and whole: the stack and whether it is project-wide; every module with its responsibilities, its six sections and the terms it leans on; every interface and schema; every work item with its module or modules, the criteria it targets, what it waits on and its definition of done; every default that became an assumption. Fix Spec clear — the spine says to read `shall board --json` at the start of this stage too.

## The order of writing

Every anchor's far end has to exist before `shall check` reads the graph, so the order is the anchor's:

1. **Modules first.** Each with `shall add-spec-node --type Module`; fill the six sections from the plan; then open each responsibility it realizes and add the `IS_REALIZED_BY` line — the module's anchor lives upstairs. A module realizing several responsibilities gets one such line in **each** of them.
2. **The technology decision, if the plan named one.** `shall add-spec-node --type Decision`, its `AFFECTS` lines at every module it binds, in its own file. Written after the modules so that every line it draws reaches a file that exists.
3. **Interfaces, then schemas.** The `EXPOSES` and `CONSUMES` lines in the modules' files, `CARRIES` in the interface's, `REPRESENTS` in the schema's.
4. **Work items last.** Each written first so its id exists, then each parent module's `ALLOCATES` line; the work item's own file carries `DEPENDS_ON`, `TARGETS` and `MENTIONS`.
5. **Assumptions** hang off their module with `ASSUMES` in the module's file, written with the module.
6. **`shall check`** — over the plan band and every responsibility you edited while you iterate (`--scope <path>` is a path filter naming a file, a type folder, a band folder or a spec-relative prefix, and it never follows a relation), then whole before you hand over. It prints a count line, then `file — sentence` per finding. Fix and re-run until it exits 0. A file that will not read is not in the graph at all.
7. **Say what is waiting**, in the spine's words — one or more cards, never "the card" — and stop for the one browser wait.

## Authoring mechanics

Follow `shall-authoring` for the file itself. What is this stage's: **write the child first**, so its id exists, **then open the parent and add the line that anchors it.**

| You write | Its anchor line goes in | Written as | Its own file then gains |
|---|---|---|---|
| `Module` | each responsibility's file | `IS_REALIZED_BY` → the module | `EXPOSES` / `CONSUMES` → its interfaces, `ALLOCATES` → its work items, `ASSUMES` → an assumption, `MENTIONS` |
| `Decision` | nowhere above it — its own `AFFECTS` lines hold it | — | `AFFECTS` → every module the stack binds |
| `Interface` | the publishing module's file — and the calling module's, which anchors nothing new and says who consumes it | `EXPOSES` / `CONSUMES` → the interface | `CARRIES` → a schema, `MENTIONS` |
| `DataSchema` | the interface's file | `CARRIES` → the schema | `REPRESENTS` → a domain entity, `MENTIONS` |
| `WorkItem` | each parent module's file | `ALLOCATES` → the work item | `DEPENDS_ON` → the work items it waits on, `TARGETS` → the criteria it aims at, `MENTIONS` |

```yaml
# .shall/spec/intent/SystemResponsibility/SR-0004.md — the responsibility, gaining a module
edges:
  - type: IS_REALIZED_BY
    to: M-0002
  - type: REQUIRES
    to: R-0012
```

```yaml
# .shall/spec/plan/Module/M-0002.md — the module: one contract published, one called, one work item allocated
edges:
  - type: ALLOCATES
    to: WI-0007
  - type: CONSUMES
    to: IF-0005
  - type: EXPOSES
    to: IF-0003
```

```yaml
# .shall/spec/plan/Decision/D-0001.md — the stack, binding two modules
edges:
  - type: AFFECTS
    to: M-0001
  - type: AFFECTS
    to: M-0002
```

```yaml
# .shall/spec/plan/WorkItem/WI-0007.md — waiting on one, aiming at two
edges:
  - type: DEPENDS_ON
    to: WI-0004
  - type: TARGETS
    to: AC-0031
  - type: TARGETS
    to: AC-0032
```

The work item's lines are its own, and that is the point: writing them touches neither the criteria's files nor the other work item's, so nobody's approval moves because work got planned. A spanning work item gets its `ALLOCATES` line in **each** parent module's file.

Anchoring edits the parent, so every responsibility and every module you touch goes yellow again — the graph asking whether it still says the right thing now that something hangs off it. **An orphan module is repaired in a responsibility's file, an orphan interface in a module's, an orphan schema in an interface's, an orphan work item in a module's — never in the orphan's own.** `REPRESENTS` and `MENTIONS` point into the domain band and turn nothing yellow: a relation is written in the file it leaves.

## In revision mode

Edit the files that are there and keep their ids; a new file for an old thought orphans the old one's children and leaves two answers in the graph. Add what the plan added. Delete only what the user asked to delete, and only as a proposal a person judges in the browser — `shall-authoring` §5. A changed module's card roots at the responsibility above it, which you may not have edited; a new work item under an existing module moves that module's `ALLOCATES` line, and the module comes back to the queue for exactly that reason.

## The gate

| The line | What proves it |
|---|---|
| the graph holds together | `shall check` exits 0 over the whole project |
| every anchor line was written in the parent's file | the check is silent about orphans |
| nothing was written that the presented plan did not contain | you read the files against the plan |
| the decision, when there is one, reaches every module the stack binds | its `AFFECTS` lines, in its own file |
| the cards were said, not approved | you told the person where the queue is and stopped |

## When the gate fails

| What happened | Where to go |
|---|---|
| a module reports no live anchor | the responsibility's `IS_REALIZED_BY` line is missing — write it there |
| an interface or a schema reports no live anchor | the module's `EXPOSES` or `CONSUMES` line, or the interface's `CARRIES` line |
| a work item reports no live anchor | the module's `ALLOCATES` line — and if there is no module it belongs to, the plan was wrong: back to stage 1 |
| the decision reports no live anchor | it names no module — write its `AFFECTS` lines |
| a `DEPENDS_ON` loop | the chain of waits in the work items' own files — one of them is not a genuine wait |
| a relation the canon does not allow | the table above; `shall check` names the line |
| a node red with a rejection, after the wait | read the rationale whole from `shall status --json` and revise that file; it lapses when the content changes |
