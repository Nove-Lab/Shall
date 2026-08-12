/**
 * core/graph — the grammar of the spec graph.
 *
 * Types only. Nothing here reads a database, a file, or a clock; every other
 * core module is written against these shapes.
 */
export type { SpecNode, SpecNodeValues } from "./node.js";
export type { SpecEdge } from "./edge.js";
