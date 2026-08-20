# Phase 2 — Contracts

The spine is [`../SKILL.md`](../SKILL.md), the `shall-plan` skill itself: its two-stage approval and its question rules govern this phase, and every mention of the spine below points there.

## Purpose

Write down what modules owe each other where they meet: `Interface` nodes carrying the obligations at a boundary, and `DataSchema` nodes for the data that crosses one.

## What it needs from above

Every module from phase 1 green in `shall status --json`. `EXPOSES` and `CONSUMES` are written in the **module's** file, so a module still yellow is a file you would be editing under a person's open judgment.

In revision mode, clear Fix Spec first, and narrow to the modules whose boundaries the direction moves.

## Contracts are harvested, not invented

Every hand-over you marked in phase 1's walkthroughs is the origin of an obligation, and every piece of data that crosses a boundary is a candidate schema. Work from those marks. A contract item with nothing behind it in a walkthrough has to justify itself: ask what asked for it, and if the answer is that it seemed useful, it is not a contract — it is a guess about a caller nobody has.

## An interface distributes obligations

**Not a list of signatures.** Three parts carry it: what the caller has to have made true first, what this module owes back in return, and what is true of the module at every moment either way. A page of names and argument lists says nothing about who is answerable for what, which is the only thing a boundary is for.

The form follows the kind of module. A service is described as endpoint obligations, a command-line tool as its commands and the shape of their arguments, a library as the contracts of its public functions, a reader of input as the grammar it accepts. Describe in the form that fits, and stop at the contract — implementation is not written here.

## Publish the minimum

An interface is what its consumers need, not everything left over after the hiding. So **name the consumer of every published item** — the walkthroughs already know who calls what — and treat an item whose consumer you cannot name as over-exposure to be removed.

Three shapes are worth predicting:

- **A module with no outside surface publishes nothing.** That is a complete answer, not a gap. It exposes no interface, and nobody has to invent one for symmetry.
- **A contract this project only calls** — something outside publishes it — is written as an `Interface` a module `CONSUMES`, and that line alone anchors it. Nothing in this project exposes it, and that is the honest picture.
- **Every module in scope internal** is the empty set: this phase writes nothing, holds no approval, and produces no schema either — a schema is held to the graph by the interface that carries it, so a schema with no interface would be an orphan.

## A schema is not a copy of a concept

`DomainEntity` says what a concept is in the world; `DataSchema` says what crosses a boundary. Three questions decide the unit: does this need an **identity** that survives changes to its contents, is it a **value** compared whole, or is it a **bundle** that must stay consistent together — and a bundle is one schema, not several.

The validation rules the requirements already state — format, range, whether something must be present — are the schema's constraints. Carry them across; do not restate them in new words, and do not invent ones the specification never asked for.

## Steps

1. **Harvest from the walkthroughs**: hand-overs become obligations, data that crosses becomes candidate schemas.
2. **Write each interface as the three-part distribution of obligations.**
3. **Name the consumer of every published item**, and remove what has none.
4. **Fit the form to the kind of module**, and stop at the contract.
5. **Derive each schema with the three questions**, and name the concept it comes from with `REPRESENTS`.
6. **Carry the requirements' validation rules into the schema.**
7. **Reconcile the contracts against each other.** The same data defined two ways by two schemas is a contradiction that whoever implements the second one will discover the hard way.
8. Close with the spine's two-stage approval.

## The questions

Ask through AskUserQuestion under the spine's rules. What is worth asking here:

| When | Ask | Options | Header |
|---|---|---|---|
| an obligation could sit on either side | who guarantees this — the caller or the module? | the caller, before it calls / the module, when it returns / both, as an invariant | `Which side` |
| a published item has no obvious caller | who needs this? | the candidate modules / nobody yet — remove it | `Consumer` |
| two pieces of data travel together | is this one thing or two? | one bundle kept consistent / two, related | `One unit?` |
| two schemas describe the same data differently | which definition stands? | the two definitions / a third that covers both | `Definition` |

An ambiguity a sensible default carries is not asked about — but **neither an interface nor a schema may assume anything**. `ASSUMES` runs from a module alone. So hang the default on the module that owns the contract, or ask.

## Authoring mechanics

**This section runs after the terminal yes.** Everything above it is drafted in the conversation; nothing reaches disk until the person has agreed to the whole set.

Follow `shall-authoring` for the file itself. What is this phase's: **write the child first**, so its id exists, **then open the parent and add the line that anchors it**.

| You write | Its anchor line goes in | Written as | Its own file then gains |
|---|---|---|---|
| `Interface` | the publishing module's file — and the calling module's, which anchors nothing new and says who consumes it | `EXPOSES` / `CONSUMES` → the interface | `CARRIES` → a schema, `MENTIONS` → the terms it leans on |
| `DataSchema` | the interface's file | `CARRIES` → the schema | `REPRESENTS` → a domain entity, `MENTIONS` |

```yaml
# .shall/spec/plan/ModuleDesign/MD-0002.md — the module, publishing one contract and calling another
edges:
  - type: CONSUMES
    to: IF-0004
  - type: EXPOSES
    to: IF-0003
```

`REPRESENTS` points into the domain band, and like the `MENTIONS` above it turns nothing yellow: a relation is written in the file it leaves, so naming the concept a schema comes from edits the schema and never the concept.

Anchoring edits the parent, so every module you touch goes yellow again. **An orphan interface is repaired in a module's file, and an orphan schema in an interface's — never in the orphan's own.**

## The gate

Close with the spine's two-stage approval. Expect **one card per module that gained a contract line**, carrying its interfaces and their schemas in the same bundle. If every module in scope is internal, write nothing and hold no approval rite — an empty set is owed none.

| The line | What proves it |
|---|---|
| Nothing is orphaned and no id answers to nothing | `shall check --scope .shall/spec/plan` — gaps exit 1 |
| Nothing you wrote is red | `shall board --json` — Fix Spec names nothing from this phase |
| No two modules consume each other's contracts | `shall check` — from this phase on it computes the module dependencies out of the contracts, and a loop is red under every module on it |
| Every module with an outside surface has ≥1 interface | `shall status --json` for the lines; **you** for whether a module has an outside surface at all, which the walkthroughs answered |
| Every hand-over marked in phase 1 is absorbed by some contract | you read them against the walkthroughs |
| Every schema names the concept it comes from | `shall status --json` — each `DataSchema`'s relations include a `REPRESENTS`. The check does not file this |
| Every published item has a consumer named | you read them |
| Every interface says what the caller guarantees, what the module guarantees, and what holds either way | you read them — `shall status` reports no body |
| No two schemas define the same data differently | you read them |
| Every card from this phase is green | `shall status --json` after the person says they are done |

Then open [phase 3](./phase-3.md).

## When the gate fails

| What happened | Where to go |
|---|---|
| a contract nothing in a walkthrough asked for | [phase 1](./phase-1.md) step 11.3 to find the hand-over, or delete the contract |
| an obligation nobody is answerable for | step 2 — say which side guarantees it |
| a published item with no consumer | step 3 — remove it |
| a schema that is a copy of a domain concept | step 5, with the three questions |
| the same data defined twice | step 7 |
| a hand-over no contract absorbed | [phase 1](./phase-1.md) — the walkthrough and the boundary disagree |
| two modules consuming each other | [phase 1](./phase-1.md) step 3 — move what both need into a module of its own |
| a node red with a rejection | read the rationale whole from `shall status --json` and revise that file; it lapses when the content changes |
