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
 * FOUR TYPES ANCHOR NOTHING AND THAT IS THE POINT. `Term`, `DomainEntity` and
 * `Goal` are where the canon starts — a vocabulary word and a top goal are
 * worth having before anything points at them, so requiring an anchor of them
 * would make an empty project's first node wrong the moment it was written.
 * `Journal` is the fourth: it is where the execution record starts, and
 * nothing in the canon points at a journal. The rest of the execution band is
 * anchored like everything else — a work log by the journal that logs it or
 * the task it addresses, a finding by the work log that recorded it, and
 * evidence and a completion report by their own claim alone — because a
 * record nothing reaches is as much a card left lying on the canvas as a
 * requirement nothing requires.
 *
 * Nothing here reads a file, a database or a clock, so it is as safe in a
 * browser bundle as the rest of `core/graph`.
 */

/**
 * Which way the anchoring relation runs, seen FROM THE NODE. `in` is the usual
 * one — the canon flows downward and a node is held by whatever above it
 * reaches down.
 *
 * `out` IS THE NODE THAT NAMES ITS OWN SUBJECT. A `Decision` is held by what it
 * revises, because nothing in the canon points at a decision at all; and, since
 * the aim, the addressing and the claim became the lower node's own lines, an
 * `ImplementationTask` is held by the criterion it targets, a `WorkLog` by the
 * task it addresses, an `Evidence` by the criterion it claims to satisfy and a
 * `TaskCompletionReport` by the task it says is finished.
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
  // and a task by the module that allocates it or by the criterion its own
  // TARGETS line aims at.
  { type: "ModuleDesign",         anchors: [{ direction: "in", edgeType: "IS_REALIZED_BY" }] },
  { type: "Interface",            anchors: [{ direction: "in", edgeType: "EXPOSES" }, { direction: "in", edgeType: "CONSUMES" }] },
  { type: "DataSchema",           anchors: [{ direction: "in", edgeType: "CARRIES" }] },
  { type: "ImplementationTask",   anchors: [{ direction: "in", edgeType: "ALLOCATES" }, { direction: "out", edgeType: "TARGETS" }] },

  // A DECISION IS HELD BY WHAT IT REVISES, and this row is where the canon's
  // "at least one" lives. Nothing in the canon points at a decision, so the
  // anchor has to leave it; `AFFECTS` and not `RESOLVES` because a decision
  // that revises nothing is not a decision, while one that answers no finding
  // is merely a revision somebody wanted. Written this way the cardinality
  // needs no machinery of its own: "at least one live AFFECTS" is exactly what
  // the orphan rule already asks of every anchored type, so a decision with
  // none is red for the same reason and in the same sentence as any other node
  // nothing holds.
  { type: "Decision",             anchors: [{ direction: "out", edgeType: "AFFECTS" }] },

  // Execution. The journal is the root of the record; a finding is held by the
  // work log that recorded it, and a work log by the journal that logs it or
  // by the task its own ADDRESSES line reaches — either of those will do.
  // A FINDING IS HELD FROM ABOVE AND POINTS AT NOTHING. It starts no relation
  // in the canon at all, so the `RECORDS` line in the work log's file is the
  // whole of what makes it part of the record; the ids it concerns live in its
  // own frontmatter, where nothing resolves them and a dangling one is not a
  // fault.
  // EVIDENCE AND A COMPLETION REPORT ARE HELD BY THEIR CLAIM ALONE: evidence
  // is shown AGAINST a criterion and a report is filed ABOUT a task, so the
  // `CLAIMS` line is not one way to anchor either but the thing that makes each
  // what it is. The SUBMITS line says who brought them, never what they are
  // about, and holding a claimless one to the graph by its submitter is exactly
  // how an evidence got approved while claiming nothing.
  { type: "Journal",              anchors: [] },
  { type: "WorkLog",              anchors: [{ direction: "in", edgeType: "LOGS" }, { direction: "out", edgeType: "ADDRESSES" }] },
  { type: "Evidence",             anchors: [{ direction: "out", edgeType: "CLAIMS" }] },
  { type: "TaskCompletionReport", anchors: [{ direction: "out", edgeType: "CLAIMS" }] },
  { type: "Finding",              anchors: [{ direction: "in", edgeType: "RECORDS" }] },

  // The satellite, which hangs off the chalk node that assumed it.
  { type: "Assumption",           anchors: [{ direction: "in", edgeType: "ASSUMES" }] },
];

/**
 * The table indexed once, because the questions below are asked per node and
 * per edge of every subgraph walk — a linear scan of the rules on each ask was
 * the hottest needless work in the queue's cutting.
 */
const RULE_OF: ReadonlyMap<string, AnchorRule> = new Map(
  ANCHOR_RULES.map((rule) => [rule.type, rule]),
);

/** Empty for a rootless type and for a type outside the canon alike. */
export function anchorsFor(type: string): readonly AnchorEdge[] {
  return RULE_OF.get(type)?.anchors ?? [];
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
  const rule = RULE_OF.get(type);
  return rule !== undefined && rule.anchors.length === 0;
}

/**
 * Whether a node of this type is coloured at all — which is every type the
 * canon has, the execution band included.
 *
 * THE RECORD IS JUDGED LIKE THE SPECIFICATION. A work log is written by an
 * agent and read by a person, and the same three questions apply to it: does
 * the file read, does anything reach it, and has a person signed off on what
 * it says. The execution band was outside colour for one round and is not any
 * more; what stays outside is deletion — a record is not unhappened by
 * removing it — and that is the store's rule rather than this one's.
 *
 * An unknown type is not coloured. It is not a judgement about that type so
 * much as the absence of one: nothing here knows what it would mean.
 */
export function isColored(type: string): boolean {
  return bandOf(type) !== null;
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
 * A row mixing the two would read "an EXPOSES relation into it or an AFFECTS
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

/**
 * THE ONE CLAUSE FOUR REFUSALS AND A BOARD SHARE — "R-0001 is a Requirement
 * with no live anchor — it is held to the graph by a REQUIRES relation into it,
 * and none stands".
 *
 * IT STOPS BEFORE THE FULL STOP ON PURPOSE. What follows differs by who is
 * speaking — `shall check` says how to fix it, the approve door says there is
 * nothing yet to approve, the reject door says a rejection is a judgement on a
 * node the graph holds — and each of those tails is that caller's own sentence.
 * What must not differ is the diagnosis, so the diagnosis is written once here
 * and every caller quotes it rather than composing its own from `anchorPhrase`.
 *
 * IT TAKES AN ID AND A TYPE RATHER THAN A NODE, because two of its callers hold
 * neither: `checkSpec` walks a review's statuses and reads the type off an
 * index, and a missing node has no `SpecNode` at all.
 */
export function orphanStem(id: string, type: string): string {
  const phrase = anchorPhrase(type) ?? "nothing the canon names";
  return `${id} is a ${type} with no live anchor — it is held to the graph by ${phrase}, and none stands`;
}

/**
 * THE STEM WITH THE CHECK'S OWN TAIL — the whole sentence `shall check` files
 * against an orphan, and the Task Board's Fix Spec row quotes rather than
 * recomposes. Two speakers say this one identically, so it has one home; the
 * approve and reject doors keep tails of their own and quote only the stem.
 */
export function orphanFixSentence(id: string, type: string): string {
  return `${orphanStem(id, type)}. Draw the relation, or remove the node.`;
}
