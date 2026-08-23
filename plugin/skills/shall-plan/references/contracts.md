# Contracts — the criteria

The spine is [`../SKILL.md`](../SKILL.md), the `shall-plan` skill itself. This file carries no step and no stop: it is what an interface and a schema have to be, read at the contracts step of [stage 1](stage-1.md) and again when the draft is checked against itself.

## Contracts are harvested, not invented

Every hand-over you marked in the modules' walkthroughs is the origin of an obligation, and every piece of data that crosses a boundary is a candidate schema. Work from those marks. A contract item with nothing behind it in a walkthrough has to justify itself: ask what asked for it, and if the answer is that it seemed useful, it is not a contract — it is a guess about a caller nobody has.

## The module's Contracts section and the Interface node say different things

They describe the same boundary and do not repeat each other. **The module's Contracts section is the signature**: the names, what goes in, what comes out, what errors — the shape a caller codes against, one block per interface, each naming its Interface node. **The Interface node is the obligation**: what the caller guarantees first, what this module guarantees in return, what holds either way, and the protocol. Write the shape in the module and the obligations in the interface; do not copy either into the other.

## An interface distributes obligations

**Not a list of signatures** — the signatures live in the module. Three parts carry an interface: what the caller has to have made true first, what this module owes back in return, and what is true of the module at every moment either way. A page of names and argument lists says nothing about who is answerable for what, which is the only thing a boundary is for.

The form follows the kind of module. A service is described as endpoint obligations, a command-line tool as its commands and the shape of their arguments, a library as the contracts of its public functions, a reader of input as the grammar it accepts. Describe in the form that fits, and stop at the contract — implementation is not written here.

## Publish the minimum

An interface is what its consumers need, not everything left over after the boundary was drawn. So **name the consumer of every published item** — the walkthroughs already know who calls what — and treat an item whose consumer you cannot name as over-exposure to be removed.

Three shapes are worth predicting:

- **A module with no outside surface publishes nothing.** That is a complete answer, not a gap. It exposes no interface, and nobody has to invent one for symmetry.
- **A contract this project only calls** — something outside publishes it — is written as an `Interface` a module `CONSUMES`, and that line alone anchors it. Nothing in this project exposes it, and that is the honest picture.
- **Every module in scope internal** is the empty set: no interface is written, and no schema either — a schema is held to the graph by the interface that carries it, so a schema with no interface would be an orphan.

## A schema is not a copy of a concept

`DomainEntity` says what a concept is in the world; `DataSchema` says what crosses a boundary. Three questions decide the unit: does this need an **identity** that survives changes to its contents, is it a **value** compared whole, or is it a **bundle** that must stay consistent together — and a bundle is one schema, not several.

The validation rules the requirements already state — format, range, whether something must be present — are the schema's constraints. Carry them across; do not restate them in new words, and do not invent ones the specification never asked for.

## The criteria, as a list

1. **Harvest from the walkthroughs**: hand-overs become obligations, data that crosses becomes candidate schemas.
2. **Write each interface as the three-part distribution of obligations**, and the module's Contracts section as the signatures that name it.
3. **Name the consumer of every published item**, and remove what has none.
4. **Fit the form to the kind of module**, and stop at the contract.
5. **Derive each schema with the three questions**, and name the concept it comes from with `REPRESENTS`.
6. **Carry the requirements' validation rules into the schema.**
7. **Reconcile the contracts against each other.** The same data defined two ways by two schemas is a contradiction that whoever implements the second one will discover the hard way.

An ambiguity a sensible default carries is not asked about — but **neither an interface nor a schema may assume anything**. `ASSUMES` runs from a module alone. So hang the default on the module that owns the contract, or ask.

## The gate

| The line | What proves it |
|---|---|
| every module with an outside surface has at least one interface | you read the walkthroughs for whether a module has an outside surface at all |
| every hand-over marked in the walkthroughs is absorbed by some contract | you read them against the walkthroughs |
| every published item has a consumer named | you read them |
| every interface says what the caller guarantees, what the module guarantees, and what holds either way | you read them |
| the module's Contracts section names each interface at signature level and repeats no obligation | you read the pair side by side |
| every schema names the concept it comes from | `REPRESENTS` in the schema's own file, in stage 2 |
| no two schemas define the same data differently | you read them |
