#!/usr/bin/env node

/**
 * Compile a spec node file the moment it is written.
 *
 * Shall's spec is markdown files, and a file that will not read is not in the
 * graph at all — it does not arrive broken, it disappears. An agent that only
 * runs `shall check` at the end of a phase can therefore write six files against
 * a shape the loader refuses and learn it once, at the end, with nothing left to
 * tell it which of the six taught it the wrong shape. This hook closes that gap
 * to a single write.
 *
 * IT IS ONE SCRIPT FOR EVERY AGENT, so it reads every shape a payload arrives
 * in rather than one harness's. A payload that names the file outright —
 * `tool_input.file_path`, which is what an edit or a write tool reports — names
 * one file. A payload whose `tool_input.command` is a patch envelope names
 * however many files the patch carried, in `*** Add File:` and `*** Update
 * File:` lines, and every spec file among them is checked on its own. A harness
 * that passes neither can pass the path as this script's first argument.
 * Anything that is not a `.md` file under a `.shall/spec/` folder exits silently
 * whichever way it arrived.
 *
 * WHY EXIT 2 AND NOT 1. A post-write hook fires after the write has landed, so
 * it cannot undo anything and blocking is not what it is for. Exit 2 is the
 * code an agent harness hands back to the agent as text, which is the whole
 * point: the agent that just wrote the file reads the check's own sentences and
 * fixes the file itself. Any other non-zero code is noise in a transcript
 * nobody acts on.
 *
 * A FRESHLY WRITTEN CHILD IS EXPECTED TO REPORT "no live anchor" until its
 * parent gains the relation line. A relation lives in the file of the node it
 * leaves, so a new Scenario is held to the graph by a line in the UseCase's
 * file, not by anything the Scenario says about itself. Writing the child first
 * and the parent's line second is the normal loop, and the sentence in between
 * is the loop working. Do not repair it by editing the child.
 *
 * A NODE HELD BY A LINE IT DRAWS ITSELF READS THAT SENTENCE THE OTHER WAY
 * ROUND. A Decision is anchored by its own AFFECTS, an Evidence and a
 * CompletionReport by their own CLAIMS, so there is no parent to wait for
 * and the line the check is asking for belongs in the file just written. A
 * WorkLog is held either way — by the journal's LOGS above it, or by its own
 * ADDRESSES — so for it the sentence names a choice rather than a wait; a
 * WorkItem is held by a module's ALLOCATES alone, so for it the sentence names
 * the module's file.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * A spec node file, however the tool spelled the path. The tools report an
 * absolute path today, but a relative one is the same file and used to be
 * skipped in silence — the one failure mode a hook must not have, because
 * nothing tells anybody it did nothing.
 */
const SPEC_NODE_FILE = /(?:^|\/)\.shall\/spec\/.+\.md$/;

/**
 * A path inside a patch envelope. `*** Add File: <path>` and `*** Update File:
 * <path>` are how a whole-patch tool says which files it touched, and one
 * envelope may say it several times — a phase that writes a child and its
 * parent's relation line in one patch is the ordinary case, not the odd one.
 * `*** Delete File:` is deliberately not read: the spec is never deleted by
 * these processes, and a check scoped to a file that is gone reports the hole
 * rather than the write.
 */
const PATCHED_FILE = /^\*\*\* (?:Add|Update) File: (.+)$/gm;

/**
 * Every path one payload reported, in the order it reported them.
 *
 * The three shapes are the three ways a harness has of saying which file was
 * written, and they are asked in order of how much they promise: a payload with
 * `tool_input.file_path` has named one file outright; a payload whose
 * `tool_input.command` is a patch envelope has named however many the patch
 * carried; and the script's own first argument serves a harness that passes
 * neither, so one script goes on serving any hook schema that can pass a path
 * at all.
 */
function reportedPaths(payload) {
  const named = payload?.tool_input?.file_path;
  if (typeof named === "string") {
    return [named];
  }
  const command = payload?.tool_input?.command;
  if (typeof command === "string") {
    return [...command.matchAll(PATCHED_FILE)].map((match) => match[1]);
  }
  return typeof process.argv[2] === "string" ? [process.argv[2]] : [];
}

function run() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    // A payload this script cannot read is the harness's business, not the
    // agent's: saying so would put a hook's own bug in front of somebody
    // debugging their specification.
    return 0;
  }

  // One write may be several spec files, so each is checked on its own and the
  // sentences come back one file after another — the agent that wrote them has
  // to be told which of them taught it the wrong shape, which is the whole
  // reason this hook fires per write rather than per phase.
  const files = [...new Set(reportedPaths(payload).filter((path) => SPEC_NODE_FILE.test(path)))];
  let worst = 0;
  for (const reported of files) {
    worst = Math.max(worst, checkOne(reported));
  }
  return worst;
}

function checkOne(reported) {
  // Resolved once, against the working directory a relative tool path is itself
  // relative to, because both the folder to run in and the scope to pass are
  // this path and neither survives being resolved a second time somewhere else.
  const filePath = resolve(reported);
  const folder = dirname(filePath);

  // `shall check` works on the folder it is run in, so the file's own directory
  // is what puts it in the right project — the agent's working directory may be
  // anywhere, including another repository.
  const checked = spawnSync("shall", ["check", "--scope", filePath], {
    cwd: folder,
    encoding: "utf8",
  });

  if (checked.error) {
    if (checked.error.code === "ENOENT") {
      // ENOENT is spawnSync's answer to BOTH a command it cannot find and a
      // `cwd` that is not there, and the two ask for opposite repairs — so the
      // folder is asked directly rather than guessed at from the code.
      if (!existsSync(folder)) {
        process.stderr.write(
          `${folder} does not exist, so ${filePath} was not checked — the folder went away after the write, and the file went with it. Write the node again under a folder that is there.\n`,
        );
        return 2;
      }
      process.stderr.write(
        `The shall CLI is not on PATH, so ${filePath} was not checked — install or link Shall's CLI, then check the file with shall check.\n`,
      );
      return 2;
    }
    return 0;
  }

  // A child a signal killed reports `null` rather than a number, and it has
  // printed nothing an agent could act on: silence is the honest answer, not an
  // exit 2 carrying an empty sentence.
  if (checked.status === null || checked.status === 0) {
    return 0;
  }

  process.stderr.write(`${checked.stdout ?? ""}${checked.stderr ?? ""}`);
  return 2;
}

// One guard around the whole body: a hook that throws turns every write in the
// session into a stack trace, and nothing this script does is worth that.
let code = 0;
try {
  code = run();
} catch {
  code = 0;
}
process.exit(code);
