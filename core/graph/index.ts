/**
 * core/graph — the grammar of the spec graph.
 *
 * The canon's node types, the attributes each one carries, their ids, the edges
 * that may join them, and the shapes every other core module is written
 * against. It carries data now and not only types, but it still reads
 * nothing: no database, no file, no clock, so it is as safe in a browser
 * bundle as it is in the daemon.
 */
export {
  BAND_ORDER,
  NODE_TYPES,
  SATELLITE_BAND,
  bandOf,
  columnsInOrder,
  isNodeType,
  layerOf,
  nodeTypeEntry,
  typesInBand,
} from "./canon.js";
export type { Band, NodeTypeEntry, NodeTypeName } from "./canon.js";
export {
  ATTRIBUTE_COLUMN_NAMES,
  attributeNames,
  attributesFor,
  kindOf,
  requiredAttributeNames,
  TEXT_BYTE_CAP,
  typesCarrying,
  vocabularyOf,
} from "./attributes.js";
export type {
  AttributeColumnName,
  AttributeDescriptor,
  AttributeKind,
  ChoiceValue,
} from "./attributes.js";
export {
  ID_SEQUENCE_MAX,
  ID_SEQUENCE_WIDTH,
  formatNodeId,
  idPrefixFor,
  nextIdSuggestion,
} from "./ids.js";
export {
  EDGE_GRAMMAR,
  EDGE_TYPE_NAMES,
  isPermittedTriple,
  permittedEdgeTypes,
} from "./grammar.js";
export type { EdgeTriple } from "./grammar.js";
export type { SpecNode, SpecNodeValues } from "./node.js";
export type { SpecEdge } from "./edge.js";
