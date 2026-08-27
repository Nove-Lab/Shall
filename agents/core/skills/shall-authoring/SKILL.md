---
name: shall-authoring
description: Write, revise, relate or retire a Shall spec node — use whenever you add or edit anything under `.shall/spec`, draw a relation between two nodes, propose a deletion, or fix what `shall check` reported. Carries the anchoring rule, the propose-and-review loop, and the `shall` CLI contract.
tools: shall-cli
process: false
---

# Authoring a Shall spec node

The specification is files. One node is one markdown file at `.shall/spec/<band>/<Type>/<id>.md`: the FOLDER is its type and the FILENAME is its id, so neither is written inside. Above the fence live `short_name`, `name` and `edges` — outgoing relations only. Below the fence is free markdown that nothing parses.

- [references/relations.md](references/relations.md) — read before you draw any relation, and whenever a check reports an orphan or an id nothing answers to.
- [references/layout.md](references/layout.md) — read when you need the folder, the id shape, or what the rest of `.shall/` holds.
- [references/examples.md](references/examples.md) — read when you want a worked passage to copy: a requirement with its criterion, a goal with two sub-goals, a deletion proposal.

## 1. Writing is proposing

A file you write is a proposal, not a fact. The node is yellow — a judgment is owed — until a person approves it in the browser. Nothing you can run turns a node green, and no file you write may claim it is approved.

Editing a green node turns it yellow again and costs somebody a second reading. So change what you mean to change — no drive-by rewording, no reformatting a file you only opened to read — and say in the conversation what you changed and why. The reviewer meets your work as a card in a queue, not as a narrative of your reasoning.

## 2. The three refusals

**Never delete a spec file.** Not `rm`, not `git rm`, not a delete tool. Propose the deletion by adding a `deletionProposed` block to the file's own frontmatter and leave the file exactly where it is — section 5. Deleting takes the decision away from the person whose decision it is, and it takes the node out of the graph at once: everything anchored to it turns orphan and every file pointing at it reports a gap, before anybody has agreed the node should go.

**Never write anything under `.shall/ledger/`, and do not read it either.** Those books are Shall's own and the daemon alone writes them; {{ledger-guard}}, and the rule is a glob over the whole folder, so it covers the Activity Feed under `ledger/feed/` as well. The one line a process leaves there at its end goes through `shall log`, which asks the daemon to append it — you never open the file, and the feed is never read back: it is a person's news page, not a record anything is computed from. Reading the books is merely pointless: `shall status` and `shall board` already report everything they hold, and a color you work out from one by hand will disagree with the screen.

**Never work out a color, a queue, or what is ready to start by reasoning about it.** Color is arithmetic over the files and the three ledgers, recomputed on every read. Ask the CLI, every time — `shall status` for a node, `shall board` for whose turn it is.

## 3. The loop

1. `shall add-spec-node --type <Type>` — its FIRST LINE of output is the path, alone. Write there and nowhere else; the daemon has already picked the next free id and put the file in the right folder.
2. Fill the starting file in, deleting the `#` comment lines as you consume them. It lists the relations this type may draw and suggests the body sections with their vocabulary; keep those sections, reshape them, or write your own.
3. **Write the anchoring relation in the PARENT's file.** A new node cannot hold itself — section 4.
4. `shall check --scope <child> --scope <parent>` while you iterate, so you read your own two files and not the whole project.
5. Repeat 2–4 until the scoped check exits 0.
6. `shall check` whole before you hand the work over. A scoped check is blind to the file across the tree that still points at something you renamed.

## 4. A node is a file plus a line in its parent

A relation is written in the file of the node it LEAVES, and nowhere else. `Requirement —HAS_CRITERION→ AcceptanceCriterion` is a line in the requirement:

```yaml
edges:
  - type: HAS_CRITERION
    to: AC-0031
```

`AC-0031.md` says nothing about it. So anchoring a child EDITS THE PARENT, and the parent goes yellow and is read again. That is not damage; it is the graph asking a person whether the parent still says the right thing now that something hangs off it.

Now the rule that saves you from thrashing. When a check says

```
.../AcceptanceCriterion/AC-0031.md — AC-0031 is an AcceptanceCriterion with no
live anchor — it is held to the graph by a HAS_CRITERION relation into it, and
none stands. Draw the relation, or remove the node.
```

the file to edit is **the parent's**, never the child's. No relation leaving a criterion can hold it, so every edge you add to `AC-0031.md` leaves the sentence exactly as it was. A hook may reflect that sentence back at you the instant you save the child; it is not a rejection of what you wrote, it is naming your next step. Which relation holds which type is in [references/relations.md](references/relations.md).

## 5. Deleting

Leave the file. Add one block to its frontmatter:

```yaml
deletionProposed:
  by: claude
  rationale: Superseded by R-0018, which states the same rule for both callers.
```

Both values are one line each — a newline in them is refused. If the case needs a paragraph, put the paragraph in the body and keep the rationale to its point.

The block is a change nobody has judged, so the node turns yellow. The Review Queue's card offers no door on it — it says "Deletion proposed — decide in the Spec plane" and nothing else — and the decision is made on the node there, against the rationale and everything still pointing at it: approve the deletion, or reject it. In the execution band only Reject stands, because a record is not unhappened by removing it. **A person decides**, and no command does. If you change your mind, remove the block — that is another change, and say so.

Relations pointing at the node stay written on purpose. If the file does go, the check files `X has a … relation to <id>, and no file names <id>` under each file that still refers to it, which is exactly where the re-anchor or the restore happens.

## 6. One node, one file, one concern

A statement is one sentence; everything else belongs in the description. A statement that keeps growing — "and", "as well as", a second subject — is two nodes: split it and relate the halves. That rule is about the statement and not about the file.

**How long a node is follows what the node is for.** The things a specification would have put in one row of a table — a goal, a requirement, a term, a criterion — are one claim and what makes it judgeable, and padding them buries the claim a reviewer came to read. The things that are documents in their own right are documents here too: a module carries its technology, its structure, its contracts at signature level and the reasoning that settled them; a work item carries its scope and its definition of done — enough that somebody who was not in the conversation can pick it up, and no method; a record of work carries what happened. Writing one of those thin does not make it easier to approve — it makes it something nobody can build from, which is the harder failure to see and the more expensive one to fix.

**Where the job is written down is the starting file, and that is what to read.** `shall add-spec-node --type <Type>` names the sections that type carries and says what each one is for, and those hints are the measure: a section that says to walk the scenarios through is asking for the walkthrough, not for a sentence about one; a section that asks for a single sentence is asking for a single sentence. Give each what it asks for, and let the length be whatever that comes to.

**Nothing is truncated anywhere, so a screen is never the reason.** The panel scrolls, the card in the queue is the width of the browser, and no view cuts a body off. Nobody is served by a design shortened to fit something that was never a limit.

Say each thing once, in the node whose thing it is. Where a neighbor already carries a fact, draw the relation and let it stand: a node that reads well only because it repeats its neighbors is approved once and wrong ever after. That is what is wrong at any length — repetition, and saying a neighbour's thing — and it is a different question from how much a node holds.

**A finding needs a reader.** Write a `Finding` only when at least one of two things is true: what you found has to reach whoever works next — the next session included — or it recurs and the work is done twice; or it asks for a change to the specification or the plan, which is what a person writes a decision over. If neither is true it is not a finding, however unexpected it was: something you met, settled on the spot and that changes nothing belongs in the work log's narrative. What the spec or the plan already says, ordinary implementation detail and a choice that was yours to make were never findings at all. A node nobody will read is a card somebody judges for nothing.

Where it belongs follows where it came from. One you made while doing the work is recorded by that work log; one you brought from outside a turn of work stands on its own and reaches the queue as its own card. Do not manufacture a work log to hold a finding, and do not hold back a finding because there is no work log to put it under.

## 7. Don't reopen what is closed

A criterion a person has closed is closed over the exact list of evidence that claimed it then. Attach one more piece of evidence and the closure lapses by arithmetic: the card comes back and somebody has to judge the whole list again. The same holds for a work item somebody has called done and the reports claiming it.

So before you add evidence against a closed criterion, or a report against a finished work item, ask the user whether reopening it is what they want — and if the answer is yes, say plainly that the closure will have to be made again.

## 8. Say what you did not touch

When you deliberately leave a neighboring node alone that a reader would expect you to have revised — the sibling requirement with the same wording, the criterion your change makes stale, the parent whose statement now reads oddly — say so in the conversation, and say why. The reviewer sees a card, not your reasoning, and silence reads as an oversight.

## 9. Correct yourself before the check does

`shall check` reads files and the graph. It cannot read a sentence, so these are yours to keep:

- **The spec has one language, and the user chooses it.** A spec that already holds nodes is written in the language those nodes use — follow it, whatever language the conversation is in. In a project whose spec is still empty, and where the conversation with the user is not in English, ask once before the first file is written — English, or the user's language — and follow the answer for every file after; the files themselves carry the decision from then on. In a spec not written in English, that language's own normative marker stands in wherever a rule names `SHALL` or `MUST`.
- A requirement's statement is **one SHALL or MUST sentence carrying one behavior**. Nothing verifies this; it is a rule of authorship, and a person reviewing the node will hold you to it.
- Follow the vocabulary the starting file suggests wherever it offers one. It is generated from the canon, so it is the current wording by construction.
- A criterion must be **judgeable by somebody who has not seen the code**: name an observable outcome and how it would be checked, at a generality that later becomes several test cases. Not a test script, not a fixture.
- **No framework, schema, algorithm or library belongs in intent.** If the user names a stack, record it — an Assumption, or a Constraint when it genuinely binds a requirement — and keep it out of goals, use cases, scenarios, responsibilities and requirements.
- Draw a `MENTIONS` relation only **from a node you are already writing**. It is a line in the mentioning node's file, so mentioning a term from twenty existing nodes means editing twenty files and turning twenty green nodes yellow. Nobody asked for that review.

In the plan band, four more:

- **A module names its technology by its standard names, and its contracts at signature level.** The runtime, the language, the storage and the core libraries are written as the world calls them — localStorage is localStorage — and what the module exposes is written as name, inputs, outputs and errors. A function body, pseudocode or a list of files is the repository's and is not written here; a figure of speech where a technology should stand is a decision withheld.
- **A work item says what exists when it is done and how that is observed** — its scope and its definition of done — and never the method: no files, no functions, no procedure. The method is the work's, decided after the code has been read. The one exception is a person asking for paths in so many words.
- **A work item targets none, one or several criteria.** A structural item targets none and is done when a person closes the completion report claiming it; a functional item targets the criteria its definition of done makes judgeable. A definition of done is never the criterion's sentence again.
- **A work item no `Module` `ALLOCATES` is an orphan.** `ALLOCATES` into it is the one relation that holds it — its own `TARGETS` holds nothing — so `shall check` reports it, and the fix is the module's line, never the work item's.

## 10. The CLI contract

| Command | What it answers |
|---|---|
| `shall status [--scope <path>]… [--json]` | every node with its color and the reason, the problem sentence a rule wrote against it, a standing rejection's rationale in full, a criterion's open/closed mark, a work item's blocked/ready/in_review/done (`workItemState`), a deletion proposal, and the relations written in its file |
| `shall board [--json]` | two lists: **Fix Spec** (every red node — a person's rejection first, rationale whole, then the seams the grammar found) and **Implement** (work items ready to start) |
| `shall context --work-item <id> [--json]` | the look back before a work item is started: the files to open — its module's siblings and their logs, the reports, findings and decisions around them, the criteria they target, the newest turns in the feed's order, and what finishing it would let start. Files, never bodies |
| `shall check [--scope <path>]… [--json]` | the compiler: a count line first — `N nodes and M relations under <root>[, in <scope>]`, counted over the whole project even under a scope, and never a finding — then `file — sentence` per finding: problems (files the graph refused), gaps (an id nothing answers to, a node no live anchor holds, a rule of the graph broken), notes (valid but not canonical) |
| `shall add-spec-node --type <Type> [--json]` | a starting file at the node's own path, with the next free id; the path is the first line of output, alone |
| `shall log <kind> <summary> [--refs <id,id>] [--json]` | yes or no, and nothing else: the daemon appends one line to the project's Activity Feed. `kind` is one of `specify_done`, `plan_done`, `work_done`, `raise_landed`, and any other word is refused with that list. `--refs` takes node ids, as ids separated by commas. A process calls it once at its end, where its spine says, and the feed is never read back — there is no command that prints it |
| `shall init` | makes this folder a Shall project |

`--scope` is a path filter — a file, a type folder, a band folder, or a spec-relative prefix — and it is repeatable. It must name something that is there: a folder nothing has been written into yet does not exist, and naming it is refused rather than answered with an empty list, because a narrowing that quietly selects nothing turns a check into a pass. It narrows which findings and which nodes are reported; it never follows a relation, so it cannot tell you what hangs off a node. For that, read the relations `shall status` prints and walk them yourself.

`--json` puts exactly one JSON object on stdout. A failure prints `{"error": "<sentence>"}` and exits 1. **`shall check` exits 1 when there are problems or gaps** — notes never fail it — and everything else exits 0 unless the call itself failed.

There is no `shall approve`, no `shall reject`, no `shall close`, and there never will be. A judgment is a person's, made in the browser — and `shall log` cannot write one: it records that a process finished, never how anything was judged.

## Where the node format lives

Nothing here lists a type's fields or body headings, and no reference does either. The starting file `shall add-spec-node` writes is generated from the canon, so it is the current wording: read the file you just made, and follow it.
