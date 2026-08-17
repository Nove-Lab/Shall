import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";

/**
 * The one way this daemon puts bytes on a path it does not own alone.
 *
 * It was written twice before it was written here — once for the project's own
 * `.shall` folder and once for the settings file Shall merges two lines into —
 * and a third caller was one copy too many. The rule is the same wherever it is
 * used, so it is stated once.
 */

/**
 * A name no other write is using, which the pid alone is not.
 *
 * A pid is constant for the life of a process, so two writes to one target
 * inside one daemon — two tabs opening the same project, a double click on the
 * picker, `shall init` racing the browser — pick the same temporary name: one
 * truncates the other's bytes and the loser renames a file that has already
 * been moved away. The pid is kept because it says WHO left a stray file
 * behind; the random tail says which write. `*.tmp` still matches, so the
 * project's ignore rule does not change.
 */
export function temporaryName(target: string): string {
  return `${target}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
}

/**
 * Written beside the target and moved onto it, so nothing ever reads half a
 * file, and swept up if the write fails so a crash leaves no litter — in the
 * project's folder or in somebody else's `.claude`.
 */
export async function writeByRename(
  target: string,
  text: string,
): Promise<void> {
  const temporary = temporaryName(target);
  try {
    await writeFile(temporary, text, "utf8");
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
