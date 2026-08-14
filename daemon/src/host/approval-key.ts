import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { getShallHome } from "./shall-home.js";

/**
 * The machine's approval key, and the seal it makes.
 *
 * A green node is a node a person approved: its `approval` block carries a
 * `hash` over the node's payload and a `tag`, the HMAC-SHA256 of that hash
 * string under this key. Anybody may recompute the hash — sha256 keeps no
 * secret — but only a holder of the key can produce the tag, and THAT
 * ASYMMETRY IS THE WHOLE TRUST MODEL. An agent reads and writes spec files all
 * day long; what it must never be able to do is mint a tag and hand its own
 * work the colour that says a human looked.
 *
 * Which is why the key lives at `~/.shall/key`, OUTSIDE EVERY REPOSITORY —
 * never in a project's `.shall`, never in anything git carries to another
 * machine — and why agents are denied it by a settings rule that is another
 * module's business. Nothing here can enforce that rule. What this module can
 * do is keep the file readable by its owner alone, and refuse to quietly
 * replace one it does not recognise.
 */

/** 32 bytes of randomness, written as 64 lowercase hex and a newline. */
const KEY_BYTES = 32;
const KEY_HEX_LENGTH = KEY_BYTES * 2;

/**
 * Case-insensitive on purpose. Shall writes lowercase, but a key restored by
 * hand from a note or a password manager may come back uppercase, and the
 * bytes are the same bytes — refusing them over their spelling would cost the
 * machine every approval it has for no gain. `Buffer.from(text, "hex")` drops
 * whatever it cannot parse instead of complaining, so this test is what stands
 * between a mangled file and a silently shortened key.
 */
const HEX_KEY = /^[0-9a-fA-F]+$/;

/** Owner read and write, nobody else. */
const OWNER_ONLY = 0o600;

/** How long to wait out a racing daemon that has made the file but not filled it. */
const EMPTY_READ_ATTEMPTS = 10;
const EMPTY_READ_PAUSE_MS = 20;

export function getApprovalKeyPath(): string {
  return path.join(getShallHome().root, "key");
}

function refuseKeyFile(keyPath: string, found: string): never {
  const count = found.length;
  throw new Error(
    `The approval key at ${keyPath} is not the 64 hex characters Shall writes — what stands there is ${count} character${count === 1 ? "" : "s"} of something else — so nothing on this machine can be signed or checked. Move the file aside and the next start mints a fresh key, which turns every approved node on this machine yellow for re-approval.`,
  );
}

/**
 * The key, made once and never replaced by machinery.
 *
 * The first run writes 32 random bytes as hex under the flag `wx`, so two
 * daemons starting at the same instant cannot truncate each other: the loser
 * gets `EEXIST` and reads what the winner made rather than minting a second
 * key over the top. Every call then chmods the file back to 0600, because a
 * key at 0644 is every other user on the box able to sign as this one — the
 * whole threat model in a single permission bit. (On Windows the chmod is
 * effectively a no-op — Node maps only the read-only bit there — and the
 * guard has to come from the account's own profile folder instead.)
 *
 * A FILE THAT IS PRESENT BUT IS NOT A KEY IS NEVER REWRITTEN. It is refused
 * with a sentence naming the path, because minting a replacement would turn
 * every approved node on this machine yellow, and it would do it silently, on
 * a start nobody was watching. Better to say so and let a person decide.
 */
export async function ensureApprovalKey(): Promise<Buffer> {
  const keyPath = getApprovalKeyPath();
  await mkdir(path.dirname(keyPath), { recursive: true });

  let minted = false;
  try {
    await writeFile(keyPath, `${randomBytes(KEY_BYTES).toString("hex")}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: OWNER_ONLY,
    });
    minted = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }

  // Not only on the run that mints it: a key created correctly and then loosened
  // by a stray `chmod -R`, a restored backup or a copy through a filesystem with
  // no idea what a mode is comes back tight on the next start.
  await chmod(keyPath, OWNER_ONLY);

  let text = (await readFile(keyPath, "utf8")).trim();
  // `wx` makes the file appear before its bytes do, so a racing reader can
  // catch it empty for an instant. An empty key file is not a corrupt one —
  // it is the other process mid-write — and on a fresh machine, where a daemon
  // start and a CLI call overlap, that instant is exactly when this runs.
  for (
    let attempt = 0;
    text === "" && !minted && attempt < EMPTY_READ_ATTEMPTS;
    attempt += 1
  ) {
    await sleep(EMPTY_READ_PAUSE_MS);
    text = (await readFile(keyPath, "utf8")).trim();
  }

  if (text.length !== KEY_HEX_LENGTH || !HEX_KEY.test(text)) {
    refuseKeyFile(keyPath, text);
  }
  return Buffer.from(text, "hex");
}

/**
 * The two halves of an approval: the hash anybody can check, and the tag only
 * this machine can make. `sign` is the daemon's own extra — core computes
 * payloads and compares hashes, but the key never leaves the host layer.
 */
export interface Seal {
  /** `sha256:<hex>` over the approval payload. Keyless, so it always works. */
  readonly hash: (payload: string) => string;
  /** `hmac:<hex>` over the hash STRING — the tag itself. */
  readonly sign: (hash: string) => string;
  /** Whether this tag is the one this key would have made for this hash. */
  readonly verifies: (hash: string, tag: string) => boolean;
}

/**
 * The seal, over a key or over nothing.
 *
 * A null key is a machine that cannot verify — a daemon that has not read its
 * key yet, or a check running somewhere the key was never meant to be. Hashing
 * still works, because sha256 needs no secret. Verifying answers false to
 * everything, since a machine that cannot tell a real tag from a forged one
 * must not call either of them approved. Signing throws: nothing in Shall
 * should ever reach for a tag without a key, so that call is a defect in the
 * caller rather than a state to be reported.
 */
export function makeSeal(key: Buffer | null): Seal {
  const hash = (payload: string): string =>
    `sha256:${createHash("sha256").update(payload, "utf8").digest("hex")}`;

  const sign = (hashText: string): string => {
    if (key === null) {
      throw new Error(
        "Shall was asked to sign an approval on a machine with no approval key loaded, which is a mistake in the caller and not a state a person can fix: read the key with ensureApprovalKey and build the seal from it before anything asks for a tag.",
      );
    }
    return `hmac:${createHmac("sha256", key).update(hashText, "utf8").digest("hex")}`;
  };

  const verifies = (hashText: string, tag: string): boolean => {
    if (key === null) {
      return false;
    }
    const expected = Buffer.from(sign(hashText), "utf8");
    const given = Buffer.from(tag, "utf8");
    // `timingSafeEqual` THROWS on buffers of unequal length rather than
    // answering false, so the guard is correctness and not a nicety: a
    // truncated tag would come back as an exception out of a function whose
    // whole job is to answer yes or no. Lengths are not a secret — the tag's
    // shape is fixed and public — so comparing them plainly gives nothing away.
    if (expected.length !== given.length) {
      return false;
    }
    return timingSafeEqual(expected, given);
  };

  return { hash, sign, verifies };
}
