import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  BAND_FOLDERS,
  bandFolderOf,
  bandOfFolder,
  formatEdgeId,
  isNodeType,
  isPermittedTriple,
  judgeBody,
  judgeNodeId,
  judgeText,
  nextIdSuggestion,
  parseEdgeId,
  type SpecEdge,
  type SpecNode,
  type SpecNodeValues,
} from "../graph/index.js";
import {
  blocksOf,
  emitNodeFile,
  emitScaffold,
  parseNodeFile,
  type NodeFileBlocks,
  type NodeFileEdge,
  type NodeFileFields,
  type NodeFileReading,
  type ParsedNode,
} from "../serialize/index.js";

/**
 * The spec folder as a graph, and the graph back into the spec folder.
 *
 * THE FILES ARE THE TRUTH AND NOTHING HERE CACHES THAT AWAY. Agents, editors,
 * `git checkout` and `git merge` all write into this folder without telling the
 * daemon, so every query walks the folder again and stats every file it finds.
 * What the cache below saves is the PARSE of a file that has not moved, never
 * the fact that the file was there — a daemon that had to be restarted to see a
 * hand edit would give away the whole reason the spec left the database.
 *
 * A READ IS NEVER REFUSED WHOLESALE. One unreadable file costs its own node and
 * its own edges and nothing else, and the sentence against it is served
 * alongside the graph, because a person with 200 nodes and one bad merge wants
 * to keep working and be told what to fix.
 *
 * WRITES ARE SERIAL PER FOLDER and land by rename, so a reader only ever sees
 * one whole version of a file or another. The queue is lifted from the sqlite
 * store this module replaces — the reasoning survived the storage.
 */

/** What a file says is wrong with it, and which file said it. */
export interface FileProblem {
  /** Relative to `specDir`, `/`-separated, so the sentence reads the same everywhere. */
  readonly file: string;
  readonly message: string;
}

/**
 * A file that sits where a node belongs and would not read as one, with its
 * place attached. Its sentences repeat in `problems` — that list is for a
 * person reading the folder — and this is the structured half, kept so a
 * caller judging the whole graph can say which id and type a broken file was
 * claiming without re-deriving them from the path, which is this module's
 * knowledge and nobody else's.
 */
export interface RefusedFile {
  /** Relative to `specDir`, `/`-separated. */
  readonly file: string;
  /** From the folder name — what the file claims to be, whatever is inside. */
  readonly type: string;
  /** From the filename stem. */
  readonly id: string;
  readonly problems: readonly string[];
}

/** The whole folder, read: what loaded, and what did not. */
export interface SpecGraph {
  nodes: SpecNode[];
  edges: SpecEdge[];
  problems: FileProblem[];
  refused: RefusedFile[];
}

/**
 * A refusal is something the caller can act on — an id already taken, a node
 * that is not there, a file on disk in a state a save would destroy — as opposed
 * to a fault, which is this module failing at its own job.
 *
 * The kinds are the daemon's three, spelled the same, because the daemon is what
 * turns them into status codes and a second vocabulary here would be a
 * translation table nobody maintains. This module cannot import the daemon's
 * `Refusal` (core knows nothing about a transport), so it throws its own and the
 * service maps it.
 */
export type RefusalKind = "invalid" | "conflict" | "missing";

export class StoreRefusal extends Error {
  readonly kind: RefusalKind;

  constructor(kind: RefusalKind, message: string) {
    super(message);
    this.name = "StoreRefusal";
    this.kind = kind;
  }
}

export function isStoreRefusal(error: unknown): error is StoreRefusal {
  return error instanceof StoreRefusal;
}

/** The value cannot be what it is: unknown to the canon, blank, self-directed. */
function invalid(message: string): StoreRefusal {
  return new StoreRefusal("invalid", message);
}

/** Something already written stands where this would go. */
function conflict(message: string): StoreRefusal {
  return new StoreRefusal("conflict", message);
}

/** Nothing in the folder answers to that id. */
function missing(message: string): StoreRefusal {
  return new StoreRefusal("missing", message);
}

const MARKDOWN_SUFFIX = ".md";

/**
 * Byte order, not locale order. `localeCompare` would put a folder's reading at
 * the mercy of an environment variable, and ids are ASCII by the id door, so
 * UTF-16 order, byte order and the order a person expects are one order.
 */
function compare(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** Two names read as English; more than two are a list. */
function namesPhrase(names: readonly string[]): string {
  return names.length === 2 ? names.join(" and ") : names.join(", ");
}

/**
 * A folder that is not there is a graph with nothing in it, not a failure: a
 * fresh `shall init` has no type folders at all, and git does not carry an empty
 * one, so the first node of a project is written into a folder that does not
 * exist yet. `ENOTDIR` joins it — a `spec` that is somehow a file has no
 * entries either, and the check-and-then-read race is worse than the answer.
 */
function isAbsent(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/**
 * Why the filesystem said no, in words a person can act on.
 *
 * AN ERRNO IS NOT A SENTENCE. These strings end up inside refusals a person
 * reads in a panel or under `shall check`, where this codebase says what
 * happened in English rather than handing over a code to look up. The mapped
 * ones are the codes a spec folder actually produces — a permission bit, a
 * symlink pointing at a folder, a path with a file part-way along it.
 *
 * The unmapped tail keeps the code, deliberately. Something nobody anticipated
 * has gone wrong, and inventing a soothing English phrase for it would tell the
 * person less than the four letters their operating system already documents.
 */
function describeFailure(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  switch (code) {
    case "EACCES":
    case "EPERM":
      return "the filesystem refused permission";
    case "EISDIR":
      return "it is a folder and not a file";
    case "ENOTDIR":
      return "something along its path is a file and not a folder";
    case "ELOOP":
      return "its symbolic links lead in a circle";
    case "ENAMETOOLONG":
      return "its name is longer than the filesystem allows";
    default:
      return typeof code === "string"
        ? `the filesystem answered ${code}`
        : "the filesystem refused it";
  }
}

/**
 * A folder that is there and would not open, named as a sentence would name it
 * and paired with the clause that says why.
 */
interface ShutFolder {
  readonly folder: string;
  readonly because: string;
}

/** What a folder held, and — when it is there but shut — why nothing could be read. */
interface DirectoryReading {
  readonly entries: readonly Dirent[];
  /** Null both when the folder listed and when it is simply not there. */
  readonly problem: string | null;
}

/**
 * A FOLDER THAT CANNOT BE LISTED IS A SENTENCE, NOT A THROW. One shut folder
 * used to reject the whole load, which cost a person every node in the project
 * over a permission bit on one of them — the opposite of what this module's own
 * header promises.
 */
async function readDirectory(directory: string): Promise<DirectoryReading> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    // Sorted here so that every later step — the problems, the collision
    // groups, which of two files is named first in a sentence — is the same on
    // every filesystem. `readdir` promises no order at all.
    return {
      entries: entries.sort((a, b) => compare(a.name, b.name)),
      problem: null,
    };
  } catch (error) {
    if (isAbsent(error)) {
      return { entries: [], problem: null };
    }
    return { entries: [], problem: describeFailure(error) };
  }
}

/**
 * Bytes decoded STRICTLY, which `readFile(path, "utf8")` is not.
 *
 * That one answers a malformed byte with U+FFFD and no complaint, so a file
 * saved by a Latin-1 editor would load as a node whose name is quietly not the
 * name in the file — and the first save from the panel would write the
 * replacement character down and lose the original byte with nothing to undo.
 * A file this module cannot read faithfully is a file it refuses to read at all.
 */
const UTF8 = new TextDecoder("utf-8", { fatal: true });

/**
 * One file's text, or why there is none. `absent` is not a problem: nobody
 * asked about a file that is not there, and a file that vanished between the
 * listing and the read is the ordinary shape of an agent working in the folder.
 */
type TextReading =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "absent" }
  /** A clause, not a sentence: each caller says what it cost. */
  | { readonly kind: "unreadable"; readonly because: string };

async function readText(absolutePath: string): Promise<TextReading> {
  let bytes: Buffer;
  try {
    bytes = await readFile(absolutePath);
  } catch (error) {
    if (isAbsent(error)) {
      return { kind: "absent" };
    }
    return { kind: "unreadable", because: describeFailure(error) };
  }
  try {
    return { kind: "text", text: UTF8.decode(bytes) };
  } catch {
    return { kind: "unreadable", because: "it is not valid UTF-8 text" };
  }
}

/** One `.md` file that sits where a node file belongs. Nothing has been read yet. */
interface Candidate {
  /** Relative to `specDir`, `/`-separated — the key of the cache and of a problem. */
  readonly file: string;
  readonly absolutePath: string;
  /** From the folder name, which is the type's only home. */
  readonly type: string;
  /** From the filename stem, which is the id's only home. */
  readonly id: string;
}

interface Discovery {
  readonly candidates: Candidate[];
  readonly problems: FileProblem[];
  /**
   * The folders that are there and would not open. A READ carries on without
   * them and says so, one sentence per folder; a WRITE may not, because every
   * write door decides something from the whole listing — whether an id is
   * taken, which file a bare id names — and a listing with a hole in it answers
   * those questions wrongly rather than not at all.
   */
  readonly blind: ShutFolder[];
  /**
   * Type folders standing outside their place — the old flat layout at the top
   * of `spec/`, or a type filed under the wrong band. Their files are refused
   * at read and therefore never become candidates, WHICH MAKES THEM A HOLE OF
   * THE SAME KIND AS A SHUT FOLDER: an id chosen while nodes are stranded
   * there could collide with one of them the moment the folder moves to where
   * its sentence points. A write refuses while one exists.
   */
  readonly misplaced: string[];
}

/**
 * Every `.md` under `spec/<band>/<Type>/`, and a sentence for every `.md` that
 * is somewhere else.
 *
 * A markdown file in the wrong place is REFUSED RATHER THAN IGNORED. Silence
 * there would be the worst answer available: a person who wrote a node and put
 * it one folder too high would see it simply not appear, with nothing to read
 * and nothing to fix. Anything that is not a `.md` file is another matter — a
 * README, a `.gitkeep`, an editor's swap file — and passes without a word.
 *
 * A TYPE FOLDER AT THE TOP IS THE OLD LAYOUT, MET BY NAME. Every spec written
 * before the bands moved in is one `git mv` from reading again, and the
 * sentence says exactly where the folder goes — one sentence per folder, not
 * one per file, because the fix is one move.
 */
async function discover(specDir: string): Promise<Discovery> {
  const candidates: Candidate[] = [];
  const problems: FileProblem[] = [];
  const blind: ShutFolder[] = [];
  const misplaced: string[] = [];

  const listing = await readDirectory(specDir);
  if (listing.problem !== null) {
    problems.push({
      file: ".",
      message: `The spec folder could not be listed: ${listing.problem}. Nothing under it is read.`,
    });
    blind.push({ folder: "The spec folder", because: listing.problem });
    return { candidates, problems, blind, misplaced };
  }

  for (const entry of listing.entries) {
    if (await isFolder(specDir, entry)) {
      if (bandOfFolder(entry.name) !== null) {
        await collectBand(
          specDir,
          entry.name,
          candidates,
          problems,
          blind,
          misplaced,
        );
        continue;
      }
      if (isNodeType(entry.name)) {
        misplaced.push(entry.name);
        problems.push({
          file: entry.name,
          message: `${entry.name} sits at the top of the spec folder, but a type folder lives inside its band: ${bandFolderOf(entry.name)}/${entry.name}. Every node file inside it is left out until the folder moves.`,
        });
        continue;
      }
      await collectStrays(
        specDir,
        entry.name,
        `${entry.name} is not one of spec's four band folders (${BAND_FOLDERS.join(", ")})`,
        problems,
      );
      continue;
    }
    if (entry.name.endsWith(MARKDOWN_SUFFIX)) {
      problems.push({
        file: entry.name,
        message: `${entry.name} sits at the top of the spec folder, but a node file lives at <band>/<Type>/${entry.name}.`,
      });
    }
  }

  return { candidates, problems, blind, misplaced };
}

/**
 * A BAND OR TYPE FOLDER MAY BE A SYMBOLIC LINK. `readdir` answers with `lstat`
 * semantics, so a link pointing at a folder is not a directory to it — and an
 * `intent` that is a link would have been neither walked nor mentioned, which
 * is the silent disappearance the stray-file refusal below exists to prevent.
 *
 * Only the two levels the layout names resolve links. `collectStrays` recurses
 * and would follow a link back to a folder above it forever; a node file has
 * one place to be, so nothing is lost by leaving the walk below to `lstat`.
 */
async function isFolder(parent: string, entry: Dirent): Promise<boolean> {
  if (entry.isDirectory()) {
    return true;
  }
  if (!entry.isSymbolicLink()) {
    return false;
  }
  try {
    return (await stat(path.join(parent, entry.name))).isDirectory();
  } catch {
    // A link pointing at nothing is nothing, and the `.md` test below has the
    // next word about it.
    return false;
  }
}

/**
 * One band folder: the type folders that belong to this band are walked, and
 * everything else is answered with the sentence that names the right place —
 * including a type folder filed under the wrong band, which is real work
 * (nodes somebody wrote) one move from reading again.
 */
async function collectBand(
  specDir: string,
  band: string,
  candidates: Candidate[],
  problems: FileProblem[],
  blind: ShutFolder[],
  misplaced: string[],
): Promise<void> {
  const listing = await readDirectory(path.join(specDir, band));
  if (listing.problem !== null) {
    problems.push({
      file: band,
      message: `${band} could not be listed: ${listing.problem}. Every node file inside it is left out.`,
    });
    blind.push({ folder: band, because: listing.problem });
    return;
  }
  for (const entry of listing.entries) {
    const relative = `${band}/${entry.name}`;
    if (await isFolder(path.join(specDir, band), entry)) {
      if (isNodeType(entry.name)) {
        const home = bandFolderOf(entry.name);
        if (home === band) {
          await collectNodes(specDir, band, entry.name, candidates, problems, blind);
        } else {
          misplaced.push(relative);
          problems.push({
            file: relative,
            message: `${relative} is a ${entry.name} folder in the wrong band — a ${entry.name} lives in ${home}/${entry.name}. Every node file inside it is left out until the folder moves.`,
          });
        }
        continue;
      }
      await collectStrays(
        specDir,
        relative,
        `${relative} is not one of the canon's node types`,
        problems,
      );
      continue;
    }
    if (entry.name.endsWith(MARKDOWN_SUFFIX)) {
      problems.push({
        file: relative,
        message: `${relative} sits outside a type folder, but a node file lives in the folder named after its type: ${band}/<Type>/${entry.name}.`,
      });
    }
  }
}

/**
 * A type folder is one flat list of nodes. A folder inside one is not searched
 * — it is somebody's attachments or an editor's cache, and a node file has one
 * place to be.
 */
async function collectNodes(
  specDir: string,
  band: string,
  type: string,
  candidates: Candidate[],
  problems: FileProblem[],
  blind: ShutFolder[],
): Promise<void> {
  const relative = `${band}/${type}`;
  const listing = await readDirectory(path.join(specDir, band, type));
  if (listing.problem !== null) {
    problems.push({
      file: relative,
      message: `${relative} could not be listed: ${listing.problem}. Every node file inside it is left out.`,
    });
    blind.push({ folder: relative, because: listing.problem });
    return;
  }
  for (const entry of listing.entries) {
    if (entry.isDirectory() || !entry.name.endsWith(MARKDOWN_SUFFIX)) {
      continue;
    }
    candidates.push({
      file: `${relative}/${entry.name}`,
      absolutePath: path.join(specDir, band, type, entry.name),
      type,
      id: entry.name.slice(0, -MARKDOWN_SUFFIX.length),
    });
  }
}

/**
 * Walked to the bottom rather than one level deep, because the sentence names
 * the file and a file nested three folders down is exactly the one nobody would
 * otherwise find. `reason` is the clause about the folder at the top of the
 * walk — what it is not — so every file inside answers with the same one fact.
 */
async function collectStrays(
  specDir: string,
  relative: string,
  reason: string,
  problems: FileProblem[],
): Promise<void> {
  const listing = await readDirectory(path.join(specDir, relative));
  if (listing.problem !== null) {
    problems.push({
      file: relative,
      message: `${relative} could not be listed: ${listing.problem}. Nothing inside it is read.`,
    });
    return;
  }
  for (const entry of listing.entries) {
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      await collectStrays(specDir, child, reason, problems);
      continue;
    }
    if (entry.name.endsWith(MARKDOWN_SUFFIX)) {
      problems.push({
        file: child,
        message: `${reason}, so ${child} is not read as a node. A node file lives at <band>/<Type>/<id>.md.`,
      });
    }
  }
}

/**
 * What a file amounted to last time it was read, kept only so long as the file
 * has not moved underneath it.
 *
 * THE CACHE IS ASKED AFTER THE STAT AND NEVER INSTEAD OF IT. Every query stats
 * every file; this only saves reading and re-parsing the ones the stat says are
 * the same file, unchanged.
 *
 * FOUR FIELDS OF ONE STAT, AND EACH CLOSES A DOOR THE OTHERS LEAVE OPEN.
 * `mtimeMs` is when the contents last changed, and it is the obvious one and the
 * weakest: it is the one stamp a program is allowed to set to whatever it likes,
 * and `tar -x`, `rsync -t`, `cp -p`, `unzip` and every backup restore write the
 * content and then put the ARCHIVED time back, which is a file with new contents
 * under an old stamp. `size` catches a change that also changed the length,
 * which is most of them. `ctimeMs` is the one userspace cannot forge on a POSIX
 * filesystem — it moves on every write and on every `chmod` — so it closes the
 * restore case and, incidentally, makes a permission fix show up on the very
 * next query. `ino` catches a delete and a recreate that landed on the same
 * numbers.
 *
 * WHAT IS LEFT, SAID OUT LOUD: on Windows `ctimeMs` is the file's birth time
 * rather than its change time, so there it adds nothing — but NTFS keeps
 * `mtime` to 100 nanoseconds, which is finer than any two edits a person or an
 * agent makes. A content hash would close everything at the price of reading
 * every file on every query, which is the cost this cache exists to avoid.
 */
interface CacheEntry {
  readonly mtimeMs: number;
  readonly ctimeMs: number;
  readonly size: number;
  readonly ino: number;
  readonly reading: NodeFileReading;
}

/** Per resolved `specDir`, so two projects open at once cannot share a memory. */
const caches = new Map<string, Map<string, CacheEntry>>();

function cacheFor(specDir: string): Map<string, CacheEntry> {
  let cache = caches.get(specDir);
  if (cache === undefined) {
    cache = new Map<string, CacheEntry>();
    caches.set(specDir, cache);
  }
  return cache;
}

/** One candidate, read and judged on its own — before any other file is consulted. */
interface Reading {
  readonly candidate: Candidate;
  readonly mtimeMs: number;
  readonly reading: NodeFileReading;
  /** The file's own problems, plus everything the cross-file stage adds to them. */
  readonly problems: string[];
}

async function readCandidates(
  specDir: string,
  candidates: readonly Candidate[],
): Promise<Reading[]> {
  const cache = cacheFor(specDir);
  const seen = new Set<string>();
  const readings: Reading[] = [];

  for (const candidate of candidates) {
    const fileName = `${candidate.id}${MARKDOWN_SUFFIX}`;
    let details;
    try {
      details = await stat(candidate.absolutePath);
    } catch (error) {
      // Deleted between the listing and the stat. It is not in the graph and it
      // is not a problem either: nobody asked about a file that is not there.
      if (isAbsent(error)) {
        continue;
      }
      // Anything else is a file that is THERE and cannot be looked at — a
      // symbolic link pointing at itself is the reachable one — and it costs
      // its own node like every other file this stage cannot get at.
      cache.delete(candidate.file);
      seen.add(candidate.file);
      readings.push({
        candidate,
        mtimeMs: 0,
        reading: { edges: [], problems: [] },
        problems: [
          `${fileName} could not be read: ${describeFailure(error)}. Only this file is left out.`,
        ],
      });
      continue;
    }
    const cached = cache.get(candidate.file);
    let reading: NodeFileReading;
    if (
      cached !== undefined &&
      cached.mtimeMs === details.mtimeMs &&
      cached.ctimeMs === details.ctimeMs &&
      cached.size === details.size &&
      cached.ino === details.ino
    ) {
      reading = cached.reading;
    } else {
      const text = await readText(candidate.absolutePath);
      if (text.kind === "absent") {
        // Deleted between the stat and the read, which is the same non-event as
        // deleted before the stat: it is left out of `seen`, so the sweep below
        // forgets it too.
        continue;
      }
      if (text.kind === "unreadable") {
        // ONE SHUT FILE COSTS ITS OWN NODE AND NOTHING ELSE. Nothing is cached
        // for it, so the query after a `chmod` reads the file rather than
        // repeating a sentence about one that is fine now, and no earlier parse
        // of it can be served in its place either.
        cache.delete(candidate.file);
        reading = {
          edges: [],
          problems: [
            `${fileName} could not be read: ${text.because}. Only this file is left out.`,
          ],
        };
      } else {
        reading = parseNodeFile(candidate.type, fileName, text.text);
        // Stored under the stat taken BEFORE the read. A write landing in
        // between stores the new bytes under the old stamp, which the next stat
        // then disagrees with — so the entry is thrown away rather than trusted,
        // and the mistake costs one re-read instead of a wrong answer.
        cache.set(candidate.file, {
          mtimeMs: details.mtimeMs,
          ctimeMs: details.ctimeMs,
          size: details.size,
          ino: details.ino,
          reading,
        });
      }
    }
    seen.add(candidate.file);

    readings.push({
      candidate,
      mtimeMs: details.mtimeMs,
      reading,
      problems: [...reading.problems],
    });
  }

  // A file that is gone should not hold memory for the life of the daemon, and
  // an id reused for a different node must not meet its predecessor's parse.
  for (const key of [...cache.keys()]) {
    if (!seen.has(key)) {
      cache.delete(key);
    }
  }

  return readings;
}

/**
 * The whole folder as a graph.
 *
 * THREE STAGES, AND THE ORDER IS THE POINT. Each file is read alone; then ids
 * are settled, because until they are there is no telling which node an edge
 * names; then the canon's grammar, which needs the TARGET's type and so cannot
 * be judged inside one file.
 *
 * A TARGET THAT IS NOT THERE IS NOT JUDGED AT ALL. A relation to an id no file
 * answers to is kept exactly as written: the line is the history of a deletion
 * and the clue for the re-anchor, and it is what makes restoring the missing
 * file heal the graph by itself. Whether the hole matters — and to whom — is
 * arithmetic over the loaded graph, never a fault of the file that kept faith
 * with what it saw.
 *
 * A FILE WITH ANY PROBLEM IS LEFT OUT WHOLE — its node and its edges together.
 * Half a node is a worse answer than none: a panel that shows a Requirement with
 * its statement silently missing is a panel that lies, and an edge kept from a
 * file nobody could read is an edge with no source.
 */
export async function loadGraph(specDir: string): Promise<SpecGraph> {
  const root = path.resolve(specDir);
  const discovered = await discover(root);
  const readings = await readCandidates(root, discovered.candidates);

  // Grouped case-insensitively, because two files whose names differ only in
  // case cannot both exist on macOS or Windows: a clone of this repository would
  // arrive there with one of them missing or the two of them merged, so the
  // state is refused where it can still be seen — here, on the machine that
  // produced it.
  const groups = new Map<string, Reading[]>();
  for (const reading of readings) {
    const key = reading.candidate.id.toLowerCase();
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [reading]);
    } else {
      group.push(reading);
    }
  }

  // What each id names, for the grammar stage below. It is derived from PATHS
  // and not from contents: an edge's legality depends on the target's TYPE,
  // which its folder states no matter what is wrong inside the file, so a
  // referrer's fate does not swing on whether its target parses today. An id
  // that could never name a node at all is left out, so a reference to one
  // dangles rather than being judged against a type nothing can have.
  const typeById = new Map<string, string>();
  for (const group of groups.values()) {
    const only = group[0];
    if (only === undefined) {
      continue;
    }
    if (group.length === 1) {
      if (judgeNodeId(only.candidate.id) === null) {
        typeById.set(only.candidate.id, only.candidate.type);
      }
      continue;
    }

    // BOTH SIDES OF A COLLISION ARE REFUSED. Serving the alphabetically first
    // would settle a fight arbitrarily and invisibly, and only a merge can
    // produce this state — so it is said loudly and no file is guessed at.
    const files = group.map((reading) => reading.candidate.file);
    const identical = group.every(
      (reading) => reading.candidate.id === only.candidate.id,
    );
    const sentence = identical
      ? `${only.candidate.id} is the id of ${namesPhrase(files)}. An id names one node, so every file claiming it is left out until one of them is renamed or removed.`
      : `${namesPhrase(files)} differ only in case, and two such files cannot sit side by side on every filesystem. Every one of them is left out until the names differ by more than case.`;
    for (const reading of group) {
      reading.problems.push(sentence);
    }
  }

  // The canon's grammar, which is the one judgement a file cannot make about
  // itself. It is measured against the type map above rather than against the
  // nodes that survive, so that whether this edge is grammatical does not depend
  // on whether some other file happens to parse today.
  for (const reading of readings) {
    if (reading.problems.length > 0) {
      continue;
    }
    for (const edge of reading.reading.edges) {
      const toType = typeById.get(edge.toId);
      if (toType === undefined) {
        continue;
      }
      if (!isPermittedTriple(reading.candidate.type, toType, edge.type)) {
        reading.problems.push(
          `${edge.type} is not allowed from ${reading.candidate.type} to ${toType}, so ${edge.fromId} cannot relate to ${edge.toId} that way.`,
        );
      }
    }
  }

  const nodes: SpecNode[] = [];
  const edges: SpecEdge[] = [];
  const refused: RefusedFile[] = [];
  for (const reading of readings) {
    if (reading.problems.length > 0) {
      refused.push({
        file: reading.candidate.file,
        type: reading.candidate.type,
        id: reading.candidate.id,
        problems: [...reading.problems],
      });
      continue;
    }
    const parsed = reading.reading.node;
    if (parsed === undefined) {
      // Unreachable: the reader hands back a node exactly when it hands back no
      // problems. Written out because the types say `node` is optional and a
      // cast would be a promise made to the compiler instead of a check.
      continue;
    }
    // One instant, twice. A file has one mtime and no birth time worth trusting
    // — `birthtime` is a lie on several Linux filesystems — so a node reads as
    // having been written when it was last modified.
    const stamp = Math.floor(reading.mtimeMs);
    // COPIED OUT OF THE CACHE AND NOT HANDED OUT OF IT. The parse behind
    // `parsed` is kept for the next query, so a caller that wrote into the
    // object it was given would be writing into every later answer — a graph
    // that disagrees with the files, which is the one thing this module exists
    // not to do. The spread copies the node whole: every field, the body
    // included, is an immutable string.
    nodes.push({
      ...parsed,
      createdAt: stamp,
      updatedAt: stamp,
    });

    for (const edge of reading.reading.edges) {
      // Kept whether or not the target is there — see the header. What the
      // canvas can draw of it is the daemon's editing, not this module's.
      edges.push({ ...edge });
    }
  }

  const problems: FileProblem[] = [...discovered.problems];
  for (const reading of readings) {
    for (const message of reading.problems) {
      problems.push({ file: reading.candidate.file, message });
    }
  }

  // Id order for the nodes, which is the order the canvas lays cards out in and
  // the order the old `asc(id)` gave. The edges have no name of their own, so
  // they take the triple that identifies them. The problems go by file, so a
  // person reads them folder by folder; `sort` is stable, so the several
  // sentences against one file stay in the order that file produced them.
  nodes.sort((a, b) => compare(a.id, b.id));
  edges.sort(
    (a, b) =>
      compare(a.fromId, b.fromId) ||
      compare(a.type, b.type) ||
      compare(a.toId, b.toId),
  );
  problems.sort((a, b) => compare(a.file, b.file));
  refused.sort((a, b) => compare(a.file, b.file));

  return { nodes, edges, problems, refused };
}

/** The tail of the queue for each spec folder, so the next write can join it. */
const queues = new Map<string, Promise<unknown>>();

/**
 * One write at a time per spec folder, because a write is the unit of work and
 * several of them are read-modify-write over the same file.
 *
 * A single rename never needed this. A read-modify-write is a different animal
 * — the await between reading a file and rewriting it is a gap another write
 * would slip into, and two writes that both read the same file before either
 * rewrote it would leave the second one's version standing with the first one's
 * change gone. Queuing removes the gaps rather than teaching every caller to
 * retry, and it is what the architecture already claims: the daemon is the
 * single Shall process writing these files.
 *
 * READS DO NOT QUEUE. `loadGraph` never waits for a write, because a write
 * lands by rename and a reader therefore sees one whole version of a file or
 * another — never half of one. That is also the arrangement that keeps an agent
 * editing the folder from being a party this queue has to know about.
 *
 * Nothing inside `run` may call back in here — the queue would be waiting on
 * itself. The helpers below take the resolved folder they were handed instead.
 */
async function withSpecDir<T>(
  specDir: string,
  run: () => Promise<T>,
): Promise<T> {
  const ahead = queues.get(specDir) ?? Promise.resolve();
  // A write that failed is still a write that finished, so the queue moves on.
  const turn = ahead.catch(() => undefined).then(run);
  queues.set(specDir, turn);
  return turn;
}

/**
 * Written beside the file and moved onto it, so a reader — the panel, another
 * agent, `git status` — never meets a half-written node. A `.tmp` left behind
 * by a crash is ignored by the loader rather than read as a node.
 *
 * THE NAME IS UNIQUE PER WRITE AND NOT PER PROCESS. The pid says who is
 * writing, which is worth knowing when a stray file turns up, but it is not
 * enough on its own to say WHICH write: two daemons in separate pid namespaces
 * over one mounted volume, or one pid reused after the first daemon died, would
 * share the name — and two writers sharing a temp path is one of them
 * truncating the other's bytes and the loser renaming a file that is no longer
 * there. The random tail costs nothing and removes the question.
 */
async function writeBytes(target: string, text: string): Promise<void> {
  const temporary = `${target}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    await writeFile(temporary, text, "utf8");
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/**
 * THE INVARIANT OF THIS MODULE: it never writes a file it cannot read back.
 *
 * The bytes are emitted, then parsed by the very reader the loader uses, and a
 * single problem refuses the write before anything reaches the disk. That is
 * why there is no second copy here of the rules about names, ids, self-edges or
 * repeated relations — the sentence a caller gets is the sentence the loader
 * would have served over the file, which is the same sentence either way round.
 */
async function writeNodeFile(
  specDir: string,
  type: string,
  id: string,
  fields: NodeFileFields,
  edges: readonly NodeFileEdge[],
  // Required and never defaulted, so the compiler walks every caller: a door
  // that forgot the blocks would silently strip a node's approval on save.
  blocks: NodeFileBlocks,
): Promise<SpecNode> {
  const fileName = `${id}${MARKDOWN_SUFFIX}`;
  const text = emitNodeFile(type, fields, edges, blocks);

  const reading = parseNodeFile(type, fileName, text);
  const first = reading.problems[0];
  if (first !== undefined) {
    throw invalid(first);
  }
  const parsed = reading.node;
  if (parsed === undefined) {
    // Unreachable, and a defect rather than a refusal if it ever is not: a
    // refusal is a sentence a person reads in a panel, and this would be the
    // emitter and the reader disagreeing about the format.
    throw new Error(`Emitted a ${type} file that cannot be read back: ${id}`);
  }

  const band = bandFolderOf(type);
  if (band === null) {
    // Unreachable for the same reason: `emitNodeFile` above already threw for a
    // type outside the canon, and every canon type has a band.
    throw new Error(`No band folder for node type: ${type}`);
  }
  const relative = `${band}/${type}/${fileName}`;
  const directory = path.join(specDir, band, type);
  const target = path.join(directory, fileName);
  try {
    // On demand, because git does not carry an empty folder: pre-creating every
    // band and type would put twenty-seven folders in a person's working tree
    // that no commit could keep.
    await mkdir(directory, { recursive: true });
    await writeBytes(target, text);
  } catch (error) {
    // THE TWO HALVES ANSWER IN ONE VOICE. A `spec` that is somehow a file reads
    // as an empty graph rather than as a failure, so a create over the same path
    // must not be the half that hands back an errno the panel has no slot for.
    // `conflict`, because the payload is fine and it is the folder that is in
    // the way.
    throw conflict(
      `${relative} could not be written: ${describeFailure(error)}.`,
    );
  }

  // The writer knows what it wrote, so it drops the entry rather than leaving
  // the next stat to notice — which closes the same-millisecond window for
  // every write this module makes.
  cacheFor(specDir).delete(relative);

  const stamp = Math.floor((await stat(target)).mtimeMs);
  return { ...parsed, createdAt: stamp, updatedAt: stamp };
}

/**
 * The file a bare id names, found by walking the folders rather than by guessing
 * a path: on a case-insensitive filesystem `stat("r-0001.md")` happily answers
 * for `R-0001.md`, and an id that differs by case is a different id here.
 */
function locate(
  candidates: readonly Candidate[],
  id: string,
): Candidate | undefined {
  return candidates.find((candidate) => candidate.id === id);
}

/**
 * The listing a write door decides from, or a refusal naming the folder that
 * would not open.
 *
 * A READ CARRIES ON PAST A SHUT FOLDER; A WRITE MUST NOT. Every door below asks
 * the listing a question whose WRONG answer is worse than no answer at all — is
 * this id taken, which file does this bare id name — and a listing with a hole
 * in it says "nothing" where the truth is "that one". A create that believed it
 * would write a second file claiming an id somebody else already has, which
 * costs BOTH files at the next load; an update would say `Unknown node` about a
 * node that is sitting right there.
 */
async function discoverForWriting(specDir: string): Promise<Discovery> {
  const discovery = await discover(specDir);
  const shut = discovery.blind[0];
  if (shut !== undefined) {
    throw conflict(
      `${shut.folder} could not be listed: ${shut.because}. Nothing was written, because Shall cannot tell what this project holds while one of its folders is shut.`,
    );
  }
  // A misplaced type folder is the same hole a shut one is, self-inflicted:
  // its files are refused at read, so the ids they claim are invisible to the
  // checks above — and an id handed out now would collide with one of them the
  // moment the folder moves to where its own sentence points.
  const stranded = discovery.misplaced[0];
  if (stranded !== undefined) {
    throw conflict(
      `${stranded} is a type folder out of its place, and the ids inside it cannot be counted. Nothing was written — the read side names the folder's home, and the write is safe once it moves.`,
    );
  }
  return discovery;
}

/**
 * The file as it stands, or a refusal naming what is wrong with it.
 *
 * A WRITE OVER A FILE THAT DOES NOT PARSE IS REFUSED, not performed. The file is
 * somebody's half-finished edit or the wreckage of a merge, and the panel's
 * version of that node was read before either happened — saving it would throw
 * the edit away with nothing to undo. `conflict`, because the payload is fine
 * and it is the state on disk that stands in the way.
 *
 * It hands back the node itself rather than the reading, so that every caller
 * below has one and none of them has to write out what the reader would have to
 * be broken for: a file with no problems always has a node.
 */
async function readNodeFile(
  candidate: Candidate,
): Promise<{ node: ParsedNode; edges: readonly SpecEdge[] }> {
  const text = await readText(candidate.absolutePath);
  if (text.kind === "absent") {
    // Listed a moment ago and gone now. The caller named a node, and there is no
    // node — the same answer it would have had a moment later.
    throw missing(`Unknown node: ${candidate.id}`);
  }
  if (text.kind === "unreadable") {
    // The same refusal as a file that will not parse, for the same reason: a
    // write over bytes this module could not read is a write over an edit
    // nobody can get back.
    throw conflict(
      `${candidate.file} could not be read: ${text.because}. Nothing was written.`,
    );
  }
  const reading = parseNodeFile(
    candidate.type,
    `${candidate.id}${MARKDOWN_SUFFIX}`,
    text.text,
  );
  const first = reading.problems[0];
  if (first !== undefined) {
    throw conflict(
      `${candidate.file} has been edited into a state Shall cannot read — ${first} Nothing was written, so that edit is still there to fix.`,
    );
  }
  const node = reading.node;
  if (node === undefined) {
    throw new Error(`Read ${candidate.file} as neither a node nor a problem.`);
  }
  return { node, edges: reading.edges };
}

/**
 * The values a write door hands over, settled as the file would hold them: the
 * names trimmed, the body's line endings and blank-line edges brought to the
 * canonical form. SETTLED AND NOT JUDGED — whether what is left is usable
 * (empty names, a NUL, the byte cap) is asked by the reader over the emitted
 * bytes, so that one set of sentences answers for both doors and for the
 * loader, and in the order a person reads a file: names first, body after.
 */
function settleFields(values: SpecNodeValues): NodeFileFields {
  return {
    shortName: judgeText("A short name", values.shortName).value,
    name: judgeText("A name", values.name).value,
    body: judgeBody(values.body).value,
  };
}

/**
 * A new node, and the file that is it.
 *
 * The id is checked against every folder and not only against this type's,
 * because an edge names a bare id: two nodes called `R-0001` in two folders
 * would make `to: R-0001` a question with two answers. The case-insensitive
 * check is the same fact seen from the filesystem — `r-0001.md` and `R-0001.md`
 * are one file on macOS and on Windows, and this repository travels.
 */
export async function createNodeFile(
  specDir: string,
  type: string,
  id: string,
  values: SpecNodeValues,
  edges: readonly NodeFileEdge[] = [],
): Promise<SpecNode> {
  const root = path.resolve(specDir);
  return withSpecDir(root, async () => {
    // Nothing further can be said about a type outside the canon — not which
    // folder the file would live in, not what it would look like — so this
    // answer is alone.
    if (!isNodeType(type)) {
      throw invalid(`Unknown node type: ${type}`);
    }
    const fields = settleFields(values);
    const shape = judgeNodeId(id);
    if (shape !== null) {
      throw invalid(shape);
    }

    const { candidates } = await discoverForWriting(root);
    if (locate(candidates, id) !== undefined) {
      throw conflict(`${id} is already used by another node. Choose another id.`);
    }
    const lowered = id.toLowerCase();
    const nearly = candidates.find(
      (candidate) => candidate.id.toLowerCase() === lowered,
    );
    if (nearly !== undefined) {
      throw conflict(
        `${id} differs only in case from ${nearly.id}, and two such files cannot sit side by side on every filesystem. Choose another id.`,
      );
    }

    // A new node carries no machine block: nobody has approved what nobody
    // has read, and nothing proposes the deletion of what was just made.
    return writeNodeFile(root, type, id, fields, edges, {});
  });
}

/** What a scaffold answered with: the id it chose, and the file, relative to the spec folder. */
export interface ScaffoldedNode {
  readonly id: string;
  readonly file: string;
}

/**
 * A starting file for one new node, written at the node's own path with the
 * next free id as its name — the door behind `shall add-spec-node`.
 *
 * IT WRITES A FILE THAT REFUSES ITSELF, ON PURPOSE. The scaffold ships with
 * both names blank, so until somebody fills it in the loader serves "A short
 * name is required." over it instead of half a node — the same guidance loop a
 * hand-copied template has always had. This is the one write in this module
 * that skips the read-back invariant, because that invariant is about nodes
 * and a scaffold is deliberately not one yet.
 *
 * THE ID MOVES PAST EVERYTHING TAKEN, in the suggestion's own way: one past
 * the highest ordinal of the type's shape, so a deleted node's id is never
 * reused — an edge left over from the old holder would otherwise attach to the
 * new one without a word. An id that collides with a hand-written one in
 * another case pushes the ask one further rather than writing a file two
 * filesystems cannot keep apart.
 */
export async function scaffoldNodeFile(
  specDir: string,
  type: string,
): Promise<ScaffoldedNode> {
  const root = path.resolve(specDir);
  return withSpecDir(root, async () => {
    if (!isNodeType(type)) {
      throw invalid(`Unknown node type: ${type}`);
    }
    const { candidates } = await discoverForWriting(root);

    const taken = new Set(
      candidates.map((candidate) => candidate.id.toLowerCase()),
    );
    const ids = candidates.map((candidate) => candidate.id);
    let id = nextIdSuggestion(type, ids);
    while (id !== "" && taken.has(id.toLowerCase())) {
      // A case collision. The suggestion is now the highest id of its own
      // shape, so pushing it into the list and asking again moves one past it.
      ids.push(id);
      id = nextIdSuggestion(type, ids);
    }
    if (id === "") {
      throw conflict(
        `Every ${type} id of the suggested shape is taken, so no name could be chosen. Write the file by hand with an id of your own.`,
      );
    }

    const band = bandFolderOf(type);
    if (band === null) {
      // Unreachable: every canon type has a band, and the type was checked above.
      throw new Error(`No band folder for node type: ${type}`);
    }
    const fileName = `${id}${MARKDOWN_SUFFIX}`;
    const relative = `${band}/${type}/${fileName}`;
    const directory = path.join(root, band, type);
    try {
      await mkdir(directory, { recursive: true });
      await writeBytes(path.join(directory, fileName), emitScaffold(type));
    } catch (error) {
      throw conflict(
        `${relative} could not be written: ${describeFailure(error)}.`,
      );
    }
    return { id, file: relative };
  });
}

/**
 * The node's values, replaced. Its type, its id and its relations are not the
 * edit's to reach: the first two are the path, and the edges are lines in this
 * file that this door did not receive and therefore carries over untouched.
 */
export async function updateNodeFile(
  specDir: string,
  id: string,
  values: SpecNodeValues,
): Promise<SpecNode> {
  const root = path.resolve(specDir);
  return withSpecDir(root, async () => {
    const { candidates } = await discoverForWriting(root);
    const found = locate(candidates, id);
    if (found === undefined) {
      throw missing(`Unknown node: ${id}`);
    }
    // The disk is asked about before the payload is judged, because both
    // questions are about what is there and a person who is told their body
    // is too long, then told the file was unreadable all along, has been sent
    // twice for one answer.
    const held = await readNodeFile(found);
    const fields = settleFields(values);
    // The blocks ride along like the edges do: lines in this file the edit did
    // not receive and therefore does not touch. The changed content un-matches
    // an approval's hash by itself — that is arithmetic, not this door's job.
    return writeNodeFile(
      root,
      found.type,
      id,
      fields,
      held.edges,
      blocksOf(held.node),
    );
  });
}

/**
 * The node's own file, and not one byte of any other.
 *
 * A DELETION TOUCHES ONE FILE. The outgoing relations go with it, because they
 * were lines in it; the incoming ones are lines in OTHER files, and those files
 * are nobody's to edit but their author's. A machine that rewrote a neighbour
 * would mint a change nobody intended — and under an approval regime, a yellow
 * nobody asked for, which teaches people to approve without reading. The lines
 * that point at the removed node stay exactly where they are: they are the
 * history of the deletion and the address a restore comes back to, the loader
 * keeps them, the check names them, and whoever re-anchors does it with
 * intent.
 */
export async function deleteNodeFile(
  specDir: string,
  id: string,
): Promise<void> {
  const root = path.resolve(specDir);
  return withSpecDir(root, async () => {
    const { candidates } = await discoverForWriting(root);
    const target = locate(candidates, id);
    if (target === undefined) {
      throw missing(`Unknown node: ${id}`);
    }

    try {
      await unlink(target.absolutePath);
    } catch (error) {
      // Removed by somebody else between the listing and now. The caller asked
      // for it to be gone and it is gone.
      if (!isAbsent(error)) {
        throw conflict(
          `${target.file} could not be removed: ${describeFailure(error)}.`,
        );
      }
    }
    cacheFor(root).delete(target.file);
  });
}

/**
 * One relation, written into the file it leaves.
 *
 * WHETHER THE CANON ALLOWS THE TRIPLE IS NOT ASKED HERE. That judgement needs
 * both node types and, to be any use, the list of relations that would have
 * worked instead — which is the daemon's door, where the person and their two
 * boxes are. This module's fences are the ones it can see from one file and the
 * paths around it, and the loader judges the grammar again over every file no
 * door of ours wrote.
 */
export async function addEdge(
  specDir: string,
  edge: { fromId: string; type: string; toId: string },
): Promise<SpecEdge> {
  const root = path.resolve(specDir);
  return withSpecDir(root, async () => {
    const { candidates } = await discoverForWriting(root);
    const from = locate(candidates, edge.fromId);
    if (from === undefined) {
      throw missing(`Unknown node: ${edge.fromId}`);
    }
    if (locate(candidates, edge.toId) === undefined) {
      throw missing(`Unknown node: ${edge.toId}`);
    }

    const held = await readNodeFile(from);
    // A second identical line is drawn on top of the first, so the canvas cannot
    // show that there are two, and no reading of the graph is helped by one.
    if (
      held.edges.some(
        (existing) =>
          existing.type === edge.type && existing.toId === edge.toId,
      )
    ) {
      throw conflict(
        `${edge.fromId} already has a ${edge.type} relation to ${edge.toId}.`,
      );
    }

    // A relation from a node to itself is refused by the reader over the bytes
    // below, in the sentence the create door uses for it.
    await writeNodeFile(
      root,
      from.type,
      from.id,
      held.node,
      [...held.edges, { type: edge.type, toId: edge.toId }],
      blocksOf(held.node),
    );
    return {
      id: formatEdgeId(edge.fromId, edge.type, edge.toId),
      type: edge.type,
      fromId: edge.fromId,
      toId: edge.toId,
    };
  });
}

/**
 * The relation an id names, taken back out of its source file. The id is the
 * triple, so there is nothing to look up: it says which file to rewrite and
 * which line to leave out.
 *
 * An id that is not a triple, a source that is not there and a relation the file
 * does not have are ONE ANSWER, because they are one fact from the caller's side
 * — the edge it is holding is not an edge this folder has.
 */
export async function removeEdge(
  specDir: string,
  edgeId: string,
): Promise<void> {
  const root = path.resolve(specDir);
  return withSpecDir(root, async () => {
    const triple = parseEdgeId(edgeId);
    if (triple === null) {
      throw missing(`Unknown edge: ${edgeId}`);
    }

    const { candidates } = await discoverForWriting(root);
    const from = locate(candidates, triple.fromId);
    if (from === undefined) {
      throw missing(`Unknown edge: ${edgeId}`);
    }

    const held = await readNodeFile(from);
    const kept = held.edges.filter(
      (edge) => !(edge.type === triple.type && edge.toId === triple.toId),
    );
    if (kept.length === held.edges.length) {
      throw missing(`Unknown edge: ${edgeId}`);
    }

    await writeNodeFile(
      root,
      from.type,
      from.id,
      held.node,
      kept,
      blocksOf(held.node),
    );
  });
}
