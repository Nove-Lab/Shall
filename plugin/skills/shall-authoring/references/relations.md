# Relations

## The `edges:` block

A YAML list of maps, each exactly two keys — `type` and `to`; two spaces before `- type:`, four before `to:`:

```yaml
edges:
  - type: HAS_CRITERION
    to: AC-0031
  - type: MENTIONS
    to: T-0012
```

Sort by type, then by target id — the canonical order the daemon writes; any other order is reported as a note. Four refusals to stay clear of, because **a file with any problem drops out of the graph whole** — node, body and every edge — leaving everything anchored to it orphaned on the next read:

- An entry of any other shape, or with any other key.
- The same `type`/`to` pair written twice.
- A relation from a file to its own id. The canon has self-loops between two nodes of one type (`Requirement —DEPENDS_ON→ Requirement`), never to self.
- A triple the canon does not allow — caught when the project is read, because it depends on the target's type.

A `to:` naming an id no file answers to is not a refusal: the relation is kept as written and reported as a gap under **your** file.

## The intent chain, in canon names

```
Goal ──REFINES──▶ Goal (the sub-goal)
Goal ──PURSUED_BY──▶ Actor ──PERFORMS──▶ UseCase ──DETAILS──▶ Scenario
Scenario ──DERIVES_RESPONSIBILITY──▶ SystemResponsibility ──REQUIRES──▶ Requirement
Requirement ──HAS_CRITERION──▶ AcceptanceCriterion   (the unit verdict)
Scenario ──HAS_CRITERION──▶ AcceptanceCriterion      (the integration verdict)
Requirement ──HAS_CONSTRAINT──▶ Constraint
```

`SATISFIES`, `DERIVED_FROM`, `ASSIGNED_TO` and `CONSTRAINS` **do not exist**. Older process documents use them; write one and the file is refused.

**Nothing in this chain runs upward**, so "which goal does this serve" is answered by walking the chain, not by reading one edge. A responsibility hangs off the **scenario** whose steps demand it — never a use case as a whole, never a goal. Several scenarios may derive one responsibility; that is how duplication merges.

## The plan chain, in canon names

```
SystemResponsibility ──IS_REALIZED_BY──▶ ModuleDesign
ModuleDesign ──EXPOSES──▶ Interface ──CARRIES──▶ DataSchema ──REPRESENTS──▶ DomainEntity
ModuleDesign ──CONSUMES──▶ Interface        (the contract this module calls)
ModuleDesign ──ALLOCATES──▶ ImplementationTask ──DEPENDS_ON──▶ ImplementationTask
ImplementationTask ──TARGETS──▶ AcceptanceCriterion   (written in the task)
```

**No relation joins two modules.** A module depends on another by consuming what that one exposes, so the dependency is two lines about one contract and never a line between the two files — which is also why a dependency you cannot name a contract for is a dependency reaching past a boundary into somebody's internals.

**No relation joins a module to a requirement or a constraint.** Those are read while the boundaries are being cut and leave no trace in the graph, so the reasoning that used one has to be written into the module's own words or it is gone.

## Which end owns the line

The source, always: a relation is written in the file of the node it leaves. Down the chain above that is the parent, so anchoring a child edits the parent. Some relations run the other way on purpose — from the lower node up:

| Relation | Written in |
|---|---|
| `ImplementationTask —TARGETS→ AcceptanceCriterion` | the task |
| `WorkLog —ADDRESSES→ ImplementationTask` | the work log |
| `Evidence —CLAIMS→ AcceptanceCriterion` | the evidence |
| `TaskCompletionReport —CLAIMS→ ImplementationTask` | the report |
| `Decision —RESOLVES→ Finding`, and `Decision —AFFECTS→` anything in domain, intent or plan except another decision | the decision |

The reason is approval: planning work, starting work, making a claim or deciding a revision must not touch the criterion's, the task's or the requirement's file, because that would turn a green node yellow and put somebody's settled judgment back in the queue.

**A finding starts no relation at all, and nothing has to hold it either.** The ids it concerns go in its own `relatedNodes` list, which is a hint and not a relation: nothing checks that those ids answer to a file, an empty list is not a fault, and no walk follows them. A finding is rootless like a `Goal`, because its belonging follows its birth — one made in the middle of a turn of work is `RECORDS`ed by that work log and read as part of that report, and one brought between turns stands alone and reaches the queue as a card of its own. Write neither line into the finding: the `RECORDS` line lives in the work log's file, and the absence of one is not a hole to fill. What answers a finding is a `Decision` that `RESOLVES` it, written afterwards in the decision's own file — so a finding is never edited to record that somebody dealt with it. That decision is held to the graph by what it revises and not by the finding it answers, so a `RESOLVES` line on its own leaves it an orphan.

## What holds a node in the graph

An *anchor* is the one relation a node must be on the right end of to be part of the specification rather than a card left on the canvas. Not the grammar's question: the grammar says what is **allowed** between two types, this says what is **required** to reach one. `core/graph/anchors.ts` is the single source.

| Type | Held by |
|---|---|
| `Term`, `DomainEntity`, `Goal` | nothing — the canon starts here |
| `Journal`, `Finding` | nothing either — a journal starts the record, and a finding may be brought from outside one |
| `Actor` | `PURSUED_BY` into it |
| `UseCase` | `PERFORMS` into it |
| `Scenario` | `DETAILS` into it |
| `SystemResponsibility` | `DERIVES_RESPONSIBILITY` into it |
| `Requirement` | `REQUIRES` into it |
| `AcceptanceCriterion` | `HAS_CRITERION` into it |
| `Constraint` | `HAS_CONSTRAINT` into it |
| `ModuleDesign` | `IS_REALIZED_BY` into it |
| `Interface` | `EXPOSES` into it **or** `CONSUMES` into it |
| `DataSchema` | `CARRIES` into it |
| `ImplementationTask` | `ALLOCATES` into it **or** its own `TARGETS` |
| `Assumption` | `ASSUMES` into it |
| `Decision` | its own `AFFECTS` |

Several anchors are an OR, never an AND: a task is held by `ALLOCATES` into it **or** by its own `TARGETS`, a work log by `LOGS` into it **or** by its own `ADDRESSES`; an evidence and a completion report are held by their own `CLAIMS` alone. Read `anchors.ts` before relying on an Execution row.

The task's OR is the one to watch, because it lets through a mistake nothing downstream will report. A task that targets a criterion and belongs to no module is a whole node: no check files it, no door refuses it, and the board will offer it to somebody the moment its chain goes green. It is still wrong — work with no design behind it is a backlog somebody stored, not a plan — so the module's `ALLOCATES` line is yours to remember.

## Two worked anchors

**A responsibility under its scenario.** Write `SR-0009`, then add the line to `.shall/spec/intent/Scenario/SC-0004.md`:

```yaml
edges:
  - type: DERIVES_RESPONSIBILITY
    to: SR-0009
  - type: HAS_CRITERION
    to: AC-0022
```

Check both paths with `--scope`. SC-0004 is yellow again; that is the review the anchoring earned.

**A term a requirement mentions.** `Term` is rootless, so `T-0012` needs no anchor — but the mention is a line in `.shall/spec/intent/Requirement/R-0012.md`, and nothing goes into `T-0012.md`:

```yaml
edges:
  - type: HAS_CRITERION
    to: AC-0031
  - type: MENTIONS
    to: T-0012
```
