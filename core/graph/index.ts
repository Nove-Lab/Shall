/**
 * core/graph — the grammar of the spec graph.
 *
 * The canon's node types, their ids, the edges that may join them, the section
 * guide their templates start from, and the shapes every other core module is
 * written against. It carries data now and not only types, but it still reads
 * nothing: no database, no file, no clock, so it is as safe in a browser
 * bundle as it is in the daemon.
 */
export {
  BAND_FOLDERS,
  BAND_ORDER,
  NODE_TYPES,
  SATELLITE_BAND,
  bandFolderOf,
  bandOf,
  bandOfFolder,
  columnsInOrder,
  isNodeType,
  layerOf,
  nodeTypeEntry,
  typesInBand,
} from "./canon.js";
export type { Band, NodeTypeEntry, NodeTypeName } from "./canon.js";
export {
  ANCHOR_RULES,
  anchorPhrase,
  anchorsFor,
  isColored,
  isRootless,
} from "./anchors.js";
export type { AnchorDirection, AnchorEdge, AnchorRule } from "./anchors.js";
export { sectionGuideFor } from "./guide.js";
export type { SectionGuide } from "./guide.js";
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
export type {
  NodeApproval,
  NodeDeletionProposal,
  SpecNode,
  SpecNodeValues,
} from "./node.js";
export { formatEdgeId, parseEdgeId } from "./edge.js";
export type { SpecEdge } from "./edge.js";
export { judgeBody, judgeNodeId, judgeText, TEXT_BYTE_CAP } from "./validate.js";
export type { BodyJudgement, TextJudgement } from "./validate.js";
