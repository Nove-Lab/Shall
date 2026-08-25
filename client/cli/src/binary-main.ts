import { setEmbeddedFiles } from "@shall/daemon/embedded";

/**
 * WHAT THE SINGLE-FILE SHALL RUNS FIRST — the fork between the two things one
 * binary has to be, and nothing else.
 *
 * SHALL SHIPS AS ONE FILE PER PLATFORM, so the client and the daemon are the
 * same executable met twice: a person types `shall status`, and that process
 * starts another copy of itself to hold the port. This is where the second copy
 * is told which of the two it is.
 *
 * THE FLAG IS DELIBERATELY NOT A COMMAND. `--daemon` is absent from the shapes
 * table in `args.ts` and from `shall help`, because it is not something a
 * person is ever meant to type: it is one process's word to the next, and the
 * help screen is the list of what Shall does, not of what it says to itself. It
 * is read here rather than in the parser so the parser goes on being the file
 * that knows every shape there is.
 *
 * THE ARGUMENTS ARE READ THE WAY THE PARSER READS THEM. A compiled bun binary
 * lays `process.argv` out exactly as node does — the runtime, then the script,
 * then what the person typed — so the flag is `argv[2]`, the same slot
 * `parseArguments` takes as the first word.
 *
 * NOTHING HERE IS REACHED FROM A CHECKOUT. The dev install runs `main.ts`
 * directly through its bin entry, so this file is dead weight in a checkout and
 * the only place the carried files are ever handed over.
 */

/** One process's word to the next: run the daemon, not the client. */
export const DAEMON_FLAG = "--daemon";

/** Whether this run was asked to be the daemon rather than the client. */
export function wantsDaemon(argv: readonly string[]): boolean {
  return argv[2] === DAEMON_FLAG;
}

/**
 * The binary's whole life: take the files it carries, then be one of the two
 * programs inside it.
 *
 * THE FILES ARE REGISTERED BEFORE EITHER SIDE STARTS, client included — the
 * client asks whether they are there to know how to spawn its daemon, and
 * registering costs a reference to an object the executable already holds.
 *
 * BOTH SIDES ARE IMPORTED AND NOT CALLED, because both are scripts that run on
 * import: `main.ts` next door reads the arguments at its foot, and the daemon's
 * `main.ts` binds the port at its own. Importing is how you start them, and
 * importing only the one that was asked for is how the client run never pays
 * for the daemon's start.
 */
export async function runBundled(
  files: Readonly<Record<string, string>>,
): Promise<void> {
  setEmbeddedFiles(files);
  if (wantsDaemon(process.argv)) {
    await import("@shall/daemon/main");
    return;
  }
  await import("./main.js");
}
