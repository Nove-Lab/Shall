import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { bandFolderOf, NODE_TYPES } from "@shall/core/graph";
import {
  ACCEPTANCES_FILE,
  emitTemplate,
  LEDGER_FILE,
  REJECTIONS_FILE,
} from "@shall/core/serialize";
import type { ProjectMetadata } from "../types.js";
import { temporaryName, writeByRename } from "./atomic-write.js";
import { getShallHome, isShallHomePath } from "./shall-home.js";

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a path is there at all, which is not the same question as whether
 * this process may look at it.
 *
 * `pathExists` answers no to both, and for its callers that is right: a folder
 * Shall cannot enter is one it cannot use either way. It is wrong for anything
 * that turns the answer into a sentence, because "there is nothing there" is a
 * lie about a folder somebody else owns — so this one answers yes to everything
 * except a path that genuinely is not there, and leaves the reason to whoever
 * tries to read it.
 */
export async function isReachable(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
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

/** The spec graph itself: `<band>/<Type>/<id>.md`, one committed file per node. */
export function getProjectSpecPath(projectPath: string): string {
  return path.join(getProjectShallPath(projectPath), "spec");
}

/**
 * The approval ledger, beside the spec and committed with it: one YAML map
 * from node id to the latest approval. Only the daemon writes it. Nothing
 * creates it ahead of time — git carries no empty folder, and unlike `spec/`
 * no person ever opens it by hand — so the first approval makes it, folder
 * and all, and a project that has approved nothing has no ledger to find.
 */
export function getProjectLedgerPath(projectPath: string): string {
  return path.join(getProjectShallPath(projectPath), LEDGER_FILE);
}

/**
 * The rejection ledger, beside the approvals in the same folder: one YAML map
 * from node id to the latest refusal a person wrote down. It arrives the same
 * way — nothing makes it ahead of time, the first rejection makes it, and a
 * project nobody has refused anything in has no such file.
 */
export function getProjectRejectionsPath(projectPath: string): string {
  return path.join(getProjectShallPath(projectPath), REJECTIONS_FILE);
}

/**
 * The acceptance ledger, the third book in that folder: one YAML map from an
 * acceptance criterion's id to the evidence a person closed it on. Same
 * manners as the other two — made by the first closing and by nothing else.
 */
export function getProjectAcceptancesPath(projectPath: string): string {
  return path.join(getProjectShallPath(projectPath), ACCEPTANCES_FILE);
}

/**
 * The 22 reference templates, regenerated under Shall's own home — one set for
 * the machine, not one per project. A project carries its spec and nothing
 * else; the starting shapes are Shall's to keep current, and a copy in every
 * repository was a copy that went stale the day Shall was upgraded.
 */
export function getSharedTemplatesPath(): string {
  return path.join(getShallHome().root, "templates");
}

/** Where an older Shall wrote its per-project copy — read only to remove it. */
export function getProjectTemplatesPath(projectPath: string): string {
  return path.join(getProjectShallPath(projectPath), "templates");
}

/**
 * One node file's text, or null when nothing is there.
 *
 * `<band>/<Type>/<id>.md` is `core/store`'s layout and this is the only place
 * the daemon repeats it — `checkSpec` needs the BYTES of a file the loader
 * already read as a node, to say whether they are the bytes Shall would have
 * written, and the loader hands back nodes rather than text. A file that
 * vanished between the two reads is not an error: it is a node the next check
 * will not mention either.
 */
export async function readSpecNodeFile(
  specPath: string,
  type: string,
  id: string,
): Promise<string | null> {
  const band = bandFolderOf(type);
  if (band === null) {
    return null;
  }
  try {
    return await readFile(path.join(specPath, band, type, `${id}.md`), "utf8");
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
 * The 22 templates, WRITTEN ONLY WHERE THE BYTES DIFFER.
 *
 * `emitTemplate` is a pure function of the canon, so regenerating is
 * byte-idempotent and this can run on every start and every open. Comparing
 * first keeps the folder's mtimes quiet when there is nothing to do.
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
      // reading a template never reads half of one.
      await writeByRename(target, text);
    }),
  );
  // A template for a type the canon no longer has is removed: it would teach
  // an agent to write a node the loader refuses by folder name. The folder is
  // Shall's own generated output, so nothing here is anybody's to keep.
  const known = new Set(NODE_TYPES.map((entry) => `${entry.name}.md`));
  const entries = await readdir(directory).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".md") && !known.has(entry))
      .map((entry) => rm(path.join(directory, entry), { force: true })),
  );
}

/** The reference set under `~/.shall/templates`, brought current. */
export async function writeSharedTemplates(): Promise<void> {
  await writeTemplatesInto(getSharedTemplatesPath());
}

/**
 * An older Shall committed a template set into every project, and a stale set
 * is worse than none: an agent reading one would learn a format the daemon no
 * longer writes. The folder is Shall's own generated output, so it is removed
 * whole — the deletion shows up in `git status`, which is how the person hears
 * that templates moved to `~/.shall/templates`.
 */
export async function removeProjectTemplates(projectPath: string): Promise<void> {
  await rm(getProjectTemplatesPath(projectPath), {
    recursive: true,
    force: true,
  });
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
 * ONE RULE, AND IT IS THE STORE'S OWN. Every write lands as
 * `<name>.<pid>.<random>.tmp` and is renamed onto its target, and a crash
 * between the two must not leave a stray a person is asked to commit.
 *
 * `shall.db`, `shall.db-wal` and `shall.db-shm` stood above it until the last
 * folder holding one was cleared. The database went when the spec became
 * files; the three lines outlived it only so a leftover would not surface in
 * somebody's `git status`, and they were the last mention of sqlite the daemon
 * made. A folder that still has one is not a case an ignore rule has to
 * answer — the file is dead weight, and deleting it is the answer.
 */
const GITIGNORE = "*.tmp\n";

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
      // The templates are not here: they are Shall's reference set under
      // `~/.shall/templates`, and `shall add-spec-node` writes a node's
      // starting file straight into the spec.
      mkdir(path.join(temporaryPath, "spec"), { recursive: false }),
    ]);
    await rename(temporaryPath, shallPath);
  } catch (error) {
    await rm(temporaryPath, { recursive: true, force: true });
    throw error;
  }
}
