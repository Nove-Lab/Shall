#!/usr/bin/env bash
#
# One release binary, put through what a first-time install actually does:
# a folder becomes a project, the agent kit lands in it, the three readings
# answer, running init twice changes nothing, and the daemon it started is
# alive and stoppable.
#
# IT DOES IT ONCE PER AGENT, in a project each. The kits land in different
# folders and are carried under different prefixes inside the executable, so a
# release that carried only one of them would pass every check the other's
# project makes and fail on the first `init` somebody typed.
#
# IT IS ONE FILE BECAUSE THE RELEASE SMOKES TWICE. x64 and arm64 run on
# different machines in release.yml, and a smoke copied into both workflows
# would drift the moment one copy learned something the other did not.
#
# IT NEVER TOUCHES THE HOME IT WAS RUN FROM. Shall keeps its config, its
# registry and its daemon record in `~/.shall`, so this hands the binary a
# throwaway HOME instead: on CI that is the cold start a new machine has, and
# on a maintainer's laptop it is the reason running this does not register a
# temp folder in their project list or restart the daemon they are using. The
# port is chosen free for the same reason — 9461 is where their daemon already
# is, and a smoke that adopted it would be testing that install and not this
# binary.
set -euo pipefail

binary="${1:?usage: smoke-binary.sh <path to a shall binary>}"
binary="$(cd "$(dirname "$binary")" && pwd)/$(basename "$binary")"

home="$(mktemp -d)"
export HOME="$home"
mkdir -p "$HOME/.shall"
port="$(python3 -c 'import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()')"
printf '{\n  "port": %s\n}\n' "$port" > "$HOME/.shall/config.json"

project="$(mktemp -d)"
cd "$project"
# The spec's restoration material is git, and `init` asks about a folder that
# has no repository. Nothing here is a terminal it could ask in, but the
# repository is what a real install would have, so it gets one.
git init -q .

# `--agent` is required with `--json`: the flag promises no questions, and which
# agent a project is for is a question. A release that wired one by default
# would be choosing for whoever piped this.
echo "== shall init"
"$binary" init --agent claude --json > init.json
python3 -m json.tool init.json > /dev/null

echo "== the agent kit reached the project"
test -f .claude/commands/shall.specify.md

echo "== shall check"
"$binary" check

echo "== shall status --json"
"$binary" status --json | python3 -m json.tool > /dev/null

echo "== shall board --json"
"$binary" board --json | python3 -m json.tool > /dev/null

# `init` on a folder that is already a project reopens it, and reopening runs
# the tidyings — the spec folder, the templates, the kit. None of them may
# rewrite what is under `.shall`: that is the specification and the ledgers,
# and a release that edits them on open would edit somebody's repository every
# time they typed the command.
echo "== a second init left the spec tree alone"
# macOS has no sha256sum, the same gap install.sh answers the same way.
if command -v sha256sum >/dev/null 2>&1; then
  sums() { find .shall -type f -exec sha256sum {} + | sort; }
else
  sums() { find .shall -type f -exec shasum -a 256 {} + | sort; }
fi
before="$(sums)"
test -n "$before"
"$binary" init --agent claude --json > /dev/null
test "$before" = "$(sums)"

# A SECOND PROJECT, FOR THE OTHER AGENT. Codex's kit lands in three places
# rather than one — the skills under the project's own skills root, the hook
# under `.codex/`, and a fenced block inside `AGENTS.md` — and only the first of
# those is prose the binary could get wrong on its own; the other two are files
# a release has to carry the inputs for.
codex_project="$(mktemp -d)"
cd "$codex_project"
git init -q .

echo "== shall init --agent codex"
"$binary" init --agent codex --json > init.json
python3 -m json.tool init.json > /dev/null

echo "== the codex kit reached the project"
test -f .agents/skills/shall-help/SKILL.md
python3 -m json.tool .codex/hooks.json > /dev/null
test -f .codex/hooks/shall/check-spec.mjs
test -f .codex/hooks/shall/guard-paths.mjs
# The two lines that let shall through the sandbox, written on the FIRST init.
grep -q "^network_access = true" .codex/config.toml
grep -q "^writable_roots = " .codex/config.toml
grep -q "BEGIN SHALL" AGENTS.md
# Nothing of the other agent's, in a project that asked for this one.
test ! -d .claude

echo "== a second init changed none of it"
codex_sums() {
  find .agents .codex AGENTS.md -type f -exec "$@" {} + | sort
}
if command -v sha256sum >/dev/null 2>&1; then
  wired() { codex_sums sha256sum; }
else
  wired() { codex_sums shasum -a 256; }
fi
before="$(wired)"
test -n "$before"
"$binary" init --agent codex --json > /dev/null
test "$before" = "$(wired)"

echo "== the daemon it started answers, and stops"
state="$HOME/.shall/daemon.json"
test -f "$state"
running_port="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["port"])' "$state")"
pid="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["pid"])' "$state")"
curl -fsS "http://127.0.0.1:$running_port/health" |
  python3 -c 'import json,sys; assert json.load(sys.stdin)["ok"] is True'
kill "$pid"

echo "== $(basename "$binary") passed"
