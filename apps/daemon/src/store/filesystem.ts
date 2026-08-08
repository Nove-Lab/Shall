import { mkdir, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getProjectShallPath, pathExists } from "./project-files.js";

export interface DirectoryEntry {
  name: string;
  path: string;
  hasShall: boolean;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  hasShall: boolean;
  directories: DirectoryEntry[];
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
        hasShall: await pathExists(getProjectShallPath(entryPath)),
      };
    }),
  );

  const parentPath = path.dirname(directoryPath);
  return {
    path: directoryPath,
    parent: parentPath === directoryPath ? null : parentPath,
    hasShall: await pathExists(getProjectShallPath(directoryPath)),
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
