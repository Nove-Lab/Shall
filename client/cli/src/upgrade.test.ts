import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { SHALL_VERSION } from "@shall/core/version";
import type { Release } from "./release.js";
import { assetFor, install, upgradeShall } from "./upgrade.js";

/**
 * THE SWAP, WATCHED HAPPENING TO A FILE OF THE TEST'S OWN.
 *
 * `install` takes the path to replace as an argument for exactly this reason:
 * the file this suite hands it is a few bytes in a temp folder, so the download,
 * the checksum and the rename are the ones that ship and the running executable
 * is never anywhere near them.
 *
 * WHAT IS NOT COVERED, AND WHY. The DAEMON RESTART: it stops a process and
 * spawns a detached one that binds a port and outlives the test, which is the
 * same thing `main.test.ts` leaves alone and for the same reason. And the LAST
 * STEP OF `upgradeShall` — the one that reaches `install` — cannot be run here
 * at all, because the path it would replace is `process.execPath` and that is
 * node. Every decision it makes BEFORE that point is a claim below, and the step
 * itself is `install`, tested directly.
 *
 * THE CENTRAL CLAIM IS THE ONE ABOUT FAILURE: a refusal leaves the old binary
 * exactly as it was, byte for byte, with nothing new beside it. A Shall that
 * half-replaced itself is worse than a Shall that is out of date.
 */

/** The asset name this suite pretends is this machine's. */
const ASSET = "shall-darwin-arm64";

/** What the old binary says, so a file that was not replaced is recognisable. */
const OLD = "the shall that was here\n";

/** What the release carries, as bytes an executable would be. */
const NEW = "the shall that came down\n";

/** Every file the stand-in will serve, by path. */
const serving = new Map<string, string>();

const server = createServer((request, response) => {
  const held = serving.get(request.url ?? "");
  if (held === undefined) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "content-type": "application/octet-stream" });
  response.end(held);
});

const base = await new Promise<string>((resolve) => {
  server.listen(0, "127.0.0.1", () =>
    resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
  );
});

after(() => {
  server.closeAllConnections();
  server.close();
});

function sha256(text: string): string {
  return createHash("sha256").update(Buffer.from(text)).digest("hex");
}

/** A `SHA256SUMS` in the format `sha256sum` writes, for the files named. */
function sums(lines: readonly (readonly [string, string])[]): string {
  return `${lines.map(([digest, name]) => `${digest}  ${name}`).join("\n")}\n`;
}

/**
 * A release the stand-in will actually serve: the asset under its own name, and
 * whatever `SHA256SUMS` the test asked for beside it.
 */
function serve(
  version: string,
  bytes: string | null,
  checksums: string | null,
): Release {
  const assets = new Map<string, string>();
  if (bytes !== null) {
    serving.set(`/${version}/${ASSET}`, bytes);
    assets.set(ASSET, `${base}/${version}/${ASSET}`);
  }
  if (checksums !== null) {
    serving.set(`/${version}/SHA256SUMS`, checksums);
    assets.set("SHA256SUMS", `${base}/${version}/SHA256SUMS`);
  }
  return { version, assets };
}

/** A folder with an old binary in it, and the path to that binary. */
async function installed(): Promise<{ folder: string; binary: string }> {
  const folder = await mkdtemp(path.join(os.tmpdir(), "shall-installed-"));
  const binary = path.join(folder, "shall");
  await writeFile(binary, OLD, { mode: 0o755 });
  return { folder, binary };
}

/** The sentence a refusal was written as. */
async function refused(work: Promise<unknown>): Promise<string> {
  return work.then(
    () => "nothing was refused",
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
}

describe("which asset is this machine's", () => {
  for (const [platform, arch, expected] of [
    ["darwin", "arm64", "shall-darwin-arm64"],
    ["darwin", "x64", "shall-darwin-x64"],
    ["linux", "x64", "shall-linux-x64"],
    ["linux", "arm64", "shall-linux-arm64"],
    ["win32", "x64", null],
    ["linux", "arm", null],
    ["freebsd", "x64", null],
  ] as const) {
    test(`${platform}-${arch} is ${expected ?? "not a Shall Shall ships"}`, () => {
      assert.equal(assetFor(platform, arch), expected);
    });
  }
});

describe("replacing the binary", () => {
  test("a download that matches its checksum takes the old one's place", async () => {
    const { folder, binary } = await installed();
    const release = serve(
      "9.9.9",
      NEW,
      sums([
        [sha256(NEW), ASSET],
        [sha256("something else"), "shall-linux-x64"],
      ]),
    );

    await install(release, ASSET, binary);

    assert.equal(await readFile(binary, "utf8"), NEW);
    // Runnable, whatever the umask of the machine that fetched it.
    assert.equal((await stat(binary)).mode & 0o777, 0o755);
    // The staging file is a step and not a leftover: the folder holds one file.
    assert.deepEqual(await readdir(folder), ["shall"]);
  });

  test("a `*` before the name is the same line, not a different file", async () => {
    const { binary } = await installed();
    const release = serve("9.9.8", NEW, `${sha256(NEW)} *${ASSET}\n`);

    await install(release, ASSET, binary);

    assert.equal(await readFile(binary, "utf8"), NEW);
  });

  test("bytes that do not match their checksum replace nothing", async () => {
    const { folder, binary } = await installed();
    const release = serve("9.9.7", NEW, sums([[sha256("not these bytes"), ASSET]]));

    assert.match(
      await refused(install(release, ASSET, binary)),
      /did not match its checksum — nothing was replaced\.$/,
    );
    assert.equal(await readFile(binary, "utf8"), OLD);
    assert.deepEqual(await readdir(folder), ["shall"]);
  });

  test("a SHA256SUMS that names no such asset replaces nothing", async () => {
    const { folder, binary } = await installed();
    const release = serve("9.9.6", NEW, sums([[sha256(NEW), "shall-linux-x64"]]));

    assert.match(
      await refused(install(release, ASSET, binary)),
      /^SHA256SUMS for Shall 9\.9\.6 names no shall-darwin-arm64/,
    );
    assert.equal(await readFile(binary, "utf8"), OLD);
    assert.deepEqual(await readdir(folder), ["shall"]);
  });

  test("a release published without its checksums replaces nothing", async () => {
    const { binary } = await installed();
    const release = serve("9.9.5", NEW, null);

    assert.match(
      await refused(install(release, ASSET, binary)),
      /published no SHA256SUMS, so the download could not be checked/,
    );
    assert.equal(await readFile(binary, "utf8"), OLD);
  });

  test("a release that ships no asset for this machine replaces nothing", async () => {
    const { binary } = await installed();
    const release = serve("9.9.4", null, sums([[sha256(NEW), ASSET]]));

    assert.match(
      await refused(install(release, ASSET, binary)),
      /^Shall 9\.9\.4 ships no shall-darwin-arm64/,
    );
    assert.equal(await readFile(binary, "utf8"), OLD);
  });

  test("an asset the release names and the server has not got replaces nothing", async () => {
    const { folder, binary } = await installed();
    const release = serve("9.9.3", NEW, sums([[sha256(NEW), ASSET]]));
    serving.delete(`/9.9.3/${ASSET}`);

    assert.match(
      await refused(install(release, ASSET, binary)),
      /^Could not download shall-darwin-arm64 from /,
    );
    assert.equal(await readFile(binary, "utf8"), OLD);
    assert.deepEqual(await readdir(folder), ["shall"]);
  });
});

describe("the command's own judgement", () => {
  test("the newest release being this one is a sentence and not an upgrade", async () => {
    serving.set("/repos/Nove-Lab/Shall/releases/latest", JSON.stringify({
      tag_name: `v${SHALL_VERSION}`,
      assets: [{ name: ASSET, browser_download_url: `${base}/never` }],
    }));

    assert.deepEqual(await upgradeShall(base), [
      `Shall ${SHALL_VERSION} is the newest there is.`,
    ]);
  });

  test("a release nobody could ask about is a refusal, and nothing is touched", async () => {
    assert.equal(
      await refused(upgradeShall("http://127.0.0.1:1")),
      "Could not ask which Shall is newest — check the network, then try again.",
    );
  });
});
