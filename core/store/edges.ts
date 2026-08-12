import { asc, eq } from "drizzle-orm";
import type { SpecEdge } from "../graph/index.js";
import { withProjectDatabase } from "./database.js";
import { edges } from "./schema.js";

/**
 * Arrival order, because an edge has no name of its own to sort by. The
 * tie-break on id keeps two edges written in the same millisecond from
 * swapping places between reads.
 */
export async function listEdges(databasePath: string): Promise<SpecEdge[]> {
  return withProjectDatabase(databasePath, async (database) =>
    database.select().from(edges).orderBy(asc(edges.createdAt), asc(edges.id)),
  );
}

export async function insertEdge(
  databasePath: string,
  edge: SpecEdge,
): Promise<SpecEdge> {
  return withProjectDatabase(databasePath, async (database) => {
    await database.insert(edges).values(edge);
    return edge;
  });
}

/** False when the id is gone, which is how a stale panel finds out. */
export async function deleteEdge(
  databasePath: string,
  id: string,
): Promise<boolean> {
  return withProjectDatabase(databasePath, async (database) => {
    const [existing] = await database
      .select({ id: edges.id })
      .from(edges)
      .where(eq(edges.id, id))
      .limit(1);
    if (!existing) {
      return false;
    }

    await database.delete(edges).where(eq(edges.id, id));
    return true;
  });
}
