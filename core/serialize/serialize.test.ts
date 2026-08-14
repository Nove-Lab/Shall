import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseDocument } from "yaml";
import { NODE_TYPES, attributesFor, type SpecEdge } from "../graph/index.js";
import { emitNodeFile } from "./emit.js";
import { parseNodeFile } from "./parse.js";
import { emitScalar, isPlainSafe } from "./scalar.js";
import { emitTemplate } from "./template.js";
import { isCanonical } from "./index.js";

/**
 * The file format, held as goldens.
 *
 * These bytes go into other people's git history. A quoting rule discovered to
 * be wrong six months from now is not a bug fix, it is a rewrite of files a
 * person has already committed and reviewed — so the expected bytes are written
 * out here in full rather than computed the way the emitter computes them,
 * which would agree with any rule at all.
 *
 * THE SCALAR CORPUS IS CHECKED TWICE. Once against the frozen predicate, and
 * once against the `yaml` package itself: every emitted scalar is read back and
 * must equal the string that went in. The first check says the rule is what we
 * think it is; the second says the rule is true.
 */

// Written as codes rather than as characters so that what this file says and
// what it holds cannot drift apart in an editor that renders one of them.
const NEXT_LINE = String.fromCharCode(0x85);
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
const BOM = String.fromCharCode(0xfeff);
const DEL = String.fromCharCode(0x7f);
const SPACE = " ";

/**
 * What a `line` value may not hold — the class `core/graph/validate.ts` refuses,
 * built from character codes so that this file and that one can be read against
 * each other without trusting an editor to render six invisible characters.
 */
const LINE_BREAK = new RegExp(
  `[\\n\\r\\u000B\\u000C${NEXT_LINE}${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}]`,
);

/**
 * The reader, stated a second time on purpose. `parse.ts` fixes these options
 * for the daemon; this states them independently, so that a test agreeing with
 * the emitter is not the same thing as a test agreeing with itself.
 */
function readBack(emitted: string): unknown {
  const document = parseDocument(`x: ${emitted}`, {
    version: "1.2",
    schema: "core",
    uniqueKeys: true,
    prettyErrors: false,
    logLevel: "silent",
  });
  assert.deepEqual(
    document.errors.map((error) => error.message),
    [],
    `the emitted scalar ${JSON.stringify(emitted)} is not YAML`,
  );
  const parsed: unknown = document.toJS();
  assert.ok(
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed),
  );
  return (parsed as Record<string, unknown>)["x"];
}

/**
 * The same value through a YAML 1.1 reader, which is the audience the emitter
 * claims to write for and the one our own pinned reader is not. `1.1` selects
 * the 1.1 schema as well as the version, so `Yes` is a boolean and `12:30` is
 * seven hundred and fifty here — everything the quoting rule exists to keep out
 * of a plain scalar.
 */
function readBackAsYaml11(emitted: string): unknown {
  const document = parseDocument(`x: ${emitted}`, {
    version: "1.1",
    prettyErrors: false,
    logLevel: "silent",
  });
  assert.deepEqual(
    document.errors.map((error) => error.message),
    [],
    `the emitted scalar ${JSON.stringify(emitted)} is not YAML 1.1`,
  );
  const parsed: unknown = document.toJS();
  assert.ok(
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed),
  );
  return (parsed as Record<string, unknown>)["x"];
}

/** One corpus entry: the value, and whether the frozen rule leaves it unquoted. */
interface ScalarCase {
  readonly value: string;
  readonly plain: boolean;
  readonly why: string;
}

const SCALARS: readonly ScalarCase[] = [
  // Ordinary text, which is what almost every value is.
  { value: "checkout-happy", plain: true, why: "a short name" },
  { value: "Checkout succeeds with a saved card", plain: true, why: "a sentence" },
  { value: "결제하기", plain: true, why: "Korean is text like any other" },
  { value: "🚀 ship it", plain: true, why: "an emoji is not an indicator" },
  { value: "a#b", plain: true, why: "a hash only comments after a space" },
  { value: "a:b", plain: true, why: "a colon only maps before a space" },
  { value: "50% of the time", plain: true, why: "a percent only matters first" },
  { value: "e-mail@example.com", plain: true, why: "an at-sign only matters first" },
  { value: "v2026-08-14", plain: true, why: "not opening with a year" },
  { value: "0x1Ag", plain: true, why: "not a hexadecimal number" },
  { value: "TRUE STORY", plain: true, why: "not the word true alone" },
  { value: 'say "hi"', plain: true, why: "a quote only quotes at the front" },
  { value: "back\\slash", plain: true, why: "a backslash is literal when plain" },
  { value: "a: back\\slash", plain: false, why: "quoted, so the backslash escapes" },

  // Values that read as something other than a string.
  { value: "true", plain: false, why: "a boolean" },
  { value: "Yes", plain: false, why: "a boolean in YAML 1.1, cased freely" },
  { value: "n", plain: false, why: "a boolean in YAML 1.1, one letter" },
  { value: "off", plain: false, why: "a boolean in YAML 1.1" },
  { value: "~", plain: false, why: "null" },
  { value: "null", plain: false, why: "null" },
  { value: "NULL", plain: false, why: "null, cased freely" },
  { value: ".inf", plain: false, why: "an infinity" },
  { value: "-.NaN", plain: false, why: "a not-a-number, signed and cased" },
  { value: "42", plain: false, why: "an integer" },
  { value: "+42", plain: false, why: "a signed integer" },
  { value: "0x1A", plain: false, why: "hexadecimal" },
  { value: "0o17", plain: false, why: "octal, YAML 1.2" },
  { value: "017", plain: false, why: "octal, YAML 1.1" },
  { value: "0b1010", plain: false, why: "binary, YAML 1.1" },
  { value: "1_000", plain: false, why: "a thousand, YAML 1.1" },
  { value: "12:30", plain: false, why: "sexagesimal, YAML 1.1" },
  { value: "1:30.5", plain: false, why: "a sexagesimal float, YAML 1.1" },
  { value: "1e10", plain: false, why: "a float" },
  { value: ".5", plain: false, why: "a float with no whole part" },
  // YAML 1.1's float grammar makes every part before the exponent optional, so
  // these three are numbers — NaN, in fact — to a 1.1 reader, and they are the
  // family the 1.2-shaped rule used to wave through.
  { value: "e10", plain: false, why: "a float with no mantissa, YAML 1.1" },
  { value: ".", plain: false, why: "a float that is only a point, YAML 1.1" },
  { value: "+.", plain: false, why: "a signed point, YAML 1.1" },
  { value: "2026-08-14", plain: false, why: "timestamp-shaped" },
  { value: "2026-8-4 release", plain: false, why: "opens timestamp-shaped" },

  // Values whose first character means something to YAML.
  { value: "- dash", plain: false, why: "opens a sequence entry" },
  { value: "@handle", plain: false, why: "reserved" },
  { value: "`backtick", plain: false, why: "reserved" },
  { value: "#hash", plain: false, why: "opens a comment" },
  { value: "? question", plain: false, why: "opens an explicit key" },
  { value: ": colon", plain: false, why: "opens a value" },
  { value: ", comma", plain: false, why: "a flow separator" },
  { value: "[bracket", plain: false, why: "opens a flow sequence" },
  { value: "]bracket", plain: false, why: "closes a flow sequence" },
  { value: "{brace", plain: false, why: "opens a flow mapping" },
  { value: "}brace", plain: false, why: "closes a flow mapping" },
  { value: "&anchor", plain: false, why: "names an anchor" },
  { value: "*alias", plain: false, why: "names an alias" },
  { value: "!bang", plain: false, why: "opens a tag" },
  { value: "|pipe", plain: false, why: "opens a literal block" },
  { value: ">fold", plain: false, why: "opens a folded block" },
  { value: "'quote", plain: false, why: "opens a single-quoted scalar" },
  { value: '"quote', plain: false, why: "opens a double-quoted scalar" },
  { value: "%percent", plain: false, why: "opens a directive" },
  { value: "---", plain: false, why: "a document start, and a dash first" },

  // Values whose interior or end means something.
  { value: "a: b", plain: false, why: "would open a nested mapping" },
  { value: "a #b", plain: false, why: "would open a comment" },
  { value: "trailing:", plain: false, why: "would read as a key" },
  { value: `trailing${SPACE}`, plain: false, why: "a plain scalar loses it" },
  { value: `${SPACE}leading`, plain: false, why: "a plain scalar loses it" },

  // Characters a file should not carry literally.
  { value: `line${LINE_SEPARATOR}separator`, plain: false, why: "a 1.1 line break" },
  { value: `next${NEXT_LINE}line`, plain: false, why: "a 1.1 line break" },
  { value: `mark${BOM}here`, plain: false, why: "an encoding announcement" },
  { value: `del${DEL}here`, plain: false, why: "not printable" },
  { value: "tab\there", plain: false, why: "a tab is a control character" },
];

describe("emitScalar", () => {
  test("the frozen predicate answers the whole corpus as written down", () => {
    for (const entry of SCALARS) {
      assert.equal(
        isPlainSafe(entry.value),
        entry.plain,
        `${JSON.stringify(entry.value)} — ${entry.why}`,
      );
    }
  });

  test("every emitted scalar reads back as the string that went in", () => {
    for (const entry of SCALARS) {
      assert.equal(
        readBack(emitScalar(entry.value)),
        entry.value,
        `${JSON.stringify(entry.value)} — ${entry.why}`,
      );
    }
  });

  test("every emitted scalar reads back as itself under YAML 1.1 as well", () => {
    // The module's stated rule is that it judges against 1.1 and 1.2 AT ONCE,
    // because a file in a repository is read by whatever the repository is
    // checked out next to. This is the half of that claim our own reader cannot
    // make: under 1.2 core, `e10` and `.` are strings whatever we do, and under
    // 1.1 they are NaN unless the emitter quotes them.
    for (const entry of SCALARS) {
      assert.equal(
        readBackAsYaml11(emitScalar(entry.value)),
        entry.value,
        `${JSON.stringify(entry.value)} — ${entry.why}`,
      );
    }
  });

  test("a plain value is emitted as itself, byte for byte", () => {
    assert.equal(emitScalar("결제하기"), "결제하기");
    assert.equal(emitScalar("a#b"), "a#b");
  });

  test("a quoted value is JSON's quoting", () => {
    assert.equal(emitScalar("a: b"), '"a: b"');
    assert.equal(emitScalar("true"), '"true"');
    assert.equal(emitScalar('"leading quote'), '"\\"leading quote"');
    // A backslash means nothing plain and everything quoted, so it only has to
    // be escaped once something else has forced the quotation marks.
    assert.equal(emitScalar("back\\slash"), "back\\slash");
    assert.equal(emitScalar("a: back\\slash"), '"a: back\\\\slash"');
  });

  test("the characters JSON leaves literal are escaped after it", () => {
    assert.equal(emitScalar(`a${LINE_SEPARATOR}b`), '"a\\u2028b"');
    assert.equal(emitScalar(`a${NEXT_LINE}b`), '"a\\u0085b"');
    assert.equal(emitScalar(`a${BOM}b`), '"a\\ufeffb"');
    assert.equal(emitScalar(`a${DEL}b`), '"a\\u007fb"');
    assert.equal(emitScalar(String.fromCharCode(0x9f)), '"\\u009f"');
  });

  test("an empty value is quoted, though no door lets one through", () => {
    assert.equal(emitScalar(""), '""');
  });
});

/** The contract's own example, and the shape every other golden is read against. */
const SCENARIO = `---
short_name: checkout-happy
name: Checkout succeeds with a saved card
scenario_type: main
edges:
  - type: HAS_CRITERION
    to: AC-0004
  - type: MENTIONS
    to: T-0001
---

## Preconditions

The cart holds at least one item and the shopper has a saved card.

## Steps

1. The shopper opens the cart and chooses 결제하기.
2. The system charges the saved card.

## Postconditions

An order exists and the cart is empty.
`;

const SCENARIO_NODE = {
  shortName: "checkout-happy",
  name: "Checkout succeeds with a saved card",
  attributes: {
    scenario_type: "main",
    preconditions:
      "The cart holds at least one item and the shopper has a saved card.",
    steps:
      "1. The shopper opens the cart and chooses 결제하기.\n2. The system charges the saved card.",
    postconditions: "An order exists and the cart is empty.",
  },
};

describe("emitNodeFile", () => {
  test("writes the canonical file, byte for byte", () => {
    assert.equal(
      emitNodeFile("Scenario", SCENARIO_NODE, [
        { type: "MENTIONS", toId: "T-0001" },
        { type: "HAS_CRITERION", toId: "AC-0004" },
      ]),
      SCENARIO,
    );
  });

  test("sorts edges by type and then by target, whatever order it is handed", () => {
    const sorted = emitNodeFile("Requirement", MINIMAL_REQUIREMENT, [
      { type: "MENTIONS", toId: "T-0002" },
      { type: "HAS_CRITERION", toId: "AC-0002" },
      { type: "MENTIONS", toId: "T-0001" },
      { type: "HAS_CRITERION", toId: "AC-0001" },
    ]);
    assert.equal(
      sorted,
      `---
short_name: id-door
name: The daemon refuses a malformed id
statement: The daemon refuses a malformed id.
requirement_type: functional
priority: high
edges:
  - type: HAS_CRITERION
    to: AC-0001
  - type: HAS_CRITERION
    to: AC-0002
  - type: MENTIONS
    to: T-0001
  - type: MENTIONS
    to: T-0002
---

## Description

Every door judges the id before it judges anything else.
`,
    );
  });

  test("does not reorder the caller's own array", () => {
    const edges = [
      { type: "MENTIONS", toId: "T-0002" },
      { type: "HAS_CRITERION", toId: "AC-0001" },
    ];
    emitNodeFile("Requirement", MINIMAL_REQUIREMENT, edges);
    assert.equal(edges[0]?.type, "MENTIONS");
  });

  test("omits the edges key entirely when there are none", () => {
    const text = emitNodeFile("Requirement", MINIMAL_REQUIREMENT, []);
    assert.equal(text.includes("edges"), false);
  });

  test("a node with no filled prose ends at the closing fence", () => {
    const text = emitNodeFile(
      "Commit",
      { shortName: "first", name: "The first commit", attributes: { sha: "0x1A" } },
      [],
    );
    assert.equal(
      text,
      `---
short_name: first
name: The first commit
sha: "0x1A"
---
`,
    );
  });

  test("an unfilled slot is an absent key, never an empty one", () => {
    const text = emitNodeFile(
      "Constraint",
      {
        shortName: "no-fonts",
        name: "No third-party fonts",
        attributes: {
          statement: "The panel loads no font it did not ship.",
          description: "The panel ships every font it uses.",
          constraint_type: "security",
          applies_when: "",
        },
      },
      [],
    );
    assert.equal(text.includes("applies_when"), false);
    assert.equal(text.includes("Rationale"), false);
  });

  test("refuses a type the canon does not have, loudly", () => {
    assert.throws(
      () => emitNodeFile("Sandwich", MINIMAL_REQUIREMENT, []),
      /Unknown node type: Sandwich/,
    );
  });
});

const MINIMAL_REQUIREMENT = {
  shortName: "id-door",
  name: "The daemon refuses a malformed id",
  attributes: {
    statement: "The daemon refuses a malformed id.",
    description: "Every door judges the id before it judges anything else.",
    requirement_type: "functional",
    priority: "high",
  },
};

/** The round-trip fixture: one optional line slot and one optional section, both empty. */
const CONSTRAINT = `---
short_name: no-third-party-fonts
name: The panel loads no third-party fonts
statement: The panel loads no font it did not ship.
constraint_type: security
edges:
  - type: MENTIONS
    to: T-0001
  - type: MENTIONS
    to: T-0002
---

## Description

The panel ships every font it uses.
`;

function byId(edges: readonly SpecEdge[]): readonly SpecEdge[] {
  return [...edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function readConstraint(text: string) {
  const reading = parseNodeFile("Constraint", "C-0001.md", text);
  assert.deepEqual(reading.problems, []);
  return reading;
}

describe("parseNodeFile round trip", () => {
  test("canonicalization is a fixpoint", () => {
    for (const [label, text] of [
      ["the contract's own example", SCENARIO],
      ["the round-trip fixture", CONSTRAINT],
    ] as const) {
      const reading = parseNodeFile(
        label === "the round-trip fixture" ? "Constraint" : "Scenario",
        "X-0001.md",
        text,
      );
      assert.deepEqual(reading.problems, [], label);
      assert.ok(reading.node !== undefined);
      assert.equal(
        emitNodeFile(reading.node.type, reading.node, reading.edges),
        text,
        label,
      );
    }
  });

  test("a section that opens with an indented code block survives a round trip", () => {
    // The reason the door strips blank lines instead of trimming: a trim would
    // dedent the first line alone, and the file would stop being its own answer.
    const text = `---
short_name: indented-block
name: A section that opens with a code block
scenario_type: main
---

## Preconditions

    const x = 1;
    const y = 2;

## Steps

Ordinary text.

## Postconditions

Done.
`;
    const reading = parseNodeFile("Scenario", "SC-0002.md", text);
    assert.deepEqual(reading.problems, []);
    assert.ok(reading.node !== undefined);
    assert.equal(
      reading.node.attributes["preconditions"],
      "    const x = 1;\n    const y = 2;",
    );
    assert.equal(
      emitNodeFile(reading.node.type, reading.node, reading.edges),
      text,
    );
    assert.equal(isCanonical("Scenario", "SC-0002.md", text), true);
  });

  test("recovers the node exactly, minus what the path supplies", () => {
    const reading = parseNodeFile("Scenario", "SC-0001.md", SCENARIO);
    assert.deepEqual(reading.node, {
      id: "SC-0001",
      type: "Scenario",
      ...SCENARIO_NODE,
    });
    assert.deepEqual(reading.edges, [
      {
        id: "SC-0001 HAS_CRITERION AC-0004",
        type: "HAS_CRITERION",
        fromId: "SC-0001",
        toId: "AC-0004",
      },
      {
        id: "SC-0001 MENTIONS T-0001",
        type: "MENTIONS",
        fromId: "SC-0001",
        toId: "T-0001",
      },
    ]);
  });

  test("every tolerated way of writing the same file parses to the same node", () => {
    const canonical = readConstraint(CONSTRAINT);
    const variants: readonly (readonly [string, string])[] = [
      ["comments", CONSTRAINT.replace("short_name:", "# a note\nshort_name:")],
      [
        "a trailing comment on a value",
        CONSTRAINT.replace("security", "security  # the twelfth vocabulary"),
      ],
      [
        "single quotes",
        CONSTRAINT.replace(
          "name: The panel loads no third-party fonts",
          "name: 'The panel loads no third-party fonts'",
        ),
      ],
      [
        "double quotes",
        CONSTRAINT.replace("constraint_type: security", 'constraint_type: "security"'),
      ],
      [
        "keys in another order",
        `---
constraint_type: security
name: The panel loads no third-party fonts
statement: The panel loads no font it did not ship.
short_name: no-third-party-fonts
edges:
  - type: MENTIONS
    to: T-0001
  - type: MENTIONS
    to: T-0002
---

## Description

The panel ships every font it uses.
`,
      ],
      [
        "unsorted edges",
        CONSTRAINT.replace(
          "    to: T-0001\n  - type: MENTIONS\n    to: T-0002",
          "    to: T-0002\n  - type: MENTIONS\n    to: T-0001",
        ),
      ],
      [
        "an edge entry with its keys the other way round",
        CONSTRAINT.replace(
          "  - type: MENTIONS\n    to: T-0001",
          "  - to: T-0001\n    type: MENTIONS",
        ),
      ],
      ["CRLF", CONSTRAINT.replace(/\n/g, "\r\n")],
      ["a lone CR", CONSTRAINT.replace(/\n/g, "\r")],
      ["a byte-order mark", `${BOM}${CONSTRAINT}`],
      ["no final newline", CONSTRAINT.trimEnd()],
      [
        "extra blank lines",
        CONSTRAINT.replace("## Description", "\n## Description").replace(
          "uses.\n",
          "uses.\n\n\n",
        ),
      ],
      [
        "a carried key left empty",
        CONSTRAINT.replace("constraint_type: security", "constraint_type: security\napplies_when:"),
      ],
      [
        "a carried key written as null",
        CONSTRAINT.replace("constraint_type: security", "constraint_type: security\napplies_when: ~"),
      ],
      [
        "a carried section left empty",
        `${CONSTRAINT}\n## Rationale\n`,
      ],
      [
        "no blank line after the fence",
        CONSTRAINT.replace("---\n\n## Description", "---\n## Description"),
      ],
      [
        "sections in another order",
        `---
short_name: no-third-party-fonts
name: The panel loads no third-party fonts
statement: The panel loads no font it did not ship.
constraint_type: security
edges:
  - type: MENTIONS
    to: T-0001
  - type: MENTIONS
    to: T-0002
---

## Rationale

## Description

The panel ships every font it uses.
`,
      ],
    ];

    for (const [label, text] of variants) {
      const reading = readConstraint(text);
      assert.deepEqual(reading.node, canonical.node, label);
      // Sorted before comparing, because one of the variants lists its edges
      // the other way round: the file's order is the file's, and the emitter is
      // where the one true order is settled.
      assert.deepEqual(byId(reading.edges), byId(canonical.edges), label);
      assert.ok(reading.node !== undefined);
      assert.equal(
        emitNodeFile("Constraint", reading.node, reading.edges),
        CONSTRAINT,
        label,
      );
      assert.equal(isCanonical("Constraint", "C-0001.md", text), false, label);
    }
  });

  test("a written-out empty edges list reads as no edges, and is rewritten away", () => {
    const withoutEdges = CONSTRAINT.replace(
      "edges:\n  - type: MENTIONS\n    to: T-0001\n  - type: MENTIONS\n    to: T-0002\n",
      "",
    );
    for (const written of ["edges: []", "edges:", "edges: ~"]) {
      const text = withoutEdges.replace(
        "constraint_type: security",
        `constraint_type: security\n${written}`,
      );
      const reading = readConstraint(text);
      assert.deepEqual(reading.edges, [], written);
      assert.ok(reading.node !== undefined);
      assert.equal(
        emitNodeFile("Constraint", reading.node, reading.edges),
        withoutEdges,
        written,
      );
    }
  });

  test("neither the id nor the type is written into the file", () => {
    const text = emitNodeFile("Scenario", SCENARIO_NODE, [
      { type: "MENTIONS", toId: "T-0001" },
    ]);
    assert.equal(
      text.split("\n").some((line) => /^(id|type):/.test(line)),
      false,
    );
  });

  test("every corpus value survives a whole file, wherever a door would let it in", () => {
    // The identity fields refuse the C-class controls and nothing else, so a
    // U+2028 reaches the frontmatter through a name and has to come back out of
    // it; a `line` attribute additionally refuses every line break, which is
    // why the two loops filter differently. Both compare against the TRIMMED
    // value, because trimming is the door's and happens on the way in.
    for (const entry of SCALARS) {
      const value = entry.value.trim();
      if (value === "" || /\p{Cc}/u.test(value)) {
        continue;
      }
      const written = emitNodeFile(
        "Commit",
        { shortName: value, name: value, attributes: { sha: "0x1A" } },
        [],
      );
      const reading = parseNodeFile("Commit", "CM-0001.md", written);
      assert.deepEqual(reading.problems, [], JSON.stringify(entry.value));
      assert.equal(reading.node?.shortName, value, JSON.stringify(entry.value));
      assert.equal(reading.node?.name, value, JSON.stringify(entry.value));
      assert.equal(isCanonical("Commit", "CM-0001.md", written), true);
    }

    for (const entry of SCALARS) {
      const value = entry.value.trim();
      if (value === "" || LINE_BREAK.test(value)) {
        continue;
      }
      const written = emitNodeFile(
        "Commit",
        { shortName: "first", name: "The first commit", attributes: { sha: value } },
        [],
      );
      const reading = parseNodeFile("Commit", "CM-0001.md", written);
      assert.deepEqual(reading.problems, [], JSON.stringify(entry.value));
      assert.equal(
        reading.node?.attributes["sha"],
        value,
        JSON.stringify(entry.value),
      );
      assert.equal(isCanonical("Commit", "CM-0001.md", written), true);
    }
  });

  test("an id that reads as a number is quoted where an edge names it", () => {
    const written = emitNodeFile("Requirement", MINIMAL_REQUIREMENT, [
      { type: "MENTIONS", toId: "0x1A" },
    ]);
    assert.equal(written.includes('to: "0x1A"'), true);
    const reading = parseNodeFile("Requirement", "R-0001.md", written);
    assert.deepEqual(reading.problems, []);
    assert.equal(reading.edges[0]?.toId, "0x1A");
  });

  test("the canonical file is the one that answers to isCanonical", () => {
    assert.equal(isCanonical("Constraint", "C-0001.md", CONSTRAINT), true);
    assert.equal(isCanonical("Scenario", "SC-0001.md", SCENARIO), true);
  });

  test("a file that cannot be read is not canonical either", () => {
    assert.equal(isCanonical("Scenario", "SC-0001.md", "no frontmatter here"), false);
  });

  test("a quoted value that had to be quoted survives the trip", () => {
    const written = emitNodeFile(
      "Commit",
      {
        shortName: "true",
        name: `a: b`,
        attributes: { sha: "0x1A", message: "12:30 and 1_000" },
      },
      [],
    );
    const reading = parseNodeFile("Commit", "CM-0001.md", written);
    assert.deepEqual(reading.problems, []);
    assert.equal(reading.node?.shortName, "true");
    assert.equal(reading.node?.name, "a: b");
    assert.equal(reading.node?.attributes["sha"], "0x1A");
    assert.equal(emitNodeFile("Commit", reading.node!, []), written);
  });
});

describe("prose", () => {
  function withSteps(steps: string): string {
    return `---
short_name: checkout-happy
name: Checkout succeeds with a saved card
scenario_type: main
---

## Preconditions

A cart.

## Steps

${steps}

## Postconditions

An order.
`;
  }

  function stepsOf(text: string): string | undefined {
    const reading = parseNodeFile("Scenario", "SC-0001.md", text);
    assert.deepEqual(reading.problems, []);
    return reading.node?.attributes["steps"];
  }

  test("a horizontal rule inside prose is prose", () => {
    assert.equal(stepsOf(withSteps("one\n\n---\n\ntwo")), "one\n\n---\n\ntwo");
  });

  test("a deeper heading inside prose is prose", () => {
    assert.equal(stepsOf(withSteps("### A sub-heading\n\ntext")), "### A sub-heading\n\ntext");
  });

  test("a code fence inside prose is prose", () => {
    const fenced = "```ts\nconst x = 1;\n```";
    assert.equal(stepsOf(withSteps(fenced)), fenced);
  });

  test("a hash pair with no space after it is not a section", () => {
    // The door's rule and the split's rule are the same rule, so a line the
    // reader keeps as prose is a line the door would have allowed.
    const notHeadings = "##not a heading\n\n##";
    assert.equal(stepsOf(withSteps(notHeadings)), notHeadings);
  });

  test("blank lines inside prose are kept", () => {
    assert.equal(stepsOf(withSteps("one\n\n\n\ntwo")), "one\n\n\n\ntwo");
  });

  test("trailing spaces inside prose are kept, because markdown means them", () => {
    const hardBreak = `one${SPACE}${SPACE}\ntwo`;
    const text = withSteps(hardBreak);
    assert.equal(stepsOf(text), hardBreak);
    // And they survive the write, which is what makes them worth keeping.
    const reading = parseNodeFile("Scenario", "SC-0001.md", text);
    assert.ok(reading.node !== undefined);
    assert.equal(
      emitNodeFile("Scenario", reading.node, []).includes(hardBreak),
      true,
    );
  });

  test('a "## " line inside a code fence is still a section, because there is no escape', () => {
    const reading = parseNodeFile(
      "Scenario",
      "SC-0001.md",
      withSteps("```\n## Not a heading\n```"),
    );
    assert.deepEqual(reading.problems, [
      'A Scenario does not carry "## Not a heading". It carries "## Preconditions", "## Steps", "## Postconditions" and nothing else.',
    ]);
  });

  test('a "## " line a file can smuggle past the split is refused by the door', () => {
    // U+2028 is a line break to a screen and not to a file, so this arrives as
    // one line and is still a value that would come back as two attributes.
    const reading = parseNodeFile(
      "Scenario",
      "SC-0001.md",
      withSteps(`one${LINE_SEPARATOR}## two`),
    );
    assert.deepEqual(reading.problems, [
      'Steps cannot contain a line that begins with "## " — that is how a spec file names its sections.',
    ]);
  });
});

/** Every sentence the reader can serve, written out. */
function problemsOf(type: string, fileName: string, text: string): readonly string[] {
  return parseNodeFile(type, fileName, text).problems;
}

const GOOD_SCENARIO_HEAD = `---
short_name: checkout-happy
name: Checkout succeeds with a saved card
scenario_type: main
---

## Preconditions

A cart.

## Steps

One step.

## Postconditions

An order.
`;

describe("the refusals", () => {
  test("a file that does not open with a fence", () => {
    assert.deepEqual(problemsOf("Question", "Q-0002.md", "just some notes\n"), [
      'Q-0002.md does not begin with a "---" frontmatter block, so it cannot be read as a spec node.',
    ]);
  });

  test("a fence that never closes", () => {
    assert.deepEqual(problemsOf("Question", "Q-0002.md", "---\nname: x\n"), [
      'Q-0002.md does not begin with a "---" frontmatter block, so it cannot be read as a spec node.',
    ]);
  });

  test("frontmatter that is not YAML", () => {
    assert.deepEqual(
      problemsOf("Scenario", "SC-0001.md", "---\nname: a\nname: b\n---\n"),
      [
        "The frontmatter is not YAML the daemon can read: Map keys must be unique.",
      ],
    );
  });

  test("frontmatter that is not a map", () => {
    assert.deepEqual(
      problemsOf("Scenario", "SC-0001.md", "---\n- a\n- b\n---\n"),
      ["The frontmatter is a list, not the map of keys a spec file carries."],
    );
    assert.deepEqual(
      problemsOf("Scenario", "SC-0001.md", "---\n42\n---\n"),
      ["The frontmatter is a number, not the map of keys a spec file carries."],
    );
    // A bare scalar is the shape that used to be described as "a map, not the
    // map of keys a spec file carries" — a sentence that says the frontmatter
    // both is and is not a map, and that nobody can act on.
    for (const bare of ["just a sentence", "2026-08-14"]) {
      assert.deepEqual(
        problemsOf("Scenario", "SC-0001.md", `---\n${bare}\n---\n`),
        ["The frontmatter is text, not the map of keys a spec file carries."],
        bare,
      );
    }
  });

  /**
   * The one shape of broken frontmatter that used to be read HALFWAY and served
   * as a node: the `yaml` package hands back the first document and drops the
   * rest of the source, so every key after the marker — and the whole `edges:`
   * list with them — vanished with no problem reported, and the next save from
   * the panel wrote the loss into the file.
   */
  test("frontmatter that ends part-way through", () => {
    const sentence =
      'The frontmatter is not YAML the daemon can read: a "..." or "---" line inside it ends the document early, so the keys after that line belong to no node.';
    const cut = (marker: string): string =>
      `---
short_name: checkout-happy
name: Checkout succeeds with a saved card
${marker}
scenario_type: main
edges:
  - type: MENTIONS
    to: T-0001
---

## Preconditions

A cart.

## Steps

One step.

## Postconditions

An order.
`;
    // `...` ends a document; `--- ` is a document start that the frontmatter
    // scan walks past, because the fence it looks for is the line `---` exactly.
    for (const marker of ["...", "--- ", "--- # a note"]) {
      assert.deepEqual(problemsOf("Scenario", "SC-0001.md", cut(marker)), [
        sentence,
      ], marker);
    }
  });

  test("a value that is not text", () => {
    assert.deepEqual(
      problemsOf("Scenario", "SC-0001.md", GOOD_SCENARIO_HEAD.replace("short_name: checkout-happy", "short_name: 42")),
      ["short_name holds a number, not text. Quote the value."],
    );
    assert.deepEqual(
      problemsOf("Scenario", "SC-0001.md", GOOD_SCENARIO_HEAD.replace("scenario_type: main", "scenario_type: true")),
      [
        "scenario_type holds a boolean, not text. Quote the value.",
        "Scenario Type must be one of main, alternative, exception.",
      ],
    );
  });

  test("an unquoted number is not also called an empty required slot", () => {
    const problems = problemsOf(
      "Scenario",
      "SC-0001.md",
      GOOD_SCENARIO_HEAD.replace("short_name: checkout-happy", "short_name: 42"),
    );
    assert.equal(
      problems.some((problem) => problem.includes("is required")),
      false,
    );
  });

  test("a file that carries its own id", () => {
    assert.deepEqual(
      problemsOf("Scenario", "SC-0001.md", GOOD_SCENARIO_HEAD.replace("short_name:", "id: SC-0001\nshort_name:")),
      ["A spec file does not carry id — the filename is the id."],
    );
  });

  test("a file that carries its own type", () => {
    assert.deepEqual(
      problemsOf("Scenario", "SC-0001.md", GOOD_SCENARIO_HEAD.replace("short_name:", "type: Scenario\nshort_name:")),
      ["A spec file does not carry type — the folder is the type."],
    );
  });

  test("prose written into the frontmatter", () => {
    assert.deepEqual(
      problemsOf(
        "Scenario",
        "SC-0001.md",
        GOOD_SCENARIO_HEAD.replace(
          "## Steps\n\nOne step.\n\n",
          "",
        ).replace("scenario_type: main", "scenario_type: main\nsteps: One step."),
      ),
      ['steps is prose and lives in the body as "## Steps", not in the frontmatter.'],
    );
  });

  test("a key this type does not carry", () => {
    assert.deepEqual(
      problemsOf("Scenario", "SC-0001.md", GOOD_SCENARIO_HEAD.replace("scenario_type: main", "scenario_type: main\npriority: high")),
      [
        "A Scenario does not carry priority. It carries scenario_type, preconditions, steps, postconditions and nothing else.",
      ],
    );
  });

  test("edges that are not a list of exactly type and to", () => {
    const cases = [
      "edges: HAS_CRITERION",
      "edges:\n  - HAS_CRITERION",
      "edges:\n  - type: HAS_CRITERION",
      "edges:\n  - to: AC-0001",
      "edges:\n  - type: HAS_CRITERION\n    to: AC-0001\n    weight: 3",
      "edges:\n  - type: HAS_CRITERION\n    to:",
      "edges:\n  - type: 3\n    to: AC-0001",
    ];
    for (const edges of cases) {
      assert.deepEqual(
        problemsOf("Scenario", "SC-0001.md", GOOD_SCENARIO_HEAD.replace("scenario_type: main", `scenario_type: main\n${edges}`)),
        ["Every entry under edges is a map of exactly type and to."],
        edges,
      );
    }
  });

  test("body text before the first section", () => {
    assert.deepEqual(
      problemsOf("Scenario", "SC-0001.md", GOOD_SCENARIO_HEAD.replace("---\n\n## Preconditions", "---\n\nA stray paragraph.\n\n## Preconditions")),
      ['Body text before the first "## " section belongs to no attribute.'],
    );
  });

  test("a key named after a prototype is refused like any other stranger", () => {
    // It has to be refused rather than dropped: assigning it into a plain
    // object is a silent no-op, and a key nothing complains about is a key a
    // person keeps writing.
    assert.deepEqual(
      problemsOf("Scenario", "SC-0001.md", GOOD_SCENARIO_HEAD.replace("scenario_type: main", "scenario_type: main\n__proto__: mine")),
      [
        "A Scenario does not carry __proto__. It carries scenario_type, preconditions, steps, postconditions and nothing else.",
      ],
    );
  });

  test("the stray paragraph is named before the sections are", () => {
    assert.deepEqual(
      problemsOf(
        "Scenario",
        "SC-0001.md",
        `${GOOD_SCENARIO_HEAD.replace("---\n\n## Preconditions", "---\n\nA stray paragraph.\n\n## Preconditions")}\n## Notes\n\nSomething.\n`,
      ),
      [
        'Body text before the first "## " section belongs to no attribute.',
        'A Scenario does not carry "## Notes". It carries "## Preconditions", "## Steps", "## Postconditions" and nothing else.',
      ],
    );
  });

  test("a section this type does not carry", () => {
    assert.deepEqual(
      problemsOf("Scenario", "SC-0001.md", `${GOOD_SCENARIO_HEAD}\n## Notes\n\nSomething.\n`),
      [
        'A Scenario does not carry "## Notes". It carries "## Preconditions", "## Steps", "## Postconditions" and nothing else.',
      ],
    );
  });

  test("the same section twice", () => {
    assert.deepEqual(
      problemsOf("Scenario", "SC-0001.md", `${GOOD_SCENARIO_HEAD}\n## Steps\n\nAgain.\n`),
      ['The file names "## Steps" twice.'],
    );
  });

  test("an id the filename cannot carry everywhere", () => {
    assert.deepEqual(problemsOf("Scenario", "-SC-0001.md", GOOD_SCENARIO_HEAD), [
      "An id uses letters, digits, dots, hyphens and underscores, starts with a letter or digit, and holds at most 64 characters.",
    ]);
    assert.deepEqual(problemsOf("Scenario", "NUL.md", GOOD_SCENARIO_HEAD), [
      "NUL is a reserved device name on Windows, so no file can be named after it. Choose another id.",
    ]);
  });

  test("a node with no short name and no name", () => {
    assert.deepEqual(
      problemsOf(
        "Scenario",
        "SC-0001.md",
        GOOD_SCENARIO_HEAD.replace("short_name: checkout-happy\n", "").replace(
          "name: Checkout succeeds with a saved card\n",
          "",
        ),
      ),
      ["A short name is required.", "A name is required."],
    );
  });

  test("a name that holds a control character", () => {
    assert.deepEqual(
      problemsOf("Scenario", "SC-0001.md", GOOD_SCENARIO_HEAD.replace("name: Checkout succeeds with a saved card", 'name: "a\\u0001b"')),
      ["A name cannot contain a control character."],
    );
  });

  test("required slots left empty, all at once", () => {
    assert.deepEqual(
      problemsOf(
        "Scenario",
        "SC-0001.md",
        `---
short_name: checkout-happy
name: Checkout succeeds with a saved card
---
`,
      ),
      ["A Scenario requires Scenario Type, Preconditions, Steps, Postconditions."],
    );
  });

  test("a choice outside its vocabulary", () => {
    assert.deepEqual(
      problemsOf("Scenario", "SC-0001.md", GOOD_SCENARIO_HEAD.replace("scenario_type: main", "scenario_type: primary")),
      ["Scenario Type must be one of main, alternative, exception."],
    );
  });

  test("an edge from a node to itself", () => {
    assert.deepEqual(
      problemsOf("Scenario", "SC-0001.md", GOOD_SCENARIO_HEAD.replace("scenario_type: main", "scenario_type: main\nedges:\n  - type: MENTIONS\n    to: SC-0001")),
      ["SC-0001 cannot relate to itself."],
    );
  });

  test("the same edge twice, said once", () => {
    assert.deepEqual(
      problemsOf("Scenario", "SC-0001.md", GOOD_SCENARIO_HEAD.replace("scenario_type: main", "scenario_type: main\nedges:\n  - type: MENTIONS\n    to: T-0001\n  - type: MENTIONS\n    to: T-0001\n  - type: MENTIONS\n    to: T-0001")),
      ["SC-0001 already has a MENTIONS relation to T-0001."],
    );
  });

  test("a type the canon does not have, and nothing else", () => {
    assert.deepEqual(problemsOf("Sandwich", "S-0001.md", GOOD_SCENARIO_HEAD), [
      "Unknown node type: Sandwich",
    ]);
  });

  test("a file with a problem contributes neither node nor edges", () => {
    const reading = parseNodeFile(
      "Scenario",
      "SC-0001.md",
      GOOD_SCENARIO_HEAD.replace(
        "scenario_type: main",
        "scenario_type: primary\nedges:\n  - type: MENTIONS\n    to: T-0001",
      ),
    );
    assert.equal(reading.node, undefined);
    assert.deepEqual(reading.edges, []);
  });

  test("a file moved into the wrong type folder is caught by its own roster", () => {
    // Nothing about the bytes changed; the folder did, and the folder is the type.
    assert.deepEqual(problemsOf("Requirement", "SC-0001.md", GOOD_SCENARIO_HEAD), [
      'A Requirement does not carry "## Preconditions". It carries "## Description", "## Rationale" and nothing else.',
      'A Requirement does not carry "## Steps". It carries "## Description", "## Rationale" and nothing else.',
      'A Requirement does not carry "## Postconditions". It carries "## Description", "## Rationale" and nothing else.',
      "A Requirement does not carry scenario_type. It carries statement, description, requirement_type, priority, rationale and nothing else.",
      "A Requirement requires Statement, Description, Requirement Type, Priority.",
    ]);
  });
});

describe("emitTemplate", () => {
  test("the Requirement template, byte for byte", () => {
    assert.equal(
      emitTemplate("Requirement"),
      `---
# Requirement — copy to ../spec/Requirement/<id>.md and fill in.
# The FILENAME is the id and the FOLDER is the type; neither is repeated below.
# An id uses letters, digits, dots, hyphens and underscores, at most 64 characters.
# Suggested shape: R-0001.
short_name:            # required · one line
name:                  # required · one line
statement:             # required · one line
requirement_type:      # required · one of: functional | non_functional
priority:              # required · one of: high | medium | low
# Body sections: "## Description" required · "## Rationale" optional.
# Outgoing relations are written HERE and only here — never on the target.
# From a Requirement the canon allows:
#   HAS_CRITERION  -> AcceptanceCriterion
#   HAS_CONSTRAINT -> Constraint
#   DEPENDS_ON     -> Requirement
#   CONFLICTS_WITH -> Requirement
#   ASSUMES        -> Assumption
#   RAISES         -> Question
#   MENTIONS       -> Term
# edges:
#   - type: HAS_CRITERION
#     to: AC-0001
---

## Description

## Rationale
`,
    );
  });

  test("the Question template, one of the three satellites", () => {
    assert.equal(
      emitTemplate("Question"),
      `---
# Question — copy to ../spec/Question/<id>.md and fill in.
# The FILENAME is the id and the FOLDER is the type; neither is repeated below.
# An id uses letters, digits, dots, hyphens and underscores, at most 64 characters.
# Suggested shape: Q-0001.
short_name:            # required · one line
name:                  # required · one line
question:              # required · one line
state:                 # required · one of: open | closed
# Body sections: "## Description" required · "## Answer" optional.
# Outgoing relations are written HERE and only here — never on the target.
# From a Question the canon allows:
#   MENTIONS -> Term
# edges:
#   - type: MENTIONS
#     to: T-0001
---

## Description

## Answer
`,
    );
  });

  test("a type the canon gives no outgoing relation says so", () => {
    assert.equal(
      emitTemplate("Commit").includes(
        "# From a Commit the canon allows no outgoing relations.",
      ),
      true,
    );
    assert.equal(emitTemplate("Commit").includes("# edges:"), false);
  });

  test("all 23 types have a template, and generating twice writes the same bytes", () => {
    assert.equal(NODE_TYPES.length, 23);
    const written = new Set<string>();
    for (const entry of NODE_TYPES) {
      const once = emitTemplate(entry.name);
      assert.equal(emitTemplate(entry.name), once, entry.name);
      written.add(once);
    }
    assert.equal(written.size, 23);
  });

  test("every template reads back as a file whose only fault is that it is empty", () => {
    for (const entry of NODE_TYPES) {
      const expected = [
        "A short name is required.",
        "A name is required.",
        `A ${entry.name} requires ${(attributesFor(entry.name) ?? [])
          .filter((descriptor) => descriptor.required)
          .map((descriptor) => descriptor.label)
          .join(", ")}.`,
      ];
      assert.deepEqual(
        problemsOf(entry.name, `${entry.name}.md`, emitTemplate(entry.name)),
        expected,
        entry.name,
      );
    }
  });

  test("refuses a type the canon does not have, loudly", () => {
    assert.throws(() => emitTemplate("Sandwich"), /Unknown node type: Sandwich/);
  });
});
