import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseDocument } from "yaml";
import {
  bandFolderOf,
  NODE_TYPES,
  sectionGuideFor,
  type SpecEdge,
} from "../graph/index.js";
import {
  emitAcceptanceLedger,
  parseAcceptanceLedger,
  type AcceptanceRecord,
} from "./acceptances.js";
import { approvalPayload, emitNodeFile } from "./emit.js";
import {
  emitApprovalLedger,
  parseApprovalLedger,
  type ApprovalRecord,
} from "./ledger.js";
import { parseNodeFile } from "./parse.js";
import {
  emitRejectionLedger,
  parseRejectionLedger,
  type RejectionRecord,
} from "./rejections.js";
import { emitScalar, isPlainSafe } from "./scalar.js";
import { emitScaffold, emitTemplate } from "./template.js";
import { mapKeysAt } from "./yaml.js";
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
 *
 * THE BODY IS CHECKED AS BYTES AND NEVER AS SHAPE. The format used to cut the
 * body into `## Label` sections and hold each one against a per-type roster, so
 * most of what this file had to say about a body was which headings a type was
 * allowed to write. There is no roster now: everything under the closing fence
 * is ONE markdown document that the reader hands back verbatim. So the tests
 * that used to name a refusal — an unknown heading, a paragraph before the
 * first one, the same heading twice — are here inverted, and each one now
 * asserts that the file reads cleanly and that the text landed in `body`
 * unchanged. Those inversions are the record of the refactor: if one of them
 * ever starts failing, the roster has grown back.
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
 * The two characters no text file can carry, written the same way and for the
 * same reason. They are the whole of what `judgeBody` refuses besides the byte
 * cap, so they are the whole of what a body test has to smuggle in.
 */
const NUL = String.fromCharCode(0x00);
const LONE_SURROGATE = String.fromCharCode(0xd800);

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

/**
 * The contract's own example: two names, two edges, and a body that happens to
 * be shaped like the template a Scenario ships with. HAPPENS TO BE is the whole
 * point — nothing checks these headings, and the same file with one heading
 * renamed reads exactly as well.
 *
 * The body is written out twice, here and inside the file, because that is what
 * a golden is: the second copy is the claim, and computing it from the first
 * would be a test of string concatenation.
 */
const SCENARIO_BODY = `## Preconditions

The cart holds at least one item and the shopper has a saved card.

## Steps

1. The shopper opens the cart and chooses 결제하기.
2. The system charges the saved card.

## Postconditions

An order exists and the cart is empty.`;

const SCENARIO_NODE = {
  shortName: "checkout-happy",
  name: "Checkout succeeds with a saved card",
  body: SCENARIO_BODY,
};

const SCENARIO = `---
short_name: checkout-happy
name: Checkout succeeds with a saved card
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

/** The fixture for every emit test that is about the frontmatter and not the body. */
const REQUIREMENT_NODE = {
  shortName: "id-door",
  name: "The daemon refuses a malformed id",
  body: "## Statement\n\nThe daemon refuses a malformed id.",
};

/**
 * A node with nothing to say yet — which is a node, not a refusal. The file
 * ends at the closing fence: no blank line, no trailing anything, because an
 * empty body and an absent body would otherwise be two spellings of one state.
 */
const EMPTY_BODY = `---
short_name: first
name: The first commit
---
`;

/**
 * Every markdown shape the old roster had an opinion about, in one body: prose
 * before the first heading, a heading no type ever carried, that heading a
 * second time, a `---` rule that is not a fence, a table, a fenced code block
 * whose contents include a `## ` line, and an indented code block at the end.
 * Each of those was a refusal once; together they are now one document.
 */
const MOTLEY_BODY = `Some prose before any heading at all.

## Definition

A term, and then a rule.

---

## Definition

The same heading twice, which markdown allows and the graph does not read.

| column | column |
| ------ | ------ |
| a      | b      |

\`\`\`ts
const x = 1;
## not a heading, and nothing here pretends otherwise
\`\`\`

    an indented code block
    on two lines`;

const MOTLEY = `---
short_name: motley
name: A body in every shape markdown has
---

Some prose before any heading at all.

## Definition

A term, and then a rule.

---

## Definition

The same heading twice, which markdown allows and the graph does not read.

| column | column |
| ------ | ------ |
| a      | b      |

\`\`\`ts
const x = 1;
## not a heading, and nothing here pretends otherwise
\`\`\`

    an indented code block
    on two lines
`;

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

  test("the body goes into the file exactly as it was handed over", () => {
    // Emit is the IDENTITY on the body, and this is the golden that says so:
    // headings, a horizontal rule, a table, a code fence with a `## ` line
    // inside it and an indented block all land as themselves. Nothing here is
    // escaped, renumbered or re-indented on the way out.
    assert.equal(
      emitNodeFile(
        "Term",
        {
          shortName: "motley",
          name: "A body in every shape markdown has",
          body: MOTLEY_BODY,
        },
        [],
      ),
      MOTLEY,
    );
  });

  test("sorts edges by type and then by target, whatever order it is handed", () => {
    const sorted = emitNodeFile("Requirement", REQUIREMENT_NODE, [
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

## Statement

The daemon refuses a malformed id.
`,
    );
  });

  test("does not reorder the caller's own array", () => {
    const edges = [
      { type: "MENTIONS", toId: "T-0002" },
      { type: "HAS_CRITERION", toId: "AC-0001" },
    ];
    emitNodeFile("Requirement", REQUIREMENT_NODE, edges);
    assert.equal(edges[0]?.type, "MENTIONS");
  });

  test("omits the edges key entirely when there are none", () => {
    const text = emitNodeFile("Requirement", REQUIREMENT_NODE, []);
    assert.equal(text.includes("edges"), false);
  });

  test("a node with nothing to say ends at the closing fence", () => {
    assert.equal(
      emitNodeFile(
        "Evidence",
        { shortName: "first", name: "The first commit", body: "" },
        [],
      ),
      EMPTY_BODY,
    );
    // Said as bytes as well as as a golden, because the mistake this guards
    // against is a single stray newline nobody would see in a diff view.
    assert.equal(EMPTY_BODY.endsWith("---\n"), true);
  });

  test("refuses a type the canon does not have, loudly", () => {
    assert.throws(
      () => emitNodeFile("Sandwich", REQUIREMENT_NODE, []),
      /Unknown node type: Sandwich/,
    );
  });
});

/**
 * The round-trip fixture: two names, two edges of one type, and a body of one
 * heading and one paragraph — small enough that every tolerated way of writing
 * it can be spelled out as a replacement against these bytes.
 */
const CONSTRAINT = `---
short_name: no-third-party-fonts
name: The panel loads no third-party fonts
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
    for (const [type, label, text] of [
      ["Scenario", "the contract's own example", SCENARIO],
      ["Constraint", "the round-trip fixture", CONSTRAINT],
      ["Term", "a body in every markdown shape at once", MOTLEY],
      ["Evidence", "a node with nothing to say yet", EMPTY_BODY],
    ] as const) {
      const reading = parseNodeFile(type, "X-0001.md", text);
      assert.deepEqual(reading.problems, [], label);
      assert.ok(reading.node !== undefined);
      assert.equal(
        emitNodeFile(reading.node.type, reading.node, reading.edges),
        text,
        label,
      );
      assert.equal(isCanonical(type, "X-0001.md", text), true, label);
    }
  });

  test("the body comes back byte for byte, markdown and all", () => {
    const reading = parseNodeFile("Term", "T-0001.md", MOTLEY);
    assert.deepEqual(reading.problems, []);
    assert.equal(reading.node?.body, MOTLEY_BODY);
  });

  test("a body that opens with an indented code block survives a round trip", () => {
    // The reason the door strips blank lines instead of trimming: a trim would
    // dedent the first line alone, and the file would stop being its own answer.
    const text = `---
short_name: indented-block
name: A body that opens with a code block
---

    const x = 1;
    const y = 2;

Ordinary text after it.
`;
    const reading = parseNodeFile("Scenario", "SC-0002.md", text);
    assert.deepEqual(reading.problems, []);
    assert.ok(reading.node !== undefined);
    assert.equal(
      reading.node.body,
      "    const x = 1;\n    const y = 2;\n\nOrdinary text after it.",
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
        CONSTRAINT.replace(
          "name: The panel loads no third-party fonts",
          "name: The panel loads no third-party fonts  # the whole rule",
        ),
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
        CONSTRAINT.replace(
          "short_name: no-third-party-fonts",
          'short_name: "no-third-party-fonts"',
        ),
      ],
      [
        "keys in another order",
        `---
edges:
  - type: MENTIONS
    to: T-0001
  - type: MENTIONS
    to: T-0002
name: The panel loads no third-party fonts
short_name: no-third-party-fonts
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
        "blank lines around the body",
        CONSTRAINT.replace("## Description", "\n## Description").replace(
          "uses.\n",
          "uses.\n\n\n",
        ),
      ],
      // A key with no value is a key not written — which is what the templates
      // ship as, and what a person leaves behind when they clear a cell by
      // hand. It reaches the stray-key rule only once somebody fills it in.
      [
        "a key left with no value",
        CONSTRAINT.replace(
          "name: The panel loads no third-party fonts",
          "name: The panel loads no third-party fonts\napplies_when:",
        ),
      ],
      [
        "a key written as null",
        CONSTRAINT.replace(
          "name: The panel loads no third-party fonts",
          "name: The panel loads no third-party fonts\napplies_when: ~",
        ),
      ],
      [
        "no blank line after the fence",
        CONSTRAINT.replace("---\n\n## Description", "---\n## Description"),
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
        "name: The panel loads no third-party fonts",
        `name: The panel loads no third-party fonts\n${written}`,
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

  test("every corpus value survives a whole file as a name", () => {
    // The identity fields refuse the C-class controls and nothing else, so a
    // U+2028 reaches the frontmatter through a name and has to come back out of
    // it. The comparison is against the TRIMMED value, because trimming is the
    // door's and happens on the way in.
    for (const entry of SCALARS) {
      const value = entry.value.trim();
      if (value === "" || /\p{Cc}/u.test(value)) {
        continue;
      }
      const written = emitNodeFile(
        "Evidence",
        { shortName: value, name: value, body: "## SHA\n\n0x1A" },
        [],
      );
      const reading = parseNodeFile("Evidence", "EV-0001.md", written);
      assert.deepEqual(reading.problems, [], JSON.stringify(entry.value));
      assert.equal(reading.node?.shortName, value, JSON.stringify(entry.value));
      assert.equal(reading.node?.name, value, JSON.stringify(entry.value));
      assert.equal(isCanonical("Evidence", "EV-0001.md", written), true);
    }
  });

  test("every corpus value survives a whole file as the body, untrimmed", () => {
    // The body is filtered differently and compared differently, and both
    // differences are the point. It refuses no character the identity fields
    // refuse — a tab, a DEL, a U+2028 are all ordinary text below the fence —
    // and it is compared against the value AS WRITTEN rather than trimmed,
    // because the door strips blank LINES and never touches the spaces inside
    // one. ` leading` and `trailing ` therefore come back with their spaces.
    for (const entry of SCALARS) {
      if (entry.value.trim() === "") {
        continue;
      }
      const written = emitNodeFile(
        "Evidence",
        { shortName: "first", name: "The first commit", body: entry.value },
        [],
      );
      const reading = parseNodeFile("Evidence", "EV-0001.md", written);
      assert.deepEqual(reading.problems, [], JSON.stringify(entry.value));
      assert.equal(
        reading.node?.body,
        entry.value,
        JSON.stringify(entry.value),
      );
      assert.equal(isCanonical("Evidence", "EV-0001.md", written), true);
    }
  });

  test("an id that reads as a number is quoted where an edge names it", () => {
    const written = emitNodeFile("Requirement", REQUIREMENT_NODE, [
      { type: "MENTIONS", toId: "0x1A" },
    ]);
    assert.equal(written.includes('to: "0x1A"'), true);
    const reading = parseNodeFile("Requirement", "R-0001.md", written);
    assert.deepEqual(reading.problems, []);
    assert.equal(reading.edges[0]?.toId, "0x1A");
  });

  test("a quoted value that had to be quoted survives the trip", () => {
    const written = emitNodeFile(
      "Evidence",
      { shortName: "true", name: "a: b", body: "## SHA\n\n12:30 and 1_000" },
      [],
    );
    const reading = parseNodeFile("Evidence", "EV-0001.md", written);
    assert.deepEqual(reading.problems, []);
    assert.equal(reading.node?.shortName, "true");
    assert.equal(reading.node?.name, "a: b");
    assert.equal(reading.node?.body, "## SHA\n\n12:30 and 1_000");
    assert.ok(reading.node !== undefined);
    assert.equal(emitNodeFile("Evidence", reading.node, []), written);
  });
});

describe("isCanonical", () => {
  test("the canonical file is the one that answers yes", () => {
    assert.equal(isCanonical("Constraint", "C-0001.md", CONSTRAINT), true);
    assert.equal(isCanonical("Scenario", "SC-0001.md", SCENARIO), true);
    assert.equal(isCanonical("Evidence", "EV-0001.md", EMPTY_BODY), true);
  });

  test("valid but not canonical is a real state, and it answers no", () => {
    // Each of these reads perfectly — the node and the edges are exactly the
    // canonical file's — and each would be rewritten by the next save from the
    // panel. That rewrite is what `shall check` exists to warn about.
    for (const [label, text] of [
      ["a comment", CONSTRAINT.replace("short_name:", "# a note\nshort_name:")],
      [
        "another quoting",
        CONSTRAINT.replace(
          "short_name: no-third-party-fonts",
          "short_name: 'no-third-party-fonts'",
        ),
      ],
      ["a trailing blank line under the body", `${CONSTRAINT}\n`],
      ["no final newline at all", CONSTRAINT.trimEnd()],
    ] as const) {
      assert.deepEqual(
        parseNodeFile("Constraint", "C-0001.md", text).problems,
        [],
        label,
      );
      assert.equal(isCanonical("Constraint", "C-0001.md", text), false, label);
    }
  });

  test("a file that cannot be read is not canonical either", () => {
    assert.equal(
      isCanonical("Scenario", "SC-0001.md", "no frontmatter here"),
      false,
    );
    assert.equal(
      isCanonical("Sandwich", "S-0001.md", CONSTRAINT),
      false,
    );
  });
});

/** Every sentence the reader can serve, written out. */
function problemsOf(type: string, fileName: string, text: string): readonly string[] {
  return parseNodeFile(type, fileName, text).problems;
}

/**
 * The head every refusal is written as a replacement against — the smallest
 * file that reads cleanly, so that whatever a test breaks is the only thing
 * broken about it.
 */
const GOOD_HEAD = `---
short_name: checkout-happy
name: Checkout succeeds with a saved card
---

## Steps

1. The shopper opens the cart.
`;

/**
 * WHAT THE READER USED TO REFUSE AND NOW WELCOMES.
 *
 * Every test here asserts two things at once: that the file reads with no
 * problems at all, and that the text landed in `body` unchanged. The second
 * half matters as much as the first — a reader that accepted a stray heading
 * and then dropped it would pass a test that only checked for silence.
 */
describe("the body is one free markdown document", () => {
  function withBody(body: string): string {
    return `---
short_name: checkout-happy
name: Checkout succeeds with a saved card
---

${body}
`;
  }

  function bodyOf(body: string): string | undefined {
    const reading = parseNodeFile("Scenario", "SC-0001.md", withBody(body));
    assert.deepEqual(reading.problems, []);
    return reading.node?.body;
  }

  test("a heading no type ever carried is just a heading", () => {
    // This was `A Scenario does not carry "## Notes"`, the sentence the roster
    // served most often, and there is no roster to serve it any more.
    assert.equal(
      bodyOf("## Notes\n\nSomething."),
      "## Notes\n\nSomething.",
    );
  });

  test("prose before the first heading is prose", () => {
    // This was `Body text before the first "## " section belongs to no
    // attribute`. It belongs to the body, which is the only thing it could ever
    // have belonged to.
    assert.equal(
      bodyOf("A stray paragraph.\n\n## Steps\n\nOne step."),
      "A stray paragraph.\n\n## Steps\n\nOne step.",
    );
  });

  test("a body with no heading at all is a body", () => {
    assert.equal(bodyOf("Just a sentence."), "Just a sentence.");
  });

  test("the same heading twice is the author's business", () => {
    // This was `The file names "## Steps" twice.`
    assert.equal(
      bodyOf("## Steps\n\nOne.\n\n## Steps\n\nAgain."),
      "## Steps\n\nOne.\n\n## Steps\n\nAgain.",
    );
  });

  test("a horizontal rule is a horizontal rule and not a fence", () => {
    // The closing fence is the FIRST `---` line after the opening one, and that
    // line has already gone by, so every later one belongs to the document.
    assert.equal(bodyOf("one\n\n---\n\ntwo"), "one\n\n---\n\ntwo");
  });

  test("a body that opens with a horizontal rule still reads", () => {
    assert.equal(bodyOf("---\n\nafter the rule"), "---\n\nafter the rule");
  });

  test("a deeper heading is text like any other", () => {
    assert.equal(bodyOf("### A sub-heading\n\ntext"), "### A sub-heading\n\ntext");
  });

  test("a code fence is kept whole, and a heading inside it is not a heading", () => {
    // This was the one place the old split had no escape: a `## ` line inside a
    // code fence was cut out as a section and refused. Nothing cuts now, so the
    // fence keeps what it holds.
    const fenced = "```ts\nconst x = 1;\n## Not a heading\n```";
    assert.equal(bodyOf(fenced), fenced);
  });

  test("a table is kept whole", () => {
    const table = "| a | b |\n| - | - |\n| 1 | 2 |";
    assert.equal(bodyOf(table), table);
  });

  test("a hash pair with no space after it is text", () => {
    const notHeadings = "##not a heading\n\n##";
    assert.equal(bodyOf(notHeadings), notHeadings);
  });

  test("blank lines inside the body are kept", () => {
    assert.equal(bodyOf("one\n\n\n\ntwo"), "one\n\n\n\ntwo");
  });

  test("blank lines at the edges of the body are dropped", () => {
    // The one thing the door does touch, and it does it by whole lines: a body
    // is stored without the empty lines the fence and the file end leave around
    // it, so re-emitting it produces the bytes that were read.
    assert.equal(bodyOf("\n\n  \n\nmiddle\n\n\n"), "middle");
  });

  test("trailing spaces inside the body are kept, because markdown means them", () => {
    const hardBreak = `one${SPACE}${SPACE}\ntwo`;
    assert.equal(bodyOf(hardBreak), hardBreak);
    // And they survive the write, which is what makes them worth keeping.
    const reading = parseNodeFile("Scenario", "SC-0001.md", withBody(hardBreak));
    assert.ok(reading.node !== undefined);
    assert.equal(
      emitNodeFile("Scenario", reading.node, []).includes(hardBreak),
      true,
    );
  });

  test("the line breaks a screen honours and a file does not are ordinary text", () => {
    // A one-line value used to refuse all three of these, because a value that
    // renders as two lines and stores as one is a value nobody can edit. The
    // body renders as whatever markdown makes of it and stores as itself.
    for (const separator of [LINE_SEPARATOR, NEXT_LINE, PARAGRAPH_SEPARATOR]) {
      const smuggled = `one${separator}## two`;
      assert.equal(bodyOf(smuggled), smuggled, JSON.stringify(separator));
    }
  });

  test("a file moved into another type's folder reads exactly as well", () => {
    // Nothing about the bytes changed and the folder did — which used to be
    // caught by the target type's roster, and is now caught by nothing, because
    // there is nothing left in a body for a type to disagree with. What a type
    // still decides is which edges it may write, and that is the loader's job.
    const reading = parseNodeFile("Requirement", "SC-0001.md", GOOD_HEAD);
    assert.deepEqual(reading.problems, []);
    assert.deepEqual(reading.node, {
      id: "SC-0001",
      type: "Requirement",
      shortName: "checkout-happy",
      name: "Checkout succeeds with a saved card",
      body: "## Steps\n\n1. The shopper opens the cart.",
    });
  });
});

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
edges:
  - type: MENTIONS
    to: T-0001
---

## Steps

1. The shopper opens the cart.
`;
    // `...` ends a document; `--- ` is a document start that the frontmatter
    // scan walks past, because the fence it looks for is the line `---` exactly.
    for (const marker of ["...", "--- ", "--- # a note"]) {
      assert.deepEqual(
        problemsOf("Scenario", "SC-0001.md", cut(marker)),
        [sentence],
        marker,
      );
    }
  });

  test("an empty frontmatter block is an empty map, and says what is missing by name", () => {
    // Not "the frontmatter is null, not a map": what a person has in front of
    // them is a template with every value blank, and the useful sentences are
    // the ones that name the two fields they have to fill.
    for (const block of ["---\n---\n", "---\n\n---\n\nA body.\n", "---\n# only a comment\n---\n"]) {
      assert.deepEqual(
        problemsOf("Scenario", "SC-0001.md", block),
        ["A short name is required.", "A name is required."],
        JSON.stringify(block),
      );
    }
  });

  test("a name that is not text", () => {
    assert.deepEqual(
      problemsOf(
        "Scenario",
        "SC-0001.md",
        GOOD_HEAD.replace("short_name: checkout-happy", "short_name: 42"),
      ),
      ["short_name holds a number, not text. Quote the value."],
    );
    assert.deepEqual(
      problemsOf(
        "Scenario",
        "SC-0001.md",
        GOOD_HEAD.replace("short_name: checkout-happy", "short_name: true"),
      ),
      ["short_name holds a boolean, not text. Quote the value."],
    );
    assert.deepEqual(
      problemsOf(
        "Scenario",
        "SC-0001.md",
        GOOD_HEAD.replace(
          "name: Checkout succeeds with a saved card",
          "name:\n  - Checkout\n  - succeeds",
        ),
      ),
      ["name holds a list, not text. Quote the value."],
    );
  });

  test("an unquoted number is not also called an empty required slot", () => {
    const problems = problemsOf(
      "Scenario",
      "SC-0001.md",
      GOOD_HEAD.replace("short_name: checkout-happy", "short_name: 42"),
    );
    assert.equal(
      problems.some((problem) => problem.includes("is required")),
      false,
    );
  });

  test("a file that carries its own id", () => {
    assert.deepEqual(
      problemsOf(
        "Scenario",
        "SC-0001.md",
        GOOD_HEAD.replace("short_name:", "id: SC-0001\nshort_name:"),
      ),
      ["A spec file does not carry id — the filename is the id."],
    );
  });

  test("a file that carries its own type", () => {
    assert.deepEqual(
      problemsOf(
        "Scenario",
        "SC-0001.md",
        GOOD_HEAD.replace("short_name:", "type: Scenario\nshort_name:"),
      ),
      ["A spec file does not carry type — the folder is the type."],
    );
  });

  /**
   * THE ONE RULE ABOUT THE FRONTMATTER, IN THREE GRAMMARS. Every key that is
   * not one of the three is the same mistake — text that belongs below the
   * fence — so it is one sentence however many keys are wrong, and the sentence
   * has to read as English for one, for two and for a list.
   */
  test("a stray key, said as one sentence in the grammar the count calls for", () => {
    const withKeys = (keys: string): string =>
      GOOD_HEAD.replace(
        "name: Checkout succeeds with a saved card",
        `name: Checkout succeeds with a saved card\n${keys}`,
      );
    assert.deepEqual(problemsOf("Scenario", "SC-0001.md", withKeys("priority: high")), [
      "The frontmatter carries short_name, name, edges and deletionProposed and nothing else — priority belongs in the body, below the closing fence.",
    ]);
    assert.deepEqual(
      problemsOf("Scenario", "SC-0001.md", withKeys("priority: high\nscenario_type: main")),
      [
        "The frontmatter carries short_name, name, edges and deletionProposed and nothing else — priority and scenario_type belong in the body, below the closing fence.",
      ],
    );
    assert.deepEqual(
      problemsOf(
        "Scenario",
        "SC-0001.md",
        withKeys("priority: high\nscenario_type: main\nsteps: One step."),
      ),
      [
        "The frontmatter carries short_name, name, edges and deletionProposed and nothing else — priority, scenario_type, steps belong in the body, below the closing fence.",
      ],
    );
  });

  test("a prose key in the frontmatter is a stray key like any other", () => {
    // `definition:` used to have its own sentence, because the roster knew that
    // a Term carries a Definition and knew it lived in the body. Nothing knows
    // that now — the templates suggest `## Definition` and suggest nothing —
    // so the key is refused for the only reason left, which is the true one.
    assert.deepEqual(
      problemsOf(
        "Term",
        "T-0001.md",
        "---\nshort_name: cart\nname: Cart\ndefinition: A basket of items.\n---\n",
      ),
      [
        "The frontmatter carries short_name, name, edges and deletionProposed and nothing else — definition belongs in the body, below the closing fence.",
      ],
    );
  });

  test("a key named after a prototype is refused like any other stranger", () => {
    // It has to be refused rather than dropped: assigning it into a plain
    // object is a silent no-op, and a key nothing complains about is a key a
    // person keeps writing.
    assert.deepEqual(
      problemsOf(
        "Scenario",
        "SC-0001.md",
        GOOD_HEAD.replace(
          "name: Checkout succeeds with a saved card",
          "name: Checkout succeeds with a saved card\n__proto__: mine",
        ),
      ),
      [
        "The frontmatter carries short_name, name, edges and deletionProposed and nothing else — __proto__ belongs in the body, below the closing fence.",
      ],
    );
  });

  test("the id and the type are named before the strays are", () => {
    assert.deepEqual(
      problemsOf(
        "Scenario",
        "SC-0001.md",
        GOOD_HEAD.replace(
          "short_name:",
          "id: SC-0001\ntype: Scenario\npriority: high\nshort_name:",
        ),
      ),
      [
        "A spec file does not carry id — the filename is the id.",
        "A spec file does not carry type — the folder is the type.",
        "The frontmatter carries short_name, name, edges and deletionProposed and nothing else — priority belongs in the body, below the closing fence.",
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
      // Two bad entries and still one sentence: it is one rule, and a person
      // told it once will re-read the whole list.
      "edges:\n  - type: HAS_CRITERION\n  - to: AC-0001",
    ];
    for (const edges of cases) {
      assert.deepEqual(
        problemsOf(
          "Scenario",
          "SC-0001.md",
          GOOD_HEAD.replace(
            "name: Checkout succeeds with a saved card",
            `name: Checkout succeeds with a saved card\n${edges}`,
          ),
        ),
        ["Every entry under edges is a map of exactly type and to."],
        edges,
      );
    }
  });

  test("an edge from a node to itself", () => {
    assert.deepEqual(
      problemsOf(
        "Scenario",
        "SC-0001.md",
        GOOD_HEAD.replace(
          "name: Checkout succeeds with a saved card",
          "name: Checkout succeeds with a saved card\nedges:\n  - type: MENTIONS\n    to: SC-0001",
        ),
      ),
      ["SC-0001 cannot relate to itself."],
    );
  });

  test("the same edge twice, said once", () => {
    assert.deepEqual(
      problemsOf(
        "Scenario",
        "SC-0001.md",
        GOOD_HEAD.replace(
          "name: Checkout succeeds with a saved card",
          "name: Checkout succeeds with a saved card\nedges:\n  - type: MENTIONS\n    to: T-0001\n  - type: MENTIONS\n    to: T-0001\n  - type: MENTIONS\n    to: T-0001",
        ),
      ),
      ["SC-0001 already has a MENTIONS relation to T-0001."],
    );
  });

  test("an id the filename cannot carry everywhere", () => {
    assert.deepEqual(problemsOf("Scenario", "-SC-0001.md", GOOD_HEAD), [
      "An id uses letters, digits, dots, hyphens and underscores, starts with a letter or digit, and holds at most 64 characters.",
    ]);
    assert.deepEqual(problemsOf("Scenario", "NUL.md", GOOD_HEAD), [
      "NUL is a reserved device name on Windows, so no file can be named after it. Choose another id.",
    ]);
  });

  test("a node with no short name and no name", () => {
    assert.deepEqual(
      problemsOf(
        "Scenario",
        "SC-0001.md",
        GOOD_HEAD.replace("short_name: checkout-happy\n", "").replace(
          "name: Checkout succeeds with a saved card\n",
          "",
        ),
      ),
      ["A short name is required.", "A name is required."],
    );
  });

  test("a name that holds a control character", () => {
    assert.deepEqual(
      problemsOf(
        "Scenario",
        "SC-0001.md",
        GOOD_HEAD.replace(
          "name: Checkout succeeds with a saved card",
          'name: "a\\u0001b"',
        ),
      ),
      ["A name cannot contain a control character."],
    );
  });

  /**
   * WHAT IS LEFT TO REFUSE IN A BODY, WHICH IS ALMOST NOTHING. Not a shape, not
   * a heading, not a size a person would ever type — only the two characters
   * that stop the file being text at all, and a cap on how much of the graph
   * one node may be. Every sentence names "The specification", because that is
   * what the body is and the person editing it is not thinking about a field.
   */
  test("a body that is not text", () => {
    const withBody = (body: string): string =>
      `---\nshort_name: cart\nname: Cart\n---\n\n${body}\n`;
    assert.deepEqual(
      problemsOf("Term", "T-0001.md", withBody(`before${NUL}after`)),
      ["The specification cannot contain a NUL character."],
    );
    assert.deepEqual(
      problemsOf("Term", "T-0001.md", withBody(`before${LONE_SURROGATE}after`)),
      ["The specification is not well-formed text."],
    );
  });

  test("a body over the byte cap", () => {
    // Measured in bytes and not characters, which is why the Korean case is
    // worth its own line: one syllable is three of them, so a third as many
    // characters trips the same cap.
    assert.deepEqual(
      problemsOf(
        "Term",
        "T-0001.md",
        `---\nshort_name: cart\nname: Cart\n---\n\n${"x".repeat(262145)}\n`,
      ),
      ["The specification cannot hold more than 256 KiB of text."],
    );
    assert.deepEqual(
      problemsOf(
        "Term",
        "T-0001.md",
        `---\nshort_name: cart\nname: Cart\n---\n\n${"가".repeat(87382)}\n`,
      ),
      ["The specification cannot hold more than 256 KiB of text."],
    );
    // And the last body that fits is not refused, so the cap is a cap and not
    // an off-by-one.
    assert.deepEqual(
      problemsOf(
        "Term",
        "T-0001.md",
        `---\nshort_name: cart\nname: Cart\n---\n\n${"x".repeat(262144)}\n`,
      ),
      [],
    );
  });

  test("a type the canon does not have, and nothing else", () => {
    assert.deepEqual(problemsOf("Sandwich", "S-0001.md", GOOD_HEAD), [
      "Unknown node type: Sandwich",
    ]);
  });

  test("a file with a problem contributes neither node nor edges", () => {
    const reading = parseNodeFile(
      "Scenario",
      "SC-0001.md",
      GOOD_HEAD.replace(
        "name: Checkout succeeds with a saved card",
        "name: Checkout succeeds with a saved card\npriority: high\nedges:\n  - type: MENTIONS\n    to: T-0001",
      ),
    );
    assert.equal(reading.node, undefined);
    assert.deepEqual(reading.edges, []);
    assert.equal(reading.problems.length, 1);
  });
});

describe("emitTemplate", () => {
  test("the Requirement template, byte for byte", () => {
    // The longest guide in the canon, and the one with hints on two of its
    // sections — so this golden pins the header a reference copy carries and a
    // scaffold does not, the two required keys, the hint column, the relation
    // table's arrow alignment and the suggested headings all at once.
    assert.equal(
      emitTemplate("Requirement"),
      `---
# Requirement — the starting shape of a Requirement node.
# \`shall add-spec-node --type Requirement\` writes this file into the project at
# .shall/spec/intent/Requirement/<id>.md with the next free id as its name.
# (Writing it there by hand works too: the FILENAME is the id and the FOLDER
# is the type, so neither is repeated inside. An id uses letters, digits,
# dots, hyphens and underscores, at most 64 characters — R-0001 is the shape
# Shall suggests.)
short_name:            # required · one line
name:                  # required · one line
# Everything below the closing fence is the specification: free markdown,
# read back exactly as written. The headings that follow are a starting
# shape, not a rule — keep them, reshape them or write your own.
#   ## Statement
#   ## Description
#   ## Requirement Type — Functional · Non-Functional
#   ## Priority — High · Medium · Low
#   ## Rationale
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

## Statement

## Description

## Requirement Type

## Priority

## Rationale
`,
    );
  });

  test("the VerificationReport template, which the canon gives no outgoing relation", () => {
    // The other branch of the relation block, as a golden rather than as a
    // substring check: a type with no outgoing edge says so in one line and
    // ships no commented-out `edges:` example, because there is nothing it
    // could show. VerificationReport is the one type left in that branch —
    // what it testifies about is named by the work log that submitted it,
    // never by a line of its own.
    assert.equal(
      emitTemplate("VerificationReport"),
      `---
# VerificationReport — the starting shape of a VerificationReport node.
# \`shall add-spec-node --type VerificationReport\` writes this file into the project at
# .shall/spec/execution/VerificationReport/<id>.md with the next free id as its name.
# (Writing it there by hand works too: the FILENAME is the id and the FOLDER
# is the type, so neither is repeated inside. An id uses letters, digits,
# dots, hyphens and underscores, at most 64 characters — VR-0001 is the shape
# Shall suggests.)
short_name:            # required · one line
name:                  # required · one line
# Everything below the closing fence is the specification: free markdown,
# read back exactly as written. The headings that follow are a starting
# shape, not a rule — keep them, reshape them or write your own.
#   ## Testimony
#   ## Coverage
#   ## Trigger
# From a VerificationReport the canon allows no outgoing relations.
---

## Testimony

## Coverage

## Trigger
`,
    );
    assert.equal(emitTemplate("VerificationReport").includes("# edges:"), false);
  });

  test("the Evidence template shows the one line it may write: its claim", () => {
    // The claim is the evidence's own line since #24 turned round — an agent
    // starting an evidence file sees where to aim it, and the criterion's file
    // is never touched by a claim being made.
    const text = emitTemplate("Evidence");
    assert.ok(text.includes("# From a Evidence the canon allows:\n#   CLAIMS -> AcceptanceCriterion\n"), text);
    assert.ok(text.includes("# edges:\n#   - type: CLAIMS\n#     to: AC-0001\n"), text);
  });

  test("the WorkLog template shows where its commits go", () => {
    // The one type-specific key, and the only template that mentions it: an
    // agent starting a work log sees the shape of the list it will fill.
    const text = emitTemplate("WorkLog");
    assert.ok(text.includes("# commits:\n#   - 0123abc\n"), text);
    assert.equal(emitTemplate("Journal").includes("commits"), false);
  });

  test("all 22 types have a template, and generating twice writes the same bytes", () => {
    assert.equal(NODE_TYPES.length, 22);
    const written = new Set<string>();
    for (const entry of NODE_TYPES) {
      const once = emitTemplate(entry.name);
      assert.equal(emitTemplate(entry.name), once, entry.name);
      written.add(once);
    }
    assert.equal(written.size, 22);
  });

  test("every template names the command that writes it and the path it lands at", () => {
    // The one line of a header that is not the same sentence for every type is
    // the path, because the band folder is part of it. The two goldens above
    // spell out `intent` and `execution`; this says the other twenty-one are
    // `bandFolderOf`'s answer as well, so a type that moves band moves its
    // template's path with it and nobody has to remember to.
    for (const entry of NODE_TYPES) {
      assert.equal(
        emitTemplate(entry.name).includes(
          `# \`shall add-spec-node --type ${entry.name}\` writes this file into the project at
# .shall/spec/${bandFolderOf(entry.name)}/${entry.name}/<id>.md with the next free id as its name.
`,
        ),
        true,
        entry.name,
      );
    }
  });

  test("every template's headings are the section guide's, twice over", () => {
    // Computed rather than written out — the two goldens above carry the
    // byte-exact claim, and what this adds is that no type's template drifts
    // from the guide it is derived from. Each suggested section appears twice
    // on purpose: once in the comment block with its hint, where a person reads
    // what the section is for, and once below the fence as an actual heading.
    for (const entry of NODE_TYPES) {
      const guide = sectionGuideFor(entry.name);
      assert.ok(guide !== null, entry.name);
      assert.ok(guide.length > 0, entry.name);
      const text = emitTemplate(entry.name);
      for (const suggested of guide) {
        assert.equal(
          text.includes(
            suggested.hint === undefined
              ? `#   ## ${suggested.label}\n`
              : `#   ## ${suggested.label} — ${suggested.hint}\n`,
          ),
          true,
          `${entry.name} · ${suggested.label}`,
        );
      }
      assert.equal(
        text.endsWith(
          `\n${guide.map((suggested) => `## ${suggested.label}`).join("\n\n")}\n`,
        ),
        true,
        entry.name,
      );
    }
  });

  test("every template reads back as a file whose only fault is that it is empty", () => {
    // Two sentences and not three. The body a template ships — a stack of empty
    // headings — is a perfectly good body, so nothing is said about it; what is
    // missing is the two names, and those are exactly what the person opening
    // the file is being asked for.
    for (const entry of NODE_TYPES) {
      assert.deepEqual(
        problemsOf(entry.name, `${entry.name}.md`, emitTemplate(entry.name)),
        ["A short name is required.", "A name is required."],
        entry.name,
      );
    }
  });

  test("a filled-in template is a node, and its headings survive the filling", () => {
    // The end of the journey the templates start: the comments go, the two
    // names arrive, and the body the template shipped is still there, because
    // nothing ever cut it up.
    //
    // A comment line is `# ` and a heading is `##`, which is the whole reason
    // the filter tests for the space: the guide's suggestions are written into
    // the comment block as `#   ## Label` AND below the fence as `## Label`,
    // and only the first of those is a comment.
    const filled = emitTemplate("Term")
      .split("\n")
      .filter((line) => !line.startsWith("# "))
      .join("\n")
      .replace("short_name:", "short_name: cart")
      .replace("\nname:", "\nname: Cart");
    const reading = parseNodeFile("Term", "T-0001.md", filled);
    assert.deepEqual(reading.problems, []);
    assert.equal(reading.node?.shortName, "cart");
    assert.equal(reading.node?.name, "Cart");
    assert.equal(reading.node?.body, "## Definition\n\n## Aliases");
  });

  test("refuses a type the canon does not have, loudly", () => {
    assert.throws(() => emitTemplate("Sandwich"), /Unknown node type: Sandwich/);
  });
});

/**
 * THE SAME FILE, WRITTEN FOR THE OTHER AUDIENCE. A template is read in
 * `~/.shall/templates/` before a node exists; a scaffold IS the node, written
 * by `shall add-spec-node` at the path whose folder is already the type and
 * whose name is already the id. So everything the header of a template spends
 * on where the file goes and what to call it is gone, and nothing else is.
 */
describe("emitScaffold", () => {
  test("the Term scaffold, byte for byte", () => {
    // A short guide, one outgoing relation and therefore the commented-out
    // `edges:` example — the whole shared middle in one golden, under the two
    // lines that are all a scaffold says for itself.
    assert.equal(
      emitScaffold("Term"),
      `---
# A new Term. Fill it in — the \`#\` comments are notes to delete as you go,
# and \`shall check\` reads the result.
short_name:            # required · one line
name:                  # required · one line
# Everything below the closing fence is the specification: free markdown,
# read back exactly as written. The headings that follow are a starting
# shape, not a rule — keep them, reshape them or write your own.
#   ## Definition
#   ## Aliases — comma-separated
# Outgoing relations are written HERE and only here — never on the target.
# From a Term the canon allows:
#   DENOTES -> DomainEntity
# edges:
#   - type: DENOTES
#     to: DE-0001
---

## Definition

## Aliases
`,
    );
  });

  test("all 22 types have a scaffold, and generating twice writes the same bytes", () => {
    const written = new Set<string>();
    for (const entry of NODE_TYPES) {
      const once = emitScaffold(entry.name);
      assert.equal(emitScaffold(entry.name), once, entry.name);
      written.add(once);
    }
    assert.equal(written.size, 22);
  });

  test("every scaffold is its template with the header swapped and nothing else", () => {
    // Said as a subtraction rather than as twenty-three more goldens. The two
    // files share their starting lines in the source, and those begin at
    // `short_name:` — so cut both files there, and below the cut the bytes must
    // be identical for every type, while above it the scaffold carries exactly
    // its own two lines. A change to the shared middle that reached one
    // audience and not the other would fail here and nowhere else.
    for (const entry of NODE_TYPES) {
      const template = emitTemplate(entry.name);
      const scaffold = emitScaffold(entry.name);
      const templateAt = template.indexOf("\nshort_name:");
      const scaffoldAt = scaffold.indexOf("\nshort_name:");
      assert.ok(templateAt > 0, entry.name);
      assert.ok(scaffoldAt > 0, entry.name);
      assert.equal(
        scaffold.slice(scaffoldAt),
        template.slice(templateAt),
        entry.name,
      );
      assert.equal(
        scaffold.slice(0, scaffoldAt),
        `---
# A new ${entry.name}. Fill it in — the \`#\` comments are notes to delete as you go,
# and \`shall check\` reads the result.`,
        entry.name,
      );
    }
  });

  test("no scaffold repeats what its own path already says", () => {
    // The whole difference between the two audiences, as four phrases. Each one
    // is asserted in both directions: absent from every scaffold, present in
    // every template, so this cannot pass by the phrases having quietly left
    // the codebase.
    for (const entry of NODE_TYPES) {
      const scaffold = emitScaffold(entry.name);
      const template = emitTemplate(entry.name);
      for (const said of [
        "shall add-spec-node",
        ".shall/spec/",
        "<id>.md",
        "the FILENAME is the id",
      ]) {
        assert.equal(scaffold.includes(said), false, `${entry.name} · ${said}`);
        assert.equal(template.includes(said), true, `${entry.name} · ${said}`);
      }
    }
  });

  test("every scaffold reads back as a file whose only fault is that it is empty", () => {
    // The same two sentences a template reads back with, which is the point:
    // the file `add-spec-node` leaves behind is one `shall check` can already
    // read, and what it asks for is the two names and nothing else.
    for (const entry of NODE_TYPES) {
      assert.deepEqual(
        problemsOf(entry.name, `${entry.name}.md`, emitScaffold(entry.name)),
        ["A short name is required.", "A name is required."],
        entry.name,
      );
    }
  });

  test("a filled-in scaffold is a node whose body is the headings it shipped", () => {
    // The body has to be read from the filled-in file rather than from the
    // shipped one: a reading with a problem hands back no node at all, so the
    // two names go in first and the body comes back after.
    const filled = emitScaffold("Term")
      .split("\n")
      .filter((line) => !line.startsWith("# "))
      .join("\n")
      .replace("short_name:", "short_name: cart")
      .replace("\nname:", "\nname: Cart");
    const reading = parseNodeFile("Term", "T-0001.md", filled);
    assert.deepEqual(reading.problems, []);
    assert.equal(reading.node?.shortName, "cart");
    assert.equal(reading.node?.name, "Cart");
    assert.equal(reading.node?.body, "## Definition\n\n## Aliases");
  });

  test("refuses a type the canon does not have, loudly", () => {
    assert.throws(() => emitScaffold("Sandwich"), /Unknown node type: Sandwich/);
  });
});

/**
 * THE BLOCK THE MACHINE WRITES, AND THE ONE THAT MOVED OUT. A file is
 * otherwise the author's; `deletionProposed` is the one thing an agent writes
 * above the fence, and `approval` is no longer something a file carries at all
 * — it lives in the ledger, so a file still holding the block is refused BY
 * NAME rather than read and dropped in silence. What is pinned here is the
 * block grammar — an exact tuple, text only, one line each — where it is
 * written, both refusals, and the payload an approval's hash is taken over,
 * which is the whole file WITH the node's own address on top, because that
 * address is the whole of what stops a copy arriving green.
 */
const PROPOSED = `---
short_name: cart-total
name: The cart shows a total
edges:
  - type: HAS_CRITERION
    to: AC-0001
deletionProposed:
  by: session-7
  rationale: Superseded by R-0007.
---

## Statement

The cart shows a total.
`;

/** The sentence a file that still carries the retired block is refused with. */
const APPROVAL_MOVED =
  "A spec file does not carry approval — an approval lives in .shall/ledger/approvals.yaml, and only Shall writes there. Delete the block; the node's colour comes from the ledger.";

describe("the block the machine writes, and the one that moved out", () => {
  test("a deletion proposal reads back as the two strings it carries", () => {
    const reading = parseNodeFile("Requirement", "R-0001.md", PROPOSED);
    assert.deepEqual(reading.problems, []);
    assert.deepEqual(reading.node?.deletionProposed, {
      by: "session-7",
      rationale: "Superseded by R-0007.",
    });
  });

  test("the block is written after the edges and the commits, and the file is a fixpoint", () => {
    const reading = parseNodeFile("Requirement", "R-0001.md", PROPOSED);
    assert.ok(reading.node !== undefined);
    assert.equal(
      emitNodeFile(reading.node.type, reading.node, reading.edges, reading.node),
      PROPOSED,
    );
    assert.equal(isCanonical("Requirement", "R-0001.md", PROPOSED), true);
    // Last above the closing fence whatever the author's keys amount to — on
    // the one type that also carries a list, the block comes after it.
    const logged = emitNodeFile(
      "WorkLog",
      { shortName: "day-one", name: "The first day", body: "", commits: ["9f2b1c4"] },
      [],
      { deletionProposed: { by: "session-7", rationale: "Superseded." } },
    );
    assert.ok(
      logged.indexOf("deletionProposed:") > logged.indexOf("commits:"),
      logged,
    );
    assert.equal(isCanonical("WorkLog", "WL-0001.md", logged), true);
  });

  test("a node without a block has no key for it, in the object as in the file", () => {
    const written = emitNodeFile("Requirement", REQUIREMENT_NODE, []);
    assert.equal(written.includes("deletionProposed"), false);
    const reading = parseNodeFile("Requirement", "R-0001.md", written);
    assert.ok(reading.node !== undefined);
    assert.equal("deletionProposed" in reading.node, false);
  });

  test("a block written with nothing under it is a block that is not there", () => {
    // The same rule every key already has: a bare `deletionProposed:` is what
    // clearing one by hand leaves behind, and it reads as absence — valid, and
    // brought canonical by the next save rather than refused.
    const bare = PROPOSED.replace(
      "deletionProposed:\n  by: session-7\n  rationale: Superseded by R-0007.\n",
      "deletionProposed:\n",
    );
    const reading = parseNodeFile("Requirement", "R-0001.md", bare);
    assert.deepEqual(reading.problems, []);
    assert.ok(reading.node !== undefined);
    assert.equal("deletionProposed" in reading.node, false);
    assert.equal(isCanonical("Requirement", "R-0001.md", bare), false);
  });

  test("a proposal missing a key is one sentence about the block, not two about its fields", () => {
    const short = PROPOSED.replace("  rationale: Superseded by R-0007.\n", "");
    const reading = parseNodeFile("Requirement", "R-0001.md", short);
    assert.deepEqual(reading.problems, [
      "The deletionProposed block is a map of exactly by and rationale, each of them text.",
    ]);
  });

  test("a key the block does not carry is refused with the block, not with the frontmatter", () => {
    const wide = PROPOSED.replace(
      "  by: session-7\n",
      "  by: session-7\n  note: looks fine\n",
    );
    const reading = parseNodeFile("Requirement", "R-0001.md", wide);
    assert.deepEqual(reading.problems, [
      "The deletionProposed block is a map of exactly by and rationale, each of them text.",
    ]);
  });

  test("a file that still carries an approval block is refused by name, and the sentence says where an approval lives", () => {
    // The format carried this block until the ledger took it over. A file
    // written then is a file somebody still has, and reading it as a stray key
    // would send them to move a signature into the body.
    const held = PROPOSED.replace(
      "---\n\n## Statement",
      'approval:\n  hash: sha256:9f2b\n  by: yjshin\n  at: "2026-08-15T09:12:33.412Z"\n---\n\n## Statement',
    );
    const reading = parseNodeFile("Requirement", "R-0001.md", held);
    assert.deepEqual(reading.problems, [APPROVAL_MOVED]);
    assert.equal(reading.node, undefined);
  });

  test("a bare approval key is refused too, because the key is the thing that moved", () => {
    // Every other key reads as absent when it is written with nothing under
    // it. This one is refused all the same: half a deletion by hand is still a
    // file with the retired key in it, and the sentence is what says so.
    const bare = PROPOSED.replace("---\n\n## Statement", "approval:\n---\n\n## Statement");
    const reading = parseNodeFile("Requirement", "R-0001.md", bare);
    assert.deepEqual(reading.problems, [APPROVAL_MOVED]);
    assert.equal(reading.node, undefined);
  });

  test("a value in a block that is not text is the block's own sentence", () => {
    const numbered = PROPOSED.replace(
      "  rationale: Superseded by R-0007.\n",
      "  rationale: 3\n",
    );
    const reading = parseNodeFile("Requirement", "R-0001.md", numbered);
    assert.deepEqual(reading.problems, [
      "The deletionProposed block is a map of exactly by and rationale, each of them text.",
    ]);
  });

  test("a rationale that runs over two lines is refused, because a block value is one line", () => {
    const paragraphs = PROPOSED.replace(
      "  rationale: Superseded by R-0007.\n",
      "  rationale: |\n    Superseded by R-0007.\n    And by R-0008.\n",
    );
    const reading = parseNodeFile("Requirement", "R-0001.md", paragraphs);
    assert.deepEqual(reading.problems, [
      "A deletion rationale cannot contain a control character.",
    ]);
  });

  test("a blank block value is refused by name", () => {
    const blank = PROPOSED.replace(
      "  rationale: Superseded by R-0007.\n",
      '  rationale: ""\n',
    );
    const reading = parseNodeFile("Requirement", "R-0001.md", blank);
    assert.deepEqual(reading.problems, ["A deletion rationale is required."]);
  });

  test("every corpus value survives a whole file as a rationale", () => {
    // The read-back door parses what the emitter wrote, so a rationale the
    // scalar rule cannot round-trip would refuse an approve or a proposal at
    // write time — this is that door's guard, run over the whole corpus. The
    // comparison is against the TRIMMED value, because a block value is
    // identity-judged on the way in.
    for (const entry of SCALARS) {
      const value = entry.value.trim();
      if (value === "" || /\p{Cc}/u.test(value)) {
        continue;
      }
      const written = emitNodeFile("Requirement", REQUIREMENT_NODE, [], {
        deletionProposed: { by: "session-7", rationale: value },
      });
      const reading = parseNodeFile("Requirement", "R-0001.md", written);
      assert.deepEqual(reading.problems, [], JSON.stringify(entry.value));
      assert.equal(
        reading.node?.deletionProposed?.rationale,
        value,
        JSON.stringify(entry.value),
      );
      assert.equal(isCanonical("Requirement", "R-0001.md", written), true);
    }
  });

  test("the payload is the canonical file itself, with the node's own address on top", () => {
    const reading = parseNodeFile("Requirement", "R-0001.md", PROPOSED);
    assert.ok(reading.node !== undefined);
    const payload = approvalPayload(
      "Requirement",
      "R-0001",
      reading.node,
      reading.edges,
      reading.node,
    );
    // The property a person can verify by hand: nothing is taken out of the
    // file and nothing is added but the address line, so the bytes a hash is
    // taken over are the bytes they are looking at. The proposal is inside,
    // which is what makes an agent writing one break the hash.
    assert.equal(payload, `Requirement/R-0001\n${PROPOSED}`);
    assert.equal(payload.includes("deletionProposed:"), true);
  });

  test("the payload names the node's own path, so an approved file copied to another id verifies nowhere", () => {
    const reading = parseNodeFile("Requirement", "R-0001.md", PROPOSED);
    assert.ok(reading.node !== undefined);
    const here = approvalPayload(
      "Requirement",
      "R-0001",
      reading.node,
      reading.edges,
      reading.node,
    );
    const there = approvalPayload(
      "Requirement",
      "R-0009",
      reading.node,
      reading.edges,
      reading.node,
    );
    assert.ok(here.startsWith("Requirement/R-0001\n"));
    assert.notEqual(here, there);
    assert.equal(here.slice(here.indexOf("\n")), there.slice(there.indexOf("\n")));
  });
});

/**
 * THE WORKLOG'S COMMITS. The Commit node type is gone; the commits a piece of
 * work produced are a list of shas in the WorkLog's own frontmatter — the sha
 * and nothing else, in the order they were made, because the message and the
 * rest are git's to answer for — and no other type carries the key. What is
 * pinned here is the shape, the order (author's, never sorted), the fixpoint,
 * the quoting of a sha that reads as a number, and the two sentences: one for
 * a malformed entry and one for the key on a type that has no business with it.
 */
const LOGGED = `---
short_name: day-one
name: The first day's work
edges:
  - type: SUBMITS
    to: EV-0001
commits:
  - 9f2b1c4
  - "1234567"
---

## Narrative

The key landed.
`;

describe("the WorkLog's commits", () => {
  test("a commits list reads back as the shas it carries, in order", () => {
    const reading = parseNodeFile("WorkLog", "WL-0001.md", LOGGED);
    assert.deepEqual(reading.problems, []);
    assert.deepEqual(reading.node?.commits, ["9f2b1c4", "1234567"]);
  });

  test("the list is written after the edges, in the author's order, and the file is a fixpoint", () => {
    const reading = parseNodeFile("WorkLog", "WL-0001.md", LOGGED);
    assert.ok(reading.node !== undefined);
    assert.equal(
      emitNodeFile(reading.node.type, reading.node, reading.edges, reading.node),
      LOGGED,
    );
    assert.equal(isCanonical("WorkLog", "WL-0001.md", LOGGED), true);
  });

  test("a sha of nothing but digits is quoted, and comes back the string it is", () => {
    // Seven hex digits can all be decimal digits, and written plain a YAML
    // reader hands back a number — the whole reason every scalar goes through
    // the one rule. Read back with the quotes gone by hand, the core schema
    // makes it a number and the reader refuses it as not text.
    const written = emitNodeFile("WorkLog", { shortName: "d", name: "D", body: "", commits: ["1234567"] }, []);
    assert.ok(written.includes('  - "1234567"\n'), written);
    const bare = written.replace('  - "1234567"', "  - 1234567");
    assert.deepEqual(parseNodeFile("WorkLog", "WL-0001.md", bare).problems, [
      "Every entry under commits is a commit sha, as text.",
    ]);
  });

  test("a work log without commits has no key for them, in the object as in the file", () => {
    const written = emitNodeFile("WorkLog", { shortName: "d", name: "D", body: "" }, []);
    assert.equal(written.includes("commits"), false);
    const reading = parseNodeFile("WorkLog", "WL-0001.md", written);
    assert.ok(reading.node !== undefined);
    assert.equal("commits" in reading.node, false);
  });

  test("an empty list is a list of no commits, read as absent", () => {
    const bare = LOGGED.replace(
      'commits:\n  - 9f2b1c4\n  - "1234567"\n',
      "commits: []\n",
    );
    const reading = parseNodeFile("WorkLog", "WL-0001.md", bare);
    assert.deepEqual(reading.problems, []);
    assert.ok(reading.node !== undefined);
    assert.equal("commits" in reading.node, false);
    assert.equal(isCanonical("WorkLog", "WL-0001.md", bare), false);
  });

  test("an entry that is not text is one sentence about the list", () => {
    const mapped = LOGGED.replace(
      "  - 9f2b1c4\n",
      "  - sha: 9f2b1c4\n    message: not any more\n",
    );
    assert.deepEqual(parseNodeFile("WorkLog", "WL-0001.md", mapped).problems, [
      "Every entry under commits is a commit sha, as text.",
    ]);
  });

  test("a blank sha is refused by name", () => {
    const blank = LOGGED.replace("  - 9f2b1c4\n", '  - ""\n');
    assert.deepEqual(parseNodeFile("WorkLog", "WL-0001.md", blank).problems, [
      "A commit sha is required.",
    ]);
  });

  test("commits on any other type is refused by name, not as a stray", () => {
    const misplaced = `---
short_name: r
name: R
commits:
  - 9f2b1c4
---
`;
    assert.deepEqual(parseNodeFile("Requirement", "R-0001.md", misplaced).problems, [
      "A Requirement does not carry commits — only a WorkLog records the commits its work produced.",
    ]);
  });

  test("the stray sentence names commits on a WorkLog and not elsewhere", () => {
    const strayLog = LOGGED.replace("commits:\n", "priority: high\ncommits:\n");
    assert.deepEqual(parseNodeFile("WorkLog", "WL-0001.md", strayLog).problems, [
      "The frontmatter carries short_name, name, edges, commits and deletionProposed and nothing else — priority belongs in the body, below the closing fence.",
    ]);
    const strayReq = `---
short_name: r
name: R
priority: high
---
`;
    assert.deepEqual(parseNodeFile("Requirement", "R-0001.md", strayReq).problems, [
      "The frontmatter carries short_name, name, edges and deletionProposed and nothing else — priority belongs in the body, below the closing fence.",
    ]);
  });

  test("the commits are inside the payload the ledger's hash names", () => {
    const reading = parseNodeFile("WorkLog", "WL-0001.md", LOGGED);
    assert.ok(reading.node !== undefined);
    const payload = approvalPayload("WorkLog", "WL-0001", reading.node, reading.edges, reading.node);
    assert.ok(payload.includes("commits:"), payload);
    const fewer = approvalPayload(
      "WorkLog",
      "WL-0001",
      { ...reading.node, commits: reading.node.commits?.slice(0, 1) },
      reading.edges,
      reading.node,
    );
    assert.notEqual(payload, fewer);
  });
});

/**
 * The approval ledger — the one other file Shall writes. Held as goldens for
 * the same reason the node file is: these bytes are committed beside the spec,
 * and a byte that moves is a diff on a day nobody approved anything.
 */
describe("the approval ledger", () => {
  const RECORD: ApprovalRecord = {
    approvedHash:
      "sha256:9f2b1c0000000000000000000000000000000000000000000000000000000000",
    by: "yjshin",
    at: "2026-08-15T09:12:33.412Z",
  };
  const LEDGER = [
    "G-0001:",
    "  approvedHash: sha256:9f2b1c0000000000000000000000000000000000000000000000000000000000",
    "  by: yjshin",
    '  at: "2026-08-15T09:12:33.412Z"',
    "R-0001:",
    "  approvedHash: sha256:aa",
    "  by: someone",
    '  at: "2026-08-15T10:00:00.000Z"',
    "",
  ].join("\n");

  test("a ledger reads back as one record per id, and nothing else", () => {
    const reading = parseApprovalLedger(LEDGER);
    assert.equal(reading.problem, null);
    assert.deepEqual(
      [...reading.records.entries()],
      [
        ["G-0001", RECORD],
        [
          "R-0001",
          { approvedHash: "sha256:aa", by: "someone", at: "2026-08-15T10:00:00.000Z" },
        ],
      ],
    );
  });

  test("an absent ledger and an empty one are the same nothing", () => {
    for (const text of ["", "\n", "# nothing approved yet\n"]) {
      const reading = parseApprovalLedger(text);
      assert.equal(reading.problem, null, JSON.stringify(text));
      assert.equal(reading.records.size, 0);
    }
    assert.equal(emitApprovalLedger(new Map()), "");
  });

  test("the ids are written in byte order, and the file is a fixpoint", () => {
    const records = new Map<string, ApprovalRecord>([
      ["R-0001", { approvedHash: "sha256:aa", by: "someone", at: "2026-08-15T10:00:00.000Z" }],
      ["G-0001", RECORD],
    ]);
    const written = emitApprovalLedger(records);
    assert.equal(written, LEDGER);
    const reading = parseApprovalLedger(written);
    assert.equal(reading.problem, null);
    assert.equal(emitApprovalLedger(reading.records), written);
  });

  test("a hand-written ledger in another spelling reads, and comes back canonical", () => {
    const loose = [
      "# approvals",
      "R-0001: { approvedHash: 'sha256:aa', by: someone, at: '2026-08-15T10:00:00.000Z' }",
      "'G-0001':",
      "    at: 2026-08-15T09:12:33.412Z",
      "    by: yjshin",
      "    approvedHash: sha256:9f2b1c0000000000000000000000000000000000000000000000000000000000",
      "",
    ].join("\n");
    const reading = parseApprovalLedger(loose);
    assert.equal(reading.problem, null);
    assert.equal(emitApprovalLedger(reading.records), LEDGER);
  });

  test("an id that reads as a number is quoted, and comes back the string it is", () => {
    const records = new Map<string, ApprovalRecord>([["1234", RECORD]]);
    const written = emitApprovalLedger(records);
    assert.ok(written.startsWith('"1234":\n'), written);
    const reading = parseApprovalLedger(written);
    assert.equal(reading.problem, null);
    assert.deepEqual([...reading.records.keys()], ["1234"]);
  });

  test("a record of anything but approvedHash, by and at is one sentence about that id", () => {
    const shape =
      "Every record in the approval ledger is a map of exactly approvedHash, by and at, each of them text — the record under G-0001 is not.";
    for (const text of [
      "G-0001:\n  approvedHash: sha256:aa\n  by: yjshin\n",
      "G-0001:\n  approvedHash: sha256:aa\n  by: yjshin\n  at: x\n  note: looks fine\n",
      "G-0001:\n  approvedHash: sha256:aa\n  by: yjshin\n  at: 12\n",
      "G-0001: approved\n",
      "G-0001:\n  - approvedHash: sha256:aa\n",
    ]) {
      assert.equal(parseApprovalLedger(text).problem, shape, text);
    }
  });

  test("a blank value in a record is named under its id", () => {
    assert.equal(
      parseApprovalLedger("G-0001:\n  approvedHash: sha256:aa\n  by: ''\n  at: x\n").problem,
      "Under G-0001, an approver is required.",
    );
    assert.equal(
      parseApprovalLedger("G-0001:\n  approvedHash: '  '\n  by: yjshin\n  at: x\n").problem,
      "Under G-0001, an approved hash is required.",
    );
    assert.equal(
      parseApprovalLedger('G-0001:\n  approvedHash: sha256:aa\n  by: yjshin\n  at: "a\\tb"\n').problem,
      "Under G-0001, an approval instant cannot contain a control character.",
    );
  });

  test("an id written twice is refused, because an approval has one latest", () => {
    const twice = `${LEDGER}G-0001:\n  approvedHash: sha256:bb\n  by: later\n  at: x\n`;
    assert.equal(
      parseApprovalLedger(twice).problem,
      "The approval ledger is not YAML Shall can read: Map keys must be unique.",
    );
  });

  test("an id written once bare and once quoted is refused, though YAML calls them different keys", () => {
    const record = "  approvedHash: sha256:aa\n  by: a\n  at: x\n";
    for (const [bare, id] of [
      ["1234", "1234"],
      ["true", "true"],
    ] as const) {
      assert.equal(
        parseApprovalLedger(`${bare}:\n${record}"${id}":\n${record}`).problem,
        `${id} is written twice in the approval ledger, once bare and once quoted — YAML reads two keys and Shall one id, and an approval has one latest record.`,
        bare,
      );
    }
  });

  test("a blank id is refused, because a record belongs to a node", () => {
    const record = "  approvedHash: sha256:aa\n  by: a\n  at: x\n";
    for (const text of [
      `null:\n${record}`,
      `~:\n${record}`,
      // A null key beside the id "null" is not that id written twice: one of
      // them names no node at all, and that is what is said.
      `~:\n${record}"null":\n${record}`,
    ]) {
      assert.equal(
        parseApprovalLedger(text).problem,
        "A record in the approval ledger names no node id.",
        text,
      );
    }
    assert.equal(
      parseApprovalLedger("CON:\n  approvedHash: sha256:aa\n  by: a\n  at: x\n").problem,
      'The approval ledger names "CON", which is not a node id. CON is a reserved device name on Windows, so no file can be named after it. Choose another id.',
    );
  });

  test("a ledger that is a list is refused as the shape it is", () => {
    assert.equal(
      parseApprovalLedger("- G-0001\n").problem,
      "The approval ledger is a list, not a map from node id to approval record.",
    );
    assert.equal(
      parseApprovalLedger("approved\n").problem,
      "The approval ledger is text, not a map from node id to approval record.",
    );
  });

  test("a second document inside the ledger is refused rather than silently dropped", () => {
    assert.equal(
      parseApprovalLedger(`${LEDGER}---\nX-1:\n  approvedHash: sha256:cc\n  by: c\n  at: z\n`).problem,
      'The approval ledger is not YAML Shall can read: a "..." or "---" line inside it ends the ledger early, so the records after that line belong to nobody.',
    );
  });

  test("a ledger that is not YAML at all is refused in the library's own words", () => {
    const reading = parseApprovalLedger("G-0001: [\n");
    assert.ok(reading.problem?.startsWith("The approval ledger is not YAML Shall can read: "), reading.problem ?? "");
    assert.equal(reading.records.size, 0);
  });

  test("every corpus value survives a whole ledger as an approver's name", () => {
    for (const entry of SCALARS) {
      const value = entry.value.trim();
      if (value === "" || /\p{Cc}/u.test(value)) {
        continue;
      }
      const written = emitApprovalLedger(new Map([["G-0001", { ...RECORD, by: value }]]));
      const reading = parseApprovalLedger(written);
      assert.equal(reading.problem, null, JSON.stringify(entry.value));
      assert.equal(reading.records.get("G-0001")?.by, value, JSON.stringify(entry.value));
      assert.equal(emitApprovalLedger(reading.records), written);
    }
  });
});

/**
 * The rejection ledger — the second book, held as goldens for the same reason
 * the first one is. Its shape is the approval ledger's plus one field, and the
 * cases below are deliberately the same cases in the same order, because the
 * two readers share a root and a reader that drifts is a reader that stopped
 * sharing it.
 */
describe("the rejection ledger", () => {
  /** One line, and plain: nothing in it is an indicator or a number. */
  const SHORT = "The acceptance criteria do not say what happens on a declined card.";
  /** Three lines, which is what a Textarea gives back and what `\n` is for. */
  const LONG = [
    "Two things:",
    "- the log is not attached",
    "- the command is not the one in the plan",
  ].join("\n");

  const RECORD: RejectionRecord = {
    rejectedHash:
      "sha256:9f2b1c0000000000000000000000000000000000000000000000000000000000",
    by: "yjshin",
    at: "2026-08-16T09:12:33.412Z",
    rationale: SHORT,
  };
  const OTHER: RejectionRecord = {
    rejectedHash: "sha256:aa",
    by: "someone",
    at: "2026-08-16T10:00:00.000Z",
    rationale: LONG,
  };
  const LEDGER = [
    "EV-0002:",
    "  rejectedHash: sha256:aa",
    "  by: someone",
    '  at: "2026-08-16T10:00:00.000Z"',
    '  rationale: "Two things:\\n- the log is not attached\\n- the command is not the one in the plan"',
    "R-0001:",
    "  rejectedHash: sha256:9f2b1c0000000000000000000000000000000000000000000000000000000000",
    "  by: yjshin",
    '  at: "2026-08-16T09:12:33.412Z"',
    "  rationale: The acceptance criteria do not say what happens on a declined card.",
    "",
  ].join("\n");

  test("a ledger reads back as one record per id, and nothing else", () => {
    const reading = parseRejectionLedger(LEDGER);
    assert.equal(reading.problem, null);
    assert.deepEqual(
      [...reading.records.entries()],
      [
        ["EV-0002", OTHER],
        ["R-0001", RECORD],
      ],
    );
  });

  test("an absent ledger and an empty one are the same nothing", () => {
    for (const text of ["", "\n", "# nothing rejected yet\n"]) {
      const reading = parseRejectionLedger(text);
      assert.equal(reading.problem, null, JSON.stringify(text));
      assert.equal(reading.records.size, 0);
    }
    assert.equal(emitRejectionLedger(new Map()), "");
  });

  test("the ids are written in byte order, and the file is a fixpoint", () => {
    const records = new Map<string, RejectionRecord>([
      ["R-0001", RECORD],
      ["EV-0002", OTHER],
    ]);
    const written = emitRejectionLedger(records);
    assert.equal(written, LEDGER);
    const reading = parseRejectionLedger(written);
    assert.equal(reading.problem, null);
    assert.equal(emitRejectionLedger(reading.records), written);
  });

  test("a hand-written ledger in another spelling reads, and comes back canonical", () => {
    const loose = [
      "# rejections",
      `EV-0002: { rejectedHash: 'sha256:aa', by: someone, at: '2026-08-16T10:00:00.000Z', rationale: "Two things:\\n- the log is not attached\\n- the command is not the one in the plan" }`,
      "'R-0001':",
      "    at: 2026-08-16T09:12:33.412Z",
      "    by: yjshin",
      // A literal block is how a person would write three lines by hand, and it
      // comes back as the one quoted scalar the emitter writes.
      "    rationale: |-",
      `      ${SHORT}`,
      "    rejectedHash: sha256:9f2b1c0000000000000000000000000000000000000000000000000000000000",
      "",
    ].join("\n");
    const reading = parseRejectionLedger(loose);
    assert.equal(reading.problem, null);
    assert.equal(emitRejectionLedger(reading.records), LEDGER);
  });

  test("a rationale of several lines round-trips, quoted, with the breaks escaped", () => {
    const written = emitRejectionLedger(new Map([["R-0001", OTHER]]));
    assert.ok(
      written.includes(
        '  rationale: "Two things:\\n- the log is not attached\\n- the command is not the one in the plan"\n',
      ),
      written,
    );
    // The bytes hold a backslash and an n, and the value holds a line break.
    assert.ok(!written.includes("\n- the log"), written);
    assert.equal(
      parseRejectionLedger(written).records.get("R-0001")?.rationale,
      LONG,
    );
  });

  test("an id that reads as a number is quoted, and comes back the string it is", () => {
    const records = new Map<string, RejectionRecord>([["1234", RECORD]]);
    const written = emitRejectionLedger(records);
    assert.ok(written.startsWith('"1234":\n'), written);
    const reading = parseRejectionLedger(written);
    assert.equal(reading.problem, null);
    assert.deepEqual([...reading.records.keys()], ["1234"]);
  });

  test("a record of anything but the four fields is one sentence about that id", () => {
    const shape =
      "Every record in the rejection ledger is a map of rejectedHash, by, at and rationale, each of them text — with one map of what was left open over it, evidence for a criterion or workLogs for a task, holding at least one entry and never both — the record under R-0001 is not.";
    for (const text of [
      "R-0001:\n  rejectedHash: sha256:aa\n  by: yjshin\n  at: x\n",
      "R-0001:\n  rejectedHash: sha256:aa\n  by: yjshin\n  at: x\n  rationale: why\n  note: looks fine\n",
      "R-0001:\n  rejectedHash: sha256:aa\n  by: yjshin\n  at: 12\n  rationale: why\n",
      // A rationale written as an empty value is null and not text, which is a
      // shape and not a blank — the blank is the empty string, below.
      "R-0001:\n  rejectedHash: sha256:aa\n  by: yjshin\n  at: x\n  rationale:\n",
      "R-0001: rejected\n",
      "R-0001:\n  - rejectedHash: sha256:aa\n",
      // An evidence map that is empty, null, a list or holds a non-hash: the
      // fifth key is allowed only as the map a left-open criterion needs.
      "R-0001:\n  rejectedHash: sha256:aa\n  evidence:\n  by: yjshin\n  at: x\n  rationale: why\n",
      "R-0001:\n  rejectedHash: sha256:aa\n  evidence: {}\n  by: yjshin\n  at: x\n  rationale: why\n",
      "R-0001:\n  rejectedHash: sha256:aa\n  evidence: []\n  by: yjshin\n  at: x\n  rationale: why\n",
      "R-0001:\n  rejectedHash: sha256:aa\n  evidence:\n    EV-0001: 12\n  by: yjshin\n  at: x\n  rationale: why\n",
    ]) {
      assert.equal(parseRejectionLedger(text).problem, shape, text);
    }
  });

  test("a task left open carries the work logs it was judged on, under their own key", () => {
    // The other book's other arm: the same map, named for what it holds, and a
    // record carrying both names refused rather than guessed at.
    const record: RejectionRecord = {
      rejectedHash: "sha256:it",
      by: "yjshin",
      at: "2026-08-17T10:02:11.913Z",
      rationale: "WL-0003 stops at the happy path; the retry is not shown.",
      leftOpen: {
        kind: "task",
        claimants: new Map([["WL-0003", "sha256:22"]]),
      },
    };
    const written = emitRejectionLedger(new Map([["IT-0007", record]]));
    assert.equal(
      written,
      [
        "IT-0007:",
        "  rejectedHash: sha256:it",
        "  workLogs:",
        "    WL-0003: sha256:22",
        "  by: yjshin",
        '  at: "2026-08-17T10:02:11.913Z"',
        "  rationale: WL-0003 stops at the happy path; the retry is not shown.",
        "",
      ].join("\n"),
    );
    const reading = parseRejectionLedger(written);
    assert.equal(reading.problem, null);
    assert.deepEqual(reading.records.get("IT-0007"), record);
    assert.equal(emitRejectionLedger(reading.records), written);
    assert.equal(
      parseRejectionLedger(
        "IT-0007:\n  rejectedHash: sha256:it\n  evidence:\n    EV-0001: sha256:aa\n  workLogs:\n    WL-0003: sha256:22\n  by: yjshin\n  at: x\n  rationale: why\n",
      ).problem,
      "Every record in the rejection ledger is a map of rejectedHash, by, at and rationale, each of them text — with one map of what was left open over it, evidence for a criterion or workLogs for a task, holding at least one entry and never both — the record under IT-0007 is not.",
    );
    assert.equal(
      parseRejectionLedger(
        "IT-0007:\n  rejectedHash: sha256:it\n  workLogs:\n    1234: sha256:aa\n    \"1234\": sha256:bb\n  by: yjshin\n  at: x\n  rationale: why\n",
      ).problem,
      "1234 is written twice under IT-0007 in the rejection ledger, once bare and once quoted — YAML reads two keys and Shall one id, and a task left open names one hash for each work log.",
    );
  });

  test("a criterion left open carries the evidence it was judged on, and reads back the same", () => {
    // The fifth key: every claimant at the moment of the judgement, id → hash,
    // written between the hash and the by/at like the acceptance ledger's map,
    // sorted, quoted where an id would read as a number, and refused if two
    // spellings of one id are both written.
    const record: RejectionRecord = {
      rejectedHash: "sha256:ac",
      by: "yjshin",
      at: "2026-08-16T11:00:00.000Z",
      rationale: "The log covers the happy path only.",
      leftOpen: {
        kind: "criterion",
        claimants: new Map([
          ["EV-0002", "sha256:bb"],
          ["EV-0001", "sha256:aa"],
        ]),
      },
    };
    const written = emitRejectionLedger(new Map([["AC-0001", record]]));
    assert.equal(
      written,
      [
        "AC-0001:",
        "  rejectedHash: sha256:ac",
        "  evidence:",
        "    EV-0001: sha256:aa",
        "    EV-0002: sha256:bb",
        "  by: yjshin",
        '  at: "2026-08-16T11:00:00.000Z"',
        "  rationale: The log covers the happy path only.",
        "",
      ].join("\n"),
    );
    const reading = parseRejectionLedger(written);
    assert.equal(reading.problem, null);
    assert.deepEqual(reading.records.get("AC-0001"), record);
    assert.equal(emitRejectionLedger(reading.records), written);
    // A node rejection beside it has no map, and the two live in one book.
    const both = emitRejectionLedger(
      new Map([
        ["AC-0001", record],
        ["R-0001", { rejectedHash: "sha256:rr", by: "yjshin", at: "x", rationale: "No." }],
      ]),
    );
    const back = parseRejectionLedger(both);
    assert.equal(back.problem, null);
    assert.equal(back.records.get("R-0001")?.leftOpen, undefined);
    assert.equal(back.records.get("AC-0001")?.leftOpen?.claimants.size, 2);
    // Twin keys inside the map, and an entry that names no node.
    assert.equal(
      parseRejectionLedger(
        "AC-0001:\n  rejectedHash: sha256:ac\n  evidence:\n    1234: sha256:aa\n    \"1234\": sha256:bb\n  by: yjshin\n  at: x\n  rationale: why\n",
      ).problem,
      "1234 is written twice under AC-0001 in the rejection ledger, once bare and once quoted — YAML reads two keys and Shall one id, and a criterion left open names one hash for each piece of evidence.",
    );
    assert.equal(
      parseRejectionLedger(
        "AC-0001:\n  rejectedHash: sha256:ac\n  evidence:\n    CON: sha256:aa\n  by: yjshin\n  at: x\n  rationale: why\n",
      ).problem,
      'Under AC-0001, "CON" is not a node id. CON is a reserved device name on Windows, so no file can be named after it. Choose another id.',
    );
  });

  test("a blank value in a record is named under its id", () => {
    const rest = "  at: x\n  rationale: why\n";
    assert.equal(
      parseRejectionLedger(`R-0001:\n  rejectedHash: sha256:aa\n  by: ''\n${rest}`).problem,
      "Under R-0001, a rejecter is required.",
    );
    assert.equal(
      parseRejectionLedger(`R-0001:\n  rejectedHash: '  '\n  by: yjshin\n${rest}`).problem,
      "Under R-0001, a rejected hash is required.",
    );
    assert.equal(
      parseRejectionLedger(
        'R-0001:\n  rejectedHash: sha256:aa\n  by: yjshin\n  at: "a\\tb"\n  rationale: why\n',
      ).problem,
      "Under R-0001, a rejection instant cannot contain a control character.",
    );
  });

  test("a rationale that is blank is refused, because a rejection is its reason", () => {
    for (const rationale of ["''", "'   '", '"\\n\\n"']) {
      assert.equal(
        parseRejectionLedger(
          `R-0001:\n  rejectedHash: sha256:aa\n  by: yjshin\n  at: x\n  rationale: ${rationale}\n`,
        ).problem,
        "Under R-0001, a rationale is required.",
        rationale,
      );
    }
  });

  test("a rationale carrying what no text file can carry is refused in the body's own words", () => {
    // The label is `judgeBody`'s and not this book's: the rationale is judged by
    // the very function a node's specification goes through, so that a sentence
    // the panel can save is a sentence this file accepts.
    assert.equal(
      parseRejectionLedger(
        `R-0001:\n  rejectedHash: sha256:aa\n  by: yjshin\n  at: x\n  rationale: "a\\u0000b"\n`,
      ).problem,
      "Under R-0001, the specification cannot contain a NUL character.",
    );
  });

  test("an id written twice is refused, because a rejection has one latest", () => {
    const twice = `${LEDGER}R-0001:\n  rejectedHash: sha256:bb\n  by: later\n  at: x\n  rationale: again\n`;
    assert.equal(
      parseRejectionLedger(twice).problem,
      "The rejection ledger is not YAML Shall can read: Map keys must be unique.",
    );
  });

  test("an id written once bare and once quoted is refused, though YAML calls them different keys", () => {
    const record = "  rejectedHash: sha256:aa\n  by: a\n  at: x\n  rationale: why\n";
    for (const [bare, id] of [
      ["1234", "1234"],
      ["true", "true"],
    ] as const) {
      assert.equal(
        parseRejectionLedger(`${bare}:\n${record}"${id}":\n${record}`).problem,
        `${id} is written twice in the rejection ledger, once bare and once quoted — YAML reads two keys and Shall one id, and a rejection has one latest record.`,
        bare,
      );
    }
  });

  test("a blank id is refused, because a record belongs to a node", () => {
    const record = "  rejectedHash: sha256:aa\n  by: a\n  at: x\n  rationale: why\n";
    assert.equal(
      parseRejectionLedger(`~:\n${record}`).problem,
      "A record in the rejection ledger names no node id.",
    );
    assert.equal(
      parseRejectionLedger(`CON:\n${record}`).problem,
      'The rejection ledger names "CON", which is not a node id. CON is a reserved device name on Windows, so no file can be named after it. Choose another id.',
    );
  });

  test("a ledger that is a list is refused as the shape it is", () => {
    assert.equal(
      parseRejectionLedger("- R-0001\n").problem,
      "The rejection ledger is a list, not a map from node id to rejection record.",
    );
    assert.equal(
      parseRejectionLedger("rejected\n").problem,
      "The rejection ledger is text, not a map from node id to rejection record.",
    );
  });

  test("a second document inside the ledger is refused rather than silently dropped", () => {
    assert.equal(
      parseRejectionLedger(
        `${LEDGER}---\nX-1:\n  rejectedHash: sha256:cc\n  by: c\n  at: z\n  rationale: why\n`,
      ).problem,
      'The rejection ledger is not YAML Shall can read: a "..." or "---" line inside it ends the ledger early, so the records after that line belong to nobody.',
    );
  });

  test("a ledger that is not YAML at all is refused in the library's own words", () => {
    const reading = parseRejectionLedger("R-0001: [\n");
    assert.ok(
      reading.problem?.startsWith("The rejection ledger is not YAML Shall can read: "),
      reading.problem ?? "",
    );
    assert.equal(reading.records.size, 0);
  });

  test("every corpus value survives a whole ledger as a rationale", () => {
    for (const entry of SCALARS) {
      const written = emitRejectionLedger(
        new Map([["R-0001", { ...RECORD, rationale: entry.value }]]),
      );
      const reading = parseRejectionLedger(written);
      assert.equal(reading.problem, null, JSON.stringify(entry.value));
      assert.equal(
        reading.records.get("R-0001")?.rationale,
        entry.value,
        JSON.stringify(entry.value),
      );
      assert.equal(emitRejectionLedger(reading.records), written);
    }
  });
});

/**
 * The acceptance ledger — the third book, and the only one with a map inside a
 * record. Everything the other two claim is claimed again here, plus what the
 * nesting brings with it: an evidence id is a node id, an evidence hash is an
 * identity, an acceptance names at least one of them, and a nested key written
 * twice is caught where `toJS()` would have hidden it.
 */
describe("the acceptance ledger", () => {
  const RECORD: AcceptanceRecord = {
    kind: "criterion",
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
    kind: "criterion",
    subjectHash: "sha256:cc",
    claimants: new Map([["EV-0003", "sha256:dd"]]),
    by: "someone",
    at: "2026-08-16T10:00:00.000Z",
  };
  const LEDGER = [
    "AC-0001:",
    "  acHash: sha256:9f2b1c0000000000000000000000000000000000000000000000000000000000",
    "  evidence:",
    "    EV-0001: sha256:aa",
    "    EV-0002: sha256:bb",
    "  by: yjshin",
    '  at: "2026-08-16T09:12:33.412Z"',
    "AC-0002:",
    "  acHash: sha256:cc",
    "  evidence:",
    "    EV-0003: sha256:dd",
    "  by: someone",
    '  at: "2026-08-16T10:00:00.000Z"',
    "",
  ].join("\n");

  test("a ledger reads back as one record per id, and nothing else", () => {
    const reading = parseAcceptanceLedger(LEDGER);
    assert.equal(reading.problem, null);
    assert.deepEqual(
      [...reading.records.entries()],
      [
        ["AC-0001", RECORD],
        ["AC-0002", OTHER],
      ],
    );
  });

  test("an absent ledger and an empty one are the same nothing", () => {
    for (const text of ["", "\n", "# nothing closed yet\n"]) {
      const reading = parseAcceptanceLedger(text);
      assert.equal(reading.problem, null, JSON.stringify(text));
      assert.equal(reading.records.size, 0);
    }
    assert.equal(emitAcceptanceLedger(new Map()), "");
  });

  test("the ids are written in byte order, inside and out, and the file is a fixpoint", () => {
    const records = new Map<string, AcceptanceRecord>([
      ["AC-0002", OTHER],
      [
        "AC-0001",
        {
          ...RECORD,
          // Handed in the other way round, so the sort is what the bytes owe.
          claimants: new Map([
            ["EV-0002", "sha256:bb"],
            ["EV-0001", "sha256:aa"],
          ]),
        },
      ],
    ]);
    const written = emitAcceptanceLedger(records);
    assert.equal(written, LEDGER);
    const reading = parseAcceptanceLedger(written);
    assert.equal(reading.problem, null);
    assert.equal(emitAcceptanceLedger(reading.records), written);
  });

  test("a hand-written ledger in another spelling reads, and comes back canonical", () => {
    const loose = [
      "# acceptances",
      "AC-0002: { acHash: 'sha256:cc', evidence: { EV-0003: sha256:dd }, by: someone, at: '2026-08-16T10:00:00.000Z' }",
      "'AC-0001':",
      "    at: 2026-08-16T09:12:33.412Z",
      "    evidence:",
      "        'EV-0002': sha256:bb",
      "        EV-0001: sha256:aa",
      "    by: yjshin",
      "    acHash: sha256:9f2b1c0000000000000000000000000000000000000000000000000000000000",
      "",
    ].join("\n");
    const reading = parseAcceptanceLedger(loose);
    assert.equal(reading.problem, null);
    assert.equal(emitAcceptanceLedger(reading.records), LEDGER);
  });

  test("an id that reads as a number is quoted, outside and inside", () => {
    const records = new Map<string, AcceptanceRecord>([
      ["1234", { ...RECORD, claimants: new Map([["5678", "sha256:aa"]]) }],
    ]);
    const written = emitAcceptanceLedger(records);
    assert.ok(written.startsWith('"1234":\n'), written);
    assert.ok(written.includes('    "5678": sha256:aa\n'), written);
    const reading = parseAcceptanceLedger(written);
    assert.equal(reading.problem, null);
    assert.deepEqual([...reading.records.keys()], ["1234"]);
    assert.deepEqual(
      [...(reading.records.get("1234")?.claimants.entries() ?? [])],
      [["5678", "sha256:aa"]],
    );
  });

  test("a task closes under its own two key names, beside a criterion in one book", () => {
    // THE SAME RECORD SHAPE, WRITTEN FOR WHAT IT HOLDS. A criterion is closed on
    // evidence and a task on the work that addressed it, so the keys say which —
    // and the criterion's bytes are exactly what they were before tasks existed,
    // which is what keeps every acceptances.yaml already on disk readable.
    const task: AcceptanceRecord = {
      kind: "task",
      subjectHash: "sha256:11",
      claimants: new Map([
        ["WL-0009", "sha256:33"],
        ["WL-0003", "sha256:22"],
      ]),
      by: "yjshin",
      at: "2026-08-17T09:41:02.108Z",
    };
    const written = emitAcceptanceLedger(
      new Map([
        ["IT-0007", task],
        ["AC-0001", RECORD],
      ]),
    );
    assert.equal(
      written,
      [
        "AC-0001:",
        "  acHash: sha256:9f2b1c0000000000000000000000000000000000000000000000000000000000",
        "  evidence:",
        "    EV-0001: sha256:aa",
        "    EV-0002: sha256:bb",
        "  by: yjshin",
        '  at: "2026-08-16T09:12:33.412Z"',
        "IT-0007:",
        "  taskHash: sha256:11",
        "  workLogs:",
        "    WL-0003: sha256:22",
        "    WL-0009: sha256:33",
        "  by: yjshin",
        '  at: "2026-08-17T09:41:02.108Z"',
        "",
      ].join("\n"),
    );
    const reading = parseAcceptanceLedger(written);
    assert.equal(reading.problem, null);
    assert.deepEqual([...reading.records.keys()], ["AC-0001", "IT-0007"]);
    assert.deepEqual(reading.records.get("IT-0007"), task);
    assert.deepEqual(reading.records.get("AC-0001"), RECORD);
    assert.equal(emitAcceptanceLedger(reading.records), written);
  });

  test("a record naming both closed things, or one of each, is refused", () => {
    // Guessing which half a hand-edit meant would close something on a list
    // nobody chose, so the whole record is refused and the sentence says why.
    const shape =
      "Every record in the acceptance ledger is a map of exactly by, at and one closed thing — acHash with an evidence map for a criterion, or taskHash with a workLogs map for a task — the map holding at least one entry, and never both — the record under AC-0001 is not.";
    for (const text of [
      // both hashes
      "AC-0001:\n  acHash: sha256:aa\n  taskHash: sha256:bb\n  evidence:\n    EV-0001: sha256:cc\n  by: yjshin\n  at: x\n",
      // both maps
      "AC-0001:\n  acHash: sha256:aa\n  evidence:\n    EV-0001: sha256:cc\n  workLogs:\n    WL-0001: sha256:dd\n  by: yjshin\n  at: x\n",
      // crossed: a criterion's hash with a task's map
      "AC-0001:\n  acHash: sha256:aa\n  workLogs:\n    WL-0001: sha256:dd\n  by: yjshin\n  at: x\n",
      // crossed the other way
      "AC-0001:\n  taskHash: sha256:aa\n  evidence:\n    EV-0001: sha256:cc\n  by: yjshin\n  at: x\n",
    ]) {
      assert.equal(parseAcceptanceLedger(text).problem, shape, text);
    }
  });

  test("a task's work logs are defended and named as work logs", () => {
    assert.equal(
      parseAcceptanceLedger(
        "IT-0007:\n  taskHash: sha256:aa\n  workLogs:\n    1234: sha256:bb\n    \"1234\": sha256:cc\n  by: yjshin\n  at: x\n",
      ).problem,
      "1234 is written twice under IT-0007 in the acceptance ledger, once bare and once quoted — YAML reads two keys and Shall one id, and an acceptance names one hash for each work log.",
    );
    assert.equal(
      parseAcceptanceLedger(
        "IT-0007:\n  taskHash: sha256:aa\n  workLogs:\n    ~: sha256:bb\n  by: yjshin\n  at: x\n",
      ).problem,
      "Under IT-0007, a work log entry names no node id.",
    );
    assert.equal(
      parseAcceptanceLedger(
        "IT-0007:\n  taskHash: sha256:aa\n  workLogs:\n    WL-0003: '  '\n  by: yjshin\n  at: x\n",
      ).problem,
      "Under IT-0007, a work log hash is required.",
    );
  });

  test("a record of anything but the four fields is one sentence about that id", () => {
    const shape =
      "Every record in the acceptance ledger is a map of exactly by, at and one closed thing — acHash with an evidence map for a criterion, or taskHash with a workLogs map for a task — the map holding at least one entry, and never both — the record under AC-0001 is not.";
    for (const text of [
      "AC-0001:\n  acHash: sha256:aa\n  by: yjshin\n  at: x\n",
      "AC-0001:\n  acHash: sha256:aa\n  evidence:\n    EV-0001: sha256:bb\n  by: yjshin\n  at: x\n  note: fine\n",
      "AC-0001:\n  acHash: 12\n  evidence:\n    EV-0001: sha256:bb\n  by: yjshin\n  at: x\n",
      "AC-0001: closed\n",
      "AC-0001:\n  - acHash: sha256:aa\n",
    ]) {
      assert.equal(parseAcceptanceLedger(text).problem, shape, text);
    }
  });

  test("an acceptance that names no evidence is refused, however the emptiness is spelled", () => {
    const shape =
      "Every record in the acceptance ledger is a map of exactly by, at and one closed thing — acHash with an evidence map for a criterion, or taskHash with a workLogs map for a task — the map holding at least one entry, and never both — the record under AC-0001 is not.";
    for (const evidence of [
      // Nothing under the key, which is null and not a map.
      "  evidence:\n",
      "  evidence: {}\n",
      "  evidence: []\n",
      "  evidence: none\n",
      // A map whose value is not a hash is not a map from id to hash.
      "  evidence:\n    EV-0001:\n",
      "  evidence:\n    EV-0001: 12\n",
    ]) {
      const text = `AC-0001:\n  acHash: sha256:aa\n${evidence}  by: yjshin\n  at: x\n`;
      assert.equal(parseAcceptanceLedger(text).problem, shape, evidence);
    }
    // And the emitter writes an empty map as an empty key, which is exactly
    // what the reader above refuses — so a record that should not exist cannot
    // survive a write, which is the store's read-back check.
    const written = emitAcceptanceLedger(
      new Map([["AC-0001", { ...RECORD, claimants: new Map() }]]),
    );
    assert.ok(written.includes("  evidence:\n  by: yjshin\n"), written);
    assert.equal(parseAcceptanceLedger(written).problem, shape);
  });

  test("a blank value in a record is named under its id", () => {
    const evidence = "  evidence:\n    EV-0001: sha256:bb\n";
    assert.equal(
      parseAcceptanceLedger(`AC-0001:\n  acHash: '  '\n${evidence}  by: yjshin\n  at: x\n`).problem,
      "Under AC-0001, an accepted hash is required.",
    );
    assert.equal(
      parseAcceptanceLedger(`AC-0001:\n  acHash: sha256:aa\n${evidence}  by: ''\n  at: x\n`).problem,
      "Under AC-0001, an acceptor is required.",
    );
    assert.equal(
      parseAcceptanceLedger(
        `AC-0001:\n  acHash: sha256:aa\n${evidence}  by: yjshin\n  at: "a\\tb"\n`,
      ).problem,
      "Under AC-0001, an acceptance instant cannot contain a control character.",
    );
    assert.equal(
      parseAcceptanceLedger(
        "AC-0001:\n  acHash: sha256:aa\n  evidence:\n    EV-0001: '  '\n  by: yjshin\n  at: x\n",
      ).problem,
      "Under AC-0001, an evidence hash is required.",
    );
  });

  test("an evidence key that is not a node id is refused by name", () => {
    assert.equal(
      parseAcceptanceLedger(
        "AC-0001:\n  acHash: sha256:aa\n  evidence:\n    CON: sha256:bb\n  by: yjshin\n  at: x\n",
      ).problem,
      'Under AC-0001, "CON" is not a node id. CON is a reserved device name on Windows, so no file can be named after it. Choose another id.',
    );
    assert.equal(
      parseAcceptanceLedger(
        "AC-0001:\n  acHash: sha256:aa\n  evidence:\n    ~: sha256:bb\n  by: yjshin\n  at: x\n",
      ).problem,
      "Under AC-0001, an evidence entry names no node id.",
    );
  });

  test("an evidence id written once bare and once quoted is refused, inside the record", () => {
    for (const [bare, id] of [
      ["1234", "1234"],
      ["true", "true"],
    ] as const) {
      const text = [
        "AC-0001:",
        "  acHash: sha256:aa",
        "  evidence:",
        `    ${bare}: sha256:bb`,
        `    "${id}": sha256:cc`,
        "  by: yjshin",
        "  at: x",
        "",
      ].join("\n");
      assert.equal(
        parseAcceptanceLedger(text).problem,
        `${id} is written twice under AC-0001 in the acceptance ledger, once bare and once quoted — YAML reads two keys and Shall one id, and an acceptance names one hash for each piece of evidence.`,
        bare,
      );
    }
  });

  test("an id written twice is refused, because an acceptance has one latest", () => {
    const twice = `${LEDGER}AC-0001:\n  acHash: sha256:ee\n  evidence:\n    EV-0009: sha256:ff\n  by: later\n  at: x\n`;
    assert.equal(
      parseAcceptanceLedger(twice).problem,
      "The acceptance ledger is not YAML Shall can read: Map keys must be unique.",
    );
  });

  test("an id written once bare and once quoted is refused at the root too", () => {
    const record = "  acHash: sha256:aa\n  evidence:\n    EV-0001: sha256:bb\n  by: a\n  at: x\n";
    assert.equal(
      parseAcceptanceLedger(`1234:\n${record}"1234":\n${record}`).problem,
      "1234 is written twice in the acceptance ledger, once bare and once quoted — YAML reads two keys and Shall one id, and an acceptance has one latest record.",
    );
  });

  test("a blank id is refused, because a record belongs to a criterion", () => {
    const record = "  acHash: sha256:aa\n  evidence:\n    EV-0001: sha256:bb\n  by: a\n  at: x\n";
    assert.equal(
      parseAcceptanceLedger(`~:\n${record}`).problem,
      "A record in the acceptance ledger names no node id.",
    );
    assert.equal(
      parseAcceptanceLedger(`CON:\n${record}`).problem,
      'The acceptance ledger names "CON", which is not a node id. CON is a reserved device name on Windows, so no file can be named after it. Choose another id.',
    );
  });

  test("a ledger that is a list is refused as the shape it is", () => {
    assert.equal(
      parseAcceptanceLedger("- AC-0001\n").problem,
      "The acceptance ledger is a list, not a map from node id to acceptance record.",
    );
    assert.equal(
      parseAcceptanceLedger("closed\n").problem,
      "The acceptance ledger is text, not a map from node id to acceptance record.",
    );
  });

  test("a second document inside the ledger is refused rather than silently dropped", () => {
    assert.equal(
      parseAcceptanceLedger(
        `${LEDGER}---\nAC-0009:\n  acHash: sha256:ee\n  evidence:\n    EV-0009: sha256:ff\n  by: c\n  at: z\n`,
      ).problem,
      'The acceptance ledger is not YAML Shall can read: a "..." or "---" line inside it ends the ledger early, so the records after that line belong to nobody.',
    );
  });

  test("a ledger that is not YAML at all is refused in the library's own words", () => {
    const reading = parseAcceptanceLedger("AC-0001: [\n");
    assert.ok(
      reading.problem?.startsWith("The acceptance ledger is not YAML Shall can read: "),
      reading.problem ?? "",
    );
    assert.equal(reading.records.size, 0);
  });

  test("every corpus value survives a whole ledger as an evidence hash", () => {
    for (const entry of SCALARS) {
      const value = entry.value.trim();
      if (value === "" || /\p{Cc}/u.test(value)) {
        continue;
      }
      const written = emitAcceptanceLedger(
        new Map([
          ["AC-0001", { ...RECORD, claimants: new Map([["EV-0001", value]]) }],
        ]),
      );
      const reading = parseAcceptanceLedger(written);
      assert.equal(reading.problem, null, JSON.stringify(entry.value));
      assert.equal(
        reading.records.get("AC-0001")?.claimants.get("EV-0001"),
        value,
        JSON.stringify(entry.value),
      );
      assert.equal(emitAcceptanceLedger(reading.records), written);
    }
  });
});

/**
 * `mapKeysAt` — the one fact `toJS()` loses, asked about one level down.
 *
 * The pair below is the whole reason the walk is written by hand: to the library
 * these are a number key and a string key, to JavaScript they are one property,
 * and to `getIn` — which compares a path step with `===` — a numeric key is not
 * reachable by the string that spells it at all.
 */
describe("mapKeysAt", () => {
  const NESTED = [
    "AC-0001:",
    "  evidence:",
    "    1234: sha256:aa",
    '    "1234": sha256:bb',
    "  by: yjshin",
    "",
  ].join("\n");

  test("a nested key spelled bare and quoted is two keys, where toJS sees one", () => {
    assert.deepEqual(mapKeysAt(NESTED, ["AC-0001", "evidence"]), ["1234", "1234"]);
    const collapsed: unknown = parseDocument(NESTED, {
      version: "1.2",
      schema: "core",
      uniqueKeys: true,
      logLevel: "silent",
    }).toJS();
    assert.deepEqual(
      Object.keys(
        (collapsed as Record<string, Record<string, unknown>>)["AC-0001"]?.[
          "evidence"
        ] as Record<string, unknown>,
      ),
      ["1234"],
    );
  });

  test("a path step is matched by the text of the key, numbers and all", () => {
    const numeric = "1234:\n  evidence:\n    EV-0001: sha256:aa\n";
    assert.deepEqual(mapKeysAt(numeric, ["1234", "evidence"]), ["EV-0001"]);
    assert.deepEqual(mapKeysAt(NESTED, []), ["AC-0001"]);
    assert.deepEqual(mapKeysAt(NESTED, ["AC-0001"]), ["evidence", "by"]);
  });

  test("a path that leads to anything but a map is null, and so is a source that does not read", () => {
    assert.equal(mapKeysAt(NESTED, ["AC-0001", "by"]), null);
    assert.equal(mapKeysAt(NESTED, ["AC-0001", "missing"]), null);
    assert.equal(mapKeysAt(NESTED, ["AC-0001", "evidence", "1234"]), null);
    assert.equal(mapKeysAt("- a\n", []), null);
    assert.equal(mapKeysAt("AC-0001: [\n", ["AC-0001"]), null);
    assert.equal(mapKeysAt("", []), null);
  });
});
