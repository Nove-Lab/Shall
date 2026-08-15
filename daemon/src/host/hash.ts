import { createHash } from "node:crypto";

/**
 * The one hash Shall takes: `sha256:<hex>` over an approval payload.
 *
 * IT IS THE DAEMON'S AND NOT CORE'S, on purpose. `core/arith` colours a graph
 * from data alone — the ledger's records and this function, handed in — so
 * that it stays pure and runs in a browser as well as here; the only thing a
 * colour needs a machine for is this digest, and this is where the machine
 * provides it. Nothing is secret about it: the ledger names content, not a
 * signer, and anybody may recompute a hash to see which content a record
 * names. That is the design — an approval lives in a file only the daemon
 * writes, so there is no tag to forge and no key to keep.
 *
 * `sha256:` is written into the string so the algorithm travels with the
 * value; a ledger that outlives this choice can tell its records apart.
 */
export function payloadHash(payload: string): string {
  return `sha256:${createHash("sha256").update(payload, "utf8").digest("hex")}`;
}
