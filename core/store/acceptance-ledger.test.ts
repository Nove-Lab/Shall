import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import {
  ACCEPTANCES_FILE,
  emitAcceptanceLedger,
  type AcceptanceRecord,
} from "../serialize/index.js";
import {
  readAcceptanceLedger,
  recordAcceptance,
  withdrawAcceptance,
} from "./acceptance-ledger.js";
import { isStoreRefusal } from "./refusal.js";

/**
 * The acceptance ledger's door.
 *
 * REAL DIRECTORIES, like the two doors beside it, because what is claimed here
 * is about a filesystem: that the first closing makes the folder, that a rename
 * leaves no `.tmp`, that a file nobody can read is still exactly the bytes it
 * was afterwards.
 *
 * The cases are the approval door's cases, one for one, plus the two this book
 * brings with it: the evidence map survives the trip whole, and a record naming
 * no evidence is caught by the door's own read-back check rather than reaching
 * the disk.
 *
 * Every case builds its own project under the system temp directory and every
 * one of them is removed at the end, whether it passed or not.
 */

const roots: string[] = [];

async function makeLedgerPath(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "shall-acceptances-"));
  roots.push(root);
  return path.join(root, ".shall", ACCEPTANCES_FILE);
}

after(async () => {
  for (const root of roots) {
    await rm(root, { recursive: true, force: true });
  }
});

const CLOSED: AcceptanceRecord = {
  kind: "criterion" as const,
  subjectHash:
    "sha256:9f2b1c0000000000000000000000000000000000000000000000000000000000",
  claimants: new Map([
    ["EV-0001", "sha256:aa"],
    ["EV-0002", "sha256:bb"],
  ]),
  by: "yjshin",
  at: "2026-08-16T09:12:33.412Z",
};

const OTHER: AcceptanceRecord = {
  kind: "criterion" as const,
  subjectHash: "sha256:cc",
  claimants: new Map([["EV-0003", "sha256:dd"]]),
  by: "someone",
  at: "2026-08-16T10:00:00.000Z",
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

describe("the acceptance ledger door", () => {
  test("a ledger that is not there is an empty ledger, and so is a folder that is not there", async () => {
    const file = await makeLedgerPath();
    assert.deepEqual(await readAcceptanceLedger(file), {
      records: new Map(),
      problem: null,
    });

    await mkdir(path.dirname(file), { recursive: true });
    assert.deepEqual(await readAcceptanceLedger(file), {
      records: new Map(),
      problem: null,
    });
  });

  test("a ledger folder that is somehow a file is never written into, and the sentence says what stands there", async () => {
    const file = await makeLedgerPath();
    await mkdir(path.dirname(path.dirname(file)), { recursive: true });
    await writeFile(path.dirname(file), "not a folder\n", "utf8");

    const reading = await readAcceptanceLedger(file);
    assert.equal(reading.problem, null);
    assert.equal(reading.records.size, 0);

    const answer = await refusal(() => recordAcceptance(file, "AC-0001", CLOSED));
    assert.deepEqual(answer, {
      kind: "conflict",
      message: `The acceptance ledger at ${file} could not be written: something already stands where a folder along its path would go.`,
    });
    assert.equal(await readFile(path.dirname(file), "utf8"), "not a folder\n");
  });

  test("the first closing writes the ledger, folder and all, in canonical bytes", async () => {
    const file = await makeLedgerPath();

    const written = await recordAcceptance(file, "AC-0001", CLOSED);
    assert.deepEqual(written, CLOSED);
    assert.equal(
      await bytes(file),
      emitAcceptanceLedger(new Map([["AC-0001", CLOSED]])),
    );
    assert.deepEqual(await beside(file), ["acceptances.yaml"]);
  });

  test("closing the same criterion again replaces its record rather than adding one", async () => {
    const file = await makeLedgerPath();
    await recordAcceptance(file, "AC-0001", CLOSED);

    const later: AcceptanceRecord = {
      kind: "criterion" as const,
      subjectHash: "sha256:ee",
      claimants: new Map([["EV-0001", "sha256:ff"]]),
      by: "yjshin",
      at: "2026-08-16T12:00:00.000Z",
    };
    assert.deepEqual(await recordAcceptance(file, "AC-0001", later), later);

    const reading = await readAcceptanceLedger(file);
    assert.deepEqual([...reading.records.entries()], [["AC-0001", later]]);
    assert.equal(
      await bytes(file),
      emitAcceptanceLedger(new Map([["AC-0001", later]])),
    );
  });

  test("reopening a criterion by hand removes its record and leaves the rest of the book", async () => {
    // The person's way out of closed — the arithmetic way is a changed hash.
    // The daemon writes the reason into the rejection ledger right after; here
    // only the key goes, and the last key going leaves an empty file, not none.
    const file = await makeLedgerPath();
    await recordAcceptance(file, "AC-0001", CLOSED);
    await recordAcceptance(file, "AC-0002", OTHER);

    await withdrawAcceptance(file, "AC-0001");
    const reading = await readAcceptanceLedger(file);
    assert.equal(reading.problem, null);
    assert.deepEqual([...reading.records.entries()], [["AC-0002", OTHER]]);

    await withdrawAcceptance(file, "AC-0002");
    assert.equal(await bytes(file), "");
    assert.deepEqual(await beside(file), ["acceptances.yaml"]);

    assert.deepEqual(await refusal(() => withdrawAcceptance(file, "AC-0001")), {
      kind: "invalid",
      message: "AC-0001 carries no acceptance, so there is nothing to withdraw.",
    });
    assert.equal(await bytes(file), "");
  });

  test("another criterion lands beside the first, in byte order, evidence and all", async () => {
    const file = await makeLedgerPath();
    await recordAcceptance(file, "AC-0002", OTHER);
    await recordAcceptance(file, "AC-0001", CLOSED);

    const text = await bytes(file);
    assert.ok(text.startsWith("AC-0001:\n"), text);
    assert.equal(
      text,
      emitAcceptanceLedger(
        new Map([
          ["AC-0001", CLOSED],
          ["AC-0002", OTHER],
        ]),
      ),
    );

    const reading = await readAcceptanceLedger(file);
    assert.deepEqual([...reading.records.keys()], ["AC-0001", "AC-0002"]);
    assert.deepEqual(
      [...(reading.records.get("AC-0001")?.claimants.entries() ?? [])],
      [
        ["EV-0001", "sha256:aa"],
        ["EV-0002", "sha256:bb"],
      ],
    );
  });

  test("an acceptance naming no evidence never reaches the disk", async () => {
    const file = await makeLedgerPath();

    // The emitter writes what it is handed and the reader refuses it, so the
    // door's own read-back check is what catches a record that should not
    // exist — an `invalid`, because this is Shall failing at its own job and
    // not somebody's file being in the way.
    const answer = await refusal(() =>
      recordAcceptance(file, "AC-0001", { ...CLOSED, claimants: new Map() }),
    );
    assert.deepEqual(answer, {
      kind: "invalid",
      message:
        "Shall emitted an acceptance ledger it could not read back — Every record in the acceptance ledger is a map of exactly by, at and one closed thing — acHash with an evidence map for a criterion, or taskHash with a reports map for a work item — the map holding at least one entry, and never both — the record under AC-0001 is not.",
    });
    await assert.rejects(() => readFile(file, "utf8"));
  });

  test("a ledger nobody can read is never written over, and the refusal says so", async () => {
    for (const [junk, why] of [
      [
        "- a\n",
        "The acceptance ledger is a list, not a map from node id to acceptance record.",
      ],
      [
        "AC-0001: 3\n",
        "Every record in the acceptance ledger is a map of exactly by, at and one closed thing — acHash with an evidence map for a criterion, or taskHash with a reports map for a work item — the map holding at least one entry, and never both — the record under AC-0001 is not.",
      ],
    ] as const) {
      const file = await makeLedgerPath();
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, junk, "utf8");

      const refused = await refusal(() =>
        recordAcceptance(file, "AC-0001", CLOSED),
      );
      assert.deepEqual(refused, {
        kind: "conflict",
        message: `${why} Nothing was written over it — the ledger is Shall's own file, so restore it from git or move it aside.`,
      });

      assert.equal(await bytes(file), junk);
      assert.deepEqual(await beside(file), ["acceptances.yaml"]);
    }
  });

  test("a ledger with bytes that are not UTF-8 is a problem sentence and no records", async () => {
    const file = await makeLedgerPath();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.from([0xff, 0xfe, 0xfd]));

    const reading = await readAcceptanceLedger(file);
    assert.equal(
      reading.problem,
      "The acceptance ledger could not be read: it is not valid UTF-8 text.",
    );
    assert.equal(reading.records.size, 0);
  });

  test("two closings racing land as two records and neither is lost", async () => {
    const file = await makeLedgerPath();
    await Promise.all([
      recordAcceptance(file, "AC-0001", CLOSED),
      recordAcceptance(file, "AC-0002", OTHER),
    ]);

    const reading = await readAcceptanceLedger(file);
    assert.equal(reading.problem, null);
    assert.deepEqual(
      [...reading.records.entries()],
      [
        ["AC-0001", CLOSED],
        ["AC-0002", OTHER],
      ],
    );
    assert.deepEqual(await beside(file), ["acceptances.yaml"]);
  });

  test("a ledger written and read back is the same map", async () => {
    const file = await makeLedgerPath();
    const records = new Map<string, AcceptanceRecord>([
      ["AC-0001", CLOSED],
      ["AC-0002", OTHER],
      // Ids that read as numbers, outside and inside, which the emitter quotes
      // and the reader has to hand back as the strings they are.
      [
        "1234",
        {
          kind: "criterion" as const,
          subjectHash: "sha256:99",
          claimants: new Map([["5678", "sha256:88"]]),
          by: "someone else",
          at: "2026-08-16T13:00:00.000Z",
        },
      ],
    ]);
    for (const [id, record] of records) {
      await recordAcceptance(file, id, record);
    }

    const reading = await readAcceptanceLedger(file);
    assert.equal(reading.problem, null);
    assert.deepEqual(reading.records, records);
    assert.equal(await bytes(file), emitAcceptanceLedger(records));
  });
});
