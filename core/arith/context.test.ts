import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatEdgeId, type SpecEdge, type SpecNode } from "../graph/index.js";
import {
  approvalPayload,
  blocksOf,
  type ActivityRecord,
  type ApprovalRecord,
} from "../serialize/index.js";
import type { SpecGraph } from "../store/file-store.js";
import type { Ledgers, PayloadHash } from "./color.js";
import { workContextOf } from "./context.js";

/**
 * The look back, over graphs built by hand.
 *
 * WHAT IS PINNED IS THE REACH AND THE CLOCK: a decision that reaches a module
 * directly is named even though it answers no finding, the contract hop reaches
 * the exposing module's worked-on items and nothing else of theirs, the feed
 * orders the recent turns and the id only stands in when there is no feed, and
 * the cap is said as a number rather than kept quiet.
 */

const hash: PayloadHash = (payload: string) => `sha256:${payload}`;
const fileOf = (node: { type: string; id: string }) => `${node.type}/${node.id}.md`;

function node(type: string, id: string): SpecNode {
  return {
    id,
    type,
    shortName: id,
    name: `${type} ${id}`,
    body: "",
    createdAt: 1,
    updatedAt: 1,
  };
}

function edge(fromId: string, type: string, toId: string): SpecEdge {
  return { id: formatEdgeId(fromId, type, toId), type, fromId, toId };
}

function graphOf(nodes: readonly SpecNode[], edges: readonly SpecEdge[]): SpecGraph {
  return { nodes: [...nodes], edges: [...edges], problems: [], refused: [] };
}

function approve(held: SpecNode, edges: readonly SpecEdge[]): [string, ApprovalRecord] {
  const payload = approvalPayload(
    held.type,
    held.id,
    held,
    edges.filter((line) => line.fromId === held.id),
    blocksOf(held),
  );
  return [held.id, { approvedHash: hash(payload), by: "t", at: "2026-08-15T00:00:00Z" }];
}

function settled(nodes: readonly SpecNode[], edges: readonly SpecEdge[]): Ledgers {
  return {
    approvals: new Map(nodes.map((held) => approve(held, edges))),
    rejections: new Map(),
    acceptances: new Map(),
    hash,
  };
}

function turn(at: string, refs: string[]): ActivityRecord {
  return { at, kind: "work_done", refs, summary: "a turn" };
}

/**
 * Two modules joined by one contract, each with two work items; the first module's
 * first item is the one asked about. Logs, a report, a finding, and two decisions —
 * one answering the finding, one reaching the module directly.
 */
const goal = node("Goal", "G-0001");
const actor = node("Actor", "A-0001");
const useCase = node("UseCase", "UC-0001");
const scenario = node("Scenario", "SC-0001");
const responsibility = node("SystemResponsibility", "SR-0001");
const requirement = node("Requirement", "R-0001");
const criterion = node("AcceptanceCriterion", "AC-0001");
const otherCriterion = node("AcceptanceCriterion", "AC-0002");
const module = node("Module", "M-0001");
const upstreamModule = node("Module", "M-0002");
const iface = node("Interface", "IF-0001");
const item = node("WorkItem", "WI-0001");
const sibling = node("WorkItem", "WI-0002");
const waiting = node("WorkItem", "WI-0003");
const upstreamWorked = node("WorkItem", "WI-0004");
const upstreamIdle = node("WorkItem", "WI-0005");
const journalOne = node("Journal", "J-0001");
const journalTwo = node("Journal", "J-0002");
const logOne = node("WorkLog", "WL-0001");
const logTwo = node("WorkLog", "WL-0002");
const report = node("CompletionReport", "CR-0001");
const finding = node("Finding", "F-0001");
const resolver = node("Decision", "D-0001");
const stack = node("Decision", "D-0002");

const NODES = [
  goal, actor, useCase, scenario, responsibility, requirement, criterion, otherCriterion,
  module, upstreamModule, iface, item, sibling, waiting, upstreamWorked, upstreamIdle,
  journalOne, journalTwo, logOne, logTwo, report, finding, resolver, stack,
];

const EDGES: SpecEdge[] = [
  edge("G-0001", "PURSUED_BY", "A-0001"),
  edge("A-0001", "PERFORMS", "UC-0001"),
  edge("UC-0001", "DETAILS", "SC-0001"),
  edge("SC-0001", "DERIVES_RESPONSIBILITY", "SR-0001"),
  edge("SR-0001", "REQUIRES", "R-0001"),
  edge("R-0001", "HAS_CRITERION", "AC-0001"),
  edge("R-0001", "HAS_CRITERION", "AC-0002"),
  edge("SR-0001", "IS_REALIZED_BY", "M-0001"),
  edge("SR-0001", "IS_REALIZED_BY", "M-0002"),
  edge("M-0002", "EXPOSES", "IF-0001"),
  edge("M-0001", "CONSUMES", "IF-0001"),
  edge("M-0001", "ALLOCATES", "WI-0001"),
  edge("M-0001", "ALLOCATES", "WI-0002"),
  edge("M-0001", "ALLOCATES", "WI-0003"),
  edge("M-0002", "ALLOCATES", "WI-0004"),
  edge("M-0002", "ALLOCATES", "WI-0005"),
  edge("WI-0001", "TARGETS", "AC-0001"),
  edge("WI-0002", "TARGETS", "AC-0002"),
  edge("WI-0003", "DEPENDS_ON", "WI-0001"),
  edge("J-0001", "LOGS", "WL-0001"),
  edge("J-0002", "LOGS", "WL-0002"),
  edge("WL-0001", "ADDRESSES", "WI-0004"),
  edge("WL-0002", "ADDRESSES", "WI-0002"),
  edge("WL-0002", "SUBMITS", "CR-0001"),
  edge("CR-0001", "CLAIMS", "WI-0002"),
  edge("WL-0002", "RECORDS", "F-0001"),
  edge("D-0001", "RESOLVES", "F-0001"),
  edge("D-0001", "AFFECTS", "R-0001"),
  edge("D-0002", "AFFECTS", "M-0001"),
  edge("D-0002", "AFFECTS", "M-0002"),
];

function contextOf(feed: ActivityRecord[] = [], options: { cap?: number; recent?: number } = {}) {
  const graph = graphOf(NODES, EDGES);
  const found = workContextOf(graph, settled(NODES, EDGES), feed, "WI-0001", {
    fileOf,
    ...options,
  });
  assert.notEqual(found, null);
  return found!;
}

describe("the look back", () => {
  test("an id that names no work item answers null", () => {
    const graph = graphOf(NODES, EDGES);
    assert.equal(workContextOf(graph, settled(NODES, EDGES), [], "M-0001", { fileOf }), null);
    assert.equal(workContextOf(graph, settled(NODES, EDGES), [], "WI-0404", { fileOf }), null);
  });

  test("names the module, the siblings with their words, and the item's file", () => {
    const found = contextOf();
    assert.equal(found.item.file, "WorkItem/WI-0001.md");
    assert.deepEqual(found.modules.map((row) => row.id), ["M-0001"]);
    assert.deepEqual(
      found.siblings.map((row) => [row.id, row.state]),
      [
        ["WI-0002", "in_review"],
        ["WI-0003", "blocked"],
      ],
    );
  });

  test("reaches one hop upstream through the contract, to the worked-on items only", () => {
    const found = contextOf();
    assert.deepEqual(
      found.upstream.map((row) => [
        row.module.id,
        row.interfaces.map((held) => held.id),
        row.workItems.map((held) => held.id),
      ]),
      [["M-0002", ["IF-0001"], ["WI-0004"]]],
    );
  });

  test("names every decision whose lines reach the neighbourhood, a finding answered or not", () => {
    const found = contextOf();
    assert.deepEqual(
      found.decisions.map((row) => [row.decision.id, row.affects, row.resolves]),
      [
        ["D-0001", ["R-0001"], ["F-0001"]],
        ["D-0002", ["M-0001", "M-0002"], []],
      ],
    );
    assert.deepEqual(
      found.findings.map((row) => [row.finding.id, row.recordedBy, row.resolved]),
      [["F-0001", "WL-0002", true]],
    );
  });

  test("lists the logs newest first with their journals, and the reports with their claims", () => {
    const found = contextOf();
    assert.deepEqual(
      found.logs.map((row) => [row.log.id, row.addresses, row.journal?.id ?? null]),
      [
        ["WL-0002", ["WI-0002"], "J-0002"],
        ["WL-0001", ["WI-0004"], "J-0001"],
      ],
    );
    assert.deepEqual(
      found.reports.map((row) => [row.report.id, row.claims]),
      [["CR-0001", "WI-0002"]],
    );
    assert.deepEqual(
      found.criteria.map((row) => [row.criterion.id, row.targetedBy, row.closure]),
      [
        ["AC-0001", ["WI-0001"], "open"],
        ["AC-0002", ["WI-0002"], "open"],
      ],
    );
  });

  test("orders the recent turns by the feed's clock, not by id", () => {
    const found = contextOf([
      turn("2026-08-20T00:00:00Z", ["J-0001", "WL-0001"]),
      turn("2026-08-10T00:00:00Z", ["J-0002", "WL-0002"]),
    ]);
    assert.equal(found.recentBy, "feed");
    assert.deepEqual(
      found.recentTurns.map((row) => [row.journal.id, row.at, row.logs.map((held) => held.id)]),
      [
        ["J-0001", "2026-08-20T00:00:00Z", ["WL-0001"]],
        ["J-0002", "2026-08-10T00:00:00Z", ["WL-0002"]],
      ],
    );
  });

  test("falls back to the id's order when the feed says nothing, and says so", () => {
    const found = contextOf([], { recent: 1 });
    assert.equal(found.recentBy, "id");
    assert.deepEqual(
      found.recentTurns.map((row) => [row.journal.id, row.at]),
      [["J-0002", null]],
    );
  });

  test("caps the logs and counts what the cap left out", () => {
    const found = contextOf([], { cap: 1 });
    assert.deepEqual(found.logs.map((row) => row.log.id), ["WL-0002"]);
    assert.equal(found.omitted, 1);
  });

  test("says what the item, once done, would let start", () => {
    const found = contextOf();
    assert.deepEqual(
      found.unblocks.map((row) => [row.id, row.state]),
      [["WI-0003", "blocked"]],
    );
  });
});
