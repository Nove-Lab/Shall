# Phase 5 — Requirements, constraints, criteria

The spine is [`../SKILL.md`](../SKILL.md), the `shall-specify` skill itself: its two-stage approval and its question rules govern this phase, and every mention of the spine below points there.

## Purpose

Decompose each approved responsibility into normative sentences, fence those sentences with the bounds they must move inside, and give every sentence a way to be judged — `Requirement`, `Constraint` and `AcceptanceCriterion` nodes.

## What it needs from above

Every responsibility from Phase 4 green in `shall status --json`: a requirement is anchored by a line written into a responsibility's file, so a responsibility still yellow is a file you would be rewriting under a person's open judgment. Phase 3's dictionary is still the controlled vocabulary; a concept it lacks sends you to [phase 3](./phase-3.md) step 1 before the sentence is written.

Under `--auto` the phase above is **written and agreed in the terminal** rather than green, and that is not the hazard this line was written against: nobody is mid-judgment on a file you are about to edit, because nobody has been asked yet. The one approval covers it all at the end.

## What a requirement is

**One SHALL or MUST sentence carrying exactly one behavior.** Four rules, all of them yours to keep:

- **The word is there** — `SHALL` or `MUST` appears in the statement, or, in a spec written in another language, the normative marker that language settles on. **Nothing verifies this**: not `shall check`, not the loader, not any door. The process document called it machine-verified; in Shall it is a rule of authorship, kept by you and caught by the person reviewing the node.
- **It passes the observability test** — could a tester who has never seen the code determine whether it is satisfied? If answering needs the source, it is not a requirement yet.
- **No implementation** — no framework, schema, algorithm or library. A stack the user named is carried to `/shall:plan`, which decides it, never promoted here.
- **The approved vocabulary**, spelled canonically, for every object noun — with a `MENTIONS` line in the node's own file for each term the statement leans on, drawn sparingly as [phase 3](./phase-3.md) step 6 says.

A sentence joining two behaviors with "and" is two requirements. And **non-functional requirements are erected as requirements**: do not dissolve availability, latency, retention or accessibility into a success measure above, and do not leave them as adjectives inside a functional sentence. Each gets its own node, its own SHALL and its own criterion.

## What a constraint is

A norm that **binds** requirements. The boundary test is one question: does the system **achieve** this, or must it only **move within** this? Achieves it → a requirement, non-functional if that is its nature. Moves within it → a constraint. "The system shall answer within 200 ms" is achieved; "personal data never leaves the EU" is a bound every requirement touching personal data moves inside.

## Steps

1. **Decompose each approved responsibility into requirements**, functional and non-functional alike, each obeying the four rules above.
2. **Separate out the norms that bind** and write them as constraints, settled by the boundary test. A constraint binding several requirements gets its line in **each** of their files: one holds it to the graph, the rest name who else is bound.
3. **Resolve what is left.** A phase does not close over an open point, and the canon has no node to park one in.
4. **Get terminal approval of the requirement and constraint list before you write a single criterion.** Explain the whole list in plain sentences and get a yes. The order matters because the criterion pass is a *test of the requirement* — a requirement nobody can write a judgeable criterion for is a wish — and that finding is worth something only once the person has committed to the sentence. Write the criteria first and a late scope objection kills the sentences and every criterion under them together. If writing a criterion then forces a requirement to be rewritten, that requirement's approval is spent: take the rewrite back before going on.
5. **Give every approved requirement at least one unit criterion.** Phase 2 put integrative criteria on scenarios under the same relation name from a different parent; these are the unit verdicts, and they are their own nodes.
   - It names an observable outcome. No sentence form is enforced — judgeability is the only condition of validity.
   - **It says what is checked and how it is checked**, in enough detail that somebody who was not in this conversation can run the judgment and reach the same verdict. The starting file says where that goes.
   - Where the judgment is quantitative, it says what is measured and what value counts as met, without naming a technology to measure it with.
   - Stay at spec level — general enough that several test cases could later be cut from it, and free of fixtures, scripts and input tables.
   - A requirement no judgeable criterion fits is a wish. Return to step 1 and rewrite the requirement; never water the criterion down to fit it.

## The questions

Ask with AskUserQuestion under the spine's rules. What is worth asking here:

| When | Ask | Options | Header |
|---|---|---|---|
| a responsibility reads two ways | which behavior must this sentence carry? | 2–4 readings | `Reading` |
| a norm could be either | does the system achieve this, or move within it? | achieves it — a requirement / moves within it — a constraint | `Bound?` |
| a quantitative judgment has no number | what value counts as met? | 2–4 targets | `Target` |
| no criterion fits a requirement | which of these could you judge? | 2–4 rewrites of the requirement | `Judgeable` |

An ambiguity a sensible default carries is not asked about. Write the default as an `Assumption` and anchor it with `ASSUMES` in the **requirement's own file**.

## Authoring mechanics

**This section runs after the terminal yes.** Everything above it is drafted in the conversation; nothing reaches disk until the person has agreed to the whole set.

Follow `shall-authoring` for the file itself. What is this phase's: **write the child first**, so its id exists, **then open the parent and add the line that anchors it**.

| You write | Its anchor line goes in | Written as | Its own file then gains |
|---|---|---|---|
| `Requirement` | the responsibility's file | `REQUIRES` → the requirement | `HAS_CONSTRAINT`, `HAS_CRITERION`, `ASSUMES`, `MENTIONS` |
| `Constraint` | each bound requirement's file | `HAS_CONSTRAINT` → the constraint | nothing but `MENTIONS` |
| `AcceptanceCriterion` | the requirement's file | `HAS_CRITERION` → the criterion | nothing but `MENTIONS` |

```yaml
# .shall/spec/intent/Requirement/R-0012.md — the requirement, bound and judged
edges:
  - type: HAS_CONSTRAINT
    to: C-0002
  - type: HAS_CRITERION
    to: AC-0031
```

Write the whole set in one pass, once step 4's yes has settled the requirements and constraints and the criteria drafted in step 5 have had a yes of their own, so each responsibility's subtree reaches the queue once instead of twice. Two drafts, two yeses, one write.

Anchoring edits the parent, so every responsibility you touch goes yellow again. An orphan requirement is repaired in the responsibility's file, an orphan criterion or constraint in the requirement's file — **never in the orphan's own.**

## The gate

Close with the spine's two-stage approval. Expect **one card per responsibility that gained requirements**, carrying its constraints and criteria in the same bundle.

Under `--auto` the card lines below belong to the run's one approval and not to this phase's close; the spine says when they are checked. Everything else here is checked now, as written.

| The line | What proves it |
|---|---|
| Nothing is orphaned and no id answers to nothing | `shall check --scope .shall/spec/intent` — gaps exit 1 |
| Nothing you wrote is red | `shall board --json` — Fix Spec names nothing from this phase |
| Every requirement has ≥1 criterion | `shall status --json` — each Requirement's relations include a `HAS_CRITERION`. **`shall check` does not file this**: a criterion-less requirement is legal in the graph and wrong in the specification |
| Every requirement is one SHALL/MUST sentence carrying one behavior | you read them — nothing verifies the SHALL |
| Every requirement is observable, implementation-free, and in the approved vocabulary | you read them |
| Every non-functional quality is a requirement of its own, not an adjective and not a success measure | you read them |
| Every constraint passed the boundary test, with its line in each requirement it binds | `shall status --json` for the lines; you for the test |
| Every criterion says what is checked and how, gives a measured value and its target wherever the judgment is quantitative, and carries no test-case detail | you read them — `shall status` reports no body |
| Every card from this phase is green | `shall status --json` after the person says they are done |

Then open [phase 6](./phase-6.md).

## When the gate fails

Return by the layer of the objection.

| What was objected to | Where to go |
|---|---|
| the requirements or the constraints | step 1 — and if the responsibility behind one is what is wrong, [phase 4](./phase-4.md) step 1 |
| a requirement carrying two behaviors | step 1 — split, and anchor both |
| a norm filed on the wrong side | step 2, with the boundary test |
| a requirement no criterion can judge | step 1 — rewrite the requirement, not the criterion |
| the criteria themselves | step 5 |
| a statement needing a word the dictionary lacks | [phase 3](./phase-3.md) step 1, then resume here |
| a node red with a rejection | read the rationale whole from `shall status --json` and revise that file; it lapses when the content changes |
