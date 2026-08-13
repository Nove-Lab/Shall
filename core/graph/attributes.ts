import { NODE_TYPES, isNodeType } from "./canon.js";
import type { NodeTypeName } from "./canon.js";

/**
 * The attribute roster: what each of the 23 types carries, and what a person
 * reads for it.
 *
 * Everything that knows an attribute's NAME, KIND, LABEL, VOCABULARY or
 * REQUIREDNESS reads it from here — the store's columns, the schema's CHECKs,
 * the daemon's write doors, the panel's form. Nothing else may carry a second
 * copy, because a second copy is a copy that disagrees.
 *
 * THREE KINDS AND NO FOURTH. `line` is one line of text, `prose` is many, and
 * `choice` is a fixed vocabulary. The kind is not a hint for the form: the
 * schema turns each one into a CHECK, so it is a fact the database holds.
 *
 * TWO AXES, DELIBERATELY DIFFERENT SHAPES:
 *   · KIND, LABEL, VOCABULARY and HINT belong to the COLUMN and never vary by
 *     type — `description` is prose on all fourteen types that carry it. They
 *     live in `COLUMNS`, once.
 *   · REQUIREDNESS belongs to the (TYPE, ATTRIBUTE) pair. `description` is
 *     required on thirteen of its fourteen types and optional on `Goal`;
 *     `rationale` is optional wherever it appears except `Decision`, which is
 *     the whole point of the field there. So it lives in `ROSTER`, beside the
 *     type.
 *
 * LABELS ARE DATA, NOT DERIVATION. Title-casing a column name yields
 * `Definition Of Done`, `Api`, `Cli`, `Sha` and `Safety Reliability`, every one
 * of them wrong, so each attribute and each choice value carries its own
 * English label.
 *
 * STORED AND WIRE VALUES ARE THE STORED STRINGS. `external_system` travels;
 * `External System` is displayed. No layer translates the other way.
 *
 * WHERE IT COMES FROM. The fourteen Domain/Intent/Plan types and their 50 slots
 * are ported verbatim — names, kinds, labels, vocabularies, requiredness and
 * authoring order — from the previous system's own roster. The nine
 * Execution/satellite types and their 28 slots come from the spec-node design
 * document §3.15–3.23, whose prose names each attribute and marks the optional
 * ones but states no kind; the kinds here are that prose read through the same
 * mapping the fourteen use. Two vocabularies are SYNTHESIZED rather than
 * quoted, and say so where they are written: `verdict` and `severity`.
 */

export type AttributeKind = "line" | "prose" | "choice";

/** A `choice` value and the English string a person reads for it. */
export interface ChoiceValue {
  readonly value: string;
  readonly label: string;
}

/** One attribute of one type, as a form and a write door see it. */
export interface AttributeDescriptor {
  readonly name: string;
  readonly label: string;
  readonly kind: AttributeKind;
  /** Per (type, attribute) — the same column is required on one type and not another. */
  readonly required: boolean;
  /** Present on `choice` and nowhere else, in authoring order. */
  readonly values?: readonly ChoiceValue[];
  /** The English control hint, where the roster carries one. */
  readonly hint?: string;
}

interface ColumnDefinition {
  readonly label: string;
  readonly kind: AttributeKind;
  readonly values?: readonly ChoiceValue[];
  readonly hint?: string;
}

/**
 * The per-value byte cap, 256 KiB — the previous system's measurement trigger
 * for blob storage. Held once: the schema's shape CHECKs and the daemon's
 * write door both read this number, and a cap spelled in two places is two
 * caps.
 */
export const TEXT_BYTE_CAP = 262144;

/** The comma-separated authoring convention, carried to a form as a hint and nothing more. */
const COMMA_SEPARATED = "comma-separated";

/**
 * The 53 columns, each once. Order here is alphabetical because this is a
 * lookup and not a form; authoring order is `ROSTER`'s and only `ROSTER`'s.
 */
const COLUMNS = {
  actor_type: {
    label: "Actor Type",
    kind: "choice",
    values: [
      { value: "user", label: "User" },
      { value: "external_system", label: "External System" },
      { value: "ego_system", label: "Ego System" },
    ],
  },
  aliases: { label: "Aliases", kind: "prose", hint: COMMA_SEPARATED },
  answer: { label: "Answer", kind: "prose" },
  applies_when: { label: "Applies When", kind: "line" },
  basis: { label: "Basis", kind: "prose" },
  behavior_design_description: { label: "Behavior Design Description", kind: "prose" },
  benchmark: { label: "Benchmark", kind: "prose" },
  benefit: { label: "Benefit", kind: "line" },
  claim: { label: "Claim", kind: "prose" },
  constraint_type: {
    label: "Constraint Type",
    kind: "choice",
    values: [
      { value: "platform", label: "Platform" },
      { value: "technology", label: "Technology" },
      { value: "hardware", label: "Hardware" },
      { value: "interface", label: "Interface" },
      { value: "data", label: "Data" },
      { value: "performance", label: "Performance" },
      { value: "security", label: "Security" },
      { value: "safety_reliability", label: "Safety & Reliability" },
      { value: "regulatory_compliance", label: "Regulatory Compliance" },
      { value: "operational", label: "Operational" },
      { value: "development", label: "Development" },
      { value: "organizational", label: "Organizational" },
    ],
  },
  contract_description: { label: "Contract Description", kind: "prose" },
  coverage: { label: "Coverage", kind: "prose" },
  decision: { label: "Decision", kind: "prose" },
  definition: { label: "Definition", kind: "prose" },
  definition_of_done: { label: "Definition of Done", kind: "prose" },
  deliverables: { label: "Deliverables", kind: "prose" },
  description: { label: "Description", kind: "prose" },
  evaluation_process: { label: "Evaluation Process", kind: "prose" },
  finding_type: {
    label: "Finding Type",
    kind: "choice",
    values: [
      { value: "missing", label: "Missing" },
      { value: "partial", label: "Partial" },
      { value: "contradicts", label: "Contradicts" },
      { value: "unrequested", label: "Unrequested" },
    ],
  },
  goal: { label: "Goal", kind: "prose" },
  handover: { label: "Handover", kind: "prose" },
  interface_type: {
    label: "Interface Type",
    kind: "choice",
    values: [
      { value: "api", label: "API" },
      { value: "event", label: "Event" },
      { value: "message", label: "Message" },
      { value: "file", label: "File" },
      { value: "database", label: "Database" },
      { value: "hardware", label: "Hardware" },
      { value: "user", label: "User" },
      { value: "network", label: "Network" },
      { value: "library", label: "Library" },
      { value: "cli", label: "CLI" },
    ],
  },
  key_attributes: { label: "Key Attributes", kind: "prose", hint: COMMA_SEPARATED },
  message: { label: "Message", kind: "prose" },
  narrative: { label: "Narrative", kind: "prose" },
  non_goals: { label: "Non-Goals", kind: "prose" },
  objective: { label: "Objective", kind: "prose" },
  outcome: { label: "Outcome", kind: "prose" },
  performer: { label: "Performer", kind: "line" },
  period: { label: "Period", kind: "line" },
  postconditions: { label: "Postconditions", kind: "prose" },
  preconditions: { label: "Preconditions", kind: "prose" },
  priority: {
    label: "Priority",
    kind: "choice",
    values: [
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
    ],
  },
  protocol: { label: "Protocol", kind: "line" },
  question: { label: "Question", kind: "line" },
  rationale: { label: "Rationale", kind: "prose" },
  requirement_type: {
    label: "Requirement Type",
    kind: "choice",
    values: [
      { value: "functional", label: "Functional" },
      { value: "non_functional", label: "Non-Functional" },
    ],
  },
  responsibility_type: {
    label: "Responsibility Type",
    kind: "choice",
    values: [
      { value: "core", label: "Core" },
      { value: "supplementary", label: "Supplementary" },
    ],
  },
  risks: { label: "Risks", kind: "prose" },
  role_description: { label: "Role Description", kind: "prose" },
  scenario_type: {
    label: "Scenario Type",
    kind: "choice",
    values: [
      { value: "main", label: "Main" },
      { value: "alternative", label: "Alternative" },
      { value: "exception", label: "Exception" },
    ],
  },
  scope: { label: "Scope", kind: "prose" },
  severity: {
    label: "Severity",
    kind: "choice",
    // SYNTHESIZED, but only in its form. §3.20 names `severity`, marks it
    // optional and lists no values; the four rungs are the ones §2.20 records
    // for the Spec Kit Finding that §3.20 adopts wholesale, transcribed from
    // `CRITICAL/HIGH/MEDIUM/LOW` into the lower-case stored form every other
    // vocabulary here uses. No ruling has ratified the list, so a later one may
    // replace it outright rather than extend it.
    values: [
      { value: "critical", label: "Critical" },
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
    ],
  },
  sha: { label: "SHA", kind: "line" },
  state: {
    label: "State",
    kind: "choice",
    values: [
      { value: "open", label: "Open" },
      { value: "closed", label: "Closed" },
    ],
  },
  statement: { label: "Statement", kind: "line" },
  steps: { label: "Steps", kind: "prose" },
  structural_design_description: { label: "Structural Design Description", kind: "prose" },
  success_measure: { label: "Success Measure", kind: "prose" },
  testimony: { label: "Testimony", kind: "prose" },
  trigger: { label: "Trigger", kind: "prose" },
  verdict: {
    label: "Verdict",
    kind: "choice",
    // SYNTHESIZED OUTRIGHT, and the only vocabulary here that is. §3.17 calls
    // `verdict` a disposition a person or a deterministic check moves and
    // enumerates nothing, deliberately — the previous system's graph contract
    // left the list to a later gate that never sat. `approved` is the one value
    // attested anywhere, by the satisfaction rule (`ST-1`) that reads it; the
    // other two are the smallest set that makes the cell movable, an unmoved
    // state and a refusal. Expect a ruling to replace this list, not extend it.
    values: [
      { value: "pending", label: "Pending" },
      { value: "approved", label: "Approved" },
      { value: "rejected", label: "Rejected" },
    ],
  },
  work_summary: { label: "Work Summary", kind: "prose" },
} as const satisfies Readonly<Record<string, ColumnDefinition>>;

/**
 * A real column of the `nodes` table. The schema pins its column map against
 * this union, so a column added here and nowhere else fails to compile.
 */
export type AttributeColumnName = keyof typeof COLUMNS;

/** One slot: which column, and whether this type requires it. */
interface Slot {
  readonly name: AttributeColumnName;
  readonly required: boolean;
}

const need = (name: AttributeColumnName): Slot => ({ name, required: true });
const may = (name: AttributeColumnName): Slot => ({ name, required: false });

/**
 * Every type and its slots, IN AUTHORING ORDER — the order the panel stacks its
 * controls in. Reordering a list here reorders a screen.
 *
 * The annotation is the exhaustiveness check: `Record<NodeTypeName, …>` refuses
 * a canon type with no entry and an entry that names no canon type, so the
 * agreement between this table and `canon.ts` is a compile error rather than a
 * runtime one. `Slot`'s own name type does the same against `COLUMNS`.
 */
const ROSTER: Readonly<Record<NodeTypeName, readonly Slot[]>> = {
  Term: [need("definition"), may("aliases")],
  DomainEntity: [need("description"), may("key_attributes")],
  Goal: [need("statement"), may("description"), may("success_measure")],
  Actor: [need("description"), need("actor_type")],
  UseCase: [need("description"), need("benefit"), need("priority")],
  Scenario: [need("scenario_type"), need("preconditions"), need("steps"), need("postconditions")],
  SystemResponsibility: [need("statement"), need("description"), need("responsibility_type")],
  Requirement: [
    need("statement"),
    need("description"),
    need("requirement_type"),
    need("priority"),
    may("rationale"),
  ],
  AcceptanceCriterion: [
    need("statement"),
    need("description"),
    need("evaluation_process"),
    may("benchmark"),
  ],
  Constraint: [
    need("statement"),
    need("description"),
    need("constraint_type"),
    may("applies_when"),
    may("rationale"),
  ],
  ModuleDesign: [
    need("role_description"),
    need("structural_design_description"),
    need("behavior_design_description"),
    may("rationale"),
  ],
  Interface: [
    need("contract_description"),
    need("interface_type"),
    may("protocol"),
    may("preconditions"),
    may("postconditions"),
  ],
  DataSchema: [need("description")],
  ImplementationTask: [
    need("description"),
    need("goal"),
    may("non_goals"),
    need("scope"),
    need("deliverables"),
    need("definition_of_done"),
    may("risks"),
  ],
  Journal: [
    need("period"),
    need("performer"),
    need("objective"),
    need("work_summary"),
    need("handover"),
  ],
  WorkLog: [need("narrative"), need("outcome")],
  Evidence: [need("claim"), need("verdict")],
  Commit: [need("sha"), may("message")],
  // No verdict, and that absence is the design: this type testifies and does
  // not conclude (§3.19).
  VerificationReport: [need("testimony"), need("coverage"), need("trigger")],
  Finding: [need("statement"), need("description"), need("finding_type"), may("severity")],
  Assumption: [need("statement"), need("description"), may("basis")],
  Question: [need("question"), need("description"), need("state"), may("answer")],
  Decision: [need("decision"), need("description"), need("rationale")],
};

/**
 * Every column name, sorted — the schema's subject and the store's cell list.
 * Sorted rather than in `COLUMNS` order so that a caller reading it as a list
 * of names gets a stable order even if the table above is ever regrouped.
 */
export const ATTRIBUTE_COLUMN_NAMES: readonly AttributeColumnName[] = (
  Object.keys(COLUMNS) as AttributeColumnName[]
).sort();

function descriptorFor(slot: Slot): AttributeDescriptor {
  // Annotated so the union of literal column types collapses to one shape and
  // the two optional keys can be read at all.
  const column: ColumnDefinition = COLUMNS[slot.name];
  return {
    name: slot.name,
    label: column.label,
    kind: column.kind,
    required: slot.required,
    // `exactOptionalPropertyTypes` refuses an explicit `undefined` here, so an
    // absent vocabulary or hint has to be an absent key.
    ...(column.values === undefined ? {} : { values: column.values }),
    ...(column.hint === undefined ? {} : { hint: column.hint }),
  };
}

/**
 * What this type carries, in authoring order — or `null` when the name is not
 * one of the canon's 23, which is how a caller's string is checked.
 */
export function attributesFor(
  nodeType: string,
): readonly AttributeDescriptor[] | null {
  return isNodeType(nodeType) ? ROSTER[nodeType].map(descriptorFor) : null;
}

/** The names alone, in the same order. Empty for a type outside the canon. */
export function attributeNames(nodeType: string): readonly string[] {
  return (attributesFor(nodeType) ?? []).map((attribute) => attribute.name);
}

/**
 * The attributes this type must carry, in authoring order. The write door
 * refuses a node that leaves any of them empty; the schema's per-pair CHECKs
 * are the backstop under every path that does not come through a door.
 */
export function requiredAttributeNames(nodeType: string): readonly string[] {
  return (attributesFor(nodeType) ?? [])
    .filter((attribute) => attribute.required)
    .map((attribute) => attribute.name);
}

/** One column's kind, or `null` when no type carries a column by that name. */
export function kindOf(attribute: string): AttributeKind | null {
  return Object.hasOwn(COLUMNS, attribute)
    ? COLUMNS[attribute as AttributeColumnName].kind
    : null;
}

/**
 * The stored values of a `choice` column, in authoring order; empty for any
 * other kind and for a name no column answers to.
 */
export function vocabularyOf(attribute: string): readonly string[] {
  if (!Object.hasOwn(COLUMNS, attribute)) {
    return [];
  }
  const column: ColumnDefinition = COLUMNS[attribute as AttributeColumnName];
  return (column.values ?? []).map((choice) => choice.value);
}

/**
 * The types that carry this column, in canon order — the IN-list of the
 * ownership CHECK that keeps a column NULL on every type that has no slot for
 * it.
 */
export function typesCarrying(attribute: string): readonly NodeTypeName[] {
  return NODE_TYPES.filter((entry) =>
    ROSTER[entry.name].some((slot) => slot.name === attribute),
  ).map((entry) => entry.name);
}
