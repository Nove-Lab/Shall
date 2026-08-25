import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  ensureShallHome,
  getShallHome,
  isShallHomePath,
  readConfig,
  readDaemonState,
  removeDaemonState,
  writeDaemonState,
  writeJsonAtomic,
} from "./shall-home.js";

/**
 * `~/.shall` itself: the config, the registry and the note a running daemon
 * leaves for the CLI that comes knocking.
 *
 * EVERY TEST RUNS IN A HOME OF ITS OWN. `getShallHome` reads `os.homedir()` on
 * every call, which is `$HOME` on POSIX, so a temporary home keeps a test off
 * the machine's real one without a seam that exists only for tests.
 *
 * WHAT IS PINNED HARDEST IS `daemon.json`. It is what a CLI reads before it
 * decides whether to start a second daemon, so a file half-written by one that
 * died mid-write has to read as no daemon at all: a pid or a port that could
 * not have come from a living process is nothing to knock on, and answering
 * with it would send the CLI at a port somebody else is holding.
 */

async function freshHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "shall-own-home-"));
  process.env.HOME = home;
  return home;
}

describe("Shall's own home", () => {
  test("is `.shall` under the home directory, with its three files in it", async () => {
    const home = await freshHome();

    const shallHome = getShallHome();

    assert.equal(shallHome.root, path.join(home, ".shall"));
    assert.equal(shallHome.configPath, path.join(shallHome.root, "config.json"));
    assert.equal(
      shallHome.registryPath,
      path.join(shallHome.root, "registry.json"),
    );
    assert.equal(shallHome.daemonPath, path.join(shallHome.root, "daemon.json"));
  });

  test("knows itself from a project's folder of the same name", async () => {
    const home = await freshHome();

    assert.equal(isShallHomePath(getShallHome().root), true);
    // Resolved first, so a path that arrives the long way round is still the
    // same folder — and a project that happens to sit beside it is not.
    assert.equal(
      isShallHomePath(path.join(home, "project", "..", ".shall")),
      true,
    );
    assert.equal(isShallHomePath(path.join(home, "project", ".shall")), false);
  });

  test("an empty home is given a config and a registry with the defaults in them", async () => {
    await freshHome();

    const home = await ensureShallHome();

    assert.deepEqual(JSON.parse(await readFile(home.configPath, "utf8")), {
      port: 9461,
    });
    assert.deepEqual(JSON.parse(await readFile(home.registryPath, "utf8")), {
      projects: [],
    });
  });

  test("a file already written is left exactly as it was", async () => {
    await freshHome();
    const home = await ensureShallHome();
    await writeFile(home.configPath, `${JSON.stringify({ port: 9999 })}\n`, "utf8");

    await ensureShallHome();

    assert.deepEqual(await readConfig(), { port: 9999 });
  });

  test("a file that arrives between the look and the write is not an error", async () => {
    await freshHome();
    const home = getShallHome();
    await mkdir(home.root, { recursive: true });
    // What a second daemon starting at the same moment looks like from here:
    // nothing to read, and an exclusive create that is refused all the same.
    await symlink(path.join(home.root, "gone.json"), home.configPath);

    await ensureShallHome();

    await assert.rejects(readFile(home.configPath, "utf8"));
    assert.deepEqual(JSON.parse(await readFile(home.registryPath, "utf8")), {
      projects: [],
    });
  });

  test("a home that cannot be written to says so", async () => {
    await freshHome();
    const home = getShallHome();
    await mkdir(home.root, { recursive: true });
    await chmod(home.root, 0o500);

    try {
      await assert.rejects(ensureShallHome(), /EACCES/);
    } finally {
      await chmod(home.root, 0o700);
    }
  });

  test("a config with a port is answered as it stands", async () => {
    await freshHome();

    assert.deepEqual(await readConfig(), { port: 9461 });
  });

  test("a config that is not one is refused by name", async () => {
    await freshHome();
    const home = await ensureShallHome();

    for (const written of ["12", "null", "{}", `{"port":"9461"}`]) {
      await writeFile(home.configPath, written, "utf8");

      await assert.rejects(
        readConfig(),
        (error: Error) =>
          error.message === `Invalid Shall config: ${home.configPath}`,
        written,
      );
    }
  });

  test("a write lands whole and leaves no temporary beside it", async () => {
    await freshHome();
    const home = getShallHome();
    const target = path.join(home.root, "notes.json");

    await writeJsonAtomic(target, { written: true });

    assert.deepEqual(JSON.parse(await readFile(target, "utf8")), {
      written: true,
    });
    assert.deepEqual(
      (await readdir(home.root)).filter((name) => name.endsWith(".tmp")),
      [],
    );
  });

  test("the state a daemon wrote is the state the next reader gets", async () => {
    await freshHome();

    await writeDaemonState({ pid: 4321, port: 65_535 });

    assert.deepEqual(await readDaemonState(), { pid: 4321, port: 65_535 });
  });

  test("a home with no daemon in it is no state", async () => {
    await freshHome();

    assert.equal(await readDaemonState(), null);
  });

  test("a state that could not have come from a running daemon is no state", async () => {
    await freshHome();
    const home = await ensureShallHome();

    for (const written of [
      "{",
      `"a daemon"`,
      "null",
      JSON.stringify({ pid: 1.5, port: 9461 }),
      JSON.stringify({ pid: 0, port: 9461 }),
      JSON.stringify({ pid: 4321, port: 9461.5 }),
      JSON.stringify({ pid: 4321, port: 0 }),
      JSON.stringify({ pid: 4321, port: 65_536 }),
    ]) {
      await writeFile(home.daemonPath, written, "utf8");

      assert.equal(await readDaemonState(), null, written);
    }
  });

  test("the daemon that wrote the state is the only one that may take it away", async () => {
    await freshHome();
    await writeDaemonState({ pid: 4321, port: 9461 });

    // A daemon on its way out that finds somebody else's note leaves it: the
    // note belongs to whoever is running now, not to whoever wrote last.
    await removeDaemonState(9999);
    assert.deepEqual(await readDaemonState(), { pid: 4321, port: 9461 });

    await removeDaemonState(4321);
    assert.equal(await readDaemonState(), null);
  });

  test("removing with no pid removes whatever is there, and removing nothing is allowed", async () => {
    await freshHome();
    await writeDaemonState({ pid: 4321, port: 9461 });

    await removeDaemonState();
    assert.equal(await readDaemonState(), null);

    await removeDaemonState(4321);
    await removeDaemonState();
    assert.equal(await readDaemonState(), null);
  });
});
