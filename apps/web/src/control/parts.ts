/**
 * The words and spellings every control-plane surface shares — the base of its
 * URLs, the deep link into the Spec plane, the caption and box recipes, and the
 * plural of a count.
 *
 * IT IS AN EXTRACTION AND NOT A DESIGN. Each of these was first written on one
 * page and then copied to the next as the panels grew alike on purpose (the
 * board's pages mirror the queue's); this file is where the copies were folded
 * back together, so the two tables and the four detail boxes cannot drift a
 * class or a query parameter apart.
 */

/** Where a project's control plane lives — the base every panel URL hangs off. */
export function controlBase(projectId: string): string {
  return `/p/${encodeURIComponent(projectId)}/control`;
}

/**
 * THE WAY INTO THE FILE FROM A CONTROL-PLANE ROW. `back` is the caller's own
 * path, so the plane can offer the way home; `edit` opens the editor directly —
 * the door a Question needs, because a question routed somewhere to be answered
 * should not land in the reading pane first. The parameter order is the one
 * `SpecPlane` reads, spelled once.
 */
export function specLink(
  projectId: string,
  id: string,
  backPath: string,
  options?: { edit?: boolean },
): string {
  return (
    `/p/${encodeURIComponent(projectId)}/spec` +
    `?node=${encodeURIComponent(id)}` +
    (options?.edit === true ? "&mode=edit" : "") +
    `&back=${encodeURIComponent(backPath)}`
  );
}

/** The muted caption every detail section is headed with. */
export const CAPTION = "text-muted-foreground text-xs";

/** The row recipe the read-only detail boxes are built from. */
export const BOX = "grid gap-2 rounded-md border p-3";

/**
 * "1 node", "3 nodes" — the plural said once rather than at each call, and the
 * irregular one says both words: `countWord(2, "criterion", "criteria")`.
 */
export function countWord(count: number, one: string, many = `${one}s`): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}
