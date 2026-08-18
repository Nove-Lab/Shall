import { getProjectShallPath } from "../host/project-files.js";
import { watchShallFolder } from "../host/spec-watcher.js";
import { requireRegistryProject } from "./projects.js";

/**
 * Who is listening to a project's folder, and the one watch that feeds them.
 *
 * THIS IS THE FIRST THING THE DAEMON HOLDS OPEN. Requests here have always been
 * answered from disk and forgotten — the registry is re-read every call, the
 * colours are recomputed every call, and the only state that survives a request
 * is core's write queue and its parse cache, both of which are memory and
 * nothing else. A watch is an operating-system resource, so this module is the
 * first that has to say when it is given back: the first subscriber opens the
 * watch and the last one to leave closes it.
 *
 * ONE FEED PER PROJECT AND NOT PER LISTENER. Two tabs on one project are two
 * listeners over one watch; a project nobody has open costs nothing at all.
 * The key is the project's path rather than its id, because two registry
 * entries for one folder are the same folder and would otherwise be watched
 * twice.
 *
 * A FAILED WATCH ENDS THE CONNECTIONS RATHER THAN LIMPING ON. The listeners are
 * told, the feed is torn down, and the browser's own reconnect asks for a new
 * one — which builds a new watch. There is no other way back: a feed that lost
 * its watch and kept its listeners is a screen that has quietly stopped being
 * true, and the whole point of this file is that the screen is true.
 *
 * The queue's assumption applies here too, and for the same reason it does
 * there: ONE DAEMON PER PROJECT. Two daemons on one folder each watch it and
 * each tell their own browsers, which is not wrong, only twice.
 */

type Feed = {
  readonly listeners: Set<Listener>;
  stop: () => void;
};

/** What a subscriber is told: something under `.shall` changed, or the watch died. */
export type Listener = {
  changed: () => void;
  failed: (reason: string) => void;
};

const feeds = new Map<string, Feed>();

function tearDown(shallPath: string, feed: Feed, reason: string | null): void {
  if (feeds.get(shallPath) !== feed) {
    return;
  }
  feeds.delete(shallPath);
  feed.stop();
  const listeners = [...feed.listeners];
  feed.listeners.clear();
  if (reason !== null) {
    for (const listener of listeners) {
      listener.failed(reason);
    }
  }
}

/**
 * Listens to one project, and answers with the way to stop listening.
 *
 * The project is resolved through the registry exactly as every other door
 * resolves one, so an id nobody knows is refused here rather than opening a
 * watch on nothing.
 */
export async function subscribe(
  projectId: string,
  listener: Listener,
): Promise<() => void> {
  const project = await requireRegistryProject(projectId);
  const shallPath = getProjectShallPath(project.path);

  let feed = feeds.get(shallPath);
  if (feed === undefined) {
    const listeners = new Set<Listener>();
    const opened: Feed = { listeners, stop: () => undefined };
    opened.stop = watchShallFolder(
      shallPath,
      () => {
        for (const each of listeners) {
          each.changed();
        }
      },
      (reason) => {
        tearDown(
          shallPath,
          opened,
          `Shall stopped watching ${shallPath}: ${reason.message}`,
        );
      },
    );
    feeds.set(shallPath, opened);
    feed = opened;
  }
  feed.listeners.add(listener);

  const held = feed;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    held.listeners.delete(listener);
    if (held.listeners.size === 0) {
      tearDown(shallPath, held, null);
    }
  };
}

/**
 * Every feed closed and every listener told, for a daemon on its way out.
 *
 * Shutdown calls this BEFORE it closes the server, because an open feed is an
 * unfinished response and a server does not close over one of those.
 */
export function closeAllFeeds(): void {
  for (const [shallPath, feed] of [...feeds]) {
    tearDown(shallPath, feed, "Shall is shutting down.");
  }
}
