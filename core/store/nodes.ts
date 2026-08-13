import { asc, eq, or } from "drizzle-orm";
import {
  ATTRIBUTE_COLUMN_NAMES,
  type AttributeColumnName,
} from "../graph/attributes.js";
import type { SpecNode, SpecNodeValues } from "../graph/index.js";
import { withProjectDatabase } from "./database.js";
import { edges, nodes } from "./schema.js";

type NodeRow = typeof nodes.$inferSelect;

/**
 * Every attribute cell, named — not only the ones the caller filled. A write is
 * a whole map, so a name the map omits has to be written as NULL rather than
 * left as it was, and naming all 53 is what makes an update clear a cell.
 *
 * A key the roster does not know is dropped here without a word. The daemon
 * refuses one with a sentence long before this; a second refusal in the store
 * would have no one to say it to.
 */
function attributeCells(
  attributes: Record<string, string>,
): Record<AttributeColumnName, string | null> {
  return Object.fromEntries(
    ATTRIBUTE_COLUMN_NAMES.map((column) => [column, attributes[column] ?? null]),
  ) as Record<AttributeColumnName, string | null>;
}

/** The inverse: a NULL cell is an absent key, never `""`. */
function rowToSpecNode(row: NodeRow): SpecNode {
  const attributes: Record<string, string> = {};
  for (const column of ATTRIBUTE_COLUMN_NAMES) {
    const cell = row[column];
    if (cell !== null) {
      attributes[column] = cell;
    }
  }
  return {
    id: row.id,
    type: row.type,
    shortName: row.shortName,
    name: row.name,
    attributes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Id order, because the id carries the node's type prefix and a sequence — so
 * reading the list in id order groups a type together and walks each type in
 * the order it was numbered. That is the order a person reads the graph in,
 * and the order the canvas lays the cards out by.
 */
export async function listNodes(databasePath: string): Promise<SpecNode[]> {
  return withProjectDatabase(databasePath, async (database) => {
    const rows = await database.select().from(nodes).orderBy(asc(nodes.id));
    return rows.map(rowToSpecNode);
  });
}

/** Null when the id is gone — the look-up a write door does to learn a node's type. */
export async function getNode(
  databasePath: string,
  id: string,
): Promise<SpecNode | null> {
  return withProjectDatabase(databasePath, async (database) => {
    const [row] = await database
      .select()
      .from(nodes)
      .where(eq(nodes.id, id))
      .limit(1);
    return row ? rowToSpecNode(row) : null;
  });
}

export async function insertNode(
  databasePath: string,
  node: SpecNode,
): Promise<SpecNode> {
  return withProjectDatabase(databasePath, async (database) => {
    const row = {
      id: node.id,
      type: node.type,
      shortName: node.shortName,
      name: node.name,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      ...attributeCells(node.attributes),
    };
    await database.insert(nodes).values(row);
    // Read back through the same mapping a select goes through, so both write
    // doors return the stored shape — never a key the roster does not know.
    return rowToSpecNode(row);
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

    // Every column the write touches is named, so the merged row below is the
    // row the update just wrote — read back through the same mapping a select
    // goes through, rather than assembled by hand a second way.
    const written = {
      shortName: values.shortName,
      name: values.name,
      updatedAt,
      ...attributeCells(values.attributes),
    };
    await database.update(nodes).set(written).where(eq(nodes.id, id));
    return rowToSpecNode({ ...existing, ...written });
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
