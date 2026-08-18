import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * A tick that goes up whenever this project's folder changes on disk.
 *
 * IT CARRIES NO DATA, AND THAT IS THE WHOLE DESIGN. Every surface here already
 * knows how to read what it needs; what none of them knew was WHEN. So the
 * daemon's stream says only "something moved" and each surface asks its own
 * question again — the same question it asks on first paint, through the same
 * client, with the same answer shape. Nothing has to be invalidated, nothing
 * has to be merged, and a surface that has not been taught about this still
 * works exactly as it did.
 *
 * THE REFETCH IS SILENT. The one live thing this app had before today is the
 * header's branch, which updates on window focus and says nothing about it; a
 * banner announcing that the screen is now correct would interrupt a person to
 * tell them what they are already reading. The single exception is a node
 * somebody is editing that has changed underneath them, which `NodePanel` says
 * beside the save button, because there the truth costs something to accept.
 */

const Revision = createContext(0);

/**
 * The bump is coalesced, and the window is not about the network.
 *
 * A save through the UI already ends in that surface's own refetch, and the
 * daemon's watch reports the same write a moment later — so without this every
 * edit through the app costs two reads of the graph and two `git status` child
 * processes. The daemon settles a burst for 150ms; this settles what is left.
 */
const COALESCE_MS = 250;

export function LiveProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = (): void => {
      if (timer !== null) {
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        if (alive) {
          setRevision((count) => count + 1);
        }
      }, COALESCE_MS);
    };

    const source = new EventSource(
      `/api/projects/${encodeURIComponent(projectId)}/events`,
    );
    source.addEventListener("change", bump);
    // A RECONNECT IS A BUMP, EXCEPT THE FIRST ONE. The daemon restarting, the
    // laptop waking, a proxy dropping a quiet connection — every one of them is
    // a stretch of time this page was told nothing about, so the safe reading
    // of a reopened stream is that something happened while it was shut.
    let opened = false;
    source.addEventListener("open", () => {
      if (opened) {
        bump();
        return;
      }
      opened = true;
    });

    // A FOCUS IS A BUMP TOO, AND NOT ONLY AS INSURANCE. The watch sees `.shall`
    // and nothing else, so a commit made in a terminal moves what `git status`
    // answers without moving a single watched byte. Coming back to the window
    // is when that has usually just happened — the same reason the header asks
    // for its branch then — and one refetch per return to the tab is what that
    // costs.
    window.addEventListener("focus", bump);

    return () => {
      alive = false;
      if (timer !== null) {
        clearTimeout(timer);
      }
      window.removeEventListener("focus", bump);
      source.close();
    };
  }, [projectId]);

  return <Revision value={revision}>{children}</Revision>;
}

/**
 * The tick. Read it in an effect beside the one that loads on mount — never in
 * that effect's own dependencies, because those effects also own the reset of
 * everything a person has open, and a refetch is not a reset.
 */
export function useRevision(): number {
  return useContext(Revision);
}
