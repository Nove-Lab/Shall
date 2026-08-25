import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, describe, test } from "node:test";
import { SHALL_VERSION } from "@shall/core/version";
import { isNewer, latestRelease, upgradeNotice } from "./release.js";

/**
 * The release lookup, asked of a server on this machine.
 *
 * NOTHING HERE REACHES GITHUB. The base is an argument to every function in
 * `release.ts`, so the whole of what ships — the request, the shapes it accepts,
 * the comparison and the sentence — runs against a few lines of `node:http` that
 * answer whatever a test told them to.
 *
 * THE CLAIMS ARE ABOUT WHAT IS REFUSED as much as about what is accepted. A
 * notice is unsolicited: a person who did not ask about versions is being
 * interrupted, so every shape that is not plainly a newer release has to end in
 * silence — a refusal, a body that is not one, a tag nobody can read, a network
 * that is too slow to matter.
 */

/** The one path Shall asks for, so a request to any other is a failed test. */
const LATEST = "/repos/Nove-Lab/Shall/releases/latest";

/** What the stand-in answers with, and how long it takes about it. */
let serving: { status: number; body: string; delay: number } = {
  status: 200,
  body: "{}",
  delay: 0,
};

/** Every path that was asked for, in order. */
const asked: string[] = [];

const server = createServer((request, response) => {
  asked.push(request.url ?? "");
  const answer = (): void => {
    response.on("error", () => {
      // A client that gave up on a slow answer: the point of that test.
    });
    response.writeHead(serving.status, { "content-type": "application/json" });
    response.end(serving.body);
  };
  if (serving.delay > 0) {
    setTimeout(answer, serving.delay).unref();
    return;
  }
  answer();
});

const base = await new Promise<string>((resolve) => {
  server.listen(0, "127.0.0.1", () =>
    resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
  );
});

after(() => {
  server.closeAllConnections();
  server.close();
});

/** What the stand-in will answer next; a body that is not a string is JSON. */
function answering(
  body: unknown,
  over: { status?: number; delay?: number } = {},
): void {
  serving = {
    status: over.status ?? 200,
    body: typeof body === "string" ? body : JSON.stringify(body),
    delay: over.delay ?? 0,
  };
}

/** A release as GitHub answers for one, with whatever assets it was given. */
function release(
  tag: string,
  assets: readonly { name: string; url: string }[] = [],
): unknown {
  return {
    tag_name: tag,
    assets: assets.map((asset) => ({
      name: asset.name,
      browser_download_url: asset.url,
    })),
  };
}

/** A semver two places above this one, whatever this one is. */
function later(): string {
  const [major = "0"] = SHALL_VERSION.split(".");
  return `${Number(major) + 1}.0.0`;
}

describe("which release is newer", () => {
  for (const [candidate, current, expected] of [
    ["0.2.0", "0.1.0", true],
    ["v0.2.0", "0.1.0", true],
    ["1.0.0", "0.99.99", true],
    ["0.1.1", "0.1.0", true],
    ["0.1.0", "0.1.0", false],
    ["0.0.9", "0.1.0", false],
    ["0.2.0-rc1", "0.1.0", false],
    ["nightly", "0.1.0", false],
    ["0.2.0", "not-a-version", false],
  ] as const) {
    test(`${candidate} over ${current} is ${expected}`, () => {
      assert.equal(isNewer(candidate, current), expected);
    });
  }
});

describe("asking what the newest Shall is", () => {
  test("a release arrives as its number and its assets, by name", async () => {
    answering(
      release("v9.9.9", [
        { name: "shall-darwin-arm64", url: `${base}/one` },
        { name: "SHA256SUMS", url: `${base}/sums` },
      ]),
    );

    const found = await latestRelease(2_000, base);

    assert.equal(found?.version, "9.9.9");
    assert.deepEqual(
      [...(found?.assets ?? [])],
      [
        ["shall-darwin-arm64", `${base}/one`],
        ["SHA256SUMS", `${base}/sums`],
      ],
    );
    // The one path there is, and no second request behind it.
    assert.equal(asked.at(-1), LATEST);
  });

  test("an asset that is not a name and a url is dropped, and the rest stand", async () => {
    answering({
      tag_name: "9.9.9",
      assets: [
        { name: "shall-linux-x64" },
        { browser_download_url: `${base}/nameless` },
        7,
        null,
        { name: "SHA256SUMS", browser_download_url: `${base}/sums` },
      ],
    });

    const found = await latestRelease(2_000, base);

    assert.deepEqual([...(found?.assets ?? [])], [["SHA256SUMS", `${base}/sums`]]);
  });

  for (const [what, body, over] of [
    ["a refusal", release("9.9.9"), { status: 403 }],
    ["a body that is not JSON", "{", {}],
    ["a body with no tag on it", { assets: [] }, {}],
    ["a tag that is not a string", { tag_name: 9 }, {}],
  ] as const) {
    test(`${what} is no release at all`, async () => {
      answering(body, over);

      assert.equal(await latestRelease(2_000, base), null);
    });
  }

  test("an answer that outlasts the wait is no release at all", async () => {
    answering(release("9.9.9"), { delay: 400 });

    assert.equal(await latestRelease(40, base), null);
  });

  test("a door nobody is behind is no release at all", async () => {
    // Port 1 on loopback: nothing listens there, so the request fails outright
    // rather than slowly, which is the machine-with-no-network case.
    assert.equal(await latestRelease(2_000, "http://127.0.0.1:1"), null);
  });
});

describe("the notice", () => {
  test("a newer release is one line naming it and the command", async () => {
    answering(release(`v${later()}`));

    assert.equal(
      await upgradeNotice(2_000, base),
      `Shall ${later()} is out — run shall upgrade.`,
    );
  });

  test("the release this Shall already is says nothing", async () => {
    answering(release(SHALL_VERSION));

    assert.equal(await upgradeNotice(2_000, base), null);
  });

  test("a release older than this one says nothing", async () => {
    answering(release("0.0.1"));

    assert.equal(await upgradeNotice(2_000, base), null);
  });

  for (const [what, body, over] of [
    ["a refusal", release("99.0.0"), { status: 500 }],
    ["a body that is not a release", "not json at all", {}],
  ] as const) {
    test(`${what} says nothing`, async () => {
      answering(body, over);

      assert.equal(await upgradeNotice(2_000, base), null);
    });
  }
});
