# The stretch outside Shall

The spine is [`../SKILL.md`](../SKILL.md), the `shall-work` skill itself: its handover and its self-check are stated there, and this file is the two ends of the stretch between them.

## Purpose

Do the work. Shall asks nothing about how — only that you read the specification going in, say one line of approach, and come out holding what the record is written from, with each item compared against its definition of done.

## What it needs from above

The bundle, confirmed at stop 1 — or picked alone, under `--auto` — with one line of approach per item, and what the look back found per item, in words.

## Going in

Per item, before touching anything:

- **A work item**: its own file — its scope and its definition of done above all — the module or modules that allocate it, the requirements carrying the criteria it targets, and those criteria with their open or closed marks and the evaluation process each one describes. `shall status --json` gives you the relations to walk and the marks; the bodies are in the files, so read the files. The module's own past — its siblings' logs, findings, decisions and reports, and the last turns of the project — was read in the look back and is not read again here: what it found is the context you carry in, and a log or a decision is reopened only when the code turns out to ask for it.
- **A Fix Spec item**: the rationale a person wrote, whole, or the sentence the grammar wrote — the board carries it complete for exactly this reason. Fixing the wrong thing because you read a summary is the failure this rule exists to prevent.
- **The approach line** you gave at stop 1 is the promise you go in with. A different approach is fine when the code turns out to ask for one, and the change is said in the work log's opening section.

## Planning the stretch

**A work item is a promise cut from the specification, not a plan read off this repository's code.** Its scope and its definition of done say what is to be true when the item is done; they do not say which files change, which functions are touched, or what the code that is already there will let you do. So the first thing in the stretch is a plan made against the code: read what is there, and set down, at the level of files and functions, what the item's scope asks and how its definition of done will be made to hold. **The plan is said, not thought: it is text in your reply, in front of the person, and nothing is written under the item until it is there.**

Where the plan is made, in this order:

1. **This project's own procedure, if it has one.** A project may already say how work is planned before it is built — a procedure its rules file names, or a skill or command that exists for that purpose. Read the rules file and the list of skills this session carries before you plan, and if one of them is that procedure, it is the one you use: it stands above the tool below, the way the project's conventions stand above this skill.
2. **Your own planning tool, when the project names none.** {{plan-tool}}

The plan is the approach line from stop 1 unfolded onto the code, bounded by the same premise as everything in the stretch: the items you picked, their scope and their definition of done, and nothing else. If the code turns the plan away from the approach line, that is allowed, and the change is said in the work log's opening section. If the plan shows a design choice the specification does not settle, or an item bigger than one turn, those are the questions at the end of this file — ask them from the plan, before the code, where they cost the least.

Under `--auto`, {{plan-tool-auto}}. The plan is then written into the journal alongside the approach line, so the record still says how the item was going to be done before it says how it was.

## In the stretch

**From here, planning the implementation and implementing it are outside Shall's scope. One premise does not move: everything done in this stretch is for the work items you picked — their scope and their definition of done — and for nothing else. Under that premise, go back to your own base prompt and to this project's conventions — its rules file, its coding standards, how it tests and how it commits — read them again closely, and take them as the standard above this skill. The plan made above, the code written from it, the method and the quality bar: all of that belongs to that world, and Shall's grammar and procedure do not enter it. An improvement you notice outside the work item, you do not make: note it, with what it concerns, and it is material for a finding at the write-up. When you judge the work done, come back to Shall for the self-check.**

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

## Coming back — the self-check

For each item you judge finished, the spine's comparison, in order:

1. **Open its definition of done and compare, by running and calling.** Run what it says runs, call what it says answers, and write down what you saw. A part that does not hold sends you back into the stretch; the item is not finished until it holds.
2. **For each criterion the item targets, run the evaluation process the criterion's own file describes**, and keep the result — it is what the evidence will point at. A process that cannot be run here — it names a screen, a control, a page that this item and its waits did not build — is a fault in the aim and not in the work: the item can still pass on its definition of done, no evidence is written for that criterion, and the aim is a finding for the write-up unless one already says so.
3. **Hold the code to the module's Contracts section**, signature for signature; a departure is a finding.
4. **Re-run the closed criteria the look back named**; one that no longer holds is a finding marked as blocking.
5. **If a part of the definition of done cannot be made to hold**, stop comparing. The item is unfinished, the reason is a finding for the write-up, and whether it is blocking the work is yours to judge and mark.

Then, per item, in hand:

- the approach you actually took, in enough words that somebody could reconstruct it;
- what was done, in enough detail that somebody who was not here can read it;
- the shas, in order;
- which parts of the definition of done you observed to hold, and how — what you ran or called, and what it said;
- the result of each criterion's evaluation process you ran, and which criteria you judge closable on that result;
- whether the item passed the comparison whole — only then is it finished;
- anything you noticed that somebody else needs — a candidate finding, with who needs to read it.

## The questions

{{Ask}} under the spine's rules. What is worth asking here:

| When | Ask | Options | Header |
|---|---|---|---|
| a design choice the specification does not settle | which way to go | the candidate approaches, the one you would take first | Choice |
| something is stopping the item — or its definition of done cannot be made to hold | what to do with the turn | switch to another item `(Recommended)`, fold the turn, carry on knowing the risk | Blocked |
| the item turns out bigger than one turn | how to end it | finish a coherent part and report it as partial `(Recommended)`, or stop now and report what is done | Scope |

Under `--auto` none of these is asked: each becomes a stopped item with its reason kept.

## The gate

| The line | What proves it |
|---|---|
| the approach was said | stop 1, or the journal under `--auto`, carries one line per item |
| the plan was made before the code | you can name where it was made — the project's own procedure, your planning tool, or the journal under `--auto` — and the log's opening section carries it |
| the notes are per item | you can name which log each note belongs to without re-reading it |
| nothing under `.shall/spec/` moved | except a Fix Spec item's own edit, which is the work |
| no node was written | the record is written in the next part, after its stop |
| every item you call finished passed the self-check | you can name, per item, what you ran or called to see its definition of done hold, and what each targeted criterion's evaluation process said |
