# The landing

The spine is [`../SKILL.md`](../SKILL.md), the `shall-raise` skill itself. **This file runs after the judgment is settled** — everything above it is a conversation, and nothing has reached disk yet.

Follow `shall-authoring` for the files themselves: the path, the id, the frontmatter, and what to do when the check refuses one. What is this process's is the order and the check below.

## (a) A decision, and what it revises

1. `shall add-spec-node --type Decision` and fill in the sections the starting file suggests. What the user settled goes in as they settled it, reasons included: the point of the node is that somebody later can see why, not just what.
2. **Write its lines at everything it revises, in the same pass.** Those lines are what holds a decision in the graph — one with none is an orphan, and a line at the finding it answers does not hold it. If the user settled a change to three nodes, all three are named here.
3. **Then edit those nodes**, minimally: change what the decision says changed and nothing else. A node the change removes is not deleted — it gets a deletion proposal a person judges, which is `shall-authoring` §5. Say afterwards what you deliberately left alone.
4. `shall check --scope <file>` over what you wrote, then over the project once.

## (b) A finding, standing alone

1. `shall add-spec-node --type Finding`.
2. Fill in what you saw and why it has to reach somebody or change something — with the background, because a person deciding over it later has only this file. The mark that says work is stopped goes on only when something is actually stopped right now; the ids it concerns are a hint, may be left out entirely, and are not checked against anything.
3. **No line anywhere** — not in this file, and not in anybody else's pointing at it. A finding brought from outside a turn of work is held by nothing, which is why it can be written at all.
4. `shall check --scope <file>` — it exits 0. A finding on its own is a whole node, not a loose one.

## (c) Both

1. **The finding first**, exactly as in (b), so its id exists.
2. **Then the decision**, with its line at that finding as well as its lines at everything it revises. Both kinds of line live in the decision's own file.
3. Then the edits, as in (a), and the check.

What was seen belongs in the finding; what was decided belongs in the decision. Written the other way round, the record of the observation disappears the moment somebody disagrees with the decision.

## (d) Nothing

No file. Say what you checked and why it is fine.

## The gate

| The line | What proves it |
|---|---|
| everything written holds together | `shall check` exits 0 over the files, and over the project |
| the decision is anchored | it names at least one node it revises, in its own file |
| the finding has a reader | it passes the threshold in `shall-authoring` §6 |
| nothing settled was disturbed | no approved execution record was edited, and no closure was reopened |
| the finding was not rewritten to look answered | a decision answers it; the finding says what it always said |
