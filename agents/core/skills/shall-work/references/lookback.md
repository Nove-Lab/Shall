# The look back — what this module has done, and what the last turns did

The spine is [`../SKILL.md`](../SKILL.md), the `shall-work` skill itself: its picking rules and its rule that nothing is computed by hand govern this part, and every mention of the spine below points there.

## Purpose

Stand at stop 1 knowing what has already happened around the items you mean to take. It reads and it writes nothing. The approach line at stop 1, and the reason for the bundle, are written from what it found.

**It changes the bundle's shape, not its eligibility.** What is startable is the board's answer. What the look back may change is which startable items go together and how each is approached.

## What it needs from above

The survey done, and the candidates chosen under the spine's rules.

## Steps

Per candidate work item:

1. **`shall context --work-item <id> --json`.** The daemon walks the neighbourhood and names the files: the module and its siblings, one hop upstream through the contracts, the logs with their journals, the reports, the findings and every decision whose own lines reach any of it, the criteria with their closure, the newest turns in the feed's order, and what finishing this item would let start. Read what the command answers with, never work the walk out yourself.
2. **Open the files it named.** A journal whole; a log from its approach section on; a decision whole — a person's judgment stands above whatever approach you were going to give; a sibling for its scope and definition of done. `omitted` above zero is said in one line at stop 1.
3. **Keep what you found in words, per item, in your head** — the conventions this module's earlier logs settled on, what they left unfinished or recorded as a finding, what a person decided, and what in the last turns reaches this item. That is the material for stop 1.

**A Fix Spec item has no look back.** Its material is the rationale the board carries.

**A module with no log, or a project with no journal, is the ordinary state of a first turn.** Say so in one line at stop 1 and go on.

## Under the overlays

Under `--auto` the look back runs the same, and what it found goes into the journal's approach section in place of the stop 1 line. Under `--dry` it runs the same — reading is not writing.

## The gate

| The line | What proves it |
|---|---|
| the neighbourhood was read | for each candidate you can name the ids `shall context` answered with, and you opened them |
| nothing was written | `git status` says what it said before, and no file under `.shall/` has moved |
| the ledger stayed shut | no file under `.shall/ledger/` was opened — the feed's order arrived through the command |
