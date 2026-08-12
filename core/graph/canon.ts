/**
 * The canon's 23 node types: the one roster, and where each type is drawn.
 *
 * A *layer* is the canon's own fact — v5 §1 puts every body type in Domain,
 * Intent, Plan or Execution, and gives the three satellites none, because a
 * satellite's layer follows the chalk node it hangs off rather than being a
 * property of the satellite. A *band* is a presentation answer, which is ours
 * to make: it is the layer where there is one, and Intent for the satellites,
 * so a canvas always has a column to put them in.
 *
 * Domain leads the band order because v5 numbers `Term` 1 and `DomainEntity` 2
 * and a specification is authored vocabulary-first. That ordering has a stated
 * cost: v5 §0 rule 3 makes Domain the global sink, so `MENTIONS` edges are the
 * one kind that draws back up the bands while everything else flows down.
 */

/** The four bands, in the order they are laid out. */
export const BAND_ORDER = ["Domain", "Intent", "Plan", "Execution"] as const;

export type Band = (typeof BAND_ORDER)[number];

/**
 * The roster itself, in v5's own row order: §1's twenty body types, then §2's
 * three satellites. `NodeTypeName` is read back off this table rather than
 * spelled out a second time, so a type the union knows and the data does not
 * cannot exist.
 *
 * The prefixes are pinned. They end up in ids a person reads in a panel, a URL
 * or their own notes, so changing one renames every id already written.
 */
const CANON = [
  { name: "Term", layer: "Domain", prefix: "T" },
  { name: "DomainEntity", layer: "Domain", prefix: "DE" },
  { name: "Goal", layer: "Intent", prefix: "G" },
  { name: "Actor", layer: "Intent", prefix: "A" },
  { name: "UseCase", layer: "Intent", prefix: "UC" },
  { name: "Scenario", layer: "Intent", prefix: "SC" },
  { name: "SystemResponsibility", layer: "Intent", prefix: "SR" },
  { name: "Requirement", layer: "Intent", prefix: "R" },
  { name: "AcceptanceCriterion", layer: "Intent", prefix: "AC" },
  { name: "Constraint", layer: "Intent", prefix: "C" },
  { name: "ModuleDesign", layer: "Plan", prefix: "MD" },
  { name: "Interface", layer: "Plan", prefix: "IF" },
  { name: "DataSchema", layer: "Plan", prefix: "DS" },
  { name: "ImplementationTask", layer: "Plan", prefix: "IT" },
  { name: "Journal", layer: "Execution", prefix: "J" },
  { name: "WorkLog", layer: "Execution", prefix: "WL" },
  { name: "Evidence", layer: "Execution", prefix: "EV" },
  { name: "Commit", layer: "Execution", prefix: "CM" },
  { name: "VerificationReport", layer: "Execution", prefix: "VR" },
  { name: "Finding", layer: "Execution", prefix: "F" },
  { name: "Assumption", layer: null, prefix: "AS" },
  { name: "Question", layer: null, prefix: "Q" },
  { name: "Decision", layer: null, prefix: "D" },
] as const;

export type NodeTypeName = (typeof CANON)[number]["name"];

export interface NodeTypeEntry {
  readonly name: NodeTypeName;
  readonly layer: Band | null;
  readonly prefix: string;
}

/**
 * The roster as the rest of the tree reads it, checked against the shape it
 * claims. The check cannot ride on the table's own declaration — `NodeTypeEntry`
 * is written in terms of a union taken from that table, so `as const satisfies`
 * up there is a type that references itself, and TypeScript refuses it.
 */
export const NODE_TYPES = CANON satisfies readonly NodeTypeEntry[];

/**
 * Where a satellite's column goes. v5 states no layer for the three, so a
 * layout has to choose one, and this is that choice — a presentation decision
 * that claims nothing about the canon.
 */
export const SATELLITE_BAND: Band = "Intent";

export function isNodeType(value: string): value is NodeTypeName {
  return NODE_TYPES.some((entry) => entry.name === value);
}

/** Null for a type outside the canon, which is how a caller's string is checked. */
export function nodeTypeEntry(type: string): NodeTypeEntry | null {
  return NODE_TYPES.find((entry) => entry.name === type) ?? null;
}

/** The canon's own layer — null for the satellites and for an unknown type alike. */
export function layerOf(type: string): Band | null {
  return nodeTypeEntry(type)?.layer ?? null;
}

/** The band a type is drawn in: its layer, or Intent for a satellite. */
export function bandOf(type: string): Band | null {
  const entry = nodeTypeEntry(type);
  if (entry === null) {
    return null;
  }
  return entry.layer ?? SATELLITE_BAND;
}

export function typesInBand(band: Band): readonly NodeTypeEntry[] {
  return NODE_TYPES.filter((entry) => bandOf(entry.name) === band);
}

/**
 * Every type, grouped by band and keeping canon order inside each band — the
 * column order of both Spec-plane views.
 *
 * It is a stable partition and nothing else. Because the satellites sit at the
 * end of `NODE_TYPES` with no layer and `bandOf` sends them to Intent, they
 * fall in after `Constraint` on their own; the list's order is what makes that
 * true, so there is no special case here to keep in step with it.
 */
export function columnsInOrder(): readonly NodeTypeEntry[] {
  return BAND_ORDER.flatMap((band) => typesInBand(band));
}
