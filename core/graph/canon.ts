/**
 * The canon's 21 node types: the one roster, and where each type is drawn.
 *
 * A *layer* is the canon's own fact — v5 §1 puts every body type in Domain,
 * Intent, Plan or Execution, and gives `Assumption` none, because an
 * assumption's layer follows the chalk node it hangs off rather than being a
 * property of the assumption. A *band* is a presentation answer, which is ours
 * to make: it is the layer where there is one, and Intent for the one type with
 * none, so a canvas always has a column to put it in.
 *
 * Domain leads the band order because v5 numbers `Term` 1 and `DomainEntity` 2
 * and a specification is authored vocabulary-first. That ordering has a stated
 * cost: v5 §0 rule 3 makes Domain the global sink, so an edge that draws back up
 * the bands is the exception rather than the rule. There are two — `MENTIONS`,
 * which names a term from anywhere, and `AFFECTS`, which reaches out of a
 * `Decision` in Plan to the intent and domain it revises.
 */

/** The four bands, in the order they are laid out. */
export const BAND_ORDER = ["Domain", "Intent", "Plan", "Execution"] as const;

export type Band = (typeof BAND_ORDER)[number];

/**
 * The roster itself, in v5's own row order: the body types by band, then the one
 * satellite. `NodeTypeName` is read back off this table rather than spelled out
 * a second time, so a type the union knows and the data does not cannot exist.
 *
 * The prefixes are pinned. They end up in ids a person reads in a panel, a URL
 * or their own notes, so changing one renames every id already written.
 *
 * ROW ORDER IS WHAT `canonTypesSentence` PRINTS, so a type sits with its band
 * and not where it was first written. `Decision` is in the Plan block for that
 * reason: it was a satellite once, and leaving it at the end would make the
 * refusal that teaches the roster lie about where a decision lives.
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
  { name: "Module", layer: "Plan", prefix: "M" },
  { name: "Interface", layer: "Plan", prefix: "IF" },
  { name: "DataSchema", layer: "Plan", prefix: "DS" },
  { name: "WorkItem", layer: "Plan", prefix: "WI" },
  { name: "Decision", layer: "Plan", prefix: "D" },
  { name: "Journal", layer: "Execution", prefix: "J" },
  { name: "WorkLog", layer: "Execution", prefix: "WL" },
  { name: "Evidence", layer: "Execution", prefix: "EV" },
  { name: "CompletionReport", layer: "Execution", prefix: "CR" },
  { name: "Finding", layer: "Execution", prefix: "F" },
  { name: "Assumption", layer: null, prefix: "AS" },
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
 * Where a layerless type's column goes. v5 states no layer for `Assumption`, so
 * a layout has to choose one, and this is that choice — a presentation decision
 * that claims nothing about the canon. It is one type today and stays a named
 * constant, because the choice is the canon's silence and not the type's.
 */
export const SATELLITE_BAND: Band = "Intent";

export function isNodeType(value: string): value is NodeTypeName {
  return NODE_TYPES.some((entry) => entry.name === value);
}

/**
 * The roster as one sentence, for the refusals that have to teach it. Whoever
 * reads them is holding a file path or a typed command and cannot see a
 * dropdown, so the sentence is the dropdown.
 *
 * It hands the join back to its callers, where `grammarHint` keeps it: this is
 * a whole sentence and lands in two shapes — mid-message after a full stop, and
 * as the tail of a refusal — while a hint is a fragment that only ever trails.
 */
export function canonTypesSentence(): string {
  return `The canon's types are ${NODE_TYPES.map((entry) => entry.name).join(", ")}.`;
}

/** Null for a type outside the canon, which is how a caller's string is checked. */
export function nodeTypeEntry(type: string): NodeTypeEntry | null {
  return NODE_TYPES.find((entry) => entry.name === type) ?? null;
}

/** The canon's own layer — null for a satellite and for an unknown type alike. */
export function layerOf(type: string): Band | null {
  return nodeTypeEntry(type)?.layer ?? null;
}

/** The band a type is drawn in: its layer, or Intent for the one type with none. */
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
 * The band as a FOLDER NAME — the level between `spec/` and the type folder,
 * so two hundred nodes fan out over four drawers instead of one per type.
 *
 * Lowercase on purpose: the type folder beside it is canon-spelled and
 * CamelCase, and the two reading differently is what keeps a path legible —
 * `spec/intent/Requirement/R-0001.md` says which segment is whose at a glance.
 * ONLY THE BAND IS LOWERCASED, so a type is spelled here exactly as the canon
 * spells it and there is no second rule to remember about any one folder.
 *
 * THIS PROMOTES THE BAND FROM A DRAWING CHOICE TO A STORAGE FACT. A satellite
 * goes where `bandOf` draws it (Intent), and moving that choice later would move
 * committed files, so it is now as pinned as the prefixes above.
 */
export function bandFolderOf(type: string): string | null {
  const band = bandOf(type);
  return band === null ? null : band.toLowerCase();
}

/** The four folder names under `spec/`, in band order. */
export const BAND_FOLDERS: readonly string[] = BAND_ORDER.map((band) =>
  band.toLowerCase(),
);

/** The band a folder name spells, or null for a name that is not a band folder. */
export function bandOfFolder(folder: string): Band | null {
  return BAND_ORDER.find((band) => band.toLowerCase() === folder) ?? null;
}

/**
 * Every type, grouped by band and keeping canon order inside each band — the
 * column order of both Spec-plane views.
 *
 * It is a stable partition and nothing else. Because the one satellite sits at
 * the end of `NODE_TYPES` with no layer and `bandOf` sends it to Intent, it
 * falls in after `Constraint` on its own; the list's order is what makes that
 * true, so there is no special case here to keep in step with it.
 */
export function columnsInOrder(): readonly NodeTypeEntry[] {
  return BAND_ORDER.flatMap((band) => typesInBand(band));
}
