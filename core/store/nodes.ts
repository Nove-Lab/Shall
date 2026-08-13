import { asc, eq, or } from "drizzle-orm";
import type { SpecNode, SpecNodeValues } from "../graph/index.js";
import { withProjectDatabase } from "./database.js";
import { edges, nodes } from "./schema.js";

/**
 * Id order, because the id carries the node's type prefix and a sequence — so
 * reading the list in id order groups a type together and walks each type in
 * the order it was numbered. That is the order a person reads the graph in,
 * and the order the canvas lays the cards out by.
 */
export async function listNodes(databasePath: string): Promise<SpecNode[]> {
  return withProjectDatabase(databasePath, async (database) =>
    database.select().from(nodes).orderBy(asc(nodes.id)),
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

/**
 * Null when the id is gone, which is how a stale panel finds out.
 *
 * `updatedAt` is a parameter of its own rather than a field of `values` because
 * it is not one: `SpecNodeValues` is the set a person can type, and no form
 * offers a timestamp. Standing outside that set, it also cannot be forgotten —
 * core has no clock, so the signature is what makes the caller produce the
 * instant, and there is no way to write a node here and leave the stamp behind.
 */
export async function updateNode(
  databasePath: string,
  id: string,
  values: SpecNodeValues,
  updatedAt: number,
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

    const written = { ...values, updatedAt };
    await database.update(nodes).set(written).where(eq(nodes.id, id));
    return { ...existing, ...written };
  });
}

/**
 * False when the id is gone. The node's incident edges go with it: an edge
 * whose endpoint no longer exists is not a relation, it is a dangling
 * reference, and there is no state of the database in which one should exist.
 * Cascading here rather than in the caller means no caller can forget.
 *
 * The look-up and both deletes are one transaction, so the half-state — a node
 * that has lost its edges but is still there — is never a state anything else
 * can read or a crash can leave behind.
 */
export async function deleteNode(
  databasePath: string,
  id: string,
): Promise<boolean> {
  return withProjectDatabase(databasePath, async (database) =>
    database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select({ id: nodes.id })
        .from(nodes)
        .where(eq(nodes.id, id))
        .limit(1);
      if (!existing) {
        return false;
      }

      await transaction
        .delete(edges)
        .where(or(eq(edges.fromId, id), eq(edges.toId, id)));
      await transaction.delete(nodes).where(eq(nodes.id, id));
      return true;
    }),
  );
}
