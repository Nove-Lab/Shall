import { spawn } from "node:child_process";

/**
 * THE DAEMON AS A PROCESS: whether one is alive, how it is stopped, how one is
 * started, and how long to wait for the one that took the port to answer.
 *
 * IT IS ITS OWN FILE BECAUSE TWO COMMANDS ASK THE SAME QUESTIONS. `main.ts`
 * asks them before it adopts or replaces a daemon, and `upgrade.ts` asks them
 * again on the far side of a binary swap. A second copy of `stopProcess` would
 * be a second answer to how long Shall waits for a daemon to go, and a second
 * `spawn` would be a second answer to what a daemon is started with — the kind
 * of pair where the one that drifts is the one nobody was reading.
 *
 * NOTHING HERE JUDGES WHICH SHALL IS THE RIGHT ONE. Reading `/health` and
 * deciding what the answer means are different jobs: the meaning is `main.ts`'s
 * build marker and `upgrade.ts`'s wait for the new number, and each hands its
 * own test in rather than finding one here.
 */

/**
 * What `/health` answered: the bind host, and — on daemons new enough to say —
 * the version it runs and the procedures it serves, which together are the
 * build marker. `version: null` and `procedures: null` mean the daemon predates
 * that half of the marker, and a caller reads each as what it is. A null RETURN
 * is different: nothing answered at all.
 */
export interface DaemonHealth {
  host: string;
  version: string | null;
  procedures: readonly string[] | null;
}

export async function healthOf(url: string): Promise<DaemonHealth | null> {
  try {
    const response = await fetch(`${url}/health`);
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as {
      host?: unknown;
      version?: unknown;
      procedures?: unknown;
    };
    if (typeof body.host !== "string") {
      return null;
    }
    return {
      host: body.host,
      version: typeof body.version === "string" ? body.version : null,
      procedures:
        Array.isArray(body.procedures) &&
        body.procedures.every((name) => typeof name === "string")
          ? (body.procedures as string[])
          : null,
    };
  } catch {
    return null;
  }
}

/**
 * Where a process stands, as far as this one may know: `alive`, `gone`, or
 * `untouchable` — there, and not this process's to signal.
 *
 * `EPERM` IS AN ANSWER AND NOT A FAILURE. Signal zero is refused for a process
 * that exists and belongs to somebody else — or, inside a sandbox, for every
 * process outside it — and a refusal says the pid is taken. Reading it as
 * "gone" is how a sandboxed CLI came to forget, and try to stop, a daemon that
 * was running perfectly well outside its walls.
 */
export function processStanding(pid: number): "alive" | "gone" | "untouchable" {
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM" ? "untouchable" : "gone";
  }
}

export function isProcessAlive(pid: number): boolean {
  return processStanding(pid) !== "gone";
}

export async function stopProcess(pid: number): Promise<void> {
  process.kill(pid, "SIGTERM");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!isProcessAlive(pid)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Could not stop Shall daemon process ${pid}`);
}

/**
 * Waits for a daemon at `url` whose health the caller accepts — the bind it
 * asked for, the version it just installed — and answers whether one arrived.
 *
 * THE TEST IS THE CALLER'S, because a daemon that answers is not the same thing
 * as the daemon that was wanted: a spawn that lost the port to somebody else's
 * process would otherwise be reported as a start that worked.
 */
export async function waitForDaemon(
  url: string,
  accepts: (health: DaemonHealth) => boolean,
): Promise<boolean> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const health = await healthOf(url);
    if (health !== null && accepts(health)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

/**
 * Starts a daemon and lets go of it: detached, silent, and outliving the client
 * that asked for it — which is the whole point, since the next `shall` in any
 * terminal is meant to find it already holding the port.
 *
 * WHAT IT IS STARTED WITH IS THE CALLER'S. The two installs name the daemon two
 * different ways — a checkout has a `dist/main.js` to hand node, the single
 * binary has only itself and a flag — and that fork belongs where the install is
 * known, not here.
 */
export function startDaemon(
  daemonArguments: readonly string[],
  bindHost: string,
): void {
  const child = spawn(process.execPath, [...daemonArguments], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      NODE_ENV: "production",
      SHALL_HOST: bindHost,
    },
  });
  // A spawn that could not happen at all — a file that is not executable, a
  // path that is gone — arrives as an `error` EVENT, and an unlistened one is
  // thrown at the process. It is answered with silence on purpose: whether a
  // daemon is there is decided by asking the port, and a caller that heard the
  // spawn fail here would have two ways to learn the same thing.
  child.on("error", () => undefined);
  child.unref();
}
