import { createHash } from "node:crypto";
import { chmod, copyFile, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SHALL_VERSION } from "@shall/core/version";
import { readConfig, readDaemonState, removeDaemonState } from "@shall/daemon/home";
import { DAEMON_FLAG } from "./binary-main.js";
import {
  healthOf,
  isProcessAlive,
  startDaemon,
  stopProcess,
  waitForDaemon,
} from "./daemon-process.js";
import { isNewer, latestRelease, releasesBase, type Release } from "./release.js";

/**
 * `shall upgrade` — the newest Shall fetched, checked, and put where this one
 * stands.
 *
 * IT REPLACES ONE FILE, because Shall IS one file. The client, the daemon, the
 * web app and the agent kit are all inside the executable a person typed, so
 * there is no half of an install to leave behind and no order the pieces have to
 * be replaced in. What makes that swap reach a person's PROJECTS is the sweep
 * the daemon runs at startup: it rewrites every registered project's kit, which
 * is why this restarts the daemon rather than leaving it to the next command.
 *
 * THE DOWNLOAD IS CHECKED BEFORE ANYTHING IS TOUCHED. The bytes land in a temp
 * folder, they are hashed against the `SHA256SUMS` published beside them, and
 * only a file that matches is put next to the running binary and renamed over
 * it. A release that shipped without its sums, an asset this machine has no
 * entry for, a body that arrived short — each of them is a refusal with the
 * binary still exactly as it was, because a Shall that half-replaced itself is
 * worse than one that is out of date.
 *
 * THE REPLACEMENT IS A RENAME AND NOT A WRITE. Writing into the running
 * executable is refused outright on some systems and is a torn file on the rest;
 * a rename swaps the name over to a finished file in one step, and the process
 * doing the renaming goes on running out of the old inode until it exits.
 */

/** How long the release itself is waited for — this command was typed for it. */
const ASKING = 5_000;

/** The checksums published beside the binaries: one line per asset. */
const SUMS = "SHA256SUMS";

/** The bind a daemon gets when there is no running one to copy it from. */
const LOOPBACK = "127.0.0.1";

/**
 * The asset this machine runs, or null where Shall ships none.
 *
 * The four names are the release's own, and they are `scripts/build-binary.mjs`'s
 * targets said the way node spells the same two facts — which is the whole
 * reason the build names its files after `platform-arch` rather than after
 * anything friendlier.
 */
export function assetFor(platform: string, arch: string): string | null {
  const shipped = new Set([
    "darwin-arm64",
    "darwin-x64",
    "linux-x64",
    "linux-arm64",
  ]);
  const target = `${platform}-${arch}`;
  return shipped.has(target) ? `shall-${target}` : null;
}

/** One file off the release, whole. A refusal arrives as a sentence, not a code. */
async function download(what: string, from: string): Promise<Buffer> {
  const response = await fetch(from).catch(() => null);
  if (response === null || !response.ok) {
    throw new Error(
      `Could not download ${what} from ${from} — nothing was replaced.`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * The hash `SHA256SUMS` published for one asset, or null when it lists none.
 *
 * The format is the one `sha256sum` writes: the digest, whitespace, and the
 * name — with the `*` that marks a binary read tolerated, since half the tools
 * that produce these files put it there.
 */
function sumFor(sums: string, name: string): string | null {
  for (const line of sums.split("\n")) {
    const read = /^([0-9a-f]{64})\s+\*?(\S.*)$/.exec(line.trim());
    if (read !== null && read[2]?.trim() === name) {
      return read[1] ?? null;
    }
  }
  return null;
}

/**
 * Fetches one release asset, proves it is the file the release says it is, and
 * puts it where `binaryPath` stands.
 *
 * `binaryPath` IS AN ARGUMENT AND NOT `process.execPath` READ IN HERE, so that a
 * test can watch the whole of this happen to a file of its own rather than to
 * the runtime it is running under.
 */
export async function install(
  release: Release,
  asset: string,
  binaryPath: string,
): Promise<void> {
  const from = release.assets.get(asset);
  if (from === undefined) {
    throw new Error(
      `Shall ${release.version} ships no ${asset} — nothing was replaced.`,
    );
  }
  const sumsFrom = release.assets.get(SUMS);
  if (sumsFrom === undefined) {
    throw new Error(
      `Shall ${release.version} published no ${SUMS}, so the download could not be checked — nothing was replaced.`,
    );
  }

  const temporary = await mkdtemp(path.join(os.tmpdir(), "shall-upgrade-"));
  const staging = `${binaryPath}.upgrade-${process.pid}`;
  try {
    const sums = (await download(SUMS, sumsFrom)).toString("utf8");
    const expected = sumFor(sums, asset);
    if (expected === null) {
      throw new Error(
        `${SUMS} for Shall ${release.version} names no ${asset} — nothing was replaced.`,
      );
    }

    // Hashed off the disk rather than out of the response, so that a body which
    // arrived short or a filesystem that took only some of it is caught by the
    // same check that catches the wrong file entirely.
    const held = path.join(temporary, asset);
    await writeFile(held, await download(asset, from));
    const got = createHash("sha256").update(await readFile(held)).digest("hex");
    if (got !== expected) {
      throw new Error(
        `${asset} did not match its checksum — nothing was replaced.`,
      );
    }

    try {
      await copyFile(held, staging);
      await chmod(staging, 0o755);
      await rename(staging, binaryPath);
    } catch (error) {
      throw new Error(
        `Could not replace ${binaryPath}: ${
          error instanceof Error ? error.message : String(error)
        }. Nothing was replaced.`,
      );
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
    await rm(staging, { force: true });
  }
}

/**
 * The daemon, put onto the new binary — and one sentence saying whether it got
 * there.
 *
 * IT NEVER THROWS. By the time this runs the binary is already replaced, and a
 * daemon that would not go is not a reason to report the upgrade as a failure;
 * it is a reason to say what a person has to do about it.
 *
 * ONLY A DAEMON `~/.shall/daemon.json` NAMES IS STOPPED, which is the rule
 * `main.ts` follows for the same reason: the pid to signal is the record's own,
 * so this can never kill a process Shall did not start. The BIND IS CARRIED
 * OVER from the daemon that was running, so an upgrade never quietly closes a
 * `--host` daemon's door to the network.
 */
async function restartDaemon(version: string): Promise<string> {
  const url = `http://localhost:${(await readConfig()).port}`;
  const bindHost = (await healthOf(url))?.host ?? LOOPBACK;

  const state = await readDaemonState();
  if (state !== null) {
    try {
      if (isProcessAlive(state.pid)) {
        await stopProcess(state.pid);
      }
      await removeDaemonState(state.pid);
    } catch {
      return `Shall ${version} is installed, but the daemon at ${url} would not stop — stop it yourself, then run shall.`;
    }
  }

  startDaemon([DAEMON_FLAG], bindHost);
  if (await waitForDaemon(url, (health) => health.version === version)) {
    return `The daemon at ${url} is running ${version}, and every registered project's agent kit is being rewritten from it.`;
  }
  return (await healthOf(url)) === null
    ? `The daemon did not start at ${url} — run shall to start it.`
    : `A daemon that is not this one still holds ${url} — stop it, then run shall.`;
}

/**
 * The command: what is newest, whether it is newer than this, and — when it is
 * — the swap and the daemon.
 *
 * RUNNING IT ON THE NEWEST SHALL IS NOT AN ERROR. It says so and stops, so a
 * script or a scenario may run it twice and the second run is simply a sentence.
 */
export async function upgradeShall(
  base: string = releasesBase(),
): Promise<string[]> {
  const release = await latestRelease(ASKING, base);
  if (release === null) {
    throw new Error(
      "Could not ask which Shall is newest — check the network, then try again.",
    );
  }
  if (!isNewer(release.version, SHALL_VERSION)) {
    return [`Shall ${SHALL_VERSION} is the newest there is.`];
  }
  const asset = assetFor(process.platform, process.arch);
  if (asset === null) {
    throw new Error(
      `Shall ships no binary for ${process.platform}-${process.arch}.`,
    );
  }
  await install(release, asset, process.execPath);
  return [
    `Shall ${release.version} replaced ${SHALL_VERSION} at ${process.execPath}.`,
    await restartDaemon(release.version),
  ];
}
