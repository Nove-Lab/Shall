import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isEmbedded,
  listEmbedded,
  readEmbedded,
  readEmbeddedText,
  setEmbeddedFiles,
} from "./embedded.js";

/**
 * The files a single-binary Shall carries.
 *
 * THE CHECKOUT ANSWER IS ASSERTED FIRST AND ONCE, and the order is the point:
 * registering has no undo — a binary hands its files over exactly once, at its
 * entry — so the only moment this process can be asked what a checkout says is
 * before anything is handed in.
 */

function encode(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

describe("the files a binary carries", () => {
  test("a checkout carries nothing, and says so", () => {
    assert.equal(isEmbedded(), false);
    assert.equal(readEmbedded("web/index.html"), undefined);
    assert.deepEqual(listEmbedded("kit/"), []);
  });

  test("a carried file comes back as its own bytes", () => {
    setEmbeddedFiles({ "web/index.html": encode("<!doctype html>") });
    assert.equal(isEmbedded(), true);
    assert.equal(readEmbeddedText("web/index.html"), "<!doctype html>");
    assert.deepEqual(
      readEmbedded("web/index.html"),
      Buffer.from("<!doctype html>", "utf8"),
    );
  });

  test("bytes that are not text survive the trip", () => {
    const bytes = Buffer.from([0, 1, 2, 255, 254]);
    setEmbeddedFiles({ "web/a.woff2": bytes.toString("base64") });
    assert.deepEqual(readEmbedded("web/a.woff2"), bytes);
  });

  test("a prefix lists what is under it, sorted and with the prefix off", () => {
    setEmbeddedFiles({
      "kit/skills/shall-work/SKILL.md": encode("b"),
      "kit/commands/specify.md": encode("a"),
      "web/index.html": encode("c"),
    });
    assert.deepEqual(listEmbedded("kit/"), [
      "commands/specify.md",
      "skills/shall-work/SKILL.md",
    ]);
  });

  test("a key nobody carried is undefined rather than empty", () => {
    setEmbeddedFiles({ "web/index.html": encode("x") });
    assert.equal(readEmbedded("web/missing.js"), undefined);
    assert.equal(readEmbeddedText("kit/commands/nope.md"), undefined);
  });

  test("a second carry replaces the first rather than adding to it", () => {
    setEmbeddedFiles({ "web/index.html": encode("first") });
    setEmbeddedFiles({ "web/index.html": encode("second") });
    assert.equal(readEmbeddedText("web/index.html"), "second");
  });
});
