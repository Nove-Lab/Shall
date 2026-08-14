import type { SpecEdge, SpecNode } from "@shall/core/graph";
import {
  bandFolderOf,
  isNodeType,
  isPermittedTriple,
  judgeNodeId,
  judgeText,
  NODE_TYPES,
  permittedEdgeTypes,
} from "@shall/core/graph";
import { isCanonical } from "@shall/core/serialize";
import type { FileProblem } from "@shall/core/store";
import {
  addEdge,
  createNodeFile,
  deleteNodeFile,
  isStoreRefusal,
  loadGraph,
  removeEdge,
  scaffoldNodeFile,
  updateNodeFile,
} from "@shall/core/store";
import { Refusal, conflict, invalid, missing } from "./errors.js";
import { requireRegistryProject } from "./projects.js";
import {
  findProjectRootAbove,
  getProjectShallPath,
  getProjectSpecPath,
  pathExists,
  readSpecNodeFile,
} from "../host/project-files.js";

async function specDirFor(projectId: string): Promise<string> {
  const project = await requireRegistryProject(projectId);

  // The registry outlives the folder it points at — a project gets moved,
  // deleted, or checked out somewhere else and the entry stays behind. It
  // matters more now than it did: a spec folder that is not there is a graph
  // with nothing in it, which is the right answer for a project whose graph is
  // empty and a silent lie for one that was deleted. This is what tells the two
  // apart, in the words the picker uses.
  if (!(await pathExists(getProjectShallPath(project.path)))) {
    throw missing(`Not a Shall project: ${project.path}`);
  }
  return getProjectSpecPath(project.path);
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
async function served<T>(work: Promise<T>): Promise<T> {
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
 */
function requireText(label: string, value: string): string {
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

  return served(
    createNodeFile(specDir, type, id, {
      shortName: input.shortName,
      name: input.name,
      body: input.body,
    }),
  );
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
}): Promise<SpecNode> {
  const id = requireText("An id", input.id);
  const specDir = await specDirFor(input.projectId);

  return served(
    updateNodeFile(specDir, id, {
      shortName: input.shortName,
      name: input.name,
      body: input.body,
    }),
  );
}

/**
 * The node's file, and every relation that touches it: the outgoing ones go with
 * the file, because that is the only place they were written, and the incoming
 * ones are rewritten out of the files that hold them. The dialog's promise about
 * "every relation that touches it" is therefore still true.
 */
export async function removeSpecNode(input: {
  projectId: string;
  id: string;
}): Promise<void> {
  const id = requireText("An id", input.id);
  await served(deleteNodeFile(await specDirFor(input.projectId), id));
}

export async function listSpecEdges(projectId: string): Promise<SpecEdge[]> {
  return (await loadGraph(await specDirFor(projectId))).edges;
}

/**
 * What the canon allows between these two node types, said in the order a
 * person can use it: this direction first, because that is the arrow they just
 * drew and the set they can pick from without moving anything.
 *
 * The reverse clause is only worth adding when the arrow could actually be
 * turned around. Between two nodes of one type the reverse is the same
 * direction, so naming it sends the person off to redraw the arrow and meet the
 * identical refusal.
 */
function grammarHint(fromType: string, toType: string): string {
  const forward = permittedEdgeTypes(fromType, toType);
  const hint =
    forward.length > 0 ? ` This direction allows: ${forward.join(", ")}.` : "";

  if (fromType === toType) {
    return hint;
  }

  const reverse = permittedEdgeTypes(toType, fromType);
  return reverse.length > 0
    ? `${hint} The reverse direction allows: ${reverse.join(", ")}.`
    : hint;
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
 * the two node types are a fact about two files, and the hint above is the half
 * a person actually needs. The loader judges the triple again over every file no
 * door of ours wrote, and refuses that file — which is the backstop, not a
 * second voice, because nobody is standing at it waiting to be told.
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
    throw conflict(`${fromId} already has a ${type} relation to ${toId}.`);
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
 * for a miss lists all twenty-three spellings: the caller cannot see a
 * dropdown, so the sentence is the dropdown.
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
    throw invalid(
      `Unknown node type: ${asked}. The canon's types are ${NODE_TYPES.map(
        (entry) => entry.name,
      ).join(", ")}.`,
    );
  }

  const root = await findProjectRootAbove(input.path);
  if (root === null) {
    throw missing(
      `Not a Shall project: ${input.path} — no folder here or above it holds a .shall/project.json.`,
    );
  }

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

/** What a check found: how big the graph is, what it refused, and what it merely noticed. */
export interface SpecCheck {
  root: string;
  nodeCount: number;
  edgeCount: number;
  problems: FileProblem[];
  notes: FileProblem[];
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
 * TWO LISTS, AND THE DIFFERENCE IS WHAT IT COSTS. A problem is a file left out
 * of the graph: something in it is wrong and the graph is smaller than the
 * folder until somebody fixes it. A note is a file that reads perfectly well and
 * is not written the way Shall writes it — comments, another quoting style, keys
 * in another order — all of which the next save from the panel will rewrite
 * away. Nobody should learn that from a diff they did not expect.
 */
export async function checkSpec(startPath: string): Promise<SpecCheck> {
  const root = await findProjectRootAbove(startPath);
  if (root === null) {
    throw missing(
      `Not a Shall project: ${startPath} — no folder here or above it holds a .shall/project.json.`,
    );
  }

  const specDir = getProjectSpecPath(root);
  const graph = await loadGraph(specDir);

  // Only the files that already read as nodes are asked. A file with a problem
  // is not also un-canonical: it has a louder thing wrong with it, and a person
  // told both would be told to fix a formatting difference in a file that is not
  // in the graph at all.
  const notes: FileProblem[] = [];
  for (const node of graph.nodes) {
    const text = await readSpecNodeFile(specDir, node.type, node.id);
    if (text === null || isCanonical(node.type, `${node.id}.md`, text)) {
      continue;
    }
    notes.push({
      // The loader only serves canon types, so the band is always there; the
      // fallback spelling keeps the compiler honest rather than a case alive.
      file: `${bandFolderOf(node.type) ?? "?"}/${node.type}/${node.id}.md`,
      message: `${node.id}.md is valid but not canonical — a save from the UI will rewrite it and drop comments and ordering.`,
    });
  }
  // By file, like the problems, so that a person reading both lists reads one
  // order. The nodes arrive in id order, which is the same order only when a
  // project has one type folder.
  notes.sort((a, b) => (a.file === b.file ? 0 : a.file < b.file ? -1 : 1));

  return {
    root,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    problems: graph.problems,
    notes,
  };
}
