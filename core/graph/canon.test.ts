import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  BAND_FOLDERS,
  BAND_ORDER,
  NODE_TYPES,
  SATELLITE_BAND,
  bandFolderOf,
  bandOf,
  bandOfFolder,
  canonTypesSentence,
  columnsInOrder,
  isNodeType,
  layerOf,
  nodeTypeEntry,
  typesInBand,
} from "./canon.js";

/**
 * The roster is hand-transcribed and its prefixes end up in ids a person reads,
 * so what is written out below is written out on purpose: a set derived from
 * the same table the code reads would agree with any table at all.
 *
 * THE LAYER AND THE BAND ARE DIFFERENT ANSWERS AND THIS FILE KEEPS THEM APART.
 * The layer is the canon's own fact and `Assumption` has none; the band is ours,
 * and it sends the one layerless type to Intent so a canvas always has a column
 * for it. Every question below that could be answered by either is asked of
 * both, because collapsing the two is exactly the change nothing else would
 * catch — and the band is a storage fact now, so collapsing it would move
 * committed files.
 */

describe("NODE_TYPES", () => {
  test("is the canon's 21, in v5's own row order", () => {
    assert.deepEqual(
      NODE_TYPES.map((entry) => entry.name),
      [
        "Term",
        "DomainEntity",
        "Goal",
        "Actor",
        "UseCase",
        "Scenario",
        "SystemResponsibility",
        "Requirement",
        "AcceptanceCriterion",
        "Constraint",
        "Module",
        "Interface",
        "DataSchema",
        "WorkItem",
        "Decision",
        "Journal",
        "WorkLog",
        "Evidence",
        "CompletionReport",
        "Finding",
        "Assumption",
      ],
    );
  });

  test("gives each type a prefix of its own", () => {
    // The prefixes are pinned: they are in ids already written, so a collision
    // introduced later would make two types answer to one id shape.
    const prefixes = NODE_TYPES.map((entry) => entry.prefix);
    assert.equal(new Set(prefixes).size, prefixes.length);
    assert.equal(nodeTypeEntry("Requirement")?.prefix, "R");
    assert.equal(nodeTypeEntry("AcceptanceCriterion")?.prefix, "AC");
  });

  test("leaves exactly one type without a layer", () => {
    assert.deepEqual(
      NODE_TYPES.filter((entry) => entry.layer === null).map(
        (entry) => entry.name,
      ),
      ["Assumption"],
    );
  });
});

describe("isNodeType", () => {
  test("knows every name on the roster", () => {
    for (const entry of NODE_TYPES) {
      assert.equal(isNodeType(entry.name), true, entry.name);
    }
  });

  test("refuses a name the canon does not have", () => {
    assert.equal(isNodeType("Widget"), false);
    // Case is part of the name: the folder holding a type is canon-spelled.
    assert.equal(isNodeType("requirement"), false);
  });
});

describe("nodeTypeEntry", () => {
  test("answers with the row itself for a canon name", () => {
    assert.deepEqual(nodeTypeEntry("Assumption"), {
      name: "Assumption",
      layer: null,
      prefix: "AS",
    });
  });

  test("answers null for a name outside the canon, which is how a string is checked", () => {
    assert.equal(nodeTypeEntry("Widget"), null);
  });
});

describe("layerOf", () => {
  test("gives the canon's own layer", () => {
    assert.equal(layerOf("Term"), "Domain");
    assert.equal(layerOf("Requirement"), "Intent");
    assert.equal(layerOf("WorkItem"), "Plan");
    assert.equal(layerOf("Journal"), "Execution");
  });

  test("gives null for the satellite, because v5 states none", () => {
    // An assumption's layer follows the chalk node it hangs off, so it is not a
    // property of the assumption and this must not quietly answer Intent.
    assert.equal(layerOf("Assumption"), null);
  });

  test("gives null for a type outside the canon too", () => {
    assert.equal(layerOf("Widget"), null);
  });
});

describe("bandOf", () => {
  test("is the layer wherever the canon states one", () => {
    for (const entry of NODE_TYPES) {
      if (entry.layer !== null) {
        assert.equal(bandOf(entry.name), entry.layer, entry.name);
      }
    }
  });

  test("draws the layerless type in Intent, and that is the presentation choice", () => {
    assert.equal(bandOf("Assumption"), SATELLITE_BAND);
    assert.equal(SATELLITE_BAND, "Intent");
  });

  test("has no band for a type it has never heard of", () => {
    // Null and not Intent: an unknown type has no column, and answering with
    // the satellite's would file a misspelling under a real band.
    assert.equal(bandOf("Widget"), null);
  });
});

describe("typesInBand", () => {
  test("keeps canon order inside a band", () => {
    assert.deepEqual(
      typesInBand("Domain").map((entry) => entry.name),
      ["Term", "DomainEntity"],
    );
    assert.deepEqual(
      typesInBand("Plan").map((entry) => entry.name),
      ["Module", "Interface", "DataSchema", "WorkItem", "Decision"],
    );
  });

  test("counts the satellite in Intent and nowhere else", () => {
    assert.equal(
      typesInBand("Intent").some((entry) => entry.name === "Assumption"),
      true,
    );
    for (const band of ["Domain", "Plan", "Execution"] as const) {
      assert.equal(
        typesInBand(band).some((entry) => entry.name === "Assumption"),
        false,
        band,
      );
    }
  });
});

describe("columnsInOrder", () => {
  test("partitions the whole roster, once each", () => {
    const columns = columnsInOrder();
    assert.equal(columns.length, NODE_TYPES.length);
    assert.deepEqual(
      new Set(columns.map((entry) => entry.name)),
      new Set(NODE_TYPES.map((entry) => entry.name)),
    );
  });

  test("puts the satellite after Constraint on its own, with no special case", () => {
    // It sits at the end of `NODE_TYPES` with no layer, and `bandOf` sends it to
    // Intent, so the list's own order is what lands it there. If a special case
    // ever appears in `columnsInOrder`, this pair stops agreeing.
    const names = columnsInOrder().map((entry) => entry.name);
    assert.equal(
      names.indexOf("Assumption") - names.indexOf("Constraint"),
      1,
    );
    assert.equal(names[names.indexOf("Assumption") + 1], "Module");
  });
});

describe("band folders", () => {
  test("names four drawers under spec/, in band order and lowercased", () => {
    assert.deepEqual(BAND_FOLDERS, ["domain", "intent", "plan", "execution"]);
    assert.deepEqual(BAND_ORDER, ["Domain", "Intent", "Plan", "Execution"]);
  });

  test("lowercases only the band, so the type folder beside it stays canon-spelled", () => {
    assert.equal(bandFolderOf("Requirement"), "intent");
    assert.equal(bandFolderOf("Assumption"), "intent");
    assert.equal(bandFolderOf("Journal"), "execution");
  });

  test("has no folder for a type outside the canon", () => {
    assert.equal(bandFolderOf("Widget"), null);
  });

  test("reads a folder name back to its band", () => {
    for (const band of BAND_ORDER) {
      assert.equal(bandOfFolder(band.toLowerCase()), band);
    }
  });

  test("reads back nothing but the lowercase spelling", () => {
    // The path is written lowercase and read lowercase; accepting `Intent` here
    // would let two spellings of one drawer exist on a case-sensitive checkout.
    assert.equal(bandOfFolder("Intent"), null);
    assert.equal(bandOfFolder("spec"), null);
    assert.equal(bandOfFolder(""), null);
  });

  test("every type lands in one of the four drawers", () => {
    for (const entry of NODE_TYPES) {
      const folder = bandFolderOf(entry.name);
      assert.notEqual(folder, null, entry.name);
      assert.equal(BAND_FOLDERS.includes(folder as string), true, entry.name);
    }
  });
});

describe("canonTypesSentence", () => {
  test("is the whole roster as one sentence, because a refusal is the dropdown", () => {
    // Written out in full: whoever reads it is holding a file path or a typed
    // command and cannot see a list, so the sentence is the list.
    assert.equal(
      canonTypesSentence(),
      "The canon's types are Term, DomainEntity, Goal, Actor, UseCase, Scenario, SystemResponsibility, Requirement, AcceptanceCriterion, Constraint, Module, Interface, DataSchema, WorkItem, Decision, Journal, WorkLog, Evidence, CompletionReport, Finding, Assumption.",
    );
  });

  test("ends in a full stop and hands the join to its callers", () => {
    // It lands mid-message after a full stop and as the tail of a refusal, so it
    // is a whole sentence and carries no leading space of its own.
    assert.equal(canonTypesSentence().endsWith("."), true);
    assert.equal(canonTypesSentence().startsWith("The"), true);
  });
});
