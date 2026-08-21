# The development stretch

The spine is [`../SKILL.md`](../SKILL.md), the `shall-work` skill itself: its rule that Shall does not guide this stretch is stated there, and this file is the two ends of it.

## Purpose

Do the work. Shall asks nothing about how — only that you read the specification going in and come out holding what the record is written from.

## What it needs from above

The bundle, confirmed at stop 1 — or picked alone, under `--auto`.

## Going in

Per item, before touching anything:

- **A task**: its own file, the module that allocates it, the requirements carrying the criteria it aims at, and those criteria with their open or closed marks. `shall status --json` gives you the relations to walk and the marks; the bodies are in the files, so read the files.
- **A Fix Spec item**: the rationale a person wrote, whole, or the sentence the grammar wrote — the board carries it complete for exactly this reason. Fixing the wrong thing because you read a summary is the failure this rule exists to prevent.

## In the stretch

**This is where Shall stops talking.** Follow your own best practice and this project's conventions: the rules file it loads into every session, its coding standards, how it tests, how it commits. Nothing in the canon has an opinion about any of it.

Four things to keep while you work:

- **Notes per item, separated from the first minute.** Three items become three work logs, and notes you have to untangle afterwards become one log that says everything vaguely.
- **The shas, in the order you made them.** They go in the log's frontmatter later; git is where they mean anything.
- **No file under `.shall/spec/` is written here** — with one exception, which is that a Fix Spec item's whole job is editing a spec file. When it is, the check runs against your write at once; fix what it says there and then.
- **No finding is written yet.** A thing you noticed is a note. Whether it becomes a node is decided at the write-up, against the threshold in `shall-authoring` §6.

Never call `/shall:raise` from in here. What you found goes into this turn's record.

## When something stops you

The spine's table, in full:

| What happened | Normally | Under `--auto` |
|---|---|---|
| something stops this item | stop it, tell the user what and why, and settle together: switch to another item, or fold the turn | stop it, keep it as a finding, carry on with the rest |
| a judgment that is not yours | ask, in options | do not decide — stop the item, keep the reason, carry on |

Every item stopping is still a turn. Go to the write-up and say what is unfinished and why.

## Coming out

Per item, in hand:

- what was done, in enough detail that somebody who was not here can read it;
- the shas, in order;
- what you ran to check it, and what it said;
- whether every piece of work this item planned is actually finished;
- which criteria you judge closable, and on what grounds;
- anything you noticed that somebody else needs — a candidate finding, with who needs to read it.

## The questions

Ask through AskUserQuestion under the spine's rules. What is worth asking here:

| When | Ask | Options | Header |
|---|---|---|---|
| a design choice the specification does not settle | which way to go | the candidate approaches, the one you would take first | Choice |
| something is stopping the item | what to do with the turn | switch to another item `(Recommended)`, fold the turn, carry on knowing the risk | Blocked |
| the item turns out bigger than one turn | how to end it | finish a coherent part and report it as partial `(Recommended)`, or stop now and report what is done | Scope |

Under `--auto` none of these is asked: each becomes a stopped item with its reason kept.

## The gate

| The line | What proves it |
|---|---|
| the notes are per item | you can name which log each note belongs to without re-reading it |
| nothing under `.shall/spec/` moved | except a Fix Spec item's own edit, which is the work |
| no node was written | the record is written in the next part, after its stop |
