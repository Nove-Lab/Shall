# Shall — /specify Elicitation Process (v1.3)

> The agent–human interaction flow that fills the attributes of the intent and domain planes (Spec Node Design §3).
> Backbone: staged elicitation from classical RE (goal-oriented RE → use-case-driven analysis → domain modeling → responsibility decomposition → requirement specification → domain review), with IEEE 29148 quality rules.
> Refinement loop inside each phase: adopted and extended from Spec Kit `/clarify` (option-style questions, defaults → Assumption).
> v1.2 change: Question/Decision nodes excluded — every open point is resolved interactively within its phase. Unresolved state is never carried forward as a node.
> v1.2b addition: AC abstraction-level rule made explicit — an AC is a spec-level acceptance criterion, not a test case (Common Rules §0).
> v1.2c change: three-way handling of term variants — synonyms are absorbed into aliases (no scenario revision), deprecated spellings are registered as aliases plus scenario revision, suspected different concepts are definition conflicts resolved by question and Term split.
> v1.2d change: single SR anchor — SR allows only DERIVED_FROM(UC); direct Goal anchoring (SATISFIES) is abolished. Projects with zero human actors do not skip the UC phase; UCs are derived with external_system/time actors as subjects. ⚠ Inconsistent with the SATISFIES SR→Goal pair in Edge Catalog v4.3 — whether to revert the schema is a separate decision.
> v1.2e change: domain review made independent as Phase 6 (the closing phase) — Phase 5 closes with the DB registration of REQ/AC, and /specify ends with a full-phase rescan, domain cleanup, and the loop-ready declaration.
> v1.2f addition: input declaration (`$ARGUMENTS` convention) + entry dispatch — with no existing spec, new mode (full Phase 1 run); with an existing spec, revision mode (determine the highest affected layer → run that phase and below, scoped to the affected subtree, surgical-first). This mechanism does not exist in Spec Kit (officially a guide document and manual judgment; community extensions fill the gap) and is a Shall-native advantage: graph state makes the entry-layer determination computable.
> v1.3: English translation of v1.2f for repository canonicalization. No semantic changes.

## Input

* Invocation form: `/specify <request>` — user input is passed as the command argument (the `$ARGUMENTS` slot in the agent template, adopting the Spec Kit convention).
* `request`: the user's natural-language statement of need — it may be an initial spec request or a revision request against an existing spec. The user does not declare which; entry dispatch determines it.
* If the input is empty, do not start the process; ask for the statement of need first.

## Entry Dispatch

1. Query the state of the project's intent plane to determine the mode.
   * No existing spec (intent nodes empty) → **new mode**: run everything from Phase 1.
   * Existing spec → **revision mode**: determine the entry point by the procedure below.
2. (Revision mode) Determine the highest node type the request touches and set the entry phase.
   * Mapping: Goal change → Phase 1 / Actor·UC·Scenario change → Phase 2 / terms·concept entities → Phase 3 / SR → Phase 4 / REQ·Constraint·AC → Phase 5.
   * If the determination is ambiguous, settle the entry point with the user via option-style questions — when in doubt, choose the higher layer (upper-layer changes stale lower layers; never the reverse).
3. (Revision mode) Run from the entry phase downward, but scope the work to the **affected subtree**, not the whole project.
   * Surgical change first: keep and revise existing nodes (revision history lives in the system fields), additions are allowed, deletions only on the user's explicit request.
   * Downward propagation is the job of the stale cascade — the work items of lower phases are only the re-derivation and re-review of nodes staled by this revision, plus new additions.
   * The dual-approval rule of each phase applies unchanged, but the approval set is limited to the nodes changed or added in that phase.
4. Phase 6 (domain review) always runs last in both modes — in revision mode, its scan scope is limited to the statements changed or added in this run.

## 0. Common Rules (apply to every phase)

* **Question rule (adopted from Spec Kit clarify)**: at most 5 questions per round; each question offers 2–4 options plus a free-form answer.
* **Default rule (adopted from Spec Kit)**: ambiguity that a reasonable default can stand in for is not asked about — register it as an Assumption(i) (statement + basis).
* **Full-resolution rule**: ambiguity or conflict that no default can stand in for must be resolved by questions within the phase — a phase cannot close with open points. If the user defers an answer, narrow the scope until a decision can be made together, and re-ask.
* **Dual-approval rule**: every phase closes with two-stage approval — (1) explain the full set of outputs in the terminal and obtain approval, (2) upon approval, immediately sync the phase-complete set to the Shall DB, and the user reviews it as a graph in the Shall web interface for final approval.
  * If web approval is rejected, return to the phase's refinement loop with the rejection rationale — nodes already in the DB converge by revision, not deletion.
  * Do not start the next phase before final web approval.
* **AC abstraction-level rule**: every AcceptanceCriterion in this process (scenario-attached and REQ-attached alike) is a spec-level acceptance criterion, not a test case in the SW-testing sense — write each AC at a generality that can later be concretized into multiple test cases. evaluation_process describes the method and procedure of judgment but does not enumerate concrete test scripts, fixtures, or input combinations; that concretization belongs to later stages (design, execution).
* **No promotion**: technology stacks and implementation approaches the user mentions are recorded only, never promoted to intent nodes (they belong to the Design plane). Exception: a norm that constrains requirements is a Constraint candidate (Phase 5).
* **Approval principle**: changes to an approved node are handled as revisions, not new derivations (revision history lives in the system fields).

## 1. Goal Modeling Phase Process

1. Receive the user's statement of project/feature intent and understand the background, motivation, and expected outcome.
   * If the statement is means-centered (feature ideas), ask back "what is achieved by that" to lift it to purpose.
2. Extract candidate Goals from the statement, write each as a statement (one-sentence declaration), and separate details into description.
   * The statement carries the achieved end state, not the means — achievement must be imaginable.
3. Draft a success_measure for each Goal (an abstract description of how achievement would be gauged).
   * Do not put metrics or numbers here — the quantitative axis is carried later by AC.benchmark (§3.3 owner decision).
   * If the gauge is not immediately answerable, narrow it on the spot with option-style questions. If it still cannot be settled, leave it blank (it is an optional attribute) and retry at the benchmark check in Phase 2.
4. Decompose large Goals into SubGoals and connect them with REFINES.
   * Verify each decomposition with the sufficiency question: "If all of these sub-goals are achieved, is the parent goal achieved?" — if not, a SubGoal is missing.
5. Fully resolve ambiguity and conflict among Goals with option-style questions (Common Rules).
6. Perform dual approval on the entire Goal hierarchy (terminal → DB sync → web graph approval).
   * If terminal approval is not given, incorporate the feedback and return to 2.
   * Upon web approval, proceed to Phase 2.

## 2. Use Case Modeling Phase Process

1. From the approved Goals, derive candidate Actors that interact with the system, classify actor_type (user | external_system | ego_system), and write description.
   * ego_system is one reserved actor per project (system_ego) — used only as the subject of self-initiated work.
   * If there is no user actor at all, confirm once: "Is there really no person who interacts with this system?" If confirmed, derive UCs with external_system/time actors as subjects (invocation narratives such as callbacks, partner APIs, scheduled triggers) — since every SR must be UC-derived, a project with zero UCs cannot exist. The P2 gate (every user Actor ≥1 UC) remains human-sensitive as is.
2. For each user Actor, derive the UseCases the actor pursues through the system and connect ASSIGNED_TO(Actor) and SATISFIES(Goal).
   * description is a general account of what the actor does with this use case; benefit is the "so that" value; priority (high|medium|low) is mandatory.
   * A UC that serves no Goal is not promoted — if the UC is genuinely needed, a Goal is missing: return to Phase 1 step 2, reinforce the Goals, then resume.
3. Derive Scenarios for each UseCase.
   3.1. One main scenario is mandatory — fill the full triad of preconditions (starting state) / steps (ordered account of action → result) / postconditions (the state of the world after completion).
   3.2. Interrogate each branch and failure point in the steps to uncover alternative / exception scenarios (adopting Spec Kit edge-case interrogation).
      * Exception paths are first-class scenarios of the same rank — do not push them into a separate section; distinguish them only by scenario_type.
4. Derive at least one integrative AcceptanceCriterion for every Scenario and attach it with HAS_CRITERION(Scenario) — all scenarios, regardless of priority.
   * The statement names an observable outcome (no sentence form is enforced); evaluation_process describes what to check and how, across the scenario's before/steps/after.
   * Do not descend to test-case level — write at a generality that can later be concretized into multiple test cases (Common Rules · AC abstraction level).
   * Seat the quantitative axis descending from the Goal's success_measure in benchmark — check that the subtree of every Goal with a success_measure has at least one AC with a benchmark (prevent zero-quantity subtrees). If a success_measure was left blank in Phase 1, retry settling it with the user here.
   * A scenario for which no judgeable AC can be derived has vague postconditions — return to 3 and rewrite that scenario.
5. Fully resolve ambiguity and conflict with option-style questions (Common Rules).
6. Perform dual approval on the Actor→UC→Scenario→AC map (terminal → DB sync → web graph approval).
   * If terminal approval is not given, return by the layer of the objection: actors→1, UC→2, scenarios→3, AC→4.
   * Approval gate: every user Actor ≥1 UC ∧ every UC has main scenario ≥1 ∧ every Scenario ≥1 AC.
   * Upon web approval, proceed to Phase 3.

## 3. Domain Modeling Phase Process

1. Scan the entire approved UC/Scenario prose, extract key term candidates, and register them as Terms.
   * Terms are harvested from narrative, not squeezed out of a blank screen — this is why the phase stands after UC.
   * One term, one definition — the full text lives in exactly one place, this global sink.
   * Synonyms and deprecated spellings go into aliases (comma-separated) — they become input to later term-drift checks.
2. Register concept entities that have structure as DomainEntities (description + key_attributes).
   * key_attributes only up to the implementation-agnostic level — structural detail belongs to DataSchema in the Design plane.
3. When spelling variants are found across scenarios, handle them three ways by nature.
   3.1. Synonyms (legitimate alternate spellings of the same concept) are registered as aliases of the canonical Term; scenario prose is not revised.
      * Normative statements (the statement of SR·REQ·AC·Constraint) use only the canonical Term — synonym tolerance extends to narrative (prose) only. Navigability is preserved by alias-mediated MENTIONS derivation and drift checks.
   3.2. Deprecated spellings (misuse, confusion-prone notation) are registered in aliases as deprecated, but scenario prose that used them is revised to the canonical spelling — to deprecate is to weed out.
   3.3. If two spellings are suspected of naming different concepts, this is not an alias matter but a definition conflict — split it with the questions of step 4 and, if needed, split the Term.
4. Fully resolve definition conflicts and boundary ambiguity (e.g., the criterion distinguishing two entities) with option-style questions (Common Rules).
5. Perform dual approval on the Term/DomainEntity dictionary (terminal → DB sync → web graph approval).
   * If terminal approval is not given, incorporate the feedback and return to 1.
   * Approval gate: no undefined key Term (P3).
   * Upon web approval, proceed to Phase 4 — from here on, SR and REQ statements use this dictionary as the controlled vocabulary.

## 4. System Responsibility Phase Process

1. Walk the scenario steps of each approved UseCase and derive, as SystemResponsibilities, the behaviors and qualities the system must guarantee for that execution; anchor with DERIVED_FROM(UC).
   * This step is the perspective turn: the subject of the statement must be the system ("The system ...") — restating actor behavior is forbidden.
   * The object nouns of the statement use approved Terms (controlled vocabulary) — if a new concept absent from the dictionary is needed, return to Phase 3 step 1, register it, then resume.
   * Keep the declaration short and put detail in description — a lengthening declaration signals two or more responsibilities mixed together: split.
2. Responsibilities with thin interaction narratives (idempotency, reprocessing, performance contracts, batch, etc.) are also derived from UCs without exception — direct Goal anchoring is not allowed.
   * The grounds for such responsibilities are usually scenarios not yet written (idempotency = a duplicate-delivery exception; reprocessing = a retry-after-failure exception). If the grounding scenario does not exist, return to Phase 2 step 3, erect that scenario first (usually alternative/exception), then resume — the UC-mediation mandate is itself the enforcement device for scenario completeness.
3. Classify each SR's responsibility_type (core | supplementary).
   * Core test: does the parent UC or Goal fail to stand if this responsibility is removed?
4. Clean up duplication and contention — when multiple UCs demand the same responsibility, merge into one SR and connect DERIVED_FROM multiply.
5. Check coverage: is every key UC covered by ≥1 SR ∧ is every Goal reachable to ≥1 SR via UC (Goal←SATISFIES—UC←DERIVED_FROM—SR)?
   * When an unreachable Goal is found, return to Phase 2 step 2 and reinforce the UCs serving that Goal — this is the single return path.
6. Perform dual approval on the SR list together with their originating UCs (terminal → DB sync → web graph approval).
   * If terminal approval is not given, incorporate the feedback and return to 1.
   * Approval gate: no orphan SR lacking DERIVED_FROM ∧ P4 coverage satisfied.
   * Upon web approval, proceed to Phase 5.

## 5. Requirement Specification Phase Process

1. Decompose each approved SystemResponsibility into one or more Requirements and connect SATISFIES(SR).
   * The statement is a SHALL/MUST normative sentence — SHALL/MUST must appear in the body (machine-verified), and one requirement carries exactly one behavior.
   * It must pass the observability test: "Could a tester who has never seen the code determine whether it is satisfied?"
   * It contains no technical implementation plan (frameworks, schemas, algorithms).
   * The object nouns of the statement use approved Terms (controlled vocabulary).
   * requirement_type (functional | non_functional) and priority are mandatory — NFRs are erected as requirements, not dissolved into success criteria. rationale carries only local grounds not recoverable from edges.
2. Norms that constrain requirements are separated out as Constraints, not Requirements, and landed with CONSTRAINS.
   * Boundary rule: a constraint is a fence that binds requirements; a non-functional requirement is a quality the system must satisfy — when confused, test with "does the system achieve this (NFR) vs. must it move only within this bound (Constraint)."
   * Classify constraint_type (fixed vocabulary of 12) and fill applies_when and rationale where applicable.
3. Fully resolve residual ambiguity with option-style questions (Common Rules — Assumption(i) where a default suffices, immediate resolution otherwise).
4. Explain the requirement and constraint list to the user and obtain terminal approval.
   * If not approved, incorporate the improvement requests and repeat 1.
   * Upon approval, move to 5.
5. For every approved Requirement, derive at least one unit-judgment AcceptanceCriterion and attach it with HAS_CRITERION(REQ).
   * The statement names an observable outcome — G/W/T and EARS forms are not enforced; judgeability is the only condition of validity.
   * Fill evaluation_process with the judgment procedure (what to check and how); where quantitative judgment is needed, fill benchmark (metric + target — measurable, technology-agnostic, verifiable).
   * A REQ for which no judgeable AC can be derived is a wish — return to 1 and rewrite that REQ.
6. Perform dual approval on the requirement/constraint/AC set (terminal → DB sync → web graph approval).
   * If terminal approval is not given, return by the layer of the objection: requirements/constraints→1, AC→5.
   * Approval gate: every REQ ≥1 AC ∧ no orphan nodes.
   * Upon web approval, proceed to Phase 6.

## 6. Domain Model Review Phase Process

1. Rescan the entire prose of all prior phase outputs (Goal·UC·Scenario·SR·REQ·Constraint·AC) and extract term/concept-entity candidates absent from the dictionary.
   * This is cleanup, not derivation — no new intent nodes are created; only gaps in the domain plane are filled.
2. Register the candidates as Terms/DomainEntities.
   * The same rules as Phase 3 apply: one term one definition, key_attributes implementation-agnostic, spelling variants handled three ways (synonym alias / deprecated alias + prose revision / suspected different concept via question and split).
3. When usage conflicting with an existing Term's definition is found, correct it.
   * Conflicts in normative statements: revise the statement (term takes precedence).
   * Only when the Term's own definition is wrong, obtain user confirmation and revise the Term.
4. Fully resolve boundary ambiguity and definition conflicts with option-style questions (Common Rules).
5. Perform dual approval on the additions and revisions, run the final gate check, declare loop-ready, and finish /specify.
   * Final gate: no undefined key Term ∧ every REQ ≥1 AC ∧ no orphan nodes.
   * If there are no additions or revisions, skip web approval and close with terminal confirmation only — an empty set is not owed an approval rite.
   * Intent changes after this declaration enter via re-running `/specify <revision request>` — entry dispatch identifies revision mode and runs only the affected layer and below, scoped.
