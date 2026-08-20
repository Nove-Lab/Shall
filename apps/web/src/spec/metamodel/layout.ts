import { BAND_ORDER, bandOf, typesInBand, type Band } from "@shall/core/graph";
import { labelRoom } from "../view/edge-routing";
import { GEOMETRY, type BandHeader, type Placement } from "../view/layout";
import { relationLabel } from "./relations";

/**
 * WHERE EACH TYPE SITS IN THE METAMODEL PICTURE — the one thing about that
 * picture this program chooses.
 *
 * WRITTEN AGAINST canon v5 AS THIS TREE HOLDS IT, with #22, #23 and #24 running
 * from the lower node (`ImplementationTask —TARGETS→ AcceptanceCriterion`,
 * `WorkLog —ADDRESSES→ ImplementationTask`, `Evidence —CLAIMS→
 * AcceptanceCriterion`). The types, the bands and the relations are all read out
 * of `@shall/core/graph`; only the coordinates are here, so a new type turns up
 * in its band's row automatically and a new relation is drawn without anybody
 * touching this file. What a canon change CAN cost is legibility: the gaps below
 * are sized by the longest label between two adjacent columns, but the band
 * shifts are four searched numbers and nothing re-searches them. After a canon
 * change, route every relation through `routedEdges` and ask `labelFits` of each
 * one — a name that does not fit is simply not drawn, so the picture is wrong in
 * the one way looking at it quickly will not show.
 *
 * THE GAPS ARE DERIVED AND NOT CHOSEN. `FloatingEdgePath` writes a relation's
 * name on the longest horizontal run of its route, and only when that run has
 * room for it — `labelRoom` is that rule — so the space between two adjacent
 * columns is exactly the room their relation's name needs, floored at
 * `MIN_GAP` so unrelated neighbours are not jammed together. Sizing the picture
 * by the label rule rather than checking the picture against it is what makes
 * every name appear.
 *
 * THE BANDS ARE OFFSET FROM EACH OTHER because a relation that runs straight
 * down has no horizontal run at all and therefore no label. Shifting each band's
 * first column sideways gives every cross-band relation a horizontal leg to
 * write its name on.
 *
 * NOTHING HERE IS STORED and nothing is measured: the popup is a function of the
 * canon, so it draws the same picture on every machine and every run.
 */

/** One card, and how the board is spaced. Nothing outside this file reads it. */
export const METAMODEL = {
  /** Wide enough for `SystemResponsibility` in the mono face, on the 8px scale. */
  cardWidth: 176,
  /** One `text-xs` line box in `py-1.25` inside the border: 1 + 5 + 16 + 5 + 1. */
  cardHeight: 28,
  /** What `floatingEndpoints` uses to step a path out of a border. */
  columnGap: 48,
  rowGap: 48,
  /** The left margin, the Spec plane's own band gutter. */
  gutter: GEOMETRY.bandGutter,
  /** How far below a band's top rule its row of cards sits. */
  bandTop: GEOMETRY.grid.headerHeight,
  /** One row of cards plus the clear space around it. */
  rowHeight: 132,
  /** No two columns closer than this, whatever the canon allows between them. */
  minGap: 56,
  /** A little more than the label needs, so a name never touches an arrowhead. */
  labelSlack: 8,
  /**
   * How many cards a band puts in one row before it wraps.
   *
   * SIX, SO THAT INTENT FOLDS. Intent holds nine types — eight of its own and
   * the one satellite drawn there — and in one row the board is 2 492 wide,
   * which opens at about a third of full size: the shape is legible and the
   * names are not. Folded, the board is 1 745 x 660 and opens near half size.
   * It is one constant on purpose: the picture is a pure function of it, so it
   * can be re-judged from a screenshot without touching anything else.
   */
  rowCap: 6,
  /**
   * Where each band's first column starts, so that cross-band relations have a
   * horizontal leg long enough to write their names on. Searched against the
   * real router rather than chosen by eye — Execution moved 120 → 116 when
   * #24— (TaskCompletionReport CLAIMS ImplementationTask) joined the grammar and
   * its label missed the old channel by a third of a pixel; Plan moved 104 → 110
   * when a Decision joined the band and `RESOLVES` missed by four. One card
   * added to a band is enough to cost a name, which is why the picture is worth
   * opening after a canon change and why these four numbers are searched and not
   * chosen.
   */
  shift: { Domain: 0, Intent: 120, Plan: 110, Execution: 116 } as Record<
    Band,
    number
  >,
  /** A wrapped row starts a little further in, so its own cross-band legs stay long. */
  rowIndent: 40,
} as const;

/** The whole board: where the cards go, the band strips, and how big it is. */
export interface MetamodelBoard {
  readonly placements: readonly Placement[];
  readonly bands: readonly BandHeader[];
  readonly width: number;
  readonly height: number;
}

/**
 * How much room two adjacent columns need between them: whatever the canon
 * allows across them, in either direction, needs to fit as a name.
 */
function gapBetween(left: string, right: string): number {
  const label = relationLabel(left, right) ?? relationLabel(right, left);
  return label === null
    ? METAMODEL.minGap
    : Math.max(METAMODEL.minGap, labelRoom(label) + METAMODEL.labelSlack);
}

/** The types of one band, in the canon's own column order, cut into rows. */
function rowsOf(band: Band): string[][] {
  const types = typesInBand(band).map((entry) => entry.name);
  const rows: string[][] = [];
  for (let index = 0; index < types.length; index += METAMODEL.rowCap) {
    rows.push(types.slice(index, index + METAMODEL.rowCap));
  }
  return rows.length === 0 ? [[]] : rows;
}

export function metamodelBoard(): MetamodelBoard {
  const placements: Placement[] = [];
  const bands: BandHeader[] = [];
  let top = 0;
  let widest = 0;

  for (const band of BAND_ORDER) {
    const rows = rowsOf(band);
    for (const [rowIndex, row] of rows.entries()) {
      let x =
        METAMODEL.gutter +
        METAMODEL.shift[band] +
        rowIndex * METAMODEL.rowIndent;
      const y = top + rowIndex * METAMODEL.rowHeight + METAMODEL.bandTop;
      for (const [index, type] of row.entries()) {
        if (index > 0) {
          const previous = row[index - 1];
          x +=
            METAMODEL.cardWidth +
            (previous === undefined ? METAMODEL.minGap : gapBetween(previous, type));
        }
        placements.push({
          id: type,
          type,
          // A satellite is drawn in Intent, which is `bandOf`'s answer and the
          // same one the Spec plane's columns take.
          band: bandOf(type) ?? band,
          x,
          y,
        });
        widest = Math.max(widest, x + METAMODEL.cardWidth);
      }
    }
    const height = rows.length * METAMODEL.rowHeight;
    bands.push({ band, label: band, x: 0, y: top, width: 0, height });
    top += height;
  }

  // The strips span the finished board, which is only known once every band has
  // been laid out — the grid does the same.
  const width = widest;
  return {
    placements,
    bands: bands.map((band) => ({ ...band, width })),
    width,
    height: top,
  };
}
