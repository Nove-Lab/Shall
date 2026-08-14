import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatEdgeId, parseEdgeId } from "./edge.js";

/**
 * An edge id is synthesized from the triple and never stored, so the pair below
 * is the whole of an edge's identity: if the round trip ever stops holding,
 * `spec.removeEdge` deletes the wrong line or none at all.
 */
describe("edge ids", () => {
  test("reads as the triple a person would write", () => {
    assert.equal(
      formatEdgeId("R-0001", "HAS_CRITERION", "AC-0004"),
      "R-0001 HAS_CRITERION AC-0004",
    );
  });

  test("parses back to what it was formatted from", () => {
    const triple = { type: "MENTIONS", fromId: "SC-0001", toId: "T-0001" };
    assert.deepEqual(
      parseEdgeId(formatEdgeId(triple.fromId, triple.type, triple.toId)),
      triple,
    );
  });

  for (const id of [
    "",
    "R-0001",
    "R-0001 HAS_CRITERION",
    "R-0001 HAS_CRITERION AC-0004 AC-0005",
    " HAS_CRITERION AC-0004",
    "R-0001  AC-0004",
    "R-0001 HAS_CRITERION ",
  ]) {
    test(`refuses ${JSON.stringify(id)}, which is not a triple`, () => {
      assert.equal(parseEdgeId(id), null);
    });
  }
});
