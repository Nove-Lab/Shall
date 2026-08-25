import { SHALL_VERSION } from "@shall/core/version";

/**
 * WHAT THE NEWEST SHALL IS, asked of the place the releases are.
 *
 * ONE ENDPOINT ANSWERS TWO QUESTIONS. The notice under `shall` and `shall init`
 * wants only a number to compare; `shall upgrade` wants the assets as well. Both
 * read the same release from the same door, so a person told there is a 0.2.0
 * and a person running the upgrade that fetches it can never be looking at two
 * different releases.
 *
 * IT IS ALWAYS ALLOWED TO FAIL. A machine with no network, a rate limit, a
 * GitHub having a bad morning: every one of them answers null here, and the
 * notice simply does not appear. Nothing Shall does depends on this reply, which
 * is why no failure of it is ever reported to anybody — a command that printed
 * "could not reach GitHub" before doing exactly what it was asked to do would be
 * noise on every offline run.
 *
 * NOTHING IS REMEMBERED BETWEEN RUNS. A cache would be a third file in
 * `~/.shall` and a staleness question to answer, in exchange for saving a
 * request that already costs nothing on the surfaces it runs on — the app is
 * opening a browser, and `init` is writing a project.
 */

/** Where the releases live, and the one release everything here reads. */
const GITHUB_API = "https://api.github.com";
const LATEST = "/repos/Nove-Lab/Shall/releases/latest";

/**
 * The host to ask, GitHub unless the environment names another.
 *
 * IT IS A SEAM, AND AN ADMITTED ONE. Every function below takes the base as an
 * argument; this is only how a PROCESS is told which one to use, and the whole
 * reason it exists is that the notice and the upgrade are worth testing. The
 * alternative was a suite that either reached GitHub on every run or never ran
 * the code that ships. It costs one variable nobody has to set.
 */
export function releasesBase(): string {
  return process.env.SHALL_RELEASES_API ?? GITHUB_API;
}

/** A published release: the number it calls itself, and what it carries. */
export interface Release {
  /** The tag with any leading `v` taken off, so it compares against the semver. */
  version: string;
  /** Asset name to the url it downloads from. */
  assets: ReadonlyMap<string, string>;
}

/**
 * A semver as three numbers, or null for anything else — a tag with a
 * prerelease on it included.
 *
 * A PRERELEASE IS NOT A NEWER SHALL. `0.2.0-rc1` reads as no version at all, so
 * neither the notice nor the upgrade will move anybody onto one; a person who
 * wants a candidate goes and fetches it deliberately.
 */
function triple(version: string): [number, number, number] | null {
  const read = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (read === null) {
    return null;
  }
  const [, major, minor, patch] = read;
  return [Number(major), Number(minor), Number(patch)];
}

/**
 * Whether `candidate` is a later release than `current`.
 *
 * A NUMBER NOBODY CAN READ IS NEVER NEWER. An unparseable tag, on either side,
 * answers false: the failure of a comparison is not an invitation to replace a
 * working binary.
 */
export function isNewer(candidate: string, current: string): boolean {
  const later = triple(candidate);
  const now = triple(current);
  if (later === null || now === null) {
    return false;
  }
  for (let place = 0; place < 3; place += 1) {
    const [a, b] = [later[place] ?? 0, now[place] ?? 0];
    if (a !== b) {
      return a > b;
    }
  }
  return false;
}

/**
 * The latest release, or null when the question could not be answered inside
 * `timeout` milliseconds — which covers a refusal, a body that is not the shape
 * this reads, and a network that is not there.
 *
 * THE TIMEOUT IS THE CALLER'S because the two callers are not in the same
 * hurry: the notice rides along with a command a person is waiting on and gets
 * a moment, while `shall upgrade` was typed for this and can afford to wait.
 */
export async function latestRelease(
  timeout: number,
  base: string = releasesBase(),
): Promise<Release | null> {
  try {
    const response = await fetch(`${base}${LATEST}`, {
      signal: AbortSignal.timeout(timeout),
      headers: {
        accept: "application/vnd.github+json",
        // GitHub refuses a caller that will not say what it is, and this is the
        // one place Shall talks to anything outside the machine it runs on.
        "user-agent": `shall/${SHALL_VERSION}`,
      },
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as {
      tag_name?: unknown;
      assets?: unknown;
    };
    if (typeof body.tag_name !== "string") {
      return null;
    }
    const assets = new Map<string, string>();
    if (Array.isArray(body.assets)) {
      for (const asset of body.assets as unknown[]) {
        if (typeof asset !== "object" || asset === null) {
          continue;
        }
        const { name, browser_download_url: from } = asset as {
          name?: unknown;
          browser_download_url?: unknown;
        };
        if (typeof name === "string" && typeof from === "string") {
          assets.set(name, from);
        }
      }
    }
    return { version: body.tag_name.replace(/^v/, ""), assets };
  } catch {
    return null;
  }
}

/**
 * The one line a person is told when the release they could be running is not
 * the one they are — or null, which is every other case there is.
 *
 * IT NAMES THE NUMBER AND THE COMMAND, and nothing else. A person who does not
 * want to upgrade has read the whole thing in one glance, and a person who does
 * has the exact words to type.
 */
export async function upgradeNotice(
  timeout: number,
  base: string = releasesBase(),
): Promise<string | null> {
  const release = await latestRelease(timeout, base);
  if (release === null || !isNewer(release.version, SHALL_VERSION)) {
    return null;
  }
  return `Shall ${release.version} is out — run shall upgrade.`;
}
