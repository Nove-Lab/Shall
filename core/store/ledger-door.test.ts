import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readBack, type LedgerCodec } from "./ledger-door.js";
import { isStoreRefusal } from "./refusal.js";

/**
 * The door the three books are read and written through, asked the one thing
 * none of them can ask it.
 *
 * Everything else in this file is exercised three times over by
 * `approval-ledger`, `rejection-ledger` and `acceptance-ledger`, which are this
 * door with a codec bolted on: a book nobody can read, a `ledger` that is a
 * file, the queue, the fixpoint, the sentence every refusal ends with. What no
 * book can reach is `readBack`'s absence — the fixpoint above it has already
 * compared every byte of what was written against what read back, so an id that
 * went in is an id that is there. It is said out loud anyway rather than
 * asserted away, and this is where that sentence is pinned.
 */

/**
 * Enough of a book to be named in a refusal. The two functions are the format
 * and nothing below reads or writes a file, so they answer for the empty book
 * they are handed.
 */
function book(noun: string): LedgerCodec<string> {
  return {
    noun,
    parse: () => ({ records: new Map<string, string>(), problem: null }),
    emit: () => "",
  };
}

const DISAGREEMENT = "What it read back is not what it wrote.";

describe("the door under the three books", () => {
  test("an id the file holds comes back as the file holds it", () => {
    const records = new Map([
      ["R-0001", "one"],
      ["R-0002", "two"],
    ]);
    assert.equal(readBack(records, "R-0001", book("approval ledger")), "one");
    assert.equal(readBack(records, "R-0002", book("approval ledger")), "two");
  });

  test("an id the file does not hold is the defect sentence, never an undefined", () => {
    // The emitter and the reader disagreeing is Shall failing at its own job,
    // so it is `invalid` and it says so in the fixpoint's own words — a caller
    // that got `undefined` back would put it in a response and nobody would
    // know where it came from.
    assert.throws(
      () => readBack(new Map([["R-0001", "one"]]), "R-0002", book("approval ledger")),
      (error: unknown) => {
        assert.ok(isStoreRefusal(error), `not a refusal: ${String(error)}`);
        assert.equal(error.kind, "invalid");
        assert.equal(
          error.message,
          `Shall emitted an approval ledger it could not read back — ${DISAGREEMENT}`,
        );
        return true;
      },
    );
  });

  test("each book is named with the article its own noun asks for", () => {
    // The three nouns are English words whose first letter tells the truth
    // about their first sound, so the vowel test is exact for all three.
    for (const noun of ["approval ledger", "acceptance ledger", "rejection ledger"]) {
      const article = noun.startsWith("rejection") ? "a" : "an";
      assert.throws(
        () => readBack(new Map<string, string>(), "R-0001", book(noun)),
        (error: unknown) => {
          assert.ok(isStoreRefusal(error), `not a refusal: ${String(error)}`);
          assert.equal(
            error.message,
            `Shall emitted ${article} ${noun} it could not read back — ${DISAGREEMENT}`,
          );
          return true;
        },
        noun,
      );
    }
  });
});
