/**
 * A refusal is something the caller can act on — a name the canon does not
 * have, an id already spoken for, a node that is not there — as opposed to a
 * fault, which is the daemon failing at its own job and nothing the person can
 * do anything about. The two must not arrive looking alike: one asks for a
 * different value, the other says the program is broken.
 *
 * The service says which of the three kinds a refusal is and nothing more. The
 * http layer turns that into a status code, so this side of the daemon never
 * has to know what a status code is.
 */
export type RefusalKind = "invalid" | "conflict" | "missing";

export class Refusal extends Error {
  readonly kind: RefusalKind;

  constructor(kind: RefusalKind, message: string) {
    super(message);
    this.name = "Refusal";
    this.kind = kind;
  }
}

/** The value cannot be what it is: blank, unknown to the canon, self-directed. */
export function invalid(message: string): Refusal {
  return new Refusal("invalid", message);
}

/** Something already written stands where this would go. */
export function conflict(message: string): Refusal {
  return new Refusal("conflict", message);
}

/** Nothing in the graph answers to that id. */
export function missing(message: string): Refusal {
  return new Refusal("missing", message);
}

export function isRefusal(error: unknown): error is Refusal {
  return error instanceof Refusal;
}
