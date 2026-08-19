import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import {
  NODE_TYPES,
  TEXT_BYTE_CAP,
  permittedEdgeTypes,
} from "@shall/core/graph";
import { emitScaffold } from "@shall/core/serialize";
import { isRefusal, type Refusal } from "./errors.js";
import { createProject, openProject } from "./projects.js";
import { readProjectSettings } from "./settings.js";
import {
  checkSpec,
  createSpecEdge,
  createSpecNode,
  listSpecEdges,
  listSpecNodes,
  removeSpecEdge,
  removeSpecNode,
  scaffoldSpecNode,
  updateSpecNode,
} from "./spec-graph.js";
import type { RegistryProject } from "../types.js";

/**
 * The doors' sentences, held as goldens.
 *
 * THESE STRINGS ARE THE PRODUCT. They are what a person reads in a panel when
 * their arrow was drawn backwards or their id is already spoken for, they were
 * written before the spec graph was files, and they had to survive the move
 * word for word — so every one of them is written out in full here rather than
 * assembled from the template the code uses, which would agree with any wording
 * at all.
 *
 * The KINDS are asserted with them, because the router turns a kind into a
 * status code and nothing else does: an `invalid` served where a `conflict`
 * belongs tells the panel to change a payload that was perfectly good.
 *
 * The ORDER is asserted where two things are wrong at once, because a door
 * answers with the first sentence and which one that is decides what the person
 * is sent to fix.
 */

/** A fake `~`, so the registry these tests write is not the one the user has. */
let home = "";
/** Where the project folders go: one per test, so no test can see another's files. */
let workspace = "";

before(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "shall-daemon-"));
  home = path.join(workspace, "home");
  await mkdir(home, { recursive: true });
  // `getShallHome` reads `os.homedir()` on every call, which is `$HOME` on
  // POSIX — so this redirects the registry, the config and the daemon state
  // without a seam in the code that exists only for tests.
  process.env.HOME = home;
});

async function newProject(): Promise<RegistryProject> {
  return createProject(await mkdtemp(path.join(workspace, "project-")));
}

/**
 * A specification written the way the template suggests — headings and prose.
 * Nothing about the shape is required; these read as the template's starting
 * shape because that is what most nodes will look like, not because a door
 * asks for it.
 */
const REQUIREMENT_BODY = [
  "## Statement",
  "",
  "The daemon refuses a malformed id.",
  "",
  "## Description",
  "",
  "Every door judges the id before it judges anything else.",
].join("\n");

const CRITERION_BODY = [
  "## Statement",
  "",
  "A malformed id is refused.",
  "",
  "## Evaluation Process",
  "",
  "Send one and read the sentence.",
].join("\n");

const GOAL_BODY = "The spec travels with the repository.";

function values(
  id: string,
  body: string,
): { shortName: string; name: string; body: string } {
  return {
    shortName: id.toLowerCase(),
    name: `The node called ${id}`,
    body,
  };
}

async function node(
  project: RegistryProject,
  type: string,
  id: string,
  body: string,
): Promise<void> {
  await createSpecNode({
    projectId: project.id,
    type,
    id,
    ...values(id, body),
  });
}

/** The refusal a door threw, or a failed test — never a resolved promise. */
async function refused(work: Promise<unknown>): Promise<Refusal> {
  const outcome = await work.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!isRefusal(outcome)) {
    assert.fail(
      `Expected a refusal, received ${outcome === null ? "a resolved promise" : String(outcome)}.`,
    );
  }
  return outcome;
}

async function says(
  work: Promise<unknown>,
  kind: Refusal["kind"],
  message: string,
): Promise<void> {
  const refusal = await refused(work);
  assert.equal(refusal.message, message);
  assert.equal(refusal.kind, kind);
}

describe("the create door", () => {
  test("refuses a type the canon does not have, before it looks at anything else", async () => {
    const project = await newProject();
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Nope",
        id: "not a legal id",
        ...values("R-0001", REQUIREMENT_BODY),
      }),
      "invalid",
      "Unknown node type: Nope",
    );
  });

  test("refuses a specification over the byte cap, in the reader's sentence", async () => {
    const project = await newProject();
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Requirement",
        id: "R-0001",
        ...values("R-0001", "a".repeat(TEXT_BYTE_CAP + 1)),
      }),
      "invalid",
      "The specification cannot hold more than 256 KiB of text.",
    );
  });

  test("refuses an id no filesystem could carry", async () => {
    const project = await newProject();
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Requirement",
        id: "R 0001",
        ...values("R-0001", REQUIREMENT_BODY),
      }),
      "invalid",
      "An id uses letters, digits, dots, hyphens and underscores, starts with a letter or digit, and holds at most 64 characters.",
    );
  });

  test("refuses a blank id in the door's own words", async () => {
    const project = await newProject();
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Requirement",
        id: "   ",
        ...values("R-0001", REQUIREMENT_BODY),
      }),
      "invalid",
      "An id is required.",
    );
  });

  test("refuses an id another node has taken", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Requirement",
        id: "R-0001",
        ...values("R-0001", REQUIREMENT_BODY),
      }),
      "conflict",
      "R-0001 is already used by another node. Choose another id.",
    );
  });

  test("refuses an id that differs from a taken one only in case", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Requirement",
        id: "r-0001",
        ...values("r-0001", REQUIREMENT_BODY),
      }),
      "conflict",
      "r-0001 differs only in case from R-0001, and two such files cannot sit side by side on every filesystem. Choose another id.",
    );
  });

  test("refuses an id taken by a node of another type, because an edge names a bare id", async () => {
    const project = await newProject();
    await node(project, "Requirement", "X-0001", REQUIREMENT_BODY);
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Goal",
        id: "X-0001",
        ...values("X-0001", GOAL_BODY),
      }),
      "conflict",
      "X-0001 is already used by another node. Choose another id.",
    );
  });

  test("answers the taken id before it answers a blank name, as it always did", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Requirement",
        id: "R-0001",
        shortName: "  ",
        name: "The node called R-0001",
        body: REQUIREMENT_BODY,
      }),
      "conflict",
      "R-0001 is already used by another node. Choose another id.",
    );
  });

  test("refuses a blank short name — the reader's sentence over the bytes it would write", async () => {
    const project = await newProject();
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Requirement",
        id: "R-0001",
        shortName: "   ",
        name: "The node called R-0001",
        body: REQUIREMENT_BODY,
      }),
      "invalid",
      "A short name is required.",
    );
  });

  test("writes a file that reads back as the node it answered with", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    const nodes = await listSpecNodes(project.id);
    assert.deepEqual(
      nodes.map((entry) => [entry.id, entry.type, entry.shortName]),
      [["R-0001", "Requirement", "r-0001"]],
    );
    const [only] = nodes;
    assert.ok(only);
    assert.equal(only.body, REQUIREMENT_BODY);
    // The two stamps are the file's one mtime, so they arrive equal.
    assert.equal(only.createdAt, only.updatedAt);
    assert.ok(only.createdAt > 0);
  });

  test("takes a specification of any shape at all — the headings are a guide, not a rule", async () => {
    const project = await newProject();
    // Nothing the template suggests, and things the old format refused: a
    // heading of its own invention, a horizontal rule, a fenced block holding
    // fence-lookalikes. All of it is the author's markdown now, and all of it
    // comes back byte for byte.
    const freeform = [
      "This requirement is best explained as a story, not as sections.",
      "",
      "---",
      "",
      "### What the daemon does",
      "",
      "```",
      "## not a heading, and --- not a fence",
      "```",
    ].join("\n");
    await node(project, "Requirement", "R-0001", freeform);
    const [only] = await listSpecNodes(project.id);
    assert.ok(only);
    assert.equal(only.body, freeform);
    const check = await checkSpec(project.path);
    assert.deepEqual(check.problems, []);
    assert.deepEqual(check.notes, []);
  });
});

describe("the edit door", () => {
  test("refuses an id nothing answers to", async () => {
    const project = await newProject();
    await says(
      updateSpecNode({
        projectId: project.id,
        id: "R-9999",
        ...values("R-9999", REQUIREMENT_BODY),
      }),
      "missing",
      "Unknown node: R-9999",
    );
  });

  test("replaces the specification with whatever shape the edit brought", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    const reshaped = "One paragraph, no headings — reshaped by hand.";
    await updateSpecNode({
      projectId: project.id,
      id: "R-0001",
      ...values("R-0001", reshaped),
    });
    const [only] = await listSpecNodes(project.id);
    assert.ok(only);
    assert.equal(only.body, reshaped);
  });

  test("refuses to save over a file somebody has edited into a state Shall cannot read", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    // A hand edit that writes a key the frontmatter does not carry: the file
    // is still YAML, and it is no longer a node. Saving the panel's copy over
    // it would throw the edit away.
    await writeFile(
      path.join(
        project.path,
        ".shall",
        "spec",
        "intent",
        "Requirement",
        "R-0001.md",
      ),
      "---\nshort_name: r-0001\nname: The node called R-0001\npriority: high\n---\n",
      "utf8",
    );
    await says(
      updateSpecNode({
        projectId: project.id,
        id: "R-0001",
        ...values("R-0001", REQUIREMENT_BODY),
      }),
      "conflict",
      "intent/Requirement/R-0001.md has been edited into a state Shall cannot read — The frontmatter carries short_name, name, edges and deletionProposed and nothing else — priority belongs in the body, below the closing fence. Nothing was written, so that edit is still there to fix.",
    );
    // Nothing was written: the edit is still there, exactly as it was left.
    const held = await readFile(
      path.join(
        project.path,
        ".shall",
        "spec",
        "intent",
        "Requirement",
        "R-0001.md",
      ),
      "utf8",
    );
    assert.match(held, /^---\nshort_name: r-0001\n/);
  });

  test("keeps the relations the edit never mentioned", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION_BODY);
    await createSpecEdge({
      projectId: project.id,
      type: "HAS_CRITERION",
      fromId: "R-0001",
      toId: "AC-0001",
    });
    await updateSpecNode({
      projectId: project.id,
      id: "R-0001",
      ...values("R-0001", `${REQUIREMENT_BODY}\n\nEdited, relations unnamed.`),
    });
    assert.deepEqual(
      (await listSpecEdges(project.id)).map((edge) => edge.id),
      ["R-0001 HAS_CRITERION AC-0001"],
    );
  });
});

describe("a work log's commits through the doors", () => {
  test("a create with commits writes them, and an update without leaves them", async () => {
    const project = await newProject();
    const created = await createSpecNode({
      projectId: project.id,
      type: "WorkLog",
      id: "WL-0001",
      shortName: "day-one",
      name: "The first day",
      body: "It went fine.",
      commits: ["9f2b1c4"],
    });
    assert.deepEqual(created.commits, ["9f2b1c4"]);

    const carried = await updateSpecNode({
      projectId: project.id,
      id: "WL-0001",
      shortName: "day-one",
      name: "The first day",
      body: "It went fine, then better.",
    });
    assert.deepEqual(carried.commits, created.commits);

    const replaced = await updateSpecNode({
      projectId: project.id,
      id: "WL-0001",
      shortName: "day-one",
      name: "The first day",
      body: "It went fine, then better.",
      commits: ["9f2b1c4", "41acde0"],
    });
    assert.deepEqual(replaced.commits, ["9f2b1c4", "41acde0"]);
    // Written after the edges block would be, in the author's order.
    const text = await readFile(
      path.join(project.path, ".shall", "spec", "execution", "WorkLog", "WL-0001.md"),
      "utf8",
    );
    assert.ok(text.indexOf("9f2b1c4") < text.indexOf("41acde0"), text);
  });

  test("commits on any other type are refused in the reader's sentence", async () => {
    const project = await newProject();
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Requirement",
        id: "R-0001",
        ...values("R-0001", REQUIREMENT_BODY),
        commits: ["9f2b1c4"],
      }),
      "invalid",
      "A Requirement does not carry commits — only a WorkLog records the commits its work produced.",
    );
  });
});

describe("the remove door", () => {
  test("refuses an id nothing answers to", async () => {
    const project = await newProject();
    await says(
      removeSpecNode({ projectId: project.id, id: "R-9999" }),
      "missing",
      "Unknown node: R-9999",
    );
  });

  test("refuses the execution band, whose records are not unhappened", async () => {
    const project = await newProject();
    await node(project, "WorkLog", "WL-0001", "It went fine.");
    await says(
      removeSpecNode({ projectId: project.id, id: "WL-0001" }),
      "invalid",
      "WL-0001 is a WorkLog, and the execution band is append-only — what happened is not unhappened by deleting its record. Nothing was removed.",
    );
  });

  test("takes its own file and leaves the relation into it as history", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001", GOAL_BODY);
    await node(project, "Question", "Q-0001", "## Question\n\nWhy?");
    await createSpecEdge({
      projectId: project.id,
      type: "RAISES",
      fromId: "G-0001",
      toId: "Q-0001",
    });
    const referrer = path.join(
      project.path,
      ".shall",
      "spec",
      "intent",
      "Goal",
      "G-0001.md",
    );
    const before = await readFile(referrer, "utf8");

    await removeSpecNode({ projectId: project.id, id: "Q-0001" });

    // A deletion touches one file: the neighbour is byte-identical.
    assert.equal(await readFile(referrer, "utf8"), before);
    assert.deepEqual(
      (await listSpecNodes(project.id)).map((entry) => entry.id),
      ["G-0001"],
    );
    // The canvas gets no line to a box that is not there…
    assert.deepEqual(await listSpecEdges(project.id), []);
    // …and the check names the hole the kept line now points into.
    const check = await checkSpec(project.path);
    assert.deepEqual(check.problems, []);
    assert.deepEqual(
      check.gaps.map((gap) => gap.file),
      ["intent/Goal/G-0001.md"],
    );
  });
});

describe("the edge doors", () => {
  test("refuse a source that is not there", async () => {
    const project = await newProject();
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION_BODY);
    await says(
      createSpecEdge({
        projectId: project.id,
        type: "HAS_CRITERION",
        fromId: "R-0001",
        toId: "AC-0001",
      }),
      "missing",
      "Unknown node: R-0001",
    );
  });

  test("refuse a relation from a node to itself", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    await says(
      createSpecEdge({
        projectId: project.id,
        type: "DEPENDS_ON",
        fromId: "R-0001",
        toId: "R-0001",
      }),
      "invalid",
      "R-0001 cannot relate to itself.",
    );
  });

  test("refuse a relation the canon does not have, and name the ones it does", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION_BODY);
    await says(
      createSpecEdge({
        projectId: project.id,
        type: "MENTIONS",
        fromId: "R-0001",
        toId: "AC-0001",
      }),
      "invalid",
      "MENTIONS is not allowed from Requirement to AcceptanceCriterion. This direction allows: HAS_CRITERION.",
    );
  });

  test("name the reverse direction when the arrow was drawn from the wrong end", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION_BODY);
    await says(
      createSpecEdge({
        projectId: project.id,
        type: "HAS_CRITERION",
        fromId: "AC-0001",
        toId: "R-0001",
      }),
      "invalid",
      "HAS_CRITERION is not allowed from AcceptanceCriterion to Requirement. The reverse direction allows: HAS_CRITERION.",
    );
  });

  test("say the pair itself is the problem when neither direction allows anything", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001", GOAL_BODY);
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION_BODY);
    await says(
      createSpecEdge({
        projectId: project.id,
        type: "HAS_CRITERION",
        fromId: "G-0001",
        toId: "AC-0001",
      }),
      "invalid",
      "HAS_CRITERION is not allowed from Goal to AcceptanceCriterion. Nothing in the canon relates a Goal to a AcceptanceCriterion.",
    );
  });

  /**
   * Why no golden above carries BOTH clauses: the canon has no pair of types
   * that allows a relation each way, so `grammarHint`'s two clauses cannot both
   * be true of one refusal today. This asserts the fact rather than the absence
   * of a test — if a later ruling adds a reverse row, this fails and the golden
   * that should exist can be written.
   */
  test("the canon has no pair of types related in both directions", () => {
    const both = NODE_TYPES.flatMap((from) =>
      NODE_TYPES.filter(
        (to) =>
          from.name !== to.name &&
          permittedEdgeTypes(from.name, to.name).length > 0 &&
          permittedEdgeTypes(to.name, from.name).length > 0,
      ).map((to) => `${from.name} -> ${to.name}`),
    );
    assert.deepEqual(both, []);
  });

  test("refuse a second identical relation", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION_BODY);
    const edge = await createSpecEdge({
      projectId: project.id,
      type: "HAS_CRITERION",
      fromId: "R-0001",
      toId: "AC-0001",
    });
    // The id the web holds opaquely, and the whole of what an edge is.
    assert.equal(edge.id, "R-0001 HAS_CRITERION AC-0001");
    await says(
      createSpecEdge({
        projectId: project.id,
        type: "HAS_CRITERION",
        fromId: "R-0001",
        toId: "AC-0001",
      }),
      "conflict",
      "R-0001 already has a HAS_CRITERION relation to AC-0001.",
    );
  });

  test("remove the relation the id names, and refuse one nothing answers to", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION_BODY);
    await createSpecEdge({
      projectId: project.id,
      type: "HAS_CRITERION",
      fromId: "R-0001",
      toId: "AC-0001",
    });
    await says(
      removeSpecEdge({ projectId: project.id, id: "not-a-triple" }),
      "missing",
      "Unknown edge: not-a-triple",
    );
    await says(
      removeSpecEdge({
        projectId: project.id,
        id: "R-0001 MENTIONS AC-0001",
      }),
      "missing",
      "Unknown edge: R-0001 MENTIONS AC-0001",
    );
    await removeSpecEdge({
      projectId: project.id,
      id: "R-0001 HAS_CRITERION AC-0001",
    });
    assert.deepEqual(await listSpecEdges(project.id), []);
  });
});

describe("the project's own folder", () => {
  test("is initialized with a spec folder and an ignore rule, and no template set", async () => {
    const project = await newProject();
    const shall = path.join(project.path, ".shall");
    await assert.doesNotReject(stat(path.join(shall, "spec")));
    // The reference templates are the machine's, under `~/.shall/templates` —
    // a project carries its spec and nothing of Shall's own.
    await assert.rejects(stat(path.join(shall, "templates")));
    assert.equal(
      (await readFile(path.join(shall, ".gitignore"), "utf8")).includes("*.tmp"),
      true,
    );
  });

  test("an open brings the machine's reference templates current", async () => {
    const project = await newProject();
    await openProject(project.path);
    const target = path.join(home, ".shall", "templates", "Requirement.md");
    const template = await readFile(target, "utf8");
    assert.match(
      template,
      /^---\n# Requirement — the starting shape of a Requirement node\.\n/,
    );

    // Current bytes are left alone, so the folder's mtimes stay quiet.
    const before = await stat(target);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await openProject(project.path);
    assert.equal((await stat(target)).mtimeMs, before.mtimeMs);

    // Drifted bytes are put back.
    await writeFile(target, "# emptied by hand\n", "utf8");
    await openProject(project.path);
    assert.equal(await readFile(target, "utf8"), template);
  });

  test("an open removes the template set an older Shall committed here", async () => {
    const project = await newProject();
    const leftover = path.join(project.path, ".shall", "templates");
    await mkdir(leftover, { recursive: true });
    await writeFile(
      path.join(leftover, "Requirement.md"),
      "# written by an older Shall\n",
      "utf8",
    );
    await openProject(project.path);
    await assert.rejects(stat(leftover));
  });

  test(
    "opens a folder it may read and may not write into",
    {
      skip:
        process.getuid === undefined || process.getuid() !== 0
          ? false
          : "running as root, where a permission bit shuts nothing",
    },
    async () => {
      // A checkout on a read-only mount, or one owned by somebody else.
      // Making `spec/` and sweeping an old template set are conveniences, not
      // conditions of opening — reading a project must never require the right
      // to write to it, and a person who cannot be given their graph should at
      // least not be given an errno instead.
      const project = await newProject();
      const shall = path.join(project.path, ".shall");
      // Both tidyings have work to do: a spec folder that is not there (a
      // clone of a project whose graph is empty carries none) and an old
      // template set that wants removing.
      await rm(path.join(shall, "spec"), { recursive: true });
      const leftover = path.join(shall, "templates");
      await mkdir(leftover, { recursive: true });
      await writeFile(
        path.join(leftover, "Requirement.md"),
        "# left by an older Shall\n",
        "utf8",
      );
      const mode = (await stat(shall)).mode;
      await chmod(shall, 0o555);
      try {
        const opened = await openProject(project.path);
        assert.equal(opened.id, project.id);
      } finally {
        await chmod(shall, mode);
      }
    },
  );

  test("tells the settings screen where the spec is", async () => {
    const project = await newProject();
    const settings = await readProjectSettings(project.id);
    assert.equal(
      settings.specPath,
      path.join(project.path, ".shall", "spec"),
    );
  });
});

describe("the scaffold door", () => {
  test("writes a starting file at the node's own path and answers with it", async () => {
    const project = await newProject();
    // Case-insensitive on purpose: the command is typed by hand, and
    // `--type requirement` means the one thing it can mean.
    const scaffolded = await scaffoldSpecNode({
      path: project.path,
      type: "requirement",
    });
    assert.deepEqual(scaffolded, {
      root: project.path,
      type: "Requirement",
      id: "R-0001",
      file: ".shall/spec/intent/Requirement/R-0001.md",
    });
    assert.equal(
      await readFile(path.join(project.path, scaffolded.file), "utf8"),
      emitScaffold("Requirement"),
    );

    // Until somebody fills it in, the scaffold is a file the check names and
    // the graph does not serve — the same guidance loop a hand-written file
    // meets, in the same sentences.
    const check = await checkSpec(project.path);
    assert.equal(check.nodeCount, 0);
    assert.deepEqual(
      check.problems.map((problem) => [problem.file, problem.message]),
      [
        ["intent/Requirement/R-0001.md", "A short name is required."],
        ["intent/Requirement/R-0001.md", "A name is required."],
      ],
    );
  });

  test("finds the project by walking up, like the check does", async () => {
    const project = await newProject();
    const deep = path.join(project.path, "src", "service");
    await mkdir(deep, { recursive: true });
    const scaffolded = await scaffoldSpecNode({ path: deep, type: "Term" });
    assert.equal(scaffolded.root, project.path);
    assert.equal(scaffolded.file, ".shall/spec/domain/Term/T-0001.md");
  });

  test("moves one past the ids already taken", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0007", REQUIREMENT_BODY);
    const scaffolded = await scaffoldSpecNode({
      path: project.path,
      type: "Requirement",
    });
    assert.equal(scaffolded.id, "R-0008");
  });

  test("refuses a type the canon does not have, and lists all twenty-two", async () => {
    const project = await newProject();
    await says(
      scaffoldSpecNode({ path: project.path, type: "Widget" }),
      "invalid",
      "Unknown node type: Widget. The canon's types are Term, DomainEntity, Goal, Actor, UseCase, Scenario, SystemResponsibility, Requirement, AcceptanceCriterion, Constraint, ModuleDesign, Interface, DataSchema, ImplementationTask, Journal, WorkLog, Evidence, VerificationReport, Finding, Assumption, Question, Decision.",
    );
  });

  test("refuses a folder that is in no project", async () => {
    const outside = await mkdtemp(path.join(workspace, "loose-"));
    await says(
      scaffoldSpecNode({ path: outside, type: "Term" }),
      "missing",
      `Not a Shall project: ${outside} — no folder here or above it holds a .shall/project.json.`,
    );
  });
});

describe("checkSpec", () => {
  test("finds the project by walking up, and needs no registry entry", async () => {
    // Built by hand, so nothing here has ever been opened in the UI — which is
    // the state a fresh clone arrives in.
    const root = await mkdtemp(path.join(workspace, "clone-"));
    await mkdir(path.join(root, ".shall", "spec", "intent", "Requirement"), {
      recursive: true,
    });
    await writeFile(
      path.join(root, ".shall", "project.json"),
      `${JSON.stringify({ id: "cloned", name: "cloned", schemaVersion: 1 }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(root, ".shall", "spec", "intent", "Requirement", "R-0001.md"),
      [
        "---",
        "short_name: r-0001",
        "name: The node called R-0001",
        "---",
        "",
        "## Statement",
        "",
        "The daemon refuses a malformed id.",
        "",
        "## Description",
        "",
        "Every door judges the id before it judges anything else.",
        "",
      ].join("\n"),
      "utf8",
    );

    const deep = path.join(root, "src", "service");
    await mkdir(deep, { recursive: true });
    const check = await checkSpec(deep);
    assert.equal(check.root, root);
    assert.equal(check.nodeCount, 1);
    assert.equal(check.edgeCount, 0);
    assert.deepEqual(check.problems, []);
    assert.deepEqual(check.notes, []);
  });

  test("refuses a folder that is in no project", async () => {
    const outside = await mkdtemp(path.join(workspace, "loose-"));
    await says(
      checkSpec(outside),
      "missing",
      `Not a Shall project: ${outside} — no folder here or above it holds a .shall/project.json.`,
    );
  });

  test("separates what it refused from what it merely noticed", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    await node(project, "Requirement", "R-0002", REQUIREMENT_BODY);

    // Valid and not canonical: a comment a person left in the frontmatter,
    // which reads perfectly well and which the next save will rewrite away.
    const target = path.join(
      project.path,
      ".shall",
      "spec",
      "intent",
      "Requirement",
      "R-0002.md",
    );
    const canonical = await readFile(target, "utf8");
    await writeFile(
      target,
      canonical.replace("---\n", "---\n# left here by hand\n"),
      "utf8",
    );

    // Refused outright: not a spec file at all.
    await writeFile(
      path.join(
        project.path,
        ".shall",
        "spec",
        "intent",
        "Requirement",
        "R-0009.md",
      ),
      "just some notes\n",
      "utf8",
    );

    const check = await checkSpec(project.path);
    assert.equal(check.nodeCount, 2);
    assert.deepEqual(check.problems, [
      {
        file: "intent/Requirement/R-0009.md",
        message:
          'R-0009.md does not begin with a "---" frontmatter block, so it cannot be read as a spec node.',
      },
    ]);
    assert.deepEqual(check.notes, [
      {
        file: "intent/Requirement/R-0002.md",
        message:
          "R-0002.md is valid but not canonical — a save from the UI will rewrite it and drop comments and ordering.",
      },
    ]);
  });

  test("a file the daemon wrote is canonical, so it draws no note", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION_BODY);
    await createSpecEdge({
      projectId: project.id,
      type: "HAS_CRITERION",
      fromId: "R-0001",
      toId: "AC-0001",
    });
    const check = await checkSpec(project.path);
    assert.equal(check.nodeCount, 2);
    assert.equal(check.edgeCount, 1);
    assert.deepEqual(check.problems, []);
    assert.deepEqual(check.notes, []);
  });

  test("a relation to an id nothing answers to is a gap, and the relation stays in the file", async () => {
    // A Goal, because it is rootless: what this test watches is the missing
    // target alone, with no orphan sentence of the source's own muddying it.
    const project = await newProject();
    await node(project, "Goal", "G-0001", GOAL_BODY);
    await node(project, "Question", "Q-0001", "## Question\n\nWhy?");
    await createSpecEdge({
      projectId: project.id,
      type: "RAISES",
      fromId: "G-0001",
      toId: "Q-0001",
    });
    // The target's file goes the way no door sanctions — by hand.
    await rm(
      path.join(project.path, ".shall", "spec", "intent", "Question", "Q-0001.md"),
    );

    const check = await checkSpec(project.path);
    // The node is still in the count and the relation is not: a gap costs the
    // graph its holding-together, never a file.
    assert.equal(check.nodeCount, 1);
    assert.equal(check.edgeCount, 0);
    assert.deepEqual(check.problems, []);
    assert.deepEqual(check.gaps, [
      {
        file: "intent/Goal/G-0001.md",
        message:
          "G-0001 has a RAISES relation to Q-0001, and no file names Q-0001. The relation is kept as written, so writing or restoring Q-0001 attaches it again.",
      },
    ]);
    // The line is still in the source file, exactly as it was written.
    assert.ok(
      (
        await readFile(
          path.join(project.path, ".shall", "spec", "intent", "Goal", "G-0001.md"),
          "utf8",
        )
      ).includes("to: Q-0001"),
    );
    // The canvas is not asked to draw a line to a box that is not there.
    assert.deepEqual(await listSpecEdges(project.id), []);
  });

  test("a node no live anchor reaches is a gap the check names", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);

    const check = await checkSpec(project.path);
    // A gap and not a problem: the node is in the count, the file is fine,
    // and the graph does not hold until something reaches it. This is
    // deliberate pressure on a spec mid-authoring — the chain bottoms out at
    // a Goal, and the check fails until it does.
    assert.equal(check.nodeCount, 1);
    assert.deepEqual(check.problems, []);
    assert.deepEqual(check.gaps, [
      {
        file: "intent/Requirement/R-0001.md",
        message:
          "R-0001 is a Requirement with no live anchor — it is held to the graph by a REQUIRES relation into it, and none stands. Draw the relation, or remove the node.",
      },
    ]);
  });

  test("a work log whose evidence claims outside its task's aim is a gap at both ends", async () => {
    // The aim rule is grammar: it names the seam under the log and under the
    // evidence, in words a person can act on from either file.
    const project = await newProject();
    for (const [type, id] of [
      ["Goal", "G-0001"],
      ["Actor", "A-0001"],
      ["UseCase", "UC-0001"],
      ["Scenario", "SC-0001"],
      ["SystemResponsibility", "SR-0001"],
      ["Requirement", "R-0001"],
      ["AcceptanceCriterion", "AC-0001"],
      ["AcceptanceCriterion", "AC-0002"],
      ["ImplementationTask", "IT-0001"],
      ["Journal", "J-0001"],
      ["WorkLog", "WL-0001"],
      ["Evidence", "EV-0001"],
    ] as const) {
      await node(project, type, id, GOAL_BODY);
    }
    for (const [type, fromId, toId] of [
      ["PURSUED_BY", "G-0001", "A-0001"],
      ["PERFORMS", "A-0001", "UC-0001"],
      ["DETAILS", "UC-0001", "SC-0001"],
      ["DERIVES_RESPONSIBILITY", "SC-0001", "SR-0001"],
      ["REQUIRES", "SR-0001", "R-0001"],
      ["HAS_CRITERION", "R-0001", "AC-0001"],
      ["HAS_CRITERION", "R-0001", "AC-0002"],
      ["TARGETS", "IT-0001", "AC-0001"],
      ["LOGS", "J-0001", "WL-0001"],
      ["ADDRESSES", "WL-0001", "IT-0001"],
      ["SUBMITS", "WL-0001", "EV-0001"],
      ["CLAIMS", "EV-0001", "AC-0002"],
    ] as const) {
      await createSpecEdge({ projectId: project.id, type, fromId, toId });
    }
    const check = await checkSpec(project.path);
    assert.deepEqual(check.problems, []);
    assert.deepEqual(check.gaps, [
      {
        file: "execution/Evidence/EV-0001.md",
        message:
          "EV-0001 claims AC-0002, but the work log that submitted it, WL-0001, addresses IT-0001, which targets AC-0001 — a work log's evidence claims only the criteria its task targets.",
      },
      {
        file: "execution/WorkLog/WL-0001.md",
        message:
          "WL-0001 addresses IT-0001, which targets AC-0001, but submits EV-0001, which claims AC-0002 — a work log's evidence claims only the criteria its task targets.",
      },
    ]);
  });

  test("a task aiming at two criteria is one gap, under the task's own file", async () => {
    // The aim rule's third clause reads one file, so it files one row — and
    // it files it under the task, which is where both TARGETS lines are.
    const project = await newProject();
    for (const [type, id] of [
      ["Goal", "G-0001"],
      ["Actor", "A-0001"],
      ["UseCase", "UC-0001"],
      ["Scenario", "SC-0001"],
      ["SystemResponsibility", "SR-0001"],
      ["Requirement", "R-0001"],
      ["AcceptanceCriterion", "AC-0001"],
      ["AcceptanceCriterion", "AC-0002"],
      ["ModuleDesign", "MD-0001"],
      ["ImplementationTask", "IT-0001"],
    ] as const) {
      await node(project, type, id, GOAL_BODY);
    }
    for (const [type, fromId, toId] of [
      ["PURSUED_BY", "G-0001", "A-0001"],
      ["PERFORMS", "A-0001", "UC-0001"],
      ["DETAILS", "UC-0001", "SC-0001"],
      ["DERIVES_RESPONSIBILITY", "SC-0001", "SR-0001"],
      ["REQUIRES", "SR-0001", "R-0001"],
      ["HAS_CRITERION", "R-0001", "AC-0001"],
      ["HAS_CRITERION", "R-0001", "AC-0002"],
      ["IS_REALIZED_BY", "SR-0001", "MD-0001"],
      ["ALLOCATES", "MD-0001", "IT-0001"],
      ["TARGETS", "IT-0001", "AC-0001"],
      ["TARGETS", "IT-0001", "AC-0002"],
    ] as const) {
      await createSpecEdge({ projectId: project.id, type, fromId, toId });
    }
    const check = await checkSpec(project.path);
    assert.deepEqual(check.problems, []);
    assert.deepEqual(check.gaps, [
      {
        file: "plan/ImplementationTask/IT-0001.md",
        message:
          "IT-0001 targets AC-0001 and AC-0002 — a task aims at one criterion at most, because a task with two aims closes neither on its own. Split the task, or remove the TARGETS line this work is not for.",
      },
    ]);
  });

  test("a ledger nobody has written yet is no problem at all", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001", GOAL_BODY);
    const check = await checkSpec(project.path);
    assert.deepEqual(check.problems, []);
    assert.deepEqual(check.gaps, []);
    assert.equal(check.nodeCount, 1);
  });

  test("a ledger the check cannot read is a problem row, and the node count still holds", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001", GOAL_BODY);
    const ledger = path.join(project.path, ".shall", "ledger", "approvals.yaml");
    await mkdir(path.dirname(ledger), { recursive: true });
    await writeFile(ledger, "G-0001: approved\n", "utf8");

    const check = await checkSpec(project.path);
    // The one row spelled from the project root: the ledger is the spec's
    // sibling, and it goes first — before any node file — because a person
    // should hear that the ledger would not read before a list of files.
    assert.deepEqual(check.problems, [
      {
        file: ".shall/ledger/approvals.yaml",
        message:
          "Every record in the approval ledger is a map of exactly approvedHash, by and at, each of them text — the record under G-0001 is not.",
      },
    ]);
    assert.equal(check.nodeCount, 1);
    assert.deepEqual(check.gaps, []);
  });

  test("the other two books are read as well, and each names itself", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001", GOAL_BODY);
    const ledgerDir = path.join(project.path, ".shall", "ledger");
    await mkdir(ledgerDir, { recursive: true });
    await writeFile(
      path.join(ledgerDir, "rejections.yaml"),
      "- G-0001\n",
      "utf8",
    );

    let check = await checkSpec(project.path);
    assert.deepEqual(check.problems, [
      {
        file: ".shall/ledger/rejections.yaml",
        message:
          "The rejection ledger is a list, not a map from node id to rejection record.",
      },
    ]);
    // The graph is still counted whole: an unreadable book is one row, not a
    // reason to stop reading the folder.
    assert.equal(check.nodeCount, 1);
    assert.deepEqual(check.gaps, []);

    // Two bad books name both, in the order the books were read, so nobody is
    // sent back for a second run to hear about the second one.
    await writeFile(
      path.join(ledgerDir, "acceptances.yaml"),
      "- AC-0001\n",
      "utf8",
    );
    check = await checkSpec(project.path);
    assert.deepEqual(
      check.problems.map((problem) => problem.file),
      [".shall/ledger/rejections.yaml", ".shall/ledger/acceptances.yaml"],
    );
    assert.equal(
      check.problems[1]?.message,
      "The acceptance ledger is a list, not a map from node id to acceptance record.",
    );
  });

  test("a scope narrows what is reported and leaves the counts whole", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    await node(project, "Requirement", "R-0002", REQUIREMENT_BODY);
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION_BODY);

    const check = await checkSpec(project.path, [
      "intent/Requirement/R-0001.md",
    ]);
    assert.deepEqual(check.scope, ["intent/Requirement/R-0001.md"]);
    assert.deepEqual(
      check.gaps.map((gap) => gap.file),
      ["intent/Requirement/R-0001.md"],
    );
    // What the folder holds, not what was asked about: the count line is the
    // difference between the graph and the folder, and a scope moves neither.
    assert.equal(check.nodeCount, 3);
    assert.deepEqual(check.problems, []);
  });

  test("a scope takes a whole type folder, however the path is spelled", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION_BODY);
    // Two files that read perfectly well and are not written the way Shall
    // writes them, one in the folder asked about and one outside it. Only the
    // first draws a note, which is the loop that opens a file per node not
    // opening the second.
    for (const file of [
      "intent/Requirement/R-0001.md",
      "intent/AcceptanceCriterion/AC-0001.md",
    ]) {
      const target = path.join(
        project.path,
        ".shall",
        "spec",
        ...file.split("/"),
      );
      const canonical = await readFile(target, "utf8");
      await writeFile(
        target,
        canonical.replace("---\n", "---\n# left here by hand\n"),
        "utf8",
      );
    }

    for (const asked of [
      // Absolute, spec-relative with the folder named, and spec-relative with
      // the trailing slash a shell's completion leaves behind.
      path.join(project.path, ".shall", "spec", "intent", "Requirement"),
      ".shall/spec/intent/Requirement",
      "intent/Requirement/",
    ]) {
      const check = await checkSpec(project.path, [asked]);
      assert.deepEqual(check.scope, ["intent/Requirement"], asked);
      assert.deepEqual(
        check.notes.map((note) => note.file),
        ["intent/Requirement/R-0001.md"],
        asked,
      );
      assert.deepEqual(
        check.gaps.map((gap) => gap.file),
        ["intent/Requirement/R-0001.md"],
        asked,
      );
    }
  });

  test("a ledger that will not read is named whatever the scope excludes", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001", GOAL_BODY);
    const ledger = path.join(project.path, ".shall", "ledger", "approvals.yaml");
    await mkdir(path.dirname(ledger), { recursive: true });
    await writeFile(ledger, "G-0001: approved\n", "utf8");

    // A band with nothing in it: the spec rows are all out of scope, and the
    // book's row is not a spec row — an unreadable book poisons every
    // judgement in the folder, so it is never out of scope. The folder is made
    // by hand because the store makes one on the first node written into it,
    // and a scope naming a folder that is not there is refused.
    await mkdir(path.join(project.path, ".shall", "spec", "domain"), {
      recursive: true,
    });
    const check = await checkSpec(project.path, ["domain"]);
    assert.deepEqual(check.problems, [
      {
        file: ".shall/ledger/approvals.yaml",
        message:
          "Every record in the approval ledger is a map of exactly approvedHash, by and at, each of them text — the record under G-0001 is not.",
      },
    ]);
    assert.deepEqual(check.gaps, []);
    assert.deepEqual(check.notes, []);
    assert.equal(check.nodeCount, 1);
  });

  test("a scope naming nothing is refused, not answered with a clean run", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    // Unscoped, this project fails: the requirement hangs off nothing. That is
    // what makes the silence dangerous — served empty, the same misspelling
    // would print a count line and exit 0 over a graph with a hole in it.
    assert.ok((await checkSpec(project.path)).gaps.length > 0);
    await says(
      checkSpec(project.path, ["intnet"]),
      "invalid",
      "--scope names nothing under .shall/spec: intnet",
    );
    await says(
      checkSpec(project.path, ["/"]),
      "invalid",
      "--scope names a path outside .shall/spec: /",
    );
  });

  test("a folder's own row stays when the scope points inside it", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    // A type folder in the wrong band: the file below it is not in the graph,
    // and the row that says why is filed under the folder above it.
    const stray = path.join(project.path, ".shall", "spec", "plan", "Goal");
    await mkdir(stray, { recursive: true });
    await writeFile(path.join(stray, "G-0001.md"), "not read\n", "utf8");

    const check = await checkSpec(project.path, ["plan/Goal/G-0001.md"]);
    assert.deepEqual(check.problems, [
      {
        file: "plan/Goal",
        message:
          "plan/Goal is a Goal folder in the wrong band — a Goal lives in intent/Goal. Every node file inside it is left out until the folder moves.",
      },
    ]);
  });
});

describe("a hand edit the daemon never made", () => {
  test("is served without a restart, because every query reads the folder again", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT_BODY);
    const target = path.join(
      project.path,
      ".shall",
      "spec",
      "intent",
      "Requirement",
      "R-0001.md",
    );
    const canonical = await readFile(target, "utf8");
    await writeFile(
      target,
      canonical.replace(
        "name: The node called R-0001",
        "name: Renamed by hand",
      ),
      "utf8",
    );
    const [only] = await listSpecNodes(project.id);
    assert.ok(only);
    assert.equal(only.name, "Renamed by hand");
  });
});
