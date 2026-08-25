import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { BOX, CAPTION, controlBase, countWord, specLink } from "./parts";

/**
 * THE WORDS AND SPELLINGS EVERY CONTROL-PLANE SURFACE SHARES. Each of these was
 * a copy on two pages before it was one function, so what is held to account is
 * the spelling itself: the shape of a URL, the escaping a project path needs,
 * and the plural of a count.
 */
describe("controlBase", () => {
  test("a project's control plane hangs off its id", () => {
    assert.equal(controlBase("shall"), "/p/shall/control");
  });

  test("an id that is a path is escaped, so the segment stays one segment", () => {
    assert.equal(
      controlBase("/Users/me/dev/Shall"),
      "/p/%2FUsers%2Fme%2Fdev%2FShall/control",
    );
  });
});

describe("specLink", () => {
  test("it lands in the reading pane, on the node, with the way home", () => {
    assert.equal(
      specLink("shall", "R-0001", "/p/shall/control/work-board"),
      "/p/shall/spec?node=R-0001&back=%2Fp%2Fshall%2Fcontrol%2Fwork-board",
    );
  });

  test("every one of the three is escaped", () => {
    assert.equal(
      specLink("a/b", "R 1&2", "/p/a b?x=1"),
      "/p/a%2Fb/spec?node=R%201%262&back=%2Fp%2Fa%20b%3Fx%3D1",
    );
  });
});

describe("countWord", () => {
  test("one is the singular, and everything else takes an s", () => {
    assert.equal(countWord(1, "node"), "1 node");
    assert.equal(countWord(0, "node"), "0 nodes");
    assert.equal(countWord(2, "node"), "2 nodes");
  });

  test("an irregular plural says both words", () => {
    assert.equal(countWord(1, "criterion", "criteria"), "1 criterion");
    assert.equal(countWord(3, "criterion", "criteria"), "3 criteria");
  });
});

describe("the two recipes", () => {
  test("the caption and the box are shared classes, not per-page ones", () => {
    assert.ok(CAPTION.includes("text-muted-foreground"));
    assert.ok(BOX.includes("rounded-md"));
  });
});
