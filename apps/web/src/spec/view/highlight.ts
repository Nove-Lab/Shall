import type { Incidence } from "./edges";

/**
 * THE ONE-HOP NEIGHBOURHOOD OF A SELECTED NODE: what stays lit, and what recedes.
 *
 * Clicking a card lights THAT node and the nodes directly related to it, and the
 * relations between them. One hop, never two — a two-hop halo lights most of a
 * board of any density, and a highlight that covers everything has told you
 * nothing. The answer to "what does this node touch" is exactly one step out.
 *
 * DIRECTION IS IGNORED FOR MEMBERSHIP. A neighbour is a neighbour whichever way
 * the arrow points: which way a relation runs is the grammar's business — the
 * canon decides what may point at what — and not adjacency's. The arrowhead on
 * the drawn line still says which direction each relation has; this module only
 * decides which lines are drawn brightly and which fade behind them.
 *
 * IT IS A PURE FUNCTION OF THE EDGE ARRAY THE DAEMON RETURNED, deliberately, and
 * that is two claims at once. React Flow keeps node and edge state of its own,
 * and deriving the neighbourhood from the library's internals would tie this rule
 * to the version of a dependency. It would also put it somewhere only a person
 * looking at a screen could check: here it is arithmetic over two arguments, like
 * everything else in `view/`, and the cases it has to get right can be executed.
 *
 * NOTHING IS EVER HIDDEN, and that is the rule the rest of this follows from. A
 * node outside the neighbourhood is FADED. A card that is not drawn is a card the
 * graph does not have, so hiding one fabricates an absence — and a person reading
 * the board has no way to tell the two apart, so they would believe it. Fading
 * says "not this, look here" while leaving the graph the size it actually is.
 *
 * Pure: no React, no `@xyflow/react`, no DOM, no clock, no randomness. The sets
 * below are filled in the order the edges arrived in, so the same graph produces
 * the same answer — including the same iteration order — on every run.
 */

export interface Highlight {
  /** The node the person clicked, or `null` when nothing is selected. */
  readonly selected: string | null;
  /**
   * The selected node together with its one-hop neighbours. Empty when nothing
   * is selected — NOT "every node", which is the other way to spell "no
   * highlight" and would make `dimmed` read as false for a different reason.
   */
  readonly nodes: ReadonlySet<string>;
  /**
   * The relations incident to the selection, BY THE EDGE'S OWN `id`.
   *
   * The board this ports from had no such field and keyed its relations by an
   * ordinal built out of the triple; ours are stored rows with ids, and that id
   * is also what the canvas hands React Flow as the edge's key. So a membership
   * test here can be made against the very object being drawn, with no second
   * naming scheme in between and nothing to keep in step.
   */
  readonly edges: ReadonlySet<string>;
}

/**
 * NOTHING SELECTED — the state the board opens in and returns to, as one shared
 * value rather than a fresh pair of empty sets per render.
 *
 * It is also what makes the no-selection case free downstream: `highlightFor`
 * returns this exact object every time, so a memo keyed on the highlight does not
 * rebuild a single card when the panel closes and opens on nothing.
 *
 * The two sets are `ReadonlySet` in the type for the obvious reason — this value
 * is shared by every caller, and one `add` into it would light a node on every
 * screen at once.
 */
export const NOTHING_SELECTED: Highlight = {
  selected: null,
  nodes: new Set<string>(),
  edges: new Set<string>(),
};

/**
 * The neighbourhood of one selection, in ONE PASS over the relations.
 *
 * THE BRANCH IS `else if` AND THAT IS LOAD-BEARING FOR ONE INPUT: a relation
 * whose two ends are the selected node itself matches both arms, and the second
 * one would add the same id to both sets a second time. Sets swallow that, so
 * nothing is visibly wrong today — the daemon refuses a node pointed at itself,
 * so the input cannot arrive — but the arm that is never taken is also the arm
 * nobody reads carefully, and a single `if` here says something subtly different
 * about self-relations than this does.
 *
 * TWO RELATIONS BETWEEN THE SAME PAIR COUNT ONCE AS A NEIGHBOUR AND TWICE AS A
 * RELATION, which is not an inconsistency: a node is adjacent or it is not,
 * however many ways the graph says so, and each of those relations is a separate
 * line on the canvas that has to be lit separately.
 *
 * A SELECTED ID WITH NO NODE BEHIND IT lights nothing and dims everything, which
 * is the honest answer to "highlight the neighbourhood of a node that is not
 * here". It is unreachable from the plane — the selection is looked up in the
 * graph before it is passed down — and this module has no node list to check it
 * against, nor any need of one.
 */
export function highlightFor(
  edges: readonly Incidence[],
  selected: string | null,
): Highlight {
  if (selected === null) return NOTHING_SELECTED;

  const nodes = new Set<string>([selected]);
  const incident = new Set<string>();
  for (const edge of edges) {
    if (edge.fromId === selected) {
      nodes.add(edge.toId);
      incident.add(edge.id);
    } else if (edge.toId === selected) {
      nodes.add(edge.fromId);
      incident.add(edge.id);
    }
  }
  return { selected, nodes, edges: incident };
}
