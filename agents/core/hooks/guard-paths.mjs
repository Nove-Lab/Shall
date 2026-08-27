#!/usr/bin/env node

/**
 * Refuse, before it happens, the two writes no process may make: anything
 * under `.shall/ledger/`, and the removal of a file under `.shall/spec/`.
 *
 * WHY A HOOK WHEN THE PROSE ALREADY SAYS SO. The ledgers are what green means,
 * and a spec file is deleted only by a proposal a person judges; both rules
 * are in every skill. But a rule in prose is kept by the model's attention,
 * and a rule in a hook is kept by the harness — so where the harness offers a
 * pre-tool hook, the wall stands there and the sentence merely names it.
 * Claude's settings carry a deny rule for the ledger already; this script is
 * the same wall for the agents that have no deny rule, and the one wall either
 * has against `rm` under the spec folder.
 *
 * ONE SCRIPT FOR EVERY AGENT, like `check-spec.mjs` beside it: it reads a
 * payload that names one file, a payload whose command is a patch envelope, or
 * a payload whose command is a shell line. It refuses by exiting 2 with one
 * sentence on stderr — the code both harnesses hand back to the agent as a
 * block — and it says nothing at all about everything else.
 *
 * IT IS DELIBERATELY NARROW. A shell line is text, and a hook that tried to
 * parse the shell would refuse what it did not understand; this one refuses a
 * line that names the folder AND carries a verb that writes or removes, and
 * lets a `cat` or a `git log` over the same path through. A write that slips
 * past it is still refused by the prose; a read it wrongly blocked would be a
 * wall in front of somebody looking.
 */

import { readFileSync } from "node:fs";

const LEDGER = /(?:^|[\s"'`=/])\.shall\/ledger(?:\/|$|["'`\s])/;
const SPEC_FILE = /(?:^|[\s"'`=/])\.shall\/spec\/[^\s"'`]+\.md/;

/** What a shell line does to a path it names, when it is not merely reading it. */
const WRITES = /(?:^|[\s;&|(])(?:rm|mv|cp|tee|truncate|touch|install|dd)\b|>>?|\bsed\s+(?:-[a-zA-Z]*i|--in-place)|\bgit\s+(?:rm|mv|checkout|restore|clean)\b/;
const REMOVES = /(?:^|[\s;&|(])(?:rm|unlink|shred)\b|\bgit\s+(?:rm|clean)\b|\bfind\b[^\n]*-delete/;

const PATCHED = /^\*\*\* (Add|Update|Delete) File: (.+)$/gm;

function refuse(sentence) {
  process.stderr.write(`${sentence}\n`);
  return 2;
}

function judge(payload) {
  const input = payload?.tool_input ?? {};

  // A tool that names one file outright — a write or an edit.
  const named = input.file_path ?? input.path;
  if (typeof named === "string") {
    if (LEDGER.test(named)) {
      return refuse(
        `${named} is under .shall/ledger/, which only the daemon writes — the books are what green means, and a ledger an agent touched is a judgment forged. Nothing was written.`,
      );
    }
    return 0;
  }

  const command = input.command;
  if (typeof command !== "string") {
    return 0;
  }

  // A patch envelope names its files one line each.
  if (command.includes("*** Begin Patch")) {
    for (const [, verb, file] of command.matchAll(PATCHED)) {
      if (LEDGER.test(file)) {
        return refuse(
          `${file} is under .shall/ledger/, which only the daemon writes. Nothing was patched.`,
        );
      }
      if (verb === "Delete" && SPEC_FILE.test(file)) {
        return refuse(
          `${file} is a spec node, and a spec file is never deleted — propose the deletion in its own frontmatter and leave the file where it is. Nothing was patched.`,
        );
      }
    }
    return 0;
  }

  // A shell line: the folder named, and a verb that writes or removes.
  if (LEDGER.test(command) && WRITES.test(command)) {
    return refuse(
      `That command writes under .shall/ledger/, which only the daemon writes — read the books through shall status and shall board instead. Nothing was run.`,
    );
  }
  if (SPEC_FILE.test(command) && REMOVES.test(command)) {
    return refuse(
      `That command removes a spec node, and a spec file is never deleted — propose the deletion in its own frontmatter and leave the file where it is. Nothing was run.`,
    );
  }
  return 0;
}

function run() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return 0;
  }
  return judge(payload);
}

process.exit(run());
