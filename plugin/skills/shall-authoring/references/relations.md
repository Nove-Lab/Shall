# Relations

## The `edges:` block

A YAML list of maps, each exactly two keys — `type` and `to`; two spaces before
`- type:`, four before `to:`:

```yaml
edges:
  - type: HAS_CRITERION
    to: AC-0031
  - type: MENTIONS
    to: T-0012
```

Sort by type, then by target id — the canonical order the daemon writes; any
other order is reported as a note. Four refusals to stay clear of, because **a
file with any problem drops out of the graph whole** — node, body and every edge
— leaving everything anchored to it orphaned on the next read:

- An entry of any other shape, or with any other key.
- The same `type`/`to` pair written twice.
- A relation from a file to its own id. The canon has self-loops between two
  nodes of one type (`Requirement —DEPENDS_ON→ Requirement`), never to self.
- A triple the canon does not allow — caught when the project is read, because
  it depends on the target's type.

A `to:` naming an id no file answers to is not a refusal: the relation is kept
as written and reported as a gap under **your** file.

## The intent chain, in canon names

```
Goal ──REFINES──▶ Goal (the sub-goal)
Goal ──PURSUED_BY──▶ Actor ──PERFORMS──▶ UseCase ──DETAILS──▶ Scenario
Scenario ──DERIVES_RESPONSIBILITY──▶ SystemResponsibility ──REQUIRES──▶ Requirement
Requirement ──HAS_CRITERION──▶ AcceptanceCriterion   (the unit verdict)
Scenario ──HAS_CRITERION──▶ AcceptanceCriterion      (the integration verdict)
Requirement ──HAS_CONSTRAINT──▶ Constraint
```

`SATISFIES`, `DERIVED_FROM`, `ASSIGNED_TO` and `CONSTRAINS` **do not exist**.
Older process documents use them; write one and the file is refused.

**Nothing in this chain runs upward**, so "which goal does this serve" is
answered by walking the chain, not by reading one edge. A responsibility hangs off the **scenario**
whose steps demand it — never a use case as a whole, never a goal. Several
scenarios may derive one responsibility; that is how duplication merges.

## Which end owns the line

The source, always: a relation is written in the file of the node it leaves.
Down the chain above that is the parent, so anchoring a child edits the parent.
Some relations run the other way on purpose — from the lower node up:

| Relation | Written in |
|---|---|
| `ImplementationTask —TARGETS→ AcceptanceCriterion` | the task |
| `WorkLog —ADDRESSES→ ImplementationTask` | the work log |
| `Evidence —CLAIMS→ AcceptanceCriterion` | the evidence |
| `VerificationReport —CLAIMS→ ImplementationTask` | the report |
| `Decision —RESOLVES→ Question`, and `Decision —AFFECTS→` a Requirement, a Constraint or a ModuleDesign | the decision |
| `Finding —ESCALATES→` a Goal, a SystemResponsibility, a Requirement, a Constraint or a ModuleDesign | the finding |

The reason is approval: planning work, starting work, making a claim or filing
what went wrong must not touch the criterion's, the task's or the requirement's
file, because that would turn a green node yellow and put somebody's settled
judgement back in the queue.

## What holds a node in the graph

An *anchor* is the one relation a node must be on the right end of to be part of
the specification rather than a card left on the canvas. Not the grammar's
question: the grammar says what is **allowed** between two types, this says what
is **required** to reach one. `core/graph/anchors.ts` is the single source.

| Type | Held by |
|---|---|
| `Term`, `DomainEntity`, `Goal` | nothing — the canon starts here |
| `Actor` | `PURSUED_BY` into it |
| `UseCase` | `PERFORMS` into it |
| `Scenario` | `DETAILS` into it |
| `SystemResponsibility` | `DERIVES_RESPONSIBILITY` into it |
| `Requirement` | `REQUIRES` into it |
| `AcceptanceCriterion` | `HAS_CRITERION` into it |
| `Constraint` | `HAS_CONSTRAINT` into it |
| `Assumption` | `ASSUMES` into it |
| `Question` | `RAISES` into it |
| `Decision` | `RESOLVES` or `AFFECTS` **out of** it |

Several anchors are an OR, never an AND: a task is held by `ALLOCATES` into it
**or** by its own `TARGETS`, a work log by `LOGS` into it **or** by its own
`ADDRESSES`; an evidence and a verification report are held by their own
`CLAIMS` alone. Read `anchors.ts` before relying on a Plan or Execution row.

## Two worked anchors

**A responsibility under its scenario.** Write `SR-0009`, then add the line to
`.shall/spec/intent/Scenario/SC-0004.md`:

```yaml
edges:
  - type: DERIVES_RESPONSIBILITY
    to: SR-0009
  - type: HAS_CRITERION
    to: AC-0022
```

Check both paths with `--scope`. SC-0004 is yellow again; that is the review the
anchoring earned.

**A term a requirement mentions.** `Term` is rootless, so `T-0012` needs no
anchor — but the mention is a line in `.shall/spec/intent/Requirement/R-0012.md`,
and nothing goes into `T-0012.md`:

```yaml
edges:
  - type: HAS_CRITERION
    to: AC-0031
  - type: MENTIONS
    to: T-0012
```
