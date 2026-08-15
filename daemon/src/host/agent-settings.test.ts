import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { AGENT_DENY_RULES, writeAgentDenyRules } from "./agent-settings.js";

/**
 * The deny rules Shall writes into a project's `.claude/settings.json`.
 *
 * WHAT IS PINNED HERE IS RESTRAINT. The file belongs to the person, not to
 * Shall, and every test below is a way for an open to keep its hands off it: an
 * unparseable file is not rewritten, a settings block of the wrong shape is not
 * corrected, rules already written are not written again, and a deny list full
 * of somebody else's entries keeps all of them. The one thing an open may do is
 * append the strings that are not there yet, at the end.
 */

async function newProject(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "shall-agent-settings-"));
}

function settingsPathOf(projectPath: string): string {
  return path.join(projectPath, ".claude", "settings.json");
}

/** Somebody else's settings file, already on disk before Shall gets to it. */
async function writeSettings(
  projectPath: string,
  text: string,
): Promise<string> {
  const settingsPath = settingsPathOf(projectPath);
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, text, "utf8");
  return settingsPath;
}

describe("the agent deny rules", () => {
  test("a project with no settings file gets one carrying both deny rules", async () => {
    const project = await newProject();
    await writeAgentDenyRules(project);

    const text = await readFile(settingsPathOf(project), "utf8");
    const value = JSON.parse(text) as {
      permissions: { deny: unknown[] };
    };
    assert.deepEqual(value.permissions.deny, [...AGENT_DENY_RULES]);
    // Two-space JSON with a trailing newline, like every other file Shall
    // writes, so it does not show up as a no-newline-at-end diff.
    assert.ok(text.endsWith("\n"), JSON.stringify(text));
    assert.ok(text.includes('\n  "permissions"'), text);
  });

  test("a settings file already there keeps every key it had", async () => {
    const project = await newProject();
    const settingsPath = await writeSettings(
      project,
      '{"model":"opus","permissions":{"allow":["Bash"],"deny":["WebFetch"]},"other":1}',
    );

    await writeAgentDenyRules(project);

    const text = await readFile(settingsPath, "utf8");
    const value = JSON.parse(text) as {
      model: string;
      permissions: { allow: unknown[]; deny: unknown[] };
      other: number;
    };
    assert.equal(value.model, "opus");
    assert.deepEqual(value.permissions.allow, ["Bash"]);
    assert.equal(value.other, 1);
    // Appended at the END: what was already denied stays first.
    assert.deepEqual(value.permissions.deny, ["WebFetch", ...AGENT_DENY_RULES]);

    // And the file still reads in the order the person wrote it — the merge
    // assigns to keys that already exist, which does not move them.
    assert.ok(text.indexOf('"model"') < text.indexOf('"permissions"'), text);
    assert.ok(text.indexOf('"permissions"') < text.indexOf('"other"'), text);
    assert.ok(text.indexOf('"allow"') < text.indexOf('"deny"'), text);
  });

  test("a file holding one of the two rules gains only the other, and gains it at the end", async () => {
    const [homeRule, ledgerRule] = AGENT_DENY_RULES;
    const cases: { original: string; expected: string[] }[] = [
      // The file an older Shall wrote, back when Shall's home was the only
      // door it had anything to say about.
      {
        original: '{"permissions":{"deny":["Read(~/.shall/**)"]}}',
        expected: [homeRule, ledgerRule],
      },
      {
        original: '{"permissions":{"deny":["Edit(/.shall/ledger/**)"]}}',
        expected: [ledgerRule, homeRule],
      },
    ];

    for (const { original, expected } of cases) {
      const project = await newProject();
      const settingsPath = await writeSettings(project, original);

      await writeAgentDenyRules(project);

      const value = JSON.parse(await readFile(settingsPath, "utf8")) as {
        permissions: { deny: unknown[] };
      };
      // Appended, never reordered: the rule that was already there keeps the
      // place the person is used to seeing it in, and the diff is one line.
      assert.deepEqual(value.permissions.deny, expected, original);
    }
  });

  test("rules already written are not written again, and the mtime stays quiet", async () => {
    const project = await newProject();
    await writeAgentDenyRules(project);
    const settingsPath = settingsPathOf(project);
    const before = await stat(settingsPath);
    const text = await readFile(settingsPath, "utf8");

    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeAgentDenyRules(project);

    // An open runs this every time, and an open that rewrote the file would
    // hand the person a diff on every click.
    assert.equal((await stat(settingsPath)).mtimeMs, before.mtimeMs);
    assert.equal(await readFile(settingsPath, "utf8"), text);
  });

  test("a settings file that is not JSON is left exactly as it is", async () => {
    const project = await newProject();
    // JSONC with a comment in it parses for Claude Code and not for
    // `JSON.parse`, and rewriting it would eat the comment.
    const original = "// comment\n{}";
    const settingsPath = await writeSettings(project, original);

    await writeAgentDenyRules(project);

    assert.equal(await readFile(settingsPath, "utf8"), original);
  });

  test("a permissions block of the wrong shape is left alone as well", async () => {
    for (const original of [
      '{"permissions":"strict"}',
      '{"permissions":{"deny":{}}}',
      '["not an object at all"]',
    ]) {
      const project = await newProject();
      const settingsPath = await writeSettings(project, original);

      await writeAgentDenyRules(project);

      // Shall does not get to decide what somebody else's shape meant.
      assert.equal(await readFile(settingsPath, "utf8"), original, original);
    }
  });

  test("a deny list that is an array of mixed junk still just gets the rules appended", async () => {
    const project = await newProject();
    const settingsPath = await writeSettings(
      project,
      '{"permissions":{"deny":[1,"x"]}}',
    );

    await writeAgentDenyRules(project);

    const value = JSON.parse(await readFile(settingsPath, "utf8")) as {
      permissions: { deny: unknown[] };
    };
    // The module polices nothing but its own two entries.
    assert.deepEqual(value.permissions.deny, [1, "x", ...AGENT_DENY_RULES]);
  });

  test("a settings file with no permissions key gains one at the end", async () => {
    const project = await newProject();
    const settingsPath = await writeSettings(project, '{"model":"opus"}');

    await writeAgentDenyRules(project);

    const text = await readFile(settingsPath, "utf8");
    const value = JSON.parse(text) as {
      model: string;
      permissions: { deny: unknown[] };
    };
    assert.equal(value.model, "opus");
    assert.deepEqual(value.permissions.deny, [...AGENT_DENY_RULES]);
    assert.ok(text.indexOf('"model"') < text.indexOf('"permissions"'), text);
  });

  test("a project folder that cannot be written to is silence, not a failure", async () => {
    // Opening a project may not depend on this succeeding: the rule is a
    // convenience, and a `.claude` that is a FILE rather than a folder is one
    // of the ways it can simply not happen.
    const project = await newProject();
    await writeFile(path.join(project, ".claude"), "not a folder\n", "utf8");

    await writeAgentDenyRules(project);
  });
});
