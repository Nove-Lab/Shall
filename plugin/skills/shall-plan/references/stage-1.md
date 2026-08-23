# Stage 1 — Planning

The spine is [`../SKILL.md`](../SKILL.md), the `shall-plan` skill itself: its common rules, its technology section, its agreement and its question rules govern this stage, and every mention of the spine below points there.

## Purpose

Plan the plane in the conversation, whole, and get it agreed. **Nothing here writes a file.** The plan this stage produces is a draft held in the conversation — the stack, the modules, the contracts, the work — and it reaches disk only in stage 2, after the yes.

## What it needs from above

The gate passed — the command already read the colour of every node above the responsibilities this direction touches — and the mode: new, or revision with the reach the command worked out. In revision mode every step below runs over that reach and nothing outside it; what is small is the reach, not the procedure.

## Steps

Steps 1 to 9 happen **in the conversation**. Nothing reaches disk until stage 2.

1. **Survey the project's own documents** and sort what you find three ways — the spine's rule: a binding norm is a round trip through `/shall:specify` in this session, because a reference to an outside document is a dependency nothing tracks; a convention of arrangement is followed and its source path written into the body of the node that followed it; a conflict between the direction and a convention is a question, never a quiet decision either way. If the project says nothing about itself at all, say so once, ask once whether there is an unwritten convention worth honoring, and go on. Finish any promotion round trip before the boundaries lean on it.
2. **Read the code that is there, read-only.** Open the repository the way you would before changing it: the layout, the entry points, the modules already standing, the tests and how they run, the build. Use your reading tools and nothing that writes. What exists is a driver as hard as any requirement — a boundary the code already draws is followed unless the direction says to move it, and then the moving is said in the plan.
3. **Scout the stack and put the `Stack` question.** The spine's technology section governs: what the project runs on, what this direction needs, the candidates by their standard names with the alternatives weighed, the repository's own choice first and recommended when there is one. Under `--auto` no question: take what the repository runs on, or what the direction names, and say which and why in the plan you write out. Decide now whether the choice is project-wide — then it is the one `Decision` stage 2 writes — or one module's own.
4. **Collect the drivers**: every green responsibility in scope, plus the non-functional requirements and the constraints that bind them. A structure cut from functional responsibilities alone splits again the first time a quality requirement is put to it.
5. **Draw the module boundaries** — open [modules.md](modules.md) here. Responsibilities first, structure second; the boundary test on every candidate; the two assignment tests; a contested responsibility settled by information; a purely technical module allowed to stand; one term meaning two things stops you. Mark every hand-over between modules as you walk the scenarios through — the contracts are harvested from those marks.
6. **Harvest the contracts** — open [contracts.md](contracts.md) here. Interfaces from the hand-overs, schemas from the data that crosses, the minimum published, every published item with a named consumer; the module's Contracts section written at signature level, the Interface node written as obligations.
7. **Cut the work** — open [work-items.md](work-items.md) here. Every module gets the work items you can see now, or the plan says its work is not visible yet; every work item belongs to a module; every one carries a definition of done; each targets none, one or several criteria; what waits on what is written as `DEPENDS_ON`, and no loop.
8. **Check the draft against itself**, before anybody is asked to read it:
   - every responsibility in scope reaches at least one module, and no module realizes no responsibility;
   - no module dependency comes back round through consumed contracts;
   - nothing breaks a constraint;
   - every criterion in scope is targeted by at least one work item;
   - every work item belongs to a module;
   - no work item names a path, a class, a function or a procedure;
   - no definition of done repeats a criterion's sentence;
   - no figure of speech stands where a technology should — every module's Technology names what it is built of;
   - the stack is said, and when it is project-wide, it is named as the decision stage 2 will write.
9. **Present the whole plan and get the yes** — the spine's agreement. The stack and what it binds; every module with the responsibilities it realizes, its technology, its components, its contracts, its behaviour and what it refused; every interface and schema; every work item with its module, the criteria it targets, what it waits on and its definition of done; and, where grounds decided something, which decision followed which grounds. In plain sentences, once, whole. On a no, take the objection back to the step it names and present again. Under `--auto` the plan is written out in full and not waited on.
10. Open [stage-2.md](stage-2.md).

## The questions

Ask through AskUserQuestion under the spine's rules. What is worth asking here:

| When | Ask | Options | Header |
|---|---|---|---|
| the stack for what this direction builds | which stack do we build this on? | the candidates by their standard names, the repository's own first `(Recommended)` | `Stack` |
| two modules could both own a responsibility | which one holds what this needs? | the candidate modules | `Owner` |
| the direction and a convention disagree | the project already does it this way — which wins here? | follow the convention / follow the direction / a third way | `Conflict` |
| one term is pulling two ways | is this one concept or two? | one, and the boundary moves / two, and the term splits | `One term?` |
| a thing could be kept inside either of two modules | which of these is likelier to change on its own? | the candidate modules | `Where?` |
| a module answers to no domain concept | is this a module of its own, or part of one? | its own, hiding a mechanism / folded into the candidate | `Technical?` |
| an obligation could sit on either side | who guarantees this — the caller or the module? | the caller, before it calls / the module, when it returns / both, as an invariant | `Which side` |
| a published item has no obvious caller | who needs this? | the candidate modules / nobody yet — remove it | `Consumer` |
| two pieces of data travel together | is this one thing or two? | one bundle kept consistent / two, related | `One unit?` |
| two schemas describe the same data differently | which definition stands? | the two definitions / a third that covers both | `Definition` |
| work touches several modules | is this one job across them, or a piece of shared machinery? | one job, allocated to all of them / machinery, which is a module we have not drawn | `Spanning` |
| a work item could close any of several criteria | which criteria does finishing this make judgeable? | the candidate criteria / none — it is structure | `Aim` |
| a work item will not fit one turn of work | where does it split? | 2–4 splits | `Split` |
| an order is implied but not obvious | does this really have to wait for that? | yes, it cannot start until then / no, they are independent | `Waits?` |
| the direction asks for file paths | should the work items name paths? | no — a path is found while working `(Recommended)` / yes, name them | `Paths?` |

An ambiguity a sensible default carries is not asked about. Write the default as an Assumption and anchor it with `ASSUMES` in the **module's own file** in stage 2 — a contract and a work item may not assume, so a default you leave unrecorded here has nowhere to hang later. Under `--auto` the `Stack` question and the agreement are not asked; the rest are asked as written.

## The gate

| The line | What proves it |
|---|---|
| nothing was written | `git status` says what it said before, and no file under `.shall/` has moved |
| the code was read before the boundaries were drawn | you can name the entry points, the modules already standing and how the tests run |
| the stack was said | the plan names it by its standard names, and says whether it is project-wide |
| every line of step 8 holds | you read the draft against each one |
| the plan was presented whole, and agreed | one presentation, one yes — or, under `--auto`, one presentation written out in full |

## When the gate fails

| What happened | Where to go |
|---|---|
| a module cannot pass the boundary test | step 5, with the test in hand |
| a module has no responsibility to hang off | `/shall:specify` — the responsibility was never written. Do not invent one |
| one term means two things | `/shall:specify` to split it, then step 5 |
| a constraint cannot be kept | `/shall:specify`. A constraint is a person's to relax, and never yours |
| a hand-over no contract absorbed | step 6 against the walkthroughs |
| work spans nearly every module | step 5 — a module is missing, and this is what its absence looks like |
| a criterion nothing targets | step 7 — derive the work item that makes it judgeable |
| a work item names a path, a function or a procedure | step 7 — say the scope and the definition of done, and leave the method to the work |
| a definition of done repeats the criterion | step 7 — say what is built and what it does, not what the verdict is |
| the yes is refused | the step the objection names — a boundary to step 5, a contract to step 6, a work item to step 7, the stack to step 3 |
