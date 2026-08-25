import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { compare } from "./order.js";

/**
 * ONE SPELLING, AND THIS IS WHAT IT PROMISES. Everything sorted in Shall —
 * ledger bytes, review rows, board rows, a bundle's members — runs through here
 * so that the same records are always the same file and two people's edits of
 * two different nodes merge without a conflict.
 *
 * THE LOCALE TEST IS THE ONE THAT MATTERS. `localeCompare` answers differently
 * under different environment variables, and the pairs below are exactly the
 * ones where it disagrees with byte order: a daemon started with a different
 * LANG would otherwise rewrite a ledger it had not changed.
 */

describe("compare", () => {
  test("answers zero only for the same string", () => {
    assert.equal(compare("R-0001", "R-0001"), 0);
    assert.equal(compare("", ""), 0);
  });

  test("answers minus one and one, never a magnitude", () => {
    // Callers hand it to `sort`, which reads the sign; a difference of code
    // units would be a second thing to reason about for no gain.
    assert.equal(compare("R-0001", "R-0002"), -1);
    assert.equal(compare("R-0002", "R-0001"), 1);
    assert.equal(compare("R-0001", "R-9999"), -1);
  });

  test("sorts by bytes and not by the machine's locale", () => {
    // Every uppercase letter sorts ahead of every lowercase one, and a hyphen
    // sorts ahead of both. `localeCompare` says otherwise under most locales.
    assert.equal(compare("Z", "a"), -1);
    assert.equal(compare("a", "B"), 1);
    assert.equal(compare("R-0001", "R.0001"), -1);
    assert.equal(compare("resume", "résumé"), -1);
  });

  test("puts padded ids in numeric order, which is why they are padded", () => {
    assert.deepEqual(["R-0010", "R-0002", "R-0001"].sort(compare), [
      "R-0001",
      "R-0002",
      "R-0010",
    ]);
  });

  test("orders a prefix ahead of the string that extends it", () => {
    assert.equal(compare("R-0001", "R-0001.md"), -1);
    assert.equal(compare("", "a"), -1);
  });
});
