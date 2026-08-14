/**
 * core/store — the project's `.shall/spec` folder.
 *
 * The only core module that touches a filesystem, and the only one that knows
 * where a node lives. What a file SAYS is `core/serialize`'s business and what
 * it may say is `core/graph`'s; this module owns the folder around them — which
 * paths are node files, how a write lands, and what a whole directory of
 * markdown amounts to when it is read at once.
 *
 * It replaces the sqlite store that stood here. The queue that serialized writes
 * survived the change; everything else went with the database.
 */
export {
  addEdge,
  createNodeFile,
  deleteNodeFile,
  isStoreRefusal,
  loadGraph,
  removeEdge,
  StoreRefusal,
  updateNodeFile,
} from "./file-store.js";
export type { FileProblem, RefusalKind, SpecGraph } from "./file-store.js";
