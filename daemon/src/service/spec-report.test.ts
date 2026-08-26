import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import { isRefusal, type Refusal } from "./errors.js";
import { createProject } from "./projects.js";
import { createSpecEdge, createSpecNode } from "./spec-graph.js";
import { generateReport, reportAt } from "./spec-report.js";
import type { RegistryProject } from "../types.js";

/**
 * The report over real folders and real books.
 *
 * WHAT IS ASSERTED IS THE WRITE AND ITS FENCES. `core/report`'s own tests
 * hold what the pages say; this file holds the door — that generation lands
 * the file set under `shall/report/` and nowhere else, that the folder
 * ignores itself in git, that `.shall/` is not touched by so much as a byte,
 * that a regeneration prunes what the generator no longer emits, and that an
 * unreadable book refuses the whole report before a file is written.
 */

let workspace = "";

before(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "shall-report-"));
  const home = path.join(workspace, "home");
  await mkdir(home, { recursive: true });
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = path.join(home, ".config");
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});

const NODES: readonly (readonly [string, string])[] = [
  ["Goal", "G-0001"],
  ["Actor", "A-0001"],
  ["UseCase", "UC-0001"],
  ["Scenario", "SC-0001"],
  ["SystemResponsibility", "SR-0001"],
  ["Requirement", "R-0001"],
  ["AcceptanceCriterion", "AC-0001"],
  ["Module", "M-0001"],
  ["WorkItem", "WI-0001"],
  ["Journal", "J-0001"],
  ["WorkLog", "WL-0001"],
  ["Evidence", "EV-0001"],
  ["CompletionReport", "CR-0001"],
];

const EDGES: readonly (readonly [string, string, string])[] = [
  ["PURSUED_BY", "G-0001", "A-0001"],
  ["PERFORMS", "A-0001", "UC-0001"],
  ["DETAILS", "UC-0001", "SC-0001"],
  ["DERIVES_RESPONSIBILITY", "SC-0001", "SR-0001"],
  ["REQUIRES", "SR-0001", "R-0001"],
  ["HAS_CRITERION", "R-0001", "AC-0001"],
  ["IS_REALIZED_BY", "SR-0001", "M-0001"],
  ["ALLOCATES", "M-0001", "WI-0001"],
  ["TARGETS", "WI-0001", "AC-0001"],
  ["LOGS", "J-0001", "WL-0001"],
  ["ADDRESSES", "WL-0001", "WI-0001"],
  ["SUBMITS", "WL-0001", "EV-0001"],
  ["CLAIMS", "EV-0001", "AC-0001"],
  ["SUBMITS", "WL-0001", "CR-0001"],
  ["CLAIMS", "CR-0001", "WI-0001"],
];

async function draftedProject(): Promise<RegistryProject> {
  const project = await createProject(
    await mkdtemp(path.join(workspace, "project-")),
  );
  for (const [type, id] of NODES) {
    await createSpecNode({
      projectId: project.id,
      type,
      id,
      shortName: id.toLowerCase(),
      name: `The node called ${id}`,
      body: `What ${id} says.`,
    });
  }
  for (const [type, fromId, toId] of EDGES) {
    await createSpecEdge({ projectId: project.id, type, fromId, toId });
  }
  return project;
}

/** Every file under `root`, relative and `/`-separated, with its bytes. */
async function snapshot(root: string): Promise<Map<string, string>> {
  const entries = await readdir(root, {
    withFileTypes: true,
    recursive: true,
  }).catch(() => []);
  const files = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const absolute = path.join(entry.parentPath, entry.name);
    files.set(
      path.relative(root, absolute).split(path.sep).join("/"),
      await readFile(absolute, "utf8"),
    );
  }
  return files;
}

describe("the report service", () => {
  test("lands the file set, the self-ignore, and not one byte of .shall", async () => {
    const project = await draftedProject();
    const specBefore = await snapshot(path.join(project.path, ".shall"));

    const generated = await generateReport(project.id);

    assert.equal(generated.root, project.path);
    assert.equal(generated.index, path.join(project.path, "shall", "report", "index.html"));

    const written = await snapshot(generated.dir);
    for (const file of [
      "index.html",
      "assets/report.css",
      "chapters/01-terms.html",
      "chapters/02-goals.html",
      "chapters/03-actors.html",
      "chapters/04-responsibilities.html",
      "chapters/05-requirements.html",
      "chapters/06-design.html",
      "chapters/07-progress.html",
      "nodes/AC-0001.html",
      "nodes/J-0001.html",
      "nodes/WL-0001.html",
      "nodes/EV-0001.html",
      "nodes/CR-0001.html",
    ]) {
      assert.ok(written.has(file), `${file} was not written`);
    }
    assert.equal(generated.pages, written.size);

    assert.equal(
      await readFile(path.join(project.path, "shall", ".gitignore"), "utf8"),
      "*\n",
    );

    // The index is stamped; a project fresh from `git init` has no commit,
    // and the stamp says nothing about one rather than something wrong.
    const index = written.get("index.html") ?? "";
    assert.match(index, /Generated \d{4}-\d{2}-\d{2}/);
    assert.doesNotMatch(index, /commit/);

    const specAfter = await snapshot(path.join(project.path, ".shall"));
    assert.deepEqual([...specAfter.entries()], [...specBefore.entries()]);
  });

  test("regeneration prunes the page of a node that is gone", async () => {
    const project = await draftedProject();
    await generateReport(project.id);
    const evidencePage = path.join(
      project.path, "shall", "report", "nodes", "EV-0001.html",
    );
    assert.ok((await readFile(evidencePage, "utf8")).length > 0);

    // A hand delete is a supported reality — the file is the node.
    await rm(
      path.join(project.path, ".shall", "spec", "execution", "Evidence", "EV-0001.md"),
    );
    await generateReport(project.id);

    await assert.rejects(readFile(evidencePage, "utf8"));
  });

  test("reportAt walks up from anywhere inside the project", async () => {
    const project = await draftedProject();
    const inside = path.join(project.path, "src", "deep");
    await mkdir(inside, { recursive: true });

    const generated = await reportAt(inside);

    assert.equal(generated.root, project.path);
  });

  test("an unreadable book refuses the report, and writes nothing", async () => {
    const project = await draftedProject();
    // A drafted project has no books yet — the ledger folder arrives with the
    // first judgement, so the corrupt book brings its folder along.
    const book = path.join(project.path, ".shall", "ledger", "approvals.yaml");
    await mkdir(path.dirname(book), { recursive: true });
    await writeFile(book, "]", "utf8");

    let refusal: Refusal | null = null;
    await generateReport(project.id).catch((reason: unknown) => {
      refusal = isRefusal(reason) ? reason : null;
    });

    assert.ok(refusal !== null, "the refusal did not arrive as a Refusal");
    assert.match((refusal as Refusal).message, /No report was generated/);
    // A refused report leaves no `shall/` behind at all.
    await assert.rejects(readdir(path.join(project.path, "shall")));
  });
});
