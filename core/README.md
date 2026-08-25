# core

The part with no host underneath. No socket, no git, no `process.argv` is touched here.
Only `store` opens files, and only at paths the daemon hands it.

Five modules, and the direction they may call each other in — a module above never calls up.

| Module      | What it holds                                                    |
| ----------- | ---------------------------------------------------------------- |
| `graph`     | the spec graph's grammar — node and edge types, bands, judgement rules |
| `store`     | each project's `.shall/spec/<Type>/*.md` and the approval ledgers — the files are the canon |
| `arith`     | the judgement arithmetic — colour, closure, status, board, queue, vitals |
| `serialize` | the file format — canonical emit and forgiving parse             |
| `exchange`  | an empty seat — session brokering is git's job                   |

What `store` opens is the canon. One node is one file, the folder name is the type
and the file name is the id — which is why what the bytes `serialize` emits do and
do not carry is one flesh with `store`'s folder layout.

`exchange` is a seat kept deliberately empty — a session's history, merging and
review belong to git. What each module holds is in
[`../docs/Project_Structure_and_Architecture.md`](../docs/Project_Structure_and_Architecture.md).
