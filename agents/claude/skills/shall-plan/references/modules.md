# Modules — the criteria

The spine is [`../SKILL.md`](../SKILL.md), the `shall-plan` skill itself. This file carries no step and no stop: it is what a module has to be, read at the boundaries step of [stage 1](stage-1.md) and again when the draft is checked against itself.

## What a module is

One unit of the system's intended structure: it carries a cohesive responsibility and meets the outside through contracts. **One node is one module** — a node that describes several modules has not drawn a boundary yet. It hangs off the responsibility it realizes, it is a living node that is revised and approved again as the design moves, and it is the thing a work item completes.

## Responsibility first, structure second

This is why the boundaries step exists, and **drawing a structure and then fitting responsibilities into it is the failure it exists to catch.** Start from the set of responsibilities and ask where each one is answerable for; do not start from a diagram of parts.

The arrangement itself is yours to choose — stages, layers, a store with its users around it, whatever the drivers call for. No shape is prescribed and none is banned. What every candidate must survive is the boundary test below: a module that passes it justifies its boundary in any arrangement, and one that only names where it sits has not justified it yet.

## The boundary test

Every candidate boundary answers one question, in the module's own words: **what would change inside this module that the rest must never see** — the storage it writes to, the outside system it speaks to, the algorithm it applies, the format it parses? A candidate that can only name where it sits — the first step, the layer above — has not justified its boundary; and if two modules would have to change together whenever one such thing changes, the boundary is in the wrong place. The answer is a test you run in the conversation, not a section you write: what the module keeps to itself shows up in its Technology and its Decisions, as the technology it chose and the alternatives it refused, never as a sentence about hiding.

## The assignment tests

**Do the responsibilities in one module change for the same reason?** If not, that is a split. **Does every dependency between modules run through something one publishes and another calls?** Reaching past that into another module's internals is not allowed — there is no relation between two modules, so "A depends on B" can only be said as A consuming what B exposes. The contracts themselves are harvested at the next step; here you **mark the hand-over points** — where one module asks something of another — because those marks are what the contracts are harvested from.

**Settle a contested responsibility by information**: it sits in the module that holds what is needed to carry it out. **Let a purely technical module stand**: a storage adapter, a transport, a thing that exists to hide a mechanism corresponds to no concept in the domain and does not have to. **If one `Term` is asked to mean two things in two modules, stop** — that is a term to split through `/shall:specify` or a boundary to reconsider, and the user decides which.

## Every module hangs off a responsibility

`SystemResponsibility —IS_REALIZED_BY→ Module`, written in the **responsibility's** file. That relation is the only thing holding a module to the graph: without one it is an orphan, it is red, and `shall check` exits 1.

**There is no relation between a module and a requirement, and none between a module and a constraint.** Non-functional requirements and constraints are drivers — they are read while the boundaries are being cut and they leave no trace in the graph. Two things follow. The reasoning that used one has to be written into the module's own Decisions or it is lost, which is the whole reason for the grounds duty. And a module whose only justification is a quality requirement or a constraint has **nothing to hang off**: that means a responsibility nobody wrote, so go to `/shall:specify`, get it written and approved, and come back. Never invent a responsibility to hang a module on; the missing responsibility is the finding, and a stub buries it.

## The six sections, and what each is for

The starting file suggests six sections, and each asks for a different thing. **Responsibility** is the charge the module carries in the system, written with the module as the subject. **Technology** is what it runs on and what it is built from, named as the world names them — the project-wide choices referred to the decision, only this module's own written out. **Structure** is the parts it is made of and the lines between them, each part named and given its one line of responsibility — parts, never classes, functions or files. **Contracts** is the promise of each interface it exposes, written as a signature — the name, what goes in, what comes out, what can go wrong — naming the Interface node each block belongs to, and never a function body. **Behavior** is what it does in each key scenario, walked through step by step, and its states and the moves between them where it holds any. **Decisions** is the alternatives that were weighed and the reason each was refused; a project-wide choice is named as the decision node and not argued again here.

Structure and behaviour are derived from the approved scenarios and responsibilities, not invented on a blank screen. Walk each key scenario this module takes part in: who acts, what is asked of whom, what is handed back — and mark every hand-over between modules. A module holding state says what states there are, what moves between them, and what triggers each move, at the level of the specification and not of code. Then check the design against the assignment: every responsibility a module realizes appears in at least one walkthrough, and a walkthrough that contradicts the decomposition — a flow reaching past a module, a different actor doing the work — means fixing the design, or the boundary if the boundary is what is wrong.

Write in the dictionary's words, and draw `MENTIONS` in the module's file to each term its design leans on — sparingly, where the term is load-bearing.

## Written in the world's names

A module is read by somebody who will build it, so it says what it is built of. localStorage is written localStorage, not "the browser's keeping place"; setInterval is setInterval, not "the heartbeat"; an HTTP endpoint is its method and path; a SQLite table is its name and columns. A figure of speech where a technology should stand is a decision deferred to the first turn of work, where it will be made again and recorded nowhere. The same names are the words the work items, the work logs and the code will use, which is the point.

## What a module does not carry

A function body, pseudocode, a list of files or classes — those are the repository's, and written into a plan they are wrong before the first turn of work ends. The obligations of a contract — what the caller guarantees, what the module guarantees back, what holds either way — those are the Interface node's, and the module's Contracts section names the node rather than repeating it. A sentence about what the module hides — that is the boundary test's, answered in the conversation and shown by the Technology and the Decisions.

## The gate

| The line | What proves it |
|---|---|
| every responsibility in scope reaches at least one module, and no module realizes none | you read the assignment |
| every module passes the boundary test | you can say, per module, what would change inside it that the rest never sees |
| every dependency between modules is a hand-over you marked | the marks are the contracts' material, and none reaches past a boundary |
| every module's Technology names what it is built of | no figure of speech stands where a technology should; the project-wide stack is referred to the decision |
| every module's Contracts is at signature level and names its Interface nodes | you read them — no command reads a sentence |
| every responsibility a module realizes appears in a Behavior walkthrough, and no walkthrough contradicts the assignment | you read them |
| every Decisions section says what else was weighed | you read them — and, where grounds decided it, the source is named |
