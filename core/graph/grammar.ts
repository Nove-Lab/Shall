import type { NodeTypeName } from "./canon.js";

/**
 * The edge grammar: which edge types may run between which node types.
 *
 * Transcribed by hand from the v5 graph reference — §3-1 … §3-6 for the edge
 * types and §4's Node Relation Table for their endpoints. The rows are written
 * out one per line, in canon order, so a reader can diff this file against the
 * source document line by line; a loop over helper arrays would hide a wrong
 * endpoint behind plausible-looking code.
 */

/** One allowed row of the canon table: an edge type together with its endpoints. */
export interface EdgeTriple {
  readonly fromType: NodeTypeName;
  readonly toType: NodeTypeName;
  readonly edgeType: string;
}

/**
 * Every triple the canon allows: 64 rows over 29 numbered edge types.
 *
 * v5 numbered 33. #19 PRODUCED and #20 CITES went with the Commit type, whose
 * one job — naming the commits a piece of work produced — is now a `commits:`
 * list in the WorkLog's own frontmatter rather than a node of its own. #26
 * RAISES went with the Question type, which the canon no longer has: an open
 * point is settled in the conversation that found it and never parked as a
 * node, so there is nothing left for the edge to reach. #29 ESCALATES is
 * retired outright — a finding starts no relation at all now, and the ids it
 * concerns sit in its own frontmatter as a hint nothing resolves. The numbers
 * of the rest are kept as v5 wrote them so a reader can still diff this file
 * against the source document line by line.
 *
 * The triple is the key, never the bare name. v5 numbers `DEPENDS_ON` twice —
 * #9 Requirement→Requirement and #15 ImplementationTask→ImplementationTask — so
 * the 29 edge types live under 28 distinct names, and anything that indexes this
 * table by name alone silently drops one of the two. HAS_CRITERION, SUBMITS, CLAIMS and
 * the fan-out families (ASSUMES, AFFECTS, MENTIONS) repeat
 * their names too, but those are one edge type with several endpoints;
 * `DEPENDS_ON` is the one place where the same name means two different edges.
 */
export const EDGE_GRAMMAR: readonly EdgeTriple[] = [
  // §3-1 Intent view — one line down from Goal to AcceptanceCriterion.
  { fromType: "Goal",                 toType: "Goal",                 edgeType: "REFINES" },                // #1
  { fromType: "Goal",                 toType: "Actor",                edgeType: "PURSUED_BY" },             // #2
  { fromType: "Actor",                toType: "UseCase",              edgeType: "PERFORMS" },               // #3
  { fromType: "UseCase",              toType: "Scenario",             edgeType: "DETAILS" },                // #4
  { fromType: "Scenario",             toType: "SystemResponsibility", edgeType: "DERIVES_RESPONSIBILITY" }, // #5
  { fromType: "SystemResponsibility", toType: "Requirement",          edgeType: "REQUIRES" },               // #6
  { fromType: "Requirement",          toType: "AcceptanceCriterion",  edgeType: "HAS_CRITERION" },          // #7  unit verdict
  { fromType: "Scenario",             toType: "AcceptanceCriterion",  edgeType: "HAS_CRITERION" },          // #7— integration verdict
  { fromType: "Requirement",          toType: "Constraint",           edgeType: "HAS_CONSTRAINT" },         // #8
  { fromType: "Requirement",          toType: "Requirement",          edgeType: "DEPENDS_ON" },             // #9  self-loop by design
  { fromType: "Requirement",          toType: "Requirement",          edgeType: "CONFLICTS_WITH" },         // #10 self-loop by design

  // §3-2 Plan view. EXPOSES and CONSUMES share ModuleDesign→Interface: a module
  // both publishes and calls contracts, and the two are different facts.
  { fromType: "ModuleDesign",         toType: "Interface",            edgeType: "EXPOSES" },                // #11
  { fromType: "ModuleDesign",         toType: "Interface",            edgeType: "CONSUMES" },               // #12
  { fromType: "Interface",            toType: "DataSchema",           edgeType: "CARRIES" },                // #13
  { fromType: "ModuleDesign",         toType: "ImplementationTask",   edgeType: "ALLOCATES" },              // #14
  { fromType: "ImplementationTask",   toType: "ImplementationTask",   edgeType: "DEPENDS_ON" },             // #15 the second DEPENDS_ON

  // §3-3 Execution view. #19 PRODUCED and #20 CITES are gone with the Commit
  // node: a WorkLog names its commits in its own frontmatter now.
  { fromType: "Journal",              toType: "WorkLog",              edgeType: "LOGS" },                   // #16
  { fromType: "WorkLog",              toType: "Evidence",             edgeType: "SUBMITS" },                // #17
  { fromType: "WorkLog",              toType: "TaskCompletionReport", edgeType: "SUBMITS" },                // #17—
  { fromType: "WorkLog",              toType: "Finding",              edgeType: "RECORDS" },                // #18

  // §3-4 The four gateways between views: Intent → Plan → Execution.
  { fromType: "SystemResponsibility", toType: "ModuleDesign",         edgeType: "IS_REALIZED_BY" },         // #21
  // #22 runs FROM the task, like #23 and #24: a task names the criterion it
  // aims to close in its own file, so planning work never touches the
  // criterion's file or moves its approval.
  { fromType: "ImplementationTask",   toType: "AcceptanceCriterion",  edgeType: "TARGETS" },                // #22
  // #23 runs FROM the work log, like #24: the work names the task it addresses
  // in its own file, so starting work never touches the task's file or moves
  // its approval.
  { fromType: "WorkLog",              toType: "ImplementationTask",   edgeType: "ADDRESSES" },              // #23
  // #24 runs FROM the evidence: a claim is the evidence's own line, so writing
  // one never touches the criterion's file or moves its approval.
  { fromType: "Evidence",             toType: "AcceptanceCriterion",  edgeType: "CLAIMS" },                 // #24
  // #24— a completion report claims the ONE task it is filed about, from its own
  // file, for the reason #24 runs from the evidence — and it is what a task's
  // closure is judged over, as #24 is a criterion's.
  { fromType: "TaskCompletionReport", toType: "ImplementationTask",   edgeType: "CLAIMS" },                 // #24—

  // §3-5 The assumption. ASSUMES attaches to the five chalk nodes of §0.5 and to
  // nothing else, so the five sources are written out rather than implied.
  { fromType: "Goal",                 toType: "Assumption",           edgeType: "ASSUMES" },                // #25
  { fromType: "SystemResponsibility", toType: "Assumption",           edgeType: "ASSUMES" },                // #25
  { fromType: "Requirement",          toType: "Assumption",           edgeType: "ASSUMES" },                // #25
  { fromType: "ModuleDesign",         toType: "Assumption",           edgeType: "ASSUMES" },                // #25
  { fromType: "WorkLog",              toType: "Assumption",           edgeType: "ASSUMES" },                // #25

  // §3-5b The revision edges, both out of a Decision and nothing else.
  //
  // AFFECTS IS WRITTEN FIRST BECAUSE IT IS THE ANCHOR. A decision that revises
  // nothing is not a decision, so `ANCHOR_RULES` holds a Decision by this edge
  // — which also makes it the row the template's commented `edges:` example is
  // built from, and the example should show the line a decision cannot do
  // without. It reaches every type of the three living bands: what a decision
  // may revise is not a shorter list than what a specification is made of. Two
  // are absent on purpose — a `Decision`, because a decision that supersedes a
  // decision is a new decision and two of them naming each other would anchor
  // both while revising nothing, and every Execution type, because a record of
  // what happened is not revised by deciding something afterwards.
  { fromType: "Decision",             toType: "Term",                 edgeType: "AFFECTS" },                // #28
  { fromType: "Decision",             toType: "DomainEntity",         edgeType: "AFFECTS" },                // #28—
  { fromType: "Decision",             toType: "Goal",                 edgeType: "AFFECTS" },                // #28—
  { fromType: "Decision",             toType: "Actor",                edgeType: "AFFECTS" },                // #28—
  { fromType: "Decision",             toType: "UseCase",              edgeType: "AFFECTS" },                // #28—
  { fromType: "Decision",             toType: "Scenario",             edgeType: "AFFECTS" },                // #28—
  { fromType: "Decision",             toType: "SystemResponsibility", edgeType: "AFFECTS" },                // #28—
  { fromType: "Decision",             toType: "Requirement",          edgeType: "AFFECTS" },                // #28—
  { fromType: "Decision",             toType: "AcceptanceCriterion",  edgeType: "AFFECTS" },                // #28—
  { fromType: "Decision",             toType: "Constraint",           edgeType: "AFFECTS" },                // #28—
  { fromType: "Decision",             toType: "Assumption",           edgeType: "AFFECTS" },                // #28—
  { fromType: "Decision",             toType: "ModuleDesign",         edgeType: "AFFECTS" },                // #28—
  { fromType: "Decision",             toType: "Interface",            edgeType: "AFFECTS" },                // #28—
  { fromType: "Decision",             toType: "DataSchema",           edgeType: "AFFECTS" },                // #28—
  { fromType: "Decision",             toType: "ImplementationTask",   edgeType: "AFFECTS" },                // #28—
  // RESOLVES answers a finding, and answering none is allowed: a revision
  // somebody simply wanted is as good a reason as one an agent reported.
  { fromType: "Decision",             toType: "Finding",              edgeType: "RESOLVES" },               // #27

  // §3-6 Domain, the global sink. MENTIONS #30 has exactly fifteen sources —
  // the rows that carry it in §4's Term column. Term, DomainEntity, Journal,
  // Evidence, TaskCompletionReport and Finding are not among them, and no
  // stated rule predicts that: it is read off the table, so it is written out.
  // A Decision names a term here and revises one above; the two are different
  // facts and a decision may need both.
  { fromType: "Goal",                 toType: "Term",                 edgeType: "MENTIONS" },
  { fromType: "Actor",                toType: "Term",                 edgeType: "MENTIONS" },
  { fromType: "UseCase",              toType: "Term",                 edgeType: "MENTIONS" },
  { fromType: "Scenario",             toType: "Term",                 edgeType: "MENTIONS" },
  { fromType: "SystemResponsibility", toType: "Term",                 edgeType: "MENTIONS" },
  { fromType: "Requirement",          toType: "Term",                 edgeType: "MENTIONS" },
  { fromType: "AcceptanceCriterion",  toType: "Term",                 edgeType: "MENTIONS" },
  { fromType: "Constraint",           toType: "Term",                 edgeType: "MENTIONS" },
  { fromType: "ModuleDesign",         toType: "Term",                 edgeType: "MENTIONS" },
  { fromType: "Interface",            toType: "Term",                 edgeType: "MENTIONS" },
  { fromType: "DataSchema",           toType: "Term",                 edgeType: "MENTIONS" },
  { fromType: "ImplementationTask",   toType: "Term",                 edgeType: "MENTIONS" },
  { fromType: "WorkLog",              toType: "Term",                 edgeType: "MENTIONS" },
  { fromType: "Assumption",           toType: "Term",                 edgeType: "MENTIONS" },
  { fromType: "Decision",             toType: "Term",                 edgeType: "MENTIONS" },
  { fromType: "Term",                 toType: "DomainEntity",         edgeType: "DENOTES" },                // #31 the only edge out of Term
  { fromType: "DomainEntity",         toType: "DomainEntity",         edgeType: "RELATES_TO" },             // #32 self-loop by design
  { fromType: "DataSchema",           toType: "DomainEntity",         edgeType: "REPRESENTS" },             // #33
];

/** The edge type names of `rows`, deduped, in the order they first appear. */
function distinctEdgeTypes(rows: readonly EdgeTriple[]): string[] {
  const names: string[] = [];
  for (const row of rows) {
    if (!names.includes(row.edgeType)) names.push(row.edgeType);
  }
  return names;
}

/**
 * The 28 distinct names, in canon order. Twenty-eight and not twenty-nine
 * because `DEPENDS_ON` covers two of the canon's edge types; a name alone
 * cannot tell them apart, which is why it is `EDGE_GRAMMAR` and not this list
 * that decides what is allowed. Read off the rows so the two cannot drift.
 */
export const EDGE_TYPE_NAMES: readonly string[] = distinctEdgeTypes(EDGE_GRAMMAR);

/**
 * The edge types allowed from one node type to another, in canon order.
 * Usually zero or one; ModuleDesign→Interface legitimately answers two.
 */
export function permittedEdgeTypes(fromType: string, toType: string): string[] {
  return distinctEdgeTypes(
    EDGE_GRAMMAR.filter(
      (row) => row.fromType === fromType && row.toType === toType,
    ),
  );
}

/**
 * What the canon allows between these two node types, said in the order a
 * reader can use it: this direction first, because that is the relation they
 * just wrote and the set they can pick from without moving anything.
 *
 * The reverse clause is only worth adding when the relation could actually be
 * turned around. Between two nodes of one type the reverse is the same
 * direction, so naming it sends the reader off to redraw the arrow and meet the
 * identical refusal.
 *
 * When the canon relates the two types no way at all, the last clause says so
 * outright. It used to say nothing, and nothing left the reader believing they
 * had merely reached for the wrong edge name between a pair that was fine.
 *
 * EVERY ANSWER OPENS WITH A SPACE, and there is always an answer — a caller
 * appends this straight after the full stop of its own sentence, so the join
 * belongs here and not in each of them.
 */
export function grammarHint(fromType: string, toType: string): string {
  const forward = permittedEdgeTypes(fromType, toType);
  const hint =
    forward.length > 0 ? ` This direction allows: ${forward.join(", ")}.` : "";

  const reverse =
    fromType === toType ? [] : permittedEdgeTypes(toType, fromType);
  if (reverse.length > 0) {
    return `${hint} The reverse direction allows: ${reverse.join(", ")}.`;
  }
  return hint === ""
    ? ` Nothing in the canon relates a ${fromType} to a ${toType}.`
    : hint;
}

/** Whether the canon allows this exact (from, to, type) row. */
export function isPermittedTriple(
  fromType: string,
  toType: string,
  edgeType: string,
): boolean {
  return EDGE_GRAMMAR.some(
    (row) =>
      row.fromType === fromType &&
      row.toType === toType &&
      row.edgeType === edgeType,
  );
}
