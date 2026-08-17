# /specify, read against the canon

The elicitation process in `Shall_Specify_Process_v1_3.md` was written before the
graph it fills was finished, and it names four relations the canon does not have.
This page is the translation: what each step of the process means in the
relations, files and colours Shall actually keeps. **Where the two disagree, the
code is right** — `core/graph/grammar.ts` is the canon, and the skills that drive
`/specify` are written from this page, never from the process document's edge
names.

Decided 2026-08-17, in the round that built the `/specify` plugin.

## The relations the process meant

| The process says | The canon has | Written in |
|---|---|---|
| Goal decomposition, `REFINES` | `Goal —REFINES→ Goal`, parent to sub-goal | the parent's file |
| `ASSIGNED_TO(Actor)` | `Actor —PERFORMS→ UseCase` | the actor's file |
| `SATISFIES(Goal)` from a use case | **nothing** — a use case never touches a goal | — |
| use case detail | `UseCase —DETAILS→ Scenario` | the use case's file |
| `DERIVED_FROM(UC)` for a responsibility | `Scenario —DERIVES_RESPONSIBILITY→ SystemResponsibility` | the scenario's file |
| `SATISFIES(SR)` from a requirement | `SystemResponsibility —REQUIRES→ Requirement` | the responsibility's file |
| `HAS_CRITERION(Scenario)` | `Scenario —HAS_CRITERION→ AcceptanceCriterion` | the scenario's file |
| `HAS_CRITERION(REQ)` | `Requirement —HAS_CRITERION→ AcceptanceCriterion` | the requirement's file |
| `CONSTRAINS` | `Requirement —HAS_CONSTRAINT→ Constraint` | the requirement's file |
| a default recorded as an assumption | `ASSUMES → Assumption`, and only from Goal, SystemResponsibility, Requirement, ModuleDesign or WorkLog | the assuming node's file |
| a term used in prose | `MENTIONS → Term`, from any of sixteen types | the mentioning node's file |
| a term that names a structure | `Term —DENOTES→ DomainEntity` | the term's file |

Two consequences the process never states, because it thought the edges were
elsewhere:

- **A relation lives in the file of the node it leaves.** Anchoring a new child
  therefore edits the parent, and the parent goes yellow and is reviewed again.
  That is not damage; it is the graph asking a person whether the parent still
  says the right thing now that something hangs off it.
- **Nothing runs upward.** There is no use-case-to-goal edge and no
  responsibility-to-goal edge, so "which goal does this serve" is answered by
  walking `Goal —PURSUED_BY→ Actor —PERFORMS→ UseCase —DETAILS→ Scenario
  —DERIVES_RESPONSIBILITY→ SystemResponsibility`, and coverage is checked along
  that chain rather than at a single edge.

## The responsibility's anchor

v1.2d of the process moved every responsibility onto `DERIVED_FROM(UC)` and
abolished a direct goal anchor, worrying that the schema still paired a
responsibility with a goal. That worry is settled: **no responsibility–goal edge
exists in either direction.** What the canon does differently is one step finer —
a responsibility hangs off the **scenario** whose steps demand it, not off the
use case as a whole.

Keep the process's discipline exactly as written and let the anchor land one
level down: a responsibility with no scenario to derive it is a responsibility
whose grounding narrative has not been written yet, which is precisely what
v1.2d wanted the mandate to force. Several scenarios may derive one
responsibility; that is how duplication is merged.

## The attributes are gone

The process names `priority`, `actor_type`, `requirement_type`,
`constraint_type`, `success_measure`, `benchmark`, `evaluation_process`,
`aliases`, `key_attributes` and more as fields, several of them mandatory with a
fixed vocabulary. **Shall has no such fields.** A node file carries `short_name`,
`name` and `edges` above the fence — plus a work log's `commits` and the one
machine block, `deletionProposed` — and everything below the fence is free
markdown that nothing parses.

The vocabulary survives as **template hints**: `shall add-spec-node` writes a
starting file whose commented header offers `## Priority — High · Medium · Low`,
`## Constraint Type — Platform · Technology · …` and the rest. An agent follows
them because the authoring skill says to, not because a door refuses otherwise.
The same holds for the SHALL/MUST sentence the process calls machine-verified:
nothing verifies it. It is a rule of authorship, kept by the skill and by the
person who reviews the node.

This is deliberate (decided 2026-08-14): forcing a shape on the body made agents
write files the loader refused outright, and a refused file disappears from the
graph instead of arriving imperfect.

## Two-stage approval, in this system's terms

The process closes each phase with terminal approval and then "sync the phase
set to the Shall DB" for graph approval. There is no database.

1. **Terminal approval** is unchanged: explain the whole set, get a yes.
2. **The sync is authorship**: write the node files, anchor them, and get
   `shall check` to exit 0. A file that reads is in the graph; a file that does
   not is not.
3. **The graph approval** is the Review Queue in the browser. Every node written
   or changed is yellow until a person approves it, and approving writes one
   record into `.shall/ledger/approvals.yaml`.
4. **A rejection is a work order**, not a deletion: read the rationale from
   `shall status`, revise the node, and the rejection lapses by itself the
   moment the content hash moves. The node returns to yellow and to the queue.

**A phase does not become one card.** The queue cuts a bundle at each topmost
yellow node and walks down every outgoing spec relation, so a phase's output
arrives as *one card per top-level thing changed* — one per **top-level** goal
in Phase 1, sub-goals riding inside their parent's card because the walk follows
`Goal —REFINES→ Goal` like any other relation, one per goal that gained an
actor in Phase 2, one per term and per domain entity in Phase 3 (domain nodes are
always cut one at a time), one per scenario that gained a responsibility in Phase
4, one per responsibility that gained requirements in Phase 5. The skill tells
the person "one or more cards are waiting", never "a card".

## What the agent may ask the graph

Everything the process asks it to "query" is a CLI call, and the agent computes
none of it:

| The process wants | The command |
|---|---|
| the state of the intent plane (entry dispatch) | `shall status --json` |
| the blast radius of a revision | `shall status --json`, then walk the relations it reports for each node — `--scope <path>` is a path filter that narrows the answer to the files or folders named, and never follows a relation |
| whether the files it wrote hold together | `shall check --scope <path>` |
| what is red and whose turn it is | `shall board --json` |
| a starting file for a new node | `shall add-spec-node --type <Type>` |

There is no `shall approve`, no `shall reject` and no `shall close`, and there
never will be: a judgement is made by a person in the browser. The ledgers under
`.shall/ledger/` are Shall's own files — an agent has no reason to open them,
because `shall status` and `shall board` already say what they hold.
