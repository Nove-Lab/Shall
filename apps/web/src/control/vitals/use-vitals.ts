import { useEffect, useState } from "react";
import { api } from "@/api";
import { useRevision } from "@/live";
import type { Vitals } from "./rows";

/**
 * THE ONE WAY THE VITALS ARE ASKED FOR, used by the Overview card and the page
 * alike — so the bar on the card and the row on the page cannot read the
 * procedure two ways. It is the fetch bargain every control-plane surface
 * writes by hand, written once: the mount effect owns the skeleton and the
 * refusal, keyed on the project id, with success and failure both under the
 * `live` latch so a slow answer for a project somebody has left is never drawn
 * as this one's; and a second effect on the tick re-reads what is already here
 * and clears nothing.
 *
 * `computedAt` IS THE MOMENT THE ANSWER ARRIVED, stamped here and not on the
 * wire. The daemon computes the vitals afresh on every ask and adds nothing to
 * core's answer, so the instant the answer lands is the computation's own
 * within one round trip — and the page says "computed" rather than "fetched"
 * because that is what it was.
 */
export function useVitals(projectId: string): {
  vitals: Vitals | null;
  error: string | null;
  computedAt: number | null;
} {
  const [vitals, setVitals] = useState<Vitals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [computedAt, setComputedAt] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setVitals(null);
    setError(null);
    setComputedAt(null);
    api.spec.vitals
      .query({ projectId })
      .then((next) => {
        if (live) {
          setVitals(next);
          setComputedAt(Date.now());
        }
      })
      .catch((loadError: unknown) => {
        if (live) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not read the vitals",
          );
        }
      });
    return () => {
      live = false;
    };
  }, [projectId]);

  /**
   * A CHANGE ON DISK RE-READS WHAT IS ALREADY HERE, AND CLEARS NOTHING. A file
   * an agent wrote does not blink the figures back to skeletons on their way
   * to being right; a failure here keeps what is on screen and says nothing,
   * and the next change asks again.
   */
  const revision = useRevision();
  useEffect(() => {
    if (revision === 0) {
      return;
    }
    let live = true;
    api.spec.vitals
      .query({ projectId })
      .then((next) => {
        if (live) {
          setVitals(next);
          setComputedAt(Date.now());
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [revision, projectId]);

  return { vitals, error, computedAt };
}
