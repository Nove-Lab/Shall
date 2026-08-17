# Three worked passages

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

The first line is always the count, and it is not a finding. It counts the whole
project: `--scope` narrows which findings are printed under it, never the graph
that was read.

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

Both exit 0: a clean run is the count line and nothing under it. Three files are
yellow now — the two you wrote and SR-0004, which you edited to hold R-0012. Say
so when you hand the work over.

## A goal with two sub-goals

```
$ shall add-spec-node --type Goal      # twice: G-0004.md, then G-0005.md
```

Both sub-goal files carry `short_name`, `name` and no `edges` at all. The
decomposition is two lines in the parent, `G-0003.md`, sorted by target:

```yaml
edges:
  - type: REFINES
    to: G-0004
  - type: REFINES
    to: G-0005
```

`shall check` will **not** complain if you forget those lines: `Goal` is
rootless, so a sub-goal nothing refines to is a valid node — just a second top
goal, which is not what you meant. Check the decomposition yourself: if all the
sub-goals are achieved, is the parent achieved?

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

Run `shall status --scope .shall/spec/intent/Requirement/R-0007.md` and read it
back: R-0007 is yellow with the proposal against it, and stays in the graph
until a person approves or rejects the deletion in the browser. No command does
that. If they approve, every file still pointing at R-0007 reports a gap of its
own — which is where the repair happens:

```
.../Requirement/R-0012.md — R-0012 has a DEPENDS_ON relation to R-0007, and no
file names R-0007. The relation is kept as written, so writing or restoring
R-0007 attaches it again.
```
