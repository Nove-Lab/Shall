/**
 * Byte order, never the machine's locale.
 *
 * Ids, paths and hashes in Shall are ASCII, and anything sorted under the
 * daemon's locale — ledger bytes, review rows, board rows, a bundle's members —
 * would put its own output at the mercy of an environment variable. Sorted
 * bytewise, the same records are always the same file and two people's edits of
 * two different nodes merge without a conflict.
 *
 * ONE SPELLING, HERE, because it used to have eight: every module of
 * `core/arith`, the store and the ledger reader each carried its own copy of
 * these three lines with its own copy of this paragraph, and a ninth caller
 * could have reached for `localeCompare` without anything objecting. It lives
 * in `core/graph` because that is the one module everything else — arith,
 * serialize, store, the daemon, the browser bundle — already reads, and it
 * reads nothing.
 */
export function compare(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
