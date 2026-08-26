import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { DaemonState, Registry, ShallConfig } from "../types.js";

const DEFAULT_CONFIG: ShallConfig = { port: 9461 };
const DEFAULT_REGISTRY: Registry = { projects: [] };

export interface ShallHome {
  root: string;
  configPath: string;
  registryPath: string;
  daemonPath: string;
}

export function getShallHome(): ShallHome {
  // `SHALL_HOME` points a checkout at a home of its own — its daemon slot, its
  // registry, its templates — so developing Shall never rewrites the installed
  // Shall's. Nothing a user installs sets it; `scripts/dev-home.mjs` does.
  const override = process.env.SHALL_HOME;
  const root =
    override !== undefined && override !== ""
      ? path.resolve(override)
      : path.join(os.homedir(), ".shall");
  return {
    root,
    configPath: path.join(root, "config.json"),
    registryPath: path.join(root, "registry.json"),
    daemonPath: path.join(root, "daemon.json"),
  };
}

/**
 * True for `~/.shall` itself. Shall's own home uses the same `.shall` name as a
 * project's, so the folder holding it looks like a project until this is
 * checked.
 */
export function isShallHomePath(candidate: string): boolean {
  return path.resolve(candidate) === getShallHome().root;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonIfMissing(filePath: string, value: unknown): Promise<void> {
  if (!(await exists(filePath))) {
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    }).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") {
        throw error;
      }
    });
  }
}

export async function ensureShallHome(): Promise<ShallHome> {
  const home = getShallHome();
  await mkdir(home.root, { recursive: true });
  await Promise.all([
    writeJsonIfMissing(home.configPath, DEFAULT_CONFIG),
    writeJsonIfMissing(home.registryPath, DEFAULT_REGISTRY),
  ]);
  return home;
}

export async function readConfig(): Promise<ShallConfig> {
  const home = await ensureShallHome();
  const value = JSON.parse(await readFile(home.configPath, "utf8")) as unknown;
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as Record<string, unknown>).port !== "number"
  ) {
    throw new Error(`Invalid Shall config: ${home.configPath}`);
  }
  return value as ShallConfig;
}

export async function writeJsonAtomic(
  filePath: string,
  value: unknown,
): Promise<void> {
  await ensureShallHome();
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

export async function readDaemonState(): Promise<DaemonState | null> {
  const home = await ensureShallHome();
  try {
    const value = JSON.parse(await readFile(home.daemonPath, "utf8")) as unknown;
    if (typeof value !== "object" || value === null) {
      return null;
    }
    const state = value as Record<string, unknown>;
    if (
      !Number.isInteger(state.pid) ||
      (state.pid as number) <= 0 ||
      !Number.isInteger(state.port) ||
      (state.port as number) <= 0 ||
      (state.port as number) > 65_535
    ) {
      return null;
    }
    return state as unknown as DaemonState;
  } catch {
    return null;
  }
}

export async function writeDaemonState(state: DaemonState): Promise<void> {
  const home = await ensureShallHome();
  await writeJsonAtomic(home.daemonPath, state);
}

export async function removeDaemonState(expectedPid?: number): Promise<void> {
  const home = await ensureShallHome();
  if (expectedPid !== undefined) {
    const currentState = await readDaemonState();
    if (currentState?.pid !== expectedPid) {
      return;
    }
  }
  await rm(home.daemonPath, { force: true });
}
