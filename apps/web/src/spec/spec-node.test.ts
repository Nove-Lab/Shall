import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { formatStamp } from "./spec-node";

/**
 * THE ONE THING THIS FILE OWNS: how a stored instant is written for a person.
 * The result is the reader's own locale and time zone, so nothing here asserts
 * a spelling — what is held to account is that both wire spellings are accepted
 * and name the same instant, and that a value that will not parse is printed as
 * the text it was rather than as "Invalid Date".
 */
describe("formatStamp", () => {
  test("a file's mtime and the ledger's ISO instant are the same moment", () => {
    const instant = Date.UTC(2026, 7, 21, 14, 3, 0);
    assert.equal(
      formatStamp(instant),
      formatStamp(new Date(instant).toISOString()),
    );
  });

  test("it is a stamp and not the number it came from", () => {
    const written = formatStamp(Date.UTC(2026, 7, 21, 14, 3, 0));
    assert.notEqual(written, String(Date.UTC(2026, 7, 21, 14, 3, 0)));
    assert.notEqual(written, "Invalid Date");
  });

  test("a date that will not parse is printed as the text it was", () => {
    assert.equal(formatStamp("not a date at all"), "not a date at all");
    assert.equal(formatStamp(""), "");
    assert.equal(formatStamp(Number.NaN), "NaN");
  });
});
