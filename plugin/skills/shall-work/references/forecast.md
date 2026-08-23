# The forecast

The spine is [`../SKILL.md`](../SKILL.md), the `shall-work` skill itself. This is `--dry`: the turn read and predicted, with nothing done and nothing written.

## Purpose

Two uses, and both are about looking before starting. Somebody learning the cycle sees its whole shape in one output without spending a turn on it; somebody about to start sees what this turn would commit them to.

## Steps

1. **Run the survey** — [`todo.md`](todo.md), all four readings.
2. **Pick the bundle** exactly as the spine would have, and say which items and why. Nothing is confirmed and nobody is asked: this is the pick the cycle would have put at stop 1.
3. **Predict the record, per item.** One journal, a work log for each item, and under each log: a completion report if finishing the item would finish everything it planned, and an evidence candidate for each criterion the item's task aims at. Read that off the specification and nowhere else — the task's own file, the module that allocates it, the requirements carrying its criteria, and the criteria themselves with their marks. **Say when a criterion is already closed**: evidence against one reopens it, which is a cost worth knowing before the turn rather than after.
4. **Every line of output carries the prefix** `[DRY]`, including the survey's.
5. **Close with the line**: `[DRY] Forecast only — nothing was recorded.` When the conversation is not in English, say that sentence in the conversation's language and keep the prefix as it is.

## What the forecast may not say

- **No findings.** A finding is something the work turns up, and a prediction of one is a guess about what you have not done yet.
- **No "done".** Nothing was finished, so nothing is reported finished.
- **Nothing the specification does not say.** Where the spec is silent about what a task would produce, the forecast is silent too. An invented deliverable reads exactly like a real one in a transcript somebody skims.

## The gate

| The line | What proves it |
|---|---|
| nothing was written | `git status` says what it said before, and nothing under `.shall/spec/` or `.shall/ledger/` moved — the Activity Feed under it included: a forecast is not logged |
| nothing was committed | `git log` is where it was |
| nobody was stopped | no question was asked and no confirmation waited for |
| it is unmistakably a forecast | every line carries the prefix, and the closing line says it outright |
