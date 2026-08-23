# Watching the plugin work

What happened when the `/specify` plugin was pointed at a real project, and what that says about the package rather than about the model driving it.

The premise being tested is that **structure replaces judgment**: the CLI computes what an agent would otherwise guess, the starting file carries the vocabulary, `shall check` corrects the writing, and the phase gates stop the work at every door a person owns. If that premise holds, a weak model reaches a sound specification slowly; if it does not, a weak model reaches a wrong one confidently. So the sessions are run on **Haiku on purpose** — a stronger model covers a structural hole with its own judgment and tells us nothing.

Two things are recorded separately and treated differently:

- **A protocol failure is a defect in this package** and gets fixed: touching a ledger (the one `shall log` call at a run's end is not touching — it asks the daemon; a second call, a call mid-run, or reading the feed is), deleting a spec file, starting the next phase before approval, leaving a failing check, running the phases out of order, working out a color instead of asking, dispatching to the wrong phase.
- **Thin content is not.** A shallow goal, an unexamined scenario, a flat acceptance criterion — those are the model axis. They are written down, and a pattern that keeps recurring becomes a candidate rewording, never a fix.

## Round 1 — 2026-08-18, the smoke set

Run headless (`claude -p`) on `--model haiku` with `--plugin-dir`, before the two full sessions. Everything below was reproduced from a clean folder.

| What was asked | What should happen | What happened |
|---|---|---|
| `/shall:specify` with no argument | ask what to specify and stop, touching nothing | asked, stopped, wrote nothing |
| `/shall:specify <request>` against a CLI that does not know `status` | recognize the old build, tell the person, and not start | recognized it, stopped, wrote nothing |
| "add a goal and a sub-goal, follow the authoring skill" | two files, the `REFINES` in the parent, `shall check` exits 0 | exactly that — canonical frontmatter, the relation in the parent's file, check clean |

The hook was exercised on every branch by hand: a clean file is silent, an orphan comes back as exit 2 carrying the loader's whole sentence, a missing CLI and a folder that has gone each say which of the two happened rather than blaming the other.

**One protocol failure, fixed.** The authoring loop stalled on a permission prompt: the skill tells an agent to run `shall add-spec-node` and `shall check`, and nothing had pre-approved them, so a headless session stopped and asked. Both skills now declare `allowed-tools: Bash(shall:*)` — the CLI has no door that decides anything, so granting it for the turn that loads the skill costs nothing and removes a stall the agent cannot resolve for itself.

**One content observation, not fixed.** The goal's success measure came back as "within 60 seconds" — a number, where the template hint asks for the gauge in words and leaves the quantity to a criterion's benchmark. The hint was read (the section is there, correctly named) and then written past. If the two full sessions do it again, the hint is the candidate to reword, not the model.

## Round 2 — the full sessions

Still to run, in the user's own terminal, because every phase ends at a browser the agent cannot open:

- **demo2, a focus timer CLI** — the whole of Phase 1 through Phase 6 with a web approval between each, then a deliberate rejection with a rationale, to watch the agent receive it through `shall board`, revise the node, and see the rejection lapse on its own.
- **demo3, a link shortener** — a compressed run to loop-ready, then a revision request, to watch entry dispatch pick the right phase and scope the work to the subtree it touches.
- **An interruption**, in whichever of the two is convenient: close the session part-way through a phase, before its cards are approved, and open a new one on the same folder. The dispatch should see the yellow nodes, say which phase they belong to, and ask whether to finish it — not read a layer off the request and start writing beside what is already there.

The measurement to record for each phase: **how many approval cards actually arrive.** The skills say "one or more" and predict one per top-level thing changed; if a phase splits differently in practice, the wording follows the practice.
