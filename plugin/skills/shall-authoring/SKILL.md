---
name: shall-authoring
description: Write, revise, relate or retire a Shall spec node — use whenever you add or edit anything under `.shall/spec`, draw a relation between two nodes, propose a deletion, or fix what `shall check` reported. Carries the anchoring rule, the propose-and-review loop, and the `shall` CLI contract.
---

# Authoring a Shall spec node

The specification is files. One node is one markdown file at
`.shall/spec/<band>/<Type>/<id>.md`: the FOLDER is its type and the FILENAME is
its id, so neither is written inside. Above the fence live `short_name`, `name`
and `edges` — outgoing relations only. Below the fence is free markdown that
nothing parses.

- [references/relations.md](references/relations.md) — read before you draw any
  relation, and whenever a check reports an orphan or an id nothing answers to.
- [references/layout.md](references/layout.md) — read when you need the folder,
  the id shape, or what the rest of `.shall/` holds.
- [references/examples.md](references/examples.md) — read when you want a worked
  passage to copy: a requirement with its criterion, a goal with two sub-goals,
  a deletion proposal.

## 1. Writing is proposing

A file you write is a proposal, not a fact. The node is yellow — a judgement is
owed — until a person approves it in the browser. Nothing you can run turns a
node green, and no file you write may claim it is approved.

Editing a green node turns it yellow again and costs somebody a second reading.
So change what you mean to change — no drive-by rewording, no reformatting a
file you only opened to read — and say in the conversation what you changed and
why. The reviewer meets your work as a card in a queue, not as a narrative of
your reasoning.

## 2. The three refusals

**Never delete a spec file.** Not `rm`, not `git rm`, not a delete tool.
Propose the deletion by adding a `deletionProposed` block to the file's own
frontmatter and leave the file exactly where it is — section 5. Deleting takes
the decision away from the person whose decision it is, and it takes the node
out of the graph at once: everything anchored to it turns orphan and every file
pointing at it reports a gap, before anybody has agreed the node should go.

**Never write anything under `.shall/ledger/`, and do not read them either.**
Those books are Shall's own and the daemon alone writes them; the project's
`.claude/settings.json` denies the edit outright. Reading is merely pointless:
`shall status` and `shall board` already report everything the books hold, and a
colour you work out from one by hand will disagree with the screen.

**Never work out a colour, a queue, or what is ready to start by reasoning about
it.** Colour is arithmetic over the files and the three ledgers, recomputed on
every read. Ask the CLI, every time — `shall status` for a node, `shall board`
for whose turn it is.

## 3. The loop

1. `shall add-spec-node --type <Type>` — its FIRST LINE of output is the path,
   alone. Write there and nowhere else; the daemon has already picked the next
   free id and put the file in the right folder.
2. Fill the starting file in, deleting the `#` comment lines as you consume
   them. It lists the relations this type may draw and suggests the body
   sections with their vocabulary; keep those sections, reshape them, or write
   your own.
3. **Write the anchoring relation in the PARENT's file.** A new node cannot hold
   itself — section 4.
4. `shall check --scope <child> --scope <parent>` while you iterate, so you read
   your own two files and not the whole project.
5. Repeat 2–4 until the scoped check exits 0.
6. `shall check` whole before you hand the work over. A scoped check is blind to
   the file across the tree that still points at something you renamed.

## 4. A node is a file plus a line in its parent

A relation is written in the file of the node it LEAVES, and nowhere else.
`Requirement —HAS_CRITERION→ AcceptanceCriterion` is a line in the requirement:

```yaml
edges:
  - type: HAS_CRITERION
    to: AC-0031
```

`AC-0031.md` says nothing about it. So anchoring a child EDITS THE PARENT, and
the parent goes yellow and is read again. That is not damage; it is the graph
asking a person whether the parent still says the right thing now that something
hangs off it.

Now the rule that saves you from thrashing. When a check says

```
.../AcceptanceCriterion/AC-0031.md — AC-0031 is an AcceptanceCriterion with no
live anchor — it is held to the graph by a HAS_CRITERION relation into it, and
none stands. Draw the relation, or remove the node.
```

the file to edit is **the parent's**, never the child's. No relation leaving a
criterion can hold it, so every edge you add to `AC-0031.md` leaves the sentence
exactly as it was. A hook may reflect that sentence back at you the instant you
save the child; it is not a rejection of what you wrote, it is naming your next
step. Which relation holds which type is in
[references/relations.md](references/relations.md).

## 5. Deleting

Leave the file. Add one block to its frontmatter:

```yaml
deletionProposed:
  by: claude
  rationale: Superseded by R-0018, which states the same rule for both callers.
```

Both values are one line each — a newline in them is refused. If the case needs
a paragraph, put the paragraph in the body and keep the rationale to its point.

The block is a change nobody has judged, so the node turns yellow. The Review
Queue's card offers no door on it — it says "Deletion proposed — decide in the
Spec plane" and nothing else — and the decision is made on the node there,
against the rationale and everything still pointing at it: approve the deletion,
or reject it. In the execution band only Reject stands, because a record is not
unhappened by removing it. **A person decides**, and no command does. If you
change your mind, remove the block — that is another change, and say so.

Relations pointing at the node stay written on purpose. If the file does go, the
check files `X has a … relation to <id>, and no file names <id>` under each file
that still refers to it, which is exactly where the re-anchor or the restore
happens.

## 6. One node, one file, one concern

A statement is one sentence; everything else belongs in the description. A
statement that keeps growing — "and", "as well as", a second subject — is two
nodes: split it and relate the halves. A file longer than a screen is overloaded
and will be reviewed badly: a person approves what they can hold in their head
at once.

## 7. Don't reopen what is closed

A criterion a person has closed is closed over the exact list of evidence that
claimed it then. Attach one more piece of evidence and the closure lapses by
arithmetic: the card comes back and somebody has to judge the whole list again.
The same holds for a task somebody has called done and the reports claiming it.

So before you add evidence against a closed criterion, or a report against a
finished task, ask the user whether reopening it is what they want — and if the
answer is yes, say plainly that the closure will have to be made again.

## 8. Say what you did not touch

When you deliberately leave a neighbouring node alone that a reader would expect
you to have revised — the sibling requirement with the same wording, the
criterion your change makes stale, the parent whose statement now reads oddly —
say so in the conversation, and say why. The reviewer sees a card, not your
reasoning, and silence reads as an oversight.

## 9. Correct yourself before the check does

`shall check` reads files and the graph. It cannot read a sentence, so these are
yours to keep:

- A requirement's statement is **one SHALL or MUST sentence carrying one
  behaviour**. Nothing verifies this; it is a rule of authorship, and a person
  reviewing the node will hold you to it.
- Follow the vocabulary the starting file suggests wherever it offers one. It is
  generated from the canon, so it is the current wording by construction.
- A criterion must be **judgeable by somebody who has not seen the code**: name
  an observable outcome and how it would be checked, at a generality that later
  becomes several test cases. Not a test script, not a fixture.
- **No framework, schema, algorithm or library belongs in intent.** If the user
  names a stack, record it — an Assumption, or a Constraint when it genuinely
  binds a requirement — and keep it out of goals, use cases, scenarios,
  responsibilities and requirements.
- Draw a `MENTIONS` relation only **from a node you are already writing**. It is
  a line in the mentioning node's file, so mentioning a term from twenty
  existing nodes means editing twenty files and turning twenty green nodes
  yellow. Nobody asked for that review.

## 10. The CLI contract

| Command | What it answers |
|---|---|
| `shall status [--scope <path>]… [--json]` | every node with its colour and the reason, the problem sentence a rule wrote against it, a standing rejection's rationale in full, a criterion's open/closed mark, a task's blocked/ready/done, a deletion proposal, and the relations written in its file |
| `shall board [--json]` | two lists: **Fix Spec** (every red node — a person's rejection first, rationale whole, then the seams the grammar found) and **Implement** (tasks ready to start) |
| `shall check [--scope <path>]… [--json]` | the compiler: a count line first — `N nodes and M relations under <root>[, in <scope>]`, counted over the whole project even under a scope, and never a finding — then `file — sentence` per finding: problems (files the graph refused), gaps (an id nothing answers to, a node no live anchor holds, a rule of the graph broken), notes (valid but not canonical) |
| `shall add-spec-node --type <Type> [--json]` | a starting file at the node's own path, with the next free id; the path is the first line of output, alone |
| `shall init` | makes this folder a Shall project |

`--scope` is a path filter — a file, a type folder, a band folder, or a
spec-relative prefix — and it is repeatable. It must name something that is
there: a folder nothing has been written into yet does not exist, and naming it
is refused rather than answered with an empty list, because a narrowing that
quietly selects nothing turns a check into a pass. It narrows which findings and which
nodes are reported; it never follows a relation, so it cannot tell you what
hangs off a node. For that, read the relations `shall status` prints and walk
them yourself.

`--json` puts exactly one JSON object on stdout. A failure prints
`{"error": "<sentence>"}` and exits 1. **`shall check` exits 1 when there are
problems or gaps** — notes never fail it — and everything else exits 0 unless
the call itself failed.

There is no `shall approve`, no `shall reject`, no `shall close`, and there
never will be. A judgement is a person's, made in the browser.

## Where the node format lives

Nothing here lists a type's fields or body headings, and no reference does
either. The starting file `shall add-spec-node` writes is generated from the
canon, so it is the current wording: read the file you just made, and follow it.
