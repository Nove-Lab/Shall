import path from "node:path";
import { missingSentence, reviewGraph, type Ledgers } from "@shall/core/arith";
import type { SpecEdge, SpecNode } from "@shall/core/graph";
import {
  articleFor,
  bandFolderOf,
  bandOf,
  canonTypesSentence,
  grammarHint,
  isNodeType,
  isPermittedTriple,
  judgeNodeId,
  judgeText,
  NODE_TYPES,
  orphanFixSentence,
} from "@shall/core/graph";
import {
  ACCEPTANCES_FILE,
  isCanonical,
  LEDGER_FILE,
  REJECTIONS_FILE,
  valuesOf,
  type AcceptanceLedger,
  type ApprovalLedger,
  type RejectionLedger,
} from "@shall/core/serialize";
import type { FileProblem, SpecGraph } from "@shall/core/store";
import {
  addEdge,
  createNodeFile,
  deleteNodeFile,
  isStoreRefusal,
  loadGraph,
  readAcceptanceLedger,
  readApprovalLedger,
  readRejectionLedger,
  removeEdge,
  scaffoldNodeFile,
  updateNodeFile,
} from "@shall/core/store";
import { Refusal, conflict, invalid, missing } from "./errors.js";
import { payloadHash } from "../host/hash.js";
import { requireRegistryProject } from "./projects.js";
import {
  findProjectRootAbove,
  getProjectAcceptancesPath,
  getProjectFeedDir,
  getProjectLedgerPath,
  getProjectRejectionsPath,
  getProjectShallPath,
  getProjectSpecPath,
  isReachable,
  pathExists,
  readSpecNodeFile,
} from "../host/project-files.js";

/**
 * The project a `spec.*` procedure works in: its path on disk, its spec folder,
 * the three books beside it and the activity feed's folder under them —
 * exported because the review service needs every one of them (git wants the
 * project, the store wants the spec, the colours want all three ledgers) and
 * the activity service needs the feed's folder.
 *
 * `ledgerFile` is the approvals, unqualified, because it was the only book when
 * the name was chosen and every caller of it still means that one. The other
 * two say which they are.
 *
 * `feedDir` IS AN ADDRESS AND NOT AN INPUT. Nothing that computes a colour, a
 * mark or a board row reads it — `requireLedgers` never takes it and `checkSpec`
 * never opens it — so a feed folder that is missing, unreadable or deleted by
 * hand costs the panel that shows it and nothing else.
 */
export interface SpecPaths {
  projectPath: string;
  specDir: string;
  ledgerFile: string;
  rejectionsFile: string;
  acceptancesFile: string;
  feedDir: string;
}

/**
 * The layout, spelled from a project root and asking nothing else.
 *
 * IT IS WHAT THE TWO FAMILIES OF PROCEDURE SHARE. A door that names a project
 * id finds its root in the registry, a door that names a path walks up to one,
 * and from there both are looking at the same six addresses — so the addresses
 * are written down here once and neither family can drift from the other.
 */
export function specPathsOf(root: string): SpecPaths {
  return {
    projectPath: root,
    specDir: getProjectSpecPath(root),
    ledgerFile: getProjectLedgerPath(root),
    rejectionsFile: getProjectRejectionsPath(root),
    acceptancesFile: getProjectAcceptancesPath(root),
    feedDir: getProjectFeedDir(root),
  };
}

/**
 * The same layout for a project the registry knows by id.
 *
 * The registry outlives the folder it points at — a project gets moved,
 * deleted, or checked out somewhere else and the entry stays behind. It
 * matters more now than it did: a spec folder that is not there is a graph
 * with nothing in it, which is the right answer for a project whose graph is
 * empty and a silent lie for one that was deleted. This is what tells the two
 * apart, in the words the picker uses.
 */
export async function projectSpecFor(projectId: string): Promise<SpecPaths> {
  const project = await requireRegistryProject(projectId);
  if (!(await pathExists(getProjectShallPath(project.path)))) {
    throw missing(`Not a Shall project: ${project.path}`);
  }
  return specPathsOf(project.path);
}

/**
 * The project folder holding a path, or the refusal that says there is none —
 * the one door every path-taking procedure comes in through.
 *
 * THE REFUSAL NAMES THE PATH THE CALLER STOOD IN, not the folder that is
 * missing: the caller is a person or an agent in a terminal, and the path they
 * typed is the only address they can act on. Said once here, because `check`,
 * `status`, `board`, `add-spec-node` and `log` all say it.
 */
export async function projectRootAt(startPath: string): Promise<string> {
  const root = await findProjectRootAbove(startPath);
  if (root === null) {
    throw missing(
      `Not a Shall project: ${startPath} — no folder here or above it holds a .shall/project.json.`,
    );
  }
  return root;
}

async function specDirFor(projectId: string): Promise<string> {
  return (await projectSpecFor(projectId)).specDir;
}

/**
 * A refusal from the store, put back on the daemon's rails.
 *
 * Core cannot import a transport, so it refuses in its own three kinds — spelled
 * identically to ours, so there is nothing to translate — and this is the one
 * place that makes them a `Refusal` the router can turn into a status. The
 * sentences are not touched: the store's refusal about a file is the sentence
 * the loader would serve over that same file, and it is the same fact whichever
 * side of the write the person is standing on.
 */
export async function served<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (isStoreRefusal(error)) {
      throw new Refusal(error.kind, error.message);
    }
    throw error;
  }
}

/**
 * A field of the node's own identity — its type, its id, the two ends of an
 * edge — every one of which must carry something, so a blank one is refused by
 * name instead of being written as an empty string a reader would have to
 * interpret.
 *
 * The trim and the two characters no text file can carry are `judgeText`'s,
 * and are written down there in core: the body needs the same treatment without
 * the same answer to emptiness, and one rule applied at one door and forgotten
 * at the next is the defect this repository already knows.
 *
 * THE TWO NAMES AND THE BODY ARE NOT JUDGED HERE ANY MORE. They are judged by
 * the reader, over the bytes the store is about to write, in these same
 * sentences — which is how a file the panel saved and a file a person
 * hand-edited meet one judgement rather than two that can drift.
 *
 * Exported for the one door outside this file that asks the same question of
 * one line of text: the `shall log` door in the activity service, whose summary
 * is one line for a person and is held to the same rule an id is.
 */
export function requireText(label: string, value: string): string {
  const { value: trimmed, problem } = judgeText(label, value);
  if (problem !== null) {
    throw invalid(problem);
  }
  if (trimmed.length === 0) {
    throw invalid(`${label} is required.`);
  }
  // These fields are one line of identity each, and an id travels furthest —
  // into every edge that names it, every address that reaches it, and now into
  // a filename on every collaborator's machine — so a control character here is
  // refused. NUL never reaches this test; `trimmedText` refuses it above with
  // the more exact sentence.
  if (/\p{Cc}/u.test(trimmed)) {
    throw invalid(`${label} cannot contain a control character.`);
  }
  return trimmed;
}

/**
 * The graph the panel draws, which is the part of the folder that reads
 * cleanly.
 *
 * WHAT DID NOT READ IS DROPPED HERE AND NOWHERE ELSE. `loadGraph` hands back a
 * sentence for every file it refused, and this procedure's shape belongs to the
 * web — it answers an array of nodes and has done since before the spec was
 * files. `shall check` is where those sentences are read, which is also the
 * only surface that can afford to print them.
 */
export async function listSpecNodes(projectId: string): Promise<SpecNode[]> {
  return (await loadGraph(await specDirFor(projectId))).nodes;
}

/**
 * The id comes from the person. The client offers `nextIdSuggestion`, but they
 * may type over it, so this is the only place that can settle whether the thing
 * being written is a node the canon knows and an id nothing else has taken.
 *
 * The type is asked about first because a node of no type is not a node,
 * whatever id it was given — the store refuses it too, in this same sentence,
 * and the check here is for the ORDER a person meets the sentences in.
 *
 * THE ID IS A FILENAME NOW, so two things a database settled by itself are
 * settled here instead: that the id is a name every machine this repository is
 * cloned to can write, and that nothing else has taken it. The second is left to
 * the store, which is the only place that can look and write in one turn — an
 * answer given here would be true until the write that made it false. The store
 * judges the values again for the same reason, over the bytes it is about to
 * write; it is the same function, so the two cannot disagree.
 */
export async function createSpecNode(input: {
  projectId: string;
  type: string;
  id: string;
  shortName: string;
  name: string;
  body: string;
  /** A WorkLog's commits. Left out, a new node has none; on another type the reader refuses it. */
  commits?: readonly string[] | undefined;
  /** A Finding's judgement and its hint list, on the same terms as the commits. */
  blocking?: boolean | undefined;
  relatedNodes?: readonly string[] | undefined;
}): Promise<SpecNode> {
  const type = requireText("A node type", input.type);
  if (!isNodeType(type)) {
    throw invalid(`Unknown node type: ${type}`);
  }

  const id = requireText("An id", input.id);
  const shape = judgeNodeId(id);
  if (shape !== null) {
    throw invalid(shape);
  }
  const specDir = await specDirFor(input.projectId);

  // `valuesOf` and not an object written out here: every per-type key is
  // optional, so a literal keeps compiling while quietly dropping the next key
  // the format grows — and this door is where the panel's writes come in.
  return served(createNodeFile(specDir, type, id, valuesOf(input)));
}

/**
 * id, type and createdAt are the node's identity, so an edit cannot reach them.
 * updatedAt it cannot reach either, but for the opposite reason: the edit is
 * what moves it, and the file's own mtime is what it now is.
 *
 * THE STORED NODE IS READ BEFORE THE WRITE, IN THE STORE and not here, because
 * it has to happen in the same turn as the write: a read from this side would
 * be a read another write could get between. It is what turns a vanished id
 * into a sentence before a write is attempted rather than after, and what
 * refuses — rather than overwrites — a file somebody has edited into a state
 * Shall cannot read.
 */
export async function updateSpecNode(input: {
  projectId: string;
  id: string;
  shortName: string;
  name: string;
  body: string;
  /** Sent, the list replaces the file's; left out, the file's list rides along. */
  commits?: readonly string[] | undefined;
  /** A Finding's two keys, on the same terms — sent, they replace; left out, they ride along. */
  blocking?: boolean | undefined;
  relatedNodes?: readonly string[] | undefined;
}): Promise<SpecNode> {
  const id = requireText("An id", input.id);
  const specDir = await specDirFor(input.projectId);

  return served(updateNodeFile(specDir, id, valuesOf(input)));
}

/**
 * The node's own file, and not one byte of any other. The outgoing relations go
 * with it, because they were lines in it; the incoming ones are lines in OTHER
 * files, which stay exactly as their authors left them — the history of the
 * deletion, and the address a restore comes back to. The dialog says so before
 * the person confirms, and names how many lines are about to point at a hole.
 *
 * THE EXECUTION BAND IS NOT DELETED FROM AT ALL. Those files record what
 * happened, and a record's one legitimate end is a retention sweep, not a
 * button — so the door refuses by band, whether or not the file parses.
 */
export async function removeSpecNode(input: {
  projectId: string;
  id: string;
}): Promise<void> {
  const id = requireText("An id", input.id);
  const specDir = await specDirFor(input.projectId);
  const graph = await loadGraph(specDir);
  const held =
    graph.nodes.find((node) => node.id === id) ??
    graph.refused.find((entry) => entry.id === id);
  if (held !== undefined && bandOf(held.type) === "Execution") {
    throw invalid(
      `${id} is ${articleFor(held.type)} ${held.type}, and the execution band is append-only — what happened is not unhappened by deleting its record. Nothing was removed.`,
    );
  }
  await served(deleteNodeFile(specDir, id));
}

/**
 * The relations both of whose ends the loader served as nodes.
 *
 * A dangling relation — kept in its file as the history of a deletion and the
 * clue for a re-anchor — is the check's business and the review's; the canvas
 * draws boxes and lines, and a line to a box that is not there is not a
 * drawing.
 */
function liveEdges(graph: SpecGraph): SpecEdge[] {
  const living = new Set(graph.nodes.map((node) => node.id));
  return graph.edges.filter(
    (edge) => living.has(edge.fromId) && living.has(edge.toId),
  );
}

export async function listSpecEdges(projectId: string): Promise<SpecEdge[]> {
  return liveEdges(await loadGraph(await specDirFor(projectId)));
}

/**
 * A relation the canon does not have is not a relation, so the grammar is
 * enforced here and not left to whatever the screen offered — the screen is a
 * convenience, this is the rule.
 *
 * A refusal names both node types and the edge type, because the person is
 * looking at two boxes and a line and cannot otherwise tell which of the three
 * was wrong, and it goes on to name the relations that would work: dragging
 * from the wrong end and reaching for a name from the wrong pair are the two
 * common mistakes, and neither fix should require reading a grammar table.
 *
 * THE GRAMMAR IS THIS DOOR'S AND ONLY THIS DOOR'S. The store writes the line
 * into the source node's file and judges what one file can say about itself;
 * the two node types are a fact about two files, and the hint appended below is
 * the half a person actually needs. The loader judges the triple again over
 * every file no door of ours wrote and refuses that file — the backstop, which
 * carries the same hint, because the agent who wrote that file by hand is read
 * to by `shall check` and by nothing else.
 */
export async function createSpecEdge(input: {
  projectId: string;
  type: string;
  fromId: string;
  toId: string;
}): Promise<SpecEdge> {
  const type = requireText("An edge type", input.type);
  const fromId = requireText("A source id", input.fromId);
  const toId = requireText("A target id", input.toId);
  const specDir = await specDirFor(input.projectId);

  // One reading of the folder answers both questions below, so what the nodes
  // say and what the edges say cannot come from two different moments.
  const graph = await loadGraph(specDir);
  const from = graph.nodes.find((node) => node.id === fromId);
  if (!from) {
    throw missing(`Unknown node: ${fromId}`);
  }
  const to = graph.nodes.find((node) => node.id === toId);
  if (!to) {
    throw missing(`Unknown node: ${toId}`);
  }

  // The canon has self-loops, but between two nodes of one type — never from a
  // node to itself. Saying that plainly beats a grammar message that names the
  // same type twice and reads like a contradiction.
  if (fromId === toId) {
    throw invalid(`${fromId} cannot relate to itself.`);
  }

  if (!isPermittedTriple(from.type, to.type, type)) {
    throw invalid(
      `${type} is not allowed from ${from.type} to ${to.type}.${grammarHint(from.type, to.type)}`,
    );
  }

  // A second identical line is drawn on top of the first, so the canvas cannot
  // show that there are two, and no reading of the graph is helped by one.
  if (
    graph.edges.some(
      (edge) =>
        edge.type === type && edge.fromId === fromId && edge.toId === toId,
    )
  ) {
    throw conflict(
      `${fromId} already has ${articleFor(type)} ${type} relation to ${toId}.`,
    );
  }

  return served(addEdge(specDir, { fromId, type, toId }));
}

export async function removeSpecEdge(input: {
  projectId: string;
  id: string;
}): Promise<void> {
  const id = requireText("An id", input.id);
  await served(removeEdge(await specDirFor(input.projectId), id));
}

/** What a scaffold answered with, in paths a caller standing anywhere can use. */
export interface ScaffoldedSpec {
  root: string;
  type: string;
  id: string;
  /** Relative to the project root, `/`-separated. */
  file: string;
}

/**
 * A starting file for one new node, placed where it belongs — the procedure
 * behind `shall add-spec-node --type <Type>`.
 *
 * IT TAKES A PATH AND NOT A PROJECT ID, like `checkSpec` and for the same
 * reason: the caller is an agent standing in a checkout, and a checkout that
 * had to be opened in the UI before a node could be scaffolded would make the
 * command less portable than the repository it works in.
 *
 * THE TYPE IS RESOLVED CASE-INSENSITIVELY, because the command is typed by
 * hand and `--type requirement` means the one thing it can mean. The refusal
 * for a miss names every spelling the canon has, in the one sentence core keeps
 * for that job.
 *
 * The id, the band folder and the file's contents are the store's and the
 * template's; this door only says which project and which type.
 */
export async function scaffoldSpecNode(input: {
  path: string;
  type: string;
}): Promise<ScaffoldedSpec> {
  const asked = requireText("A node type", input.type);
  const type = NODE_TYPES.find(
    (entry) => entry.name.toLowerCase() === asked.toLowerCase(),
  )?.name;
  if (type === undefined) {
    throw invalid(`Unknown node type: ${asked}. ${canonTypesSentence()}`);
  }

  const root = await projectRootAt(input.path);
  const scaffolded = await served(
    scaffoldNodeFile(getProjectSpecPath(root), type),
  );
  return {
    root,
    type,
    id: scaffolded.id,
    file: `.shall/spec/${scaffolded.file}`,
  };
}

/** What a check found: how big the graph is, what it refused, where it does not hold, and what it merely noticed. */
export interface SpecCheck {
  root: string;
  /**
   * The scope as it was resolved — spec-relative paths, and empty for the whole
   * folder. It is answered back because a caller spells a scope in whatever way
   * suits where they are standing, and the only way to see that `--scope ../ac`
   * landed where they meant is to read where it landed.
   */
  scope: string[];
  nodeCount: number;
  edgeCount: number;
  problems: FileProblem[];
  gaps: FileProblem[];
  notes: FileProblem[];
}

/** The node's file, relative to the spec folder — the spelling every sentence uses. */
export function fileOf(node: { readonly type: string; readonly id: string }): string {
  return `${bandFolderOf(node.type) ?? "?"}/${node.type}/${node.id}.md`;
}

/** The spec folder's address from the project root — the spelling a person reads in a path. */
const SPEC_FOLDER = ".shall/spec";

/** The path under the spec folder, `/`-separated — or null when it is not under it at all. */
function insideSpec(specDir: string, target: string): string | null {
  const relative = path.relative(specDir, target);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return relative.split(path.sep).join("/");
}

/**
 * ONE SCOPE ENTRY, RESOLVED TO A PATH UNDER THE SPEC FOLDER.
 *
 * A scope is typed from wherever the person is standing, so one entry arrives
 * in any of three spellings and all three mean a file or a folder of the spec:
 * an absolute path, a path relative to the CLI's own cwd — which is
 * `startPath`, never the daemon's — or the spec-relative spelling `intent/Goal`
 * that every row of a check and a status is printed in, with or without
 * `.shall/spec/` in front of it.
 *
 * THE THREE ARE TRIED IN THE ORDER THAT CANNOT MISREAD ONE FOR ANOTHER.
 * `.shall/spec/` is stripped first, because a caller who writes it means the
 * spec folder and nothing else, wherever they are standing. An absolute path is
 * itself. What is left is read against the cwd first — a person who typed a
 * folder they can see means the one they can see — and only when that lands
 * outside the spec is it read as spec-relative, which is what makes `intent`
 * work from the project root and `..` work from inside a type folder.
 *
 * AN ENTRY THAT NAMES NOTHING IS REFUSED, which is what the stat at the bottom
 * is for. A scope is a narrowing a person asked for, so a misspelling —
 * `--scope intnet` — resolves to a prefix no file on disk can match and every
 * list comes back empty: `shall check` prints its count line and exits 0 over a
 * project full of holes, which is a build gate that can never fail. Silence is
 * the one answer a narrowing must not give, and one stat per entry is what it
 * costs to say "you asked about nowhere" instead.
 */
async function scopePrefixOf(
  specDir: string,
  startPath: string,
  asked: string,
): Promise<string> {
  // The trailing slash is taken off first, because `/` is nothing but its own
  // trailing slash: stripping the leading `./` ahead of it would reduce a bare
  // `./` — which means here — to the same emptiness.
  const spelled = asked
    .split(path.sep)
    .join("/")
    .replace(/\/+$/, "")
    .replace(/^(?:\.\/)+/, "");
  if (spelled === "") {
    // All that is left of `/` once its slash is gone. It is the filesystem
    // root, which is outside the spec folder like every other path above it —
    // and read any further it would resolve to the spec folder itself and
    // silently widen the narrowing into the whole project.
    throw invalid(`--scope names a path outside .shall/spec: ${asked}`);
  }
  let resolved: string;
  if (spelled === SPEC_FOLDER || spelled.startsWith(`${SPEC_FOLDER}/`)) {
    resolved = path.resolve(
      specDir,
      spelled.slice(SPEC_FOLDER.length).replace(/^\//, ""),
    );
  } else if (path.isAbsolute(spelled)) {
    resolved = spelled;
  } else {
    const fromCwd = path.resolve(startPath, spelled);
    resolved =
      insideSpec(specDir, fromCwd) === null
        ? path.resolve(specDir, spelled)
        : fromCwd;
  }
  const inside = insideSpec(specDir, resolved);
  if (inside === null) {
    throw invalid(`--scope names a path outside .shall/spec: ${asked}`);
  }
  // A NARROWING THAT SELECTS NOTHING IS A TYPO, NOT AN ANSWER. `--scope intnet`
  // would otherwise match no file, print a whole-project count and exit 0 over a
  // folder full of holes — a build gate that can never fail. A path Shall may
  // not look at is a different matter and is let through: the loader files a row
  // saying the folder would not read, and that row is the answer.
  if (!(await isReachable(resolved))) {
    throw invalid(`--scope names nothing under .shall/spec: ${asked}`);
  }
  return inside;
}

/**
 * The scope a caller asked for, as paths under the spec folder.
 *
 * AN EMPTY LIST IS THE WHOLE SPEC and not an empty answer: a caller who named
 * no folder asked about every one of them. An entry that names nothing is the
 * opposite case and refuses, one function up.
 *
 * The entries are resolved one after another rather than all at once, so the
 * entry somebody is told about is the first one they spelled wrong and not
 * whichever stat happened to come back first.
 */
export async function scopePrefixesOf(
  specDir: string,
  startPath: string,
  scope: readonly string[],
): Promise<string[]> {
  const prefixes: string[] = [];
  for (const asked of scope) {
    prefixes.push(await scopePrefixOf(specDir, startPath, asked));
  }
  return prefixes;
}

/**
 * WHETHER ONE FILE IS INSIDE THE SCOPE — the rule spelled once, because both
 * path-taking readers apply it and a check that disagreed with a status about
 * which files it looked at would be two answers to one question.
 *
 * A prefix takes the file it names exactly and everything in the folder below
 * it, so `intent` takes `intent/Goal/G-0001.md` and never `intention/…`. A
 * prefix that resolved to nothing is the spec folder itself, which holds every
 * file there is — the same answer an empty list gives by naming nothing. And
 * it takes the folders ABOVE it as well, for the reason beneath.
 */
export function isInScope(file: string, prefixes: readonly string[]): boolean {
  return (
    prefixes.length === 0 ||
    prefixes.some(
      (prefix) =>
        prefix === "" ||
        file === prefix ||
        file.startsWith(`${prefix}/`) ||
        isFolderAbove(file, prefix),
    )
  );
}

/**
 * Whether a row's own file is a FOLDER the scope points inside — `.` for the
 * spec folder, `intent` for a band, `intent/Goal` for a type folder, and the
 * folder in a band whose name is no type the canon has.
 *
 * A ROW ABOUT A FOLDER IS THE ANSWER TO "WHY IS NOTHING HERE". Those rows say a
 * folder would not list, or is not the folder it looks like, and that nothing
 * inside it is read — which is precisely why the files a scope was pointed at
 * are not in the graph. A scope inside such a folder is the one moment the row
 * has to be printed, and dropping it would answer a narrowed question with the
 * silence the narrowing itself caused.
 */
function isFolderAbove(file: string, prefix: string): boolean {
  // The spec folder's own row is filed under `.`, which is above every prefix
  // there can be, and `./` is a spelling no row and no prefix ever carries.
  return file === "." || prefix.startsWith(`${file}/`);
}

/** The three books' records and the daemon's hash, as the colour chain takes them. */
export function ledgersOf(records: {
  approvals: ApprovalLedger;
  rejections: RejectionLedger;
  acceptances: AcceptanceLedger;
}): Ledgers {
  return { ...records, hash: payloadHash };
}

/**
 * The spec folder, checked from wherever a person happens to be standing.
 *
 * IT ASKS FOR NO PROJECT ID, and that is the point: the registry is this
 * machine's list of folders somebody opened in the UI, and a fresh clone is in
 * nobody's list. A checkout that could not be checked until it had been opened
 * once would make these files less portable than the repository carrying them,
 * so the project is found by walking up from the path, the way `git` finds its
 * own root.
 *
 * THREE LISTS, AND THE DIFFERENCE IS WHAT EACH COSTS. A problem is a file left
 * out of the graph: something in it is wrong and the graph is smaller than the
 * folder until somebody fixes it — or one of the three ledgers, when it will
 * not read, which are the files nothing green, red-by-rejection or closed can
 * be known without. A gap is a hole the graph holds while every
 * file reads — a relation kept toward an id nothing answers to — so the node is
 * still in the count and the graph still does not hold together until somebody
 * restores the missing file or re-anchors the survivor. A note is a file that
 * reads perfectly well and is not written the way Shall writes it — comments,
 * another quoting style, keys in another order — all of which the next save
 * from the panel will rewrite away. Nobody should learn that from a diff they
 * did not expect.
 *
 * Problems and gaps both fail the check, and that is deliberate pressure: a
 * spec mid-authoring exits 1 until its holes close, which is the check doing
 * its job and not a severity to demote.
 *
 * A SCOPE NARROWS WHAT IS REPORTED AND NOT WHAT IS READ — with one exception
 * that is the whole reason the exception exists. The graph is loaded whole,
 * because a relation's other end is in some other folder and a node's anchor
 * usually is too, so a scope that hid them would answer a different question
 * about the file it was pointed at. What it does hide is the note loop, which
 * opens every node file a SECOND time to compare its bytes against the ones
 * Shall would have written — `loadGraph` read all of them a few lines below,
 * so the scope saves the second read and never the first. That is worth having
 * because an editor hook calls this on every save, and paying twice over a node
 * nobody asked about is the cost that adds up. The counts stay whole-project
 * for the same reason the graph is: they are what the folder holds, not what
 * was asked about.
 *
 * THE LEDGER ROWS ARE NEVER OUT OF SCOPE. They live beside the spec folder
 * rather than inside it, and a book nobody can read poisons every judgement
 * about every node — so the row saying so is printed whatever was asked about.
 */
export async function checkSpec(
  startPath: string,
  scope: readonly string[] = [],
): Promise<SpecCheck> {
  const root = await projectRootAt(startPath);
  const { specDir, ledgerFile, rejectionsFile, acceptancesFile } =
    specPathsOf(root);
  const prefixes = await scopePrefixesOf(specDir, startPath, scope);
  const graph = await loadGraph(specDir);
  const ledger = await readApprovalLedger(ledgerFile);
  const rejections = await readRejectionLedger(rejectionsFile);
  const acceptances = await readAcceptanceLedger(acceptancesFile);

  // The gaps: the graph's holes, computed by the same arithmetic the review
  // serves — over the real ledger and the real hash, so the check and the
  // review can never disagree about a graph. A missing id is filed under
  // every file that names it, because those lines are where the fix happens —
  // a restore of the target, or a re-anchor of the survivor; an orphan is
  // filed under its own file. The source of an edge is always a living node,
  // because a refused file contributes no edges.
  const typeById = new Map(graph.nodes.map((node) => [node.id, node.type]));
  const fileFor = (id: string): string =>
    fileOf({ type: typeById.get(id) ?? "?", id });
  // A book that would not read contributes NO records to the arithmetic, and
  // says so in the problem list below instead. It is the same bargain the
  // approvals have always made here: the check is a report and not a door, so
  // it goes on to count the graph rather than refusing the whole run — and the
  // row it prints is what tells the person why the colours below it are thin.
  const review = reviewGraph(
    graph,
    ledgersOf({
      approvals: ledger.records,
      rejections: rejections.records,
      acceptances: acceptances.records,
    }),
  );
  const gaps: FileProblem[] = [];
  for (const entry of review.missing) {
    for (const referrer of entry.referencedBy) {
      gaps.push({
        file: fileFor(referrer.fromId),
        // Core's own sentence — the same words the Task Board's row quotes.
        message: missingSentence(entry.id, referrer),
      });
    }
  }
  for (const status of review.statuses) {
    if (
      (status.reason === "off-target" ||
        status.reason === "cyclic" ||
        status.reason === "premature") &&
      status.problem !== null
    ) {
      // The aim rule, the loop rule and the blocked-address rule: seams that
      // name other nodes, filed under the node each sentence is about — the
      // aim rule's two ends carry one each, and a loop is filed under EVERY
      // node standing on it, each sentence starting from the file it is under,
      // because the line to cut may be in any of them.
      gaps.push({ file: fileFor(status.id), message: status.problem });
      continue;
    }
    if (status.reason !== "orphan") {
      continue;
    }
    gaps.push({
      file: fileFor(status.id),
      // Core's own sentence — the check and the board say this one identically.
      message: orphanFixSentence(status.id, typeById.get(status.id) ?? "?"),
    });
  }
  gaps.sort((a, b) => (a.file === b.file ? 0 : a.file < b.file ? -1 : 1));

  // Only the files that already read as nodes are asked. A file with a problem
  // is not also un-canonical: it has a louder thing wrong with it, and a person
  // told both would be told to fix a formatting difference in a file that is not
  // in the graph at all.
  //
  // THE SCOPE IS APPLIED HERE, BEFORE THE READ, and that is the whole point of
  // it: everything else in this function is arithmetic over a graph already in
  // memory, and this is the loop that opens each node's file again.
  const notes: FileProblem[] = [];
  for (const node of graph.nodes) {
    const file = fileOf(node);
    if (!isInScope(file, prefixes)) {
      continue;
    }
    const text = await readSpecNodeFile(specDir, node.type, node.id);
    if (text === null || isCanonical(node.type, `${node.id}.md`, text)) {
      continue;
    }
    notes.push({
      file,
      message: `${node.id}.md is valid but not canonical — a save from the UI will rewrite it and drop comments and ordering.`,
    });
  }
  // By file, like the problems, so that a person reading both lists reads one
  // order. The nodes arrive in id order, which is the same order only when a
  // project has one type folder.
  notes.sort((a, b) => (a.file === b.file ? 0 : a.file < b.file ? -1 : 1));

  // A ledger that will not read is a problem like a file that will not read:
  // an error to fix, and the check exits 1 on it. These are the rows in this
  // list spelled from the PROJECT root rather than the spec folder — the
  // ledgers are the spec's siblings, and `../ledger/approvals.yaml` is a
  // spelling nobody would type — and they go first, because a person should
  // hear that a book would not read before a list of node files. All three are
  // asked, in the order they were added to the design, so a folder with two bad
  // books names both rather than sending the person back for a second run.
  // The activity feed under `ledger/feed/` is NOT asked: nothing computes from
  // it, so a month file that will not read is the panel's news and not the
  // check's — the check exits 1 over what decides a colour, and the feed never
  // does.
  const books: FileProblem[] = [];
  for (const [file, problem] of [
    [LEDGER_FILE, ledger.problem],
    [REJECTIONS_FILE, rejections.problem],
    [ACCEPTANCES_FILE, acceptances.problem],
  ] as const) {
    if (problem !== null) {
      books.push({ file: `.shall/${file}`, message: problem });
    }
  }
  const problems: FileProblem[] = [
    ...books,
    ...graph.problems.filter((problem) => isInScope(problem.file, prefixes)),
  ];

  return {
    root,
    scope: prefixes,
    nodeCount: graph.nodes.length,
    // The live relations — a dangling line is a gap above, not a thing the
    // count-line claims the graph holds.
    edgeCount: liveEdges(graph).length,
    problems,
    // Sorted above, then narrowed: a gap is filed under the file somebody
    // opens to fix it, and that file is what the scope is about.
    gaps: gaps.filter((gap) => isInScope(gap.file, prefixes)),
    notes,
  };
}
