import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import {
  emitApprovalLedger,
  LEDGER_FILE,
  type ApprovalRecord,
} from "../serialize/index.js";
import { readApprovalLedger, recordApproval } from "./approval-ledger.js";
import { isStoreRefusal } from "./refusal.js";

/**
 * The ledger's door.
 *
 * REAL DIRECTORIES, like the spec folder's tests beside them, because what is
 * claimed here is about a filesystem: that the first approval makes the folder,
 * that a rename leaves no `.tmp`, that a file nobody can read is still exactly
 * the bytes it was afterwards. A fake would agree with whatever this module
 * happens to do.
 *
 * Every case builds its own project under the system temp directory and every
 * one of them is removed at the end, whether it passed or not.
 */

const roots: string[] = [];

/**
 * Where a project's ledger belongs, in a project that has nothing there yet —
 * no `ledger` folder and no file — which is how `shall init` leaves it and what
 * the first approval has to cope with. The path is assembled from `LEDGER_FILE`
 * so that these bytes are the ones the daemon will write.
 */
async function makeLedgerPath(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "shall-ledger-"));
  roots.push(root);
  return path.join(root, ".shall", LEDGER_FILE);
}

after(async () => {
  for (const root of roots) {
    await rm(root, { recursive: true, force: true });
  }
});

const APPROVED: ApprovalRecord = {
  approvedHash:
    "sha256:9f2b1c0000000000000000000000000000000000000000000000000000000000",
  by: "yjshin",
  at: "2026-08-15T09:12:33.412Z",
};

const OTHER: ApprovalRecord = {
  approvedHash: "sha256:aa",
  by: "someone",
  at: "2026-08-15T10:00:00.000Z",
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

describe("the approval ledger door", () => {
  test("a ledger that is not there is an empty ledger, and so is a folder that is not there", async () => {
    const file = await makeLedgerPath();

    // Nothing at all yet: no `.shall`, no `ledger` under it, no file in that.
    assert.deepEqual(await readApprovalLedger(file), {
      records: new Map(),
      problem: null,
    });

    // And the folder standing empty, which is what a project looks like after
    // somebody removed the file by hand.
    await mkdir(path.dirname(file), { recursive: true });
    assert.deepEqual(await readApprovalLedger(file), {
      records: new Map(),
      problem: null,
    });
  });

  test("a ledger folder that is somehow a file reads as no ledger, not as a failure", async () => {
    const file = await makeLedgerPath();
    await mkdir(path.dirname(path.dirname(file)), { recursive: true });
    await writeFile(path.dirname(file), "not a folder\n", "utf8");

    // ENOTDIR, met by the same rule the spec folder keeps: a path that cannot
    // hold a ledger holds no records, and the check-and-then-read race is a
    // worse answer than reading and taking what comes.
    const reading = await readApprovalLedger(file);
    assert.equal(reading.problem, null);
    assert.equal(reading.records.size, 0);
  });

  test("the first approval writes the ledger, folder and all, in canonical bytes", async () => {
    const file = await makeLedgerPath();

    const written = await recordApproval(file, "G-0001", APPROVED);
    assert.deepEqual(written, APPROVED);
    assert.equal(
      await bytes(file),
      emitApprovalLedger(new Map([["G-0001", APPROVED]])),
    );
    assert.deepEqual(await beside(file), ["approvals.yaml"]);
  });

  test("a second approval of the same id replaces its record rather than adding one", async () => {
    const file = await makeLedgerPath();
    await recordApproval(file, "G-0001", APPROVED);

    const later: ApprovalRecord = {
      approvedHash: "sha256:bb",
      by: "yjshin",
      at: "2026-08-15T12:00:00.000Z",
    };
    assert.deepEqual(await recordApproval(file, "G-0001", later), later);

    const reading = await readApprovalLedger(file);
    assert.deepEqual([...reading.records.entries()], [["G-0001", later]]);
    assert.equal(
      await bytes(file),
      emitApprovalLedger(new Map([["G-0001", later]])),
    );
  });

  test("another id lands beside the first, in byte order", async () => {
    const file = await makeLedgerPath();
    await recordApproval(file, "R-0001", OTHER);
    await recordApproval(file, "G-0001", APPROVED);

    const text = await bytes(file);
    assert.ok(text.startsWith("G-0001:\n"), text);
    assert.equal(
      text,
      emitApprovalLedger(
        new Map([
          ["G-0001", APPROVED],
          ["R-0001", OTHER],
        ]),
      ),
    );
    assert.deepEqual(
      [...(await readApprovalLedger(file)).records.keys()],
      ["G-0001", "R-0001"],
    );
  });

  test("a record for an id no file claims is kept, because it is the history of a node that went", async () => {
    const file = await makeLedgerPath();
    // This door is handed ids and never looks in a spec folder, so a record
    // whose node was deleted is simply a record. Nothing here prunes: the
    // history is what makes a restore green the moment the content matches.
    await recordApproval(file, "G-0001", APPROVED);
    await recordApproval(file, "R-0001", OTHER);

    const reading = await readApprovalLedger(file);
    assert.equal(reading.problem, null);
    assert.deepEqual(reading.records.get("G-0001"), APPROVED);
    assert.deepEqual([...reading.records.keys()], ["G-0001", "R-0001"]);
  });

  test("a ledger nobody can read is never written over, and the refusal says so", async () => {
    for (const [junk, why] of [
      ["- a\n", "The approval ledger is a list, not a map from node id to approval record."],
      [
        "G-0001: 3\n",
        "Every record in the approval ledger is a map of exactly approvedHash, by and at, each of them text — the record under G-0001 is not.",
      ],
    ] as const) {
      const file = await makeLedgerPath();
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, junk, "utf8");

      const refused = await refusal(() =>
        recordApproval(file, "G-0001", APPROVED),
      );
      assert.equal(refused.kind, "conflict");
      assert.equal(
        refused.message,
        `${why} Nothing was written over it — the ledger is Shall's own file, so restore it from git or move it aside.`,
      );

      // Byte for byte what it was: an unreadable ledger is somebody's approvals
      // in a state this door cannot see, and rewriting it would bury them.
      assert.equal(await bytes(file), junk);
      assert.deepEqual(await beside(file), ["approvals.yaml"]);
    }
  });

  test("a ledger with bytes that are not UTF-8 is a problem sentence and no records", async () => {
    const file = await makeLedgerPath();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.from([0xff, 0xfe, 0xfd]));

    const reading = await readApprovalLedger(file);
    assert.equal(
      reading.problem,
      "The approval ledger could not be read: it is not valid UTF-8 text.",
    );
    assert.equal(reading.records.size, 0);
  });

  test("two approvals racing land as two records and neither is lost", async () => {
    const file = await makeLedgerPath();
    // Both read the file before either wrote it, without the queue.
    await Promise.all([
      recordApproval(file, "G-0001", APPROVED),
      recordApproval(file, "R-0001", OTHER),
    ]);

    const reading = await readApprovalLedger(file);
    assert.equal(reading.problem, null);
    assert.deepEqual(
      [...reading.records.entries()],
      [
        ["G-0001", APPROVED],
        ["R-0001", OTHER],
      ],
    );
    assert.deepEqual(await beside(file), ["approvals.yaml"]);
  });

  test("a ledger written and read back is the same map", async () => {
    const file = await makeLedgerPath();
    const records = new Map<string, ApprovalRecord>([
      ["G-0001", APPROVED],
      ["R-0001", OTHER],
      // An id that reads as a number, which the emitter quotes and the reader
      // has to hand back as the string it is.
      ["1234", { approvedHash: "sha256:cc", by: "someone else", at: "2026-08-15T13:00:00.000Z" }],
    ]);
    for (const [id, record] of records) {
      await recordApproval(file, id, record);
    }

    const reading = await readApprovalLedger(file);
    assert.equal(reading.problem, null);
    assert.deepEqual(reading.records, records);
    assert.equal(await bytes(file), emitApprovalLedger(records));
  });
});
