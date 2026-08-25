import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  BAND_ORDER,
  STACK_CAP,
  nodesOfType,
  sinksIntoDomain,
  type SpecNode,
} from "./model";

/**
 * WHAT THE TWO PRESENTATION RULES PROMISE. The roster is the canon's and is
 * tested where it lives; what this file owns is the dashed-relation predicate
 * and the order a column is filled in, and both are stated here against bands
 * and ids written out rather than read off the canon.
 */

function node(id: string, type: string): SpecNode {
  return {
    id,
    type,
    shortName: id,
    name: id,
    body: "",
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("sinksIntoDomain", () => {
  test("a relation from outside Domain into it is the only one that sinks", () => {
    assert.equal(sinksIntoDomain("Intent", "Domain"), true);
    assert.equal(sinksIntoDomain("Plan", "Domain"), true);
    assert.equal(sinksIntoDomain("Execution", "Domain"), true);
  });

  test("a relation that begins in Domain does not sink, wherever it ends", () => {
    assert.equal(sinksIntoDomain("Domain", "Domain"), false);
    assert.equal(sinksIntoDomain("Domain", "Intent"), false);
  });

  test("a relation that never touches Domain does not sink", () => {
    assert.equal(sinksIntoDomain("Intent", "Plan"), false);
    assert.equal(sinksIntoDomain("Plan", "Execution"), false);
  });

  test("the rule is a band crossing and answers for every pair the canon has", () => {
    for (const source of BAND_ORDER) {
      for (const target of BAND_ORDER) {
        assert.equal(
          sinksIntoDomain(source, target),
          target === "Domain" && source !== "Domain",
        );
      }
    }
  });
});

describe("nodesOfType", () => {
  test("only that type's nodes come back", () => {
    const nodes = [
      node("R-0001", "Requirement"),
      node("T-0001", "Term"),
      node("R-0002", "Requirement"),
    ];
    assert.deepEqual(
      nodesOfType(nodes, "Requirement").map((held) => held.id),
      ["R-0001", "R-0002"],
    );
    assert.deepEqual(
      nodesOfType(nodes, "Term").map((held) => held.id),
      ["T-0001"],
    );
    assert.deepEqual(nodesOfType(nodes, "Decision"), []);
  });

  test("the order is the bytes' and not the locale's — `R-0002` before `R-0010`", () => {
    const nodes = [
      node("R-0010", "Requirement"),
      node("R-0002", "Requirement"),
      node("R-0001", "Requirement"),
    ];
    assert.deepEqual(
      nodesOfType(nodes, "Requirement").map((held) => held.id),
      ["R-0001", "R-0002", "R-0010"],
    );
  });

  test("equal ids keep the array's own order, so nothing depends on where a row arrived", () => {
    const first = node("R-0001", "Requirement");
    const second = { ...node("R-0001", "Requirement"), shortName: "second" };
    const sorted = nodesOfType([first, second], "Requirement");
    assert.deepEqual(
      sorted.map((held) => held.shortName),
      ["R-0001", "second"],
    );
  });

  test("the input is left as it was", () => {
    const nodes = [node("R-0002", "Requirement"), node("R-0001", "Requirement")];
    nodesOfType(nodes, "Requirement");
    assert.deepEqual(
      nodes.map((held) => held.id),
      ["R-0002", "R-0001"],
    );
  });
});

describe("STACK_CAP", () => {
  test("every band has a cap, and Domain's is the short one", () => {
    for (const band of BAND_ORDER) {
      assert.ok(STACK_CAP[band] > 0);
    }
    assert.ok(STACK_CAP.Domain < STACK_CAP.Intent);
    assert.equal(STACK_CAP.Intent, STACK_CAP.Plan);
    assert.equal(STACK_CAP.Intent, STACK_CAP.Execution);
  });
});
