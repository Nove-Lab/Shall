import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { before, describe, test } from "node:test";
import {
  ensureApprovalKey,
  getApprovalKeyPath,
  makeSeal,
} from "./approval-key.js";

/**
 * The one secret on the machine, and the seal it makes.
 *
 * WHAT IS PINNED HERE IS THE TRUST MODEL. An agent may write any spec file it
 * likes; the only thing it cannot do is produce a tag. So these tests care
 * about three things and little else: that the key file is owner-only, that it
 * is never replaced behind a person's back, and that a tag made under one key
 * is refused by every other key — including the near misses, a tag cut short
 * and a tag of the right length with the wrong bytes.
 */

/** A fake `~`, so the key these tests mint is never the machine's own. */
before(async () => {
  await freshHome();
});

/**
 * `getShallHome` reads `os.homedir()` on every call, which is `$HOME` on POSIX
 * — so a new temporary home per test redirects `~/.shall/key` without a seam
 * that exists only for tests, and keeps each test's key its own.
 */
async function freshHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "shall-key-home-"));
  process.env.HOME = home;
  return home;
}

/**
 * Where a key put there by hand goes. `ensureApprovalKey` makes `~/.shall`
 * itself, so a test that writes the file before the first call has to make the
 * folder the way any other tool on the machine would.
 */
async function handMadeKeyPath(): Promise<string> {
  const keyPath = getApprovalKeyPath();
  await mkdir(path.dirname(keyPath), { recursive: true });
  return keyPath;
}

async function modeOf(filePath: string): Promise<number> {
  return (await stat(filePath)).mode & 0o777;
}

describe("the machine's approval key", () => {
  test("the key is made once, and only its owner may read it", async () => {
    await freshHome();
    const key = await ensureApprovalKey();
    assert.equal(key.length, 32);

    const keyPath = getApprovalKeyPath();
    // Outside every repository, in Shall's own home: a key that travelled in a
    // `.shall` folder would travel to whoever cloned it.
    assert.equal(path.basename(keyPath), "key");
    const text = await readFile(keyPath, "utf8");
    assert.match(text, /^[0-9a-f]{64}\n$/);
    assert.equal(text.trim(), key.toString("hex"));
    assert.equal(await modeOf(keyPath), 0o600);
  });

  test("a key already there is read rather than replaced", async () => {
    await freshHome();
    const known = "0123456789abcdef".repeat(4);
    const keyPath = await handMadeKeyPath();
    await writeFile(keyPath, `${known}\n`, { encoding: "utf8", mode: 0o600 });

    const key = await ensureApprovalKey();
    assert.equal(key.toString("hex"), known);
    // Byte for byte what was written, newline included — a second start must
    // not so much as reformat the file it found.
    assert.equal(await readFile(keyPath, "utf8"), `${known}\n`);
  });

  test("a mode that drifted is brought back to 0600", async () => {
    await freshHome();
    const minted = await ensureApprovalKey();
    const keyPath = getApprovalKeyPath();

    // A stray `chmod -R`, a restored backup, a copy through a filesystem with
    // no idea what a mode is: the key is still the key, and 0644 is still every
    // other account on the box able to sign as this one.
    await chmod(keyPath, 0o644);
    const read = await ensureApprovalKey();

    assert.equal(await modeOf(keyPath), 0o600);
    assert.deepEqual(read, minted);
  });

  test("a key that is not hex is refused with the sentence, and the file is left alone", async () => {
    await freshHome();
    const keyPath = await handMadeKeyPath();
    const garbage = "not a key at all\n";
    await writeFile(keyPath, garbage, "utf8");

    await assert.rejects(ensureApprovalKey(), {
      message: `The approval key at ${keyPath} is not the 64 hex characters Shall writes — what stands there is 16 characters of something else — so nothing on this machine can be signed or checked. Move the file aside and the next start mints a fresh key, which turns every approved node on this machine yellow for re-approval.`,
    });

    // Nothing was rewritten. Minting a replacement would have turned every
    // approved node on this machine yellow, silently, on a start nobody watched.
    assert.equal(await readFile(keyPath, "utf8"), garbage);
  });
});

describe("the seal", () => {
  test("a tag verifies under the key that made it and under no other", async () => {
    const mine = makeSeal(randomBytes(32));
    const theirs = makeSeal(randomBytes(32));

    const hash = mine.hash("intent/Requirement/R-0001\nthe node's canonical file\n");
    assert.match(hash, /^sha256:[0-9a-f]{64}$/);
    const tag = mine.sign(hash);
    assert.match(tag, /^hmac:[0-9a-f]{64}$/);

    assert.equal(mine.verifies(hash, tag), true);
    // The hash is public arithmetic, so another machine computes the same one
    // and still cannot make the tag that goes with it.
    assert.equal(theirs.hash(hash), theirs.hash(hash));
    assert.equal(theirs.verifies(hash, tag), false);

    // A tag cut short is the length guard: `timingSafeEqual` throws on unequal
    // lengths, and a function that answers yes or no may not answer by throwing.
    assert.equal(mine.verifies(hash, tag.slice(0, -2)), false);
    // And the same length with the wrong bytes is the comparison itself.
    const lastCharacter = tag.slice(-1);
    assert.equal(
      mine.verifies(hash, `${tag.slice(0, -1)}${lastCharacter === "0" ? "1" : "0"}`),
      false,
    );
    // A tag over a different hash is no more valid than a tag over none.
    assert.equal(mine.verifies(mine.hash("some other node"), tag), false);
  });

  test("a keyless seal hashes, never verifies, and will not sign", async () => {
    const key = randomBytes(32);
    const keyed = makeSeal(key);
    const blind = makeSeal(null);

    const payload = "intent/Requirement/R-0001\nthe node's canonical file\n";
    // sha256 keeps no secret, so a machine without the key still says what the
    // node hashes to — which is how it can tell green from yellow at all.
    assert.equal(blind.hash(payload), keyed.hash(payload));

    const hash = blind.hash(payload);
    const tag = keyed.sign(hash);
    // Even the true tag: a machine that cannot tell a real one from a forged
    // one must call neither of them approved.
    assert.equal(blind.verifies(hash, tag), false);

    assert.throws(() => blind.sign(hash), /no approval key loaded/);
  });
});
