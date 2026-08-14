import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { TEXT_BYTE_CAP } from "../graph/index.js";
import { isCanonical } from "../serialize/index.js";
import {
  addEdge,
  createNodeFile,
  deleteNodeFile,
  isStoreRefusal,
  loadGraph,
  removeEdge,
  updateNodeFile,
  type FileProblem,
} from "./file-store.js";

/**
 * The folder, read and written.
 *
 * These tests use REAL DIRECTORIES and not a mocked filesystem, because what is
 * being claimed is about a filesystem: that a rename is atomic, that a stat
 * catches a hand edit, that a `.tmp` file is never left behind. A fake would
 * agree with whatever this module happens to do.
 *
 * Every case builds its own folder under the system temp directory and every
 * one of them is removed at the end, whether it passed or not.
 */

const roots: string[] = [];

async function makeSpecDir(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "shall-store-"));
  roots.push(root);
  return path.join(root, "spec");
}

after(async () => {
  for (const root of roots) {
    await rm(root, { recursive: true, force: true });
  }
});

/**
 * A permission bit taken away for the length of one question and put back
 * whatever the answer was — a folder left at mode 000 cannot be removed, and the
 * temp directory would outlive the run.
 */
async function whileShut<T>(target: string, ask: () => Promise<T>): Promise<T> {
  const mode = (await stat(target)).mode;
  await chmod(target, 0o000);
  try {
    return await ask();
  } finally {
    await chmod(target, mode);
  }
}

/**
 * Whether taking a read bit away actually takes the read away. It does not for
 * root, who walks through a permission bit — so the two cases that need a shut
 * file assert nothing at all under a container that runs its tests as root, and
 * say so rather than passing quietly. Every other case in this file holds for
 * any user.
 */
const SHUT_MEANS_SHUT =
  process.getuid === undefined || process.getuid() !== 0
    ? false
    : "running as root, where a permission bit shuts nothing";

/** A file put there by a hand or an agent, which is the case this module exists for. */
async function place(
  specDir: string,
  relative: string,
  text: string,
): Promise<string> {
  const target = path.join(specDir, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text, "utf8");
  return target;
}

/** A Requirement that loads: every required slot filled, nothing else said. */
function requirement(shortName: string, edges = ""): string {
  return `---
short_name: ${shortName}
name: ${shortName}
statement: The system shall do the thing.
requirement_type: functional
priority: high${edges}
---

## Description

Why it does the thing.
`;
}

function goal(shortName: string): string {
  return `---
short_name: ${shortName}
name: ${shortName}
statement: The thing is worth doing.
---
`;
}

function criterion(shortName: string): string {
  return `---
short_name: ${shortName}
name: ${shortName}
statement: The thing happened.
---

## Description

What is checked.

## Evaluation Process

Run it and look.
`;
}

function messages(problems: readonly FileProblem[]): string[] {
  return problems.map((problem) => problem.message);
}

/** The refusal a write door threw, as a kind and a sentence. */
async function refusal(
  run: () => Promise<unknown>,
): Promise<{ kind: string; message: string }> {
  try {
    await run();
  } catch (error) {
    assert.ok(isStoreRefusal(error), `not a refusal: ${String(error)}`);
    return { kind: error.kind, message: error.message };
  }
  assert.fail("expected a refusal");
}

describe("loadGraph reads a folder", () => {
  test("a folder that is not there is a graph with nothing in it", async () => {
    const specDir = await makeSpecDir();
    const graph = await loadGraph(specDir);
    assert.deepEqual(graph, { nodes: [], edges: [], problems: [] });
  });

  test("nodes come back in id order with the file's mtime for both stamps", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "Requirement/R-0002.md", requirement("second"));
    await place(specDir, "Goal/G-0001.md", goal("first"));
    const written = await place(specDir, "Requirement/R-0001.md", requirement("early"));

    const graph = await loadGraph(specDir);
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ["G-0001", "R-0001", "R-0002"],
    );
    assert.deepEqual(graph.problems, []);

    const stamp = Math.floor((await stat(written)).mtimeMs);
    const node = graph.nodes[1];
    assert.ok(node !== undefined);
    assert.equal(node.type, "Requirement");
    assert.equal(node.createdAt, stamp);
    assert.equal(node.updatedAt, stamp);
    assert.deepEqual(node.attributes, {
      statement: "The system shall do the thing.",
      description: "Why it does the thing.",
      requirement_type: "functional",
      priority: "high",
    });
  });

  test("edges come back sorted by source, then type, then target", async () => {
    const specDir = await makeSpecDir();
    await place(
      specDir,
      "Requirement/R-0002.md",
      requirement("second", "\nedges:\n  - type: MENTIONS\n    to: T-0001"),
    );
    await place(
      specDir,
      "Requirement/R-0001.md",
      requirement(
        "first",
        "\nedges:\n  - type: HAS_CRITERION\n    to: AC-0002\n  - type: HAS_CRITERION\n    to: AC-0001",
      ),
    );
    await place(specDir, "AcceptanceCriterion/AC-0001.md", criterion("one"));
    await place(specDir, "AcceptanceCriterion/AC-0002.md", criterion("two"));
    await place(
      specDir,
      "Term/T-0001.md",
      "---\nshort_name: thing\nname: Thing\n---\n\n## Definition\n\nA thing.\n",
    );

    const graph = await loadGraph(specDir);
    assert.deepEqual(messages(graph.problems), []);
    assert.deepEqual(
      graph.edges.map((edge) => edge.id),
      [
        "R-0001 HAS_CRITERION AC-0001",
        "R-0001 HAS_CRITERION AC-0002",
        "R-0002 MENTIONS T-0001",
      ],
    );
  });

  test("a file that is not markdown is passed over without a word", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "Requirement/R-0001.md", requirement("kept"));
    await place(specDir, "Requirement/README.txt", "notes to self");
    await place(specDir, "Requirement/.gitkeep", "");
    await place(specDir, "notes.txt", "not a node");

    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.problems, []);
    assert.equal(graph.nodes.length, 1);
  });
});

describe("the loader's problem matrix", () => {
  /**
   * One bad file each, every one of them the whole of what its folder holds, so
   * that the sentence under test is the only sentence there is.
   */
  const cases: readonly {
    readonly why: string;
    readonly at: string;
    readonly text: string;
    readonly sentence: string;
  }[] = [
    {
      why: "no frontmatter at all",
      at: "Requirement/R-0001.md",
      text: "# Just a heading\n",
      sentence:
        'R-0001.md does not begin with a "---" frontmatter block, so it cannot be read as a spec node.',
    },
    {
      why: "a repeated key, which is what a merge writes",
      at: "Requirement/R-0001.md",
      text: "---\nshort_name: a\nshort_name: b\n---\n",
      sentence:
        "The frontmatter is not YAML the daemon can read: Map keys must be unique.",
    },
    {
      why: "a frontmatter that is a list",
      at: "Requirement/R-0001.md",
      text: "---\n- one\n- two\n---\n",
      sentence:
        "The frontmatter is a list, not the map of keys a spec file carries.",
    },
    {
      why: "a value that is not text",
      at: "Requirement/R-0001.md",
      text: "---\nshort_name: 12\nname: n\nstatement: s\nrequirement_type: functional\npriority: high\n---\n\n## Description\n\nd\n",
      sentence: "short_name holds a number, not text. Quote the value.",
    },
    {
      why: "the id written inside the file as well as on it",
      at: "Requirement/R-0001.md",
      text: "---\nid: R-0001\nshort_name: a\nname: n\nstatement: s\nrequirement_type: functional\npriority: high\n---\n\n## Description\n\nd\n",
      sentence: "A spec file does not carry id — the filename is the id.",
    },
    {
      why: "the type written inside the file as well as on it",
      at: "Requirement/R-0001.md",
      text: "---\ntype: Requirement\nshort_name: a\nname: n\nstatement: s\nrequirement_type: functional\npriority: high\n---\n\n## Description\n\nd\n",
      sentence: "A spec file does not carry type — the folder is the type.",
    },
    {
      why: "a key this type does not carry",
      at: "Goal/G-0001.md",
      text: "---\nshort_name: a\nname: n\nstatement: s\npriority: high\n---\n",
      sentence:
        "A Goal does not carry priority. It carries statement, description, success_measure and nothing else.",
    },
    {
      why: "a prose column written in the frontmatter",
      at: "Requirement/R-0001.md",
      text: "---\nshort_name: a\nname: n\nstatement: s\ndescription: inline\nrequirement_type: functional\npriority: high\n---\n",
      sentence:
        'description is prose and lives in the body as "## Description", not in the frontmatter.',
    },
    {
      why: "an edges entry that is not a map of exactly type and to",
      at: "Requirement/R-0001.md",
      text: "---\nshort_name: a\nname: n\nstatement: s\nrequirement_type: functional\npriority: high\nedges:\n  - HAS_CRITERION AC-0001\n---\n\n## Description\n\nd\n",
      sentence: "Every entry under edges is a map of exactly type and to.",
    },
    {
      why: "a paragraph before the first section",
      at: "Requirement/R-0001.md",
      text: "---\nshort_name: a\nname: n\nstatement: s\nrequirement_type: functional\npriority: high\n---\n\nA stray thought.\n\n## Description\n\nd\n",
      sentence:
        'Body text before the first "## " section belongs to no attribute.',
    },
    {
      why: "a section this type does not carry",
      at: "Requirement/R-0001.md",
      text: "---\nshort_name: a\nname: n\nstatement: s\nrequirement_type: functional\npriority: high\n---\n\n## Description\n\nd\n\n## Notes\n\nn\n",
      sentence:
        'A Requirement does not carry "## Notes". It carries "## Description", "## Rationale" and nothing else.',
    },
    {
      why: "one section written twice",
      at: "Requirement/R-0001.md",
      text: "---\nshort_name: a\nname: n\nstatement: s\nrequirement_type: functional\npriority: high\n---\n\n## Description\n\nd\n\n## Description\n\nagain\n",
      sentence: 'The file names "## Description" twice.',
    },
    {
      why: "an id the filesystem will not carry everywhere",
      at: "Requirement/-R-0001.md",
      text: requirement("bad-name"),
      sentence:
        "An id uses letters, digits, dots, hyphens and underscores, starts with a letter or digit, and holds at most 64 characters.",
    },
    {
      why: "a name MS-DOS gave to a device",
      at: "Requirement/NUL.md",
      text: requirement("device"),
      sentence:
        "NUL is a reserved device name on Windows, so no file can be named after it. Choose another id.",
    },
    {
      why: "no short name",
      at: "Requirement/R-0001.md",
      text: "---\nname: n\nstatement: s\nrequirement_type: functional\npriority: high\n---\n\n## Description\n\nd\n",
      sentence: "A short name is required.",
    },
    {
      why: "two required slots left empty at once",
      at: "Requirement/R-0001.md",
      text: "---\nshort_name: a\nname: n\nrequirement_type: functional\npriority: high\n---\n",
      sentence: "A Requirement requires Statement, Description.",
    },
    {
      why: "a choice outside its vocabulary",
      at: "Requirement/R-0001.md",
      text: "---\nshort_name: a\nname: n\nstatement: s\nrequirement_type: functional\npriority: urgent\n---\n\n## Description\n\nd\n",
      sentence: "Priority must be one of high, medium, low.",
    },
    {
      why: "a line value holding a line break",
      at: "Requirement/R-0001.md",
      text: '---\nshort_name: a\nname: n\nstatement: "one\\ntwo"\nrequirement_type: functional\npriority: high\n---\n\n## Description\n\nd\n',
      sentence: "Statement is one line, so it cannot contain a line break.",
    },
    {
      why: "a relation from a node to itself",
      at: "Requirement/R-0001.md",
      text: requirement(
        "self",
        "\nedges:\n  - type: DEPENDS_ON\n    to: R-0001",
      ),
      sentence: "R-0001 cannot relate to itself.",
    },
    {
      why: "the same relation written twice",
      at: "Requirement/R-0001.md",
      text: requirement(
        "twice",
        "\nedges:\n  - type: HAS_CRITERION\n    to: AC-0001\n  - type: HAS_CRITERION\n    to: AC-0001",
      ),
      sentence: "R-0001 already has a HAS_CRITERION relation to AC-0001.",
    },
  ];

  for (const scenario of cases) {
    test(scenario.why, async () => {
      const specDir = await makeSpecDir();
      await place(specDir, scenario.at, scenario.text);
      const graph = await loadGraph(specDir);
      assert.deepEqual(graph.nodes, []);
      assert.deepEqual(graph.edges, []);
      assert.ok(
        messages(graph.problems).includes(scenario.sentence),
        `expected ${JSON.stringify(scenario.sentence)}, got ${JSON.stringify(messages(graph.problems))}`,
      );
      const problem = graph.problems[0];
      assert.ok(problem !== undefined);
      assert.equal(problem.file, scenario.at);
    });
  }

  test("a value over the byte cap", async () => {
    const specDir = await makeSpecDir();
    await place(
      specDir,
      "Requirement/R-0001.md",
      `---\nshort_name: a\nname: n\nstatement: s\nrequirement_type: functional\npriority: high\n---\n\n## Description\n\n${"x".repeat(TEXT_BYTE_CAP + 1)}\n`,
    );
    const graph = await loadGraph(specDir);
    assert.deepEqual(messages(graph.problems), [
      "Description cannot hold more than 256 KiB of text.",
    ]);
  });
});

describe("the loader's cross-file judgements", () => {
  test("a markdown file at the top of spec is refused, not swallowed", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "R-0001.md", requirement("misplaced"));
    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(messages(graph.problems), [
      "R-0001.md sits at the top of the spec folder, but a node file lives in the folder named after its type: <Type>/R-0001.md.",
    ]);
  });

  test("a markdown file in a folder the canon does not have is refused", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "notes/deep/R-0001.md", requirement("misfiled"));
    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(messages(graph.problems), [
      "notes is not one of the canon's node types, so notes/deep/R-0001.md is not read as a node. A node file lives in the folder named after its type.",
    ]);
  });

  test("a file moved into the wrong type folder is caught by the roster", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "Goal/R-0001.md", requirement("moved"));
    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.nodes, []);
    assert.ok(
      messages(graph.problems).includes(
        "A Goal does not carry requirement_type, priority. It carries statement, description, success_measure and nothing else.",
      ),
      JSON.stringify(messages(graph.problems)),
    );
  });

  test("the same id in two type folders refuses both files", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "Requirement/R-0001.md", requirement("one"));
    await place(specDir, "Goal/R-0001.md", goal("two"));
    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.nodes, []);
    const sentence =
      "R-0001 is the id of Goal/R-0001.md and Requirement/R-0001.md. An id names one node, so every file claiming it is left out until one of them is renamed or removed.";
    assert.deepEqual(messages(graph.problems), [sentence, sentence]);
    assert.deepEqual(
      graph.problems.map((problem) => problem.file),
      ["Goal/R-0001.md", "Requirement/R-0001.md"],
    );
  });

  test("ids that differ only in case refuse both files, across folders", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "Requirement/R-0001.md", requirement("upper"));
    await place(specDir, "Goal/r-0001.md", goal("lower"));
    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(messages(graph.problems), [
      "Goal/r-0001.md and Requirement/R-0001.md differ only in case, and two such files cannot sit side by side on every filesystem. Every one of them is left out until the names differ by more than case.",
      "Goal/r-0001.md and Requirement/R-0001.md differ only in case, and two such files cannot sit side by side on every filesystem. Every one of them is left out until the names differ by more than case.",
    ]);
  });

  test("a relation the canon does not allow refuses the whole file", async () => {
    const specDir = await makeSpecDir();
    await place(
      specDir,
      "Requirement/R-0001.md",
      requirement("wrong", "\nedges:\n  - type: HAS_CRITERION\n    to: G-0001"),
    );
    await place(specDir, "Goal/G-0001.md", goal("target"));

    const graph = await loadGraph(specDir);
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ["G-0001"],
    );
    assert.deepEqual(graph.edges, []);
    assert.deepEqual(messages(graph.problems), [
      "HAS_CRITERION is not allowed from Requirement to Goal, so R-0001 cannot relate to G-0001 that way.",
    ]);
  });

  test("a target nothing names drops that relation and keeps the node", async () => {
    const specDir = await makeSpecDir();
    await place(
      specDir,
      "Requirement/R-0001.md",
      requirement(
        "dangling",
        "\nedges:\n  - type: HAS_CRITERION\n    to: AC-0001\n  - type: MENTIONS\n    to: T-0009",
      ),
    );
    await place(specDir, "AcceptanceCriterion/AC-0001.md", criterion("kept"));

    const graph = await loadGraph(specDir);
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ["AC-0001", "R-0001"],
    );
    assert.deepEqual(
      graph.edges.map((edge) => edge.id),
      ["R-0001 HAS_CRITERION AC-0001"],
    );
    assert.deepEqual(messages(graph.problems), [
      "R-0001 has a MENTIONS relation to T-0009, and no file names T-0009. The relation is dropped and the rest of the node is kept.",
    ]);
  });

  /**
   * WHAT THE LOADER DOES WITH BYTES IT CANNOT GET AT.
   *
   * Every one of these used to reject the whole load with a raw errno: one
   * unreadable file, one shut folder, one `.md` that turned out to be a
   * directory, and the graph the person was working on disappeared behind a
   * driver-level message with no sentence and no other node. The promise in this
   * module's header — one unreadable file costs its own node and its own edges
   * and nothing else — is what these pin.
   */
  test("a .md that is really a folder is one sentence, and the rest still loads", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "Requirement/R-0001.md", requirement("kept"));
    await mkdir(path.join(specDir, "Requirement", "attachments"), {
      recursive: true,
    });
    await symlink(
      path.join(specDir, "Requirement", "attachments"),
      path.join(specDir, "Requirement", "X-0001.md"),
    );

    const graph = await loadGraph(specDir);
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ["R-0001"],
    );
    assert.deepEqual(messages(graph.problems), [
      "X-0001.md could not be read: it is a folder and not a file. Only this file is left out.",
    ]);
  });

  test("a .md that is a link to itself is one sentence, not a rejected load", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "Requirement/R-0001.md", requirement("kept"));
    // The stat is the first thing that touches a candidate, and a link pointing
    // at itself is the reachable way to make it fail on a file that is there.
    await symlink("X-0001.md", path.join(specDir, "Requirement", "X-0001.md"));

    const graph = await loadGraph(specDir);
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ["R-0001"],
    );
    assert.deepEqual(messages(graph.problems), [
      "X-0001.md could not be read: its symbolic links lead in a circle. Only this file is left out.",
    ]);
  });

  test("bytes that are not UTF-8 are refused, not mangled into a node", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "Requirement/R-0001.md", requirement("kept"));
    // A name written by a Latin-1 editor: `café` with the byte 0xE9 where the
    // two UTF-8 bytes belong. Decoded leniently it becomes U+FFFD and loads as a
    // node whose name is not the name in the file — and the first save would
    // write the replacement character down for good.
    await mkdir(path.join(specDir, "Requirement"), { recursive: true });
    await writeFile(
      path.join(specDir, "Requirement", "R-0002.md"),
      Buffer.concat([
        Buffer.from(
          "---\nshort_name: cafe\nname: caf",
          "utf8",
        ),
        Buffer.from([0xe9]),
        Buffer.from(
          " shop\nstatement: s\nrequirement_type: functional\npriority: high\n---\n\n## Description\n\nd\n",
          "utf8",
        ),
      ]),
    );

    const graph = await loadGraph(specDir);
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ["R-0001"],
    );
    assert.deepEqual(messages(graph.problems), [
      "R-0002.md could not be read: it is not valid UTF-8 text. Only this file is left out.",
    ]);
  });

  test(
    "a file whose read bit is gone costs its own node and nothing else",
    { skip: SHUT_MEANS_SHUT },
    async () => {
      const specDir = await makeSpecDir();
      await place(specDir, "Requirement/R-0001.md", requirement("kept"));
      const shut = await place(specDir, "Requirement/R-0002.md", requirement("shut"));

      const graph = await whileShut(shut, () => loadGraph(specDir));
      assert.deepEqual(
        graph.nodes.map((node) => node.id),
        ["R-0001"],
      );
      assert.deepEqual(messages(graph.problems), [
        "R-0002.md could not be read: the filesystem refused permission. Only this file is left out.",
      ]);

      // And the moment the bit comes back, so does the node: nothing about the
      // failure was cached in its place.
      const after = await loadGraph(specDir);
      assert.deepEqual(
        after.nodes.map((node) => node.id),
        ["R-0001", "R-0002"],
      );
      assert.deepEqual(after.problems, []);
    },
  );

  test(
    "a type folder that cannot be listed leaves every other folder alone",
    { skip: SHUT_MEANS_SHUT },
    async () => {
      const specDir = await makeSpecDir();
      await place(specDir, "Requirement/R-0001.md", requirement("shut"));
      await place(specDir, "Goal/G-0001.md", goal("kept"));

      const graph = await whileShut(path.join(specDir, "Requirement"), () =>
        loadGraph(specDir),
      );
      assert.deepEqual(
        graph.nodes.map((node) => node.id),
        ["G-0001"],
      );
      assert.deepEqual(messages(graph.problems), [
        "Requirement could not be listed: the filesystem refused permission. Every node file inside it is left out.",
      ]);
    },
  );

  test("a type folder that is a symbolic link is walked, not dropped in silence", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "Requirement/R-0001.md", requirement("here"));
    // A monorepo pointing one type at a folder it shares. `readdir` answers with
    // `lstat` semantics, so this used to be neither walked nor mentioned: the
    // node simply was not there, with nothing to read and nothing to fix.
    const elsewhere = path.join(path.dirname(specDir), "shared-terms");
    await mkdir(elsewhere, { recursive: true });
    await writeFile(
      path.join(elsewhere, "T-0001.md"),
      "---\nshort_name: thing\nname: Thing\n---\n\n## Definition\n\nA thing.\n",
      "utf8",
    );
    await symlink(elsewhere, path.join(specDir, "Term"));

    const graph = await loadGraph(specDir);
    assert.deepEqual(messages(graph.problems), []);
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ["R-0001", "T-0001"],
    );
  });

  test("one broken file costs only itself", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "Requirement/R-0001.md", requirement("good"));
    await place(specDir, "Requirement/R-0002.md", "not a spec file at all\n");
    await place(specDir, "Goal/G-0001.md", goal("also good"));

    const graph = await loadGraph(specDir);
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ["G-0001", "R-0001"],
    );
    assert.equal(graph.problems.length, 1);
    assert.equal(graph.problems[0]?.file, "Requirement/R-0002.md");
  });
});

describe("the cache is a shortcut and never a source", () => {
  test("an edit made outside the daemon shows up on the next read", async () => {
    const specDir = await makeSpecDir();
    const target = await place(specDir, "Goal/G-0001.md", goal("before"));

    const first = await loadGraph(specDir);
    assert.equal(first.nodes[0]?.shortName, "before");

    await writeFile(
      target,
      goal("after").replace("statement: The thing is worth doing.", "statement: Rewritten by an agent."),
      "utf8",
    );

    const second = await loadGraph(specDir);
    assert.equal(second.nodes[0]?.shortName, "after");
    assert.equal(second.nodes[0]?.attributes["statement"], "Rewritten by an agent.");
  });

  test("a file that appears and vanishes is followed both ways", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "Goal/G-0001.md", goal("stays"));
    const doomed = await place(specDir, "Goal/G-0002.md", goal("goes"));
    assert.equal((await loadGraph(specDir)).nodes.length, 2);

    await rm(doomed);
    const after = await loadGraph(specDir);
    assert.deepEqual(
      after.nodes.map((node) => node.id),
      ["G-0001"],
    );
    assert.deepEqual(after.problems, []);
  });

  /**
   * A RESTORED TIMESTAMP IS NOT AN UNCHANGED FILE. `tar -x`, `rsync -t`, `cp -p`
   * and every backup restore write the contents and then put the ARCHIVED time
   * back, so a file can arrive with new bytes under an old stamp — and at the
   * same byte length, `mtime` and `size` together say nothing happened. The
   * daemon would then serve a node the file no longer contains, permanently,
   * which is the one failure this whole pivot exists to remove.
   *
   * The stamp is forced with `utimes` rather than raced for, because the point
   * is the stat that looks unchanged and not how often one occurs. `ctime` is
   * what catches it: the filesystem writes it and userspace cannot put it back.
   * The pause is there because `ctime` moves in clock ticks like every other
   * stamp, and two writes inside one tick are genuinely the same instant.
   */
  test("a restored timestamp does not fool the cache", async () => {
    const specDir = await makeSpecDir();
    const target = await place(specDir, "Goal/G-0001.md", goal("before"));
    // A whole number of milliseconds, so that putting it back puts back exactly
    // the same stamp rather than one rounded on the way through a `Date`.
    const frozen = new Date(1_700_000_000_000);
    await utimes(target, frozen, frozen);
    const before = await stat(target);
    assert.equal((await loadGraph(specDir)).nodes[0]?.shortName, "before");

    await new Promise((resolve) => setTimeout(resolve, 50));
    await writeFile(target, goal("beforX"), "utf8");
    await utimes(target, frozen, frozen);
    const after = await stat(target);
    assert.equal(after.size, before.size);
    assert.equal(after.mtimeMs, before.mtimeMs);

    assert.equal((await loadGraph(specDir)).nodes[0]?.shortName, "beforX");
  });

  /**
   * The cache keeps the parse of a file that has not moved, and a caller that
   * wrote into the map it was handed would be writing into every later answer —
   * a graph that disagrees with the files while both of them are right.
   */
  test("what a caller is handed is a copy, not the cache itself", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "Requirement/R-0001.md", requirement("first"));
    await place(specDir, "AcceptanceCriterion/AC-0001.md", criterion("second"));
    await place(
      specDir,
      "Requirement/R-0002.md",
      requirement("third", "\nedges:\n  - type: HAS_CRITERION\n    to: AC-0001"),
    );

    const priorityOf = (graph: { nodes: readonly { id: string; attributes: Record<string, string> }[] }) =>
      graph.nodes.find((node) => node.id === "R-0001")?.attributes["priority"];

    const first = await loadGraph(specDir);
    const node = first.nodes.find((entry) => entry.id === "R-0001");
    const edge = first.edges[0];
    assert.ok(node !== undefined && edge !== undefined);
    node.attributes["priority"] = "poisoned";
    edge.toId = "poisoned";

    const second = await loadGraph(specDir);
    assert.equal(priorityOf(second), "high");
    assert.equal(second.edges[0]?.toId, "AC-0001");
  });
});

describe("the write doors", () => {
  const values = {
    shortName: "checkout",
    name: "Checkout works",
    attributes: {
      statement: "The system shall check out.",
      description: "Because a cart is not an order.",
      requirement_type: "functional",
      priority: "high",
    },
  };

  test("a created node is a canonical file the loader reads back", async () => {
    const specDir = await makeSpecDir();
    const node = await createNodeFile(specDir, "Requirement", "R-0001", values);
    assert.equal(node.id, "R-0001");
    assert.equal(node.type, "Requirement");
    assert.equal(node.createdAt, node.updatedAt);

    const text = await readFile(path.join(specDir, "Requirement/R-0001.md"), "utf8");
    assert.equal(
      text,
      `---
short_name: checkout
name: Checkout works
statement: The system shall check out.
requirement_type: functional
priority: high
---

## Description

Because a cart is not an order.
`,
    );
    assert.ok(isCanonical("Requirement", "R-0001.md", text));

    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.problems, []);
    assert.deepEqual(graph.nodes[0], node);
  });

  test("the values are trimmed on the way in, so the file is canonical", async () => {
    const specDir = await makeSpecDir();
    await createNodeFile(specDir, "Requirement", "R-0001", {
      ...values,
      shortName: "  checkout  ",
      attributes: { ...values.attributes, description: "\n\nBecause a cart is not an order.\n\n" },
    });
    const text = await readFile(path.join(specDir, "Requirement/R-0001.md"), "utf8");
    assert.ok(text.includes("short_name: checkout\n"));
    assert.ok(isCanonical("Requirement", "R-0001.md", text));
  });

  test("an unknown type, a bad id and a missing slot are each refused by name", async () => {
    const specDir = await makeSpecDir();
    assert.deepEqual(
      await refusal(() => createNodeFile(specDir, "Widget", "W-0001", values)),
      { kind: "invalid", message: "Unknown node type: Widget" },
    );
    assert.deepEqual(
      await refusal(() => createNodeFile(specDir, "Requirement", "-R-1", values)),
      {
        kind: "invalid",
        message:
          "An id uses letters, digits, dots, hyphens and underscores, starts with a letter or digit, and holds at most 64 characters.",
      },
    );
    assert.deepEqual(
      await refusal(() =>
        createNodeFile(specDir, "Requirement", "R-0001", {
          ...values,
          attributes: { ...values.attributes, description: "" },
        }),
      ),
      { kind: "invalid", message: "A Requirement requires Description." },
    );
    assert.deepEqual(
      await refusal(() =>
        createNodeFile(specDir, "Requirement", "R-0001", { ...values, name: "  " }),
      ),
      { kind: "invalid", message: "A name is required." },
    );
    assert.deepEqual(await readdir(specDir).catch(() => []), []);
  });

  test("an id already taken, and an id taken but for its case", async () => {
    const specDir = await makeSpecDir();
    await createNodeFile(specDir, "Requirement", "R-0001", values);

    assert.deepEqual(
      await refusal(() => createNodeFile(specDir, "Requirement", "R-0001", values)),
      {
        kind: "conflict",
        message: "R-0001 is already used by another node. Choose another id.",
      },
    );
    assert.deepEqual(
      await refusal(() =>
        createNodeFile(specDir, "Goal", "r-0001", {
          shortName: "other",
          name: "Other",
          attributes: { statement: "Anything." },
        }),
      ),
      {
        kind: "conflict",
        message:
          "r-0001 differs only in case from R-0001, and two such files cannot sit side by side on every filesystem. Choose another id.",
      },
    );
  });

  test("an update keeps the relations the edit never mentioned", async () => {
    const specDir = await makeSpecDir();
    await createNodeFile(specDir, "Requirement", "R-0001", values);
    await createNodeFile(specDir, "AcceptanceCriterion", "AC-0001", {
      shortName: "ac",
      name: "It happened",
      attributes: {
        statement: "The thing happened.",
        description: "What is checked.",
        evaluation_process: "Run it and look.",
      },
    });
    await addEdge(specDir, { fromId: "R-0001", type: "HAS_CRITERION", toId: "AC-0001" });

    const updated = await updateNodeFile(specDir, "R-0001", {
      ...values,
      name: "Checkout still works",
    });
    assert.equal(updated.name, "Checkout still works");

    const graph = await loadGraph(specDir);
    assert.deepEqual(messages(graph.problems), []);
    assert.deepEqual(
      graph.edges.map((edge) => edge.id),
      ["R-0001 HAS_CRITERION AC-0001"],
    );
  });

  test("a node that is not there is said so, at every door that names one", async () => {
    const specDir = await makeSpecDir();
    await createNodeFile(specDir, "Requirement", "R-0001", values);

    assert.deepEqual(await refusal(() => updateNodeFile(specDir, "R-0009", values)), {
      kind: "missing",
      message: "Unknown node: R-0009",
    });
    assert.deepEqual(await refusal(() => deleteNodeFile(specDir, "R-0009")), {
      kind: "missing",
      message: "Unknown node: R-0009",
    });
    assert.deepEqual(
      await refusal(() =>
        addEdge(specDir, { fromId: "R-0001", type: "MENTIONS", toId: "T-0009" }),
      ),
      { kind: "missing", message: "Unknown node: T-0009" },
    );
    assert.deepEqual(
      await refusal(() => removeEdge(specDir, "R-0001 MENTIONS T-0009")),
      { kind: "missing", message: "Unknown edge: R-0001 MENTIONS T-0009" },
    );
    assert.deepEqual(await refusal(() => removeEdge(specDir, "nonsense")), {
      kind: "missing",
      message: "Unknown edge: nonsense",
    });
  });

  test("a write over a file somebody broke is refused with that file's sentence", async () => {
    const specDir = await makeSpecDir();
    await createNodeFile(specDir, "Requirement", "R-0001", values);
    await place(
      specDir,
      "Requirement/R-0001.md",
      "---\nshort_name: a\nname: n\nrequirement_type: functional\npriority: high\n---\n",
    );

    const refused = await refusal(() => updateNodeFile(specDir, "R-0001", values));
    assert.equal(refused.kind, "conflict");
    assert.equal(
      refused.message,
      "Requirement/R-0001.md has been edited into a state Shall cannot read — A Requirement requires Statement, Description. Nothing was written, so that edit is still there to fix.",
    );
    // The broken edit is still on disk, which is the whole point of refusing.
    const text = await readFile(path.join(specDir, "Requirement/R-0001.md"), "utf8");
    assert.ok(text.includes("short_name: a"));
  });

  test("a write over a file nobody can read is refused, not performed", async () => {
    const specDir = await makeSpecDir();
    await createNodeFile(specDir, "Requirement", "R-0001", values);
    // Somebody's editor saved it in Latin-1. The bytes are not text, so there is
    // no reading of them to carry the relations over from, and a save would
    // write the file's own contents away.
    const target = path.join(specDir, "Requirement", "R-0001.md");
    const held = await readFile(target);
    await writeFile(
      target,
      Buffer.concat([held, Buffer.from([0xe9])]),
    );

    const refused = await refusal(() => updateNodeFile(specDir, "R-0001", values));
    assert.deepEqual(refused, {
      kind: "conflict",
      message:
        "Requirement/R-0001.md could not be read: it is not valid UTF-8 text. Nothing was written.",
    });
    assert.equal((await readFile(target)).length, held.length + 1);
  });

  test(
    "a door will not write while a folder it cannot see is shut",
    { skip: SHUT_MEANS_SHUT },
    async () => {
      const specDir = await makeSpecDir();
      await createNodeFile(specDir, "Requirement", "R-0001", values);
      await createNodeFile(specDir, "Goal", "G-0001", {
        shortName: "g",
        name: "G",
        attributes: { statement: "s" },
      });

      // A READ carries on past a shut folder and says so; a WRITE may not,
      // because every door decides something from the listing — whether an id
      // is taken, which file a bare id names — and a listing with a hole in it
      // answers wrongly rather than not at all. Believed, it would write a
      // second R-0001 and cost both files at the next load.
      const refused = await whileShut(path.join(specDir, "Requirement"), () =>
        refusal(() => createNodeFile(specDir, "Requirement", "R-0001", values)),
      );
      assert.deepEqual(refused, {
        kind: "conflict",
        message:
          "Requirement could not be listed: the filesystem refused permission. Nothing was written, because Shall cannot tell what this project holds while one of its folders is shut.",
      });
      // And the read still answers, with the folder it could open.
      const graph = await loadGraph(specDir);
      assert.deepEqual(
        graph.nodes.map((node) => node.id),
        ["G-0001", "R-0001"],
      );
    },
  );

  test("a spec folder that is really a file is refused in words", async () => {
    const specDir = await makeSpecDir();
    await mkdir(path.dirname(specDir), { recursive: true });
    await writeFile(specDir, "not a folder at all\n", "utf8");

    // The loader reads such a path as an empty graph rather than as a failure,
    // so the create door must answer in the same voice instead of handing the
    // panel an errno it has no slot for.
    assert.deepEqual(
      await refusal(() => createNodeFile(specDir, "Requirement", "R-0001", values)),
      {
        kind: "conflict",
        message:
          "Requirement/R-0001.md could not be written: something along its path is a file and not a folder.",
      },
    );
  });

  test("a relation written twice is refused, and a relation to oneself as well", async () => {
    const specDir = await makeSpecDir();
    await createNodeFile(specDir, "Requirement", "R-0001", values);
    await createNodeFile(specDir, "Requirement", "R-0002", values);
    const edge = await addEdge(specDir, {
      fromId: "R-0001",
      type: "DEPENDS_ON",
      toId: "R-0002",
    });
    assert.equal(edge.id, "R-0001 DEPENDS_ON R-0002");

    assert.deepEqual(
      await refusal(() =>
        addEdge(specDir, { fromId: "R-0001", type: "DEPENDS_ON", toId: "R-0002" }),
      ),
      {
        kind: "conflict",
        message: "R-0001 already has a DEPENDS_ON relation to R-0002.",
      },
    );
    assert.deepEqual(
      await refusal(() =>
        addEdge(specDir, { fromId: "R-0001", type: "DEPENDS_ON", toId: "R-0001" }),
      ),
      { kind: "invalid", message: "R-0001 cannot relate to itself." },
    );

    await removeEdge(specDir, edge.id);
    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.edges, []);
    assert.deepEqual(graph.problems, []);
  });
});

describe("deleting a node takes its relations with it", () => {
  test("the referrers are rewritten first and the folder loads clean after", async () => {
    const specDir = await makeSpecDir();
    const requirementValues = {
      shortName: "r",
      name: "R",
      attributes: {
        statement: "s",
        description: "d",
        requirement_type: "functional",
        priority: "high",
      },
    };
    await createNodeFile(specDir, "Requirement", "R-0001", requirementValues);
    await createNodeFile(specDir, "Requirement", "R-0002", requirementValues);
    await createNodeFile(specDir, "AcceptanceCriterion", "AC-0001", {
      shortName: "ac",
      name: "AC",
      attributes: { statement: "s", description: "d", evaluation_process: "e" },
    });
    await addEdge(specDir, { fromId: "R-0001", type: "HAS_CRITERION", toId: "AC-0001" });
    await addEdge(specDir, { fromId: "R-0002", type: "HAS_CRITERION", toId: "AC-0001" });
    await addEdge(specDir, { fromId: "R-0001", type: "DEPENDS_ON", toId: "R-0002" });

    await deleteNodeFile(specDir, "AC-0001");

    const graph = await loadGraph(specDir);
    assert.deepEqual(messages(graph.problems), []);
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ["R-0001", "R-0002"],
    );
    assert.deepEqual(
      graph.edges.map((edge) => edge.id),
      ["R-0001 DEPENDS_ON R-0002"],
    );
    // The emptied node's own file is gone, and so is the folder's only mention
    // of it — a rewritten referrer carries no `edges:` key it does not need.
    const text = await readFile(path.join(specDir, "Requirement/R-0002.md"), "utf8");
    assert.ok(!text.includes("edges:"), text);
    assert.ok(isCanonical("Requirement", "R-0002.md", text));
  });

  test("a referrer nobody can read is left alone, and its reference drops at load", async () => {
    const specDir = await makeSpecDir();
    await createNodeFile(specDir, "Goal", "G-0001", {
      shortName: "g",
      name: "G",
      attributes: { statement: "s" },
    });
    await createNodeFile(specDir, "Question", "Q-0001", {
      shortName: "q",
      name: "Q",
      attributes: { question: "why?", description: "d", state: "open" },
    });
    await addEdge(specDir, { fromId: "G-0001", type: "RAISES", toId: "Q-0001" });

    // Somebody is mid-edit on the referrer when the target is deleted.
    const broken = "---\nshort_name: g\nname: G\nedges:\n  - type: RAISES\n    to: Q-0001\n---\n";
    await place(specDir, "Goal/G-0001.md", broken);

    await deleteNodeFile(specDir, "Q-0001");
    assert.equal(
      await readFile(path.join(specDir, "Goal/G-0001.md"), "utf8"),
      broken,
    );

    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(messages(graph.problems), ["A Goal requires Statement."]);
  });

  /**
   * A REFERRER THAT CANNOT BE READ IS SKIPPED, NEVER THROWN OVER. The cascade
   * used to abort part-way with a raw errno: one referrer already rewritten, the
   * node still on disk, and the caller told the delete failed while a relation
   * had in fact been destroyed — and the retry failing the same way. Skipping is
   * what it already does with a referrer that will not parse, and the load-time
   * dangling drop is the backstop under both.
   */
  test("a referrer whose bytes are not text does not stop the cascade", async () => {
    const specDir = await makeSpecDir();
    const requirementValues = {
      shortName: "r",
      name: "R",
      attributes: {
        statement: "s",
        description: "d",
        requirement_type: "functional",
        priority: "high",
      },
    };
    await createNodeFile(specDir, "AcceptanceCriterion", "AC-0001", {
      shortName: "ac",
      name: "AC",
      attributes: { statement: "s", description: "d", evaluation_process: "e" },
    });
    for (const id of ["R-0001", "R-0002", "R-0003"]) {
      await createNodeFile(specDir, "Requirement", id, requirementValues);
      await addEdge(specDir, {
        fromId: id,
        type: "HAS_CRITERION",
        toId: "AC-0001",
      });
    }
    const middle = path.join(specDir, "Requirement", "R-0002.md");
    await writeFile(
      middle,
      Buffer.concat([await readFile(middle), Buffer.from([0xe9])]),
    );

    await deleteNodeFile(specDir, "AC-0001");

    // The two readable referrers lost the relation and the file is gone, which
    // is the whole of what was asked for.
    assert.equal(
      (await readFile(path.join(specDir, "Requirement", "R-0001.md"), "utf8")).includes(
        "AC-0001",
      ),
      false,
    );
    assert.equal(
      (await readFile(path.join(specDir, "Requirement", "R-0003.md"), "utf8")).includes(
        "AC-0001",
      ),
      false,
    );
    assert.deepEqual(await readdir(path.join(specDir, "AcceptanceCriterion")), []);

    const graph = await loadGraph(specDir);
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ["R-0001", "R-0003"],
    );
    assert.deepEqual(messages(graph.problems), [
      "R-0002.md could not be read: it is not valid UTF-8 text. Only this file is left out.",
    ]);
  });

  test(
    "a referrer nobody may open does not stop the cascade either",
    { skip: SHUT_MEANS_SHUT },
    async () => {
      const specDir = await makeSpecDir();
      await createNodeFile(specDir, "Goal", "G-0001", {
        shortName: "g",
        name: "G",
        attributes: { statement: "s" },
      });
      await createNodeFile(specDir, "Goal", "G-0002", {
        shortName: "g2",
        name: "G2",
        attributes: { statement: "s" },
      });
      await createNodeFile(specDir, "Question", "Q-0001", {
        shortName: "q",
        name: "Q",
        attributes: { question: "why?", description: "d", state: "open" },
      });
      await addEdge(specDir, { fromId: "G-0001", type: "RAISES", toId: "Q-0001" });
      await addEdge(specDir, { fromId: "G-0002", type: "RAISES", toId: "Q-0001" });

      await whileShut(path.join(specDir, "Goal", "G-0001.md"), () =>
        deleteNodeFile(specDir, "Q-0001"),
      );

      assert.deepEqual(await readdir(path.join(specDir, "Question")), []);
      assert.equal(
        (await readFile(path.join(specDir, "Goal", "G-0002.md"), "utf8")).includes(
          "Q-0001",
        ),
        false,
      );
      // The one that could not be opened kept its line, and the loader says so
      // and drops the relation rather than the node.
      const graph = await loadGraph(specDir);
      assert.deepEqual(
        graph.nodes.map((node) => node.id),
        ["G-0001", "G-0002"],
      );
      assert.deepEqual(messages(graph.problems), [
        "G-0001 has a RAISES relation to Q-0001, and no file names Q-0001. The relation is dropped and the rest of the node is kept.",
      ]);
    },
  );
});

describe("writes go through the queue one at a time", () => {
  test("every parallel effect survives, every file is canonical, no .tmp is left", async () => {
    const specDir = await makeSpecDir();
    const count = 12;

    await Promise.all(
      Array.from({ length: count }, (_unused, index) =>
        createNodeFile(specDir, "Requirement", `R-${String(index).padStart(4, "0")}`, {
          shortName: `r${index}`,
          name: `Requirement ${index}`,
          attributes: {
            statement: `The system shall do thing ${index}.`,
            description: `Reason ${index}.`,
            requirement_type: "functional",
            priority: "high",
          },
        }),
      ),
    );

    // Every one of these reads R-0000's file and writes it back. Without the
    // queue the last writer would win and the graph would hold one relation.
    await Promise.all(
      Array.from({ length: count - 1 }, (_unused, index) =>
        addEdge(specDir, {
          fromId: "R-0000",
          type: "DEPENDS_ON",
          toId: `R-${String(index + 1).padStart(4, "0")}`,
        }),
      ),
    );

    const graph = await loadGraph(specDir);
    assert.deepEqual(messages(graph.problems), []);
    assert.equal(graph.nodes.length, count);
    assert.equal(graph.edges.length, count - 1);

    const entries = await readdir(path.join(specDir, "Requirement"));
    assert.deepEqual(
      entries.filter((entry) => !entry.endsWith(".md")),
      [],
    );
    for (const entry of entries) {
      const text = await readFile(path.join(specDir, "Requirement", entry), "utf8");
      assert.ok(
        isCanonical("Requirement", entry, text),
        `${entry} is not canonical:\n${text}`,
      );
    }
  });

  test("a refused write does not stop the writes behind it", async () => {
    const specDir = await makeSpecDir();
    const attributes = { statement: "s" };
    const settled = await Promise.allSettled([
      createNodeFile(specDir, "Goal", "G-0001", { shortName: "a", name: "A", attributes }),
      createNodeFile(specDir, "Goal", "G-0001", { shortName: "b", name: "B", attributes }),
      createNodeFile(specDir, "Goal", "G-0002", { shortName: "c", name: "C", attributes }),
    ]);
    assert.deepEqual(
      settled.map((result) => result.status),
      ["fulfilled", "rejected", "fulfilled"],
    );

    const graph = await loadGraph(specDir);
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ["G-0001", "G-0002"],
    );
  });
});
