import { nodes } from "@shall/schema";
import { asc, eq } from "drizzle-orm";
import type { SpecNode } from "../core/types.js";
import { withProjectDatabase } from "./database.js";

/** Creation order is the graph's only order — no position is stored. */
export async function listNodes(databasePath: string): Promise<SpecNode[]> {
  return withProjectDatabase(databasePath, async (database) =>
    database.select().from(nodes).orderBy(asc(nodes.createdAt), asc(nodes.id)),
  );
}

export async function insertNode(
  databasePath: string,
  node: SpecNode,
): Promise<SpecNode> {
  return withProjectDatabase(databasePath, async (database) => {
    await database.insert(nodes).values(node);
    return node;
  });
}

/** Null when the id is gone, which is how a stale panel finds out. */
export async function updateNode(
  databasePath: string,
  id: string,
  values: { type: string; attrs: string },
): Promise<SpecNode | null> {
  return withProjectDatabase(databasePath, async (database) => {
    const [existing] = await database
      .select()
      .from(nodes)
      .where(eq(nodes.id, id))
      .limit(1);
    if (!existing) {
      return null;
    }

    await database.update(nodes).set(values).where(eq(nodes.id, id));
    return { ...existing, ...values };
  });
}

export async function deleteNode(
  databasePath: string,
  id: string,
): Promise<boolean> {
  return withProjectDatabase(databasePath, async (database) => {
    const [existing] = await database
      .select({ id: nodes.id })
      .from(nodes)
      .where(eq(nodes.id, id))
      .limit(1);
    if (!existing) {
      return false;
    }

    await database.delete(nodes).where(eq(nodes.id, id));
    return true;
  });
}
