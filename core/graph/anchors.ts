import { bandOf, type NodeTypeName } from "./canon.js";

/**
 * What HOLDS a node to the graph: the one relation a node of each type must be
 * on the right end of before it is part of the specification rather than a card
 * somebody left lying on the canvas.
 *
 * THIS IS NOT A SECOND COPY OF THE EDGE GRAMMAR AND IT CANNOT BECOME ONE. The
 * grammar says which relations are ALLOWED, which is a question about a pair of
 * types; this table says which relation is REQUIRED to reach a node, which is a
 * question about one type and has at most a couple of answers. Every row below
 * is a row the grammar already permits — `anchors.test.ts` walks the two tables
 * against each other, and that cross-check is the whole reason this one can be
 * trusted.
 *
 * Written one row per line in canon order, in `EDGE_GRAMMAR`'s hand-transcribed
 * style and for its reason: a loop over helper arrays would hide a wrong
 * direction behind plausible-looking code, and a wrong direction here turns a
 * healthy node red on somebody's screen.
 *
 * THREE TYPES ANCHOR NOTHING AND THAT IS THE POINT. `Term`, `DomainEntity` and
 * `Goal` are where the canon starts — a vocabulary word and a top goal are
 * worth having before anything points at them, so requiring an anchor of them
 * would make an empty project's first node wrong the moment it was written. The
 * six execution types are rootless here too, but for a different reason: they
 * sit outside colour altogether (see `isColored`), so nothing ever asks.
 *
 * Nothing here reads a file, a database or a clock, so it is as safe in a
 * browser bundle as the rest of `core/graph`.
 */

/**
 * Which way the anchoring relation runs, seen FROM THE NODE. `in` is the usual
 * one — the canon flows downward and a node is held by whatever above it
 * reaches down. `out` is the satellite `Decision`, which is held by the
 * question it answers rather than by anything that points at it.
 */
export type AnchorDirection = "in" | "out";

/** One relation that would hold a node: its type, and the way it runs. */
export interface AnchorEdge {
  readonly direction: AnchorDirection;
  readonly edgeType: string;
}

/**
 * One node type's anchors. SEVERAL ANCHORS ARE AN "OR", NEVER AN "AND": an
 * `Interface` is held by being exposed or by being consumed, and a module that
 * only calls a contract has anchored it just as well as the module that
 * publishes it.
 */
export interface AnchorRule {
  readonly type: NodeTypeName;
  readonly anchors: readonly AnchorEdge[];
}

/** Every type, one row each — an empty `anchors` list is a rootless type. */
export const ANCHOR_RULES: readonly AnchorRule[] = [
  // Domain. The vocabulary the rest is written in; it stands on its own.
  { type: "Term",                 anchors: [] },
  { type: "DomainEntity",         anchors: [] },

  // Intent, one line down from Goal: each type is held by the relation that
  // derived it, which is §3-1 of the canon read as a chain.
  { type: "Goal",                 anchors: [] },
  { type: "Actor",                anchors: [{ direction: "in", edgeType: "PURSUED_BY" }] },
  { type: "UseCase",              anchors: [{ direction: "in", edgeType: "PERFORMS" }] },
  { type: "Scenario",             anchors: [{ direction: "in", edgeType: "DETAILS" }] },
  { type: "SystemResponsibility", anchors: [{ direction: "in", edgeType: "DERIVES_RESPONSIBILITY" }] },
  { type: "Requirement",          anchors: [{ direction: "in", edgeType: "REQUIRES" }] },
  { type: "AcceptanceCriterion",  anchors: [{ direction: "in", edgeType: "HAS_CRITERION" }] },
  { type: "Constraint",           anchors: [{ direction: "in", edgeType: "HAS_CONSTRAINT" }] },

  // Plan. The two-anchor rows are here: a contract may be exposed or consumed,
  // and a task may be allocated by a module or planned from a criterion.
  { type: "ModuleDesign",         anchors: [{ direction: "in", edgeType: "IS_REALIZED_BY" }] },
  { type: "Interface",            anchors: [{ direction: "in", edgeType: "EXPOSES" }, { direction: "in", edgeType: "CONSUMES" }] },
  { type: "DataSchema",           anchors: [{ direction: "in", edgeType: "CARRIES" }] },
  { type: "ImplementationTask",   anchors: [{ direction: "in", edgeType: "ALLOCATES" }, { direction: "in", edgeType: "IS_PLANNED_BY" }] },

  // Execution. Rootless because it is outside colour: a journal entry is a
  // record of what happened, and a record is never wrong for standing alone.
  { type: "Journal",              anchors: [] },
  { type: "WorkLog",              anchors: [] },
  { type: "Evidence",             anchors: [] },
  { type: "Commit",               anchors: [] },
  { type: "VerificationReport",   anchors: [] },
  { type: "Finding",              anchors: [] },

  // Satellites. Two hang off the chalk node that raised them; the third is the
  // one row in this table that points the other way — a `Decision` is held by
  // the question it resolves or by what it affects, and nothing in the canon
  // points at a `Decision` at all.
  { type: "Assumption",           anchors: [{ direction: "in", edgeType: "ASSUMES" }] },
  { type: "Question",             anchors: [{ direction: "in", edgeType: "RAISES" }] },
  { type: "Decision",             anchors: [{ direction: "out", edgeType: "RESOLVES" }, { direction: "out", edgeType: "AFFECTS" }] },
];

/** Empty for a rootless type and for a type outside the canon alike. */
export function anchorsFor(type: string): readonly AnchorEdge[] {
  return ANCHOR_RULES.find((rule) => rule.type === type)?.anchors ?? [];
}

/**
 * Whether the canon lets this type stand on its own.
 *
 * A TYPE NOBODY HAS HEARD OF IS NOT ROOTLESS, it is unknown — so the row has to
 * exist before the answer is yes. `anchorsFor` cannot tell the two apart on its
 * own, because both answer with an empty list, and answering `true` for a
 * misspelled type would quietly excuse it from the one rule it should have
 * failed.
 */
export function isRootless(type: string): boolean {
  const rule = ANCHOR_RULES.find((entry) => entry.type === type);
  return rule !== undefined && rule.anchors.length === 0;
}

/**
 * Whether a node of this type is coloured at all.
 *
 * DOMAIN, INTENT AND PLAN ARE THE SPECIFICATION; EXECUTION IS THE RECORD OF
 * DOING IT. A record does not get approved and cannot go stale — a work log
 * from March is exactly as true in June — so asking whether it is green is
 * asking a question it has no answer to. The satellites are coloured, because
 * `bandOf` draws them in Intent and an unanswered question is a real hole in a
 * specification.
 *
 * An unknown type is not coloured either. It is not a judgement about that type
 * so much as the absence of one: nothing here knows what it would mean.
 */
export function isColored(type: string): boolean {
  const band = bandOf(type);
  return band === "Domain" || band === "Intent" || band === "Plan";
}

/** "an" before a vowel letter, "a" before anything else — the edge types are ASCII. */
function articleFor(word: string): string {
  return /^[AEIOU]/i.test(word) ? "an" : "a";
}

/**
 * Any one of these will do, which is what "or" says here — and it is the whole
 * of what several anchors mean, so the same join serves the names inside a
 * clause and the clauses themselves.
 */
function anyOf(parts: readonly string[]): string {
  return parts.join(" or ");
}

/** Which end of the relation the node is on, said as a person would say it. */
function directionClause(direction: AnchorDirection): string {
  return direction === "in" ? "into it" : "out of it";
}

/**
 * What would anchor a node of this type, as a fragment of English a refusal or
 * a panel can drop into a sentence: "a REQUIRES relation into it".
 *
 * `null` when there is nothing to say — a rootless type or a type outside the
 * canon — so a caller writes the whole sentence or none of it rather than
 * assembling one around an empty phrase.
 *
 * EVERY ROW OF THE TABLE IS SINGLE-DIRECTION TODAY, and the code below does not
 * assume it will stay that way: the anchors are grouped by direction, each group
 * gets its own article and clause, and the groups join with the same " or ".
 * A row mixing the two would read "an EXPOSES relation into it or a RESOLVES
 * relation out of it", which is still one sentence a person can act on.
 */
export function anchorPhrase(type: string): string | null {
  const anchors = anchorsFor(type);
  if (anchors.length === 0) {
    return null;
  }
  const clauses: string[] = [];
  for (const direction of ["in", "out"] as const) {
    const names = anchors
      .filter((anchor) => anchor.direction === direction)
      .map((anchor) => anchor.edgeType);
    const first = names[0];
    if (first === undefined) {
      continue;
    }
    clauses.push(
      `${articleFor(first)} ${anyOf(names)} relation ${directionClause(direction)}`,
    );
  }
  return anyOf(clauses);
}
