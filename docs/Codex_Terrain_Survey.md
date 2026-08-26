# Codex Terrain Survey

What the Codex CLI actually does, measured on a real install — the ground the Codex adapter is built on, and the template to fill in again when the next agent (Cursor, …) is added.
Measured on codex-cli **0.149.1** (2026-08-24) on macOS, ChatGPT login; source facts cross-checked against `openai/codex@main`.

## The equivalence table

| Claude Code | Codex | Verified |
|---|---|---|
| Slash commands (`.claude/commands/*.md`, `/shall.specify`) | **None — removed 2026-03.** Skills only: `<project>/.agents/skills/<dir>/SKILL.md`, invoked as `$name` mentions | ✅ live |
| Command/skill names with dots (`/shall.work.todo`) | **Dots invalid in mentions** (name boundary). Colons valid: `$shall:work:todo` | ✅ live — a skill named `shall:help` loads and `$shall:help` invokes it, in `codex exec` too |
| `$ARGUMENTS` placeholder | **None.** Arguments are the natural language after the mention | ✅ (by removal — no expansion machinery exists) |
| `description` frontmatter (catalog) | `description` is load-bearing: startup catalog (names+descriptions only, ~2%-of-context budget) and implicit invocation both read it | ✅ live — probe skill was invoked implicitly off its description |
| `.claude/rules/*.md` always-on context | `AGENTS.md`: always loaded, root→cwd chain, 32KiB total budget. No managed-block convention — Shall's `<!-- BEGIN SHALL -->` fences are our own invention | ✅ live — text inside and outside our fences both reached the model, fences harmless |
| `settings.json` `permissions.deny` | Permission-profile filesystem deny globs + execpolicy rules (`.codex/rules/*.rules`) — **project layer loads only when the project is trusted** | ⚠️ source-verified, not live-tested |
| `settings.json` hooks (PostToolUse) | `.codex/hooks.json`, same JSON shape (`hooks.PostToolUse[].matcher`, `hooks[].command`) — gated by **hook trust**, a separate persisted approval; `--dangerously-bypass-hook-trust` exists for automation | ✅ live — fired on a file write once hook trust was bypassed; payload below |
| Hook payload `tool_input.file_path` | **No `file_path`.** `tool_name` is `apply_patch` and `tool_input.command` is the whole patch envelope (`*** Begin Patch\n*** Add File: <path>…`). A shared hook script must parse `^\*\*\* (Add|Update) File: (.+)$` out of the envelope; the hook runs with cwd = project root and also receives `cwd` in the payload | ✅ live |
| `AskUserQuestion` | `request_user_input` tool exists but is **Plan-mode only**. The working idiom: put the options in plain text and end the turn; the user's next message is the answer | ✅ live — the model presents options, recommends one, and ends its turn on the question |
| Sandbox | seatbelt/landlock: `workspace-write` default, `network_access = false` | ✅ live — see below |
| Headless | `codex exec` (approvals default Never; sandbox applies; `--sandbox`, `-c key=value` work) | ✅ live |

## The sandbox findings (the load-bearing ones)

1. **Default `workspace-write` blocks loopback.** `curl http://127.0.0.1:9461/health` fails to connect inside the sandbox. Every `shall` command needs the daemon, so under default settings the Shall CLI is unusable from inside Codex.
2. With `-c sandbox_workspace_write.network_access=true`, plain loopback works — verified with curl, `node -e fetch`, and `bun -e fetch` (both `localhost` and `127.0.0.1`).
3. **The compiled `shall` binary still fails even with network on**: the daemon knock fails somewhere the single-shot fetches do not, the CLI takes its stale-daemon path, and the sandbox then denies `rm ~/.shall/daemon.json` (EFAULT — writes outside the workspace are denied, correctly). Root cause of the knock failure under an allowed network is **unresolved** (suspect: a socket/spawn syscall of the embedded Bun runtime that seatbelt denies). UNRESOLVED — retest, and if it holds, the recommendation below is the answer either way.
4. **`--sandbox danger-full-access` runs `shall status --json` perfectly** — the CLI itself is sound; the sandbox is the whole story.
5. Practical consequence for the adapter: Codex must run `shall` **escalated** (outside the sandbox). The path with the least friction: an execpolicy `prefix_rule` allowing `shall` (shippable in `.codex/rules/`, trust-gated; or accepted once via the TUI's "remember this"). The Codex adapter prints a one-line notice after wiring instead of writing config — user settings are not ours to edit.

## Trust, the recurring gate

Three separate trusts, all recorded on the user's side (`~/.codex/config.toml` and hook-trust storage):

- **Project trust** — `.codex/config.toml`, `.codex/rules/` load only for trusted projects. `codex exec` records `trust_level = "trusted"` for the cwd on first run (observed).
- **Hook trust** — project hooks need their own persisted approval before they fire; `--dangerously-bypass-hook-trust` bypasses for vetted automation.
- **Approval/escalation** — sandbox-blocked commands succeed only through an approval or a standing rule.

## Still to measure

- Whether the model retries a sandbox-blocked `shall` call as an escalated run when a rule allows it, and how the TUI's approval prompt reads there (§5 runs the interactive scenario).
- The unresolved compiled-binary knock failure under an allowed network (table above).

## Probe method (repeat for the next agent)

A scratch git repo with: a skill dir under the project-level skills root carrying the adapter's marker comment after frontmatter; an AGENTS.md with user text outside our fences and a codeword inside; a hook wired to a script that dumps stdin to a file; then `codex exec` probes: catalog listing, explicit mention, codeword recall, a file write (hook), the CLI call under each sandbox setting. Keep every probe's exact command and verbatim answer.
