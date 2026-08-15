/**
 * The three ways a door in `core/store` says no.
 *
 * A MODULE OF ITS OWN SO THAT EVERY DOOR CAN THROW ONE. The spec folder's doors
 * and the approval ledger's door share this vocabulary without either importing
 * the other, which is the whole reason it does not live beside one of them.
 *
 * Nothing here touches a filesystem. A refusal is a sentence and a kind; what
 * went wrong on disk is `files.ts`'s business, and which refusal that amounts to
 * is the door's, because only the door knows what was being attempted.
 */

/**
 * A refusal is something the caller can act on — an id already taken, a node
 * that is not there, a file on disk in a state a save would destroy — as opposed
 * to a fault, which is this module failing at its own job.
 *
 * The kinds are the daemon's three, spelled the same, because the daemon is what
 * turns them into status codes and a second vocabulary here would be a
 * translation table nobody maintains. This module cannot import the daemon's
 * `Refusal` (core knows nothing about a transport), so it throws its own and the
 * service maps it.
 */
export type RefusalKind = "invalid" | "conflict" | "missing";

export class StoreRefusal extends Error {
  readonly kind: RefusalKind;

  constructor(kind: RefusalKind, message: string) {
    super(message);
    this.name = "StoreRefusal";
    this.kind = kind;
  }
}

export function isStoreRefusal(error: unknown): error is StoreRefusal {
  return error instanceof StoreRefusal;
}

/** The value cannot be what it is: unknown to the canon, blank, self-directed. */
export function invalid(message: string): StoreRefusal {
  return new StoreRefusal("invalid", message);
}

/** Something already written stands where this would go. */
export function conflict(message: string): StoreRefusal {
  return new StoreRefusal("conflict", message);
}

/** Nothing in the folder answers to that id. */
export function missing(message: string): StoreRefusal {
  return new StoreRefusal("missing", message);
}
