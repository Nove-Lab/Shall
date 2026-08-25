import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import {
  emitRejectionLedger,
  REJECTIONS_FILE,
  type RejectionRecord,
} from "../serialize/index.js";
import { isStoreRefusal } from "./refusal.js";
import {
  readRejectionLedger,
  recordRejection,
  withdrawRejection,
} from "./rejection-ledger.js";

/**
 * The rejection ledger's door.
 *
 * REAL DIRECTORIES, like the approval ledger's tests beside them, because what
 * is claimed here is about a filesystem: that the first rejection makes the
 * folder, that a rename leaves no `.tmp`, that a file nobody can read is still
 * exactly the bytes it was afterwards. A fake would agree with whatever this
 * module happens to do.
 *
 * The cases are the approval door's cases, one for one, because the two doors
 * are now one door with two codecs and a door that drifts is a door that stopped
 * being shared. What is new is the third one: a withdrawal removes a key, and a
 * book emptied down to its last key is a file of no bytes rather than no file.
 *
 * Every case builds its own project under the system temp directory and every
 * one of them is removed at the end, whether it passed or not.
 */

const roots: string[] = [];

async function makeLedgerPath(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "shall-rejections-"));
  roots.push(root);
  return path.join(root, ".shall", REJECTIONS_FILE);
}

after(async () => {
  for (const root of roots) {
    await rm(root, { recursive: true, force: true });
  }
});

const REJECTED: RejectionRecord = {
  rejectedHash:
    "sha256:9f2b1c0000000000000000000000000000000000000000000000000000000000",
  by: "yjshin",
  at: "2026-08-16T09:12:33.412Z",
  rationale: "The acceptance criteria do not say what happens on a declined card.",
};

const OTHER: RejectionRecord = {
  rejectedHash: "sha256:aa",
  by: "someone",
  at: "2026-08-16T10:00:00.000Z",
  rationale: ["Two things:", "- the log is not attached", "- the wrong command"].join("\n"),
};

/** The refusal the door threw, as a kind and a sentence. */
async function refusal(
  run: () => Promise<unknown>,
): Promise<{ kind: string; message: string }> {
  try {
    await run();
  } catch (error) {
    assert.ok(isStoreRefusal(error), `not a refusal: ${String(error)}`);
    return { kind: error.kind, message: error.message };
  }
  assert.fail("expected a refusal");
}

/** What is actually on disk, and what else the write left beside it. */
async function bytes(file: string): Promise<string> {
  return readFile(file, "utf8");
}

async function beside(file: string): Promise<string[]> {
  return (await readdir(path.dirname(file))).sort();
}

describe("the rejection ledger door", () => {
  test("a ledger that is not there is an empty ledger, and so is a folder that is not there", async () => {
    const file = await makeLedgerPath();
    assert.deepEqual(await readRejectionLedger(file), {
      records: new Map(),
      problem: null,
    });

    await mkdir(path.dirname(file), { recursive: true });
    assert.deepEqual(await readRejectionLedger(file), {
      records: new Map(),
      problem: null,
    });
  });

  test("a ledger folder that is somehow a file is never written into, and the sentence says what stands there", async () => {
    const file = await makeLedgerPath();
    await mkdir(path.dirname(path.dirname(file)), { recursive: true });
    await writeFile(path.dirname(file), "not a folder\n", "utf8");

    const reading = await readRejectionLedger(file);
    assert.equal(reading.problem, null);
    assert.equal(reading.records.size, 0);

    const answer = await refusal(() => recordRejection(file, "R-0001", REJECTED));
    assert.deepEqual(answer, {
      kind: "conflict",
      message: `The rejection ledger at ${file} could not be written: something already stands where a folder along its path would go.`,
    });
    assert.equal(await readFile(path.dirname(file), "utf8"), "not a folder\n");
  });

  test("the first rejection writes the ledger, folder and all, in canonical bytes", async () => {
    const file = await makeLedgerPath();

    const written = await recordRejection(file, "R-0001", REJECTED);
    assert.deepEqual(written, REJECTED);
    assert.equal(
      await bytes(file),
      emitRejectionLedger(new Map([["R-0001", REJECTED]])),
    );
    assert.deepEqual(await beside(file), ["rejections.yaml"]);
  });

  test("a second rejection of the same id replaces its record rather than adding one", async () => {
    const file = await makeLedgerPath();
    await recordRejection(file, "R-0001", REJECTED);

    const later: RejectionRecord = {
      rejectedHash: "sha256:bb",
      by: "yjshin",
      at: "2026-08-16T12:00:00.000Z",
      rationale: "Still not right: the declined path is now wrong in a new way.",
    };
    assert.deepEqual(await recordRejection(file, "R-0001", later), later);

    const reading = await readRejectionLedger(file);
    assert.deepEqual([...reading.records.entries()], [["R-0001", later]]);
    assert.equal(
      await bytes(file),
      emitRejectionLedger(new Map([["R-0001", later]])),
    );
  });

  test("another id lands beside the first, in byte order", async () => {
    const file = await makeLedgerPath();
    await recordRejection(file, "R-0001", REJECTED);
    await recordRejection(file, "EV-0002", OTHER);

    const text = await bytes(file);
    assert.ok(text.startsWith("EV-0002:\n"), text);
    assert.equal(
      text,
      emitRejectionLedger(
        new Map([
          ["EV-0002", OTHER],
          ["R-0001", REJECTED],
        ]),
      ),
    );
    assert.deepEqual(
      [...(await readRejectionLedger(file)).records.keys()],
      ["EV-0002", "R-0001"],
    );
  });

  test("a rationale of several lines is one line of the file, and comes back whole", async () => {
    const file = await makeLedgerPath();
    await recordRejection(file, "EV-0002", OTHER);

    const text = await bytes(file);
    assert.ok(text.includes('  rationale: "Two things:\\n'), text);
    assert.equal(text.split("\n").length, 6);
    assert.equal(
      (await readRejectionLedger(file)).records.get("EV-0002")?.rationale,
      OTHER.rationale,
    );
  });

  test("a ledger nobody can read is never written over, and the refusal says so", async () => {
    for (const [junk, why] of [
      ["- a\n", "The rejection ledger is a list, not a map from node id to rejection record."],
      [
        "R-0001: 3\n",
        "Every record in the rejection ledger is a map of rejectedHash, by, at and rationale, each of them text — with one map of what was left open over it, evidence for a criterion or reports for a work item, holding at least one entry and never both — the record under R-0001 is not.",
      ],
    ] as const) {
      const file = await makeLedgerPath();
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, junk, "utf8");

      const sentence = `${why} Nothing was written over it — the ledger is Shall's own file, so restore it from git or move it aside.`;
      const refused = await refusal(() =>
        recordRejection(file, "R-0001", REJECTED),
      );
      assert.deepEqual(refused, { kind: "conflict", message: sentence });

      // A withdrawal is a write too, and it meets the same wall before it ever
      // asks whether the key is there.
      const withdrawn = await refusal(() => withdrawRejection(file, "R-0001"));
      assert.deepEqual(withdrawn, { kind: "conflict", message: sentence });

      assert.equal(await bytes(file), junk);
      assert.deepEqual(await beside(file), ["rejections.yaml"]);
    }
  });

  test("a record the reader would settle differently never reaches the disk", async () => {
    const file = await makeLedgerPath();

    // The door's fixpoint is over the TEXT and not over the records, which is
    // what catches this: the emitter writes the spaces inside quotation marks,
    // the reader trims them off the way it trims every identity, and the bytes
    // that would come back are not the bytes that went out. A door comparing
    // one id's record instead would have written a file whose `by` is not the
    // `by` it was handed.
    const answer = await refusal(() =>
      recordRejection(file, "R-0001", { ...REJECTED, by: " yjshin " }),
    );
    assert.deepEqual(answer, {
      kind: "invalid",
      message:
        "Shall emitted a rejection ledger it could not read back — What it read back is not what it wrote.",
    });
    await assert.rejects(() => readFile(file, "utf8"));
  });

  test("a ledger with bytes that are not UTF-8 is a problem sentence and no records", async () => {
    const file = await makeLedgerPath();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.from([0xff, 0xfe, 0xfd]));

    const reading = await readRejectionLedger(file);
    assert.equal(
      reading.problem,
      "The rejection ledger could not be read: it is not valid UTF-8 text.",
    );
    assert.equal(reading.records.size, 0);
  });

  test("withdrawing removes the key and leaves the rest of the book standing", async () => {
    const file = await makeLedgerPath();
    await recordRejection(file, "R-0001", REJECTED);
    await recordRejection(file, "EV-0002", OTHER);

    await withdrawRejection(file, "R-0001");

    const reading = await readRejectionLedger(file);
    assert.equal(reading.problem, null);
    assert.deepEqual([...reading.records.entries()], [["EV-0002", OTHER]]);
    assert.equal(
      await bytes(file),
      emitRejectionLedger(new Map([["EV-0002", OTHER]])),
    );
  });

  test("withdrawing the last rejection writes an empty file rather than removing it", async () => {
    const file = await makeLedgerPath();
    await recordRejection(file, "R-0001", REJECTED);

    await withdrawRejection(file, "R-0001");

    // No bytes at all, which is what an empty ledger is everywhere in this
    // design — and the file itself stays, so git holds the emptying as a change
    // to one file rather than as a deletion.
    assert.equal(await bytes(file), "");
    assert.deepEqual(await beside(file), ["rejections.yaml"]);
    const reading = await readRejectionLedger(file);
    assert.equal(reading.problem, null);
    assert.equal(reading.records.size, 0);

    // And the book takes a record again afterwards.
    await recordRejection(file, "R-0001", REJECTED);
    assert.equal(
      await bytes(file),
      emitRejectionLedger(new Map([["R-0001", REJECTED]])),
    );
  });

  test("withdrawing a rejection nobody recorded is refused, and writes nothing", async () => {
    const file = await makeLedgerPath();
    await recordRejection(file, "EV-0002", OTHER);
    const before = await bytes(file);

    assert.deepEqual(await refusal(() => withdrawRejection(file, "R-0001")), {
      kind: "invalid",
      message: "R-0001 carries no rejection, so there is nothing to withdraw.",
    });
    assert.equal(await bytes(file), before);

    // Including the case where there is no file at all: the sentence is about
    // the id and not about the book, because a second click on a button whose
    // first click worked is what usually gets here.
    const empty = await makeLedgerPath();
    assert.deepEqual(await refusal(() => withdrawRejection(empty, "R-0001")), {
      kind: "invalid",
      message: "R-0001 carries no rejection, so there is nothing to withdraw.",
    });
    await assert.rejects(() => readFile(empty, "utf8"));
  });

  test("two rejections racing land as two records and neither is lost", async () => {
    const file = await makeLedgerPath();
    await Promise.all([
      recordRejection(file, "R-0001", REJECTED),
      recordRejection(file, "EV-0002", OTHER),
    ]);

    const reading = await readRejectionLedger(file);
    assert.equal(reading.problem, null);
    assert.deepEqual(
      [...reading.records.entries()],
      [
        ["EV-0002", OTHER],
        ["R-0001", REJECTED],
      ],
    );
    assert.deepEqual(await beside(file), ["rejections.yaml"]);
  });

  test("a ledger written and read back is the same map", async () => {
    const file = await makeLedgerPath();
    const records = new Map<string, RejectionRecord>([
      ["R-0001", REJECTED],
      ["EV-0002", OTHER],
      // An id that reads as a number, which the emitter quotes and the reader
      // has to hand back as the string it is.
      [
        "1234",
        {
          rejectedHash: "sha256:cc",
          by: "someone else",
          at: "2026-08-16T13:00:00.000Z",
          rationale: "12:30 is a time and not a number, and so is this line.",
        },
      ],
    ]);
    for (const [id, record] of records) {
      await recordRejection(file, id, record);
    }

    const reading = await readRejectionLedger(file);
    assert.equal(reading.problem, null);
    assert.deepEqual(reading.records, records);
    assert.equal(await bytes(file), emitRejectionLedger(records));
  });
});
