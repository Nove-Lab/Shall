import { sql } from "drizzle-orm";
import {
  check,
  integer,
  sqliteTable,
  text,
  unique,
  type CheckBuilder,
  type SQLiteColumnBuilderBase,
} from "drizzle-orm/sqlite-core";
import {
  ATTRIBUTE_COLUMN_NAMES,
  kindOf,
  requiredAttributeNames,
  TEXT_BYTE_CAP,
  typesCarrying,
  vocabularyOf,
  type AttributeColumnName,
} from "../graph/attributes.js";
import { NODE_TYPES } from "../graph/canon.js";

/**
 * The node's own fields are columns, not a JSON bag — a bag would let a write
 * put anything in a node and leave the shape to be discovered at read time.
 *
 * THE RULES ARE THE DATABASE'S, NOT ONLY THE DAEMON'S. Everything the roster
 * knows about an attribute — which types carry it, which values it admits,
 * which types cannot leave it empty, what one line and one paragraph are — is a
 * CHECK below. The daemon still refuses first and with a sentence a person can
 * act on; these are the backstop under every path that does not come through a
 * door, and under a hand-run `sqlite3` besides.
 *
 * THEY ARE GENERATED FROM `graph/attributes.ts` AND NOT SPELLED OUT. A hand
 * list of 169 constraints is a second roster, and a second roster is one that
 * disagrees. Only the column MAP is written out here, and it is pinned to the
 * registry with `satisfies` so a column added in one place and not the other
 * fails to compile.
 *
 * A CHECK IS ALWAYS WEAKER THAN ITS DOOR. SQLite's `trim` strips spaces and
 * nothing else, so the shape family passes text the daemon's JS `trim` would
 * have refused. That is the intended direction: a backstop that outlawed
 * something its door permits would refuse a write the daemon had already
 * promised.
 */


/**
 * The 53 attribute columns, every one nullable: a column is filled on the types
 * whose roster carries it and NULL everywhere else, which is what the ownership
 * family enforces. The keys are the attribute names themselves rather than
 * camel case, so the store can address a cell by the name the roster uses.
 */
const attributeColumns = {
  actor_type: text("actor_type"),
  aliases: text("aliases"),
  answer: text("answer"),
  applies_when: text("applies_when"),
  basis: text("basis"),
  behavior_design_description: text("behavior_design_description"),
  benchmark: text("benchmark"),
  benefit: text("benefit"),
  claim: text("claim"),
  constraint_type: text("constraint_type"),
  contract_description: text("contract_description"),
  coverage: text("coverage"),
  decision: text("decision"),
  definition: text("definition"),
  definition_of_done: text("definition_of_done"),
  deliverables: text("deliverables"),
  description: text("description"),
  evaluation_process: text("evaluation_process"),
  finding_type: text("finding_type"),
  goal: text("goal"),
  handover: text("handover"),
  interface_type: text("interface_type"),
  key_attributes: text("key_attributes"),
  message: text("message"),
  narrative: text("narrative"),
  non_goals: text("non_goals"),
  objective: text("objective"),
  outcome: text("outcome"),
  performer: text("performer"),
  period: text("period"),
  postconditions: text("postconditions"),
  preconditions: text("preconditions"),
  priority: text("priority"),
  protocol: text("protocol"),
  question: text("question"),
  rationale: text("rationale"),
  requirement_type: text("requirement_type"),
  responsibility_type: text("responsibility_type"),
  risks: text("risks"),
  role_description: text("role_description"),
  scenario_type: text("scenario_type"),
  scope: text("scope"),
  severity: text("severity"),
  sha: text("sha"),
  state: text("state"),
  statement: text("statement"),
  steps: text("steps"),
  structural_design_description: text("structural_design_description"),
  success_measure: text("success_measure"),
  testimony: text("testimony"),
  trigger: text("trigger"),
  verdict: text("verdict"),
  work_summary: text("work_summary"),
} satisfies Record<AttributeColumnName, SQLiteColumnBuilderBase>;

/** A SQL list of string literals, with the one escape SQLite has. */
function literals(values: readonly string[]): string {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
}

/**
 * The three that hold for every row of every type: a type the canon names, and
 * the two names a person reads the node by.
 */
function baseChecks(): CheckBuilder[] {
  return [
    check(
      "nodes_type_known",
      sql.raw(`"type" IN (${literals(NODE_TYPES.map((entry) => entry.name))})`),
    ),
    check("nodes_short_name_nonempty", sql.raw(`"short_name" <> ''`)),
    check("nodes_name_nonempty", sql.raw(`"name" <> ''`)),
  ];
}

/**
 * OWNERSHIP — one per column, 53. A `Term` has no priority, and this is what
 * makes that a refusal rather than a convention. Per column and not per (type,
 * attribute) because the refusal has to name the attribute that was misplaced.
 */
function ownershipChecks(): CheckBuilder[] {
  return ATTRIBUTE_COLUMN_NAMES.map((column) =>
    check(
      `nodes_${column}_typed`,
      sql.raw(
        `"${column}" IS NULL OR "type" IN (${literals(typesCarrying(column))})`,
      ),
    ),
  );
}

/** VOCABULARY — one per `choice` column, 11. It is also that column's shape. */
function vocabularyChecks(): CheckBuilder[] {
  return ATTRIBUTE_COLUMN_NAMES.filter(
    (column) => kindOf(column) === "choice",
  ).map((column) =>
    check(
      `nodes_${column}_known`,
      sql.raw(
        `"${column}" IS NULL OR "${column}" IN (${literals(vocabularyOf(column))})`,
      ),
    ),
  );
}

/**
 * REQUIREDNESS — one per (type, attribute), 60. Per pair rather than per
 * column because requiredness is the pair's fact: `description` is required on
 * thirteen types and optional on `Goal`. A row of any other type satisfies each
 * one by its first term, so the constraints do not interfere.
 *
 * The name is the folded, lower-case form of the type: `type` and `attribute`
 * both live in it, so a refusal identifies the pair and not just the column.
 */
function requirednessChecks(): CheckBuilder[] {
  return NODE_TYPES.flatMap((entry) =>
    requiredAttributeNames(entry.name).map((attribute) =>
      check(
        `nodes_${entry.name.toLowerCase()}_${attribute}_required`,
        sql.raw(
          `"type" <> '${entry.name}' OR "${attribute}" IS NOT NULL`,
        ),
      ),
    ),
  );
}

/**
 * SHAPE — one per `line` or `prose` column, 42. These stand in for the two
 * DOMAINs the previous system declared, which SQLite has no equivalent of, so
 * the terms are repeated per column instead of being named once.
 *
 * A filled cell is never the empty string: an attribute a person left alone is
 * NULL, and `''` is a third state that would mean neither filled nor empty.
 */
function shapeChecks(): CheckBuilder[] {
  return ATTRIBUTE_COLUMN_NAMES.filter(
    (column) => kindOf(column) !== "choice",
  ).map((column) => {
    const kind = kindOf(column);
    const terms = [
      `"${column}" <> ''`,
      `trim("${column}") = "${column}"`,
      `octet_length("${column}") <= ${TEXT_BYTE_CAP}`,
    ];
    if (kind === "line") {
      terms.push(
        `instr("${column}", char(10)) = 0`,
        `instr("${column}", char(13)) = 0`,
      );
    }
    return check(
      `nodes_${column}_${kind}_text`,
      sql.raw(`"${column}" IS NULL OR (${terms.join(" AND ")})`),
    );
  });
}

export const nodes = sqliteTable(
  "nodes",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    shortName: text("short_name").notNull(),
    name: text("name").notNull(),
    ...attributeColumns,
    createdAt: integer("created_at").notNull(),
    // The default is only here so `ADD COLUMN NOT NULL` is legal on a database
    // that already has rows; every write names the stamp, so nothing that goes
    // through this schema ever takes it.
    updatedAt: integer("updated_at").notNull().default(0),
  },
  () => [
    ...baseChecks(),
    ...ownershipChecks(),
    ...vocabularyChecks(),
    ...requirednessChecks(),
    ...shapeChecks(),
  ],
);

/**
 * An edge is its two endpoints and its kind, and nothing else — the previous
 * system's provenance and approval columns belong to a multi-tenant service
 * and have no reader here.
 *
 * WHICH TRIPLES ARE GRAMMATICAL IS NOT ASKED HERE. The grammar is checked in
 * the daemon and deliberately not in the database; what the table refuses is
 * the two things that are wrong under every grammar — an edge from a node to
 * itself, and the same relation drawn twice.
 */
export const edges = sqliteTable(
  "edges",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    // The cascade is why a node's deletion cannot leave a dangling endpoint
    // behind, whatever path did the deleting.
    fromId: text("from_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    toId: text("to_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    unique("edges_one_relation_per_triple").on(
      table.fromId,
      table.type,
      table.toId,
    ),
    check("edges_no_self_reference", sql.raw(`"from_id" <> "to_id"`)),
  ],
);
