import { mkdir, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getProjectMetadataPath,
  getProjectShallPath,
  pathExists,
} from "./project-files.js";
import { isShallHomePath } from "./shall-home.js";

/**
 * What a folder's `.shall` directory turns out to be:
 * - `project` — a real project, with metadata to open
 * - `root` — Shall's own home (`~/.shall`), which is not openable
 * - `none` — no `.shall`, or one with nothing in it
 */
export type ShallFolderKind = "none" | "project" | "root";

export interface DirectoryEntry {
  name: string;
  path: string;
  shall: ShallFolderKind;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  shall: ShallFolderKind;
  directories: DirectoryEntry[];
}

export async function classifyShallFolder(
  directoryPath: string,
): Promise<ShallFolderKind> {
  const shallPath = getProjectShallPath(directoryPath);
  if (isShallHomePath(shallPath)) {
    return "root";
  }
  return (await pathExists(getProjectMetadataPath(directoryPath)))
    ? "project"
    : "none";
}

export async function browseDirectories(
  requestedPath?: string,
): Promise<BrowseResult> {
  const directoryPath = path.resolve(requestedPath || os.homedir());
  const details = await stat(directoryPath);
  if (!details.isDirectory()) {
    throw new Error(`Not a directory: ${directoryPath}`);
  }

  const entries = await readdir(directoryPath, { withFileTypes: true });
  const visibleDirectories = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .sort((left, right) => left.name.localeCompare(right.name));

  const directories = await Promise.all(
    visibleDirectories.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      return {
        name: entry.name,
        path: entryPath,
        shall: await classifyShallFolder(entryPath),
      };
    }),
  );

  const parentPath = path.dirname(directoryPath);
  return {
    path: directoryPath,
    parent: parentPath === directoryPath ? null : parentPath,
    shall: await classifyShallFolder(directoryPath),
    directories,
  };
}

export async function createDirectory(
  parentPath: string,
  requestedName: string,
): Promise<string> {
  const name = requestedName.trim();
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.startsWith(".") ||
    name.includes("/") ||
    name.includes("\\")
  ) {
    throw new Error("Folder name must be a visible single directory name");
  }

  const absoluteParent = path.resolve(parentPath);
  const details = await stat(absoluteParent);
  if (!details.isDirectory()) {
    throw new Error(`Not a directory: ${absoluteParent}`);
  }

  const directoryPath = path.join(absoluteParent, name);
  await mkdir(directoryPath, { recursive: false });
  return directoryPath;
}
