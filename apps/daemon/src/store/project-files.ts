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
import type { ProjectMetadata } from "../core/types.js";
import { initializeProjectDatabase } from "./database.js";

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

export function getProjectDatabasePath(projectPath: string): string {
  return path.join(getProjectShallPath(projectPath), "shall.db");
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
  const metadataPath = getProjectMetadataPath(projectPath);
  const temporaryPath = `${metadataPath}.${process.pid}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );
  await rename(temporaryPath, metadataPath);
}

export async function writeProjectFiles(
  projectPath: string,
  metadata: ProjectMetadata,
): Promise<void> {
  const shallPath = getProjectShallPath(projectPath);
  const temporaryPath = `${shallPath}.${process.pid}.tmp`;

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
      writeFile(
        path.join(temporaryPath, ".gitignore"),
        "shall.db\nshall.db-wal\nshall.db-shm\n",
        "utf8",
      ),
    ]);
    await initializeProjectDatabase(path.join(temporaryPath, "shall.db"));
    await rename(temporaryPath, shallPath);
  } catch (error) {
    await rm(temporaryPath, { recursive: true, force: true });
    throw error;
  }
}
