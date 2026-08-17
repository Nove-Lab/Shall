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
 * WHY EXIT 2 AND NOT 1. A PostToolUse hook fires after the write has landed, so
 * it cannot undo anything and blocking is not what it is for. Exit 2 is the one
 * code Claude Code hands back to the agent as text, which is the whole point:
 * the agent that just wrote the file reads the check's own sentences and fixes
 * the file itself. Any other non-zero code is noise in a transcript nobody acts
 * on.
 *
 * A FRESHLY WRITTEN CHILD IS EXPECTED TO REPORT "no live anchor" until its
 * parent gains the relation line. A relation lives in the file of the node it
 * leaves, so a new Scenario is held to the graph by a line in the UseCase's
 * file, not by anything the Scenario says about itself. Writing the child first
 * and the parent's line second is the normal loop, and the sentence in between
 * is the loop working. Do not repair it by editing the child.
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

  const reported = payload?.tool_input?.file_path;
  if (typeof reported !== "string" || !SPEC_NODE_FILE.test(reported)) {
    return 0;
  }
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
