import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const nodes = sqliteTable("nodes", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  attrs: text("attrs").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const edges = sqliteTable("edges", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  fromId: text("from_id").notNull(),
  toId: text("to_id").notNull(),
  createdAt: integer("created_at").notNull(),
});
