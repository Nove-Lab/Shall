import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { EDGE_GRAMMAR } from "@shall/core/graph";
import { metamodelRelations, relationLabel } from "./relations";

/**
 * EVERY RELATION THE CANON ALLOWS, ONE PER PAIR. Nothing here is transcribed —
 * the assertions are written against `EDGE_GRAMMAR` itself, because a list of
 * pairs typed out in a test would be the second roster this module exists not
 * to keep.
 */
describe("relationLabel", () => {
  test("a pair the canon allows nothing across has no label", () => {
    assert.equal(relationLabel("Term", "WorkItem"), null);
    assert.equal(relationLabel("NotAType", "Term"), null);
  });

  test("a pair carrying one name is that name", () => {
    const row = EDGE_GRAMMAR[0];
    assert.ok(row !== undefined);
    const label = relationLabel(row.fromType, row.toType);
    assert.ok(label !== null);
    assert.ok(label.includes(row.edgeType));
  });

  test("a pair carrying two names says both, in the canon's own order", () => {
    const twoNamed = EDGE_GRAMMAR.filter(
      (row) =>
        new Set(
          EDGE_GRAMMAR.filter(
            (other) => other.fromType === row.fromType && other.toType === row.toType,
          ).map((other) => other.edgeType),
        ).size > 1,
    );
    assert.ok(twoNamed.length > 0);
    for (const row of twoNamed) {
      const label = relationLabel(row.fromType, row.toType);
      assert.ok(label !== null);
      assert.ok(label.includes(", "));
      assert.ok(label.split(", ").includes(row.edgeType));
    }
  });

  test("direction is part of the pair, so the way back may say nothing", () => {
    const oneWay = EDGE_GRAMMAR.find(
      (row) =>
        !EDGE_GRAMMAR.some(
          (other) => other.fromType === row.toType && other.toType === row.fromType,
        ),
    );
    assert.ok(oneWay !== undefined);
    assert.notEqual(relationLabel(oneWay.fromType, oneWay.toType), null);
    assert.equal(relationLabel(oneWay.toType, oneWay.fromType), null);
  });
});

describe("metamodelRelations", () => {
  test("one drawn relation per pair, and never one per grammar row", () => {
    const relations = metamodelRelations();
    const pairs = new Set(
      EDGE_GRAMMAR.map((row) => `${row.fromType}->${row.toType}`),
    );
    assert.equal(relations.length, pairs.size);
    assert.ok(relations.length < EDGE_GRAMMAR.length);
    assert.equal(new Set(relations.map((relation) => relation.id)).size, relations.length);
  });

  test("the order is the order the grammar first mentions each pair", () => {
    const firstMention: string[] = [];
    for (const row of EDGE_GRAMMAR) {
      const id = `${row.fromType}->${row.toType}`;
      if (!firstMention.includes(id)) firstMention.push(id);
    }
    assert.deepEqual(
      metamodelRelations().map((relation) => relation.id),
      firstMention,
    );
  });

  test("the id is the pair, and its two ends are the two types", () => {
    for (const relation of metamodelRelations()) {
      assert.equal(relation.id, `${relation.fromId}->${relation.toId}`);
      assert.equal(relation.label, relationLabel(relation.fromId, relation.toId));
    }
  });

  test("the same canon gives the same list twice", () => {
    assert.deepEqual(metamodelRelations(), metamodelRelations());
  });
});
