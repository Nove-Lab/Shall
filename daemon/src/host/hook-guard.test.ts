import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, test } from "node:test";
import { generatedRoot } from "./agent-kit.js";

/**
 * The guard hook, run as the harness runs it: a payload on stdin, a verdict as
 * an exit code, one sentence on stderr when it refuses.
 *
 * WHAT IS PINNED IS THE NARROWNESS AS MUCH AS THE WALL. A write under the
 * ledger and a removal under the spec are refused in every shape a harness
 * reports them in; a read over the same paths, and a write anywhere else, pass
 * in silence — a guard that blocked a `cat` would be a wall in front of
 * somebody looking.
 */

const SCRIPT = path.join(generatedRoot("claude"), "hooks", "guard-paths.mjs");

function verdict(payload: unknown): { code: number | null; stderr: string } {
  const run = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
  return { code: run.status, stderr: run.stderr };
}

describe("the guard hook", () => {
  test("refuses a write under the ledger, named outright or in a patch", () => {
    const named = verdict({ tool_name: "Write", tool_input: { file_path: "/p/.shall/ledger/approvals.yaml" } });
    assert.equal(named.code, 2);
    assert.match(named.stderr, /only the daemon writes/);
    const patched = verdict({
      tool_name: "apply_patch",
      tool_input: { command: "*** Begin Patch\n*** Update File: .shall/ledger/feed/2026-08.yaml\n*** End Patch" },
    });
    assert.equal(patched.code, 2);
  });

  test("refuses a spec file's removal, in a patch or in a shell line", () => {
    const patched = verdict({
      tool_name: "apply_patch",
      tool_input: { command: "*** Begin Patch\n*** Delete File: .shall/spec/intent/Goal/G-0001.md\n*** End Patch" },
    });
    assert.equal(patched.code, 2);
    assert.match(patched.stderr, /never deleted/);
    for (const command of [
      "rm .shall/spec/intent/Goal/G-0001.md",
      "git rm -q .shall/spec/plan/Module/M-0001.md",
      "cd x && rm -f ./.shall/spec/intent/Goal/G-0001.md",
    ]) {
      assert.equal(verdict({ tool_name: "Bash", tool_input: { command } }).code, 2, command);
    }
  });

  test("refuses a shell line that writes under the ledger, and lets a read through", () => {
    for (const command of [
      "echo x >> .shall/ledger/approvals.yaml",
      "sed -i '' 's/a/b/' .shall/ledger/rejections.yaml",
      "rm -rf .shall/ledger",
    ]) {
      assert.equal(verdict({ tool_name: "Bash", tool_input: { command } }).code, 2, command);
    }
    for (const command of [
      "cat .shall/ledger/approvals.yaml",
      "git log -- .shall/ledger",
      "grep -rn WI-0001 .shall/spec",
      "rm -rf node_modules",
      "shall log work_done 'done' --refs J-0001",
    ]) {
      const run = verdict({ tool_name: "Bash", tool_input: { command } });
      assert.equal(run.code, 0, command);
      assert.equal(run.stderr, "");
    }
  });

  test("a write anywhere else, an edit of a spec file, and a payload it cannot read all pass", () => {
    assert.equal(verdict({ tool_name: "Write", tool_input: { file_path: "/p/.shall/spec/intent/Goal/G-0001.md" } }).code, 0);
    assert.equal(verdict({ tool_name: "Edit", tool_input: { file_path: "/p/src/main.ts" } }).code, 0);
    const run = spawnSync(process.execPath, [SCRIPT], { input: "not json", encoding: "utf8" });
    assert.equal(run.status, 0);
  });
});
