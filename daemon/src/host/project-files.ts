import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { NODE_TYPES } from "@shall/core/graph";
import { emitTemplate } from "@shall/core/serialize";
import type { ProjectMetadata } from "../types.js";
import { isShallHomePath } from "./shall-home.js";

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function assertDirectory(directoryPath: string): Promise<void> {
  const details = await stat(directoryPath);
  if (!details.isDirectory()) {
    throw new Error(`Not a directory: ${directoryPath}`);
  }
}

export function getProjectShallPath(projectPath: string): string {
  return path.join(projectPath, ".shall");
}

export function getProjectMetadataPath(projectPath: string): string {
  return path.join(getProjectShallPath(projectPath), "project.json");
}

/** The spec graph itself: one folder per type, one committed file per node. */
export function getProjectSpecPath(projectPath: string): string {
  return path.join(getProjectShallPath(projectPath), "spec");
}

/** The 23 starting files, committed beside the spec they are copied into. */
export function getProjectTemplatesPath(projectPath: string): string {
  return path.join(getProjectShallPath(projectPath), "templates");
}

/**
 * One node file's text, or null when nothing is there.
 *
 * `<Type>/<id>.md` is `core/store`'s layout and this is the only place the
 * daemon repeats it — `checkSpec` needs the BYTES of a file the loader already
 * read as a node, to say whether they are the bytes Shall would have written,
 * and the loader hands back nodes rather than text. A file that vanished
 * between the two reads is not an error: it is a node the next check will not
 * mention either.
 */
export async function readSpecNodeFile(
  specPath: string,
  type: string,
  id: string,
): Promise<string | null> {
  try {
    return await readFile(path.join(specPath, type, `${id}.md`), "utf8");
  } catch {
    return null;
  }
}

/**
 * The project folder holding this path, found by walking upwards — which is how
 * `shall check` works from anywhere inside a checkout, the way `git` does.
 *
 * IT ASKS THE FILESYSTEM AND NOT THE REGISTRY, on purpose: a fresh clone has a
 * `.shall` folder and no registry entry at all, and a clone that could not be
 * checked until somebody opened it in the web UI would make the spec files less
 * portable than the repository they travel in.
 *
 * `~/.shall` is Shall's own home under the same name a project uses, so the
 * folder holding it reads as a project until it is stepped over.
 */
export async function findProjectRootAbove(
  startPath: string,
): Promise<string | null> {
  let directory = path.resolve(startPath);
  for (;;) {
    if (
      !isShallHomePath(getProjectShallPath(directory)) &&
      (await pathExists(getProjectMetadataPath(directory)))
    ) {
      return directory;
    }
    const parent = path.dirname(directory);
    // The root of the filesystem is its own parent, and it is where the walk
    // stops rather than where it loops.
    if (parent === directory) {
      return null;
    }
    directory = parent;
  }
}

export async function readProjectMetadata(
  projectPath: string,
): Promise<unknown> {
  return JSON.parse(
    await readFile(getProjectMetadataPath(projectPath), "utf8"),
  ) as unknown;
}

/**
 * A name no other write is using, which the pid alone is not.
 *
 * A pid is constant for the life of a process, so two writes to one target
 * inside one daemon — two tabs opening the same project, a double click on the
 * picker, `shall init` racing the browser — pick the same temporary name: one
 * truncates the other's bytes and the loser renames a file that has already
 * been moved away. The pid is kept because it says WHO left a stray file
 * behind; the random tail says which write. `*.tmp` still matches, so the
 * ignore rule below does not change.
 */
function temporaryName(target: string): string {
  return `${target}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
}

/**
 * Written beside the target and moved onto it, so nothing ever reads half a
 * file, and swept up if the write fails so a crash leaves no litter.
 */
async function writeByRename(target: string, text: string): Promise<void> {
  const temporary = temporaryName(target);
  try {
    await writeFile(temporary, text, "utf8");
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function writeProjectMetadata(
  projectPath: string,
  metadata: ProjectMetadata,
): Promise<void> {
  await writeByRename(
    getProjectMetadataPath(projectPath),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
}

/**
 * The 23 templates, WRITTEN ONLY WHERE THE BYTES DIFFER.
 *
 * `emitTemplate` is a pure function of the registry, so regenerating is
 * byte-idempotent and this can run on every open. Comparing first is what keeps
 * `git status` quiet: a project whose templates are current keeps their mtimes
 * and shows no change, and a Shall upgrade that widens a vocabulary shows up as
 * an ordinary diff a person can read and commit.
 */
async function writeTemplatesInto(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await Promise.all(
    NODE_TYPES.map(async (entry) => {
      const target = path.join(directory, `${entry.name}.md`);
      const text = emitTemplate(entry.name);
      const current = await readFile(target, "utf8").catch(() => null);
      if (current === text) {
        return;
      }
      // Landed by rename like every other file Shall writes, so an agent
      // copying a template never reads half of one.
      await writeByRename(target, text);
    }),
  );
}

export async function writeTemplates(projectPath: string): Promise<void> {
  await writeTemplatesInto(getProjectTemplatesPath(projectPath));
}

/**
 * The spec folder itself, which a project can arrive without: git carries no
 * empty folder, so a clone of a project whose graph is still empty has no
 * `spec/` at all. The type folders below it are another matter — the store
 * makes each one on the first write into it.
 */
export async function ensureProjectSpec(projectPath: string): Promise<void> {
  await mkdir(getProjectSpecPath(projectPath), { recursive: true });
}

/**
 * `shall.db` is named here and nowhere else in the daemon any more. The
 * database is gone, but a folder initialized by an older Shall still holds one,
 * and an ignore rule is the one place where deleting the line would do harm:
 * the file would appear in `git status` for everybody who has one. It is left
 * alone and left ignored.
 *
 * `*.tmp` is the store's own: every write lands as `<name>.<pid>.tmp` and is
 * renamed onto its target, and a crash between the two must not leave something
 * a person is asked to commit.
 */
const GITIGNORE = "shall.db\nshall.db-wal\nshall.db-shm\n*.tmp\n";

export async function writeProjectFiles(
  projectPath: string,
  metadata: ProjectMetadata,
): Promise<void> {
  const shallPath = getProjectShallPath(projectPath);
  // Unique per call like every other temporary here, and for a sharper reason:
  // two initializations racing on one folder would otherwise pick the same
  // name, and the loser's cleanup would delete the winner's half-built folder
  // out from under it.
  const temporaryPath = temporaryName(shallPath);

  if (await pathExists(shallPath)) {
    throw new Error(`Folder is already initialized: ${projectPath}`);
  }

  await mkdir(temporaryPath, { recursive: false });
  try {
    await Promise.all([
      writeFile(
        path.join(temporaryPath, "project.json"),
        `${JSON.stringify(metadata, null, 2)}\n`,
        "utf8",
      ),
      writeFile(path.join(temporaryPath, ".gitignore"), GITIGNORE, "utf8"),
      // Empty, and the first commit will not carry it. It is made anyway so
      // that a person who opens the folder sees where their nodes will go.
      mkdir(path.join(temporaryPath, "spec"), { recursive: false }),
      writeTemplatesInto(path.join(temporaryPath, "templates")),
    ]);
    await rename(temporaryPath, shallPath);
  } catch (error) {
    await rm(temporaryPath, { recursive: true, force: true });
    throw error;
  }
}
