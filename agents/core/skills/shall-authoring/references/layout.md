# Where the files are

## The `.shall/` tree

```
<project>/.shall/
  project.json                 id, display name, schema version
  .gitignore                   *.tmp — the only leaving Shall makes
  spec/<band>/<Type>/<id>.md   the graph: one file per node
  ledger/approvals.yaml        node id → approved hash, who, when
  ledger/rejections.yaml       node id → rejected hash, who, when, rationale
  ledger/acceptances.yaml      criterion or work item id → the hash and the list closed over
  ledger/feed/YYYY-MM.yaml     the Activity Feed: one line per finished run, a file per month
```

Both `spec/` and `ledger/` belong in the repository: the specification and its judgments travel with the code, git holds their history and their merges, and a fresh clone shows the same greens, reds and closed marks before anyone opens the browser. A ledger appears with its first record, so a project that has judged nothing has none — that is not damage. The feed appears the same way, month by month.

## The four band folders

`domain`, `intent`, `plan`, `execution`. The band is **derived from the type**, never chosen: Term and DomainEntity are domain; Goal, Actor, UseCase, Scenario, SystemResponsibility, Requirement, AcceptanceCriterion and Constraint are intent, and Assumption — the one type the canon gives no layer of its own — is filed there too; Module, Interface, DataSchema, WorkItem and Decision are plan; Journal, WorkLog, Evidence, CompletionReport and Finding are execution.

You never have to work this out. `shall add-spec-node --type <Type>` prints the path it wrote, and that path is already the right folder.

## The id

`<prefix>-<four digits>` — `R-0012`, `AC-0031`, `SR-0009`. The prefix says what the id points at without a lookup, and the padding is what makes ids sort in their own order (`R-0010` after `R-0002`, which unpadded they would not).

- The id is the FILENAME. It is never written inside the file, and the type is never written inside either — the folder is the type.
- `shall add-spec-node` picks the next free id for the type. Take it. Renaming a file breaks every relation pointing at the old id, and each of those files is a gap until you edit it.
- An id may hold letters, digits, dots, hyphens and underscores, up to 64 characters. The `<prefix>-<four digits>` shape is what Shall suggests, not a rule the loader enforces — so never infer a node's type from its id.

## The ledgers, and why you leave them alone

`approvals.yaml`, `rejections.yaml` and `acceptances.yaml` are Shall's own books. The daemon is the only writer, and writing them is refused outright: {{ledger-guard-layout}}, and it covers making the file out of nothing too — and the Activity Feed under `ledger/feed/` sits under the same rule, because the rule is a glob over the folder.

Reading them is not refused — it is pointless, and Shall's convention is that you do not. A color is arithmetic over all three books and the nodes' content hashes at once — a standing rejection outranks an approval, a rejection lapses by itself the moment the node's hash moves, a closure lapses when the list of claimants changes — so a color you work out from a book by hand disagrees with the one on the person's screen, and yours is the wrong one. `shall status` and `shall board` run the real arithmetic and report what the books hold, rationale and all.

**The feed is the one narrow exception to "the daemon alone writes", and the daemon still holds the pen.** `shall log <kind> <summary> [--refs <id,id>]` asks the daemon to append one line to the current month's feed file, and the process spines say which kind and when — once, at the end of a run. You never open the file; the kinds are the four finished-process kinds and nothing else, and the feed holds only what a run logged, so it never says how anything was judged. You never read it back either: what happened to the project is in the graph and in `shall status`; the feed is what a person skims in the browser.

Nothing else writes there. There is no `shall approve`, no `shall reject` and no `shall close`; a judgment is a person's, made in the browser — and `shall log` cannot write one.

## Finding out what this build has

The commands and their options are the CLI contract table in [../SKILL.md](../SKILL.md). Read it rather than guessing at a flag: a word the CLI does not answer to is refused in one line naming the commands it does, and exits 1, so a guess costs a turn and tells you nothing you could not have read.

In a folder that is not a Shall project yet, `shall init` comes first. It also runs `git init` when the folder is in no repository, because git is the spec's only restoration material.
