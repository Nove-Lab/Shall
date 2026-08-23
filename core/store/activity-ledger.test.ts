import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import {
  activityFileFor,
  emitActivity,
  type ActivityRecord,
} from "../serialize/index.js";
import { appendActivity, readActivity } from "./activity-ledger.js";
import { isStoreRefusal } from "./refusal.js";

/**
 * The activity feed's door.
 *
 * REAL DIRECTORIES, like the three doors beside it, because what is claimed
 * here is about a filesystem: that the first line makes the folder — two
 * folders, `ledger` and `feed` under it — that a rename leaves no `.tmp`, that
 * a month nobody can read is still exactly the bytes it was afterwards. A fake
 * would agree with whatever this module happens to do.
 *
 * The cases are the approval door's cases where a list has the same thing to
 * say, and what an append-only list says differently: a second record lands
 * AFTER the first rather than beside it in byte order, and nothing replaces.
 *
 * Every case builds its own project under the system temp directory and every
 * one of them is removed at the end, whether it passed or not.
 */

const roots: string[] = [];

/**
 * Where one month of a project's feed belongs, in a project that has nothing
 * there yet — no `ledger` folder, no `feed` under it and no file — which is
 * how `shall init` leaves it and what the first line has to cope with. The
 * path is assembled from `activityFileFor` so that these bytes land where the
 * daemon will put them.
 */
async function makeMonthPath(at = "2026-08-21T14:03:00.000Z"): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "shall-feed-"));
  roots.push(root);
  return path.join(root, ".shall", activityFileFor(at));
}

after(async () => {
  for (const root of roots) {
    await rm(root, { recursive: true, force: true });
  }
});

const LANDED: ActivityRecord = {
  at: "2026-08-21T14:03:00.000Z",
  kind: "raise_landed",
  refs: ["D-0014", "F-0031"],
  summary: "Landed: a decision and a finding",
};

const WORKED: ActivityRecord = {
  at: "2026-08-21T15:00:00.000Z",
  kind: "work_done",
  refs: ["J-0001", "WL-0003"],
  summary: "Turn finished — WorkLog 3, Evidence 4",
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

describe("the activity feed door", () => {
  test("a feed that is not there is an empty feed, and so is a folder that is not there", async () => {
    const file = await makeMonthPath();

    // Nothing at all yet: no `.shall`, no `ledger`, no `feed`, no month file.
    assert.deepEqual(await readActivity(file), { records: [], problem: null });

    // And the folder standing empty, which is what a project looks like after
    // somebody removed the month by hand.
    await mkdir(path.dirname(file), { recursive: true });
    assert.deepEqual(await readActivity(file), { records: [], problem: null });
  });

  test("the first record writes the month file, folder and all, in canonical bytes", async () => {
    const file = await makeMonthPath();

    await appendActivity(file, LANDED);
    assert.equal(await bytes(file), emitActivity([LANDED]));
    assert.equal(
      await bytes(file),
      '- at: "2026-08-21T14:03:00.000Z"\n  kind: raise_landed\n  refs: [D-0014, F-0031]\n  summary: "Landed: a decision and a finding"\n',
    );
    // The month file and nothing else — no `.tmp` left by the rename.
    assert.deepEqual(await beside(file), ["2026-08.yaml"]);
    assert.deepEqual(await readActivity(file), { records: [LANDED], problem: null });
  });

  test("a second record lands after the first, in the order they arrived", async () => {
    const file = await makeMonthPath();
    await appendActivity(file, WORKED);
    await appendActivity(file, LANDED);

    // Not byte order and not instant order: WORKED's instant is later and it
    // was written first, so it stands first. The file is the order written.
    const text = await bytes(file);
    assert.ok(text.startsWith('- at: "2026-08-21T15:00:00.000Z"\n  kind: work_done\n'), text);
    assert.equal(text, emitActivity([WORKED, LANDED]));
    assert.deepEqual((await readActivity(file)).records, [WORKED, LANDED]);
    assert.deepEqual(await beside(file), ["2026-08.yaml"]);
  });

  test("the same record twice is two lines, because two things happened", async () => {
    const file = await makeMonthPath();
    await appendActivity(file, LANDED);
    await appendActivity(file, LANDED);

    assert.deepEqual((await readActivity(file)).records, [LANDED, LANDED]);
    assert.equal(await bytes(file), emitActivity([LANDED, LANDED]));
  });

  test("two records racing both land and neither is lost", async () => {
    const file = await makeMonthPath();
    // Both read the file before either wrote it, without the queue.
    await Promise.all([
      appendActivity(file, LANDED),
      appendActivity(file, WORKED),
    ]);

    const reading = await readActivity(file);
    assert.equal(reading.problem, null);
    assert.deepEqual(reading.records, [LANDED, WORKED]);
    assert.deepEqual(await beside(file), ["2026-08.yaml"]);
  });

  test("two months are two files, and a write to one never waits on or touches the other", async () => {
    const august = await makeMonthPath("2026-08-21T14:03:00.000Z");
    const september = path.join(
      path.dirname(august),
      path.basename(activityFileFor("2026-09-01T00:00:00.000Z")),
    );
    const later: ActivityRecord = { ...WORKED, at: "2026-09-01T00:00:00.000Z" };

    await Promise.all([appendActivity(august, LANDED), appendActivity(september, later)]);

    assert.deepEqual((await readActivity(august)).records, [LANDED]);
    assert.deepEqual((await readActivity(september)).records, [later]);
    assert.deepEqual(await beside(august), ["2026-08.yaml", "2026-09.yaml"]);
  });

  test("a month nobody can read is never written over, and the refusal says so", async () => {
    for (const [junk, why] of [
      ["G-0001: {}\n", "The activity feed is a map, not a list of records."],
      [
        "- 3\n",
        "Every record in the activity feed is a map of at and kind as text, refs as a list, and summary as text — record 1 is not.",
      ],
      [
        "- at: x\n  kind: approve\n",
        'Record 1 in the activity feed has the kind "approve", which is none of specify_done, plan_done, work_done and raise_landed.',
      ],
    ] as const) {
      const file = await makeMonthPath();
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, junk, "utf8");

      const refused = await refusal(() => appendActivity(file, LANDED));
      assert.equal(refused.kind, "conflict");
      assert.equal(
        refused.message,
        `${why} Nothing was written over it — the ledger is Shall's own file, so restore it from git or move it aside.`,
      );

      // Byte for byte what it was: an unreadable month is the project's record
      // in a state this door cannot see, and rewriting it would bury the rest.
      assert.equal(await bytes(file), junk);
      assert.deepEqual(await beside(file), ["2026-08.yaml"]);
    }
  });

  test("a feed folder that is somehow a file is never written into, and the sentence says what stands there", async () => {
    for (const [standing, because] of [
      // `ledger/feed` is a file: the folder the month belongs in is taken.
      ["feed", "something already stands where a folder along its path would go"],
      // `ledger` is a file: the path to the folder runs through it.
      ["ledger", "something along its path is a file and not a folder"],
    ] as const) {
      const file = await makeMonthPath();
      const blocker =
        standing === "feed" ? path.dirname(file) : path.dirname(path.dirname(file));
      await mkdir(path.dirname(blocker), { recursive: true });
      await writeFile(blocker, "not a folder\n", "utf8");

      // Reads as no feed (ENOTDIR is absent), so the door reaches for the
      // folder and finds a file standing where it would go — a refusal with
      // the path in it, and the file left exactly as it was.
      assert.deepEqual(await readActivity(file), { records: [], problem: null });
      const answer = await refusal(() => appendActivity(file, LANDED));
      assert.deepEqual(answer, {
        kind: "conflict",
        message: `The activity feed at ${file} could not be written: ${because}.`,
      });
      assert.equal(await readFile(blocker, "utf8"), "not a folder\n");
    }
  });

  test("bytes that are not UTF-8 are a problem sentence and no records", async () => {
    const file = await makeMonthPath();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.from([0xff, 0xfe, 0xfd]));

    const reading = await readActivity(file);
    assert.equal(
      reading.problem,
      "The activity feed could not be read: it is not valid UTF-8 text.",
    );
    assert.deepEqual(reading.records, []);

    // And the door will not write over it either, in the same words.
    const refused = await refusal(() => appendActivity(file, LANDED));
    assert.equal(refused.kind, "conflict");
    assert.equal(
      refused.message,
      "The activity feed could not be read: it is not valid UTF-8 text. Nothing was written over it — the ledger is Shall's own file, so restore it from git or move it aside.",
    );
    assert.deepEqual(await readFile(file), Buffer.from([0xff, 0xfe, 0xfd]));
  });

  test("a feed written and read back is the same list", async () => {
    const file = await makeMonthPath();
    const records: readonly ActivityRecord[] = [
      {
        at: "2026-08-21T09:00:00.000Z",
        kind: "specify_done",
        refs: [],
        summary: "Specification drawn out — Goal 2, UC 3, REQ 8, AC 12",
      },
      {
        at: "2026-08-21T10:00:00.000Z",
        kind: "plan_done",
        refs: ["MD-0001", "MD-0002"],
        summary: "Modules designed — MD 2, task 6",
      },
      {
        at: "2026-08-21T11:00:00.000Z",
        kind: "work_done",
        refs: ["J-0001"],
        summary: "Turn finished — WorkLog 3, Evidence 4",
      },
      {
        at: "2026-08-21T12:00:00.000Z",
        kind: "raise_landed",
        refs: ["D-0001", "F-0001"],
        summary: "Landed: a decision and a finding",
      },
      // A ref that reads as a number, which the emitter quotes inside the flow
      // sequence and the reader hands back as the string it is.
      {
        at: "2026-08-21T14:03:00.000Z",
        kind: "work_done",
        refs: ["1234", "R-0014"],
        summary: "Turn finished — WorkLog 1",
      },
    ];
    for (const record of records) {
      await appendActivity(file, record);
    }

    const reading = await readActivity(file);
    assert.equal(reading.problem, null);
    assert.deepEqual(reading.records, records);
    assert.equal(await bytes(file), emitActivity(records));
    assert.deepEqual(await beside(file), ["2026-08.yaml"]);
  });
});
