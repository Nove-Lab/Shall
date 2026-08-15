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
 * verbatim, the nine Execution/satellite types from the spec-node design
 * document §3.15–3.23. The hints carry what that roster knew beyond the label:
 * a vocabulary a `choice` slot offered, a comma-separated convention. They are
 * suggestions in a comment now, which is all a guide owes anyone.
 */

/** One suggested section: its heading, and the hint the old roster carried for it. */
export interface SectionGuide {
  readonly label: string;
  /** A vocabulary or authoring convention, offered as guide text and never enforced. */
  readonly hint?: string;
}

const section = (label: string, hint?: string): SectionGuide =>
  hint === undefined ? { label } : { label, hint };

/** The comma-separated authoring convention a few list-like sections suggest. */
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
  Term: [section("Definition"), section("Aliases", COMMA_SEPARATED)],
  DomainEntity: [
    section("Description"),
    section("Key Attributes", COMMA_SEPARATED),
  ],
  Goal: [
    section("Statement"),
    section("Description"),
    section("Success Measure"),
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
    section("Steps"),
    section("Postconditions"),
  ],
  SystemResponsibility: [
    section("Statement"),
    section("Description"),
    section("Responsibility Type", "Core · Supplementary"),
  ],
  Requirement: [
    section("Statement"),
    section("Description"),
    section("Requirement Type", "Functional · Non-Functional"),
    section("Priority", "High · Medium · Low"),
    section("Rationale"),
  ],
  AcceptanceCriterion: [
    section("Statement"),
    section("Description"),
    section("Evaluation Process"),
    section("Benchmark"),
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
 * when the name is not one of the canon's 23, which is how a caller's string is
 * checked.
 */
export function sectionGuideFor(
  nodeType: string,
): readonly SectionGuide[] | null {
  return isNodeType(nodeType) ? GUIDE[nodeType] : null;
}
