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

/** A Requirement with every required slot filled and nothing wrong with it. */
const REQUIREMENT: Record<string, string> = {
  statement: "The daemon refuses a malformed id.",
  description: "Every door judges the id before it judges anything else.",
  requirement_type: "functional",
  priority: "high",
};

const CRITERION: Record<string, string> = {
  statement: "A malformed id is refused.",
  description: "The refusal names the shape an id may take.",
  evaluation_process: "Send one and read the sentence.",
};

const GOAL: Record<string, string> = {
  statement: "The spec travels with the repository.",
};

function values(
  id: string,
  attributes: Record<string, string>,
): { shortName: string; name: string; attributes: Record<string, string> } {
  return {
    shortName: id.toLowerCase(),
    name: `The node called ${id}`,
    attributes,
  };
}

async function node(
  project: RegistryProject,
  type: string,
  id: string,
  attributes: Record<string, string>,
): Promise<void> {
  await createSpecNode({
    projectId: project.id,
    type,
    id,
    ...values(id, attributes),
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
        ...values("R-0001", REQUIREMENT),
      }),
      "invalid",
      "Unknown node type: Nope",
    );
  });

  test("names every empty required slot at once", async () => {
    const project = await newProject();
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Requirement",
        id: "R-0001",
        ...values("R-0001", {
          ...REQUIREMENT,
          statement: "",
          description: "   ",
        }),
      }),
      "invalid",
      "A Requirement requires Statement, Description.",
    );
  });

  test("refuses an attribute the type does not carry, in stored names", async () => {
    const project = await newProject();
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Requirement",
        id: "R-0001",
        ...values("R-0001", { ...REQUIREMENT, definition: "a definition" }),
      }),
      "invalid",
      "A Requirement does not carry definition. It carries statement, description, requirement_type, priority, rationale and nothing else.",
    );
  });

  test("refuses a value outside a choice's vocabulary", async () => {
    const project = await newProject();
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Requirement",
        id: "R-0001",
        ...values("R-0001", { ...REQUIREMENT, priority: "urgent" }),
      }),
      "invalid",
      "Priority must be one of high, medium, low.",
    );
  });

  test("refuses a line break in a one-line value", async () => {
    const project = await newProject();
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Requirement",
        id: "R-0001",
        ...values("R-0001", {
          ...REQUIREMENT,
          statement: "The daemon refuses\na malformed id.",
        }),
      }),
      "invalid",
      "Statement is one line, so it cannot contain a line break.",
    );
  });

  test("refuses more than the byte cap", async () => {
    const project = await newProject();
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Requirement",
        id: "R-0001",
        ...values("R-0001", {
          ...REQUIREMENT,
          statement: "a".repeat(TEXT_BYTE_CAP + 1),
        }),
      }),
      "invalid",
      "Statement cannot hold more than 256 KiB of text.",
    );
  });

  test("refuses an id no filesystem could carry", async () => {
    const project = await newProject();
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Requirement",
        id: "R 0001",
        ...values("R-0001", REQUIREMENT),
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
        ...values("R-0001", REQUIREMENT),
      }),
      "invalid",
      "An id is required.",
    );
  });

  test("refuses an id another node has taken", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT);
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Requirement",
        id: "R-0001",
        ...values("R-0001", REQUIREMENT),
      }),
      "conflict",
      "R-0001 is already used by another node. Choose another id.",
    );
  });

  test("refuses an id that differs from a taken one only in case", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT);
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Requirement",
        id: "r-0001",
        ...values("r-0001", REQUIREMENT),
      }),
      "conflict",
      "r-0001 differs only in case from R-0001, and two such files cannot sit side by side on every filesystem. Choose another id.",
    );
  });

  test("refuses an id taken by a node of another type, because an edge names a bare id", async () => {
    const project = await newProject();
    await node(project, "Requirement", "X-0001", REQUIREMENT);
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Goal",
        id: "X-0001",
        ...values("X-0001", GOAL),
      }),
      "conflict",
      "X-0001 is already used by another node. Choose another id.",
    );
  });

  test("answers the taken id before it answers a blank name, as it always did", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT);
    await says(
      createSpecNode({
        projectId: project.id,
        type: "Requirement",
        id: "R-0001",
        shortName: "  ",
        name: "The node called R-0001",
        attributes: REQUIREMENT,
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
        attributes: REQUIREMENT,
      }),
      "invalid",
      "A short name is required.",
    );
  });

  test("writes a file that reads back as the node it answered with", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT);
    const nodes = await listSpecNodes(project.id);
    assert.deepEqual(
      nodes.map((entry) => [entry.id, entry.type, entry.shortName]),
      [["R-0001", "Requirement", "r-0001"]],
    );
    const [only] = nodes;
    assert.ok(only);
    assert.deepEqual(only.attributes, REQUIREMENT);
    // The two stamps are the file's one mtime, so they arrive equal.
    assert.equal(only.createdAt, only.updatedAt);
    assert.ok(only.createdAt > 0);
  });
});

describe("the edit door", () => {
  test("refuses an id nothing answers to", async () => {
    const project = await newProject();
    await says(
      updateSpecNode({
        projectId: project.id,
        id: "R-9999",
        ...values("R-9999", REQUIREMENT),
      }),
      "missing",
      "Unknown node: R-9999",
    );
  });

  test("judges the attributes against the type the file states", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT);
    await says(
      updateSpecNode({
        projectId: project.id,
        id: "R-0001",
        ...values("R-0001", { ...REQUIREMENT, requirement_type: "other" }),
      }),
      "invalid",
      "Requirement Type must be one of functional, non_functional.",
    );
  });

  test("refuses to save over a file somebody has edited into a state Shall cannot read", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT);
    // A hand edit that drops the statement and the whole Description section:
    // the file is still YAML and still a Requirement, and it is no longer a
    // node. Saving the panel's copy over it would throw the edit away.
    await writeFile(
      path.join(project.path, ".shall", "spec", "Requirement", "R-0001.md"),
      "---\nshort_name: r-0001\nname: The node called R-0001\nrequirement_type: functional\npriority: high\n---\n",
      "utf8",
    );
    await says(
      updateSpecNode({
        projectId: project.id,
        id: "R-0001",
        ...values("R-0001", REQUIREMENT),
      }),
      "conflict",
      "Requirement/R-0001.md has been edited into a state Shall cannot read — A Requirement requires Statement, Description. Nothing was written, so that edit is still there to fix.",
    );
    // Nothing was written: the edit is still there, exactly as it was left.
    const held = await readFile(
      path.join(project.path, ".shall", "spec", "Requirement", "R-0001.md"),
      "utf8",
    );
    assert.match(held, /^---\nshort_name: r-0001\n/);
  });

  test("keeps the relations the edit never mentioned", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT);
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION);
    await createSpecEdge({
      projectId: project.id,
      type: "HAS_CRITERION",
      fromId: "R-0001",
      toId: "AC-0001",
    });
    await updateSpecNode({
      projectId: project.id,
      id: "R-0001",
      ...values("R-0001", { ...REQUIREMENT, priority: "low" }),
    });
    assert.deepEqual(
      (await listSpecEdges(project.id)).map((edge) => edge.id),
      ["R-0001 HAS_CRITERION AC-0001"],
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

  test("takes every relation that touches the node with it", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT);
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION);
    await createSpecEdge({
      projectId: project.id,
      type: "HAS_CRITERION",
      fromId: "R-0001",
      toId: "AC-0001",
    });
    await removeSpecNode({ projectId: project.id, id: "AC-0001" });
    assert.deepEqual(await listSpecEdges(project.id), []);
    assert.deepEqual(
      (await listSpecNodes(project.id)).map((entry) => entry.id),
      ["R-0001"],
    );
    // The graph the panel draws is clean: the cascade left nothing dangling.
    const check = await checkSpec(project.path);
    assert.deepEqual(check.problems, []);
  });
});

describe("the edge doors", () => {
  test("refuse a source that is not there", async () => {
    const project = await newProject();
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION);
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
    await node(project, "Requirement", "R-0001", REQUIREMENT);
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
    await node(project, "Requirement", "R-0001", REQUIREMENT);
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION);
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
    await node(project, "Requirement", "R-0001", REQUIREMENT);
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION);
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

  test("say nothing further when neither direction allows anything", async () => {
    const project = await newProject();
    await node(project, "Goal", "G-0001", GOAL);
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION);
    await says(
      createSpecEdge({
        projectId: project.id,
        type: "HAS_CRITERION",
        fromId: "G-0001",
        toId: "AC-0001",
      }),
      "invalid",
      "HAS_CRITERION is not allowed from Goal to AcceptanceCriterion.",
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
    await node(project, "Requirement", "R-0001", REQUIREMENT);
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION);
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
    await node(project, "Requirement", "R-0001", REQUIREMENT);
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION);
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
  test("is initialized with a spec folder, the 23 templates and an ignore rule", async () => {
    const project = await newProject();
    const shall = path.join(project.path, ".shall");
    await assert.doesNotReject(stat(path.join(shall, "spec")));
    const templates = await readFile(
      path.join(shall, "templates", "Requirement.md"),
      "utf8",
    );
    assert.match(
      templates,
      /^---\n# Requirement — copy to \.\.\/spec\/Requirement\/<id>\.md and fill in\.\n/,
    );
    assert.equal(
      (await readFile(path.join(shall, ".gitignore"), "utf8")).includes("*.tmp"),
      true,
    );
  });

  test("opens again without rewriting a template that is already current", async () => {
    const project = await newProject();
    const target = path.join(
      project.path,
      ".shall",
      "templates",
      "Requirement.md",
    );
    const before = await stat(target);
    await openProject(project.path);
    const after = await stat(target);
    assert.equal(after.mtimeMs, before.mtimeMs);
  });

  test("puts a template back when its bytes have drifted", async () => {
    const project = await newProject();
    const target = path.join(
      project.path,
      ".shall",
      "templates",
      "Requirement.md",
    );
    const canonical = await readFile(target, "utf8");
    await writeFile(target, "# emptied by hand\n", "utf8");
    await openProject(project.path);
    assert.equal(await readFile(target, "utf8"), canonical);
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
      // Regenerating the templates and making `spec/` are conveniences, not
      // conditions of opening — reading a project must never require the right
      // to write to it, and a person who cannot be given their graph should at
      // least not be given an errno instead.
      const project = await newProject();
      const shall = path.join(project.path, ".shall");
      const templates = path.join(shall, "templates");
      const modes = [
        [shall, (await stat(shall)).mode] as const,
        [templates, (await stat(templates)).mode] as const,
      ];
      // Both halves of the regeneration have work to do: a spec folder that is
      // not there (a clone of a project whose graph is empty carries none) and a
      // template whose bytes have drifted.
      await rm(path.join(shall, "spec"), { recursive: true });
      await writeFile(
        path.join(templates, "Requirement.md"),
        "# drifted, so regeneration has work to do\n",
        "utf8",
      );
      for (const [target] of modes) {
        await chmod(target, 0o555);
      }
      try {
        const opened = await openProject(project.path);
        assert.equal(opened.id, project.id);
      } finally {
        for (const [target, mode] of modes) {
          await chmod(target, mode);
        }
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

describe("checkSpec", () => {
  test("finds the project by walking up, and needs no registry entry", async () => {
    // Built by hand, so nothing here has ever been opened in the UI — which is
    // the state a fresh clone arrives in.
    const root = await mkdtemp(path.join(workspace, "clone-"));
    await mkdir(path.join(root, ".shall", "spec", "Requirement"), {
      recursive: true,
    });
    await writeFile(
      path.join(root, ".shall", "project.json"),
      `${JSON.stringify({ id: "cloned", name: "cloned", schemaVersion: 1 }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(root, ".shall", "spec", "Requirement", "R-0001.md"),
      [
        "---",
        "short_name: r-0001",
        "name: The node called R-0001",
        "statement: The daemon refuses a malformed id.",
        "requirement_type: functional",
        "priority: high",
        "---",
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
    await node(project, "Requirement", "R-0001", REQUIREMENT);
    await node(project, "Requirement", "R-0002", REQUIREMENT);

    // Valid and not canonical: a comment a person left in the frontmatter,
    // which reads perfectly well and which the next save will rewrite away.
    const target = path.join(
      project.path,
      ".shall",
      "spec",
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
      path.join(project.path, ".shall", "spec", "Requirement", "R-0009.md"),
      "just some notes\n",
      "utf8",
    );

    const check = await checkSpec(project.path);
    assert.equal(check.nodeCount, 2);
    assert.deepEqual(check.problems, [
      {
        file: "Requirement/R-0009.md",
        message:
          'R-0009.md does not begin with a "---" frontmatter block, so it cannot be read as a spec node.',
      },
    ]);
    assert.deepEqual(check.notes, [
      {
        file: "Requirement/R-0002.md",
        message:
          "R-0002.md is valid but not canonical — a save from the UI will rewrite it and drop comments and ordering.",
      },
    ]);
  });

  test("a file the daemon wrote is canonical, so it draws no note", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT);
    await node(project, "AcceptanceCriterion", "AC-0001", CRITERION);
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
});

describe("a hand edit the daemon never made", () => {
  test("is served without a restart, because every query reads the folder again", async () => {
    const project = await newProject();
    await node(project, "Requirement", "R-0001", REQUIREMENT);
    const target = path.join(
      project.path,
      ".shall",
      "spec",
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
