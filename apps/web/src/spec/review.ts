import type { api } from "@/api";
import type { SpecEdge, SpecNode } from "./spec-node";
import type { Closure, Signal } from "./view/furniture";

/**
 * WHAT THE DAEMON SAYS ABOUT THE GRAPH, IN THE SHAPES THIS SURFACE READS IT IN.
 *
 * EVERY TYPE BELOW IS DERIVED FROM THE CLIENT AND NONE IS WRITTEN OUT. The
 * router's answer is already a type — it travels here through
 * `@shall/daemon/router` — so a hand-written copy of it would be a second
 * declaration of the wire, out of step on the first field the daemon adds and
 * with nothing to error. `Awaited<ReturnType<…>>` is how a caller with no
 * `@trpc/server` dependency names an answer, and this app has none.
 *
 * IT IS A `.ts` AND NOT A `.tsx` ON PURPOSE. Nothing here renders: the colour a
 * node wears, the relations that point at it and the sentences a person reads
 * are all decisions that can be made — and read — without a browser, and the
 * components that draw them live in `review-parts.tsx`.
 */
export type ReviewReport = Awaited<ReturnType<typeof api.spec.review.query>>;
/** One node that has a colour, and the one word for why. */
export type ReviewStatus = ReviewReport["statuses"][number];
export type StatusReason = ReviewStatus["reason"];
/** An id something still points at with nothing behind it. */
export type MissingNode = ReviewReport["missing"][number];
/** A file under `.shall/spec` that would not read, with every sentence against it. */
export type BrokenFile = ReviewReport["broken"][number];
export type ApprovedVersion = Awaited<
  ReturnType<typeof api.spec.approvedVersion.query>
>;
export type GitStatus = Awaited<ReturnType<typeof api.spec.gitStatus.query>>;

/**
 * THE QUEUE'S OWN SHAPES, DERIVED THE SAME WAY AND FOR THE SAME REASON.
 *
 * A bundle is a discriminated union on the wire, so the three arms are pulled
 * out with `Extract` rather than re-spelled: `core/arith/bundles.ts` is where
 * the union is decided, and a kind renamed there is a compile error at these
 * four lines instead of a card that silently never matches.
 *
 * THE MEMBER IS TAKEN OFF ONE ARM AND IS THE SAME TYPE ON ALL THREE. The daemon
 * declares `AcClosureBundle.evidence` as `EvidenceMember extends BundleMember`,
 * so reading the member shape off the spec-approval arm names the common half
 * exactly, and `EvidenceMember` names the half that carries the work log.
 */
export type ReviewQueue = Awaited<
  ReturnType<typeof api.spec.reviewQueue.query>
>;
export type ReviewBundle = ReviewQueue["bundles"][number];
export type BundleKind = ReviewBundle["kind"];
export type SpecApprovalBundle = Extract<
  ReviewBundle,
  { kind: "spec-approval" }
>;
export type WorkReportBundle = Extract<ReviewBundle, { kind: "work-report" }>;
export type AcClosureBundle = Extract<ReviewBundle, { kind: "ac-closure" }>;
export type TaskClosureBundle = Extract<ReviewBundle, { kind: "task-closure" }>;
/** One row of a bundle: a node, its colour, and what the two books say about it. */
export type BundleMember = SpecApprovalBundle["members"][number];
/** A claimant, which is a member with the work log that submitted it. */
export type EvidenceMember = AcClosureBundle["evidence"][number];
/**
 * The other kind of claimant: a completion report, with the work log that
 * submitted it.
 */
export type ReportMember = TaskClosureBundle["reports"][number];
/**
 * THE OTHER SURFACE COMPUTED ON READ — what the specification needs fixed, and
 * what is ready to be worked on. Derived from the procedure like everything
 * else here, so a field added in `core/arith/board.ts` arrives typed.
 */
export type TaskBoard = Awaited<ReturnType<typeof api.spec.taskBoard.query>>;
export type FixSpecItem = TaskBoard["fixSpec"][number];
export type ImplementItem = TaskBoard["implement"][number];
/** A node named as a reference on a board row: id, short name, name. */
export type Ref = ImplementItem["modules"][number];

/** Blocked, ready or done — the word a task wears beside its id. */
export type TaskState = NonNullable<ReviewStatus["taskState"]>;

/** What a rejection leaves in the book — the daemon hands the record straight back. */
export type RejectionRecord = Awaited<
  ReturnType<typeof api.spec.reject.mutate>
>;

/**
 * WHETHER A CRITERION IS MET, RE-EXPORTED AND NOT RE-DECLARED.
 *
 * It is `view/furniture.ts`'s word, for the same reason `Signal` is: a card
 * carries it, and `view/` may not import a wire type. Everything on this surface
 * that is not the canvas reads it from here, so there is one import for a
 * verdict and one for the mark beside it — and still exactly one declaration.
 */
export type { Closure };

/**
 * NO COLOURS YET — the board before the first review lands, as one shared value
 * rather than a fresh empty map per render.
 *
 * Its identity is the point. Every card on the canvas is rebuilt when the map it
 * was built against changes, so a `new Map()` written inline would hand React
 * Flow fifty new node objects on every render of the plane. `NOTHING_SELECTED`
 * in `view/highlight.ts` is the same trick for the same reason.
 */
export const NO_SIGNALS: ReadonlyMap<string, Signal> = new Map();

/**
 * THE ONE LINE WHERE THE DAEMON'S COLOUR BECOMES THE CANVAS'S SIGNAL.
 *
 * The two unions are declared a repository apart — `core/arith/color.ts` names
 * the verdict, `view/furniture.ts` names what a card can wear — and this
 * assignment is where they have to agree. A fourth colour on the wire is a
 * compile error HERE, in a file whose whole job is the crossing, rather than a
 * card silently drawn in no class at all.
 *
 * A NODE WITH NO ENTRY GETS NO SIGNAL, and that absence is the daemon's answer
 * rather than a gap — every canon type is coloured now, the execution band
 * included, so a card without a dot is a card the review has not answered for.
 * Nothing here computes a verdict of its own.
 */
export function signalsOf(
  report: ReviewReport | null,
): ReadonlyMap<string, Signal> {
  if (report === null) {
    return NO_SIGNALS;
  }

  const signals = new Map<string, Signal>();
  for (const status of report.statuses) {
    signals.set(status.id, status.color);
  }
  return signals;
}

/**
 * NO MARKS YET, as one shared value — `NO_SIGNALS` above carries the reason, and
 * it is the same reason: this map is a dependency of the card memo, so a fresh
 * empty one per render would be fifty new cards on a board nothing changed on.
 */
export const NO_CLOSURES: ReadonlyMap<string, Closure> = new Map();

/**
 * THE SECOND AXIS, KEYED BY ID — and only the nodes it means anything for.
 *
 * A status whose `closure` is `null` is not a criterion at all, so it is left
 * OUT of the map rather than entered against a third word: a card asks the map
 * whether to draw a mark, and "no entry" is that answer. The one word the daemon
 * did send travels through unread — nothing here works a closure out for itself,
 * exactly as `signalsOf` works no colour out.
 *
 * IT IS THE OTHER LINE WHERE THE WIRE MEETS THE CANVAS, and it is the crossing
 * for the same reason `signalsOf` is: `core/arith/review.ts` names the answer
 * and `view/furniture.ts` names what a card can wear, and a third state added to
 * either is a compile error at this `set` rather than a mark silently not drawn.
 */
export function closuresOf(
  report: ReviewReport | null,
): ReadonlyMap<string, Closure> {
  if (report === null) {
    return NO_CLOSURES;
  }

  const closures = new Map<string, Closure>();
  for (const status of report.statuses) {
    if (status.closure !== null) {
      closures.set(status.id, status.closure);
    }
  }
  return closures;
}

/**
 * NO TASK WORDS YET, as one shared value — the reason `NO_SIGNALS` gives, again:
 * this map is a dependency of the card memo.
 */
export const NO_TASK_STATES: ReadonlyMap<string, TaskState> = new Map();

/**
 * THE TASK'S OWN WORD, KEYED BY ID — and only for the type it means anything
 * for, exactly as `closuresOf` above keys only the nodes that have a mark.
 *
 * It is the BOARD'S answer travelling to the canvas: `core/arith/task-state.ts`
 * decides it once, the Task Board's Implement column is the `ready` ones, and
 * the badge beside a task's id on the Spec plane reads this map. Nothing here
 * works a state out for itself.
 */
export function taskStatesOf(
  report: ReviewReport | null,
): ReadonlyMap<string, TaskState> {
  if (report === null) {
    return NO_TASK_STATES;
  }

  const states = new Map<string, TaskState>();
  for (const status of report.statuses) {
    if (status.taskState !== null) {
      states.set(status.id, status.taskState);
    }
  }
  return states;
}

/** The same list keyed by id, for the panel — which wants the reason, not the colour. */
export function statusesById(
  report: ReviewReport | null,
): ReadonlyMap<string, ReviewStatus> {
  const byId = new Map<string, ReviewStatus>();
  for (const status of report?.statuses ?? []) {
    byId.set(status.id, status);
  }
  return byId;
}

/** The nodes keyed by id — the lookup both detail pages build before rendering rows. */
export function nodesById(
  nodes: readonly SpecNode[],
): ReadonlyMap<string, SpecNode> {
  const byId = new Map<string, SpecNode>();
  for (const node of nodes) {
    byId.set(node.id, node);
  }
  return byId;
}

/**
 * WHETHER A PERSON CAN PASS JUDGEMENT ON THIS STATUS AT ALL — yellow or green,
 * which is to say a node whose file reads and whose place in the graph stands.
 * Red has no door: a broken file, an orphan and a standing rejection are not
 * judgements waiting to be made. One spelling, because the panel's two buttons,
 * the canvas menu and the queue's rows all gate on it and used to spell it
 * severally.
 */
export function judgeable(status: Pick<ReviewStatus, "color">): boolean {
  return status.color === "yellow" || status.color === "green";
}

/**
 * WHETHER THE APPROVE BUTTON HAS ANY BUSINESS SHOWING for this member: yellow —
 * the one colour approving resolves — and no deletion proposal standing over
 * it, which has its own two buttons. The batch door and the per-row button both
 * read this one spelling, so [Approve all] can never send an id the row itself
 * would not offer.
 */
export function approvable(member: {
  readonly color: Signal;
  readonly deletionProposed: boolean;
}): boolean {
  return member.color === "yellow" && !member.deletionProposed;
}

/**
 * THE RELATIONS THAT POINT AT A NODE — what a deletion leaves drawn to nothing.
 *
 * Only the relations pointing IN. The ones that start at the node go with it,
 * so they are not what a person deleting it has to be warned about.
 */
export function referrersOf(
  edges: readonly SpecEdge[],
  id: string,
): SpecEdge[] {
  return edges.filter((edge) => edge.toId === id);
}

/**
 * THE FIRST LINE OF A RATIONALE, for the places it is QUOTED rather than shown —
 * the caption under a verdict for a rejection that no longer stands, and the
 * closure card's history rows. A caption that grew to twelve lines would bury
 * the node it is about; nothing is lost, because a standing rejection is drawn
 * whole wherever it stands. It cuts on the author's own line break rather than
 * at a character count, so the quote never stops mid-word. One helper for both
 * surfaces, so the queue and the panel cannot quote the same sentence two ways.
 */
export function firstLine(text: string): string {
  return text.split("\n", 1)[0] ?? text;
}

/**
 * WHAT DELETING A NODE DOES, IN THE ORDER IT MATTERS: what goes, what is left
 * pointing at nothing, and that neither comes back. Both dialogs that can delete
 * a node say it in these words, because there is one answer and it does not
 * depend on which door the person came through.
 */
export function deletionSentence(id: string): string {
  return `${id} leaves the graph, and the relations that start at it go with it. Relations that point at it stay behind, drawn to a node that is no longer there. This cannot be undone.`;
}

/**
 * HOW MUCH IS POINTING AT IT, COUNTED IN RELATIONS AND NOT IN NODES. The list
 * drawn under this sentence is one row per relation, so a number counted any
 * other way would be a number the reader can see is wrong: two relations between
 * the same pair are two rows and are two here.
 */
export function impactSentence(id: string, count: number): string {
  if (count === 0) {
    return `Nothing points at ${id}.`;
  }
  if (count === 1) {
    return `One relation points at ${id}. Deleting it leaves that relation drawn to a node that is gone.`;
  }
  return `${String(count)} relations point at ${id}. Deleting it leaves them drawn to a node that is gone.`;
}

/**
 * The two lists the Problems dialog is made of, counted once here so the button
 * that opens it and the dialog it opens cannot disagree about how many there are.
 */
export function problemCount(report: ReviewReport | null): number {
  return report === null ? 0 : report.missing.length + report.broken.length;
}
