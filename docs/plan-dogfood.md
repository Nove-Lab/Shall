# Watching the plan process work

What happened when `/shall:plan` was pointed at a real project, and what that says about the package rather than about the model driving it.

The premise being tested is the same one `/specify` was tested against: **structure replaces judgment**. The CLI computes what an agent would otherwise guess, the starting file carries the vocabulary, `shall check` corrects the writing, and the process's stops hold the work at every door a person owns. If the premise holds, a weak model reaches a sound plan slowly; if it does not, a weak model reaches a wrong one confidently. So the sessions are run on **Haiku on purpose** — a stronger model covers a structural hole with its own judgment and tells us nothing about the package.

Two things are recorded separately and treated differently:

- **A protocol failure is a defect in this package** and gets fixed. For this process that means: writing files before the terminal yes; opening Phase 2 while Phase 1's cards are still yellow (the phase-gated version this round ran on); a work item with no module; a work item naming a path, a file, a class or a function without the user having asked; skipping the survey of the project's own documents; planning on top of a yellow specification; inventing a relation between two modules; asking for `--scope .shall/spec/plan` on a band folder that does not exist yet; working out a color or a readiness instead of asking.
- **Thin content is not.** A boundary drawn shallowly, a walkthrough that skims, a rationale that restates the decision — those are the model axis. They are written down, and a pattern that keeps recurring becomes a candidate rewording, never a fix.

## Round 1 — 2026-08-19, the smoke set

Run on the phase-gated version of the process — three phases, each approved in the browser before the next — which the two-stage redesign of 2026-08-23 replaced; the record below is kept as it happened, in that version's words.

Run headless (`claude -p`) on `--model haiku` with `--plugin-dir`, from clean folders in a scratch directory. The project is a focus-timer CLI with a five-node intent chain: a goal, an actor, a use case, a scenario and one responsibility, "The system records each finished session".

| What was asked | What should happen | What happened |
|---|---|---|
| `/shall:plan` with no argument | ask for the direction and stop, touching nothing | asked, stopped, wrote nothing |
| `/shall:plan <direction>` with the `shall` CLI absent from PATH | quote the output verbatim, say the gate cannot answer, and not start | quoted `shall: command not found`, said it matched none of the known failures, stopped, wrote nothing |
| `/shall:plan <direction>` over an **unapproved** specification | walk the chain, name the ids, send the person to `/shall:specify`, write nothing | named all five ids with their statements, explained that a plan on unapproved nodes is a plan whose work items can never start, sent them to `/shall:specify`, wrote nothing |
| "follow the authoring skill and add a module, an interface and a work item by hand" | four files, `IS_REALIZED_BY` in the **responsibility's** file, `shall check` exits 0 | exactly that — the anchor line upstairs in SR-0001, `EXPOSES` and `ALLOCATES` in the module's own file, check clean at exit 0 |
| `/shall:plan <direction>` over an **approved** specification | enter new mode at Phase 1, run the decomposition in the conversation, stop at the decomposition checkpoint with nothing written | surveyed the project's documents and reported honestly that there were none, collected the responsibility and the direction's quality drivers, assigned responsibility to one module, answered the hiding question, ran both assignment tests, and stopped at step 10 asking for terminal approval — **zero files in the plan band** |

The last row is the one worth having. Phase 1's two-stage shape is the part of this process with no counterpart in `/specify`, and the thing it exists to prevent is a design paid for on top of a boundary nobody agreed to. A weak model held the checkpoint without being reminded of it.

`--scope .shall/spec/plan` was never reached for, in any run — the band folder did not exist in three of the five and naming it would have been refused.

**No protocol failures.** Nothing was written before a yes, no phase opened early, no relation between two modules was invented, and no color was worked out by hand.

**Two content observations, neither fixed.** Both are the same shape, which is why they are worth watching rather than acting on yet:

- The `Hidden Decision` heading asks for **the one** decision a module keeps to itself. Both sessions that filled it answered with three — "the choice of file format, storage location, and query mechanisms" in one, "how sessions are stored, the schema for session records, and the persistence strategy" in the other. The heading was read and correctly named in both; the singular in its hint was written past. If the full sessions do it again, that hint is the candidate to reword.
- The hand-authoring session wrote `EXPOSES` above `ALLOCATES` in the module's frontmatter. `shall check` said so as a note and nothing else, which is the right severity: the ordering is canonical form, not grammar, and the next save from the panel rewrites it.

## Round 2 — the full sessions

Round 2 as first planned — three phases with a web approval between each — was superseded before it ran. What demo1's plan nodes showed (no technology named anywhere, figures of speech where a storage or a timer should stand, work items nobody could pick up, an agent spending itself on the template rather than on the plan) drove the two-stage redesign of 2026-08-23 (`docs/Shall_Plan_Layer_Refactor_Spec.md`): stage 1 plans the whole plane in the conversation and writes nothing, stage 2 transcribes it in one pass, and the browser is waited on once. The next headless round checks that shape instead.

Still to run, in the user's own terminal, because the run ends at a browser the agent cannot open — on a scratch project brought to loop-ready first (only demo1 is on this machine, and its plan nodes sit in the old type folders).

- **The whole run, gated** — the survey, the code read, the `Stack` question early, the whole plan presented once, zero files in the plan band until the yes, then one pass of writing and one browser wait. Seed the repository first with two documents the survey can find: a readme naming a norm that genuinely binds (a rule about what the program may not do), and a contributing guide carrying both a design convention worth following and something the direction will collide with. Then give it a direction that collides on purpose, so all three arms of the survey have to fire — a promotion round-trip through `/shall:specify`, a convention followed with its path recorded, and a conflict put to the user as a question.
- **The whole run under `--auto`** — the same exploration with no stack question and no yes; the plan written out in full before stage 2; the module files carrying real technology names in their Technology and Contracts sections; no work item naming a path, a file or a function; a work item with no criterion accepted by `shall check`.
- **A rejection round-trip**, on a module card: refuse it with a rationale, watch the agent receive the rationale whole through `shall board`, revise the file, and see the rejection lapse by itself — and whether the work items under it are re-cut or left alone.
- **A revision run** — "change what module X publishes" — to watch stage 1 work out the reach, redesign that part whole, and stage 2 revise rather than replace.

What to record: **how many approval cards actually arrive**, against what the spine predicts — one per responsibility that gained a module, carrying everything below it, and one at the technology decision when there is one. Whether a module realizing two responsibilities really does appear in both cards marked as shared. Whether the board has a ready work item at the end. Whether the definitions of done read as the work's finish line and not as the criterion's sentence again. And whether the dispatch told a `changed` responsibility apart from an `unapproved` one, which is the distinction the whole entry step turns on.
