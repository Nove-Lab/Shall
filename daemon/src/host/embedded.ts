/**
 * THE FILES A SINGLE-BINARY SHALL CARRIES INSIDE ITSELF — the built web app and
 * the agent plugin, the only two things this daemon reads out of the checkout
 * it was built from rather than out of a project or `~/.shall`.
 *
 * WHY A REGISTRY AND NOT A BUILD FLAG. Nothing here asks which runtime it is
 * on. `bun build --compile` produces the one artifact that has no checkout
 * behind it, so the binary's entry hands its files in before anything runs and
 * that act IS the answer: a checkout never calls `setEmbeddedFiles`, so a
 * checkout reads disk. A `typeof Bun` test would say the wrong thing the day
 * somebody runs the dev CLI under bun, and a build-time define would be a
 * second fact to keep in step with the first.
 *
 * THE KEYS ARE "/"-SEPARATED AND ROOTED IN A PREFIX EACH: `web/` is the SPA as
 * `apps/web/dist` laid it out, and `kit/<agent>/` is `agents/dist/<agent>` as
 * that agent's kit layout walks it — `kit/claude/` and `kit/codex/` today.
 * Nothing else is carried, because nothing else is read from the checkout.
 *
 * THE SOURCE FORM IS BASE64 because the generated module is TypeScript that
 * `bun build` parses: a string literal survives that trip whatever the bytes
 * are, and a woff2 does not. Decoding is done once per file and remembered,
 * since the same asset is asked for on every page load.
 */

/** Every carried file as base64, or null in a checkout — see above. */
let carried: Readonly<Record<string, string>> | null = null;

/** Decoded bytes, kept because a browser asks for the same asset repeatedly. */
const decoded = new Map<string, Buffer>();

/**
 * Hands this process the files it carries. Called once, by the compiled
 * binary's entry, before the CLI or the daemon starts.
 */
export function setEmbeddedFiles(files: Readonly<Record<string, string>>): void {
  carried = files;
  decoded.clear();
}

/** Whether this process carries its own web app and agent kit. */
export function isEmbedded(): boolean {
  return carried !== null;
}

/** One carried file's bytes, or undefined when nothing is carried under that key. */
export function readEmbedded(held: string): Buffer | undefined {
  const remembered = decoded.get(held);
  if (remembered !== undefined) {
    return remembered;
  }
  const encoded = carried?.[held];
  if (encoded === undefined) {
    return undefined;
  }
  const bytes = Buffer.from(encoded, "base64");
  decoded.set(held, bytes);
  return bytes;
}

/** One carried file as text, for the kit — which is markdown and a hook script. */
export function readEmbeddedText(held: string): string | undefined {
  return readEmbedded(held)?.toString("utf8");
}

/**
 * Every carried key under a prefix, with the prefix taken off — the embedded
 * answer to a `readdir` walk. Sorted, so a kit written from the binary is
 * written in the same order every time.
 */
export function listEmbedded(prefix: string): string[] {
  return Object.keys(carried ?? {})
    .filter((held) => held.startsWith(prefix))
    .map((held) => held.slice(prefix.length))
    .sort();
}
