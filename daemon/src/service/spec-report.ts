import { mkdir, readdir, readFile, rm, rmdir } from "node:fs/promises";
import path from "node:path";
import { colorContextOf, reviewGraph, vitalsOf, type ReviewStatus } from "@shall/core/arith";
import { reportFilesOf, type ReportFile } from "@shall/core/report";
import { loadGraph } from "@shall/core/store";
import { writeByRename } from "../host/atomic-write.js";
import { runGit } from "../host/git-cli.js";
import { readProjectMetadata } from "../host/project-files.js";
import { isProjectMetadata } from "./project-model.js";
import { projectRootAt, projectSpecFor, specPathsOf, type SpecPaths } from "./spec-graph.js";
import { requireLedgers } from "./spec-review.js";

/**
 * The report: the whole spec assembled into static HTML under
 * `<project>/shall/report/`, for a manager who has never opened Shall.
 *
 * THE DAEMON'S SHARE IS I/O AND NOTHING ELSE. What the report says is
 * `@shall/core/report`'s — this file loads the graph the way every read
 * surface does, gathers the three facts core has no organ for (the clock,
 * the repository head, the project's name) and writes what comes back.
 * `.shall/` is never opened for writing here: the report is a derivative and
 * the spec stays the one truth.
 *
 * `shall/` IS SHALL'S OWN OUTPUT FOLDER, so it ignores itself: a
 * `.gitignore` holding `*` is written beside the report, the same move
 * `.shall/.gitignore` makes — the user's root .gitignore is nobody's to
 * edit. And because every generation is the whole report again, files the
 * generator no longer emits are pruned; nothing under `shall/report/` is
 * anybody's to keep, exactly as the shared templates argue.
 */

export interface GeneratedReport {
  root: string;
  dir: string;
  index: string;
  pages: number;
}

const REPORT_DIR = ["shall", "report"] as const;

/** Byte-compare before writing, so an unchanged page keeps a quiet mtime. */
async function writeIfChanged(target: string, content: string): Promise<void> {
  if ((await readFile(target, "utf8").catch(() => null)) === content) {
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeByRename(target, content);
}

/** Every file under `dir`, report-relative and `/`-separated. */
async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(
    () => [],
  );
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(dir, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/"),
    );
}

/** Deletes what this generation did not write, then any emptied folders. */
async function prune(dir: string, written: ReadonlySet<string>): Promise<void> {
  for (const file of await filesUnder(dir)) {
    if (!written.has(file)) {
      await rm(path.join(dir, ...file.split("/")), { force: true });
    }
  }
  const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(
    () => [],
  );
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort((a, b) => b.length - a.length);
  for (const folder of folders) {
    // Empties only: rmdir refuses a folder with anything left in it.
    await rmdir(folder).catch(() => undefined);
  }
}

async function projectNameOf(projectPath: string): Promise<string> {
  const metadata = await readProjectMetadata(projectPath).catch(() => null);
  return isProjectMetadata(metadata) ? metadata.name : path.basename(projectPath);
}

export async function reportOver(paths: SpecPaths): Promise<GeneratedReport> {
  const ledgers = await requireLedgers(paths, "report");
  const graph = await loadGraph(paths.specDir);
  const context = colorContextOf(graph, ledgers);
  const statuses = new Map<string, ReviewStatus>(
    reviewGraph(graph, ledgers, context).statuses.map((status) => [status.id, status]),
  );
  const vitals = vitalsOf(graph, ledgers);

  const head = await runGit(paths.projectPath, ["rev-parse", "HEAD"]);
  const files: ReportFile[] = reportFilesOf({
    graph,
    statuses,
    context,
    vitals,
    stamp: {
      projectName: await projectNameOf(paths.projectPath),
      generatedAt: new Date().toISOString(),
      gitHead: head.kind === "ok" ? head.stdout.trim() : null,
    },
  });

  const dir = path.join(paths.projectPath, ...REPORT_DIR);
  await Promise.all(
    files.map((file) =>
      writeIfChanged(path.join(dir, ...file.path.split("/")), file.content),
    ),
  );
  await writeIfChanged(path.join(paths.projectPath, "shall", ".gitignore"), "*\n");
  await prune(dir, new Set(files.map((file) => file.path)));

  return {
    root: paths.projectPath,
    dir,
    index: path.join(dir, "index.html"),
    pages: files.length,
  };
}

/** The CLI's door: wherever it was asked from, the project above it. */
export async function reportAt(startPath: string): Promise<GeneratedReport> {
  return reportOver(specPathsOf(await projectRootAt(startPath)));
}

/** The web's door: a project the registry knows. */
export async function generateReport(projectId: string): Promise<GeneratedReport> {
  return reportOver(await projectSpecFor(projectId));
}

/** Where a generated report lives — the serving route's one question. */
export function reportDirOf(projectPath: string): string {
  return path.join(projectPath, ...REPORT_DIR);
}
