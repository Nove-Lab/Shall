import { readdirSync, watch, type FSWatcher } from "node:fs";
import path from "node:path";

/**
 * A project's `.shall` folder, watched — so that a file an agent wrote in a
 * terminal reaches the screen somebody is looking at.
 *
 * WHY THE FILESYSTEM AND NOT THE WRITE DOORS. Every write the daemon makes
 * already ends in the answer it hands back, and the browser refetches on the
 * strength of that. What it cannot see is the writes it did not make: an agent
 * editing spec markdown with its own tools, a `git checkout`, a person in an
 * editor. Those are exactly the case this exists for, and they are only visible
 * from the folder.
 *
 * WATCHING IS PER DIRECTORY AND NEVER RECURSIVE, and that is not a preference.
 * On Linux `fs.watch(dir, { recursive: true })` is a JavaScript fallback that
 * registers a watch on every FILE, and every write in this system lands as
 * `<name>.tmp` and is renamed onto its target — which unlinks the inode the
 * watch was holding. The first write to a file is reported and the second is
 * silence. A directory's inode is never replaced that way, and inotify reports
 * a child's creation, rename and modification to the directory holding it, so
 * one watch per folder sees every write for as long as the folder lives.
 *
 * A `.shall` folder is about thirty directories at its widest — four bands,
 * their type folders, and the ledger — so the descriptors are cheaper than the
 * per-file watch would have been anyway.
 */

/** How long a burst is allowed to be before it is called one change. */
const SETTLE_MS = 150;

/**
 * Written by the store as `<name>.<pid>.<random>.tmp` and renamed onto its
 * target. Ignoring it costs nothing: the rename that follows is reported under
 * the target's own name, which is the event worth having.
 */
function isTemporary(name: string): boolean {
  return name.endsWith(".tmp");
}

/**
 * READ SYNCHRONOUSLY, because the caller is owed a watch that is already
 * watching. A scan that finished a turn later would miss every write made in
 * that turn — including the one a subscriber makes the moment it is told the
 * connection is open. A `.shall` folder is about thirty directories, so the
 * cost of being certain is a handful of `readdir` calls.
 *
 * A folder that cannot be listed is not fatal here: it may have gone between
 * the walk and the read, and the watch on its parent will say so.
 */
function directoriesUnder(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    found.push(directory);
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(directory, entry.name));
      }
    }
  };
  walk(root);
  return found;
}

/**
 * Watches everything under `shallPath` and calls `onChange` once per burst of
 * writes, or `onFailure` when the watch itself comes apart.
 *
 * A FAILURE IS NOT SOMETHING THIS RECOVERS FROM, deliberately. If a watch dies
 * the folder is being told about and nobody is listening, which is worse than
 * saying so: the caller ends the connections it was feeding, and the browser's
 * own reconnect builds the whole thing again. A watcher that quietly limped on
 * would be a screen that quietly stopped being true.
 *
 * The returned function stops everything and is safe to call twice.
 */
export function watchShallFolder(
  shallPath: string,
  onChange: () => void,
  onFailure: (reason: Error) => void,
): () => void {
  const watchers = new Map<string, FSWatcher>();
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const stop = (): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    for (const watcher of watchers.values()) {
      watcher.close();
    }
    watchers.clear();
  };

  const fail = (reason: Error): void => {
    if (stopped) {
      return;
    }
    stop();
    onFailure(reason);
  };

  const settle = (): void => {
    if (timer !== null) {
      return;
    }
    // Unref'd so that a pending burst never holds a process open — a test that
    // has said what it came to say should exit, and so should the daemon.
    timer = setTimeout(() => {
      timer = null;
      if (!stopped) {
        onChange();
      }
    }, SETTLE_MS);
    timer.unref();
  };

  const scan = (): void => {
    if (stopped) {
      return;
    }
    const directories = directoriesUnder(shallPath);
    const live = new Set(directories);
    for (const [directory, watcher] of watchers) {
      if (!live.has(directory)) {
        watcher.close();
        watchers.delete(directory);
      }
    }
    for (const directory of directories) {
      if (watchers.has(directory)) {
        continue;
      }
      try {
        const watcher = watch(directory, (_event, name) => {
          if (name !== null && isTemporary(name)) {
            return;
          }
          // A folder may have arrived with this event — the ledger appears with
          // the first approval, a type folder with the first node of its type —
          // so every event is also the moment to look again.
          scan();
          settle();
        });
        watcher.on("error", (reason: Error) => fail(reason));
        watchers.set(directory, watcher);
      } catch (reason) {
        fail(reason as Error);
        return;
      }
    }
  };

  scan();
  return stop;
}
