import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NODE_TYPES } from "./canon.js";
import { sectionGuideFor } from "./guide.js";

/**
 * A GUIDE AND NOT A SCHEMA, so what is asserted here is deliberately thin: that
 * every canon type has a starting shape to offer, that a name outside the canon
 * has none, and that a section may carry a hint or carry nothing. Nothing below
 * asserts that a body follows the guide, because no door asks it to — the body
 * is free markdown and `validate.test.ts` is where that freedom is held.
 *
 * The exhaustiveness is a compile error rather than a test — `GUIDE` is typed
 * `Record<NodeTypeName, …>` — but a type answering with an EMPTY list would
 * satisfy that annotation and ship a template with no headings at all, which is
 * the gap the walk below closes.
 */

describe("sectionGuideFor", () => {
  test("offers every canon type a shape to start from", () => {
    for (const entry of NODE_TYPES) {
      const sections = sectionGuideFor(entry.name);
      assert.notEqual(sections, null, entry.name);
      assert.equal((sections ?? []).length > 0, true, entry.name);
    }
  });

  test("names each heading once within a type", () => {
    for (const entry of NODE_TYPES) {
      const labels = (sectionGuideFor(entry.name) ?? []).map(
        (section) => section.label,
      );
      assert.equal(new Set(labels).size, labels.length, entry.name);
    }
  });

  test("keeps the roster's authoring order", () => {
    // The template writes its headings in this order, so it is the order a
    // person meets the sections in and not an implementation detail.
    assert.deepEqual(
      (sectionGuideFor("Requirement") ?? []).map((section) => section.label),
      ["Statement", "Description", "Requirement Type", "Priority", "Rationale"],
    );
  });

  test("carries a hint only where the roster knew something beyond the label", () => {
    const [definition, aliases] = sectionGuideFor("Term") ?? [];
    assert.deepEqual(definition, { label: "Definition" });
    assert.equal(aliases?.label, "Aliases");
    assert.equal(typeof aliases?.hint, "string");
  });

  test("opens a Journal on the words that opened the turn", () => {
    // The prompt comes first because the rest of the journal is an answer to
    // it, and it is copied rather than summarised.
    assert.equal((sectionGuideFor("Journal") ?? [])[0]?.label, "User Prompt");
  });

  test("gives a CompletionReport no Verdict, and that absence is the design", () => {
    // This type says what was done and does not conclude that it was enough.
    // Whether the work item is finished is a person's word in the ledger.
    assert.deepEqual(
      (sectionGuideFor("CompletionReport") ?? []).map(
        (section) => section.label,
      ),
      ["Testimony", "Coverage", "Trigger"],
    );
  });

  test("has nothing to offer a name outside the canon, which is how a string is checked", () => {
    assert.equal(sectionGuideFor("Widget"), null);
    assert.equal(sectionGuideFor("requirement"), null);
    assert.equal(sectionGuideFor(""), null);
  });
});
