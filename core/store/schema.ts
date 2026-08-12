import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * The node's own fields are columns, not a JSON bag — a bag would let a write
 * put anything in a node and leave the shape to be discovered at read time.
 */
export const nodes = sqliteTable("nodes", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  shortName: text("short_name").notNull(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const edges = sqliteTable("edges", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  fromId: text("from_id").notNull(),
  toId: text("to_id").notNull(),
  createdAt: integer("created_at").notNull(),
});
