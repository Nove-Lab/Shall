import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { PANELS, panelById, type PanelId } from "./panels";

/**
 * THE FOUR PANELS, AND THE ONE PLACE THEIR WORDS LIVE. The roster is a
 * declaration, so what is worth holding to account is that every panel is
 * complete — a title, a summary and something to say when it is empty — that
 * the three list panels declare the columns their tables render, and that the
 * one panel which is not a list declares none.
 */
describe("PANELS", () => {
  test("the four panels, in the sidebar's own order, each named once", () => {
    assert.deepEqual(
      PANELS.map((panel) => panel.id),
      ["review-queue", "work-board", "activity-feed", "vitals"],
    );
    assert.equal(new Set(PANELS.map((panel) => panel.id)).size, PANELS.length);
  });

  test("every panel says what it is and what it says when it holds nothing", () => {
    for (const panel of PANELS) {
      assert.ok(panel.title.length > 0);
      assert.ok(panel.summary.length > 0);
      assert.ok(panel.empty.length > 0);
    }
  });

  test("the three lists declare their table's headers; Vitals is not a list", () => {
    const withColumns = PANELS.filter((panel) => panel.columns !== undefined);
    assert.deepEqual(
      withColumns.map((panel) => panel.id),
      ["review-queue", "work-board", "activity-feed"],
    );
    for (const panel of withColumns) {
      assert.equal(panel.columns?.length, 4);
    }
    assert.equal(panelById("vitals")?.columns, undefined);
  });
});

describe("panelById", () => {
  test("each id finds its own panel", () => {
    for (const panel of PANELS) {
      assert.equal(panelById(panel.id), panel);
    }
  });

  test("a name that is not a panel, and no name at all, find nothing", () => {
    assert.equal(panelById("spec"), undefined);
    assert.equal(panelById(undefined), undefined);
    assert.equal(panelById(""), undefined);
  });

  test("the id union and the roster are the same four", () => {
    const ids: PanelId[] = ["review-queue", "work-board", "activity-feed", "vitals"];
    assert.deepEqual(
      ids.map((id) => panelById(id)?.id),
      ids,
    );
  });
});
