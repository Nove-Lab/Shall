import { isNodeType } from "./canon.js";
import type { NodeTypeName } from "./canon.js";

/**
 * The section guide: the starting shape each type's template suggests for the
 * body, and nothing more.
 *
 * THIS IS A GUIDE AND NOT A SCHEMA. The body of a node is free markdown — the
 * reader does not cut it into sections, the doors do not require any, and a
 * node whose body looks nothing like this list is as valid as one that follows
 * it to the letter. What this table feeds is `emitTemplate` alone: the headings
 * a template ships with so that a person or an agent starting a node starts
 * from the shape the previous system's roster authored, instead of from a blank
 * page.
 *
 * WHERE IT COMES FROM. These are the attribute labels of the previous system's
 * roster, in its authoring order — the fourteen Domain/Intent/Plan types ported
 * verbatim, the eight Execution/satellite types from the spec-node design
 * document §3.15–3.23 — nine sections there, one of them Commit's, which left
 * with the type. The hints carry what that roster knew beyond the label:
 * a vocabulary a `choice` slot offered, a comma-separated convention. They are
 * suggestions in a comment now, which is all a guide owes anyone.
 *
 * A few hints carry no roster memory at all — they are the authoring
 * conventions the /specify elicitation names, and they are seated here so that
 * an agent meets them in the file it is starting rather than in a skill
 * document it may never open.
 */

/** One suggested section: its heading, and the hint the old roster carried for it. */
export interface SectionGuide {
  readonly label: string;
  /** A vocabulary or authoring convention, offered as guide text and never enforced. */
  readonly hint?: string;
}

const section = (label: string, hint?: string): SectionGuide =>
  hint === undefined ? { label } : { label, hint };

/** The comma-separated authoring convention Key Attributes still suggests. */
const COMMA_SEPARATED = "comma-separated";

/**
 * Every type and its suggested sections, IN AUTHORING ORDER — the order the
 * template writes its headings in.
 *
 * The annotation is the exhaustiveness check: `Record<NodeTypeName, …>` refuses
 * a canon type with no entry and an entry that names no canon type, so the
 * agreement between this table and `canon.ts` is a compile error rather than a
 * runtime one.
 */
const GUIDE: Readonly<Record<NodeTypeName, readonly SectionGuide[]>> = {
  // Aliases spells its convention out instead of sharing COMMA_SEPARATED:
  // a term is the one place a dead spelling is worth writing down, and whoever
  // reads the term has to be told which of its names nobody should use.
  Term: [
    section("Definition"),
    section(
      "Aliases",
      "comma-separated, and mark a deprecated spelling as such",
    ),
  ],
  DomainEntity: [
    section("Description"),
    section("Key Attributes", COMMA_SEPARATED),
  ],
  Goal: [
    section("Statement"),
    section("Description"),
    section("Success Measure", "how achievement would be gauged, in words"),
  ],
  Actor: [
    section("Description"),
    section("Actor Type", "User · External System · Ego System"),
  ],
  UseCase: [
    section("Description"),
    section("Benefit"),
    section("Priority", "High · Medium · Low"),
  ],
  Scenario: [
    section("Scenario Type", "Main · Alternative · Exception"),
    section("Preconditions"),
    section("Steps", "ordered, each one an action and its result"),
    section("Postconditions"),
  ],
  SystemResponsibility: [
    section("Statement"),
    section("Description"),
    section("Responsibility Type", "Core · Supplementary"),
  ],
  Requirement: [
    section("Statement", "one SHALL or MUST sentence, one behaviour"),
    section("Description"),
    section("Requirement Type", "Functional · Non-Functional"),
    section("Priority", "High · Medium · Low"),
    section("Rationale"),
  ],
  AcceptanceCriterion: [
    section("Statement", "an observable outcome, judgeable rather than a test case"),
    section("Description"),
    section("Evaluation Process", "what to check, and how"),
    section("Benchmark", "metric and target, technology-agnostic"),
  ],
  Constraint: [
    section("Statement"),
    section("Description"),
    section(
      "Constraint Type",
      "Platform · Technology · Hardware · Interface · Data · Performance · Security · Safety & Reliability · Regulatory Compliance · Operational · Development · Organizational",
    ),
    section("Applies When"),
    section("Rationale"),
  ],
  ModuleDesign: [
    section("Role Description"),
    section("Structural Design Description"),
    section("Behavior Design Description"),
    section("Rationale"),
  ],
  Interface: [
    section("Contract Description"),
    section(
      "Interface Type",
      "API · Event · Message · File · Database · Hardware · User · Network · Library · CLI",
    ),
    section("Protocol"),
    section("Preconditions"),
    section("Postconditions"),
  ],
  DataSchema: [section("Description")],
  ImplementationTask: [
    section("Description"),
    section("Goal"),
    section("Non-Goals"),
    section("Scope"),
    section("Deliverables"),
    section("Definition of Done"),
    section("Risks"),
  ],
  Journal: [
    section("Period"),
    section("Performer"),
    section("Objective"),
    section("Work Summary"),
    section("Handover"),
  ],
  WorkLog: [section("Narrative"), section("Outcome")],
  Evidence: [
    section("Claim"),
    section("Verdict", "Pending · Approved · Rejected"),
  ],
  // No Verdict, and that absence is the design: this type testifies and does
  // not conclude (§3.19).
  VerificationReport: [
    section("Testimony"),
    section("Coverage"),
    section("Trigger"),
  ],
  Finding: [
    section("Statement"),
    section("Description"),
    section("Finding Type", "Missing · Partial · Contradicts · Unrequested"),
    section("Severity", "Critical · High · Medium · Low"),
  ],
  Assumption: [
    section("Statement"),
    section("Description"),
    section("Basis"),
  ],
  Question: [
    section("Question"),
    section("Description"),
    section("State", "Open · Closed"),
    section("Answer"),
  ],
  Decision: [
    section("Decision"),
    section("Description"),
    section("Rationale"),
  ],
};

/**
 * The sections this type's template suggests, in authoring order — or `null`
 * when the name is not one of the canon's 22, which is how a caller's string is
 * checked.
 */
export function sectionGuideFor(
  nodeType: string,
): readonly SectionGuide[] | null {
  return isNodeType(nodeType) ? GUIDE[nodeType] : null;
}
