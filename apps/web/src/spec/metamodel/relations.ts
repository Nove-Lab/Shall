import { EDGE_GRAMMAR, permittedEdgeTypes } from "@shall/core/graph";
import type { Incidence } from "../view/edges";

/**
 * EVERY RELATION THE CANON ALLOWS, ONE PER PAIR OF TYPES.
 *
 * THE PAIR IS THE UNIT AND NOT THE NAME. `EDGE_GRAMMAR` has 64 rows over 29
 * numbered edge types, and three of its pairs carry two names each —
 * `Module → Interface` is EXPOSES and CONSUMES, `Requirement →
 * Requirement` is DEPENDS_ON and CONFLICTS_WITH, `Decision → Term` is AFFECTS
 * and MENTIONS. Drawn per row those would be two lines on one route, one
 * printed over the other; drawn per pair they are one line whose label names
 * both, which is what the picture is actually saying: from here to there, the
 * canon allows these.
 *
 * NOTHING IS TRANSCRIBED. The types, their bands and this table all come out of
 * `@shall/core/graph`, so the day a relation is added, turned around or removed
 * — as #22, #23 and #24 were — the popup changes with it and cannot go stale.
 * What the popup owns is where each type SITS, which is `layout.ts`.
 */

/** One drawn relation: the pair, and what the line writes — the names in canon order, joined. */
export type MetaRelation = Incidence & {
  readonly label: string;
};

/**
 * The label for one pair, or null when the canon allows nothing across it.
 *
 * The join is `", "` — the same way the Spec plane names several permitted
 * relations when it asks which one you meant.
 */
export function relationLabel(fromType: string, toType: string): string | null {
  const names = permittedEdgeTypes(fromType, toType);
  return names.length === 0 ? null : names.join(", ");
}

/**
 * Every permitted pair, once, in the order the canon's rows first mention it —
 * so the list reads down the document the grammar was transcribed from.
 *
 * THE ID IS NOT A `formatEdgeId`. That id is a parseable triple, and a joined
 * label would break the parse; this one is only ever a key for React Flow and
 * for the highlight, so it says what it is: a pair.
 */
export function metamodelRelations(): MetaRelation[] {
  const seen = new Set<string>();
  const relations: MetaRelation[] = [];
  for (const row of EDGE_GRAMMAR) {
    const id = `${row.fromType}->${row.toType}`;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    relations.push({
      id,
      fromId: row.fromType,
      toId: row.toType,
      label: permittedEdgeTypes(row.fromType, row.toType).join(", "),
    });
  }
  return relations;
}
