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
import { emitScaffold, isCanonical } from "../serialize/index.js";
import {
  addEdge,
  createNodeFile,
  deleteNodeFile,
  isStoreRefusal,
  loadGraph,
  removeEdge,
  scaffoldNodeFile,
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

/**
 * A Requirement that loads: the two names above the fence, and the
 * specification itself below it as the one markdown document it is. The
 * headings are the ones this type's template suggests, which is a starting
 * shape and never a rule — nothing in the loader reads them.
 */
function requirement(shortName: string, edges = ""): string {
  return `---
short_name: ${shortName}
name: ${shortName}${edges}
---

## Statement

The system shall do the thing.

## Description

Why it does the thing.
`;
}

/** What the fixture above says, as the node holds it: the body, whole and settled. */
const REQUIREMENT_BODY =
  "## Statement\n\nThe system shall do the thing.\n\n## Description\n\nWhy it does the thing.";

function goal(shortName: string): string {
  return `---
short_name: ${shortName}
name: ${shortName}
---

## Statement

The thing is worth doing.
`;
}

function criterion(shortName: string): string {
  return `---
short_name: ${shortName}
name: ${shortName}
---

## Statement

The thing happened.

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
    assert.deepEqual(graph, { nodes: [], edges: [], problems: [], refused: [] });
  });

  test("nodes come back in id order with the file's mtime for both stamps", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "intent/Requirement/R-0002.md", requirement("second"));
    await place(specDir, "intent/Goal/G-0001.md", goal("first"));
    const written = await place(specDir, "intent/Requirement/R-0001.md", requirement("early"));

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
    assert.equal(node.shortName, "early");
    assert.equal(node.createdAt, stamp);
    assert.equal(node.updatedAt, stamp);
    // The whole of what sits under the fence, byte for byte, with only the
    // blank lines at its edges settled away.
    assert.equal(node.body, REQUIREMENT_BODY);
  });

  test("edges come back sorted by source, then type, then target", async () => {
    const specDir = await makeSpecDir();
    await place(
      specDir,
      "intent/Requirement/R-0002.md",
      requirement("second", "\nedges:\n  - type: MENTIONS\n    to: T-0001"),
    );
    await place(
      specDir,
      "intent/Requirement/R-0001.md",
      requirement(
        "first",
        "\nedges:\n  - type: HAS_CRITERION\n    to: AC-0002\n  - type: HAS_CRITERION\n    to: AC-0001",
      ),
    );
    await place(specDir, "intent/AcceptanceCriterion/AC-0001.md", criterion("one"));
    await place(specDir, "intent/AcceptanceCriterion/AC-0002.md", criterion("two"));
    await place(
      specDir,
      "domain/Term/T-0001.md",
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
    await place(specDir, "intent/Requirement/R-0001.md", requirement("kept"));
    await place(specDir, "intent/Requirement/README.txt", "notes to self");
    await place(specDir, "intent/Requirement/.gitkeep", "");
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
      at: "intent/Requirement/R-0001.md",
      text: "# Just a heading\n",
      sentence:
        'R-0001.md does not begin with a "---" frontmatter block, so it cannot be read as a spec node.',
    },
    {
      why: "a repeated key, which is what a merge writes",
      at: "intent/Requirement/R-0001.md",
      text: "---\nshort_name: a\nshort_name: b\n---\n",
      sentence:
        "The frontmatter is not YAML the daemon can read: Map keys must be unique.",
    },
    {
      why: "a frontmatter that is a list",
      at: "intent/Requirement/R-0001.md",
      text: "---\n- one\n- two\n---\n",
      sentence:
        "The frontmatter is a list, not the map of keys a spec file carries.",
    },
    {
      why: "a value that is not text",
      at: "intent/Requirement/R-0001.md",
      text: "---\nshort_name: 12\nname: n\n---\n\n## Statement\n\ns\n",
      sentence: "short_name holds a number, not text. Quote the value.",
    },
    {
      why: "the id written inside the file as well as on it",
      at: "intent/Requirement/R-0001.md",
      text: "---\nid: R-0001\nshort_name: a\nname: n\n---\n\n## Statement\n\ns\n",
      sentence: "A spec file does not carry id — the filename is the id.",
    },
    {
      why: "the type written inside the file as well as on it",
      at: "intent/Requirement/R-0001.md",
      text: "---\ntype: Requirement\nshort_name: a\nname: n\n---\n\n## Statement\n\ns\n",
      sentence: "A spec file does not carry type — the folder is the type.",
    },
    {
      // The frontmatter holds the graph's three facts and the body holds
      // everything else, so a key that is neither is not a key with a wrong
      // value — it is prose written above the fence instead of below it.
      why: "a key the frontmatter does not carry",
      at: "intent/Requirement/R-0001.md",
      text: "---\nshort_name: a\nname: n\npriority: high\n---\n\n## Statement\n\ns\n",
      sentence:
        "The frontmatter carries short_name, name and edges and nothing else — priority belongs in the body, below the closing fence.",
    },
    {
      // Said once as one list, because it is one rule: two sentences about two
      // keys would read as two rules.
      why: "several keys the frontmatter does not carry",
      at: "intent/Requirement/R-0001.md",
      text: "---\nshort_name: a\nname: n\nstatement: s\npriority: high\n---\n",
      sentence:
        "The frontmatter carries short_name, name and edges and nothing else — statement and priority belong in the body, below the closing fence.",
    },
    {
      why: "an edges entry that is not a map of exactly type and to",
      at: "intent/Requirement/R-0001.md",
      text: "---\nshort_name: a\nname: n\nedges:\n  - HAS_CRITERION AC-0001\n---\n\n## Statement\n\ns\n",
      sentence: "Every entry under edges is a map of exactly type and to.",
    },
    {
      why: "an id the filesystem will not carry everywhere",
      at: "intent/Requirement/-R-0001.md",
      text: requirement("bad-name"),
      sentence:
        "An id uses letters, digits, dots, hyphens and underscores, starts with a letter or digit, and holds at most 64 characters.",
    },
    {
      why: "a name MS-DOS gave to a device",
      at: "intent/Requirement/NUL.md",
      text: requirement("device"),
      sentence:
        "NUL is a reserved device name on Windows, so no file can be named after it. Choose another id.",
    },
    {
      why: "no short name",
      at: "intent/Requirement/R-0001.md",
      text: "---\nname: n\n---\n\n## Statement\n\ns\n",
      sentence: "A short name is required.",
    },
    {
      why: "a name holding a line break",
      at: "intent/Requirement/R-0001.md",
      text: '---\nshort_name: a\nname: "one\\ntwo"\n---\n\n## Statement\n\ns\n',
      sentence: "A name cannot contain a control character.",
    },
    {
      // The body is free markdown and the loader has no opinion about its
      // shape. What it still owes its readers is a file git will diff: a NUL
      // makes it binary, and the diff, the merge and the review go with it.
      why: "a byte the body cannot carry",
      at: "intent/Requirement/R-0001.md",
      text: "---\nshort_name: a\nname: n\n---\n\n## Statement\n\nA statement with a \u0000 in it.\n",
      sentence: "The specification cannot contain a NUL character.",
    },
    {
      why: "a relation from a node to itself",
      at: "intent/Requirement/R-0001.md",
      text: requirement(
        "self",
        "\nedges:\n  - type: DEPENDS_ON\n    to: R-0001",
      ),
      sentence: "R-0001 cannot relate to itself.",
    },
    {
      why: "the same relation written twice",
      at: "intent/Requirement/R-0001.md",
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

  test("a body over the byte cap", async () => {
    const specDir = await makeSpecDir();
    await place(
      specDir,
      "intent/Requirement/R-0001.md",
      `---\nshort_name: a\nname: n\n---\n\n## Statement\n\n${"x".repeat(TEXT_BYTE_CAP + 1)}\n`,
    );
    const graph = await loadGraph(specDir);
    assert.deepEqual(messages(graph.problems), [
      "The specification cannot hold more than 256 KiB of text.",
    ]);
  });
});

describe("the body is the author's, whatever shape it is", () => {
  /**
   * EVERY ONE OF THESE USED TO BE A REFUSAL. The body was read as a list of
   * "## " sections judged against a roster, so a paragraph before the first
   * heading belonged to no attribute, a heading the type did not carry was
   * refused by name, and one written twice was refused as a duplicate. The body
   * is one markdown document now and nothing reads its shape, so all three are
   * simply text — and what these pin is that the text comes back exactly as it
   * was written.
   */
  const shapes: readonly { readonly why: string; readonly body: string }[] = [
    {
      why: "a paragraph before the first heading",
      body: "A stray thought.\n\n## Statement\n\ns",
    },
    {
      why: "a heading no template suggests",
      body: "## Statement\n\ns\n\n## Notes\n\nn",
    },
    {
      why: "one heading written twice",
      body: "## Description\n\nd\n\n## Description\n\nagain",
    },
    {
      // The line that opens and closes the frontmatter, written in the body
      // where it is a horizontal rule and nothing else: the closing fence is
      // the FIRST one after the top of the file, so everything past it is prose.
      why: "a horizontal rule, which is the frontmatter's fence too",
      body: "## Statement\n\ns\n\n---\n\nAfter the rule.",
    },
    {
      why: "a fenced block that reads like frontmatter",
      body: "## Statement\n\n```yaml\nshort_name: not a key down here\n```",
    },
    {
      // A whole-value trim would take the four spaces off the FIRST line only
      // and leave a paragraph with two indented lines hanging off it. Blank
      // lines are dropped whole instead, so the indentation survives.
      why: "an indented code block, whose indentation a trim would eat",
      body: "## Steps\n\n    step one\n    step two",
    },
  ];

  for (const shape of shapes) {
    test(shape.why, async () => {
      const specDir = await makeSpecDir();
      await place(
        specDir,
        "intent/Requirement/R-0001.md",
        `---\nshort_name: a\nname: n\n---\n\n${shape.body}\n`,
      );
      const graph = await loadGraph(specDir);
      assert.deepEqual(messages(graph.problems), []);
      assert.equal(graph.nodes[0]?.body, shape.body);
    });
  }

  test("a body with nothing in it is a node with nothing to say yet", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "domain/Term/T-0001.md", "---\nshort_name: thing\nname: Thing\n---\n");
    const graph = await loadGraph(specDir);
    assert.deepEqual(messages(graph.problems), []);
    assert.equal(graph.nodes[0]?.body, "");
  });
});

/**
 * A NODE FILE LIVES AT `spec/<band>/<Type>/<id>.md` AND NOWHERE ELSE, and every
 * other place a person or an agent might put one is answered by name rather
 * than passed over. Silence is the worst answer available here: somebody who
 * wrote a node one folder too high would watch it simply not appear, with
 * nothing to read and nothing to fix.
 *
 * THE SENTENCE IS PITCHED AT THE FIX. A whole type folder in the wrong place is
 * one `git mv` and gets ONE sentence naming the move, not one sentence per file
 * inside it; a single stray `.md` gets the path it should have had.
 */
describe("a node file has one place, and every other place is a sentence", () => {
  test("a markdown file at the top of spec is refused, not swallowed", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "R-0001.md", requirement("misplaced"));
    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(messages(graph.problems), [
      "R-0001.md sits at the top of the spec folder, but a node file lives at <band>/<Type>/R-0001.md.",
    ]);
    assert.equal(graph.problems[0]?.file, "R-0001.md");
  });

  /**
   * One drawer down and still not home: the band is right and the type folder
   * is missing, so the sentence has a band to name and says the rest.
   */
  test("a markdown file loose in a band folder is refused as well", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "intent/R-0001.md", requirement("nearly"));
    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(messages(graph.problems), [
      "intent/R-0001.md sits outside a type folder, but a node file lives in the folder named after its type: intent/<Type>/R-0001.md.",
    ]);
    assert.equal(graph.problems[0]?.file, "intent/R-0001.md");
  });

  /**
   * THE OLD FLAT LAYOUT, MET BY NAME. Every spec written before the bands moved
   * in has its type folders at the top of `spec/`, and each one is a single
   * `git mv` from reading again — so the answer is one sentence per FOLDER
   * naming its band home, and not one per file inside it.
   */
  test("a type folder at the top of spec is the old layout, named once", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "Requirement/R-0001.md", requirement("old"));
    await place(specDir, "Requirement/R-0002.md", requirement("older"));
    await place(specDir, "intent/Goal/G-0001.md", goal("already moved"));

    const graph = await loadGraph(specDir);
    // The nodes in the stranded folder are left out whole, and the folder that
    // did move loads beside them without a word.
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ["G-0001"],
    );
    assert.deepEqual(messages(graph.problems), [
      "Requirement sits at the top of the spec folder, but a type folder lives inside its band: intent/Requirement. Every node file inside it is left out until the folder moves.",
    ]);
    assert.equal(graph.problems[0]?.file, "Requirement");
  });

  /** A folder filed under the wrong drawer is real work, and the sentence says which drawer. */
  test("a type folder under the wrong band is named, not walked", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "plan/Requirement/R-0001.md", requirement("misbanded"));
    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(messages(graph.problems), [
      "plan/Requirement is a Requirement folder in the wrong band — a Requirement lives in intent/Requirement. Every node file inside it is left out until the folder moves.",
    ]);
    assert.equal(graph.problems[0]?.file, "plan/Requirement");
  });

  /**
   * A WRITE REFUSES WHILE A FOLDER IS STRANDED. Its files never become
   * candidates, so the ids they claim are invisible to the taken-id check and
   * to the scaffold's suggestion — and an id handed out now would collide with
   * one of them the moment the folder moves to where its own sentence points.
   * The same principle as a shut folder, self-inflicted; a read carries on and
   * says so, which is how the person finds out what to move.
   */
  test("a stranded type folder stops the write doors, in one sentence", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "Requirement/R-0001.md", requirement("stranded"));
    const sentence =
      "Requirement is a type folder out of its place, and the ids inside it cannot be counted. Nothing was written — the read side names the folder's home, and the write is safe once it moves.";
    assert.deepEqual(
      await refusal(() =>
        createNodeFile(specDir, "Requirement", "R-0002", {
          shortName: "fresh",
          name: "fresh",
          body: "",
        }),
      ),
      { kind: "conflict", message: sentence },
    );
    assert.deepEqual(
      await refusal(() => scaffoldNodeFile(specDir, "Requirement")),
      { kind: "conflict", message: sentence },
    );
  });

  /**
   * A STRAY FOLDER'S REASON DEPENDS ON HOW DEEP IT IS, and the two clauses are
   * different facts: at the top the folder is not one of the four bands, and
   * inside a band it is not one of the canon's types. Either way the walk goes
   * all the way down, because the file nobody would otherwise find is exactly
   * the one three folders deep.
   */
  test("a folder at the top that is not a band says which four there are", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "notes/deep/R-0001.md", requirement("misfiled"));
    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(messages(graph.problems), [
      "notes is not one of spec's four band folders (domain, intent, plan, execution), so notes/deep/R-0001.md is not read as a node. A node file lives at <band>/<Type>/<id>.md.",
    ]);
    assert.equal(graph.problems[0]?.file, "notes/deep/R-0001.md");
  });

  test("a folder inside a band that is not a type says that instead", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "intent/notes/deep/R-0001.md", requirement("misfiled"));
    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(messages(graph.problems), [
      "intent/notes is not one of the canon's node types, so intent/notes/deep/R-0001.md is not read as a node. A node file lives at <band>/<Type>/<id>.md.",
    ]);
    assert.equal(graph.problems[0]?.file, "intent/notes/deep/R-0001.md");
  });
});

describe("the loader's cross-file judgements", () => {
  /**
   * THE FOLDER IS THE TYPE, AND IT IS THE WHOLE OF THE TYPE. A file dragged
   * into another type's folder used to be caught by the roster, which knew
   * which keys a Goal carries and which a Requirement does. Nothing knows that
   * now — the body is free markdown — so the file is a Goal whose prose happens
   * to read like a requirement, which is exactly what its path says it is.
   */
  test("a file in another type folder is a node of that type", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "intent/Goal/R-0001.md", requirement("moved"));
    const graph = await loadGraph(specDir);
    assert.deepEqual(messages(graph.problems), []);
    const node = graph.nodes[0];
    assert.ok(node !== undefined);
    assert.equal(node.type, "Goal");
    assert.equal(node.body, REQUIREMENT_BODY);
  });

  test("the same id in two type folders refuses both files", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "intent/Requirement/R-0001.md", requirement("one"));
    await place(specDir, "intent/Goal/R-0001.md", goal("two"));
    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.nodes, []);
    const sentence =
      "R-0001 is the id of intent/Goal/R-0001.md and intent/Requirement/R-0001.md. An id names one node, so every file claiming it is left out until one of them is renamed or removed.";
    assert.deepEqual(messages(graph.problems), [sentence, sentence]);
    assert.deepEqual(
      graph.problems.map((problem) => problem.file),
      ["intent/Goal/R-0001.md", "intent/Requirement/R-0001.md"],
    );
  });

  test("ids that differ only in case refuse both files, across folders", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "intent/Requirement/R-0001.md", requirement("upper"));
    await place(specDir, "intent/Goal/r-0001.md", goal("lower"));
    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(messages(graph.problems), [
      "intent/Goal/r-0001.md and intent/Requirement/R-0001.md differ only in case, and two such files cannot sit side by side on every filesystem. Every one of them is left out until the names differ by more than case.",
      "intent/Goal/r-0001.md and intent/Requirement/R-0001.md differ only in case, and two such files cannot sit side by side on every filesystem. Every one of them is left out until the names differ by more than case.",
    ]);
  });

  test("a relation the canon does not allow refuses the whole file", async () => {
    const specDir = await makeSpecDir();
    await place(
      specDir,
      "intent/Requirement/R-0001.md",
      requirement("wrong", "\nedges:\n  - type: HAS_CRITERION\n    to: G-0001"),
    );
    await place(specDir, "intent/Goal/G-0001.md", goal("target"));

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

  test("a target nothing names keeps the relation and says nothing", async () => {
    // The line is the history of a deletion and the clue for a re-anchor, so
    // it is kept exactly as written — restoring T-0009 attaches it again with
    // nobody editing this file. The hole it points into is the check's to
    // name, never a fault of the file that kept faith with what it saw.
    const specDir = await makeSpecDir();
    await place(
      specDir,
      "intent/Requirement/R-0001.md",
      requirement(
        "dangling",
        "\nedges:\n  - type: HAS_CRITERION\n    to: AC-0001\n  - type: MENTIONS\n    to: T-0009",
      ),
    );
    await place(specDir, "intent/AcceptanceCriterion/AC-0001.md", criterion("kept"));

    const graph = await loadGraph(specDir);
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ["AC-0001", "R-0001"],
    );
    assert.deepEqual(
      graph.edges.map((edge) => edge.id),
      ["R-0001 HAS_CRITERION AC-0001", "R-0001 MENTIONS T-0009"],
    );
    assert.deepEqual(messages(graph.problems), []);
  });

  test("a refused file is also answered whole, with its place attached", async () => {
    // The sentences repeat in `problems` for a person reading the folder;
    // `refused` is the structured half, so a caller judging the graph knows
    // which id and type the broken file was claiming without re-deriving them
    // from the path.
    const specDir = await makeSpecDir();
    await place(specDir, "intent/Requirement/R-0001.md", "just some notes\n");

    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(graph.refused, [
      {
        file: "intent/Requirement/R-0001.md",
        type: "Requirement",
        id: "R-0001",
        problems: [
          'R-0001.md does not begin with a "---" frontmatter block, so it cannot be read as a spec node.',
        ],
      },
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
    await place(specDir, "intent/Requirement/R-0001.md", requirement("kept"));
    await mkdir(path.join(specDir, "intent", "Requirement", "attachments"), {
      recursive: true,
    });
    await symlink(
      path.join(specDir, "intent", "Requirement", "attachments"),
      path.join(specDir, "intent", "Requirement", "X-0001.md"),
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
    await place(specDir, "intent/Requirement/R-0001.md", requirement("kept"));
    // The stat is the first thing that touches a candidate, and a link pointing
    // at itself is the reachable way to make it fail on a file that is there.
    await symlink("X-0001.md", path.join(specDir, "intent", "Requirement", "X-0001.md"));

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
    await place(specDir, "intent/Requirement/R-0001.md", requirement("kept"));
    // A name written by a Latin-1 editor: `café` with the byte 0xE9 where the
    // two UTF-8 bytes belong. Decoded leniently it becomes U+FFFD and loads as a
    // node whose name is not the name in the file — and the first save would
    // write the replacement character down for good.
    await mkdir(path.join(specDir, "intent", "Requirement"), { recursive: true });
    await writeFile(
      path.join(specDir, "intent", "Requirement", "R-0002.md"),
      Buffer.concat([
        Buffer.from("---\nshort_name: cafe\nname: caf", "utf8"),
        Buffer.from([0xe9]),
        Buffer.from(" shop\n---\n\n## Statement\n\ns\n", "utf8"),
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
      await place(specDir, "intent/Requirement/R-0001.md", requirement("kept"));
      const shut = await place(specDir, "intent/Requirement/R-0002.md", requirement("shut"));

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
      await place(specDir, "intent/Requirement/R-0001.md", requirement("shut"));
      await place(specDir, "intent/Goal/G-0001.md", goal("kept"));

      const graph = await whileShut(path.join(specDir, "intent", "Requirement"), () =>
        loadGraph(specDir),
      );
      assert.deepEqual(
        graph.nodes.map((node) => node.id),
        ["G-0001"],
      );
      assert.deepEqual(messages(graph.problems), [
        "intent/Requirement could not be listed: the filesystem refused permission. Every node file inside it is left out.",
      ]);
    },
  );

  test("a type folder that is a symbolic link is walked, not dropped in silence", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "intent/Requirement/R-0001.md", requirement("here"));
    // A monorepo pointing one type at a folder it shares. `readdir` answers with
    // `lstat` semantics, so this used to be neither walked nor mentioned: the
    // node simply was not there, with nothing to read and nothing to fix. The
    // link hangs under the type's own band, which is the only place the loader
    // looks for it.
    const elsewhere = path.join(path.dirname(specDir), "shared-terms");
    await mkdir(elsewhere, { recursive: true });
    await writeFile(
      path.join(elsewhere, "T-0001.md"),
      "---\nshort_name: thing\nname: Thing\n---\n\n## Definition\n\nA thing.\n",
      "utf8",
    );
    await mkdir(path.join(specDir, "domain"), { recursive: true });
    await symlink(elsewhere, path.join(specDir, "domain", "Term"));

    const graph = await loadGraph(specDir);
    assert.deepEqual(messages(graph.problems), []);
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ["R-0001", "T-0001"],
    );
  });

  /**
   * THE BAND LEVEL RESOLVES LINKS TOO, and it is the one that matters most: a
   * whole drawer pointed elsewhere is a hundred nodes, not one. `readdir`'s
   * `lstat` semantics would call the link a file rather than a folder, and a
   * `domain` that vanished in silence is exactly the disappearance the
   * misplacement sentences above exist to prevent.
   */
  test("a band folder that is a symbolic link is walked as well", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "intent/Requirement/R-0001.md", requirement("here"));
    const elsewhere = path.join(path.dirname(specDir), "shared-domain");
    await mkdir(path.join(elsewhere, "Term"), { recursive: true });
    await writeFile(
      path.join(elsewhere, "Term", "T-0001.md"),
      "---\nshort_name: thing\nname: Thing\n---\n\n## Definition\n\nA thing.\n",
      "utf8",
    );
    await mkdir(specDir, { recursive: true });
    await symlink(elsewhere, path.join(specDir, "domain"));

    const graph = await loadGraph(specDir);
    assert.deepEqual(messages(graph.problems), []);
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ["R-0001", "T-0001"],
    );
    assert.deepEqual(
      graph.nodes.map((node) => node.type),
      ["Requirement", "Term"],
    );
  });

  test("one broken file costs only itself", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "intent/Requirement/R-0001.md", requirement("good"));
    await place(specDir, "intent/Requirement/R-0002.md", "not a spec file at all\n");
    await place(specDir, "intent/Goal/G-0001.md", goal("also good"));

    const graph = await loadGraph(specDir);
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ["G-0001", "R-0001"],
    );
    assert.equal(graph.problems.length, 1);
    assert.equal(graph.problems[0]?.file, "intent/Requirement/R-0002.md");
  });
});

describe("the cache is a shortcut and never a source", () => {
  test("an edit made outside the daemon shows up on the next read", async () => {
    const specDir = await makeSpecDir();
    const target = await place(specDir, "intent/Goal/G-0001.md", goal("before"));

    const first = await loadGraph(specDir);
    assert.equal(first.nodes[0]?.shortName, "before");

    await writeFile(
      target,
      goal("after").replace(
        "The thing is worth doing.",
        "Rewritten by an agent.",
      ),
      "utf8",
    );

    const second = await loadGraph(specDir);
    assert.equal(second.nodes[0]?.shortName, "after");
    assert.equal(second.nodes[0]?.body, "## Statement\n\nRewritten by an agent.");
  });

  test("a file that appears and vanishes is followed both ways", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "intent/Goal/G-0001.md", goal("stays"));
    const doomed = await place(specDir, "intent/Goal/G-0002.md", goal("goes"));
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
    const target = await place(specDir, "intent/Goal/G-0001.md", goal("before"));
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
   * wrote into the node it was handed would be writing into every later answer —
   * a graph that disagrees with the files while both of them are right.
   */
  test("what a caller is handed is a copy, not the cache itself", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "intent/Requirement/R-0001.md", requirement("first"));
    await place(specDir, "intent/AcceptanceCriterion/AC-0001.md", criterion("second"));
    await place(
      specDir,
      "intent/Requirement/R-0002.md",
      requirement("third", "\nedges:\n  - type: HAS_CRITERION\n    to: AC-0001"),
    );

    const first = await loadGraph(specDir);
    const node = first.nodes.find((entry) => entry.id === "R-0001");
    const edge = first.edges[0];
    assert.ok(node !== undefined && edge !== undefined);
    node.body = "poisoned";
    edge.toId = "poisoned";

    const second = await loadGraph(specDir);
    assert.equal(
      second.nodes.find((entry) => entry.id === "R-0001")?.body,
      REQUIREMENT_BODY,
    );
    assert.equal(second.edges[0]?.toId, "AC-0001");
  });
});

describe("the write doors", () => {
  const values = {
    shortName: "checkout",
    name: "Checkout works",
    body: "## Statement\n\nThe system shall check out.\n\n## Description\n\nBecause a cart is not an order.",
  };

  /** The bytes those values are — the canonical form, and the only form written. */
  const CHECKOUT_FILE = `---
short_name: checkout
name: Checkout works
---

## Statement

The system shall check out.

## Description

Because a cart is not an order.
`;

  test("a created node is a canonical file the loader reads back", async () => {
    const specDir = await makeSpecDir();
    const node = await createNodeFile(specDir, "Requirement", "R-0001", values);
    assert.equal(node.id, "R-0001");
    assert.equal(node.type, "Requirement");
    assert.equal(node.body, values.body);
    assert.equal(node.createdAt, node.updatedAt);

    const text = await readFile(path.join(specDir, "intent/Requirement/R-0001.md"), "utf8");
    assert.equal(text, CHECKOUT_FILE);
    assert.ok(isCanonical("Requirement", "R-0001.md", text));

    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.problems, []);
    assert.deepEqual(graph.nodes[0], node);
  });

  /**
   * EMIT IS THE IDENTITY ON THE BODY, which is what makes "the file is the
   * truth" literal: whatever a person or an agent wrote is what the file
   * carries, byte for byte. The document below is deliberately everything the
   * old roster refused — a paragraph before the first heading, a heading
   * written twice, a `---` line that is the frontmatter's own fence, a fenced
   * block that reads like frontmatter and an indented block a trim would
   * flatten — and it survives the trip out to disk and back unchanged.
   */
  test("the body goes out and comes back verbatim", async () => {
    const specDir = await makeSpecDir();
    const body = [
      "A note before any heading.",
      "",
      "## Statement",
      "",
      "The system shall do the thing.",
      "",
      "---",
      "",
      "## Statement",
      "",
      "Said twice, which is the author's business and not the format's.",
      "",
      "```yaml",
      "short_name: not a key down here",
      "```",
      "",
      "    an indented code block",
    ].join("\n");

    const node = await createNodeFile(specDir, "Requirement", "R-0001", {
      shortName: "free",
      name: "Free markdown",
      body,
    });
    assert.equal(node.body, body);

    const target = path.join(specDir, "intent/Requirement/R-0001.md");
    const text = await readFile(target, "utf8");
    assert.equal(
      text,
      `---\nshort_name: free\nname: Free markdown\n---\n\n${body}\n`,
    );
    assert.ok(isCanonical("Requirement", "R-0001.md", text));

    const graph = await loadGraph(specDir);
    assert.deepEqual(messages(graph.problems), []);
    assert.equal(graph.nodes[0]?.body, body);

    // And the same body on the way through the second door, over a file that
    // already holds one: an update replaces the document whole.
    const replaced = "# A different document\n\nWith nothing of the first one in it.";
    const updated = await updateNodeFile(specDir, "R-0001", {
      shortName: "free",
      name: "Free markdown",
      body: replaced,
    });
    assert.equal(updated.body, replaced);
    assert.equal(
      await readFile(target, "utf8"),
      `---\nshort_name: free\nname: Free markdown\n---\n\n${replaced}\n`,
    );
  });

  test("a node with nothing to say yet is a file that ends at its fence", async () => {
    const specDir = await makeSpecDir();
    const node = await createNodeFile(specDir, "Term", "T-0001", {
      shortName: "thing",
      name: "Thing",
      body: "",
    });
    assert.equal(node.body, "");

    const text = await readFile(path.join(specDir, "domain/Term/T-0001.md"), "utf8");
    // An ABSENT tail and never a blank line after the fence: empty and absent
    // would otherwise be two spellings of one state.
    assert.equal(text, "---\nshort_name: thing\nname: Thing\n---\n");
    assert.ok(isCanonical("Term", "T-0001.md", text));

    const graph = await loadGraph(specDir);
    assert.deepEqual(messages(graph.problems), []);
    assert.equal(graph.nodes[0]?.body, "");
  });

  test("the values are settled on the way in, so the file is canonical", async () => {
    const specDir = await makeSpecDir();
    await createNodeFile(specDir, "Requirement", "R-0001", {
      shortName: "  checkout  ",
      name: "Checkout works\n",
      // A textarea's blank lines at both edges, and a Windows editor's line
      // endings through the middle.
      body: `\n\n${values.body.replace(/\n/g, "\r\n")}\n  \n`,
    });
    const text = await readFile(path.join(specDir, "intent/Requirement/R-0001.md"), "utf8");
    assert.equal(text, CHECKOUT_FILE);
    assert.ok(isCanonical("Requirement", "R-0001.md", text));
  });

  test("an unknown type, a bad id and a value the file cannot hold are refused by name", async () => {
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
        createNodeFile(specDir, "Requirement", "R-0001", { ...values, name: "  " }),
      ),
      { kind: "invalid", message: "A name is required." },
    );
    // The door writes the bytes and reads them back with the loader's own
    // reader, so what a bad payload gets is the sentence the loader would have
    // served over the file.
    assert.deepEqual(
      await refusal(() =>
        createNodeFile(specDir, "Requirement", "R-0001", {
          ...values,
          body: "## Statement\n\nA statement with a \u0000 in it.",
        }),
      ),
      {
        kind: "invalid",
        message: "The specification cannot contain a NUL character.",
      },
    );
    assert.deepEqual(
      await refusal(() =>
        createNodeFile(specDir, "Requirement", "R-0001", {
          ...values,
          body: "x".repeat(TEXT_BYTE_CAP + 1),
        }),
      ),
      {
        kind: "invalid",
        message: "The specification cannot hold more than 256 KiB of text.",
      },
    );
    // Two things wrong at once are answered in the order a person reads a file:
    // the names above the fence, and only then the body below it.
    assert.deepEqual(
      await refusal(() =>
        createNodeFile(specDir, "Requirement", "R-0001", {
          ...values,
          shortName: "",
          body: "## Statement\n\nA statement with a \u0000 in it.",
        }),
      ),
      { kind: "invalid", message: "A short name is required." },
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
          body: "## Statement\n\nAnything.",
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
      body: "## Statement\n\nThe thing happened.\n\n## Evaluation Process\n\nRun it and look.",
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
      "intent/Requirement/R-0001.md",
      "---\nname: n\n---\n\n## Statement\n\nHalf an edit.\n",
    );

    const refused = await refusal(() => updateNodeFile(specDir, "R-0001", values));
    assert.equal(refused.kind, "conflict");
    assert.equal(
      refused.message,
      "intent/Requirement/R-0001.md has been edited into a state Shall cannot read — A short name is required. Nothing was written, so that edit is still there to fix.",
    );
    // The broken edit is still on disk, which is the whole point of refusing.
    const text = await readFile(path.join(specDir, "intent/Requirement/R-0001.md"), "utf8");
    assert.ok(text.includes("Half an edit."));
  });

  /**
   * The commonest way a hand edit breaks one of these files now: a fact written
   * above the fence, where the frontmatter carries only the two names and the
   * relations. The panel's version of the node was read before that edit
   * happened, so saving over it would throw the edit away with nothing to undo
   * — and the sentence the caller gets is the reader's own, wrapped in the one
   * that says nothing was written.
   */
  test("a write over a file whose frontmatter grew a key is refused too", async () => {
    const specDir = await makeSpecDir();
    await createNodeFile(specDir, "Requirement", "R-0001", values);
    const edited = `---
short_name: checkout
name: Checkout works
statement: The system shall check out.
---

## Description

Because a cart is not an order.
`;
    await place(specDir, "intent/Requirement/R-0001.md", edited);

    assert.deepEqual(await refusal(() => updateNodeFile(specDir, "R-0001", values)), {
      kind: "conflict",
      message:
        "intent/Requirement/R-0001.md has been edited into a state Shall cannot read — The frontmatter carries short_name, name and edges and nothing else — statement belongs in the body, below the closing fence. Nothing was written, so that edit is still there to fix.",
    });
    assert.equal(
      await readFile(path.join(specDir, "intent/Requirement/R-0001.md"), "utf8"),
      edited,
    );
  });

  test("a write over a file nobody can read is refused, not performed", async () => {
    const specDir = await makeSpecDir();
    await createNodeFile(specDir, "Requirement", "R-0001", values);
    // Somebody's editor saved it in Latin-1. The bytes are not text, so there is
    // no reading of them to carry the relations over from, and a save would
    // write the file's own contents away.
    const target = path.join(specDir, "intent", "Requirement", "R-0001.md");
    const held = await readFile(target);
    await writeFile(target, Buffer.concat([held, Buffer.from([0xe9])]));

    const refused = await refusal(() => updateNodeFile(specDir, "R-0001", values));
    assert.deepEqual(refused, {
      kind: "conflict",
      message:
        "intent/Requirement/R-0001.md could not be read: it is not valid UTF-8 text. Nothing was written.",
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
        body: "## Statement\n\nThe thing is worth doing.",
      });

      // A READ carries on past a shut folder and says so; a WRITE may not,
      // because every door decides something from the listing — whether an id
      // is taken, which file a bare id names — and a listing with a hole in it
      // answers wrongly rather than not at all. Believed, it would write a
      // second R-0001 and cost both files at the next load.
      const refused = await whileShut(path.join(specDir, "intent", "Requirement"), () =>
        refusal(() => createNodeFile(specDir, "Requirement", "R-0001", values)),
      );
      assert.deepEqual(refused, {
        kind: "conflict",
        message:
          "intent/Requirement could not be listed: the filesystem refused permission. Nothing was written, because Shall cannot tell what this project holds while one of its folders is shut.",
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
          "intent/Requirement/R-0001.md could not be written: something along its path is a file and not a folder.",
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

  test("a relation written into a file leaves the body exactly where it was", async () => {
    const specDir = await makeSpecDir();
    await createNodeFile(specDir, "Requirement", "R-0001", values);
    await createNodeFile(specDir, "AcceptanceCriterion", "AC-0001", {
      shortName: "ac",
      name: "It happened",
      body: "## Statement\n\nThe thing happened.",
    });
    await addEdge(specDir, { fromId: "R-0001", type: "HAS_CRITERION", toId: "AC-0001" });

    // The edges are a key above the fence, so writing one rewrites the file —
    // and the body below the fence comes out of that rewrite unchanged.
    assert.equal(
      await readFile(path.join(specDir, "intent/Requirement/R-0001.md"), "utf8"),
      CHECKOUT_FILE.replace(
        "name: Checkout works\n",
        "name: Checkout works\nedges:\n  - type: HAS_CRITERION\n    to: AC-0001\n",
      ),
    );
  });
});

/**
 * THE SCAFFOLD DOOR WRITES A FILE THAT REFUSES ITSELF, ON PURPOSE. Every other
 * write in this module holds the read-back invariant — nothing is written that
 * cannot be read back as a node — and this one deliberately does not: the
 * starting file ships with both names blank, so until somebody fills it in the
 * loader answers over it with the guidance a hand-copied template has always
 * given. What is pinned here is that the file lands at the node's own path with
 * a free id, that its bytes are the template's and nothing else, and that the
 * loader treats it as a file with something to fix rather than as half a node.
 */
describe("the scaffold door starts a node without pretending it is one", () => {
  test("an empty spec gets the first id of the type, at the type's own path", async () => {
    const specDir = await makeSpecDir();
    const made = await scaffoldNodeFile(specDir, "Requirement");
    assert.deepEqual(made, { id: "R-0001", file: "intent/Requirement/R-0001.md" });

    // The bytes are the template's, byte for byte: this door emits and does not
    // round-trip, so nothing has settled or reordered them on the way out.
    const text = await readFile(path.join(specDir, made.file), "utf8");
    assert.equal(text, emitScaffold("Requirement"));

    // And the loader's answer over it is the guidance, not a node.
    const graph = await loadGraph(specDir);
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(graph.edges, []);
    assert.deepEqual(messages(graph.problems), [
      "A short name is required.",
      "A name is required.",
    ]);
    assert.deepEqual(
      graph.problems.map((problem) => problem.file),
      [made.file, made.file],
    );
  });

  /** The band is the type's own and not a default, so a Domain type lands in `domain`. */
  test("another band's type lands in that band's folder", async () => {
    const specDir = await makeSpecDir();
    const made = await scaffoldNodeFile(specDir, "Term");
    assert.deepEqual(made, { id: "T-0001", file: "domain/Term/T-0001.md" });
    assert.equal(
      await readFile(path.join(specDir, made.file), "utf8"),
      emitScaffold("Term"),
    );
  });

  /**
   * ONE PAST THE HIGHEST, NEVER THE FIRST HOLE. A gap in the sequence is what a
   * deleted node leaves behind, and handing its id to a new file would let an
   * edge somebody's branch still carries attach to a node that has nothing to
   * do with it — silently, because a dangling reference at least says so.
   */
  test("the id goes one past the highest and never fills a gap", async () => {
    const specDir = await makeSpecDir();
    const values = {
      shortName: "r",
      name: "R",
      body: "## Statement\n\nThe system shall do the thing.",
    };
    await createNodeFile(specDir, "Requirement", "R-0001", values);
    await createNodeFile(specDir, "Requirement", "R-0003", values);

    const made = await scaffoldNodeFile(specDir, "Requirement");
    assert.deepEqual(made, { id: "R-0004", file: "intent/Requirement/R-0004.md" });

    // The two written nodes are untouched and the scaffold sits beside them
    // saying what it still needs.
    const graph = await loadGraph(specDir);
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ["R-0001", "R-0003"],
    );
    assert.deepEqual(
      graph.problems.map((problem) => problem.file),
      ["intent/Requirement/R-0004.md", "intent/Requirement/R-0004.md"],
    );
  });

  /**
   * A hand-written id that differs from the suggestion only in case pushes the
   * ask one further rather than writing a second file two filesystems cannot
   * keep apart. `r-0002` is not of the type's own shape, so it moves the highest
   * ordinal not at all — the suggestion arrives at `R-0002`, collides with it in
   * lowercase, and is asked again.
   */
  test("an id taken but for its case bumps the suggestion past it", async () => {
    const specDir = await makeSpecDir();
    await place(specDir, "intent/Requirement/R-0001.md", requirement("first"));
    await place(specDir, "intent/Requirement/r-0002.md", requirement("lowercase"));

    const made = await scaffoldNodeFile(specDir, "Requirement");
    assert.deepEqual(made, { id: "R-0003", file: "intent/Requirement/R-0003.md" });
    assert.deepEqual(
      (await readdir(path.join(specDir, "intent", "Requirement"))).sort(),
      ["R-0001.md", "R-0003.md", "r-0002.md"],
    );
  });

  test("a type outside the canon is refused, and nothing is written", async () => {
    const specDir = await makeSpecDir();
    assert.deepEqual(await refusal(() => scaffoldNodeFile(specDir, "Widget")), {
      kind: "invalid",
      message: "Unknown node type: Widget",
    });
    assert.deepEqual(await readdir(specDir).catch(() => []), []);
  });
});

describe("deleting a node touches its own file and nothing else", () => {
  const requirementValues = {
    shortName: "r",
    name: "R",
    body: "## Statement\n\nThe system shall do the thing.",
  };
  const criterionValues = {
    shortName: "ac",
    name: "AC",
    body: "## Statement\n\nThe thing happened.\n\n## Evaluation Process\n\nRun it and look.",
  };

  test("the referrers keep their lines, byte for byte", async () => {
    const specDir = await makeSpecDir();
    await createNodeFile(specDir, "Requirement", "R-0001", requirementValues);
    await createNodeFile(specDir, "Requirement", "R-0002", requirementValues);
    await createNodeFile(specDir, "AcceptanceCriterion", "AC-0001", criterionValues);
    await addEdge(specDir, { fromId: "R-0001", type: "HAS_CRITERION", toId: "AC-0001" });
    await addEdge(specDir, { fromId: "R-0002", type: "HAS_CRITERION", toId: "AC-0001" });
    await addEdge(specDir, { fromId: "R-0001", type: "DEPENDS_ON", toId: "R-0002" });
    const before = {
      first: await readFile(path.join(specDir, "intent/Requirement/R-0001.md"), "utf8"),
      second: await readFile(path.join(specDir, "intent/Requirement/R-0002.md"), "utf8"),
    };

    await deleteNodeFile(specDir, "AC-0001");

    // A deletion touches one file: the target is gone, and its neighbours are
    // the bytes they were — a machine that rewrote them would mint a change
    // nobody intended.
    assert.deepEqual(
      await readdir(path.join(specDir, "intent", "AcceptanceCriterion")),
      [],
    );
    assert.equal(
      await readFile(path.join(specDir, "intent/Requirement/R-0001.md"), "utf8"),
      before.first,
    );
    assert.equal(
      await readFile(path.join(specDir, "intent/Requirement/R-0002.md"), "utf8"),
      before.second,
    );

    // The lines that pointed at it are history now, and the loader keeps them.
    const graph = await loadGraph(specDir);
    assert.deepEqual(messages(graph.problems), []);
    assert.deepEqual(
      graph.nodes.map((node) => node.id),
      ["R-0001", "R-0002"],
    );
    assert.deepEqual(
      graph.edges.map((edge) => edge.id),
      [
        "R-0001 DEPENDS_ON R-0002",
        "R-0001 HAS_CRITERION AC-0001",
        "R-0002 HAS_CRITERION AC-0001",
      ],
    );
  });

  test("a neighbour in any state is never even opened", async () => {
    // One of the referrers is not UTF-8 — mid-crash, mid-edit, who knows. The
    // old cascade had to decide what to do about a file like that; this door
    // has nothing to decide, because it opens no file but its target's.
    const specDir = await makeSpecDir();
    await createNodeFile(specDir, "AcceptanceCriterion", "AC-0001", criterionValues);
    for (const id of ["R-0001", "R-0002", "R-0003"]) {
      await createNodeFile(specDir, "Requirement", id, requirementValues);
      await addEdge(specDir, {
        fromId: id,
        type: "HAS_CRITERION",
        toId: "AC-0001",
      });
    }
    const middle = path.join(specDir, "intent", "Requirement", "R-0002.md");
    await writeFile(
      middle,
      Buffer.concat([await readFile(middle), Buffer.from([0xe9])]),
    );
    const before = new Map<string, Buffer>();
    for (const id of ["R-0001", "R-0002", "R-0003"]) {
      before.set(
        id,
        await readFile(path.join(specDir, "intent", "Requirement", `${id}.md`)),
      );
    }

    await deleteNodeFile(specDir, "AC-0001");

    assert.deepEqual(
      await readdir(path.join(specDir, "intent", "AcceptanceCriterion")),
      [],
    );
    for (const [id, bytes] of before) {
      assert.deepEqual(
        await readFile(path.join(specDir, "intent", "Requirement", `${id}.md`)),
        bytes,
        id,
      );
    }
  });

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
          body: `## Statement\n\nThe system shall do thing ${index}.\n\n## Description\n\nReason ${index}.`,
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

    const entries = await readdir(path.join(specDir, "intent", "Requirement"));
    assert.deepEqual(
      entries.filter((entry) => !entry.endsWith(".md")),
      [],
    );
    for (const entry of entries) {
      const text = await readFile(path.join(specDir, "intent", "Requirement", entry), "utf8");
      assert.ok(
        isCanonical("Requirement", entry, text),
        `${entry} is not canonical:\n${text}`,
      );
    }
  });

  test("a refused write does not stop the writes behind it", async () => {
    const specDir = await makeSpecDir();
    const body = "## Statement\n\nThe thing is worth doing.";
    const settled = await Promise.allSettled([
      createNodeFile(specDir, "Goal", "G-0001", { shortName: "a", name: "A", body }),
      createNodeFile(specDir, "Goal", "G-0001", { shortName: "b", name: "B", body }),
      createNodeFile(specDir, "Goal", "G-0002", { shortName: "c", name: "C", body }),
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
