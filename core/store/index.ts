/**
 * core/store — the project's `.shall/shall.db`.
 *
 * The only module that opens a file, and the only one that knows SQL. The
 * table definitions and the connection stay inside: callers name a database
 * path and get graph values back.
 */
export { initializeProjectDatabase } from "./database.js";
export {
  deleteNode,
  insertNode,
  listNodes,
  updateNode,
} from "./nodes.js";
