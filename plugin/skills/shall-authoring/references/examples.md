# Four worked passages

## A requirement with its criterion

```
$ shall add-spec-node --type Requirement
/home/dev/app/.shall/spec/intent/Requirement/R-0012.md
A new Requirement, R-0012 — fill it in, then shall check reads it back.
```

`.shall/spec/intent/Requirement/R-0012.md`, filled in, `#` comments deleted:

```markdown
---
short_name: Duplicate submit absorbed
name: A resubmitted order creates no second order
---

## Statement

The system SHALL accept a resubmission carrying an order id it has already
accepted without creating a second order.

… the other sections the starting file suggested, filled in …
```

```
$ shall check --scope .shall/spec/intent/Requirement/R-0012.md
9 nodes and 11 relations under /home/dev/app, in intent/Requirement/R-0012.md.
.../Requirement/R-0012.md — R-0012 is a Requirement with no live anchor — it is
held to the graph by a REQUIRES relation into it, and none stands. Draw the
relation, or remove the node.        (exit 1)
```

The first line is always the count, and it is not a finding. It counts the whole project: `--scope` narrows which findings are printed under it, never the graph that was read.

The fix is the parent's file, `.../SystemResponsibility/SR-0004.md` afterwards:

```yaml
---
short_name: Order intake
name: The system absorbs repeated order intake
edges:
  - type: REQUIRES
    to: R-0012
---
```

Now the criterion, the same shape again — child first, then the parent's line:

```
$ shall add-spec-node --type AcceptanceCriterion
/home/dev/app/.shall/spec/intent/AcceptanceCriterion/AC-0031.md
```

The block `R-0012.md` gains once AC-0031 is written:

```yaml
edges:
  - type: HAS_CRITERION
    to: AC-0031
```

```
$ shall check --scope .../SR-0004.md --scope .../R-0012.md --scope .../AC-0031.md
10 nodes and 13 relations under /home/dev/app, in intent/SystemResponsibility/SR-0004.md and intent/Requirement/R-0012.md and intent/AcceptanceCriterion/AC-0031.md.
$ shall check
10 nodes and 13 relations under /home/dev/app.
```

Both exit 0: a clean run is the count line and nothing under it. Three files are yellow now — the two you wrote and SR-0004, which you edited to hold R-0012. Say so when you hand the work over.

## A goal with two sub-goals

```
$ shall add-spec-node --type Goal      # twice: G-0004.md, then G-0005.md
```

Both sub-goal files carry `short_name`, `name` and no `edges` at all. The decomposition is two lines in the parent, `G-0003.md`, sorted by target:

```yaml
edges:
  - type: REFINES
    to: G-0004
  - type: REFINES
    to: G-0005
```

`shall check` will **not** complain if you forget those lines: `Goal` is rootless, so a sub-goal nothing refines to is a valid node — just a second top goal, which is not what you meant. Check the decomposition yourself: if all the sub-goals are achieved, is the parent achieved?

## A deletion proposal

Leave the file where it is and add the block. `R-0007.md` afterwards:

```yaml
---
short_name: Retry on timeout
name: A timed-out submission is retried
edges:
  - type: HAS_CRITERION
    to: AC-0019
deletionProposed:
  by: claude
  rationale: Superseded by R-0012, which absorbs the duplicate the retry creates.
---
```

Run `shall status --scope .shall/spec/intent/Requirement/R-0007.md` and read it back: R-0007 is yellow with the proposal against it, and stays in the graph until a person approves or rejects the deletion in the browser. No command does that. If they approve, every file still pointing at R-0007 reports a gap of its own — which is where the repair happens:

```
.../Requirement/R-0012.md — R-0012 has a DEPENDS_ON relation to R-0007, and no
file names R-0007. The relation is kept as written, so writing or restoring
R-0007 attaches it again.
```

## A module, its contract and one work item

The plan band, and the same shape one layer down: write the child, then open the parent and add the line that holds it.

**What is shown below is the frontmatter and the relations, and the bodies are left out** — not because they are small, but because this passage is about anchoring. A plan-band body is a document: the module's six sections, the work item's three, each given what the starting file asks of it. Do not read the elision here as the shape of the file.

```
$ shall add-spec-node --type Module
/home/dev/app/.shall/spec/plan/Module/M-0002.md
A new Module, M-0002 — fill it in, then shall check reads it back.
```

```
$ shall check --scope .shall/spec/plan/Module/M-0002.md
11 nodes and 14 relations under /home/dev/app, in plan/Module/M-0002.md.
.../Module/M-0002.md — M-0002 is a Module with no live anchor —
it is held to the graph by an IS_REALIZED_BY relation into it, and none stands.
Draw the relation, or remove the node.        (exit 1)
```

The fix is upstairs again, in the responsibility this module realizes. The sorting is by type first, so the new line goes above the one that was there:

```yaml
# .shall/spec/intent/SystemResponsibility/SR-0004.md
edges:
  - type: IS_REALIZED_BY
    to: M-0002
  - type: REQUIRES
    to: R-0012
```

A module realizing two responsibilities gets one such line in **each** of them.

Now the contract. `Interface` is anchored by `EXPOSES` into it **or** `CONSUMES` into it, so the line goes in whichever module publishes it — and a second module that calls it writes its own `CONSUMES` line, which anchors nothing new and says who the consumer is:

```yaml
# .shall/spec/plan/Module/M-0002.md — the module, publishing one contract
edges:
  - type: EXPOSES
    to: IF-0003
```

The data the contract carries hangs off the contract, and names the concept it comes from in its own file — `REPRESENTS` reaches into the domain band, which nothing in the plan band anchors and nothing there goes yellow for:

```yaml
# .shall/spec/plan/Interface/IF-0003.md
edges:
  - type: CARRIES
    to: DS-0001
```

```yaml
# .shall/spec/plan/DataSchema/DS-0001.md
edges:
  - type: REPRESENTS
    to: DE-0002
```

The work item last. Three of its four lines are its own, because planning work must not touch a criterion's file and turn somebody's settled judgment yellow — and it may aim at as many criteria as its definition of done makes judgeable:

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

The fourth is the module's, and it is the one that holds the work item to the graph — sorted with the rest of what M-0002 says:

```yaml
# .shall/spec/plan/Module/M-0002.md
edges:
  - type: ALLOCATES
    to: WI-0007
  - type: CONSUMES
    to: IF-0005
  - type: EXPOSES
    to: IF-0003
  - type: MENTIONS
    to: T-0012
```

```
$ shall check --scope .shall/spec/plan --scope .../SR-0004.md
15 nodes and 22 relations under /home/dev/app, in intent/SystemResponsibility/SR-0004.md and plan.
$ shall check
15 nodes and 22 relations under /home/dev/app.
```

Six files are yellow: the five you wrote, and SR-0004, which you edited to hold M-0002. Say so when you hand the work over.

**The check would have failed without the module's `ALLOCATES` line**, and said so: a work item is held to the graph by that line and by nothing else — its own `TARGETS` lines hold nothing — so a work item aiming at criteria and belonging to no module is an orphan, red, named under the work item's file with the module's file as the fix. Two more things it says, both exit 1: a `DEPENDS_ON` chain that comes back round to WI-0007 through the work items it waits on, and a relation the canon does not allow. Neither file is refused; both are read, and the graph they make is the thing that does not hold. The two `TARGETS` lines are not among them: a work item aims at as many criteria as it genuinely closes.
