import type { SpecEdge, SpecNode } from "@shall/core/graph";
import {
  isNodeType,
  isPermittedTriple,
  permittedEdgeTypes,
} from "@shall/core/graph";
import {
  deleteEdge,
  deleteNode,
  insertEdge,
  insertNode,
  listEdges,
  listNodes,
  updateNode,
} from "@shall/core/store";
import { ulid } from "ulid";
import { conflict, invalid, missing } from "./errors.js";
import { requireRegistryProject } from "./projects.js";
import {
  getProjectDatabasePath,
  getProjectShallPath,
  pathExists,
} from "../host/project-files.js";

async function databaseFor(projectId: string): Promise<string> {
  const project = await requireRegistryProject(projectId);

  // The registry outlives the folder it points at — a project gets moved,
  // deleted, or checked out somewhere else and the entry stays behind. Saying
  // so here, in the words the picker uses, beats letting the sqlite driver
  // answer "unable to open database file" to someone who asked for a node.
  if (!(await pathExists(getProjectShallPath(project.path)))) {
    throw missing(`Not a Shall project: ${project.path}`);
  }
  return getProjectDatabasePath(project.path);
}

/**
 * Every field of a node is required, so a blank one is refused by name instead
 * of being stored as an empty string a reader would have to interpret. The
 * trimmed value is what gets written, so the stored bytes are what the panel
 * showed rather than whatever whitespace came with the paste.
 *
 * NUL is refused outright, because it is the one character sqlite will take and
 * not give back: the full bytes go in, the read stops at the NUL, and what comes
 * out is a shorter string than what went in. A row written that way holds text
 * no screen can show and, if the NUL is in an id, an id nothing can address.
 *
 * A lone surrogate is refused for the same reason and one more. Sqlite stores it
 * as U+FFFD, so the value read back is not the value written — and since a write
 * answers with what it was handed rather than with what landed, the screen would
 * be told a node it does not have. No keyboard or paste makes one; it takes a
 * client that wrote the escape itself, which is exactly the caller who should be
 * told rather than quietly corrected.
 */
function requireText(label: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw invalid(`${label} is required.`);
  }
  if (trimmed.includes("\0")) {
    throw invalid(`${label} cannot contain a NUL character.`);
  }
  if (/\p{Surrogate}/u.test(trimmed)) {
    throw invalid(`${label} is not well-formed text.`);
  }
  return trimmed;
}

export async function listSpecNodes(projectId: string): Promise<SpecNode[]> {
  return listNodes(await databaseFor(projectId));
}

/**
 * The id comes from the person. The client offers `nextIdSuggestion`, but they
 * may type over it, so this is the only place that can settle whether the thing
 * being written is a node the canon knows and an id nothing else has taken.
 */
export async function createSpecNode(input: {
  projectId: string;
  type: string;
  id: string;
  shortName: string;
  name: string;
  content: string;
}): Promise<SpecNode> {
  const type = requireText("A node type", input.type);
  if (!isNodeType(type)) {
    throw invalid(`Unknown node type: ${type}`);
  }

  const id = requireText("An id", input.id);
  const databasePath = await databaseFor(input.projectId);

  // The primary key would refuse a collision anyway, but it would refuse with a
  // constraint violation; the person needs to read which id is already spoken
  // for so they can pick the next one.
  const existing = await listNodes(databasePath);
  if (existing.some((node) => node.id === id)) {
    throw conflict(`${id} is already used by another node. Choose another id.`);
  }

  const node: SpecNode = {
    id,
    type,
    shortName: requireText("A short name", input.shortName),
    name: requireText("A name", input.name),
    content: requireText("Content", input.content),
    createdAt: Date.now(),
  };
  return insertNode(databasePath, node);
}

/** id, type and createdAt are the node's identity, so an edit cannot reach them. */
export async function updateSpecNode(input: {
  projectId: string;
  id: string;
  shortName: string;
  name: string;
  content: string;
}): Promise<SpecNode> {
  const id = requireText("An id", input.id);
  const values = {
    shortName: requireText("A short name", input.shortName),
    name: requireText("A name", input.name),
    content: requireText("Content", input.content),
  };

  const node = await updateNode(await databaseFor(input.projectId), id, values);
  if (!node) {
    throw missing(`Unknown node: ${id}`);
  }
  return node;
}

export async function removeSpecNode(input: {
  projectId: string;
  id: string;
}): Promise<void> {
  const id = requireText("An id", input.id);
  const removed = await deleteNode(await databaseFor(input.projectId), id);
  if (!removed) {
    throw missing(`Unknown node: ${id}`);
  }
}

export async function listSpecEdges(projectId: string): Promise<SpecEdge[]> {
  return listEdges(await databaseFor(projectId));
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
  const databasePath = await databaseFor(input.projectId);

  const nodes = await listNodes(databasePath);
  const from = nodes.find((node) => node.id === fromId);
  if (!from) {
    throw missing(`Unknown node: ${fromId}`);
  }
  const to = nodes.find((node) => node.id === toId);
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
  const edges = await listEdges(databasePath);
  if (
    edges.some(
      (edge) =>
        edge.type === type && edge.fromId === fromId && edge.toId === toId,
    )
  ) {
    throw conflict(`${fromId} already has a ${type} relation to ${toId}.`);
  }

  const edge: SpecEdge = {
    id: ulid(),
    type,
    fromId,
    toId,
    createdAt: Date.now(),
  };
  return insertEdge(databasePath, edge);
}

export async function removeSpecEdge(input: {
  projectId: string;
  id: string;
}): Promise<void> {
  const id = requireText("An id", input.id);
  const removed = await deleteEdge(await databaseFor(input.projectId), id);
  if (!removed) {
    throw missing(`Unknown edge: ${id}`);
  }
}
